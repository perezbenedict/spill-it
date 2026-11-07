import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import AdminPlatform from '@/components/platform/AdminPlatform';

export default async function SessionInsights({ params }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <div className="space-y-6"><Link href={`/admin/sessions/${id}/live`} className="text-sm text-gold-light underline underline-offset-4">Back to live moderation</Link><AdminPlatform sessionId={id} insightsOnly /></div>;
}
