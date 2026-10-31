import { NextResponse } from 'next/server';
import { getOrCreateParticipantId } from '@/lib/participant';
import { reserveParticipantNickname } from '@/lib/spill-api';
import { isValidPublicCode } from '@/lib/session-code';

export const runtime = 'nodejs';

// Atomically reserves a nickname for the anonymous participant id stored in
// the session-scoped httpOnly cookie. The worker and D1 unique constraints are
// authoritative; the browser never supplies or learns the participant id.
const MSG_NOT_FOUND = 'This discussion could not be found.';
const MSG_BAD_BODY = 'Check your submission and try again.';
const MSG_GENERIC = 'Something went wrong. Please try again.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: MSG_BAD_BODY }, { status: 400 });
  }

  const sessionCode =
    typeof body?.sessionCode === 'string' ? body.sessionCode.trim().toUpperCase() : '';
  if (!isValidPublicCode(sessionCode)) {
    return NextResponse.json({ error: MSG_NOT_FOUND }, { status: 404 });
  }

  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  if (!nickname) {
    return NextResponse.json({ error: 'Pick a nickname before sending.' }, { status: 400 });
  }

  // The participant identity comes only from the session-scoped httpOnly
  // cookie, so a browser cannot claim another participant's reservation.
  const participantId = await getOrCreateParticipantId(sessionCode);

  const result = await reserveParticipantNickname({
    sessionCode,
    participantId,
    nickname,
  });

  if (result.status === 0) return NextResponse.json({ error: MSG_GENERIC }, { status: 500 });
  if (!result.ok) {
    return NextResponse.json({ error: result.body?.error || MSG_NOT_FOUND }, { status: result.status });
  }
  return NextResponse.json({
    available: true,
    reserved: true,
    nickname: result.body?.nickname || nickname,
  });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } });
}
