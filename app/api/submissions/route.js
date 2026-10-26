import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateParticipantId } from '@/lib/participant';
import {
  DUPLICATE_WINDOW_SECONDS,
  DEFAULT_MAX_CONTENT_LENGTH,
  DEFAULT_MIN_CONTENT_LENGTH,
  RATE_LIMIT,
} from '@/lib/constants';
import { isValidPublicCode } from '@/lib/session-code';
import { normalizeContent, submissionSchemaFactory } from '@/lib/validation';

export const runtime = 'nodejs';

// Fixed, friendly copy. zod issues, Postgres messages, ids and stacks never
// leave this process.
const MSG_NOT_FOUND = 'This discussion could not be found.';
const MSG_CLOSED = 'Submissions are currently closed for this discussion.';
const MSG_CATEGORY = 'That type of contribution is not open right now.';
const MSG_RATE_LIMITED = 'Slow down a moment - try again shortly.';
const MSG_GENERIC = 'Something went wrong and your thought was not saved. Please try again.';
const MSG_BAD_BODY = 'Check your submission and try again.';

function fail(status, message, headers) {
  return NextResponse.json({ error: message }, { status, headers });
}

function clampLength(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 1000);
}

function messageForIssue(issue, minLength, maxLength) {
  if (issue?.path?.includes('content')) {
    return issue.code === 'too_big'
      ? `Keep it under ${maxLength} characters.`
      : `Say a little more - at least ${minLength} characters.`;
  }
  if (issue?.path?.includes('nickname')) return 'Pick a nickname before sending.';
  return MSG_BAD_BODY;
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

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return fail(500, MSG_GENERIC);
  }

  const { data: session, error: sessionError } = await admin
    .from('discussion_sessions')
    .select('id, status, available_categories, configuration, closes_at')
    .eq('public_code', sessionCode)
    .maybeSingle();
  if (sessionError) {
    console.error('[submissions] session lookup failed:', sessionError.message);
    return fail(500, MSG_GENERIC);
  }
  if (!session || session.status === 'draft') return fail(404, MSG_NOT_FOUND);

  const configuration = session.configuration || {};
  const minLength = clampLength(
    configuration.min_content_length,
    DEFAULT_MIN_CONTENT_LENGTH
  );
  const maxLength = clampLength(
    configuration.max_content_length,
    DEFAULT_MAX_CONTENT_LENGTH
  );

  // Validate the whole payload before any submission read or write.
  const parsed = submissionSchemaFactory({ minLength, maxLength }).safeParse({
    ...body,
    sessionCode,
  });
  if (!parsed.success) {
    return fail(400, messageForIssue(parsed.error.issues[0], minLength, maxLength));
  }
  const { category, nickname, content } = parsed.data;

  if (session.status !== 'live') return fail(409, MSG_CLOSED);
  if (session.closes_at && new Date(session.closes_at).getTime() <= Date.now()) {
    return fail(409, MSG_CLOSED);
  }
  if (
    !Array.isArray(session.available_categories) ||
    !session.available_categories.includes(category)
  ) {
    return fail(400, MSG_CATEGORY);
  }

  const participantId = await getOrCreateParticipantId(sessionCode);

  const windowStart = new Date(Date.now() - RATE_LIMIT.windowSeconds * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('participant_id', participantId)
    .gte('created_at', windowStart);
  if (countError) {
    console.error('[submissions] rate limit check failed:', countError.message);
    return fail(500, MSG_GENERIC);
  }
  if ((count ?? 0) >= RATE_LIMIT.maxSubmissions) {
    return fail(429, MSG_RATE_LIMITED, {
      'Retry-After': String(RATE_LIMIT.windowSeconds),
    });
  }

  // Idempotent double-click/retry protection: same content from the same
  // participant in this session recently counts as already delivered.
  const normalized = normalizeContent(content);
  const duplicateCutoff = Date.now() - DUPLICATE_WINDOW_SECONDS * 1000;
  const { data: recent, error: recentError } = await admin
    .from('submissions')
    .select('content, created_at')
    .eq('session_id', session.id)
    .eq('participant_id', participantId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (recentError) {
    console.error('[submissions] duplicate check failed:', recentError.message);
  }
  const isDuplicate = (recent || []).some(
    (row) =>
      new Date(row.created_at).getTime() >= duplicateCutoff &&
      normalizeContent(row.content) === normalized
  );
  if (isDuplicate) return NextResponse.json({ ok: true });

  const { error: insertError } = await admin.from('submissions').insert({
    session_id: session.id,
    participant_id: participantId,
    nickname,
    category,
    content,
    moderation_status: 'pending',
  });
  if (insertError) {
    console.error('[submissions] insert failed:', insertError.message);
    return fail(500, MSG_GENERIC);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
