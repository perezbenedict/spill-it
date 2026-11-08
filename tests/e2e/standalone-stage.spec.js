import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const baseStage = { atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: null };
let token;
async function api(path, body, status = path === '/admin/stages' && body !== undefined ? 201 : 200, admin = true) {
  const response = await fetch(`${worker}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(admin ? { 'X-Admin-Token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  expect(response.status, await response.clone().text()).toBe(status);
  return response.json();
}
const state = id => api(`/admin/stages/${id}`).then(body => body.item);
async function change(id, payload) {
  const current = await state(id);
  return api(`/admin/stages/${id}`, { expectedRevision: current.revision, ...payload }).then(body => body.item);
}
async function authorize(context) {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
}
async function open(page, item) {
  await page.goto(`/admin/stage?mode=standalone&stage=${item.id}`);
  await expect(page.getByLabel('Current stage mode')).toBeVisible();
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !process.env.SPILL_E2E_API_SECRET) throw Error('Use the isolated fixture runner.');
  token = (await api('/admin/auth/login', { password: E2E.adminPassword }, 200, false)).token;
});

test('standalone authorization, optional title persistence and discussion isolation', async ({ page, context }) => {
  await page.goto('/admin/stage?mode=standalone');
  await page.waitForURL(url => url.pathname === '/admin/login');
  await authorize(context);
  const before = await api('/admin/sessions?limit=100');
  const discussion = await api(`/admin/sessions/${E2E.adminSessionId}/platform`);
  const discussionRequests = [];
  page.on('request', request => {
    if (/\/api\/(platform|sessions|submissions)(\/|\?)/.test(request.url())) discussionRequests.push(request.url());
  });
  await page.goto('/admin/stage?mode=standalone');
  await page.getByRole('button', { name: 'Create standalone stage', exact: true }).click();
  await expect(page).toHaveURL(/mode=standalone&stage=[0-9a-f-]+/);
  const id = new URL(page.url()).searchParams.get('stage');
  const created = await state(id);
  expect(created.title).toBe('');
  expect(created.stage).toMatchObject(baseStage);
  await page.reload();
  await expect(page.getByLabel('Current stage mode')).toBeVisible();
  expect((await state(id)).code).toBe(created.code);
  await page.goto('/admin/stage?mode=standalone');
  await expect(page.getByRole('link', { name: `Untitled stage · ${created.code}`, exact: true })).toBeVisible();
  expect(discussionRequests).toEqual([]);
  expect((await api('/admin/sessions?limit=100')).total).toBe(before.total);
  expect(await api(`/admin/sessions/${E2E.adminSessionId}/platform`)).toEqual(discussion);
  const other = (await api('/admin/stages', { title: 'Separate stage' })).item;
  await change(id, { action: 'configureStage', stage: { ...baseStage, overlay: { kind: 'prompt', text: 'First stage only', endsAt: null } } });
  expect((await state(other.id)).stage).toMatchObject(baseStage);
});

test('shared stage controls persist, preserve local drafts, restore previous screen and clear history', async ({ page, context }) => {
  await authorize(context);
  const item = (await api('/admin/stages', { title: 'Standalone controls fixture' })).item;
  await open(page, item);
  await page.getByLabel('New prompt', { exact: true }).fill('A standalone perspective.');
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
  await page.getByRole('button', { name: 'Project prompt', exact: true }).click();
  const projector = await context.newPage();
  await projector.goto(`/stage/${item.code}`);
  await expect(projector.getByRole('link', { name: 'Stage controls', exact: true })).toHaveAttribute('href', '/admin/stage?mode=standalone');
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toContainText('A standalone perspective.');
  await page.getByLabel('Preview atmosphere').selectOption('aurora');
  await page.getByRole('button', { name: 'Apply atmosphere', exact: true }).click();
  await expect(projector.locator('.standalone-projector')).toHaveAttribute('data-atmosphere', 'aurora');
  await page.getByLabel('Edit saved prompt').fill('A revised standalone perspective.');
  await page.getByLabel('Edit saved prompt').blur();
  await expect.poll(async () => (await state(item.id)).stage.prompts[0].text).toBe('A revised standalone perspective.');
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toContainText('A standalone perspective.');
  await page.getByRole('textbox', { name: 'Announcement text', exact: true }).fill('Private saved announcement.');
  await page.getByRole('button', { name: 'Save for later', exact: true }).click();
  await page.getByRole('button', { name: 'Project Now', exact: true }).click();
  await expect(projector.locator('[data-stage-overlay="announcement"]')).toContainText('Private saved announcement.');
  await page.getByRole('button', { name: 'Hide announcement', exact: true }).click();
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toBeVisible();
  await page.getByLabel('Reflection message', { exact: true }).fill('Pause here.');
  await page.getByRole('button', { name: 'Begin reflection', exact: true }).click();
  await expect(projector.locator('[data-stage-overlay="reflection"]')).toContainText('Pause here.');
  await page.getByRole('button', { name: 'Return to previous stage content', exact: true }).click();
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toBeVisible();
  await page.getByLabel('Duration in seconds (optional)', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Begin reflection', exact: true }).click();
  await expect(projector.locator('[data-stage-overlay="reflection"]')).toContainText('Pause here.');
  await expect(projector.getByRole('timer', { name: 'Reflection time remaining' })).toHaveText(/0:0[0-8]/);
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toBeVisible({ timeout: 15000 });
  await page.getByRole('textbox', { name: 'Announcement text', exact: true }).fill('Keep my unsaved draft.');
  await page.getByRole('button', { name: 'Refresh stage preview', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Announcement text', exact: true })).toHaveValue('Keep my unsaved draft.');
  await page.reload();
  await expect(page.getByLabel('Edit saved prompt')).toHaveValue('A revised standalone perspective.');
  await projector.reload();
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toBeVisible();
  await page.getByRole('button', { name: 'Clear stage', exact: true }).click();
  await expect.poll(async () => (await state(item.id)).stage.overlay).toBeNull();
  const cleared = (await state(item.id)).stage;
  expect(cleared.atmosphere).toBe('aurora');
  expect(cleared.prompts[0].text).toBe('A revised standalone perspective.');
  expect(cleared.announcements[0].text).toBe('Private saved announcement.');
  expect(cleared.returnOverlay || null).toBeNull();
  await expect(projector.locator('[data-stage-overlay]')).toHaveCount(0);
  await projector.close();
});

test('stale stage writes conflict, refresh latest state and retain unsaved controls', async ({ page, context }) => {
  await authorize(context);
  const item = (await api('/admin/stages', {})).item;
  await open(page, item);
  await page.getByLabel('Reflection message', { exact: true }).fill('Keep this local reflection.');
  const baseline = await state(item.id);
  // Freeze reads until the stale mutation is submitted; conflict recovery reads current state.
  let stale = true;
  await page.route(`**/api/stages/admin/${item.id}`, route => {
    if (route.request().method() === 'GET' && stale) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ item: baseline }) });
    if (route.request().method() === 'POST') stale = false;
    return route.continue();
  });
  await change(item.id, { action: 'configureStage', stage: { ...baseStage, overlay: { kind: 'prompt', text: 'Another operator owns the screen.', endsAt: null } } });
  await page.getByRole('button', { name: 'Begin reflection', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This stage changed.' })).toContainText('This stage changed.');
  await expect(page.getByLabel('Reflection message', { exact: true })).toHaveValue('Keep this local reflection.');
  await expect(page.locator('[data-stage-preview-mode]')).toHaveAttribute('data-stage-preview-mode', 'prompt');
  expect((await state(item.id)).stage.overlay.text).toBe('Another operator owns the screen.');
  await api(`/admin/stages/${item.id}`, { action: 'clearStage', expectedRevision: baseline.revision }, 409);
  expect((await state(item.id)).stage.overlay.text).toBe('Another operator owns the screen.');
  const current = await state(item.id);
  const auditBefore = (await api(`/admin/activity?category=stage&q=${item.id}`)).items.length;
  const simultaneous = await Promise.all(['First operator', 'Second operator'].map(text => fetch(`${worker}/admin/stages/${item.id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'X-Admin-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'configureStage', expectedRevision: current.revision, stage: { ...current.stage, overlay: { kind: 'prompt', text, endsAt: null } } }),
  })));
  expect(simultaneous.map(response => response.status).sort()).toEqual([200, 409]);
  const winner = await simultaneous.find(response => response.status === 200).json();
  expect((await state(item.id)).stage.overlay.text).toBe(winner.item.stage.overlay.text);
  expect((await api(`/admin/activity?category=stage&q=${item.id}`)).items.length).toBe(auditBefore + 1);
});

test('public stage excludes saved drafts, private metadata and unrelated discussion content', async () => {
  const item = (await api('/admin/stages', { title: 'Private moderator title' })).item;
  await change(item.id, { action: 'configureStage', stage: { ...baseStage, prompts: [{ id: crypto.randomUUID(), text: 'PRIVATE_PROMPT' }], announcements: [{ id: crypto.randomUUID(), heading: '', text: 'PRIVATE_ANNOUNCEMENT', subtitle: '', style: 'statement', showBrand: false }], overlay: { kind: 'prompt', text: 'Public screen text.', endsAt: null } } });
  const publicBody = await api(`/stages/${item.code}`, undefined, 200, false);
  const serialized = JSON.stringify(publicBody);
  expect(serialized).toContain('Public screen text.');
  for (const secret of ['PRIVATE_PROMPT', 'PRIVATE_ANNOUNCEMENT', E2E.adminSessionId]) expect(serialized).not.toContain(secret);
  expect(serialized).not.toMatch(/"(?:announcements|prompts|resumeOverlay|returnOverlay|submissions|queue|createdAt|updatedAt)":/);
  await api(`/admin/stages/${item.id}`, undefined, 401, false);
});

test('attaching an existing voting event follows original controls and restores the prior stage', async ({ page, context }) => {
  await authorize(context);
  const item = (await api('/admin/stages', { title: 'Voting attachment fixture' })).item;
  const event = (await api('/admin/voting', { title: 'Standalone voting fixture', questions: [{ text: 'Which perspective?', options: ['First', 'Second'] }] })).event;
  await change(item.id, { action: 'configureStage', stage: { ...baseStage, overlay: { kind: 'prompt', text: 'Return here after voting.', endsAt: null } } });
  await open(page, item);
  await page.getByLabel('Voting event').selectOption(event.id);
  await expect(page.getByRole('link', { name: 'Open voting presentation controls', exact: true })).toHaveAttribute('href', `/admin/voting/${event.id}`);
  await expect(page.getByRole('button', { name: 'Project voting event', exact: true })).toBeDisabled();
  await page.getByText('Voting presentation controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Open voting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Project voting event', exact: true })).toBeEnabled({ timeout: 12000 });
  const before = (await api(`/admin/voting/${event.id}`)).event;
  await page.getByRole('button', { name: 'Project voting event', exact: true }).click();
  await expect.poll(async () => (await state(item.id)).stage.overlay.eventCode).toBe(event.code);
  expect((await api(`/admin/voting/${event.id}`)).event).toEqual(before);
  await expect(page.getByLabel('Preview / selected question')).toBeVisible();
  await page.getByRole('button', { name: 'Project Voting QR', exact: true }).click();
  const projector = await context.newPage();
  await projector.goto(`/stage/${item.code}`);
  await expect(projector.getByText('Which perspective?', { exact: true })).toBeVisible();
  expect((await api(`/admin/voting/${event.id}`)).event.presentation.content).toBe('qr');
  await page.getByRole('button', { name: 'Return to previous stage content', exact: true }).click();
  await expect.poll(async () => (await state(item.id)).stage.overlay.text).toBe('Return here after voting.');
  await expect(projector.locator('[data-stage-overlay="prompt"]')).toContainText('Return here after voting.');
  await projector.close();
});
