-- At most one discussion may be live at a time. The partial unique index is
-- the final guarantee: even if two admins publish concurrently and both pass
-- the application-level check, the second insert/update fails here.
-- Safe to re-run.
create unique index if not exists discussion_sessions_one_live
  on public.discussion_sessions (status)
  where status = 'live';

comment on index public.discussion_sessions_one_live is
  'Enforces the single-live-session rule: at most one discussion_sessions row may have status = ''live'', even under concurrent publishes.';
