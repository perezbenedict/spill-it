import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
let token;
async function api(path, body) {
  const response = await fetch(process.env.SPILL_E2E_WORKER_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'X-Admin-Token': token || '', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  expect(response.ok).toBe(true);
  return response.json();
}
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  token = (await api('/admin/auth/login', { password: E2E.adminPassword })).token;
});
for (const motion of ['no-preference', 'reduce']) {
  test(`standalone 4K scheduling and stationary text · ${motion}`, async ({ page }, info) => {
    const item = (await api('/admin/stages', { title: '' })).item;
    await api(`/admin/stages/${item.id}`, { action: 'configureStage', expectedRevision: item.revision,
      stage: { ...item.stage, overlay: { kind: 'prompt', text: 'Every perspective deserves room.', endsAt: null } } });
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto(`/stage/${item.code}`);
    await expect(page.locator('[data-stage-overlay="prompt"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.standalone-projector')).toHaveAttribute('data-ambient-quality', /quiet|full/);
    if (motion === 'no-preference') {
      await expect(page.locator('.stage-emblem-watermark')).toHaveCSS('animation-name', 'stage-emblem-turn');
      await expect(page.locator('.stage-emblem-watermark')).toHaveCSS('animation-duration', '120s');
    } else await expect(page.locator('.stage-emblem-watermark')).toHaveCSS('animation-name', 'none');
    await page.evaluate(() => new Promise(resolve => {
      let count = 0;
      const frame = () => ++count >= 60 ? resolve() : requestAnimationFrame(frame);
      requestAnimationFrame(frame);
    }));
    const metrics = await page.evaluate(() => new Promise(resolve => {
      const element = document.querySelector('[data-stage-overlay="prompt"] h1');
      const first = element.getBoundingClientRect();
      const intervals = [];
      const longTasks = [];
      const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration))) : null;
      observer?.observe({ entryTypes: ['longtask'] });
      let start;
      let previous;
      let maxPositionChange = 0;
      const frame = timestamp => {
        start ??= timestamp;
        if (previous !== undefined) intervals.push(timestamp - previous);
        previous = timestamp;
        const box = element.getBoundingClientRect();
        maxPositionChange = Math.max(maxPositionChange, Math.abs(first.x - box.x), Math.abs(first.y - box.y));
        if (timestamp - start < 2000) return requestAnimationFrame(frame);
        observer?.disconnect();
        const sorted = [...intervals].sort((a, b) => a - b);
        resolve({ frames: intervals.length, durationMs: timestamp - start,
          p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)],
          maxPositionChange, longTasks, watermarkWidth: document.querySelector('.stage-emblem-position').getBoundingClientRect().width, quality: document.querySelector('.standalone-projector').dataset.ambientQuality,
          measurement: 'Headless Chromium RAF scheduling; not a physical projector or GPU benchmark.' });
      };
      requestAnimationFrame(frame);
    }));
    console.log(JSON.stringify({ standalone4KProfile: motion, ...metrics }));
    await info.attach(`standalone-4k-${motion}.json`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    if (motion === 'no-preference' && metrics.quality === 'quiet') expect(metrics.watermarkWidth).toBeLessThanOrEqual(1040);
    expect(metrics.maxPositionChange).toBeLessThanOrEqual(.1);
    expect(metrics.p95Ms).toBeLessThanOrEqual(65);
    await info.attach(`standalone-4k-${motion}.png`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}
