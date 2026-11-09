import { expect, test } from '@playwright/test';
import { handleStandaloneStages } from '../../api/stages.js';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const blankStage = { atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: null };
const exampleId = 'bdf883dd-1760-4100-8131-44eccf0cb010';

// Exercise role and verification failures without creating a privileged fixture user.
test('stage deletion rejects moderators, missing verification and unconfirmed requests', async () => {
  let batches = 0;
  let verifications = 0;
  const row = { id: exampleId, revision: 0 };
  const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }), batch: async () => { batches++; } } };
  const invoke = (role, fields = {}, verifyPassword) => handleStandaloneStages(new Request('http://localhost/admin/stages/' + exampleId, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', expectedRevision: 0, confirmed: true, ...fields }) }), env, { user: { id: 'actor', role } }, exampleId, false, verifyPassword);
  const verify = async () => { verifications++; return {}; };
  expect((await invoke('moderator', {}, verify)).status).toBe(403);
  expect((await invoke('admin', { confirmed: false }, verify)).status).toBe(400);
  expect((await invoke('admin')).status).toBe(503);
  expect((await invoke('admin', { expectedRevision: 1 }, verify)).status).toBe(409);
  expect(verifications).toBe(0);
  const rejected = new Response('{"error":"Incorrect admin password."}', { status: 403 });
  expect(await invoke('admin', {}, async () => ({ response: rejected }))).toBe(rejected);
  expect((await invoke('admin', {}, verify)).status).toBe(403);
  expect(batches).toBe(0);
});

test.describe('isolated stage management', () => {
  let token;
  async function api(path, body, expected = 200, authenticated = true) {
    const response = await fetch(`${worker}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(authenticated ? { 'X-Admin-Token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect(response.status, await response.clone().text()).toBe(expected);
    return response.json();
  }
  const state = id => api(`/admin/stages/${id}`).then(body => body.item);
  const create = title => api('/admin/stages', { title }, 201).then(body => body.item);
  const remove = (item, extra = {}, status = 200) => api(`/admin/stages/${item.id}`, { action: 'delete', expectedRevision: item.revision, confirmed: true, password: E2E.adminPassword, ...extra }, status);
  async function configure(item, stage) { return (await api(`/admin/stages/${item.id}`, { action: 'configureStage', expectedRevision: item.revision, stage })).item; }
  async function authorize(context) { await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]); }
  const audit = id => api(`/admin/activity?category=stage&q=${id}`).then(body => body.items.filter(item => item.action === 'standalone_delete'));

  test.beforeAll(async () => {
    requireLocalMutationTarget(test);
    if (!worker || !process.env.SPILL_E2E_API_SECRET) throw Error('Use the isolated fixture runner.');
    token = (await api('/admin/auth/login', { password: E2E.adminPassword }, 200, false)).token;
  });

  test('deletion requires authentication, confirmation, current revision and password', async () => {
    const item = await create('Deletion guards');
    await api(`/admin/stages/${item.id}`, { action: 'delete', expectedRevision: item.revision, confirmed: true, password: E2E.adminPassword }, 401, false);
    await remove(item, { confirmed: false }, 400);
    await remove(item, { password: '' }, 401);
    await remove(item, { password: 'incorrect-stage-password' }, 401);
    expect((await state(item.id)).revision).toBe(item.revision);
    const changed = await configure(item, { ...blankStage, atmosphere: 'aurora' });
    await remove(item, {}, 409);
    expect(await state(item.id)).toEqual(changed);
    expect(await audit(item.id)).toEqual([]);
    await remove(changed);
    await api(`/stages/${item.code}`, undefined, 404, false);
    await api(`/admin/stages/${item.id}`, undefined, 404);
    const deleted = await audit(item.id);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].protected).toBe(true);
  });

  test('simultaneous deletion records one protected audit and preserves discussion, votes and other stages', async () => {
    const item = await create('One permanent delete');
    const other = await create('Preserved standalone');
    const discussion = await api(`/admin/sessions/${E2E.adminSessionId}/platform`);
    const voting = (await api('/admin/voting', { title: 'Preserved vote', questions: [{ text: 'Keep this vote?', options: ['Yes', 'Absolutely'] }] })).event;
    const voteBefore = await api(`/admin/voting/${voting.id}`);
    const responses = await Promise.all([1, 2].map(() => fetch(`${worker}/admin/stages/${item.id}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'X-Admin-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', expectedRevision: item.revision, confirmed: true, password: E2E.adminPassword }) })));
    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    expect(responses.filter(response => [404, 409].includes(response.status))).toHaveLength(1);
    expect(await audit(item.id)).toHaveLength(1);
    expect(await state(other.id)).toEqual(other);
    expect(await api(`/admin/sessions/${E2E.adminSessionId}/platform`)).toEqual(discussion);
    expect(await api(`/admin/voting/${voting.id}`)).toEqual(voteBefore);
  });

  test('dialog cancellation, stale revision recovery and selected-stage deletion update the projector', async ({ page, context }) => {
    await authorize(context);
    let item = await create('Delete dialog fixture');
    item = await configure(item, { ...blankStage, overlay: { kind: 'prompt', text: 'Presentation before permanent deletion', endsAt: null } });
    await page.goto(`/admin/stage?mode=standalone&stage=${item.id}`);
    const projector = await context.newPage();
    await projector.goto(`/stage/${item.code}`);
    await expect(projector.locator('[data-stage-overlay="prompt"]')).toBeVisible();
    const trigger = page.getByRole('button', { name: `Delete ${item.title} · ${item.code}`, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Delete standalone stage?' });
    await expect(dialog).toContainText(item.code);
    await expect(dialog).toContainText('will become unavailable');
    await expect(dialog).toContainText('interrupt that presentation');
    const password = dialog.getByLabel('Admin password');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await state(item.id)).toEqual(item);
    await trigger.click();
    await password.fill(E2E.adminPassword);
    await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeEnabled();
    item = await configure(item, { ...item.stage, atmosphere: 'aurora' });
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Nothing was deleted');
    await expect(trigger).toBeAttached();
    expect(await state(item.id)).toEqual(item);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await trigger.click();
    await password.fill(E2E.adminPassword);
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/stage\?mode=standalone$/);
    await expect(page.getByRole('status').filter({ hasText: 'Standalone stage deleted.' })).toBeVisible();
    await expect(page.getByRole('link', { name: `${item.title} · ${item.code}`, exact: true })).toHaveCount(0);
    await expect(projector.getByRole('heading', { name: 'Stage unavailable', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(projector.locator('[data-stage-overlay]')).toHaveCount(0);
    await api(`/stages/${item.code}`, undefined, 404, false);
    await projector.close();
  });

  test('saved stages use bounded pagination without duplicate records', async ({ page, context }) => {
    await create('Pagination first');
    await create('Pagination second');
    await create('Pagination third');
    const first = await api('/admin/stages?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await api(`/admin/stages?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(second.items.length).toBeGreaterThan(0);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(first.items.length + second.items.length);
    await api('/admin/stages?limit=51', undefined, 400);
    await api('/admin/stages?cursor=invalid', undefined, 400);
    await authorize(context);
    const response = await page.request.get(`/api/stages/admin?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).items.map(item => item.id)).toEqual(second.items.map(item => item.id));
  });

  test('public active chapter contains only the selected title and clears with its selection', async () => {
    const chapter = { id: crypto.randomUUID(), title: 'Selected chapter title' };
    const secret = { id: crypto.randomUUID(), title: 'PRIVATE_UNSELECTED_CHAPTER' };
    let item = await create('Public chapter fixture');
    item = await configure(item, { ...blankStage, chapters: [chapter, secret], activeChapterId: chapter.id });
    const publicBody = await api(`/stages/${item.code}`, undefined, 200, false);
    expect(publicBody.item.stage.activeChapter).toEqual(chapter);
    expect(JSON.stringify(publicBody)).not.toContain(secret.title);
    expect(publicBody.item.stage).not.toHaveProperty('chapters');
    item = await configure(item, { ...item.stage, activeChapterId: null });
    expect((await api(`/stages/${item.code}`, undefined, 200, false)).item.stage.activeChapter).toBeNull();
  });
});
