import { NextResponse } from 'next/server';
import { getRoom } from '@/lib/spill-api';
import { isValidPublicCode } from '@/lib/session-code';

export const runtime = 'nodejs';

// Polling endpoint for the room display: the current presentation pointer and
// the submission it points at (approved and screen-visible only, or null).
const MSG_NOT_FOUND = 'This discussion could not be found.';
const MSG_GENERIC = 'Something went wrong. Please try again.';

export async function GET(request, { params }) {
  const { sessionCode } = await params;
  const code = String(sessionCode ?? '').trim().toUpperCase();
  if (!isValidPublicCode(code)) {
    return NextResponse.json({ error: MSG_NOT_FOUND }, { status: 404 });
  }

  const result = await getRoom(code);
  if (result.status === 0) {
    return NextResponse.json({ error: MSG_GENERIC }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.body?.error || MSG_NOT_FOUND }, { status: 404 });
  }

  return NextResponse.json({
    currentId: result.body.currentId,
    submission: result.body.currentSubmission,
  });
}
