import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isValidPublicCode } from '@/lib/session-code';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['set', 'clear', 'next', 'prev', 'togglePin', 'hide'];
const ACTIONS_NEEDING_ID = ['set', 'togglePin', 'hide'];

// Fixed copy: row ids, Postgres messages and stacks never leave this process.
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

// Upsert without .select() requests no representation, so RLS never needs a
// SELECT policy on presentation_state (drafts are hidden from public reads).
async function setPointer(supabase, sessionId, currentSubmissionId, updatedBy) {
  const { error } = await supabase.from('presentation_state').upsert(
    {
      session_id: sessionId,
      current_submission_id: currentSubmissionId,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: 'session_id' }
  );
  return error;
}

async function clearPointer(supabase, sessionId, submissionId, updatedBy) {
  let query = supabase
    .from('presentation_state')
    .update({
      current_submission_id: null,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq('session_id', sessionId);
  if (submissionId) query = query.eq('current_submission_id', submissionId);
  const { error } = await query;
  return error;
}

// RLS hides pointer rows for drafts; treat "no visible row" as null.
async function readPointer(supabase, sessionId) {
  const { data, error } = await supabase
    .from('presentation_state')
    .select('current_submission_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data?.current_submission_id ?? null;
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

  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from('discussion_sessions')
    .select('id')
    .eq('public_code', sessionCode)
    .maybeSingle();
  if (sessionError) {
    console.error('[presentation] session lookup failed:', sessionError.message);
    return fail(500, MSG_GENERIC);
  }
  if (!session) return fail(404, MSG_SESSION_NOT_FOUND);

  const updatedBy = auth.user.id;

  if (action === 'set') {
    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .select('id, moderation_status, hidden_from_presentation')
      .eq('id', submissionId)
      .eq('session_id', session.id)
      .maybeSingle();
    if (submissionError) {
      console.error('[presentation] submission lookup failed:', submissionError.message);
      return fail(500, MSG_GENERIC);
    }
    if (
      !submission ||
      submission.moderation_status !== 'approved' ||
      submission.hidden_from_presentation
    ) {
      return fail(400, MSG_NOT_ON_SCREEN);
    }
    const pointerError = await setPointer(supabase, session.id, submissionId, updatedBy);
    if (pointerError) {
      console.error('[presentation] set failed:', pointerError.message);
      return fail(500, MSG_GENERIC);
    }
    return ok(submissionId);
  }

  if (action === 'clear') {
    const pointerError = await clearPointer(supabase, session.id, null, updatedBy);
    if (pointerError) {
      console.error('[presentation] clear failed:', pointerError.message);
      return fail(500, MSG_GENERIC);
    }
    return ok(null);
  }

  if (action === 'next' || action === 'prev') {
    const { data: queue, error: queueError } = await supabase
      .from('submissions')
      .select('id')
      .eq('session_id', session.id)
      .eq('moderation_status', 'approved')
      .eq('hidden_from_presentation', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (queueError) {
      console.error('[presentation] queue lookup failed:', queueError.message);
      return fail(500, MSG_GENERIC);
    }
    if (!queue || queue.length === 0) {
      const pointerError = await clearPointer(supabase, session.id, null, updatedBy);
      if (pointerError) {
        console.error('[presentation] clear failed:', pointerError.message);
        return fail(500, MSG_GENERIC);
      }
      return ok(null);
    }

    let currentId = null;
    try {
      currentId = await readPointer(supabase, session.id);
    } catch (error) {
      console.error('[presentation] pointer read failed:', error.message);
      return fail(500, MSG_GENERIC);
    }

    const index = queue.findIndex((row) => row.id === currentId);
    // Nothing on screen (or it left the queue): enter at the top. Otherwise
    // step one position and clamp at the ends.
    const targetIndex =
      index === -1
        ? 0
        : Math.min(Math.max(index + (action === 'next' ? 1 : -1), 0), queue.length - 1);
    const targetId = queue[targetIndex].id;

    const pointerError = await setPointer(supabase, session.id, targetId, updatedBy);
    if (pointerError) {
      console.error('[presentation] pointer set failed:', pointerError.message);
      return fail(500, MSG_GENERIC);
    }
    return ok(targetId);
  }

  // togglePin and hide: the contribution must exist inside this session.
  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select('id, is_pinned')
    .eq('id', submissionId)
    .eq('session_id', session.id)
    .maybeSingle();
  if (submissionError) {
    console.error('[presentation] submission lookup failed:', submissionError.message);
    return fail(500, MSG_GENERIC);
  }
  if (!submission) return fail(400, MSG_SUBMISSION_NOT_FOUND);

  if (action === 'togglePin') {
    const { error: pinError } = await supabase
      .from('submissions')
      .update({ is_pinned: !submission.is_pinned })
      .eq('id', submission.id);
    if (pinError) {
      console.error('[presentation] pin failed:', pinError.message);
      return fail(500, MSG_GENERIC);
    }
    try {
      return ok(await readPointer(supabase, session.id));
    } catch (error) {
      console.error('[presentation] pointer read failed:', error.message);
      return fail(500, MSG_GENERIC);
    }
  }

  // hide
  const { error: hideError } = await supabase
    .from('submissions')
    .update({ hidden_from_presentation: true })
    .eq('id', submission.id);
  if (hideError) {
    console.error('[presentation] hide failed:', hideError.message);
    return fail(500, MSG_GENERIC);
  }
  try {
    const currentId = await readPointer(supabase, session.id);
    if (currentId === submission.id) {
      const pointerError = await clearPointer(supabase, session.id, submission.id, updatedBy);
      if (pointerError) {
        console.error('[presentation] clear failed:', pointerError.message);
        return fail(500, MSG_GENERIC);
      }
      return ok(null);
    }
    return ok(currentId);
  } catch (error) {
    console.error('[presentation] pointer read failed:', error.message);
    return fail(500, MSG_GENERIC);
  }
}
