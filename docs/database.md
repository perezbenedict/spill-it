# Database

PostgreSQL (Supabase) schema for SPILL. Source of truth: `supabase/migrations/0001_init.sql` (tables, RLS, realtime) and `supabase/migrations/0002_helpers.sql` (views). This document matches those files.

## Entity-relationship summary

```
auth.users 1 ──── n admin_profiles
discussion_sessions 1 ──── n submissions
discussion_sessions 1 ───── 1 presentation_state ──> submissions (current, nullable)
```

- `discussion_sessions` — one church discussion event, joined by an 8-character `public_code`.
- `submissions` — participant contributions to a session. Cascade-deleted with the session.
- `admin_profiles` — extends `auth.users`; existence of a row makes the user an admin/moderator. There is no public sign-up for this table.
- `presentation_state` — the projector's pointer: which submission is currently on screen for a session.

## Enums (text columns with CHECK constraints)

| Column | Values |
|---|---|
| `discussion_sessions.status` | `draft`, `live`, `paused`, `closed` |
| `submissions.category` | `question`, `opinion`, `challenge`, `twocents` |
| `submissions.moderation_status` | `pending`, `approved`, `hidden` |
| `admin_profiles.role` | `admin`, `moderator` |

Fixed contract values other parts of the app depend on. `public_code` is 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0`/`O`/`1`/`I`), stored uppercase. Content and nickname limits are trimmed lengths (1–1000 chars for content, 1–60 for nickname, 1–200 for title).

## discussion_sessions

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| title | text | 1–200 chars, trimmed |
| description | text | default `''` |
| welcome_message | text | default `''` |
| public_code | text | unique, uppercase, `[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}` |
| status | text | default `draft` |
| available_categories | text[] | non-empty subset of the four categories |
| configuration | jsonb | default `{}`; optional keys: `min_content_length` (int), `max_content_length` (int), `allow_manual_nickname` (bool) |
| opens_at / closes_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger |

## submissions

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| session_id | uuid fk | → `discussion_sessions(id)`, on delete cascade |
| participant_id | uuid | session-scoped pseudonymous id from an httpOnly cookie; **not** tied to auth |
| nickname | text | 1–60 chars, trimmed |
| category | text | one of the four categories |
| content | text | 1–1000 chars, trimmed |
| moderation_status | text | default `pending` |
| is_pinned | boolean | default false |
| hidden_from_presentation | boolean | default false |
| discussed_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger |

## admin_profiles

| Column | Type | Notes |
|---|---|---|
| user_id | uuid pk/fk | → `auth.users(id)`, on delete cascade |
| role | text | `admin` or `moderator` (default `moderator`) |
| created_at | timestamptz | |

## presentation_state

| Column | Type | Notes |
|---|---|---|
| session_id | uuid pk/fk | → `discussion_sessions(id)`, on delete cascade |
| current_submission_id | uuid fk | → `submissions(id)`, on delete set null |
| updated_at | timestamptz | |
| updated_by | uuid | the admin's user id |

## Indexes (submissions)

| Index | Rationale |
|---|---|
| `(session_id, created_at desc)` | main feed ordering per session |
| `(session_id, moderation_status)` | moderation queue and approved-only public reads |
| `(session_id, category)` | category filtering |
| `(session_id, participant_id)` | duplicate suppression and per-participant lookups |
| partial `(session_id) where is_pinned` | fast lookup of a session's pinned submission |

## Realtime

`submissions`, `presentation_state`, and `discussion_sessions` are added to the `supabase_realtime` publication (guarded so re-application is safe). `submissions` has `replica identity full` so `postgres_changes` clients receive full old-row payloads (needed to know which row left the feed on update/delete). RLS still filters what each subscriber receives.

## Applying migrations

Fresh project:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Or locally / via migration history:

```bash
supabase migration up          # applies pending migrations in order
```

Migrations are numbered and must be applied in order (`0001_init.sql`, then `0002_helpers.sql`). They are written to be safe to apply once on a fresh project (`create table if not exists`, `create or replace`, guarded publication changes).

## Provisioning the first administrator

There is **no public registration** in the app. Provision admins manually:

1. Supabase Dashboard → **Authentication → Users → Add user**; create the user with email + password (email confirm as you prefer).
2. Copy the user's UUID.
3. SQL editor (or `supabase db execute`):

   ```sql
   insert into admin_profiles (user_id, role) values ('<user-uuid>', 'admin');
   ```

Role values are `admin` and `moderator`. The app checks `admin_profiles` server-side (via `public.is_admin()` and the service role); creating the auth user alone grants nothing.

To remove access, delete the row from `admin_profiles` (deleting the auth user cascades to the profile).
