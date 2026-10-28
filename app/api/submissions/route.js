import { NextResponse } from 'next/server';
import { getOrCreateParticipantId } from '@/lib/participant';
import { createParticipantSubmission } from '@/lib/spill-api';
import { isValidPublicCode } from '@/lib/session-code';

export const runtime = 'nodejs';

// Fixed, friendly copy. Worker messages, ids and stacks never leak here.
// The real validation, rate limiting and duplicate protection live in the
// Cloudflare Worker (api/worker.js); this route only resolves the participant
// id from the httpOnly cookie and forwards the request.
const MSG_NOT_FOUND = 'This discussion could not be found.';
const MSG_GENERIC = 'Something went wrong and your thought was not saved. Please try again.';
const MSG_BAD_BODY = 'Check your submission and try again.';

function fail(status, message, headers) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, MSG_BAD_BODY);
  }

  // participant_id comes from the httpOnly cookie via the server - it is never
  // accepted from the request body.
  const sessionCode =
    typeof body?.sessionCode === 'string' ? body.sessionCode.trim().toUpperCase() : '';
  if (!isValidPublicCode(sessionCode)) return fail(404, MSG_NOT_FOUND);

  const participantId = await getOrCreateParticipantId(sessionCode);

  const result = await createParticipantSubmission({
    sessionCode,
    participantId,
    category: body?.category,
    nickname: body?.nickname,
    content: body?.content,
  });

  if (result.status === 0) return fail(500, MSG_GENERIC);
  if (result.ok) return NextResponse.json({ ok: true });

  const headers =
    result.status === 429 ? { 'Retry-After': '60' } : undefined;
  return fail(result.status, result.body?.error || MSG_GENERIC, headers);
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
