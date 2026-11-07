import { getAdminToken } from '@/lib/auth';
import { readEnv } from '@/lib/config';
import Card from '@/components/ui/Card';

export default async function ActivityPage() {
  const env = readEnv();
  const token = await getAdminToken();
  let items = null;
  try {
    const response = await fetch(`${env.SPILL_API_URL}/admin/activity`, { headers: { Authorization: `Bearer ${env.SPILL_API_SECRET}`, 'X-Admin-Token': token }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (response.ok) items = (await response.json()).items;
  } catch { /* Render a recoverable state; never expose upstream internals. */ }
  return <div className="space-y-6"><header><h1 className="font-display text-3xl">Event activity</h1><p className="mt-2 text-sm text-muted">Recent operations across discussions, including deleted discussions. Shared-account actions do not identify individual moderators.</p></header><Card>
    {items === null ? <p role="alert">Could not load activity. Refresh this page to try again.</p> : !items.length ? <p className="text-muted">No recorded operations yet.</p> : <ol className="divide-y divide-white/10">{items.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-3 py-3"><span className="text-sm">{item.action.replaceAll('_', ' ')}</span><time dateTime={item.created_at} className="text-xs text-muted">{new Date(item.created_at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</time></li>)}</ol>}
  </Card></div>;
}
