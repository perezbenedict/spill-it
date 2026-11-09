import { expect, test } from '@playwright/test';
import { E2E, enterNicknameStep, requireFixture, requireLocalMutationTarget, uniqueNickname } from '../helpers/e2e-env.js';

for (const theme of ['dark', 'light']) {
  test(`public atmosphere coverage and readable content · ${theme}`, async ({ page, context }, info) => {
    test.setTimeout(120000);
    requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
    await context.addCookies([{ name: 'spill_theme', value: theme, url: E2E.baseURL }]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.hero-atmosphere')).toBeVisible();
      const background = await page.locator('.hero-atmosphere').boundingBox();
      expect(background.x).toBe(0);
      expect(background.width).toBe(width);
      const content = await page.locator('.hero-content').boundingBox();
      expect(content.width).toBeLessThanOrEqual(672);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const lines = await Promise.all(['Your thoughts.', 'Your voice.', 'Spill it'].map(text => page.getByText(text, { exact: true }).boundingBox()));
      expect(lines[0].y + lines[0].height).toBeLessThanOrEqual(lines[1].y);
      expect(lines[1].y + lines[1].height).toBeLessThanOrEqual(lines[2].y);
      await info.attach(`home-${theme}-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await page.goto(`/join/${E2E.liveCode}`);
      await expect(page.locator('main.participant-page-shell')).toBeVisible();
      const ambient = await page.locator('.ab-base').boundingBox();
      expect(ambient.x).toBe(0);
      expect(ambient.width).toBe(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach(`participant-${theme}-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });

  test(`participant hover polish preserves selection and keyboard focus · ${theme}`, async ({ page, context }, info) => {
    requireFixture(test, E2E.liveCode, 'SPILL_E2E_SESSION_CODE');
    requireLocalMutationTarget(test);
    await context.addCookies([{ name: 'spill_theme', value: theme, url: E2E.baseURL }]);
    await page.goto(`/join/${E2E.liveCode}`);
    const nickname = await enterNicknameStep(page);
    await nickname.fill(uniqueNickname('Polish'));
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const category = page.locator('.category-choice').first();
    const border = await category.evaluate(el => getComputedStyle(el).borderColor);
    await category.hover();
    await page.waitForTimeout(250);
    expect(await category.evaluate(el => getComputedStyle(el).borderColor)).toBe(border);
    await category.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(category).toBeFocused();
    await expect(category).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
    await expect(category).toHaveAttribute('aria-pressed', 'true');
    await info.attach(`category-${theme}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}
