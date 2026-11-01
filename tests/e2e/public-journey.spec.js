import { expect, test } from '@playwright/test';
import {
  E2E,
  enterNicknameStep,
  requireFixture,
  requireLocalMutationTarget,
  uniqueNickname,
} from '../helpers/e2e-env.js';

test('homepage choreography stays ordered and the CTA reaches the live discussion', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');

  await page.goto('/');
  const thought = page.getByText('Your thoughts.', { exact: true });
  const voice = page.getByText('Your voice.', { exact: true });
  const wordmark = page.getByText('Spill it', { exact: true });
  await expect(thought).toBeVisible();
  await expect(voice).toBeVisible();
  await expect(wordmark).toBeVisible();

  const boxes = await Promise.all([thought.boundingBox(), voice.boundingBox(), wordmark.boundingBox()]);
  expect(boxes.every(Boolean)).toBeTruthy();
  expect(boxes[0].y + boxes[0].height).toBeLessThanOrEqual(boxes[1].y);
  expect(boxes[1].y + boxes[1].height).toBeLessThanOrEqual(boxes[2].y);

  const cta = page.getByRole('link', { name: 'Join the Conversation', exact: true });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(new RegExp(`/join/${E2E.liveCode}$`, 'i'));
});
test('join copy is not repetitive and nickname/composer input survives transitions', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireFixture(test, E2E.topic, 'SPILL_E2E_TOPIC');
  requireLocalMutationTarget(test);

  await page.goto(`/join/${E2E.liveCode}`);
  await expect(page.getByRole('heading', { name: E2E.topic, exact: true })).toBeVisible();
  await expect(
    page.getByText("Pick a nickname and get ready to share what's on your mind.", { exact: true })
  ).toBeVisible();

  const nicknameInput = await enterNicknameStep(page);
  const nickname = uniqueNickname();
  await nicknameInput.fill(nickname);
  await page.waitForTimeout(50);
  await expect(nicknameInput).toHaveValue(nickname);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const category = page.getByRole('button', { name: /question/i }).first();
  await category.click();
  await expect(category).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const composer = page.locator('textarea');
  const content = `How should a live event recover from a brief connection drop? ${Date.now()}`;
  await composer.fill(content);
  await page.waitForTimeout(50);
  await expect(composer).toHaveValue(content);
});
test('rapid submit interaction emits one request and ends in an unambiguous confirmation', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireLocalMutationTarget(test);

  let submissionRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/submissions') {
      submissionRequests += 1;
    }
  });

  await page.goto(`/join/${E2E.liveCode}`);
  const nicknameInput = await enterNicknameStep(page);
  await nicknameInput.fill(uniqueNickname('Fast'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /question/i }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('textarea').fill(`One deliberate contribution ${Date.now()}`);

  const submit = page.getByRole('button', { name: /spill it now/i });
  await submit.dblclick();
  await expect(page.getByText('Your thought is with the moderator.')).toBeVisible();
  expect(submissionRequests).toBe(1);
});

test('an ambiguous network failure retries the same logical submission safely', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireLocalMutationTarget(test);

  const requestIds = [];
  let dropFirstResponse = true;
  await page.route('**/api/submissions', async (route) => {
    const payload = route.request().postDataJSON();
    requestIds.push(payload.requestId);
    if (dropFirstResponse) {
      dropFirstResponse = false;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto(`/join/${E2E.liveCode}`);
  const nicknameInput = await enterNicknameStep(page);
  await nicknameInput.fill(uniqueNickname('Retry'));
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /question/i }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.locator('textarea').fill(`One retry-safe contribution ${Date.now()}`);

  await page.getByRole('button', { name: /spill it now/i }).click();
  await expect(page.getByText(/same send will not be duplicated/i)).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: /spill it now/i }).click();
  await expect(page.getByText('Your thought is with the moderator.')).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[1]).toBe(requestIds[0]);
});

test('long nickname and contribution text remain usable on a narrow mobile screen', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireLocalMutationTarget(test);
  await page.setViewportSize({ width: 320, height: 700 });

  await page.goto(`/join/${E2E.liveCode}`);
  const nicknameInput = await enterNicknameStep(page);
  const nickname = `${uniqueNickname('LongName')}${'x'.repeat(60)}`.slice(0, 60);
  await nicknameInput.fill(nickname);
  await expect(nicknameInput).toHaveValue(nickname);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /question/i }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const content = Array.from(
    { length: 18 },
    (_, index) => `Sentence ${index + 1} stays readable during a live event.`
  ).join(' ');
  const composer = page.locator('textarea');
  await composer.fill(content);
  await expect(composer).toHaveValue(content);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const box = await composer.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});
