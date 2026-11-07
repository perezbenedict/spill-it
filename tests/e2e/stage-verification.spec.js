import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const secret = process.env.SPILL_E2E_API_SECRET;
let token;
const fixtures = [];
const sizes = [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]];
const texts = {
  short: 'A good conversation leaves room for another voice.',
  medium: 'The moments that change us often begin with an honest question. We listen, make space for uncertainty, and discover that another person sees the same world differently. '.repeat(2).trim(),
  maximum: 'Every voice deserves space. Listening makes room for a different perspective, an honest question, and a thoughtful response. '.repeat(9).slice(0, 999).trimEnd().padEnd(999, '.') + '.',
};
async function request(path, method = 'GET', body, authorized = true) {
  const response = await fetch(worker + path, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
  return response.json();
}
async function project(id) {
  const path = `/admin/presentation/${E2E.adminSessionId}`;
  const pointer = await request(path);
  await request(path, 'PUT', { current_submission_id: id, expectedRevision: pointer.revision });
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !secret) throw new Error('Run through test:isolated with disposable fixtures.');
  token = (await request('/admin/auth/login', 'POST', { password: E2E.adminPassword }, false)).token;
  for (const [name, content] of Object.entries(texts)) {
    await request('/submissions', 'POST', { sessionCode: E2E.liveCode, participant_id: crypto.randomUUID(), request_id: crypto.randomUUID(), nickname: `Frame${name}`, category: 'question', content }, false);
    const listed = await request(`/admin/submissions?session_id=${E2E.adminSessionId}&status=pending`);
    const row = listed.items.find(item => item.content === content);
    expect(row).toBeTruthy();
    await request(`/admin/submissions/${row.id}`, 'PATCH', { expectedRevision: row.revision, moderation_status: 'approved' });
    fixtures.push({ name, content, id: row.id });
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
});
test.afterAll(async () => { if (token) await project(E2E.projectionIds[0]); });

for (const reducedMotion of ['no-preference', 'reduce']) {
  for (const [width, height] of sizes) {
    for (const name of Object.keys(texts)) {
      test(`${name} contribution frames ${width}x${height} ${reducedMotion}`, async ({ page }, testInfo) => {
        test.setTimeout(60000);
        await page.emulateMedia({ reducedMotion });
        await page.setViewportSize({ width, height });
        await project(E2E.projectionIds[0]);
        await page.goto(`/room/${E2E.liveCode}`);
        const stage = page.locator('[data-presentation-phase]');
        await expect(stage).toHaveAttribute('data-presentation-phase', 'settled');
        await page.evaluate(() => {
          window.__stageFrames = [];
          window.__stageFrameHandle = 0;
          const sample = () => {
            const nodes = [...document.querySelectorAll('[data-presented-contribution]')];
            window.__stageFrames.push({ phase: document.querySelector('[data-presentation-phase]')?.dataset.presentationPhase, visibleContributions: nodes.filter(node => {
              const style = getComputedStyle(node);
              return style.display !== 'none' && Number(style.opacity) > 0.05;
            }).length });
            window.__stageFrameHandle = requestAnimationFrame(sample);
          };
          sample();
        });
        const fixture = fixtures.find(item => item.name === name);
        await project(fixture.id);
        await expect(stage).toHaveAttribute('data-server-contribution-id', fixture.id);
        if (reducedMotion === 'no-preference') {
          await expect(stage).toHaveAttribute('data-presentation-phase', 'revealing');
          await testInfo.attach('entrance', { body: await page.screenshot({ animations: 'allow' }), contentType: 'image/png' });
        }
        await expect(stage).toHaveAttribute('data-presentation-phase', 'settled');
        await expect(stage).toHaveAttribute('data-current-contribution-id', fixture.id);
        const quote = page.locator(`[data-presented-contribution="${fixture.id}"] blockquote`);
        await expect(quote).toHaveText(fixture.content);
        expect(await quote.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const main = await page.locator('main').boundingBox();
        const controls = await page.locator('[data-presenter-controls]').boundingBox();
        expect(main.y + main.height).toBeLessThanOrEqual(controls.y + 1);
        await testInfo.attach('settled', { body: await page.screenshot({ animations: 'allow' }), contentType: 'image/png' });
        const version = await stage.getAttribute('data-presentation-transition-version');
        await page.waitForResponse(response => response.url().includes(`/api/room/${E2E.liveCode}`) && response.ok());
        await expect(stage).toHaveAttribute('data-presentation-transition-version', version);
        await expect(stage).toHaveAttribute('data-current-contribution-id', fixture.id);
        const frames = await page.evaluate(() => { cancelAnimationFrame(window.__stageFrameHandle); return window.__stageFrames; });
        expect(frames.every(frame => frame.visibleContributions <= 1)).toBe(true);
        if (reducedMotion === 'reduce') expect(frames.every(frame => frame.phase === 'settled')).toBe(true);
        await testInfo.attach('phase-samples', { body: JSON.stringify({ width, height, name, reducedMotion, samples: frames }), contentType: 'application/json' });
      });
    }
  }
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`two-second browser scheduling profile ${reducedMotion}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/room/${E2E.liveCode}`);
    await expect(page.locator('[data-presentation-phase]')).toHaveAttribute('data-presentation-phase', 'settled');
    const profile = await page.evaluate(() => new Promise(resolve => {
      const frames = [];
      const tasks = [];
      let observer;
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => entry.duration)));
        observer.observe({ entryTypes: ['longtask'] });
      }
      let previous;
      let start;
      function tick(timestamp) {
        start ??= timestamp;
        if (previous !== undefined) frames.push(timestamp - previous);
        previous = timestamp;
        if (timestamp - start < 2000) return requestAnimationFrame(tick);
        observer?.disconnect();
        const sorted = [...frames].sort((a, b) => a - b);
        const percentile = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
        resolve({ durationMs: timestamp - start, frames: frames.length, intervalP50Ms: percentile(.5), intervalP95Ms: percentile(.95), intervalsOver50Ms: frames.filter(value => value > 50).length, longestIntervalMs: Math.max(...frames), longTaskSupported: PerformanceObserver.supportedEntryTypes.includes('longtask'), longTasksMs: tasks, note: 'Headless browser requestAnimationFrame scheduling measurement; does not certify physical projector GPU frame rate.' });
      }
      requestAnimationFrame(tick);
    }));
    expect(profile.durationMs).toBeGreaterThanOrEqual(2000);
    expect(profile.frames).toBeGreaterThan(0);
    await testInfo.attach(`frame-profile-${reducedMotion}`, { body: JSON.stringify(profile, null, 2), contentType: 'application/json' });
    console.log(JSON.stringify({ stageFrameProfile: reducedMotion, ...profile }));
  });
}
