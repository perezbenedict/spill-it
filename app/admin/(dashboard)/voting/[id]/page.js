import { VotingAdministration } from '@/components/voting/AdminVoting';
import { getAdminToken } from '@/lib/auth';
import { listAdminSessions } from '@/lib/spill-api';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function VotingDetailPage({ params }) {
  const id = String((await params).id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await listAdminSessions(await getAdminToken(), { limit: 100 });
  const sessions = (result.body?.items || []).map(({ id, title }) => ({ id, title }));
  return <VotingAdministration id={id} sessions={sessions}/>;
}
