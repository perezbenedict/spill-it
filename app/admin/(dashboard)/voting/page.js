import { VotingCollection } from '@/components/voting/AdminVoting';
import { getAdminToken, requireAdmin } from '@/lib/auth';
import { listAdminSessions } from '@/lib/spill-api';
export const dynamic = 'force-dynamic';
export default async function VotingPage() {
  const admin = await requireAdmin();
  const result = await listAdminSessions(await getAdminToken(), { limit: 100 });
  const sessions = (result.body?.items || []).map(({ id, title }) => ({ id, title }));
  return <VotingCollection sessions={sessions} canDelete={admin.role === 'admin'}/>;
}
