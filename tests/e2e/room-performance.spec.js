import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

// Continuous 4K trace/video capture measures recording overhead as well as the
// stage. Keep scheduling profiles independent of that instrumentation.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

for (const [reducedMotion, variant] of [['no-preference', 'normal'], ['reduce', 'reduced']]) {
  test(`4K room scheduling with emblem · ${variant}`, async ({ page }, testInfo) => {
    requireLocalMutationTarget(test);
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto(`/room/${E2E.liveCode}`);
    await expect(page.locator('.stage-watermark')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const screen = page.locator('[data-ambient-quality]');
    await expect(screen).toHaveAttribute('data-ambient-quality', /^(quiet|full)$/);
    const quality = await screen.getAttribute('data-ambient-quality');
    if (reducedMotion === 'no-preference') {
      await expect(page.locator('.stage-watermark')).toHaveCSS('animation-duration', '54s');
      if (quality === 'quiet') await expect(page.locator('.stage-lightfield')).toHaveCSS('animation-name', 'none');
    }
    // Measure settled rendering after the adaptive layer switch has drained
    // pending paint work; transition frames are captured by the stage matrix.
    await page.evaluate(() => new Promise(resolve => {
      let frames = 0;
      const tick = () => { if (++frames >= 30) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    const metrics = await page.evaluate(() => new Promise(resolve => {
      const intervals = [];
      const longTasks = [];
      const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
        ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration))) : null;
      observer?.observe({ entryTypes: ['longtask'] });
      let start;
      let previous;
      const tick = timestamp => {
        start ??= timestamp;
        if (previous !== undefined) intervals.push(timestamp - previous);
        previous = timestamp;
        if (timestamp - start < 2000) return requestAnimationFrame(tick);
        observer?.disconnect();
        const sorted = [...intervals].sort((a, b) => a - b);
        resolve({ durationMs: timestamp - start, frames: intervals.length,
          p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)],
          over50Ms: intervals.filter(value => value > 50).length, longTasks,
          measurement: 'Headless Chromium scheduling; physical projector performance is not inferred.' });
      };
      requestAnimationFrame(tick);
    }));
    expect(metrics.durationMs).toBeGreaterThanOrEqual(2000);
    expect(metrics.frames).toBeGreaterThan(0);
    await testInfo.attach(`4k-profile-${reducedMotion}`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    console.log(JSON.stringify({ room4KProfile: reducedMotion, variant, quality, warmupFrames: 30, ...metrics }));
    // Allow clock quantization around three 60 Hz frame intervals.
    expect(metrics.p95Ms).toBeLessThanOrEqual(51);
  });
}
