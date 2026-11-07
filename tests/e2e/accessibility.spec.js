import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

let token;
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!process.env.SPILL_E2E_WORKER_URL || !process.env.SPILL_E2E_API_SECRET) {
    throw new Error('Run accessibility checks through npm run test:isolated.');
  }
  const response = await fetch(`${process.env.SPILL_E2E_WORKER_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: E2E.adminPassword }),
  });
  expect(response.status).toBe(200);
  token = (await response.json()).token;
});

const surfaces = [
  ['home', () => '/', page => page.getByRole('heading', { level: 1 })],
  ['join', () => `/join/${E2E.liveCode}`, page => page.getByRole('button', { name: 'Enter the Conversation', exact: true })],
  ['login', () => '/admin/login', page => page.getByLabel(/admin password/i)],
  ['moderation', () => `/admin/sessions/${E2E.adminSessionId}/live`, page => page.getByRole('heading', { name: /Projection queue/ })],
  ['qr', () => `/qr/${E2E.liveCode}`, page => page.getByRole('img', { name: /QR code to join/i })],
  ['room', () => `/room/${E2E.liveCode}`, page => page.locator('[data-presentation-phase]')],
];

for (const motion of ['reduce', 'no-preference']) {
  for (const [name, route, ready] of surfaces) {
    test(`${name} accessibility and contrast · ${motion}`, async ({ page, context }, testInfo) => {
      test.setTimeout(90000);
      if (name !== 'login') {
        await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
      }
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto(route());
      await expect(ready(page).first()).toBeVisible();
      if (name === 'room') await expect(ready(page)).toHaveAttribute('data-presentation-phase', 'settled');
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => {
        return [...document.querySelectorAll('main [style], main[style]')].every(element => {
          if (!(element instanceof HTMLElement) || element.closest('[aria-hidden="true"]')) return true;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height || rect.top >= innerHeight || rect.bottom <= 0) return true;
          return Number(getComputedStyle(element).opacity) >= 0.999;
        });
      })).toBe(true);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const compact = entries => entries.map(({ id, impact, description, helpUrl, nodes }) => ({
        id, impact, description, helpUrl,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      }));
      await testInfo.attach(`axe-${name}-${motion}.json`, {
        body: Buffer.from(JSON.stringify({
          violations: compact(results.violations),
          incomplete: compact(results.incomplete),
          passedRuleIds: results.passes.map(rule => rule.id),
        }, null, 2)), contentType: 'application/json',
      });
      const blocking = results.violations.filter(rule => ['serious', 'critical'].includes(rule.impact) || rule.id === 'color-contrast');
      expect(blocking, JSON.stringify(compact(blocking), null, 2)).toEqual([]);

      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || element === document.body) return null;
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, hidden: element.closest('[hidden], [inert], [aria-hidden="true"]') !== null };
      });
      expect(focus, 'Tab should reach an exposed interactive control').not.toBeNull();
      expect(focus.hidden).toBe(false);
      expect(focus.width).toBeGreaterThan(0);
      expect(focus.height).toBeGreaterThan(0);

      if (name === 'room' && motion === 'reduce') {
        const light = page.locator('.stage-lightfield');
        await expect(light).toHaveCSS('animation-name', 'none');
        const quote = page.locator('[data-presented-contribution]');
        if (await quote.count()) {
          const before = await quote.boundingBox();
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          expect(await quote.boundingBox()).toEqual(before);
        }
      }
    });
  }
}
