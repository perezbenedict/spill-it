import VotingParticipant from '@/components/voting/VotingParticipant';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function VotePage({ params }) {
  const code = String((await params).code || '').toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(code)) notFound();
  return <VotingParticipant code={code}/>;
}
