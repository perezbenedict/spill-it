import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireFixture } from '../helpers/e2e-env.js';

const theme = page => page.locator('html');

test('dark remains the default even when the operating system prefers light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible();
});

test('theme preference persists across navigation, reload and a new browser context', async ({ page, context, browser }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Switch to light mode', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/admin/login');
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  const preference = (await context.cookies()).filter(cookie => cookie.name === 'spill_theme');
  expect(preference).toHaveLength(1);
  expect(preference[0].expires).toBeGreaterThan(Date.now() / 1000 + 300 * 86400);
  const reopened = await browser.newContext({ baseURL: E2E.baseURL });
  await reopened.addCookies(preference);
  const next = await reopened.newPage();
  const errors = [];
  next.on('pageerror', error => errors.push(error.message));
  await next.goto('/');
  await expect(theme(next)).toHaveAttribute('data-theme', 'light');
  await next.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(theme(next)).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
  await reopened.close();
});

for (const selected of ['dark', 'light']) {
  test(`${selected} homepage and authentication stay readable and keyboard accessible`, async ({ page, context }, info) => {
    await context.addCookies([{ name: 'spill_theme', value: selected, url: E2E.baseURL }]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(theme(page)).toHaveAttribute('data-theme', selected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByText('Your thoughts.', { exact: true })).toBeVisible();
      await info.attach(`theme-${selected}-home-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    const homeReport = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(homeReport.violations.map(rule => rule.id)).toEqual([]);
    await page.goto('/admin/login');
    await expect(page.getByRole('button', { name: `Switch to ${selected === 'dark' ? 'light' : 'dark'} mode`, exact: true })).toBeVisible();
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(report.violations.map(rule => rule.id)).toEqual([]);
    await info.attach(`theme-${selected}-login.png`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('personal light preference does not change projector atmosphere or add audience controls', async ({ page, context }) => {
  requireFixture(test, E2E.roomCode, 'SPILL_E2E_ROOM_CODE');
  await context.addCookies([{ name: 'spill_theme', value: 'light', url: E2E.baseURL }]);
  await page.goto(`/room/${E2E.roomCode}`);
  await expect(page.locator('.spill-stage.h-dvh')).toBeVisible();
  await expect(page.getByRole('button', { name: /Switch to (light|dark) mode/ })).toHaveCount(0);
  const midnight = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-midnight').trim().toLowerCase());
  expect(midnight).toBe('#160d2b');
  await page.goto('/admin/login');
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
});
