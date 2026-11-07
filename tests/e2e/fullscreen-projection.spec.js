import { expect, test } from '@playwright/test';
import {
  E2E,
  loginAsAdmin,
  requireFixture,
  requireLocalMutationTarget,
} from '../helpers/e2e-env.js';

test('QR stage enters and exits the browser Fullscreen API with topic and static QR intact', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireFixture(test, E2E.topic, 'SPILL_E2E_TOPIC');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/qr/${E2E.liveCode}`);

  const stage = page.locator('[data-qr-stage]');
  const topic = page.locator('[data-qr-topic]');
  const qr = page.getByRole('img', { name: /qr code to join/i });
  await expect(topic).toHaveText(E2E.topic);
  await expect(qr).toBeVisible();

  await page.locator('[data-fullscreen-control="enter"]').click();
  await expect(stage).toHaveAttribute('data-fullscreen-active', 'true');
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBeTruthy();
  await expect(page.locator('[data-fullscreen-control="exit"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /print poster/i })).toHaveCount(0);
  await expect(topic).toBeVisible();
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((image) => getComputedStyle(image).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

  // Chromium headless does not route Escape through browser chrome, so use
  // the same document Fullscreen API path as the visible Exit control.
  await page.locator('[data-fullscreen-control="exit"]').click();
  await expect(stage).toHaveAttribute('data-fullscreen-active', 'false');
  expect(await page.evaluate(() => document.fullscreenElement)).toBeFalsy();
  await expect(page.locator('[data-fullscreen-control="enter"]')).toBeVisible();
});

test('QR stage explains when the Fullscreen API is unavailable', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto(`/qr/${E2E.liveCode}`);
  await page.locator('[data-fullscreen-control="enter"]').click();
  await expect(
    page.getByText('Fullscreen is not supported in this browser. You can keep using the projector view here.')
  ).toBeVisible();
  await expect(page.locator('[data-qr-stage]')).toHaveAttribute('data-fullscreen-active', 'false');
});

test('room transition runs only for pointer changes and the latest rapid update wins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
  requireFixture(test, E2E.adminPassword, 'SPILL_E2E_ADMIN_PASSWORD');
  requireFixture(test, E2E.projectionIds.length >= 3, 'SPILL_E2E_PROJECTION_IDS');
  requireLocalMutationTarget(test);

  const [firstId, secondId, latestId] = E2E.projectionIds;
  await loginAsAdmin(page);
  const setScreen = (submissionId) =>
    page.request.post('/api/presentation', {
      data: { sessionCode: E2E.liveCode, action: 'set', submissionId },
    });

  expect((await setScreen(firstId)).ok()).toBeTruthy();
  await page.goto(`/room/${E2E.liveCode}`);
  const stage = page.locator('[data-presentation-phase]');
  await expect(page.getByText(E2E.topic, { exact: true })).toBeVisible();
  await expect(stage).toHaveAttribute('data-current-contribution-id', firstId);
  await expect(stage).toHaveAttribute('data-presentation-phase', 'settled');
  const initialVersion = Number(await stage.getAttribute('data-presentation-transition-version'));

  // An unchanged polling cycle must not replay the entrance.
  await page.waitForTimeout(4000);
  await expect(stage).toHaveAttribute('data-current-contribution-id', firstId);
  await expect(stage).toHaveAttribute('data-presentation-phase', 'settled');
  expect(Number(await stage.getAttribute('data-presentation-transition-version'))).toBe(initialVersion);
  await expect(page.locator('[data-presentation-sweep]')).toHaveCount(0);

  expect((await setScreen(secondId)).ok()).toBeTruthy();
  await expect(stage).toHaveAttribute('data-server-contribution-id', secondId);
  await expect
    .poll(async () => Number(await stage.getAttribute('data-presentation-transition-version')))
    .toBeGreaterThan(initialVersion);
  const secondVersion = Number(await stage.getAttribute('data-presentation-transition-version'));

  // Supersede the in-flight transition; only the newest server-confirmed ID may settle.
  expect((await setScreen(latestId)).ok()).toBeTruthy();
  await expect(stage).toHaveAttribute('data-server-contribution-id', latestId, { timeout: 7000 });
  await expect
    .poll(async () => Number(await stage.getAttribute('data-presentation-transition-version')))
    .toBeGreaterThan(secondVersion);
  await expect(stage).toHaveAttribute('data-current-contribution-id', latestId, { timeout: 3000 });
  await expect(stage).toHaveAttribute('data-presentation-phase', 'settled', { timeout: 3000 });
  await expect(page.locator('[data-presented-contribution]')).toHaveCount(1);
  await expect(page.locator(`[data-presented-contribution="${secondId}"]`)).toHaveCount(0);
});
