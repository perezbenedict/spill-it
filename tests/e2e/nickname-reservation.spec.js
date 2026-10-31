import { expect, test } from '@playwright/test';
import {
  E2E,
  requireFixture,
  requireLocalMutationTarget,
  uniqueNickname,
} from '../helpers/e2e-env.js';

test('a nickname has one anonymous owner per session and survives reconnection', async ({ browser }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireFixture(test, E2E.secondCode, 'SPILL_E2E_SECOND_SESSION_CODE');
  requireLocalMutationTarget(test);

  const first = await browser.newContext({ baseURL: E2E.baseURL });
  const second = await browser.newContext({ baseURL: E2E.baseURL });
  const nickname = uniqueNickname('Race');

  const [firstClaim, secondClaim] = await Promise.all([
    first.request.post('/api/nickname', {
      data: { sessionCode: E2E.liveCode, nickname: ` ${nickname} ` },
    }),
    second.request.post('/api/nickname', {
      data: { sessionCode: E2E.liveCode, nickname: nickname.toUpperCase() },
    }),
  ]);

  expect([firstClaim.status(), secondClaim.status()].sort()).toEqual([200, 409]);
  const winner = firstClaim.status() === 200 ? first : second;
  const loser = firstClaim.status() === 409 ? firstClaim : secondClaim;
  await expect(loser.json()).resolves.toMatchObject({
    error: "That nickname's already taken. Try another one.",
  });

  const refreshedClaim = await winner.request.post('/api/nickname', {
    data: { sessionCode: E2E.liveCode, nickname: `  ${nickname.toLowerCase()}  ` },
  });
  expect(refreshedClaim.status()).toBe(200);

  const otherSessionClaim = await second.request.post('/api/nickname', {
    data: { sessionCode: E2E.secondCode, nickname },
  });
  expect(otherSessionClaim.status()).toBe(200);

  await first.close();
  await second.close();
});
