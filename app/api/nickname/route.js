import { NextResponse } from 'next/server';
import { getOrCreateParticipantId } from '@/lib/participant';
import { checkNicknameAvailability } from '@/lib/spill-api';
import { isValidPublicCode } from '@/lib/session-code';

export const runtime = 'nodejs';

// Proxy to the worker's /nickname availability endpoint. The worker is
// authoritative on session-scoped nickname uniqueness; this route only
// resolves the participant id from the httpOnly cookie so the worker can
// exclude the caller's own prior submissions.
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

  // Get participant ID from cookie (or create one if missing). Pass it to the worker
  // so it can exclude the caller's own submissions when checking uniqueness.
  const participantId = await getOrCreateParticipantId(sessionCode);

  const result = await checkNicknameAvailability({
    sessionCode,
    participantId,
    nickname,
  });

  if (result.status === 0) return NextResponse.json({ error: MSG_GENERIC }, { status: 500 });
  if (!result.ok) {
    return NextResponse.json({ error: result.body?.error || MSG_NOT_FOUND }, { status: result.status });
  }
  return NextResponse.json({ available: result.body?.available ?? false });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } });
}
