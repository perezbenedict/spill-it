import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

let token;
async function api(path, body) {
  const response = await fetch(`${process.env.SPILL_E2E_WORKER_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'X-Admin-Token': token || '', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  return response.json();
}
async function create(title = '') { return (await api('/admin/stages', { title })).item; }
async function project(item, overlay, fields = {}) {
  const current = (await api(`/admin/stages/${item.id}`)).item;
  return (await api(`/admin/stages/${item.id}`, { action: 'configureStage', expectedRevision: current.revision, stage: { ...current.stage, ...fields, overlay } })).item;
}
async function markContent(page) {
  await page.locator('[data-stage-overlay]').evaluate(node => { node.dataset.stability = 'retained'; });
}
async function assertLayout(page) {
  expect(await page.evaluate(() => {
    const main = document.querySelector('.standalone-projector-content');
    const header = document.querySelector('.standalone-projector-header');
    const footer = document.querySelector('.standalone-projector-footer');
    return document.documentElement.scrollWidth <= innerWidth && main.scrollWidth <= main.clientWidth + 1 &&
      header.getBoundingClientRect().bottom <= main.getBoundingClientRect().top + 1 &&
      main.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1;
  })).toBe(true);
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!process.env.SPILL_E2E_WORKER_URL || !process.env.SPILL_E2E_API_SECRET) throw Error('Use the isolated fixture runner.');
  token = (await api('/admin/auth/login', { password: E2E.adminPassword })).token;
});

test('standalone editorial modes fit mobile through 4K and retain readable long content', async ({ page }, info) => {
  test.setTimeout(180000);
  const item = await create('An evening of thoughtful conversations and shared perspectives');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const chapter = { id: 'opening', title: 'Different ways of seeing the same world' };
  const modes = [
    ['idle', null],
    ['prompt', { kind: 'prompt', text: 'What perspective changed the way you see the world?', endsAt: null }],
    ['reflection', { kind: 'reflection', text: 'Take a breath. Let the last perspective settle before the next begins.', endsAt: null }],
    ['announcement', { kind: 'announcement', style: 'notice', heading: 'An invitation to pause, listen, and consider another point of view', text: 'Make room for a thoughtful perspective. '.repeat(38).slice(0, 1500), subtitle: 'Everyone has something worth hearing.', endsAt: null }],
    ['cleared', null],
  ];
  for (const [mode, overlay] of modes) {
    if (mode === 'cleared') {
      const current = (await api(`/admin/stages/${item.id}`)).item;
      await api(`/admin/stages/${item.id}`, { action: 'clearStage', expectedRevision: current.revision });
    } else await project(item, overlay, { chapters: [chapter], activeChapterId: chapter.id });
    for (const [width, height] of [[390, 844], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/stage/${item.code}`);
      await expect(page.locator('.standalone-projector')).toHaveAttribute('data-stage-mode', mode);
      await assertLayout(page);
      await expect(page.locator('[data-active-chapter]')).toHaveCount(mode === 'announcement' ? 0 : 1);
      expect(await page.locator('.stage-emblem-watermark').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
      expect(await page.locator('.standalone-projector-frame span').first().evaluate(node => getComputedStyle(node).animationName)).toBe('none');
      const capture=info.outputPath(`standalone-${mode}-${width}x${height}.png`);await page.screenshot({path:capture});await info.attach(`standalone-${mode}-${width}x${height}.png`, {path:capture,contentType:'image/png'});
      if (width === 390 || width === 1920) {
        const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(report.violations.map(rule => rule.id)).toEqual([]);
      }
      if (mode === 'announcement') {
        await page.locator('main').evaluate(node => { node.scrollTop = node.scrollHeight; });
        await expect(page.getByText('Everyone has something worth hearing.', { exact: true })).toBeInViewport();
      }
    }
  }
});

test('chapter changes and metadata polls retain the projected content and its settled position', async ({ page }) => {
  test.setTimeout(60000);
  const item = await create();
  const overlay = { kind: 'prompt', text: 'Keep this perspective in view.', endsAt: null };
  await project(item, overlay, { chapters: [{ id: 'one', title: 'First perspective' }, { id: 'two', title: 'Second perspective' }], activeChapterId: 'one' });
  await page.goto(`/stage/${item.code}`);
  const content = page.locator('[data-stage-overlay="prompt"]');
  await expect(content).toContainText(overlay.text);
  await expect.poll(() => content.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await markContent(page);
  const initial = await content.boundingBox();
  await page.waitForResponse(response => response.url().endsWith(`/api/stages/public/${item.code}`) && response.ok());
  await expect(content).toHaveAttribute('data-stability', 'retained');
  await project(item, overlay, { activeChapterId: 'two', atmosphere: 'royal' });
  await expect(page.locator('[data-active-chapter="two"]')).toContainText('Second perspective');
  await expect(content).toHaveAttribute('data-stability', 'retained');
  await expect.poll(() => content.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  const next = await content.boundingBox();
  expect(Math.abs(initial.y - next.y)).toBeLessThan(2);
  await project(item, { ...overlay, text: 'A new authoritative perspective.' });
  await expect(content).toContainText('A new authoritative perspective.');
  await expect(content).not.toHaveAttribute('data-stability', 'retained');
  await expect(page.locator('[data-stage-overlay]')).toHaveCount(1);
  await project(item, null);
  await expect(page.locator('.standalone-projector')).toHaveAttribute('data-stage-mode', 'cleared');
  await expect(page.getByRole('heading', { name: 'Space for what’s next' })).toBeVisible();
  await expect(page.locator('[data-active-chapter="two"]')).toBeVisible();
});

test('voting suppresses the chapter and deletion removes live content through polling and refresh', async ({ page }, info) => {
  test.setTimeout(60000);
  const item = await create();
  let event = (await api('/admin/voting', { title: 'Shared perspectives', questions: [{ text: 'Which perspective resonates?', options: ['A fresh beginning', 'A moment to reflect'] }] })).event;
  event = (await api(`/admin/voting/${event.id}`, { action: 'open', expectedRevision: event.revision })).event;
  event = (await api(`/admin/voting/${event.id}`, { action: 'settings', expectedRevision: event.revision, settings: { resultsMode: 'live' } })).event;
  event = (await api(`/admin/voting/${event.id}`, { action: 'present', expectedRevision: event.revision, questionId: event.questions[0].id, content: 'results' })).event;
  await api(`/voting/${event.code}/vote`, { questionId: event.questions[0].id, optionId: event.questions[0].options[0].id, round: event.currentRound, participant_id: crypto.randomUUID() });
  await project(item, { kind: 'voting', eventCode: event.code, endsAt: null }, { chapters: [{ id: 'private', title: 'Suppressed chapter label' }], activeChapterId: 'private' });
  await page.goto(`/stage/${item.code}`);
  await expect(page.getByRole('heading', { name: 'Which perspective resonates?' })).toBeVisible();
  await expect(page.locator('[data-active-chapter]')).toHaveCount(0);
  await assertLayout(page);
  const capture=info.outputPath('standalone-voting.png');await page.screenshot({path:capture});await info.attach('standalone-voting.png',{path:capture,contentType:'image/png'});
  const current = (await api(`/admin/stages/${item.id}`)).item;
  await api(`/admin/stages/${item.id}`, { action: 'delete', expectedRevision: current.revision, confirmed: true, password: E2E.adminPassword });
  await expect(page.getByRole('heading', { name: 'Stage unavailable' })).toBeVisible({ timeout: 12000 });
  await expect(page.locator('[data-voting-stage]')).toHaveCount(0);
  await expect(page.getByText('Suppressed chapter label', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Stage unavailable' })).toBeVisible();
  await expect(page.locator('.standalone-projector')).toHaveAttribute('data-stage-mode', 'unavailable');
});
