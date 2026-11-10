import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
let token;
let originalStage;
const platformPath = () => `/admin/sessions/${E2E.adminSessionId}/platform`;
const emptyStage = () => ({ atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: null });
const announcement = (text = 'Welcome. Your voice belongs here.', extra = {}) => ({ kind: 'announcement', heading: 'Tonight, together', text, subtitle: 'A space to listen.', style: 'statement', showBrand: false, endsAt: null, ...extra });
async function api(path, data, authorized = true) {
  const response = await fetch(`${worker}${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': token } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json() };
}
async function state() {
  const result = await api(platformPath());
  expect(result.status).toBe(200);
  return result.body;
}
async function configure(changes) {
  const current = await state();
  const result = await api(platformPath(), { action: 'configureStage', expectedRevision: current.revision, stage: { ...current.stage, ...changes } });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body;
}
async function publicStage() {
  const result = await api(`/sessions/${E2E.liveCode}/engagement`, undefined, false);
  expect(result.status).toBe(200);
  return result.body.stage;
}
async function adminCookie(context) {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
}
async function settled(page) {
  await expect.poll(() => page.locator('[data-stage-overlay="announcement"]').evaluate(element => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return Number(style.opacity) >= .999 && Math.abs(matrix.m42) < .05 && Math.abs(matrix.m11 - 1) < .001;
  })).toBe(true);
}
async function layout(page) {
  const result = await page.locator('[data-announcement-text]').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const main = element.closest('main');
    const boundary = main.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: innerWidth, ownOverflow: element.scrollWidth > element.clientWidth + 1, mainOverflow: main.scrollWidth > main.clientWidth + 1, mainHeight: boundary.height, text: element.textContent };
  });
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.width + 1);
  expect(result.ownOverflow, JSON.stringify(result)).toBe(false);
  expect(result.mainOverflow, JSON.stringify(result)).toBe(false);
  expect(result.mainHeight).toBeGreaterThan(0);
  expect(result.text.length).toBeGreaterThan(0);
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !process.env.SPILL_E2E_API_SECRET) throw new Error('Run stage3 tests through npm run test:isolated.');
  const result = await api('/admin/auth/login', { password: E2E.adminPassword }, false);
  expect(result.status).toBe(200);
  token = result.body.token;
  originalStage = (await state()).stage;
});
test.beforeEach(async () => { await configure(emptyStage()); });
test.afterEach(async () => { await configure({ overlay: null }); await configure(emptyStage()); });
test.afterAll(async () => {
  if (!originalStage) return;
  const overlay = originalStage.overlay?.endsAt && Date.parse(originalStage.overlay.endsAt) <= Date.now() ? null : originalStage.overlay;
  await configure({ ...originalStage, overlay });
});

test('announcement composer privately previews, saves, edits, projects and restores the prior prompt', async ({ page, context }) => {
  await configure({ overlay: { kind: 'prompt', text: 'What will you carry forward?', endsAt: null } });
  await adminCookie(context);
  await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
  await page.getByText('Stage direction · atmosphere, chapters, prompts & reflection', { exact: true }).click();
  await page.getByLabel('Announcement heading (optional)', { exact: true }).fill('Event notice');
  await page.getByRole('textbox', { name: 'Announcement text', exact: true }).fill('The next conversation begins together.');
  await page.getByLabel('Supporting subtitle (optional)', { exact: true }).fill('Please keep listening.');
  await page.getByLabel('Announcement style').selectOption('notice');
  await page.getByRole('button', { name: 'Preview announcement', exact: true }).click();
  await expect(page.locator('.stage-announcement-preview [data-announcement-text]')).toHaveText('The next conversation begins together.');
  expect((await publicStage()).overlay.kind).toBe('prompt');
  await page.getByRole('button', { name: 'Save for later', exact: true }).click();
  await expect.poll(async () => (await state()).stage.announcements.length).toBe(1);
  expect((await publicStage()).announcements).toEqual([]);
  expect(JSON.stringify(await publicStage())).not.toContain('The next conversation begins together.');
  await page.getByRole('button', { name: 'Edit announcement', exact: true }).click();
  await page.getByRole('textbox', { name: 'Announcement text', exact: true }).fill('Our next conversation begins together.');
  await page.getByRole('button', { name: 'Save announcement changes', exact: true }).click();
  await expect.poll(async () => (await state()).stage.announcements[0].text).toBe('Our next conversation begins together.');
  await page.getByRole('button', { name: 'Project Now', exact: true }).click();
  await expect.poll(async () => (await publicStage()).overlay?.kind).toBe('announcement');
  await page.getByRole('button', { name: 'Hide announcement', exact: true }).click();
  await expect.poll(async () => (await publicStage()).overlay?.text).toBe('What will you carry forward?');
});

test('timed announcement restores a prior prompt on expiry and refresh without changing contribution pointers', async ({ page }) => {
  const pointer = (await state()).currentSubmissionId;
  await configure({ overlay: { kind: 'prompt', text: 'Keep this spotlight.', endsAt: null } });
  await configure({ overlay: announcement('A short intermission.', { endsAt: new Date(Date.now() + 7000).toISOString() }) });
  await page.goto(`/room/${E2E.liveCode}`);
  await expect(page.locator('[data-stage-mode]')).toHaveAttribute('data-stage-mode', 'announcement');
  await expect(page.getByLabel('Announcement time remaining')).toBeVisible();
  await expect(page.locator('[data-stage-overlay="prompt"] h1')).toHaveText('Keep this spotlight.', { timeout: 15000 });
  await page.reload();
  await expect(page.locator('[data-stage-overlay="prompt"] h1')).toHaveText('Keep this spotlight.');
  expect((await state()).currentSubmissionId).toBe(pointer);
  expect((await publicStage()).overlay.text).toBe('Keep this spotlight.');
});

test('concurrent stage edits accept one revision and preserve private saved announcements for older clients', async () => {
  const saved = { id: 'private-notice', ...announcement('Private rehearsal notes.') };
  await configure({ announcements: [saved] });
  const current = await state();
  const attempts = await Promise.all(['royal', 'celestial'].map(atmosphere => api(platformPath(), { action: 'configureStage', expectedRevision: current.revision, stage: { ...current.stage, atmosphere } })));
  expect(attempts.map(result => result.status).sort()).toEqual([200, 409]);
  const newer = await state();
  const { announcements: omitted, ...legacy } = newer.stage;
  expect(omitted).toHaveLength(1);
  const result = await api(platformPath(), { action: 'configureStage', expectedRevision: newer.revision, stage: { ...legacy, atmosphere: 'velvet' } });
  expect(result.status).toBe(200);
  expect((await state()).stage.announcements[0].text).toBe(saved.text);
  expect(JSON.stringify(await publicStage())).not.toContain(saved.text);
});

test('seven atmospheres synchronize without remounting or replaying the announcement', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await configure({ overlay: announcement() });
  await page.goto(`/room/${E2E.liveCode}`);
  await expect(page.locator('[data-announcement-text]')).toBeVisible();
  await settled(page);
  await page.locator('[data-stage-overlay="announcement"]').evaluate(element => { element.dataset.persistenceProbe = 'same-announcement'; });
  for (const atmosphere of ['midnight', 'electric', 'reflection', 'royal', 'celestial', 'velvet', 'aurora']) {
    await configure({ atmosphere });
    await expect(page.locator('.spill-stage')).toHaveAttribute('data-atmosphere', atmosphere);
    await expect(page.locator('[data-stage-overlay="announcement"]')).toHaveAttribute('data-persistence-probe', 'same-announcement');
    await settled(page);
  }
});

test('standalone announcement and voting hide discussion headers and retain their confirmed state after refresh', async ({ page }) => {
  await configure({ overlay: announcement('This message owns the stage.') });
  await page.goto(`/room/${E2E.liveCode}`);
  await expect(page.locator('.stage-topic-band')).toBeHidden();
  await expect(page.locator('.stage-status-mark')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-announcement-text]')).toHaveText('This message owns the stage.');
  const created = await api('/admin/voting', { title: 'Stage header voting fixture', questions: [{ text: 'Which direction?', options: ['Listen', 'Reflect'] }] });
  expect(created.status).toBeLessThan(300);
  let event = created.body.event;
  try {
    const opened = await api(`/admin/voting/${event.id}`, { action: 'open', expectedRevision: event.revision });
    expect(opened.status).toBe(200);
    event = opened.body.event;
    await configure({ overlay: { kind: 'voting', eventCode: event.code, text: 'Voting', endsAt: null } });
    await expect(page.locator('[data-stage-mode]')).toHaveAttribute('data-stage-mode', 'voting');
    await expect(page.locator('.stage-topic-band')).toBeHidden();
    await expect(page.locator('.stage-status-mark')).toBeHidden();
    await page.reload();
    await expect(page.locator('[data-stage-mode]')).toHaveAttribute('data-stage-mode', 'voting');
    expect((await publicStage()).overlay.eventCode).toBe(event.code);
    await configure({overlay:announcement('A brief notice over the vote.')});
    await expect(page.locator('[data-announcement-text]')).toHaveText('A brief notice over the vote.');
    await configure({overlay:null});
    await expect(page.locator('[data-stage-mode]')).toHaveAttribute('data-stage-mode','voting');
    expect((await publicStage()).overlay.eventCode).toBe(event.code);
  } finally {
    await configure({ overlay: null });
    let current = (await api(`/admin/voting/${event.id}`)).body.event;
    if(current.status==='open')current=(await api(`/admin/voting/${event.id}`,{action:'close',expectedRevision:current.revision})).body.event;
    expect((await api(`/admin/voting/${event.id}`, { action: 'delete', expectedRevision: current.revision, password: E2E.adminPassword })).status).toBe(200);
  }
});

test('long announcement projector frames remain readable and accessible in all five projector sizes', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const text = ('A thoughtful conversation gives every voice room to be heard. ').repeat(30).slice(0, 1500);
  await configure({ overlay: announcement(text, { style: 'notice', heading: 'Our shared conversation', subtitle: 'Listen with care. Take the time you need.' }) });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/room/${E2E.liveCode}`);
    await expect(page.locator('[data-announcement-text]')).toBeAttached();
    await testInfo.attach(`announcement-${width}x${height}-entrance.png`, { body: await page.screenshot(), contentType: 'image/png' });
    const frames = await page.locator('[data-stage-overlay="announcement"]').evaluate(async element => {
      const frames = [];
      for (let count = 0; count < 12; count++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rect = element.getBoundingClientRect();
        frames.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity: Number(getComputedStyle(element).opacity) });
      }
      return frames;
    });
    expect(frames.every(frame => Object.values(frame).every(Number.isFinite) && frame.width > 0 && frame.height > 0)).toBe(true);
    await settled(page);
    await layout(page);
    await expect(page.locator('[data-announcement-text]')).toHaveText(text);
    await testInfo.attach(`announcement-${width}x${height}-settled.png`, { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach(`announcement-${width}x${height}-frames.json`, { body: Buffer.from(JSON.stringify(frames)), contentType: 'application/json' });
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  await testInfo.attach('announcement-axe.json', { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: 'application/json' });
  expect(results.violations.filter(rule => ['serious', 'critical'].includes(rule.impact) || rule.id === 'color-contrast')).toEqual([]);
});

test('fine-pointer cursor is decorative, idle-hidden, fullscreen-safe and optional with reduced motion', async ({ page, context }) => {
  await adminCookie(context);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await configure({ overlay: announcement('Keep the message still.') });
  await page.goto(`/room/${E2E.liveCode}`);
  await expect(page.locator('[data-announcement-text]')).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true);
  const cursor = page.locator('[data-stage-cursor]');
  await page.mouse.move(400, 300);
  await expect(cursor).toBeVisible();
  await expect(cursor).toHaveAttribute('aria-hidden', 'true');
  expect(await cursor.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  expect(await page.locator('.spill-stage').evaluate(element => getComputedStyle(element).cursor)).not.toBe('none');
  await expect(cursor).toBeHidden({ timeout: 4000 });
  const toggle = page.getByRole('button', { name: 'Use native cursor only', exact: true });
  await toggle.hover();
  await expect(cursor).toHaveAttribute('data-interactive', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(500, 300);
  await expect(cursor).toBeHidden();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await page.getByRole('button', { name: 'Show presentation controls', exact: true }).click();
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.querySelector('.spill-stage'))).toBe(true);
  await page.mouse.move(420, 320);
  await expect(cursor).toBeVisible();
  expect(await cursor.evaluate(element => document.fullscreenElement.contains(element))).toBe(true);
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(430, 330);
  await expect(cursor).toBeHidden();
  expect(await page.locator('.stage-watermark').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  await expect(page.locator('[data-announcement-text]')).toHaveText('Keep the message still.');
});

test('touch interaction leaves cursor decoration hidden and native reading intact', async ({ browser }) => {
  await configure({overlay:announcement('A quiet stage for everyone.')});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'});
  try {
    const page=await context.newPage();await page.goto(`/room/${E2E.liveCode}`);
    await expect(page.locator('[data-announcement-text]')).toBeVisible();
    await page.locator('.spill-stage').dispatchEvent('pointermove',{pointerType:'touch',clientX:100,clientY:100});
    await expect(page.locator('[data-stage-cursor]')).toBeHidden();
    expect(await page.locator('.spill-stage').evaluate(node=>getComputedStyle(node).cursor)).not.toBe('none');
    expect(await page.getByRole('button',{name:'Use native cursor only',exact:true}).count()).toBe(0);
  } finally {await context.close();}
});
