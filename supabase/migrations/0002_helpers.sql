-- Convenience helpers. Nothing here weakens RLS: the view runs with invoker
-- rights, so the caller's own RLS still applies.

-- Admin-facing live feed: submissions joined with their session code, handy
-- for the moderation dashboard. Anonymous callers still only see approved
-- rows; admins (via their is_admin() policies) see everything.
create or replace view public.admin_submissions_feed
with (security_invoker = true) as
select
  s.id,
  s.session_id,
  d.public_code,
  s.participant_id,
  s.nickname,
  s.category,
  s.content,
  s.moderation_status,
  s.is_pinned,
  s.hidden_from_presentation,
  s.discussed_at,
  s.created_at,
  s.updated_at
from public.submissions s
join public.discussion_sessions d on d.id = s.session_id;

-- Admin-facing session lookup by public code (join flow). Same RLS rules as
-- the base table: drafts remain invisible to non-admins.
create or replace view public.published_sessions_by_code
with (security_invoker = true) as
select
  id,
  public_code,
  title,
  description,
  welcome_message,
  status,
  available_categories,
  configuration,
  opens_at,
  closes_at,
  created_at,
  updated_at
from public.discussion_sessions;

grant select on public.admin_submissions_feed, public.published_sessions_by_code
  to anon, authenticated, service_role;
