import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

let token;
async function api(path, body) {
  const response = await fetch(process.env.SPILL_E2E_WORKER_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'X-Admin-Token': token || '', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  expect(response.status).toBe(200);
  return response.json();
}
async function axe(page, info, name) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  await info.attach(`${name}-accessibility.json`, { body: JSON.stringify({ violations: results.violations, incomplete: results.incomplete.map(rule => rule.id) }), contentType: 'application/json' });
  expect(results.violations.map(rule => ({ id: rule.id, nodes: rule.nodes.map(node => node.target) }))).toEqual([]);
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  token = (await api('/admin/auth/login', { password: E2E.adminPassword })).token;
});

test('branded participant and projector views remain accessible across mobile and projector sizes', async ({ page }, info) => {
  test.setTimeout(150000);
  let event = (await api('/admin/voting', { title: 'A conversation worth sharing', questions: [{ text: 'How can we make more room for thoughtful conversations?', options: ['Listen with curiosity and patience', 'Create a welcoming space', 'Make time to reflect together'] }] })).event;
  async function change(action, fields = {}) { event = (await api(`/admin/voting/${event.id}`, { action, expectedRevision: event.revision, ...fields })).event; }
  await change('open');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/vote/${event.code}`);
  await expect(page.locator('.voting-brand svg')).toBeVisible();
  await expect(page.locator('.stage-watermark')).toBeVisible();
  await expect(page.getByRole('heading', { name: event.questions[0].text, exact: true })).toBeVisible();
  await noOverflow(page);
  await axe(page, info, 'participant-mobile');
  await info.attach('branded-participant-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await change('settings', { settings: { resultsMode: 'live' } });
  await change('present', { questionId: event.questions[0].id, content: 'results' });
  await api(`/voting/${event.code}/vote`, { questionId: event.questions[0].id, optionId: event.questions[0].options[0].id, participant_id: crypto.randomUUID(), round: event.currentRound });
  for (const [width, height] of [[1280,720], [1366,768], [1920,1080], [2560,1440], [3840,2160]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/vote/${event.code}/stage`);
    await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total', '1');
    await expect(page.locator('.voting-projector-brand svg')).toBeVisible();
    await expect(page.locator('.stage-watermark')).toBeVisible();
    await noOverflow(page);
    const bounds = await page.evaluate(() => {
      const header = document.querySelector('.voting-projector-brand').getBoundingClientRect();
      const main = document.querySelector('.voting-projector-main');
      const box = main.getBoundingClientRect();
      return { separate: header.bottom <= box.top + 1, height: box.height, fits: main.scrollWidth <= main.clientWidth + 1 };
    });
    expect(bounds.separate).toBe(true); expect(bounds.height).toBeGreaterThan(0); expect(bounds.fits).toBe(true);
    await info.attach(`branded-projector-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  await axe(page, info, 'voting-projector');
  expect(await page.locator('.stage-watermark').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});

test('new Stage and Activity pages have accessible mobile controls and protected admin access', async ({ page, context }, info) => {
  test.setTimeout(90000);
  await page.goto('/admin/stage');
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [['stage', `/admin/stage?session=${E2E.adminSessionId}`], ['activity', '/admin/activity']]) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Stage', exact: true })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await noOverflow(page);
    await axe(page, info, name);
    await info.attach(`${name}-mobile.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
});
