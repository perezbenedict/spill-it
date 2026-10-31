import { expect, test } from '@playwright/test';
import {
  E2E,
  loginAsAdmin,
  requireFixture,
  requireLocalMutationTarget,
} from '../helpers/e2e-env.js';

test('admin session identity, status and moderation feed survive refresh', async ({ page }) => {
  requireFixture(test, E2E.adminPassword, 'SPILL_E2E_ADMIN_PASSWORD');
  requireFixture(test, E2E.adminSessionId, 'SPILL_E2E_ADMIN_SESSION_ID');

  await loginAsAdmin(page);
  await page.goto(`/admin/sessions/${E2E.adminSessionId}`);
  const sessionHeading = page.locator('main').getByRole('heading', { level: 1 }).last();
  const title = await sessionHeading.textContent();
  await expect(page.getByText('Currently', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('main').getByRole('heading', { level: 1 }).last()).toHaveText(title);

  await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
  const feedBefore = await page.locator('main li').allTextContents();
  await page.reload();
  await expect.poll(() => page.locator('main li').allTextContents()).toEqual(feedBefore);
});

test('room follows pause and resume from server state without a refresh', async ({ page, context }) => {
  requireFixture(test, E2E.adminPassword, 'SPILL_E2E_ADMIN_PASSWORD');
  requireFixture(test, E2E.adminSessionId, 'SPILL_E2E_ADMIN_SESSION_ID');
  requireFixture(test, E2E.roomCode, 'SPILL_E2E_ROOM_CODE');
  test.skip(!E2E.runLifecycle, 'Set SPILL_E2E_RUN_LIFECYCLE=1 for a disposable lifecycle fixture.');
  requireLocalMutationTarget(test);

  const adminPage = await context.newPage();
  await loginAsAdmin(adminPage);
  await adminPage.goto(`/admin/sessions/${E2E.adminSessionId}`);
  await page.goto(`/room/${E2E.roomCode}`);

  await adminPage.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(adminPage.getByText(/status updated to paused/i)).toBeVisible();
  await expect(page.getByText('Submissions paused', { exact: true })).toBeVisible({ timeout: 8_000 });

  await adminPage.reload();
  await adminPage.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(adminPage.getByText(/status updated to live/i)).toBeVisible();
  await expect(page.getByText('Submissions paused', { exact: true })).toBeHidden({ timeout: 8_000 });
  await adminPage.close();
});

test('optional disposable lifecycle supports pause, resume, close and reopen', async ({ page }) => {
  test.setTimeout(60_000);
  requireFixture(test, E2E.adminPassword, 'SPILL_E2E_ADMIN_PASSWORD');
  requireFixture(test, E2E.adminSessionId, 'SPILL_E2E_ADMIN_SESSION_ID');
  test.skip(!E2E.runLifecycle, 'Set SPILL_E2E_RUN_LIFECYCLE=1 for a disposable lifecycle fixture.');
  requireLocalMutationTarget(test);

  await loginAsAdmin(page);
  await page.goto(`/admin/sessions/${E2E.adminSessionId}`);

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText(/status updated to paused/i)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByText(/status updated to live/i)).toBeVisible();
  await page.reload();

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Close discussion', exact: true }).click();
  await expect(page.getByText(/status updated to closed/i)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /reopen discussion/i }).click();
  await expect(page.getByText(/status updated to live/i)).toBeVisible();
});

test('room restores the presented contribution after refresh and reconnects', async ({ page, context }) => {
  requireFixture(test, E2E.roomCode, 'SPILL_E2E_ROOM_CODE');
  requireFixture(test, E2E.presentedText, 'SPILL_E2E_PRESENTED_TEXT');

  await page.goto(`/room/${E2E.roomCode}`);
  await expect(page.getByText(E2E.presentedText, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(E2E.presentedText, { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(/reconnecting/i)).toBeVisible({ timeout: 8_000 });
  await context.setOffline(false);
  await expect(page.getByText(E2E.presentedText, { exact: true })).toBeVisible();
});

test('presented text remains readable at mobile and projector dimensions', async ({ page }) => {
  requireFixture(test, E2E.roomCode, 'SPILL_E2E_ROOM_CODE');
  requireFixture(test, E2E.presentedText, 'SPILL_E2E_PRESENTED_TEXT');

  for (const viewport of [
    { width: 320, height: 700 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/room/${E2E.roomCode}`);
    const contribution = page.getByText(E2E.presentedText, { exact: true });
    await expect(contribution).toBeVisible();
    const box = await contribution.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test('closed-room status stays separate from admin navigation on narrow screens', async ({ page }) => {
  requireFixture(test, E2E.closedCode, 'SPILL_E2E_CLOSED_SESSION_CODE');
  requireFixture(test, E2E.adminPassword, 'SPILL_E2E_ADMIN_PASSWORD');

  await loginAsAdmin(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/room/${E2E.closedCode}`);
  const status = page.getByText('This conversation has been wrapped', { exact: true });
  const back = page.getByRole('link', { name: 'Back to dashboard' });
  await expect(status).toBeVisible();
  await expect(back).toBeVisible();
  const statusBox = await status.boundingBox();
  const backBox = await back.boundingBox();
  expect(
    statusBox.x + statusBox.width <= backBox.x ||
      backBox.x + backBox.width <= statusBox.x ||
      statusBox.y + statusBox.height <= backBox.y ||
      backBox.y + backBox.height <= statusBox.y
  ).toBeTruthy();
});
