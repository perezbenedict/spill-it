import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
let token;
const baseStage = { atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: null };
const platformPath = () => `/admin/sessions/${E2E.adminSessionId}/platform`;
async function api(path, body, authorized = true) {
  const response = await fetch(worker + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}
async function state() { return api(platformPath()); }
async function mutate(action, fields = {}) {
  const current = await state();
  return api(platformPath(), { action, expectedRevision: current.revision, ...fields });
}
async function authorize(context) {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
}
const shared = page => page.locator(`[data-shared-stage-controls="${E2E.adminSessionId}"]`);
async function centre(page) {
  await page.goto(`/admin/stage?session=${E2E.adminSessionId}`);
  await expect(page.locator('[data-stage-session]')).toHaveAttribute('data-stage-session', E2E.adminSessionId);
  await expect(shared(page).getByLabel('Current stage mode')).toBeVisible();
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !process.env.SPILL_E2E_API_SECRET) throw Error('Use the isolated fixture runner.');
  token = (await api('/admin/auth/login', { password: E2E.adminPassword }, false)).token;
});
test.beforeEach(async () => {
  await mutate('clearProjection');
  await mutate('clearQueue');
  await mutate('configureStage', { stage: baseStage });
});

test('Stage Control Centre requires authorization and rejects an invalid explicit target', async ({ page, context }) => {
  await page.goto('/admin/stage');
  await page.waitForURL(url => url.pathname === '/admin/login');
  await authorize(context);
  const response = await page.goto('/admin/stage?session=not-a-session');
  expect(response.status()).toBe(404);
  await expect(page.locator('[data-shared-stage-controls]')).toHaveCount(0);
});

test('original session controls and the new centre share prompts, announcements, reflections, atmospheres and queue', async ({ page, context }, info) => {
  test.setTimeout(180000);
  await authorize(context);
  const original = await context.newPage();
  await original.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
  await original.getByText('Stage direction · atmosphere, chapters, prompts & reflection', { exact: true }).click();
  await centre(page);
  await original.getByLabel('New prompt', { exact: true }).fill('A perspective from the original workflow.');
  await original.getByRole('button', { name: 'Save prompt', exact: true }).click();
  await original.getByRole('button', { name: 'Project prompt', exact: true }).click();
  await expect(page.locator('[data-stage-preview-mode]')).toHaveAttribute('data-stage-preview-mode', 'prompt');
  await page.getByRole('button', { name: 'Spotlight Prompt', exact: true }).click();
  await expect(shared(page).getByLabel('Edit saved prompt')).toHaveValue('A perspective from the original workflow.');
  await page.getByRole('button', { name: 'Stage Announcement', exact: true }).click();
  await shared(page).getByRole('textbox', { name: 'Announcement text', exact: true }).fill('A notice from the centre.');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(shared(page).getByRole('textbox', { name: 'Announcement text', exact: true })).toHaveValue('A notice from the centre.');
  await expect(shared(page).getByRole('textbox', { name: 'Announcement heading (optional)', exact: true })).toHaveValue('');
  await shared(page).getByRole('button', { name: 'Save for later', exact: true }).click();
  await shared(page).getByRole('button', { name: 'Project Now', exact: true }).click();
  await expect(original.getByRole('button', { name: 'Edit announcement', exact: true })).toBeVisible();
  await expect(original.getByRole('button', { name: 'Hide announcement', exact: true })).toBeEnabled();
  await original.getByRole('button', { name: 'Hide announcement', exact: true }).click();
  await expect(page.locator('[data-stage-preview-mode]')).toHaveAttribute('data-stage-preview-mode', 'prompt');
  await original.getByLabel('Reflection message', { exact: true }).fill('Pause and consider the conversation.');
  await original.getByLabel('Duration in seconds (optional)', { exact: true }).fill('20');
  await original.getByRole('button', { name: 'Begin reflection', exact: true }).click();
  await expect(page.locator('[data-stage-preview-mode]')).toHaveAttribute('data-stage-preview-mode', 'reflection');
  await page.getByRole('button', { name: 'Visual Atmosphere', exact: true }).click();
  await shared(page).getByLabel('Preview atmosphere').selectOption('royal');
  await shared(page).getByRole('button', { name: 'Apply atmosphere', exact: true }).click();
  await expect(original.getByText('Active: Royal Amethyst', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected stage preview' })).toHaveAttribute('data-atmosphere', 'royal');
  await original.getByText('Add approved contributions from this page', { exact: true }).click();
  await original.getByRole('button', { name: 'Queue contribution by Fixture 1', exact: true }).click();
  await expect.poll(async () => (await state()).queue[0]?.id).toBe(E2E.projectionIds[1]);
  await page.getByRole('button', { name: 'Projection Queue', exact: true }).click();
  await expect(shared(page).getByText('Selected second contribution', { exact: true })).toBeVisible();
  await original.getByRole('button', { name: 'Project next', exact: true }).click();
  await expect(page.locator('[data-stage-preview-mode]')).toHaveAttribute('data-stage-preview-mode', 'contribution');
  expect((await state()).currentSubmissionId).toBe(E2E.projectionIds[1]);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.map(rule => ({ id: rule.id, targets: rule.nodes.map(node => node.target) }))).toEqual([]);
  await info.attach('stage-control-centre.png', { body: await page.screenshot(), contentType: 'image/png' });
  await original.close();
});

test('explicit session switching resets local drafts without projecting or moving saved records', async ({ page, context }) => {
  await authorize(context);
  const other = (await api(`/admin/sessions?public_code=${E2E.secondCode}`)).items[0];
  const before = await state();
  await centre(page);
  await page.getByRole('button', { name: 'Stage Announcement', exact: true }).click();
  await shared(page).getByRole('textbox', { name: 'Announcement text', exact: true }).fill('An unsaved local draft.');
  await page.getByLabel('Select discussion for Stage').selectOption(other.id);
  await page.getByRole('button', { name: 'Open stage controls', exact: true }).click();
  await expect(page.locator('[data-stage-session]')).toHaveAttribute('data-stage-session', other.id);
  await page.getByRole('button', { name: 'Stage Announcement', exact: true }).click();
  await expect(page.locator(`[data-shared-stage-controls="${other.id}"]`).getByRole('textbox', { name: 'Announcement text', exact: true })).toHaveValue('');
  const after = await state();
  expect(after.revision).toBe(before.revision);
  expect(after.stage).toEqual(before.stage);
});

test('a stale centre action cannot overwrite a moderator using the original workflow', async ({ page, context }) => {
  await authorize(context);
  await centre(page);
  const baseline = await state();
  await page.route(`**/api/platform/admin/${E2E.adminSessionId}`, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(baseline) });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Reflection Moment', exact: true }).click();
  await shared(page).getByLabel('Reflection message', { exact: true }).fill('Keep this unsaved reflection.');
  await mutate('configureStage', { stage: { ...baseline.stage, overlay: { kind: 'prompt', text: 'A moderator projected this.', endsAt: null } } });
  await shared(page).getByRole('button', { name: 'Begin reflection', exact: true }).click();
  await expect(shared(page).getByRole('alert').filter({ hasText: 'This discussion changed.' })).toContainText('This discussion changed.');
  await expect(shared(page).getByLabel('Reflection message', { exact: true })).toHaveValue('Keep this unsaved reflection.');
  expect((await state()).stage.overlay.text).toBe('A moderator projected this.');
  await page.unroute(`**/api/platform/admin/${E2E.adminSessionId}`);
});

test('voting surfaces use the real emblem and preserve branded waiting and result states', async ({ page }, info) => {
  const event = (await api('/admin/voting', { title: 'Branded voting fixture', questions: [{ text: 'What gives a conversation meaning?', options: ['Listening', 'Kindness'] }] })).event;
  let current = (await api(`/admin/voting/${event.id}`, { action: 'open', expectedRevision: event.revision })).event;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/vote/${event.code}/stage`);
  await expect(page.locator('[data-voting-brand="projector"] .voting-brand-emblem svg')).toBeVisible();
  await expect(page.locator('.voting-projector-brand')).toContainText('Round 1');
  await expect(page.locator('.stage-watermark')).toHaveCSS('animation-duration', '54s');
  current = (await api(`/admin/voting/${event.id}`, { action: 'settings', expectedRevision: current.revision, settings: { resultsMode: 'live' } })).event;
  await api(`/admin/voting/${event.id}`, { action: 'present', expectedRevision: current.revision, questionId: event.questions[0].id, content: 'results' });
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total', '0');
  await expect(page.locator('[data-voting-brand="projector"]')).toBeVisible();
  await info.attach('branded-voting-room.png', { body: await page.screenshot(), contentType: 'image/png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.stage-watermark')).toHaveCSS('animation-name', 'none');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/vote/${event.code}`);
  await expect(page.locator('.voting-brand .voting-brand-emblem svg')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What gives a conversation meaning?', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('branded-mobile-voting.png', { body: await page.screenshot(), contentType: 'image/png' });
});

test('flame cursor keeps native precision and yields to text editing and selection', async ({ page, context }) => {
  await authorize(context);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/room/${E2E.liveCode}`);
  await expect(page.locator('.spill-stage')).toBeVisible();
  await page.mouse.move(400, 300);
  const cursor = page.locator('[data-stage-cursor]');
  await expect(cursor).toBeVisible();
  await expect(cursor.locator('.stage-cursor-flame')).toBeVisible();
  await expect(cursor.locator('.stage-cursor-ring')).toHaveCount(0);
  await expect.poll(() => cursor.evaluate(element => ({ x: new DOMMatrixReadOnly(getComputedStyle(element).transform).m41, y: new DOMMatrixReadOnly(getComputedStyle(element).transform).m42 }))).toEqual({ x: 400, y: 300 });
  expect(await page.locator('.spill-stage').evaluate(element => getComputedStyle(element).cursor)).not.toBe('none');
  await page.locator('.spill-stage').evaluate(element => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Cursor caret fixture');
    input.style.cssText = 'position:absolute;left:20px;top:160px;z-index:100';
    element.append(input);
  });
  await page.getByRole('textbox', { name: 'Cursor caret fixture' }).hover();
  await expect(cursor).toBeHidden();
  await page.locator('.stage-topic-title').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); document.getSelection().removeAllRanges(); document.getSelection().addRange(range); });
  await page.mouse.move(450, 300);
  await expect(cursor).toBeHidden();
  await page.evaluate(() => document.getSelection().removeAllRanges());
  await page.mouse.move(460, 310);
  await expect(cursor).toBeVisible();
  await expect(cursor).toBeHidden({ timeout: 4000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(470, 320);
  await expect(cursor).toBeHidden();
});
