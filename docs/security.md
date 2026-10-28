# Security

How SPILL's database security works, what it does and does not guarantee.

## Trust boundaries

- **The D1 database is only reachable through the Worker API** (`api/worker.js`). There is no direct database access from the browser or the Next.js app; D1 bindings exist only inside the Worker.
- **`SPILL_API_SECRET` stays server-side only.** The Next.js server sends it as `Authorization: Bearer <secret>` on every Worker request. It must never be prefixed `NEXT_PUBLIC_` or shipped to the browser. The Worker refuses all routes except `/health` when the secret is unset or the bearer header does not match.
- **Admin routes need two credentials.** Beyond the bearer secret, every `/admin/*` route (except login) requires the `X-Admin-Token` header: a 256-bit random token stored in `admin_sessions`, issued at login, expiring after 7 days. The Next.js app keeps it in an httpOnly, SameSite=Lax cookie and forwards it server-side only. Expired tokens are deleted on sight.
- **Admin authentication is a single shared admin password against `admin_users`.** The `/admin/login` page has one input and posts only `{ password }` to the Worker's `POST /admin/auth/login`. Stored passwords are PBKDF2-SHA256 hashes (100000 iterations, random per-user salt) verified with WebCrypto; comparisons are constant-time on the hash. A presented password is also accepted if it equals the `SPILL_ADMIN_PASSWORD` Worker secret, compared in constant time — and when the secret matches but the stored hash differs, the Worker re-hashes the password with a fresh salt and updates the row, so rotating the secret rotates the stored hash on the next successful login. Login answers one fixed message ("Incorrect password.") whether or not the password was right; with no username there is no user-enumeration surface. Failed logins are throttled in memory per client IP: 10 consecutive failures inside a 15-minute window starting at the first failure return `429` with a `Retry-After` header; a successful login clears the counter (no DB table involved). There is no public registration; the first admin is provisioned via the `SPILL_ADMIN_PASSWORD` Worker secret (or a manual insert — see `docs/database.md`).
- **Role gating** (`admin` vs `moderator`) reads the `admin_users.role` column; `GET /admin/auth/me` is the single check the Next.js app uses (`lib/auth.js`). Revoking an admin = deleting their `admin_users` or `admin_sessions` row, effective on the next request.
- **Public submission writes never come from the browser.** The browser posts only to the Next.js route `/api/submissions`, which reads the participant id from the httpOnly cookie and calls the Worker. The Worker is the only writer of `submissions`; it validates everything again before insert.
- **`participant_id` is not authentication.** It is a per-session pseudonymous UUID stored in an httpOnly cookie. It scopes rate limits and duplicate suppression; it grants no privileges.

## Access model per table (Worker-enforced)

The old Supabase Row Level Security policies are replaced by route scoping in `api/worker.js`; default deny applies to everything unlisted.

| Table | Public (bearer secret only) | Admin (bearer secret + admin session) |
|---|---|---|
| discussion_sessions | read non-draft rows by public code (`GET /sessions`, `GET /rooms`) | full CRUD (`/admin/sessions*`) |
| submissions | insert only, via the validated write path (`POST /submissions`) | read/update/delete all rows (`/admin/submissions*`) |
| presentation_state | read the pointer via `GET /rooms` (published sessions, approved content only) | read/write pointer (`/admin/presentation/*`) |
| admin_users / admin_sessions | login only (bootstrap seed on empty table) | `me` and `logout` for the caller's own token |

Why:

- **Drafts stay private.** Public session lookups filter `status <> 'draft'`, so unannounced sessions are invisible even by guessing the code. Only admin routes see drafts.
- **Approved-only public read.** `GET /rooms` returns only `moderation_status = 'approved'` submissions, and the current pointer only resolves to a row that is approved and not hidden from the presentation — nothing leaks before moderation, and the projector never shows unmoderated content even if the pointer names it.
- **No anon insert/update/delete anywhere.** Every write passes through server code with validation and rate limiting.
- **The single-live-session rule** is enforced by a partial unique index plus a transactional check in the Worker, so concurrent publishes cannot create two live discussions.

## App-layer abuse controls (Worker)

- **Server-side validation** of every field before insert — trimmed length limits (1–1000 for content, 1–60 for nickname), category membership in the session's `available_categories`, session actually `live` and not past `closes_at`. Fixed friendly error messages; SQL, ids and stack traces never leave the process. DB CHECK constraints are a backstop, not the primary gate.
- **Rate limiting** keyed by the session-scoped participant cookie: max 5 submissions per participant per session per 60-second window (`429` + `Retry-After`).
- **Duplicate suppression**: the same normalized content from the same participant in the same session within 600 seconds counts as already delivered and returns `ok` without inserting.
- **Moderation-first flow:** public submissions land as `pending` and are only exposed after an admin approves them. Hiding or deleting a contribution clears the projector pointer when it points at that row (same transaction as the update).
- **Login throttling** is in-memory per client IP in the Worker (no DB table): 10 consecutive failures within a 15-minute window starting at the first failure return `429` with `Retry-After` and the copy "Too many attempts. Try again shortly."; a successful login clears the counter.

## Live updates without realtime

Supabase realtime is gone; the moderation feed, room display and dashboard poll Next.js API routes every ~3.5 seconds, paused while the tab is hidden. Poll responses go through the same admin auth and approved-only rules as everything else. The "Reconnecting" indicators only appear when a poll actually fails — they are honest about connection state.

## Anonymity: honest limits

- Participants are **pseudonymous, per session**: identified only by a self-chosen nickname and a per-session UUID cookie. Ids are not shared across sessions and are not linked to an account.
- This is **not absolute anonymity**. The hosting providers (Cloudflare for the Worker/D1, the Next.js app host) may retain technical data — IP addresses, request logs, timestamps, User-Agent — in infrastructure logs, as required for operation and abuse handling.
- Cookies can be cleared or fingerprinted to a degree; a determined observer with access to server logs could correlate activity patterns.
- Describe the product to users as **anonymous within the app, pseudonymous at the infrastructure level** — do not claim that no trace exists anywhere.
