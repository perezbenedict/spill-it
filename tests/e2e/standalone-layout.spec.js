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
  expect(response.ok, await response.clone().text()).toBe(true);
  return response.json();
}
async function create() { return (await api('/admin/stages', { title: '' })).item; }
async function project(item, overlay, fields = {}) {
  const current = (await api(`/admin/stages/${item.id}`)).item;
  return (await api(`/admin/stages/${item.id}`, { action: 'configureStage', expectedRevision: current.revision, stage: { ...current.stage, ...fields, overlay } })).item;
}
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  token = (await api('/admin/auth/login', { password: E2E.adminPassword })).token;
});

test('standalone long content, projector layouts, mobile accessibility and reduced motion', async ({ page, context }, info) => {
  test.setTimeout(120000);
  const item = await create();
  const text = 'Make room for a thoughtful perspective. '.repeat(50).slice(0, 1500);
  await project(item, { kind: 'announcement', style: 'notice', heading: 'An invitation to pause', text, subtitle: 'A moment for the whole room.', endsAt: null });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[320,740], [1280,720], [1366,768], [1920,1080], [2560,1440], [3840,2160]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/stage/${item.code}`);
    await expect(page.locator('[data-announcement-text]')).toHaveText(text);
    const bounds = await page.evaluate(() => {
      const main = document.querySelector('main');
      const box = main.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        header: document.querySelector('header').getBoundingClientRect().bottom <= box.top + 1,
        footer: box.bottom <= document.querySelector('footer').getBoundingClientRect().top + 1,
        contentFits: main.scrollWidth <= main.clientWidth + 1,
      };
    });
    expect(bounds).toEqual({ overflow: false, header: true, footer: true, contentFits: true });
    expect(await page.locator('.stage-watermark').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    if (width === 320 || width === 1920) {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map(rule => rule.id)).toEqual([]);
      await info.attach(`standalone-projector-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  }
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/stage?mode=standalone&stage=${item.id}`);
  await expect(page.getByLabel('Announcement text', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations.map(rule => rule.id)).toEqual([]);
  await info.attach('standalone-admin-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('standalone projector recovers, ignores old revisions, stays stable on polls and supports fullscreen', async ({ page }) => {
  test.setTimeout(60000);
  const item = await create();
  await project(item, { kind: 'prompt', text: 'First confirmed prompt', endsAt: null });
  await page.goto(`/stage/${item.code}`);
  await expect(page.locator('[data-stage-overlay="prompt"]')).toHaveText(/First confirmed prompt/);
  const old = await (await page.request.get(`/api/stages/public/${item.code}`)).json();
  const overlay = page.locator('[data-stage-overlay="prompt"]');
  await overlay.evaluate(el => { el.dataset.regressionIdentity = 'same-node'; });
  await page.waitForResponse(response => response.url().endsWith(`/api/stages/public/${item.code}`) && response.ok());
  await expect(overlay).toHaveAttribute('data-regression-identity', 'same-node');
  await page.route(`**/api/stages/public/${item.code}`, route => route.abort());
  await expect(page.getByText('Reconnecting…', { exact: true })).toBeVisible({ timeout: 12000 });
  await project(item, { kind: 'prompt', text: 'Recovered latest prompt', endsAt: null });
  await page.unroute(`**/api/stages/public/${item.code}`);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(overlay).toContainText('Recovered latest prompt', { timeout: 12000 });
  await page.route(`**/api/stages/public/${item.code}`, route => route.fulfill({ json: old }));
  const staleReply = page.waitForResponse(response => response.url().endsWith(`/api/stages/public/${item.code}`) && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await staleReply;
  await expect(overlay).toContainText('Recovered latest prompt');
  await page.unroute(`**/api/stages/public/${item.code}`);
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await page.evaluate(() => { const input = document.createElement('input'); input.setAttribute('aria-label', 'Shortcut safety fixture'); document.body.append(input); input.focus(); });
  await page.keyboard.press('f');
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
});

test('standalone voting uses authoritative live totals and protects hidden final reveals', async ({ page }) => {
  test.setTimeout(60000);
  const item = await create();
  let event = (await api('/admin/voting', { title: 'Standalone results fixture', questions: [{ text: 'A shared decision?', options: ['Yes', 'No'] }] })).event;
  async function change(action, fields = {}) {
    event = (await api(`/admin/voting/${event.id}`, { action, expectedRevision: event.revision, ...fields })).event;
  }
  await change('open');
  await change('settings', { settings: { resultsMode: 'live' } });
  await change('present', { questionId: event.questions[0].id, content: 'results' });
  await project(item, { kind: 'voting', eventCode: event.code, endsAt: null });
  await page.goto(`/stage/${item.code}`);
  for (let index = 0; index < 2; index++) await api(`/voting/${event.code}/vote`, { questionId: event.questions[0].id, optionId: event.questions[0].options[index].id, participant_id: crypto.randomUUID(), round: event.currentRound });
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total', '2', { timeout: 12000 });
  await change('settings', { settings: { resultsMode: 'hidden' } });
  await expect(page.locator('[data-vote-total]')).toHaveCount(0);
  const hidden = (await api(`/voting/${event.code}`)).event;
  expect(hidden.questions[0].totalVotes).toBeUndefined();
  await page.reload();
  await expect(page.locator('.voting-hidden-notice')).toBeVisible();
  await change('close');
  await change('present', { questionId: event.questions[0].id, content: 'results', reveal: true });
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total', '2', { timeout: 12000 });
  const final = (await api(`/voting/${event.code}`)).event.questions[0];
  expect(final.outcome).toBe('tied');
});
