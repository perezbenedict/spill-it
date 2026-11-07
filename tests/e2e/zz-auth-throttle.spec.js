import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env';

test('shared database authentication admission caps concurrent password guesses', async () => {
  requireLocalMutationTarget(test);
  const target = process.env.SPILL_E2E_WORKER_URL;
  const secret = process.env.SPILL_E2E_API_SECRET;
  if (!target || !secret) throw new Error('Use the isolated runner.');
  expect(new URL(target).hostname).toBe('127.0.0.1');
  const attempts = await Promise.all(Array.from({ length: 20 }, async () => {
    const response = await fetch(`${target}/admin/auth/login`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'invalid-disposable-fixture-password' }) });
    if (response.status === 429) expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    return response.status;
  }));
  expect(attempts.filter(status => status === 401)).toHaveLength(10);
  expect(attempts.filter(status => status === 429)).toHaveLength(10);
});

test('concurrent distinct submissions cannot exceed the per-browser admission limit', async () => {
  requireLocalMutationTarget(test);
  const target = process.env.SPILL_E2E_WORKER_URL;
  const secret = process.env.SPILL_E2E_API_SECRET;
  if (!target || !secret) throw new Error('Use the isolated runner.');
  expect(new URL(target).hostname).toBe('127.0.0.1');
  const participant = crypto.randomUUID();
  const attempts = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const response = await fetch(`${target}/submissions`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      sessionCode: E2E.liveCode, participant_id: participant, request_id: crypto.randomUUID(), nickname: 'AdmissionLimitFixture', category: 'question', content: `Distinct concurrent submission ${index}`,
    }) });
    return response.status;
  }));
  expect(attempts.filter(status => status === 200)).toHaveLength(5);
  expect(attempts.filter(status => status === 429)).toHaveLength(5);
});
