import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminToken: vi.fn(),
  patch: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAdmin: mocks.requireAdmin, getAdminToken: mocks.getAdminToken }));
vi.mock('@/lib/spill-api', () => ({
  patchAdminSubmission: mocks.patch,
  getAdminSubmission: mocks.read,
  bulkDeleteAdminSubmissions: vi.fn(),
  clearSessionContributions: vi.fn(),
  deleteAdminSubmission: vi.fn(),
}));

import { approve, hide, togglePin, toggleDiscussed, togglePresentationHidden } from '@/lib/actions/moderation';

const id = '5b471838-6ac0-4a29-b0f9-8a7a5a247394';
const row = { id, revision: 8, moderation_status: 'pending', is_pinned: false, discussed_at: null, hidden_from_presentation: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ role: 'admin' });
  mocks.getAdminToken.mockResolvedValue('test-admin-token');
  mocks.patch.mockResolvedValue({ ok: true, status: 200, body: { row } });
  mocks.read.mockResolvedValue({ ok: true, status: 200, body: { row } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

for (const [name, action, status] of [['approve', approve, 'approved'], ['reject', hide, 'hidden']]) {
  describe(`${name} server action`, () => {
    test.each([undefined, null, -1, 1.5, '8', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('does not send an invalid revision (%s) to the Worker', async revision => {
      const result = await action(id, revision);
      expect(result).toMatchObject({ refreshRequired: true, code: 'revision_required' });
      expect(result.error).toMatch(/refresh|reload|revision/i);
      expect(result.code).toEqual(expect.any(String));
      expect(mocks.requireAdmin).toHaveBeenCalledOnce();
      expect(mocks.patch).not.toHaveBeenCalled();
    });

    test.each([0, 8])('forwards revision %s and returns the confirmed row', async revision => {
      const result = await action(id, revision);
      expect(mocks.patch).toHaveBeenCalledWith('test-admin-token', id, { moderation_status: status, expectedRevision: revision });
      expect(result).toEqual({ ok: true, row });
    });

    test('keeps a safe Worker validation explanation actionable', async () => {
      mocks.patch.mockResolvedValue({ ok: false, status: 400, body: { error: 'expectedRevision must be an integer.' } });
      const result = await action(id, 8);
      expect(result).toMatchObject({ error: 'expectedRevision must be an integer.', refreshRequired: true, code: 'validation_failed' });
      expect(result.code).toEqual(expect.any(String));
    });

    test('reports a stale revision without retrying against a newer contribution', async () => {
      mocks.patch.mockResolvedValue({ ok: false, status: 409, body: { error: 'concurrent_change' } });
      const result = await action(id, 8);
      expect(result.refreshRequired).toBe(true);
      expect(result.error).toMatch(/another moderator|changed|updated/i);
      expect(result.code).toBe('concurrent_change');
      expect(result.code).toEqual(expect.any(String));
      expect(mocks.patch).toHaveBeenCalledOnce();
      expect(mocks.read).not.toHaveBeenCalled();
    });

    test('asks for refresh when the contribution no longer exists', async () => {
      mocks.patch.mockResolvedValue({ ok: false, status: 404, body: { error: 'Not found.' } });
      const result = await action(id, 8);
      expect(result.refreshRequired).toBe(true);
      expect(result.error).toMatch(/no longer|not found|removed|deleted/i);
      expect(result.code).toBe('not_found');
      expect(result.code).toEqual(expect.any(String));
    });

    test.each([401, 403])('makes authorization failure %s understandable', async statusCode => {
      mocks.patch.mockResolvedValue({ ok: false, status: statusCode, body: { error: 'PRIVATE_INTERNAL_AUTH_DIAGNOSTIC' } });
      const result = await action(id, 8);
      expect(result.error).toMatch(/sign in|permission|access|authorized|session/i);
      expect(result.error).not.toContain('PRIVATE_INTERNAL_AUTH_DIAGNOSTIC');
      expect(result.code).toBe(statusCode === 401 ? 'unauthorized' : 'forbidden');
      expect(result.ok).not.toBe(true);
    });

    test('does not expose internal service failures as validation feedback', async () => {
      mocks.patch.mockResolvedValue({ ok: false, status: 500, body: { error: 'PRIVATE_DATABASE_DETAIL' } });
      const result = await action(id, 8);
      expect(result.error).toBe('Could not update that contribution. Please try again.');
      expect(result.error).not.toContain('PRIVATE_DATABASE_DETAIL');
      expect(result.ok).not.toBe(true);
    });

    test('keeps authentication ahead of contribution updates', async () => {
      mocks.requireAdmin.mockRejectedValue(new Error('Authentication required'));
      await expect(action(id, 8)).rejects.toThrow('Authentication required');
      expect(mocks.patch).not.toHaveBeenCalled();
    });
  });
}

for (const [name, action, patch] of [
  ['pin', togglePin, { is_pinned: true }],
  ['discussed', toggleDiscussed, { discussed_at: expect.any(String) }],
  ['presentation visibility', togglePresentationHidden, { hidden_from_presentation: true }],
]) {
  test(`${name} preserves its current-row revision fallback`, async () => {
    await expect(action(id)).resolves.toEqual({ ok: true, row });
    expect(mocks.patch).toHaveBeenCalledWith('test-admin-token', id, { ...patch, expectedRevision: 8 });
  });
}
