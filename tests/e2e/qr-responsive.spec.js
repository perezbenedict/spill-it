import { expect, test } from '@playwright/test';
import { E2E, requireFixture } from '../helpers/e2e-env.js';

const VIEWPORTS = [
  { name: 'narrow mobile', width: 320, height: 700 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'large display', width: 1920, height: 1080 },
];

function boxesOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

for (const viewport of VIEWPORTS) {
  test(`major public surfaces do not overflow or overlap at ${viewport.name}`, async ({ page }) => {
    requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto('/');
    await expect(page.getByText('Your thoughts.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    await expect
      .poll(async () => {
        const thought = await page.getByText('Your thoughts.', { exact: true }).boundingBox();
        const voice = await page.getByText('Your voice.', { exact: true }).boundingBox();
        const spill = await page.getByText('Spill it', { exact: true }).boundingBox();
        return boxesOverlap(thought, voice) || boxesOverlap(voice, spill);
      })
      .toBeFalsy();

    await page.goto(`/qr/${E2E.longCode || E2E.liveCode}`);
    const qr = page.getByRole('img', { name: /qr code to join/i });
    await expect(qr).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const qrBox = await qr.boundingBox();
    const headingBox = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(boxesOverlap(qrBox, headingBox)).toBeFalsy();
    expect(await qr.evaluate((image) => image.naturalWidth >= 512 && image.naturalHeight >= 512)).toBeTruthy();
    expect(await qr.evaluate((image) => getComputedStyle(image).animationName)).toBe('none');

    await page.goto(`/join/${E2E.longCode || E2E.liveCode}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('QR and poster keep the destination, code and print controls intact', async ({ page }) => {
  requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');

  const qrResponse = await page.goto(`/qr/${E2E.liveCode}`);
  expect(qrResponse?.ok()).toBeTruthy();
  await expect(page.getByRole('img', { name: /qr code to join/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /print/i })).toBeVisible();
  await expect(page.getByText(new RegExp(E2E.liveCode, 'i')).last()).toBeVisible();

  const posterResponse = await page.goto(`/poster/${E2E.liveCode}`);
  expect(posterResponse?.ok()).toBeTruthy();
  await expect(page.getByRole('img', { name: /qr code to join/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /print/i })).toBeVisible();
  await expect(page.getByText(new RegExp(`Session ${E2E.liveCode}`, 'i')).last()).toBeVisible();
});
