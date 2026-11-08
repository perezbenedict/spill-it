import { NextResponse } from 'next/server';
import { getAdminToken, requireAdminApi } from '@/lib/auth';
import { getOrCreateParticipantId } from '@/lib/participant';
import { readEnv } from '@/lib/config';
import { isValidPublicCode } from '@/lib/session-code';
import { isSameOriginRequest } from '@/lib/request-origin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set(['edit', 'open', 'close', 'archive', 'delete', 'settings', 'present']);

async function proxy(request, context) {
  const { path = [] } = await context.params;
  const [kind, identifier, operation] = path;
  const admin = kind === 'admin';
  if (path.length > 3 || (!admin && kind !== 'public') ||
      (admin && (operation || (identifier && !UUID.test(identifier)))) ||
      (!admin && (!isValidPublicCode(identifier || '') || (operation && operation !== 'vote')))) {
    return NextResponse.json({ error: 'Unknown voting operation.' }, { status: 404 });
  }
  if (admin && !(await requireAdminApi())) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  if (request.method === 'GET' && operation) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
  let body;
  if (request.method === 'POST') {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    if (!admin && operation !== 'vote') return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
    if (Number(request.headers.get('content-length')) > 32000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    try {
      const text = await request.text();
      if (text.length > 32000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
      body = JSON.parse(text);
    } catch { return NextResponse.json({ error: 'Invalid voting request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid voting request.' }, { status: 400 });
    if (admin && identifier && !actions.has(body.action)) return NextResponse.json({ error: 'Unknown voting operation.' }, { status: 400 });
    if (!admin) body = {
      questionId: body.questionId,
      optionId: body.optionId,
      participant_id: await getOrCreateParticipantId(`VOTE_${identifier}`),
    };
  }
  const env = readEnv();
  const headers = { Authorization: `Bearer ${env.SPILL_API_SECRET}`, 'Content-Type': 'application/json' };
  if (admin) headers['X-Admin-Token'] = await getAdminToken();
  const endpoint = admin ? `/admin/voting${identifier ? `/${identifier}` : ''}` : `/voting/${identifier}${operation ? '/vote' : ''}`;
  try {
    const response = await fetch(`${env.SPILL_API_URL}${endpoint}`, {
      method: request.method, headers, cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: {
      'Cache-Control': 'no-store', ...(response.headers.has('Retry-After') ? { 'Retry-After': response.headers.get('Retry-After') } : {}),
    } });
  } catch { return NextResponse.json({ error: 'Voting connection interrupted. Check the current state before retrying.' }, { status: 503 }); }
}

export const GET = proxy;
export const POST = proxy;
