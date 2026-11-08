import VotingStage from '@/components/voting/VotingStage';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function VotingStagePage({ params }) {
  const code = String((await params).code || '').toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(code)) notFound();
  return <VotingStage code={code}/>;
}
