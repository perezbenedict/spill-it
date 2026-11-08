import { NextResponse } from 'next/server';
import { getAdminToken, requireAdminApi } from '@/lib/auth';
import { getOrCreateParticipantId } from '@/lib/participant';
import { readEnv } from '@/lib/config';
import { isValidPublicCode } from '@/lib/session-code';
import { isSameOriginRequest } from '@/lib/request-origin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ACTIONS = new Set(['enqueue', 'remove', 'reorder', 'clearQueue', 'advance', 'createPoll', 'openPoll', 'closePoll', 'projectPoll', 'deletePoll', 'setReactions', 'clearPoll', 'configureStage']);

async function proxy(request, context) {
  const { path } = await context.params;
  const [kind, identifier, operation] = path || [];
  const admin = kind === 'admin';
  if (path?.length > 3 || (admin && (!UUID.test(identifier || '') || (operation && operation !== 'export'))) || (!admin && (kind !== 'public' || !isValidPublicCode(identifier || '') || (operation && !['vote', 'reactions'].includes(operation))))) {
    return NextResponse.json({ error: 'Unknown operation.' }, { status: 404 });
  }
  if (admin && !(await requireAdminApi())) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  if (request.method === 'GET' && !admin && operation) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
  if (request.method === 'POST' && !isSameOriginRequest(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  let body;
  if (request.method === 'POST') {
    if (operation === 'export') return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
    const maximumBody = admin ? 100000 : 20000;
    if (Number(request.headers.get('content-length')) > maximumBody) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    try {
      const text = await request.text();
      if (text.length > maximumBody) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
      body = JSON.parse(text);
    } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    if (admin && !ADMIN_ACTIONS.has(body.action)) return NextResponse.json({ error: 'Unknown operation.' }, { status: 400 });
    if (!admin) {
      if (!operation) return NextResponse.json({ error: 'Unknown operation.' }, { status: 405 });
      const participant = await getOrCreateParticipantId(identifier);
      body = operation === 'vote'
        ? { participant_id: participant, poll_id: body.poll_id, option_id: body.option_id }
        : { participant_id: participant, reaction: body.reaction };
    }
  }
  const env = readEnv();
  const headers = { Authorization: `Bearer ${env.SPILL_API_SECRET}`, 'Content-Type': 'application/json' };
  if (admin) headers['X-Admin-Token'] = await getAdminToken();
  const endpoint = admin ? `/admin/sessions/${identifier}/${operation === 'export' ? 'export' : 'platform'}` : `/sessions/${identifier}/${operation || 'engagement'}`;
  try {
    const upstream = await fetch(`${env.SPILL_API_URL}${endpoint}`, { method: request.method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    if (operation === 'export' && upstream.ok) return new Response(await upstream.text(), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="spill-approved-contributions.csv"', 'Cache-Control': 'no-store' } });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Connection interrupted. Please retry.' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
