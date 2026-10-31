'use server';

import { requireAdmin, getAdminToken } from '@/lib/auth';
import {
  deleteAdminSubmission,
  getAdminSubmission,
  patchAdminSubmission,
} from '@/lib/spill-api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_INVALID = 'Invalid contribution.';
const ERROR_GENERIC = 'Could not update that contribution. Please try again.';

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// The worker applies the patch and, when a contribution becomes hidden
// (moderation or presentation), clears the projector pointer when it points
// at that row - the same rules the pre-migration actions enforced via
// clearPointerIfCurrent. It returns the full updated row.
async function applyPatch(submissionId, patch) {
  const adminToken = await getAdminToken();
  const result = await patchAdminSubmission(adminToken, submissionId, patch);
  if (!result.ok || !result.body?.row) {
    console.error('[moderation] update failed:', result.status);
    return { error: ERROR_GENERIC };
  }
  return { row: result.body.row };
}

// Toggles need the current value; read the row, then flip it.
async function fetchRow(adminToken, submissionId) {
  const result = await getAdminSubmission(adminToken, submissionId);
  if (!result.ok || !result.body?.row) {
    console.error('[moderation] read failed:', result.status);
    return { error: ERROR_GENERIC };
  }
  return { row: result.body.row };
}

export async function approve(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const result = await applyPatch(submissionId, { moderation_status: 'approved' });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function hide(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const result = await applyPatch(submissionId, { moderation_status: 'hidden' });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function removeSubmission(submissionId, password) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  if (typeof password !== 'string' || !password) {
    return { error: 'Admin password is required to delete a contribution.' };
  }

  const adminToken = await getAdminToken();
  // The FK from presentation_state.current_submission_id is on delete set null.
  const result = await deleteAdminSubmission(adminToken, submissionId, password);
  if (!result.ok || !result.body?.row) {
    console.error('[moderation] delete failed:', result.status);
    return { error: result.body?.error || ERROR_GENERIC };
  }
  return { ok: true, row: result.body.row };
}

export async function togglePin(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const adminToken = await getAdminToken();
  const read = await fetchRow(adminToken, submissionId);
  if (read.error) return { error: read.error };

  const result = await applyPatch(submissionId, { is_pinned: !read.row.is_pinned });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function toggleDiscussed(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const adminToken = await getAdminToken();
  const read = await fetchRow(adminToken, submissionId);
  if (read.error) return { error: read.error };

  const result = await applyPatch(submissionId, {
    discussed_at: read.row.discussed_at ? null : new Date().toISOString(),
  });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}

export async function togglePresentationHidden(submissionId) {
  await requireAdmin();
  if (!isUuid(submissionId)) return { error: ERROR_INVALID };

  const adminToken = await getAdminToken();
  const read = await fetchRow(adminToken, submissionId);
  if (read.error) return { error: read.error };

  const result = await applyPatch(submissionId, {
    hidden_from_presentation: !read.row.hidden_from_presentation,
  });
  if (result.error) return { error: result.error };
  return { ok: true, row: result.row };
}
