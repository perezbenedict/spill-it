import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
let token;
const createdIds = [];
async function api(path, method = 'GET', body, status = 200, authenticated = true) {
  const response = await fetch(worker + path, { method, headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(authenticated ? { 'X-Admin-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  expect(response.status, await response.clone().text()).toBe(status);
  return response.json();
}
const current = id => api(`/admin/submissions/${id}`).then(body => body.row);
async function contribution() {
  const suffix = crypto.randomUUID();
  const content = `Dashboard revision regression ${suffix}`;
  await api('/submissions', 'POST', { sessionCode: E2E.liveCode, participant_id: crypto.randomUUID(), request_id: crypto.randomUUID(), nickname: `Review${suffix.slice(0, 8)}`, category: 'question', content }, 200, false);
  const { items } = await api(`/admin/submissions?session_id=${E2E.adminSessionId}&status=pending&limit=200`);
  const row = items.find(item => item.content === content);
  expect(row).toBeTruthy();
  createdIds.push(row.id);
  return row;
}
async function authorize(context) { await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]); }
const review = page => page.getByRole('region', { name: /needs review/i });
const card = (page, content) => review(page).getByRole('listitem').filter({ hasText: content });

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !process.env.SPILL_E2E_API_SECRET || !E2E.adminSessionId) throw Error('Use the isolated fixture runner.');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(worker).hostname);
  token = (await api('/admin/auth/login', 'POST', { password: E2E.adminPassword }, 200, false)).token;
});
test.beforeEach(async () => {
  for (const id of createdIds) {
    const row = await current(id);
    if (row.moderation_status === 'pending') await api(`/admin/submissions/${id}`, 'PATCH', { expectedRevision: row.revision, moderation_status: 'hidden' });
  }
});

test('dashboard Approve and Reject use current revisions and preserve contribution records', async ({ page, context }) => {
  await authorize(context);
  const approved = await contribution();
  const rejected = await contribution();
  await page.goto('/admin');
  await expect(card(page, approved.content)).toBeVisible();
  await card(page, approved.content).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card(page, approved.content)).toHaveCount(0);
  await expect.poll(async () => (await current(approved.id)).moderation_status).toBe('approved');
  await card(page, rejected.content).getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(card(page, rejected.content)).toHaveCount(0);
  const a = await current(approved.id), b = await current(rejected.id);
  expect(a.content).toBe(approved.content); expect(b.content).toBe(rejected.content);
  expect(a.revision).toBe(approved.revision + 1); expect(b.revision).toBe(rejected.revision + 1);
  expect(b.moderation_status).toBe('hidden');
});

test('missing and stale worker revisions never change moderation state', async () => {
  const row = await contribution();
  const before = await current(row.id);
  await api(`/admin/submissions/${row.id}`, 'PATCH', { moderation_status: 'approved' }, 400);
  expect(await current(row.id)).toEqual(before);
  const changed = (await api(`/admin/submissions/${row.id}`, 'PATCH', { expectedRevision: row.revision, is_pinned: true })).row;
  await api(`/admin/submissions/${row.id}`, 'PATCH', { expectedRevision: row.revision, moderation_status: 'hidden' }, 409);
  expect(await current(row.id)).toEqual(changed);
  expect(changed.moderation_status).toBe('pending');
});

test('dashboard stale revision refreshes safely before an explicit moderation retry', async ({ page, context }) => {
  await authorize(context);
  const row = await contribution();
  await page.goto('/admin');
  await expect(card(page, row.content)).toBeVisible();
  const changed = (await api(`/admin/submissions/${row.id}`, 'PATCH', { expectedRevision: row.revision, is_pinned: true })).row;
  const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/admin' && new URL(response.url()).searchParams.has('_rsc'));
  await card(page, row.content).getByRole('button', { name: 'Approve', exact: true }).click();
  await refreshed;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(review(page).getByRole('alert')).toContainText(/another moderator|changed|refresh/i);
  expect((await current(row.id)).moderation_status).toBe('pending');
  await expect(card(page, row.content).getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
  await card(page, row.content).getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card(page, row.content)).toHaveCount(0);
  const final = await current(row.id);
  expect(final.moderation_status).toBe('approved'); expect(final.revision).toBe(changed.revision + 1);
  expect(final.is_pinned).toBe(changed.is_pinned);
});

test('full moderation feed still approves and rejects with revision protection', async ({ page, context }) => {
  await authorize(context);
  const approved = await contribution(), rejected = await contribution();
  await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
  const feedRow = content => page.locator('article').filter({ hasText: content });
  await feedRow(approved.content).getByRole('button', { name: 'Approve submission', exact: true }).click();
  await expect.poll(async () => (await current(approved.id)).moderation_status).toBe('approved');
  await feedRow(rejected.content).getByRole('button', { name: 'Reject submission', exact: true }).click();
  await expect.poll(async () => (await current(rejected.id)).moderation_status).toBe('hidden');
  expect((await current(approved.id)).revision).toBe(approved.revision + 1);
  expect((await current(rejected.id)).revision).toBe(rejected.revision + 1);
});

test('dashboard and feed hydrate consistently in a different browser timezone', async ({ browser }) => {
  const row = await contribution();
  const context = await browser.newContext({ baseURL: E2E.baseURL, timezoneId: 'America/Los_Angeles' });
  await authorize(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/admin');
    await expect(card(page, row.content)).toBeVisible();
    await expect(card(page, row.content).locator('time')).toContainText('UTC');
    await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
    const feedRow = page.locator('article').filter({ hasText: row.content });
    await expect(feedRow).toBeVisible();
    await expect(feedRow.locator('time')).toContainText('UTC');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
