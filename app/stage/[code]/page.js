import { notFound } from 'next/navigation';
import StandaloneStageDisplay from '@/components/room/StandaloneStageDisplay';
import { readEnv } from '@/lib/config';
import { getAdminToken } from '@/lib/auth';
import { adminMe } from '@/lib/spill-api';
import { isValidPublicCode } from '@/lib/session-code';

export const dynamic = 'force-dynamic';

export default async function StandaloneStagePage({ params }) {
  const code = String((await params).code || '').toUpperCase();
  if (!isValidPublicCode(code)) notFound();
  let item = null;
  let missing = false;
  let isAdmin = false;
  try {
    const env = readEnv();
    const response = await fetch(`${env.SPILL_API_URL}/stages/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${env.SPILL_API_SECRET}` },
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    missing = response.status === 404;
    if (response.ok) {
      const data = await response.json();
      const stage = data?.item;
      if (stage?.code === code && Number.isSafeInteger(stage.revision) && stage.stage) {
        item = { code, title: stage.title || '', revision: stage.revision,
          stage: { atmosphere: stage.stage.atmosphere, overlay: stage.stage.overlay || null } };
      }
    }
  } catch { /* The public screen can reconnect through its proxy. */ }
  if (missing) notFound();
  try {
    const token = await getAdminToken();
    if (token) {
      const result = await adminMe(token);
      isAdmin = Boolean(result.ok && result.body?.user);
    }
  } catch { /* A public projector does not require an admin session. */ }
  return <StandaloneStageDisplay code={code} initialItem={item} isAdmin={isAdmin} />;
}
