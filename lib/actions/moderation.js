'use server';

import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_INVALID = 'Invalid contribution.';
const ERROR_GENERIC = 'Could not update that contribution. Please try again.';

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// Only clears the pointer when it points at this submission, so moderating one
// contribution never disturbs whatever else is on screen.
async function clearPointerIfCurrent(supabase, sessionId, submissionId) {
  const { error } = await supabase
    .from('presentation_state')
    .update({
      current_submission_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('current_submission_id', submissionId);
  if (error) {
    console.error('[moderation] clear presentation pointer failed:', error.message);
  }
}

async function readCurrent(supabase, submissionId) {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, session_id, is_pinned, discussed_at, hidden_from_presentation')
    .eq('id', submissionId)
    .maybeSingle();
  if (error) {
    console.error('[moderation] read failed:', error.message);
    return { error: ERROR_GENERIC };
  }
  if (!data) return { error: ERROR_GENERIC };
  return { row: data };
}

async function applyUpdate(supabase, submissionId, patch) {
  const { data, error } = await supabase
    .from('submissions')
    .update(patch)
    .eq('id', submissionId)
    .select()
    .single();
  if (error || !data) {
    console.error('[moderation] update failed:', error ? error.message : 'no row matched');
    return { error: ERROR_GENERIC };
  }
  return { row: data };
}

export async function approve(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const supabase = await createClient();
  const result = await applyUpdate(supabase, submissionId, {
    moderation_status: 'approved',
  });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function hide(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const supabase = await createClient();
  const result = await applyUpdate(supabase, submissionId, {
    moderation_status: 'hidden',
  });
  if (result.error) return { error: result.error };
  await clearPointerIfCurrent(supabase, result.row.session_id, result.row.id);
  return { ok: true, row: result.row };
}

export async function removeSubmission(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const supabase = await createClient();
  // FK from presentation_state.current_submission_id is on delete set null.
  const { data: row, error } = await supabase
    .from('submissions')
    .delete()
    .eq('id', submissionId)
    .select()
    .single();
  if (error || !row) {
    console.error('[moderation] delete failed:', error ? error.message : 'no row matched');
    return { error: ERROR_GENERIC };
  }
  return { ok: true, row };
}

export async function togglePin(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const supabase = await createClient();
  const current = await readCurrent(supabase, submissionId);
  if (current.error) return { error: current.error };

  const result = await applyUpdate(supabase, submissionId, {
    is_pinned: !current.row.is_pinned,
  });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function toggleDiscussed(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const supabase = await createClient();
  const current = await readCurrent(supabase, submissionId);
  if (current.error) return { error: current.error };

  const result = await applyUpdate(supabase, submissionId, {
    discussed_at: current.row.discussed_at ? null : new Date().toISOString(),
  });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function togglePresentationHidden(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const supabase = await createClient();
  const current = await readCurrent(supabase, submissionId);
  if (current.error) return { error: current.error };

  const hidden = !current.row.hidden_from_presentation;
  const result = await applyUpdate(supabase, submissionId, {
    hidden_from_presentation: hidden,
  });
  if (result.error) return { error: result.error };
  if (hidden) {
    await clearPointerIfCurrent(supabase, result.row.session_id, result.row.id);
  }
  return { ok: true, row: result.row };
}
