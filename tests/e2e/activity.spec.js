import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const secret = process.env.SPILL_E2E_API_SECRET;
let token;
async function api(path, body, authorized = true, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(worker + path, { method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function create(title = `Disposable activity ${crypto.randomUUID()}`) {
  const result = await api('/admin/voting', { title, questions: [{ text: 'Which perspective?', options: ['Listen', 'Reflect'] }] });
  expect(result.status).toBe(200); return result.body.event;
}
async function current(event) {
  const result = await api(`/admin/voting/${event.id}`);
  expect(result.status).toBe(200); return result.body.event;
}
async function change(event, action, fields = {}) {
  const state = await current(event);
  const result = await api(`/admin/voting/${event.id}`, { action, expectedRevision: state.revision, ...fields });
  expect(result.status).toBe(200); return result.body.event;
}
async function history(fields = {}) {
  const result = await api(`/admin/activity?${new URLSearchParams(fields)}`);
  expect(result.status, JSON.stringify(result.body)).toBe(200); return result.body;
}
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !secret) throw Error('Use the isolated fixture runner for activity tests.');
  const login = await api('/admin/auth/login', { password: E2E.adminPassword }, false);
  expect(login.status).toBe(200); token = login.body.token;
});

test('activity access is authenticated and invalid filters are rejected', async ({ request }) => {
  expect((await api('/admin/activity', undefined, false)).status).toBe(401);
  expect((await request.get('/api/activity')).status()).toBe(401);
  for (const suffix of ['limit=51', 'limit=0', 'category=unknown', 'view=all', 'from=2026-02-31', 'from=2026-13-01', 'from=2026-11-08&to=2026-11-01', 'cursor=invalid']) {
    expect((await api(`/admin/activity?${suffix}`)).status, suffix).toBe(400);
  }
  expect((await api('/admin/activity', { action: 'deleteAll' })).status).toBe(400);
  expect((await api('/admin/activity', { action: 'clearVisible', snapshot: 'forged' })).status).toBe(400);
});

test('activity identifies voting events and supports stable bounded keyset pages', async () => {
  const event = await create();
  for (let index = 0; index < 5; index++) await change(event, 'settings', { settings: { showCounts: index % 2 === 0 } });
  const first = await history({ category: 'voting', q: event.id, limit: '2' });
  expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
  expect(first.items.every(item => item.eventType === 'voting' && item.eventTitle === event.title && item.eventId === event.id)).toBe(true);
  const ids = first.items.map(item => item.id);
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await history({ category: 'voting', q: event.id, limit: '2', cursor, snapshot: first.snapshot });
    expect(page.items.length).toBeLessThanOrEqual(2); ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor;
    expect(ids.length).toBeLessThanOrEqual(6);
  }
  expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
  expect((await history({ category: 'voting', q: event.title })).items.length).toBe(6);
  expect((await history({ q: event.id, from: '2099-01-01', to: '2099-01-02' })).items).toEqual([]);
  const differentFilters = await api(`/admin/activity?${new URLSearchParams({ category: 'stage', q: event.id, snapshot: first.snapshot })}`);
  expect(differentFilters.status).toBe(400);
  const serialized = JSON.stringify(first.items);
  expect(serialized).not.toMatch(/participant_id|actor_id|password|credential_version/);
});

test('snapshot clearing is idempotent, preserves votes and excludes later concurrent activity', async () => {
  const event = await create();
  await change(event, 'open');
  const ballot = await current(event);
  const vote = await api(`/voting/${event.code}/vote`, { questionId: event.questions[0].id, optionId: event.questions[0].options[0].id, participant_id: crypto.randomUUID(), round: ballot.currentRound || 1 }, false);
  expect(vote.status).toBe(200);
  const before = await current(event);
  expect(before.questions[0].totalVotes).toBe(1);
  const discussionBefore = await api(`/admin/sessions/${E2E.adminSessionId}/platform`);
  const snapshot = await history({ q: event.id, category: 'voting' });
  expect(snapshot.eligibleCount).toBe(2);
  await change(event, 'settings', { settings: { showPercentages: false } });
  const clears = await Promise.all([api('/admin/activity', { action: 'clearVisible', snapshot: snapshot.snapshot }), api('/admin/activity', { action: 'clearVisible', snapshot: snapshot.snapshot })]);
  expect(clears.map(result => result.status)).toEqual([200, 200]);
  expect(clears.map(result => result.body.archivedCount)).toEqual([2, 2]);
  expect(clears.map(result => result.body.duplicate).sort()).toEqual([false, true]);
  const active = await history({ q: event.id, category: 'voting' });
  expect(active.items).toHaveLength(1); expect(active.items[0].action).toBe('voting_settings');
  const archived = await history({ q: event.id, category: 'voting', view: 'archived' });
  expect(archived.items).toHaveLength(2); expect(archived.items.every(item => item.archivedAt)).toBe(true);
  const after = await current(event);
  expect(after.questions[0].totalVotes).toBe(before.questions[0].totalVotes);
  expect(after.questions[0].options.map(option => option.votes)).toEqual(before.questions[0].options.map(option => option.votes));
  expect(after.code).toBe(before.code);
  const discussionAfter = await api(`/admin/sessions/${E2E.adminSessionId}/platform`);
  expect(discussionAfter.body.currentSubmissionId).toBe(discussionBefore.body.currentSubmissionId);
  expect(discussionAfter.body.insights.total).toBe(discussionBefore.body.insights.total);
  const audit = await history({ category: 'administrative', q: 'clear_activity_history' });
  expect(audit.items.some(item => item.protected && item.archivedCount === 2)).toBe(true);
  expect((await api('/admin/activity', { action: 'clearVisible', snapshot: archived.snapshot })).status).toBe(400);
});

test('destructive audit remains visible and retained after ordinary history is archived', async () => {
  const event = await create();
  await change(event, 'delete', { password: E2E.adminPassword });
  const before = await history({ q: event.id });
  const deletion = before.items.find(item => item.action === 'voting_delete');
  expect(deletion.protected).toBe(true); expect(deletion.eventTitle).toBe('Deleted voting event'); expect(deletion.eventReference).toBe(event.id);
  expect(before.eligibleCount).toBe(1); expect(before.protectedCount).toBe(1);
  const result = await api('/admin/activity', { action: 'clearVisible', snapshot: before.snapshot });
  expect(result.status).toBe(200); expect(result.body.archivedCount).toBe(1);
  const visible = await history({ q: event.id });
  expect(visible.items).toHaveLength(1); expect(visible.items[0].id).toBe(deletion.id);
  expect((await history({ q: event.id, view: 'archived' })).items.every(item => !item.protected)).toBe(true);
});

test('activity filters, confirmation, archive review and mobile accessibility work together', async ({ page, context }, info) => {
  const event = await create('Activity browser fixture');
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/activity');
  await page.getByLabel('Search activity', { exact: true }).fill(event.id);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.locator('[data-activity-id]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Activity browser fixture', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('activity-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByLabel('Search activity', { exact: true }).fill('Unapplied filter');
  await expect(page.getByRole('button', { name: 'Clear Visible History', exact: true })).toBeDisabled();
  await page.getByLabel('Search activity', { exact: true }).fill(event.id);
  await page.getByRole('button', { name: 'Clear Visible History', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Clear this visible history?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await history({ q: event.id })).items).toHaveLength(1);
  await page.getByRole('button', { name: 'Clear Visible History', exact: true }).click();
  await page.getByRole('button', { name: 'Archive visible history', exact: true }).click();
  await expect(page.getByText('1 operational entry moved to the archive. Event data and protected audit records are unchanged.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-activity-id]')).toHaveCount(0);
  await page.getByRole('button', { name: 'View Archived Activity', exact: true }).click();
  await expect(page.locator('[data-activity-id]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Clear Visible History', exact: true })).toHaveCount(0);
  const forbidden = await page.request.post('/api/activity', { headers: { Origin: 'https://untrusted.example' }, data: { action: 'clearVisible', snapshot: (await history({ q: event.id })).snapshot } });
  expect(forbidden.status()).toBe(403);
});
