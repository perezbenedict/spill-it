import { NextResponse } from 'next/server';
import { getAdminToken, requireAdminApi } from '@/lib/auth';
import { readEnv } from '@/lib/config';
import { isSameOriginRequest } from '@/lib/request-origin';

async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > 6000) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 6000) { await reader.cancel(); return null; }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

async function proxy(request) {
  if (!(await requireAdminApi())) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  if (request.method === 'POST' && !isSameOriginRequest(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  let body;
  if (request.method === 'POST') {
    const text = await boundedBody(request);
    if (text === null) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid activity request.' }, { status: 400 }); }
    if (!body || body.action !== 'clearVisible' || typeof body.snapshot !== 'string') return NextResponse.json({ error: 'Invalid activity request.' }, { status: 400 });
    body = { action: 'clearVisible', snapshot: body.snapshot };
  }
  const params = new URL(request.url).searchParams;
  const allowed = new Set(['category', 'q', 'from', 'to', 'view', 'limit', 'cursor', 'snapshot']);
  if ([...params.keys()].some(key => !allowed.has(key)) || params.toString().length > 6000) return NextResponse.json({ error: 'Invalid activity filters.' }, { status: 400 });
  const env = readEnv();
  try {
    const response = await fetch(`${env.SPILL_API_URL}/admin/activity${params.size ? `?${params}` : ''}`, {
      method: request.method, headers: { Authorization: `Bearer ${env.SPILL_API_SECRET}`, 'X-Admin-Token': await getAdminToken(), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not synchronize activity. Refresh and try again.' }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
