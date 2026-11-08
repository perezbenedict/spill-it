import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const secret = process.env.SPILL_E2E_API_SECRET;
const sizes = [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]];
let token;

async function api(route, method = 'GET', body) {
  const response = await fetch(worker + route, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'X-Admin-Token': token || '', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(response.status, `${method} ${route}`).toBe(200);
  return response.json();
}
const platformPath = () => `/admin/sessions/${E2E.adminSessionId}/platform`;
async function configure(stage) {
  const state = await api(platformPath());
  return api(platformPath(), 'POST', { action: 'configureStage', expectedRevision: state.revision, stage });
}
async function project(id) {
  const route = `/admin/presentation/${E2E.adminSessionId}`;
  const state = await api(route);
  return api(route, 'PUT', { current_submission_id: id, expectedRevision: state.revision });
}
async function status(value) {
  const current = (await api(`/admin/sessions/${E2E.adminSessionId}`)).session.status;
  if (current === value) return;
  if (current === 'closed') {
    await api(`/admin/sessions/${E2E.adminSessionId}/reopen`, 'POST', {});
    if (value === 'live') return;
  }
  return api(`/admin/sessions/${E2E.adminSessionId}/status`, 'POST', { status: value });
}
async function layout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const main = await page.locator('main').boundingBox();
  const controls = await page.locator('[data-presenter-controls]').boundingBox();
  expect(main.y + main.height).toBeLessThanOrEqual(controls.y + 1);
  for (const text of await page.locator('main h1, main blockquote').all()) {
    if (await text.isVisible()) expect(await text.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !secret) throw new Error('Run Room premium tests through the isolated fixture runner.');
  token = (await api('/admin/auth/login', 'POST', { password: E2E.adminPassword })).token;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`watermark remains atmospheric and reading geometry stays stable · ${reducedMotion}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/room/${E2E.liveCode}`);
    await expect(page.locator('[data-presentation-phase]')).toHaveAttribute('data-presentation-phase', 'settled');
    const watermark = page.locator('.stage-watermark');
    await expect(watermark).toBeVisible();
    expect(await watermark.evaluate(element => Boolean(element.closest('[aria-hidden="true"]')))).toBe(true);
    await expect(watermark).toHaveCSS('pointer-events', 'none');
    const opacity = Number(await watermark.evaluate(element => getComputedStyle(element).opacity));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(0.08);
    const quote = page.locator('[data-presented-contribution] blockquote');
    await expect(quote).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('[data-presented-contribution]')).toHaveCSS('opacity', '1');
    const before = await quote.boundingBox();
    const transform = await watermark.evaluate(element => getComputedStyle(element).transform);
    if (reducedMotion === 'reduce') {
      await expect(watermark).toHaveCSS('animation-name', 'none');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await watermark.evaluate(element => getComputedStyle(element).transform)).toBe(transform);
    } else {
      await expect(watermark).toHaveCSS('animation-duration', '54s');
      await expect.poll(() => watermark.evaluate(element => getComputedStyle(element).transform)).not.toBe(transform);
    }
    const after = await quote.boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(0.5);
    await layout(page);
    await testInfo.attach(`watermark-${reducedMotion}`, { body: await page.screenshot({ animations: 'allow' }), contentType: 'image/png' });
  });
}

test('fullscreen preserves the stage, watermark and projector controls', async ({ page }) => {
  await page.goto(`/room/${E2E.liveCode}`);
  const screen = page.locator('[data-presentation-phase]');
  await expect(screen).toHaveAttribute('data-presentation-phase', 'settled');
  const pointer = await screen.getAttribute('data-current-contribution-id');
  await page.getByRole('button', { name: 'Show presentation controls', exact: true }).click();
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.querySelector('[data-presentation-phase]'))).toBe(true);
  await expect(page.locator('.stage-watermark')).toBeVisible();
  await expect(page.locator('[data-presented-contribution]')).toBeVisible();
  await layout(page);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(screen).toHaveAttribute('data-current-contribution-id', pointer);
});

test('topic updates in place without replaying the projected contribution', async ({ page }) => {
  await page.goto(`/room/${E2E.liveCode}`);
  const screen = page.locator('[data-presentation-phase]');
  await expect(screen).toHaveAttribute('data-presentation-phase', 'settled');
  const version = await screen.getAttribute('data-presentation-transition-version');
  const pointer = await screen.getAttribute('data-current-contribution-id');
  await page.route(`**/api/room/${E2E.liveCode}`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, topic: 'A new question for this conversation' } });
  });
  await expect(page.getByText('A new question for this conversation', { exact: true }).first()).toBeVisible();
  await expect(screen).toHaveAttribute('data-current-contribution-id', pointer);
  await expect(screen).toHaveAttribute('data-presentation-transition-version', version);
});

for (const [width, height] of sizes) {
  test(`premium room modes retain hierarchy at ${width}×${height}`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    const original = (await api(platformPath())).stage;
    const pointer = (await api(`/admin/presentation/${E2E.adminSessionId}`)).currentId;
    const stage = { ...original, chapters: [{ id: 'premium-round', title: 'A different perspective' }], activeChapterId: 'premium-round', overlay: null };
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      await layout(page);
      await testInfo.attach(`${name}-${width}x${height}`, { body: await page.screenshot({ animations: 'allow' }), contentType: 'image/png' });
    };
    try {
      await status('live');
      await configure(stage);
      await project(E2E.projectionIds[0]);
      await page.goto(`/room/${E2E.liveCode}`);
      await expect(page.locator('[data-presented-contribution]')).toBeVisible();
      await expect(page.locator('[data-active-chapter]')).toHaveText('A different perspective');
      await expect(page.getByText(E2E.topic, { exact: true }).first()).toBeVisible();
      await capture('contribution');
      await project(null);
      await expect(page.getByText('Waiting for the next thought…', { exact: true })).toBeVisible();
      await capture('waiting');
      await configure({ ...stage, overlay: { kind: 'prompt', text: 'What deserves more room in this conversation?', endsAt: null } });
      await expect(page.locator('[data-stage-overlay="prompt"] h1')).toHaveText('What deserves more room in this conversation?');
      await capture('spotlight');
      await configure({ ...stage, overlay: { kind: 'reflection', text: 'Let that thought settle before the next voice.', endsAt: null } });
      await expect(page.locator('[data-stage-overlay="reflection"] h1')).toHaveText('Let that thought settle before the next voice.');
      await capture('reflection');
      await configure(stage);
      await status('paused');
      await expect(page.locator('[data-session-status]')).toHaveAttribute('data-session-status', 'paused');
      await capture('paused');
      await status('closed');
      await expect(page.locator('[data-session-status]')).toHaveAttribute('data-session-status', 'closed');
      await expect(page.getByText("That's a wrap.", { exact: true })).toBeVisible();
      await capture('closed');
    } finally {
      await status('live');
      await configure(original);
      await project(pointer);
    }
  });
}
