-- SPILL initial schema + Row Level Security
-- All public reads/writes from the browser go through the anon key and are
-- gated by RLS. Submissions are never writable from the client: public writes
-- go through a server Route Handler using the service role key.

-- ---------------------------------------------------------------------------
-- discussion_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.discussion_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '',
  welcome_message text not null default '',
  -- 8 chars from an unambiguous alphabet (no 0/O/1/I), stored uppercase.
  public_code text not null unique
    check (public_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  status text not null default 'draft'
    check (status in ('draft', 'live', 'paused', 'closed')),
  available_categories text[] not null
    default array['question', 'opinion', 'challenge', 'twocents']
    check (available_categories <@ array['question', 'opinion', 'challenge', 'twocents']
           and length(available_categories) > 0),
  -- Optional runtime configuration. Expected keys:
  --   min_content_length (int), max_content_length (int),
  --   allow_manual_nickname (bool)
  configuration jsonb not null default '{}'::jsonb,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.discussion_sessions(id) on delete cascade,
  -- Session-scoped pseudonymous id from an httpOnly cookie; not tied to auth.
  participant_id uuid not null,
  nickname text not null check (length(btrim(nickname)) between 1 and 60),
  category text not null
    check (category in ('question', 'opinion', 'challenge', 'twocents')),
  content text not null check (length(btrim(content)) between 1 and 1000),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'hidden')),
  is_pinned boolean not null default false,
  hidden_from_presentation boolean not null default false,
  discussed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_session_created_idx
  on public.submissions (session_id, created_at desc);
create index if not exists submissions_session_moderation_idx
  on public.submissions (session_id, moderation_status);
create index if not exists submissions_session_category_idx
  on public.submissions (session_id, category);
create index if not exists submissions_session_participant_idx
  on public.submissions (session_id, participant_id);
-- Fast lookup of a session's pinned submission.
create index if not exists submissions_session_pinned_idx
  on public.submissions (session_id) where is_pinned;

-- ---------------------------------------------------------------------------
-- admin_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator'
    check (role in ('admin', 'moderator')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- presentation_state
-- ---------------------------------------------------------------------------
create table if not exists public.presentation_state (
  session_id uuid primary key references public.discussion_sessions(id) on delete cascade,
  current_submission_id uuid references public.submissions(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists discussion_sessions_set_updated_at on public.discussion_sessions;
create trigger discussion_sessions_set_updated_at
  before update on public.discussion_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists submissions_set_updated_at on public.submissions;
create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- is_admin()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so RLS on admin_profiles does not recurse into itself.
-- search_path pinned to public to prevent object-shadowing attacks.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles where user_id = auth.uid()
  );
$$;

-- Lock the function down: only signed-in users may call it. It returns no
-- data beyond a boolean and is what RLS policies use to gate admin access.
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

-- Explicit grants (Supabase default privileges usually cover this, but be
-- deterministic). RLS still decides which rows are visible/writable.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete
  on public.discussion_sessions, public.submissions,
     public.admin_profiles, public.presentation_state
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.discussion_sessions enable row level security;
alter table public.submissions enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.presentation_state enable row level security;

-- discussion_sessions --------------------------------------------------------
-- Participants may read any published session, including closed ones so the
-- UI can show the ended state. Drafts stay private to admins.
create policy "sessions_select_published"
  on public.discussion_sessions for select
  to anon, authenticated
  using (status <> 'draft');

-- Full admin access, gated entirely by is_admin().
create policy "sessions_select_admin"
  on public.discussion_sessions for select
  to authenticated
  using (public.is_admin());

create policy "sessions_insert_admin"
  on public.discussion_sessions for insert
  to authenticated
  with check (public.is_admin());

create policy "sessions_update_admin"
  on public.discussion_sessions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "sessions_delete_admin"
  on public.discussion_sessions for delete
  to authenticated
  using (public.is_admin());

-- submissions ----------------------------------------------------------------
-- Public read is limited to approved rows: the projector only ever sees
-- moderated content, so pending/hidden rows are invisible to anon/authenticated.
create policy "submissions_select_approved"
  on public.submissions for select
  to anon, authenticated
  using (moderation_status = 'approved');

-- Deliberately NO insert/update/delete policy for anon or authenticated:
-- public submissions must go through a server Route Handler using the service
-- role key, which bypasses RLS. Direct table writes are denied by default.

create policy "submissions_select_admin"
  on public.submissions for select
  to authenticated
  using (public.is_admin());

create policy "submissions_insert_admin"
  on public.submissions for insert
  to authenticated
  with check (public.is_admin());

create policy "submissions_update_admin"
  on public.submissions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "submissions_delete_admin"
  on public.submissions for delete
  to authenticated
  using (public.is_admin());

-- admin_profiles -------------------------------------------------------------
-- Owners can read their own row; admins can read all. Mutations are admin-only
-- so users cannot escalate themselves.
create policy "admin_profiles_select_own"
  on public.admin_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "admin_profiles_select_admin"
  on public.admin_profiles for select
  to authenticated
  using (public.is_admin());

create policy "admin_profiles_insert_admin"
  on public.admin_profiles for insert
  to authenticated
  with check (public.is_admin());

create policy "admin_profiles_update_admin"
  on public.admin_profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin_profiles_delete_admin"
  on public.admin_profiles for delete
  to authenticated
  using (public.is_admin());

-- presentation_state ---------------------------------------------------------
-- Anonymous projector clients can see presentation state for any published
-- session; only admins move the pointer.
create policy "presentation_select_published"
  on public.presentation_state for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.discussion_sessions s
      where s.id = session_id and s.status <> 'draft'
    )
  );

create policy "presentation_insert_admin"
  on public.presentation_state for insert
  to authenticated
  with check (public.is_admin());

create policy "presentation_update_admin"
  on public.presentation_state for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "presentation_delete_admin"
  on public.presentation_state for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- replica identity full gives postgres_changes the full old-row payload
-- (needed to know which row left the feed when a row is updated/deleted).
alter table public.submissions replica identity full;

-- Guarded so re-applying the migration does not fail on duplicate membership.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table public.submissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'presentation_state'
  ) then
    alter publication supabase_realtime add table public.presentation_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discussion_sessions'
  ) then
    alter publication supabase_realtime add table public.discussion_sessions;
  end if;
end;
$$;
