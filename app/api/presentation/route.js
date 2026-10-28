import { NextResponse } from 'next/server';
import { requireAdminApi, getAdminToken } from '@/lib/auth';
import {
  getAdminSubmission,
  getPresentation,
  listAdminSessions,
  listAdminSubmissions,
  patchAdminSubmission,
  setPresentation,
} from '@/lib/spill-api';
import { isValidPublicCode } from '@/lib/session-code';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['set', 'clear', 'next', 'prev', 'togglePin', 'hide'];
const ACTIONS_NEEDING_ID = ['set', 'togglePin', 'hide'];
const QUEUE_LIMIT = 200;

// Fixed copy: row ids, worker messages and stacks never leave this process.
const MSG_UNAUTHORIZED = 'Not authorized.';
const MSG_BAD_BODY = 'Check your request and try again.';
const MSG_CODE = 'That session code is not valid.';
const MSG_ACTION = 'That action is not supported.';
const MSG_SUBMISSION_ID = 'Invalid contribution.';
const MSG_SESSION_NOT_FOUND = 'This discussion could not be found.';
const MSG_SUBMISSION_NOT_FOUND = 'That contribution could not be found.';
const MSG_NOT_ON_SCREEN = 'That contribution is not ready for the screen.';
const MSG_GENERIC = 'Something went wrong. Please try again.';

function fail(status, message) {
  return NextResponse.json({ error: message }, { status });
}

function ok(currentId) {
  return NextResponse.json({ ok: true, currentId: currentId ?? null });
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request) {
  const auth = await requireAdminApi();
  if (!auth) return fail(401, MSG_UNAUTHORIZED);

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, MSG_BAD_BODY);
  }

  const sessionCode =
    typeof body?.sessionCode === 'string' ? body.sessionCode.trim().toUpperCase() : '';
  if (!isValidPublicCode(sessionCode)) return fail(400, MSG_CODE);

  const action = body?.action;
  if (!ACTIONS.includes(action)) return fail(400, MSG_ACTION);

  const submissionId = body?.submissionId;
  if (ACTIONS_NEEDING_ID.includes(action) && !isUuid(submissionId)) {
    return fail(400, MSG_SUBMISSION_ID);
  }
  if (submissionId != null && !isUuid(submissionId)) return fail(400, MSG_SUBMISSION_ID);

  const adminToken = await getAdminToken();

  // Resolve the session by public code; the admin view includes drafts.
  const sessionsResult = await listAdminSessions(adminToken, {
    public_code: sessionCode,
    limit: 1,
  });
  if (sessionsResult.status === 0) return fail(500, MSG_GENERIC);
  const session = sessionsResult.body?.items?.[0] ?? null;
  if (!sessionsResult.ok || !session) {
    if (sessionsResult.ok) return fail(404, MSG_SESSION_NOT_FOUND);
    return fail(500, MSG_GENERIC);
  }

  if (action === 'set') {
    const result = await getAdminSubmission(adminToken, submissionId);
    if (result.status === 0) return fail(500, MSG_GENERIC);
    const submission = result.ok ? result.body?.row : null;
    if (
      !submission ||
      submission.session_id !== session.id ||
      submission.moderation_status !== 'approved' ||
      submission.hidden_from_presentation
    ) {
      return fail(400, MSG_NOT_ON_SCREEN);
    }
    const pointerResult = await setPresentation(adminToken, session.id, submissionId);
    if (!pointerResult.ok) return fail(500, MSG_GENERIC);
    return ok(submissionId);
  }

  if (action === 'clear') {
    const pointerResult = await setPresentation(adminToken, session.id, null);
    if (!pointerResult.ok) return fail(500, MSG_GENERIC);
    return ok(null);
  }

  if (action === 'next' || action === 'prev') {
    // Queue: approved, not hidden from the screen, pinned first then oldest.
    const queueResult = await listAdminSubmissions(adminToken, {
      session_id: session.id,
      status: 'approved',
      sort: 'queue',
      limit: QUEUE_LIMIT,
    });
    if (queueResult.status === 0) return fail(500, MSG_GENERIC);
    if (!queueResult.ok) return fail(500, MSG_GENERIC);
    const queue = queueResult.body?.items ?? [];
    if (queue.length === 0) {
      const pointerResult = await setPresentation(adminToken, session.id, null);
      if (!pointerResult.ok) return fail(500, MSG_GENERIC);
      return ok(null);
    }

    const pointerResult = await getPresentation(adminToken, session.id);
    if (!pointerResult.ok) return fail(500, MSG_GENERIC);
    const currentId = pointerResult.body?.currentId ?? null;

    const index = queue.findIndex((row) => row.id === currentId);
    // Nothing on screen (or it left the queue): enter at the top. Otherwise
    // step one position and clamp at the ends.
    const targetIndex =
      index === -1
        ? 0
        : Math.min(Math.max(index + (action === 'next' ? 1 : -1), 0), queue.length - 1);
    const targetId = queue[targetIndex].id;

    const setResult = await setPresentation(adminToken, session.id, targetId);
    if (!setResult.ok) return fail(500, MSG_GENERIC);
    return ok(targetId);
  }

  // togglePin and hide: the contribution must exist inside this session.
  const result = await getAdminSubmission(adminToken, submissionId);
  if (result.status === 0) return fail(500, MSG_GENERIC);
  const submission = result.ok ? result.body?.row : null;
  if (!submission || submission.session_id !== session.id) {
    return fail(400, MSG_SUBMISSION_NOT_FOUND);
  }

  if (action === 'togglePin') {
    const patchResult = await patchAdminSubmission(adminToken, submission.id, {
      is_pinned: !submission.is_pinned,
    });
    if (!patchResult.ok) return fail(500, MSG_GENERIC);
    const pointerResult = await getPresentation(adminToken, session.id);
    if (!pointerResult.ok) return fail(500, MSG_GENERIC);
    return ok(pointerResult.body?.currentId ?? null);
  }

  // hide: the worker clears the pointer when it points at this row.
  const patchResult = await patchAdminSubmission(adminToken, submission.id, {
    hidden_from_presentation: true,
  });
  if (!patchResult.ok) return fail(500, MSG_GENERIC);
  const pointerResult = await getPresentation(adminToken, session.id);
  if (!pointerResult.ok) return fail(500, MSG_GENERIC);
  return ok(pointerResult.body?.currentId ?? null);
}
