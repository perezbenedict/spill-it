import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const secret = process.env.SPILL_E2E_API_SECRET;
let token;
async function api(route, data, authorized = true) {
  const response = await fetch(`${worker}${route}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${secret}`, ...(authorized ? { 'X-Admin-Token': token } : {}), 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json() };
}
const adminPath = () => `/admin/sessions/${E2E.adminSessionId}/platform`;
async function state() {
  const result = await api(adminPath());
  expect(result.status).toBe(200);
  return result.body;
}
async function mutate(action, fields = {}) {
  const current = await state();
  return api(adminPath(), { action, expectedRevision: current.revision, ...fields });
}

async function waitForContentEntrances(page) {
  // Screenshot's CSS animation disabling does not settle Framer Motion's
  // requestAnimationFrame entrances. Observe their final content styles while
  // leaving decorative ambient motion and the selected motion preference alone.
  await expect.poll(() => page.evaluate(() => {
    const visibleContent = element => {
      if (!(element instanceof HTMLElement) || element.closest('[aria-hidden="true"]')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    };
    for (const element of document.querySelectorAll('main [style], main[style]')) {
      if (!visibleContent(element)) continue;
      if (element.style.opacity && Number(element.style.opacity) < 0.999) return false;
      if (element.style.transform && element.style.transform !== 'none') {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        if (Math.abs(matrix.m41) > 0.05 || Math.abs(matrix.m42) > 0.05 || Math.abs(matrix.m43) > 0.05 ||
          Math.abs(matrix.m11 - 1) > 0.001 || Math.abs(matrix.m22 - 1) > 0.001 || Math.abs(matrix.m33 - 1) > 0.001 ||
          Math.abs(matrix.m12) > 0.001 || Math.abs(matrix.m21) > 0.001) return false;
      }
    }
    return !document.getAnimations().some(animation => {
      const target = animation.effect?.target;
      return target instanceof HTMLElement && visibleContent(target) && animation.effect.getTiming().iterations !== Infinity &&
        (animation.playState === 'running' || animation.playState === 'pending');
    });
  }), { message: 'Finite visible content entrances should settle before visual comparison' }).toBe(true);
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !secret) throw new Error('Run platform tests through npm run test:isolated.');
  const response = await api('/admin/auth/login', { password: E2E.adminPassword }, false);
  expect(response.status).toBe(200);
  token = response.body.token;
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
});

test('queue persistence, explicit projection and conflicting moderator updates', async ({ page }) => {
  const [first, second] = E2E.projectionIds;
  expect((await mutate('clearQueue')).status).toBe(200);
  expect((await mutate('enqueue', { submissionId: first })).status).toBe(200);
  expect((await mutate('enqueue', { submissionId: second })).status).toBe(200);
  const initial = await state();
  expect(initial.queue).toHaveLength(2);
  const attempts = await Promise.all([
    api(adminPath(), { action: 'reorder', expectedRevision: initial.revision, submissionIds: [second, first] }),
    api(adminPath(), { action: 'reorder', expectedRevision: initial.revision, submissionIds: [first, second] }),
  ]);
  expect(attempts.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await state()).queue).toHaveLength(2);
  await page.goto(`/admin/sessions/${E2E.adminSessionId}/live`);
  await page.reload();
  expect((await state()).queue).toHaveLength(2);
  expect((await mutate('advance')).status).toBe(200);
  expect((await state()).queue).toHaveLength(1);
  expect((await mutate('clearQueue')).status).toBe(200);
});

test('poll votes are unique, session-isolated and rejected after close', async () => {
  expect((await mutate('createPoll', { question: 'What should we discuss next?', options: ['Belonging', 'Purpose', 'Courage'] })).status).toBe(200);
  let current = await state();
  const poll = current.polls.find(p => p.question === 'What should we discuss next?');
  expect(poll.options).toHaveLength(3);
  expect((await mutate('openPoll', { pollId: poll.id })).status).toBe(200);
  const participant_id = crypto.randomUUID();
  const vote = { participant_id, poll_id: poll.id, option_id: poll.options[0].id };
  const votes = await Promise.all([api(`/sessions/${E2E.liveCode}/vote`, vote, false), api(`/sessions/${E2E.liveCode}/vote`, vote, false)]);
  expect(votes.every(r => [200, 201, 409].includes(r.status))).toBeTruthy();
  current = await state();
  expect(current.polls.find(p => p.id === poll.id).totalVotes).toBe(1);
  expect((await api(`/sessions/${E2E.secondCode}/vote`, { ...vote, participant_id: crypto.randomUUID() }, false)).status).toBeGreaterThanOrEqual(400);
  expect((await mutate('closePoll', { pollId: poll.id })).status).toBe(200);
  expect((await api(`/sessions/${E2E.liveCode}/vote`, { ...vote, participant_id: crypto.randomUUID() }, false)).status).toBeGreaterThanOrEqual(400);
  expect((await mutate('projectPoll', { pollId: poll.id })).status).toBe(200);
  expect((await api(`/sessions/${E2E.liveCode}/engagement`, undefined, false)).body.presentationPoll.id).toBe(poll.id);
  expect((await mutate('deletePoll', { pollId: poll.id, password: 'incorrect' })).status).toBeGreaterThanOrEqual(400);
  expect((await mutate('deletePoll', { pollId: poll.id, password: E2E.adminPassword })).status).toBe(200);
});

test('reactions are opt-in, bounded and immediately disableable', async () => {
  const route = `/sessions/${E2E.liveCode}/reactions`;
  const participant_id = crypto.randomUUID();
  expect((await mutate('setReactions', { enabled: false })).status).toBe(200);
  expect((await api(route, { participant_id, reaction: 'heart' }, false)).status).toBeGreaterThanOrEqual(400);
  expect((await mutate('setReactions', { enabled: true })).status).toBe(200);
  expect((await api(route, { participant_id, reaction: 'heart' }, false)).status).toBeLessThan(300);
  const burst = await Promise.all(Array.from({ length: 12 }, () => api(route, { participant_id, reaction: 'heart' }, false)));
  expect(burst.some(r => r.status === 429)).toBeTruthy();
  expect((await api(route, { participant_id, reaction: 'unrecognized' }, false)).status).toBeGreaterThanOrEqual(400);
  expect((await mutate('setReactions', { enabled: false })).status).toBe(200);
  expect((await api(route, { participant_id, reaction: 'heart' }, false)).status).toBeGreaterThanOrEqual(400);
});

test('private platform state requires an authenticated moderator and excludes participant identity', async () => {
  expect((await api(adminPath(), undefined, false)).status).toBe(401);
  const current = await state();
  expect(current.insights).toBeTruthy();
  const publicResult = await api(`/sessions/${E2E.liveCode}/engagement`, undefined, false);
  expect(publicResult.status).toBe(200);
  expect(JSON.stringify(publicResult.body)).not.toMatch(/participant_id|request_id|password|admin_sessions/);
});

test('moderation rejects stale revisions and cross-session queue entries', async () => {
  const id = E2E.projectionIds[2];
  const original = await api(`/admin/submissions/${id}`);
  expect(original.status).toBe(200);
  const patch = async () => {
    const response = await fetch(`${worker}/admin/submissions/${id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${secret}`, 'X-Admin-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: original.body.row.revision, is_pinned: true }),
    });
    return response.status;
  };
  expect((await Promise.all([patch(), patch()])).sort()).toEqual([200, 409]);
  const sessions = await api('/admin/sessions');
  const other = sessions.body.items.find(item => item.public_code === E2E.secondCode);
  const otherPath = `/admin/sessions/${other.id}/platform`;
  const current = await api(otherPath);
  expect((await api(otherPath, { action: 'enqueue', expectedRevision: current.body.revision, submissionId: id })).status).toBe(400);
});

test('dirty session settings retain their observed revision across status refreshes', async ({ page }) => {
  const sessionPath = `/admin/sessions/${E2E.adminSessionId}`;
  const original = (await api(sessionPath)).body.session;
  const headers = { Authorization: `Bearer ${secret}`, 'X-Admin-Token': token, 'Content-Type': 'application/json' };
  const patch = values => fetch(`${worker}${sessionPath}`, { method: 'PATCH', headers, body: JSON.stringify(values) });
  try {
    await page.goto(sessionPath);
    await page.getByRole('textbox', { name: /^Title/ }).fill('Unsaved local title');
    expect((await patch({ expectedRevision: original.revision, welcome_message: 'Another moderator saved this message.' })).status).toBe(200);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /refresh|another moderator|another tab/i })).toBeVisible();
    const current = (await api(sessionPath)).body.session;
    expect(current.welcome_message).toBe('Another moderator saved this message.');
    expect(current.title).toBe(original.title);
    await page.reload();
    for (const description of ['First confirmed edit', 'Second confirmed edit']) {
      await page.getByRole('textbox', { name: /^Description/ }).fill(description);
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect.poll(async () => (await api(sessionPath)).body.session.description).toBe(description);
    }
  } finally {
    const current = (await api(sessionPath)).body.session;
    expect((await patch({ expectedRevision: current.revision, title: original.title, welcome_message: original.welcome_message, description: original.description })).status).toBe(200);
    if (current.status === 'paused') expect((await api(`${sessionPath}/status`, { status: 'live' })).status).toBe(200);
  }
});

test('presenter arrows do not activate while an input or control has focus', async ({ page }) => {
  await page.goto(`/room/${E2E.liveCode}`);
  let commands = 0;
  page.on('request', request => { if ((request.url().endsWith('/api/presentation') || request.url().includes('/api/platform/admin/')) && request.method() === 'POST') commands++; });
  await page.evaluate(() => { const input = document.createElement('input'); input.setAttribute('aria-label', 'Shortcut guard probe'); document.body.append(input); input.focus(); });
  for (const key of ['ArrowRight', 'ArrowLeft', 'n', 'h', 'c', 'f']) await page.keyboard.press(key);
  expect(commands).toBe(0);
  expect(await page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.getByRole('button', { name: 'Show presentation controls' })).toBeVisible();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Hide controls', exact: true })).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Show presentation controls' })).toBeVisible();
});

test('CSV excludes unpublished content and neutralizes spreadsheet formulas', async () => {
  const content = '=HYPERLINK("https://example.invalid","private export probe")';
  const created = await api('/submissions', { sessionCode: E2E.liveCode, participant_id: crypto.randomUUID(), request_id: crypto.randomUUID(), nickname: 'ExportFixture', category: 'question', content }, false);
  expect(created.status).toBe(200);
  const headers = { Authorization: `Bearer ${secret}`, 'X-Admin-Token': token };
  const exportURL = `${worker}/admin/sessions/${E2E.adminSessionId}/export`;
  expect(await (await fetch(exportURL, { headers })).text()).not.toContain('private export probe');
  const contributions = await api(`/admin/submissions?session_id=${E2E.adminSessionId}&status=pending`);
  const row = contributions.body.items.find(item => item.content === content);
  const approved = await fetch(`${worker}/admin/submissions/${row.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: row.revision, moderation_status: 'approved' }) });
  expect(approved.status).toBe(200);
  const csv = await (await fetch(exportURL, { headers })).text();
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).not.toContain('participant_id');
});

test('participant poll and reaction controls work without interrupting contribution entry', async ({ page }) => {
  expect((await mutate('createPoll', { question: 'What stays with you?', options: ['A new perspective', 'A good question'] })).status).toBe(200);
  const poll = (await state()).polls.find(item => item.question === 'What stays with you?');
  expect((await mutate('openPoll', { pollId: poll.id })).status).toBe(200);
  expect((await mutate('setReactions', { enabled: true })).status).toBe(200);
  await page.goto(`/join/${E2E.liveCode}`);
  await page.getByRole('radio', { name: 'A new perspective' }).check();
  await page.getByRole('button', { name: 'Submit vote', exact: true }).click();
  await expect(page.getByText('Vote received for this browser.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter the Conversation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I agree', exact: true }).click();
  await expect(page.getByText('Reaction sent.', { exact: true })).toBeVisible();
  const again = await page.request.post(`/api/platform/public/${E2E.liveCode}/vote`, { data: { participant_id: crypto.randomUUID(), poll_id: poll.id, option_id: poll.options[0].id } });
  expect((await again.json()).duplicate).toBe(true);
  expect((await state()).polls.find(item => item.id === poll.id).totalVotes).toBe(1);
  await mutate('closePoll', { pollId: poll.id });
  await mutate('setReactions', { enabled: false });
});

test('maximum-length unbroken projection remains readable at mobile and projector ratios', async ({ page }) => {
  test.setTimeout(120000);
  const content = 'A'.repeat(1000);
  expect((await api('/submissions', { sessionCode: E2E.liveCode, participant_id: crypto.randomUUID(), request_id: crypto.randomUUID(), nickname: 'LongProjectionFixture', category: 'question', content }, false)).status).toBe(200);
  const listed = await api(`/admin/submissions?session_id=${E2E.adminSessionId}&status=pending`);
  const row = listed.body.items.find(item => item.content === content);
  const headers = { Authorization: `Bearer ${secret}`, 'X-Admin-Token': token, 'Content-Type': 'application/json' };
  expect((await fetch(`${worker}/admin/submissions/${row.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: row.revision, moderation_status: 'approved' }) })).status).toBe(200);
  async function project(id) {
    const pointer = await api(`/admin/presentation/${E2E.adminSessionId}`);
    const result = await fetch(`${worker}/admin/presentation/${E2E.adminSessionId}`, { method: 'PUT', headers, body: JSON.stringify({ current_submission_id: id, expectedRevision: pointer.body.revision }) });
    expect(result.status).toBe(200);
  }
  await project(row.id);
  try {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/room/${E2E.liveCode}`);
  await page.locator('main').focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.locator('main').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  for (const viewport of [{ width: 320, height: 740 }, { width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/room/${E2E.liveCode}`);
    const quote = page.locator('[data-presented-contribution]');
    await expect(quote).toBeVisible();
    await expect(page.locator('[data-presentation-phase]')).toHaveAttribute('data-presentation-phase', 'settled');
    if (viewport.width === 320) {
      await page.getByRole('button', { name: 'Show presentation controls' }).click();
      await expect(page.getByRole('toolbar', { name: 'Presentation controls' })).toBeVisible();
      await expect.poll(async () => {
        const main = await page.locator('main').boundingBox();
        const controls = await page.locator('[data-presenter-controls]').boundingBox();
        return main.y + main.height <= controls.y;
      }).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await quote.locator('blockquote').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const contentBox = await page.locator('main').boundingBox();
    const controlsBox = await page.locator('[data-presenter-controls]').boundingBox();
    expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(controlsBox.y);
    await expect.poll(() => page.locator('main').evaluate(element => element.scrollTop)).toBe(0);
    await expect(page).toHaveScreenshot(`long-projection-${viewport.width}.png`, { fullPage: true });
  }
  } finally {
    await project(E2E.projectionIds[0]);
  }
});

for (const reducedMotion of ['reduce', 'no-preference']) {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1440, height: 900 }, { name: 'projector', width: 1920, height: 1080 }]) {
    test(`visual surfaces ${viewport.name} ${reducedMotion}`, async ({ page }) => {
      test.setTimeout(120000);
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize(viewport);
      for (const [label, route] of [['home', '/'], ['join', `/join/${E2E.liveCode}`], ['moderation', `/admin/sessions/${E2E.adminSessionId}/live`], ['qr', `/qr/${E2E.liveCode}`], ['room', `/room/${E2E.liveCode}`]]) {
        await page.goto(route);
        await expect(page.locator('main').first()).toBeVisible();
        if (label === 'home') await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (label === 'join') {
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(E2E.topic);
          await expect(page.getByRole('button', { name: 'Enter the Conversation', exact: true })).toBeVisible();
        }
        if (label === 'moderation') await expect(page.getByRole('heading', { name: /Projection queue/ })).toBeVisible();
        if (label === 'room') await expect(page.locator('[data-presentation-phase]')).toHaveAttribute('data-presentation-phase', 'settled');
        if (label === 'qr') await expect(page.getByRole('img', { name: /QR code to join/i })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await waitForContentEntrances(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await expect(page).toHaveScreenshot(`${label}-${viewport.name}-${reducedMotion}.png`, { fullPage: true, mask: [page.locator('time'), page.locator('[data-connection-status]')] });
      }
    });
  }
}

test('stage direction persists, isolates drafts and preserves the contribution pointer', async ({ page }) => {
  const original = (await state()).stage;
  const stage = { atmosphere: 'electric', chapters: [{ id: 'opening', title: 'The influence' }, { id: 'private', title: 'Unannounced chapter' }], activeChapterId: 'opening', prompts: [{ id: 'saved', text: 'Unsent private prompt' }], overlay: { kind: 'reflection', text: 'A moment to reflect', endsAt: null } };
  try {
    expect((await mutate('configureStage', { stage })).status).toBe(200);
    expect((await state()).stage).toMatchObject(stage);
    const publicState = await api(`/sessions/${E2E.liveCode}/engagement`, undefined, false);
    expect(publicState.body.stage.prompts).toEqual([]);
    expect(publicState.body.stage.chapters).toHaveLength(1);
    await page.goto(`/room/${E2E.liveCode}`);
    await expect(page.locator('[data-stage-overlay] h1')).toHaveText('A moment to reflect');
    expect((await mutate('configureStage', { stage: { ...stage, overlay: null } })).status).toBe(200);
    await expect(page.locator('[data-stage-overlay]')).not.toBeVisible();
    expect((await mutate('configureStage', { stage: { ...stage, atmosphere: 'invalid' } })).status).toBe(400);
  } finally { await mutate('configureStage', { stage: original }); }
});

test('a 100-item curated queue reorders atomically', async () => {
  test.setTimeout(120000);
  const headers = { Authorization: `Bearer ${secret}`, 'X-Admin-Token': token, 'Content-Type': 'application/json' };
  expect((await mutate('clearQueue')).status).toBe(200);
  try {
    const submitted = await Promise.all(Array.from({ length: 100 }, (_, index) => api('/submissions', {
      sessionCode: E2E.liveCode, participant_id: crypto.randomUUID(), request_id: crypto.randomUUID(),
      nickname: `QueueScale${String(index).padStart(3, '0')}`, category: 'question', content: `Queue scale specimen ${index}`,
    }, false)));
    expect(submitted.every(result => result.status === 200)).toBe(true);
    const pending = await api(`/admin/submissions?session_id=${E2E.adminSessionId}&status=pending&limit=200`);
    const items = pending.body.items.filter(row => /^QueueScale\d{3}$/.test(row.nickname));
    expect(items).toHaveLength(100);
    const approved = await Promise.all(items.map(row => fetch(`${worker}/admin/submissions/${row.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: row.revision, moderation_status: 'approved' }),
    })));
    expect(approved.every(response => response.status === 200)).toBe(true);
    for (const row of items) expect((await mutate('enqueue', { submissionId: row.id })).status).toBe(200);
    const ids = (await state()).queue.map(row => row.id).reverse();
    expect(ids).toHaveLength(100);
    expect((await mutate('reorder', { submissionIds: ids })).status).toBe(200);
    expect((await state()).queue.map(row => row.id)).toEqual(ids);
  } finally {
    await mutate('clearQueue');
  }
});
