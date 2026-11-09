import { NextResponse } from 'next/server';
import { getAdminToken, requireAdminApi } from '@/lib/auth';
import { readEnv } from '@/lib/config';
import { isSameOriginRequest } from '@/lib/request-origin';
import { isValidPublicCode } from '@/lib/session-code';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set(['configureStage', 'clearStage', 'delete']);
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > 100000) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let value = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 100000) { await reader.cancel(); return null; }
    value += decoder.decode(chunk.value, { stream: true });
  }
  return value + decoder.decode();
}
async function proxy(request, context) {
  const { path = [] } = await context.params;
  const [kind, identifier] = path;
  const admin = kind === 'admin';
  if (path.length > 2 || (!admin && kind !== 'public') ||
      (admin && identifier && !UUID.test(identifier)) ||
      (!admin && !isValidPublicCode(identifier || ''))) {
    return NextResponse.json({ error: 'Stage not found.' }, { status: 404 });
  }
  if (admin && !(await requireAdminApi())) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  if (!admin && request.method !== 'GET') return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
  let body;
  if (request.method === 'POST') {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    const text = await readBody(request);
    if (text === null) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid stage request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || (identifier && !actions.has(body.action))) {
      return NextResponse.json({ error: 'Invalid stage operation.' }, { status: 400 });
    }
  }
  const params = new URL(request.url).searchParams;
  if (params.toString().length > 1000 || [...params.keys()].some(key => !['limit', 'cursor'].includes(key)) || ((!admin || identifier) && params.size)) {
    return NextResponse.json({ error: 'Invalid stage filters.' }, { status: 400 });
  }
  const env = readEnv();
  const headers = { Authorization: `Bearer ${env.SPILL_API_SECRET}`, 'Content-Type': 'application/json' };
  if (admin) headers['X-Admin-Token'] = await getAdminToken();
  const endpoint = admin ? `/admin/stages${identifier ? `/${identifier}` : ''}` : `/stages/${identifier}`;
  try {
    const response = await fetch(`${env.SPILL_API_URL}${endpoint}${params.size ? `?${params}` : ''}`, {
      method: request.method, headers, cache: 'no-store', signal: AbortSignal.timeout(15000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Stage connection interrupted. Refresh before retrying an action.' }, { status: 503 });
  }
}
export const GET = proxy;
export const POST = proxy;
