# Security

How SPILL's database security works, what it does and does not guarantee.

## Trust boundaries

- **Anon key in the browser is expected.** The Supabase anon/public key ships to clients. It is only safe because Row Level Security (RLS) is enabled on every table and the policies below restrict what it can do. Treat the anon key as public.
- **Service role key stays server-side only.** Never expose it to the browser. It is used exclusively inside Next.js Route Handlers / server code. The service role bypasses RLS, so every write path that must accept unauthenticated input (public session creation is admin-authenticated; public submission insert is anonymous) goes through a server route that validates input before touching the database.
- **Public submission writes never come from the client.** There is deliberately no `INSERT` policy for `anon` or `authenticated` on `submissions`. Anonymous clients get `permission denied` if they try. Inserts happen only via a server Route Handler using the service role, after validation and rate limiting.
- **Admin identity = a row in `admin_profiles`.** Authentication comes from Supabase Auth; authorization is `public.is_admin()` (a `security definer` function with `search_path = public`, executable only by `authenticated` and `service_role`). There is no public registration; admins are provisioned manually (see `docs/database.md`).
- **`participant_id` is not authentication.** It is a per-session pseudonymous UUID stored in an httpOnly cookie. It scopes rate limits and duplicate suppression; it grants no database privileges.

## RLS policy reference

All four tables have RLS enabled. Default deny: anything not matched by a policy is rejected.

### discussion_sessions

| Policy | Subjects | Rule |
|---|---|---|
| sessions_select_published | anon, authenticated | `select` when `status <> 'draft'` |
| sessions_select_admin | authenticated | `select` when `is_admin()` |
| sessions_insert_admin | authenticated | `insert` with check `is_admin()` |
| sessions_update_admin | authenticated | `update` when `is_admin()` |
| sessions_delete_admin | authenticated | `delete` when `is_admin()` |

Why: participants must be able to join published sessions — including `closed` ones so the UI can show the ended state — without an account. **Drafts stay private** to admins, so unannounced or being-prepared sessions are invisible even by guessing the public code. Admins get full CRUD, gated entirely by `is_admin()`.

### submissions

| Policy | Subjects | Rule |
|---|---|---|
| submissions_select_approved | anon, authenticated | `select` when `moderation_status = 'approved'` |
| submissions_select_admin | authenticated | `select` when `is_admin()` |
| submissions_insert_admin | authenticated | `insert` with check `is_admin()` |
| submissions_update_admin | authenticated | `update` when `is_admin()` |
| submissions_delete_admin | authenticated | `delete` when `is_admin()` |

Why:
- **Approved-only public read.** The projector and public feeds must only ever show moderated content. `pending` and `hidden` rows are invisible to anon/authenticated users; nothing leaks before moderation.
- **No anon/authenticated `insert` or `update` policy at all.** Any client-side write to `submissions` is denied by default. This is the core abuse control: anonymous users cannot spam, edit, or re-moderate content by talking to the database directly; every public write passes through a server route with validation and rate limiting. (Server routes use the service role, which bypasses RLS by design.)
- Admins see and manage everything, only through `is_admin()`.

### admin_profiles

| Policy | Subjects | Rule |
|---|---|---|
| admin_profiles_select_own | authenticated | `select` when `user_id = auth.uid()` |
| admin_profiles_select_admin | authenticated | `select` when `is_admin()` |
| admin_profiles_insert_admin | authenticated | `insert` with check `is_admin()` |
| admin_profiles_update_admin | authenticated | `update` when `is_admin()` |
| admin_profiles_delete_admin | authenticated | `delete` when `is_admin()` |

Why: users can read their own profile row (the app checks it server-side), admins can read all rows, and **all mutations are admin-only** — a user can never insert a row for themselves to escalate to admin/moderator.

### presentation_state

| Policy | Subjects | Rule |
|---|---|---|
| presentation_select_published | anon, authenticated | `select` when the linked session has `status <> 'draft'` |
| presentation_insert_admin | authenticated | `insert` with check `is_admin()` |
| presentation_update_admin | authenticated | `update` when `is_admin()` |
| presentation_delete_admin | authenticated | `delete` when `is_admin()` |

Why: the anonymous projector client needs to read (and subscribe to realtime changes on) the current pointer, but only for published sessions; drafts are hidden here too. Only admins move the pointer.

## Realtime

`submissions`, `presentation_state`, and `discussion_sessions` are in the `supabase_realtime` publication; `submissions` uses `replica identity full` for complete old-row payloads. Realtime `postgres_changes` subscriptions are filtered by the same RLS policies as direct reads — an anon subscriber only receives `approved` submissions. Do not rely on realtime for data the subscriber could not `select`.

## App-layer abuse controls

RLS stops direct database abuse; the server routes add:

- **Server-side validation** of every field (category membership, trimmed length limits 1–1000 for content, 1–60 for nickname, valid session, session actually `live`) before insert — DB CHECK constraints are a backstop, not the primary gate.
- **Rate limiting keyed by the session-scoped participant cookie** (`participant_id` + session), applied in the Route Handler before the insert. Per-IP limits may complement it.
- **Duplicate suppression** within a session for the same `participant_id` (near-identical content rejected or de-duplicated), using the `(session_id, participant_id)` index.
- **Moderation-first flow:** public submissions land as `pending` and are only exposed after an admin approves them.

## Anonymity: honest limits

- Participants are **pseudonymous, per session**: identified only by a self-chosen nickname and a per-session UUID cookie. Ids are not shared across sessions and are not linked to an account.
- This is **not absolute anonymity**. The hosting provider (Supabase) and the app host may retain technical data — IP addresses, request logs, timestamps, User-Agent — in infrastructure logs, as required for operation and abuse handling.
- Cookies can be cleared or fingerprinted to a degree; a determined observer with access to server logs could correlate activity patterns.
- Describe the product to users as **anonymous within the app, pseudonymous at the infrastructure level** — do not claim that no trace exists anywhere.
