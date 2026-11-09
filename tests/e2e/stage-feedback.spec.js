import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const baseStage = () => ({ atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: { kind: 'prompt', text: 'Keep this projected prompt.', endsAt: null } });
let token;
async function api(path, body, status = 200, authorized = true) {
  const response = await fetch(`${worker}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(response.status, await response.clone().text()).toBe(status);
  return response.json();
}
const controls = page => page.locator('[data-stage-controls]');
const feedback = page => controls(page).locator('[data-stage-feedback]');
async function fixture(page, context, mode) {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
  let path;
  if (mode === 'standalone') {
    const item = (await api('/admin/stages', { title: 'Confirmed stage feedback' }, 201)).item;
    path = `/admin/stages/${item.id}`;
    await api(path, { action: 'configureStage', expectedRevision: item.revision, stage: baseStage() });
    await page.goto(`/admin/stage?mode=standalone&stage=${item.id}`);
  } else {
    path = `/admin/sessions/${E2E.adminSessionId}/platform`;
    const current = await api(path);
    await api(path, { action: 'configureStage', expectedRevision: current.revision, stage: baseStage() });
    await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
    await page.getByText('Stage direction · atmosphere, chapters, prompts & reflection', { exact: true }).click();
  }
  await expect(controls(page).getByLabel('Preview atmosphere')).toBeVisible();
  return { read: async () => { const result = await api(path); return mode === 'standalone' ? result.item : result; }, endpoint: mode === 'standalone' ? `**/api/stages/admin/${path.split('/').pop()}` : `**/api/platform/admin/${E2E.adminSessionId}` };
}

// The gate holds the mutation before the server sees it, so pending assertions
// cannot pass merely because a response happened to be slow.
async function gateMutation(page, endpoint, reject = false) {
  let release;
  let count = 0;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(endpoint, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    count += 1;
    await gate;
    if (reject) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture save rejected.' }) });
    return route.continue();
  });
  return { release, count: () => count };
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !process.env.SPILL_E2E_API_SECRET) throw Error('Use the isolated fixture runner.');
  token = (await api('/admin/auth/login', { password: E2E.adminPassword }, 200, false)).token;
});

for (const mode of ['standalone', 'discussion']) {
  test(`${mode}: atmosphere feedback waits for server confirmation and preserves the active state on failure`, async ({ page, context }) => {
    const { read, endpoint } = await fixture(page, context, mode);
    const ui = controls(page);
    await ui.getByLabel('Preview atmosphere').selectOption('royal');
    const success = await gateMutation(page, endpoint);
    await ui.getByRole('button', { name: 'Apply atmosphere', exact: true }).click();
    const pending = ui.getByRole('button', { name: /Applying atmosphere/ });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await expect(ui.locator('[data-active-atmosphere]')).toHaveAttribute('data-active-atmosphere', 'midnight');
    await expect(feedback(page).getByRole('status')).toHaveCount(0);
    expect((await read()).stage.atmosphere).toBe('midnight');
    success.release();
    await expect(feedback(page).getByRole('status')).toHaveText('Royal Amethyst atmosphere applied.');
    await expect(ui.locator('[data-active-atmosphere]')).toHaveAttribute('data-active-atmosphere', 'royal');
    expect(success.count()).toBe(1);
    expect((await read()).stage.atmosphere).toBe('royal');
    await page.unroute(endpoint);
    await ui.getByLabel('Preview atmosphere').selectOption('electric');
    const failure = await gateMutation(page, endpoint, true);
    await ui.getByRole('button', { name: 'Apply atmosphere', exact: true }).click();
    await expect(feedback(page).getByRole('status')).toHaveCount(0);
    failure.release();
    await expect(feedback(page).getByRole('alert')).toContainText('The stage change could not be saved.');
    await expect(page.getByRole('alert').filter({ hasText: 'Fixture save rejected.' })).toHaveCount(1);
    await expect(ui.locator('[data-active-atmosphere]')).toHaveAttribute('data-active-atmosphere', 'royal');
    expect((await read()).stage.atmosphere).toBe('royal');
    await page.waitForTimeout(5500);
    await expect(feedback(page).getByRole('alert')).toBeVisible();
    await expect(feedback(page).getByRole('status')).toHaveCount(0);
    await feedback(page).getByRole('button', { name: 'Dismiss stage error' }).click();
    await expect(feedback(page).getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'Fixture save rejected.' })).toHaveCount(0);
  });

  test(`${mode}: chapter creation, activation and disable report saved state without replacing projection`, async ({ page, context }) => {
    const { read, endpoint } = await fixture(page, context, mode);
    const ui = controls(page);
    const overlay = (await read()).stage.overlay;
    await ui.getByLabel('Chapter title').fill('Opening perspectives');
    await ui.getByRole('button', { name: 'Add chapter', exact: true }).click();
    await expect(feedback(page).getByRole('status')).toHaveText('Chapter created.');
    await expect(ui.getByLabel('Chapter title')).toHaveValue('');
    await expect(ui.locator('[data-active-chapter="true"]')).toHaveCount(0);
    const activation = await gateMutation(page, endpoint);
    await ui.getByRole('button', { name: 'Activate chapter', exact: true }).click();
    await expect(ui.getByRole('button', { name: /Activate chapter/ })).toHaveAttribute('aria-busy', 'true');
    await expect(feedback(page).getByRole('status')).toHaveCount(0);
    expect((await read()).stage.activeChapterId).toBeNull();
    activation.release();
    await expect(feedback(page).getByRole('status')).toHaveText('Chapter 1: Opening perspectives is now active.');
    await expect(ui.locator('[data-active-chapter="true"]')).toContainText('Active');
    expect((await read()).stage.overlay).toEqual(overlay);
    await page.unroute(endpoint);
    await ui.getByRole('button', { name: 'Disable chapters', exact: true }).click();
    await expect(feedback(page).getByRole('status')).toHaveText('Chapters disabled.');
    await expect(ui.locator('[data-active-chapter="true"]')).toHaveCount(0);
    expect((await read()).stage.overlay).toEqual(overlay);
    expect((await read()).stage.activeChapterId).toBeNull();
    await expect(feedback(page).getByRole('status')).toHaveCount(0, { timeout: 7000 });
  });

  test(`${mode}: metadata updates after an expired announcement preserve the restored projection`, async ({ page, context }) => {
    const { read } = await fixture(page, context, mode);
    const before = await read();
    const endpoint = mode === 'standalone' ? `/admin/stages/${before.id}` : `/admin/sessions/${E2E.adminSessionId}/platform`;
    await api(endpoint, { action: 'configureStage', expectedRevision: before.revision, stage: { ...before.stage,
      overlay: { kind: 'announcement', text: 'A brief intermission.', endsAt: new Date(Date.now() + 2000).toISOString() } } });
    const timed = await read();
    await expect.poll(async () => (await read()).stage.overlay?.kind, { timeout: 7000 }).toBe('prompt');
    await api(endpoint, { action: 'configureStage', expectedRevision: timed.revision, stage: { ...timed.stage, atmosphere: 'velvet' } });
    const restored = await read();
    expect(restored.stage.atmosphere).toBe('velvet');
    expect(restored.stage.overlay.text).toBe('Keep this projected prompt.');
  });
}
