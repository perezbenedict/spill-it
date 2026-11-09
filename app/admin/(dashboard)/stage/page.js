import Link from 'next/link';
import { notFound } from 'next/navigation';
import StageControlCentre from '@/components/admin/StageControlCentre';
import StandaloneStageCentre from '@/components/admin/StandaloneStageCentre';
import StageModeChoice from '@/components/admin/StageModeChoice';
import ErrorState from '@/components/ui/ErrorState';
import { getAdminToken, requireAdmin } from '@/lib/auth';
import { getAdminSession, listAdminSessions, listAdminSubmissions } from '@/lib/spill-api';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StagePage({ searchParams }) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const mode = Array.isArray(query?.mode) ? query.mode[0] : query?.mode;
  if (mode === 'standalone') {
    const stageId = Array.isArray(query?.stage) ? query.stage[0] : query?.stage;
    if (query?.stage !== undefined && (!stageId || !UUID.test(stageId))) notFound();
    return <><StageModeChoice mode="standalone"/><StandaloneStageCentre stageId={stageId || null} canDelete={admin.role === 'admin'}/></>;
  }
  const token = await getAdminToken();
  const explicitSelection = query?.session !== undefined;
  const requested = Array.isArray(query?.session) ? query.session[0] : query?.session;
  if (explicitSelection && (!requested || !UUID.test(requested))) notFound();
  const [recent, live] = await Promise.all([
    listAdminSessions(token, { limit: 100 }),
    listAdminSessions(token, { status: 'live', limit: 2 }),
  ]);
  if (!recent.ok || !live.ok) return <ErrorState title="Stage controls are unavailable" description="Could not read the discussion list. Your event state has not changed." retry={<Link href="/admin/stage" className="text-gold-light underline">Try again</Link>}/>;
  const sessions = recent.body?.items || [];
  const liveSessions = live.body?.items || [];
  const selectedId = requested || (live.body?.total === 1 ? liveSessions[0]?.id : null);
  let selected = sessions.find(session => session.id === selectedId) || null;
  if (selectedId && !selected) {
    const result = await getAdminSession(token, selectedId);
    if (result.status === 404) notFound();
    if (!result.ok) return <ErrorState title="Could not open this stage" description="Refresh the discussion selection before making changes." retry={<Link href="/admin/stage" className="text-gold-light underline">Choose a discussion</Link>}/>;
    selected = result.body?.session || null;
    if (selected) sessions.unshift(selected);
  }
  const approved = selected ? await listAdminSubmissions(token, { session_id: selected.id, status: 'approved', limit: 100, sort: 'newest' }) : null;
  return <><StageModeChoice/><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Discussion lifecycle and bulk deletion stay in discussion management.</p><Link href="/admin/sessions" className="inline-flex min-h-11 items-center rounded-control border border-gold/25 px-4 py-2 text-sm text-gold-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Manage Discussions</Link></div><StageControlCentre key={selected?.id || 'no-session'} sessions={sessions} session={selected} approved={approved?.ok ? (approved.body?.items || []).filter(row => !row.hidden_from_presentation) : []} contributionError={Boolean(approved && !approved.ok)} hasMoreSessions={(recent.body?.total || 0) > 100} ambiguousLive={(live.body?.total || 0) > 1}/></>;
}
