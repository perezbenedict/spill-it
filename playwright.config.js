import { defineConfig, devices } from '@playwright/test';

const suppliedBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = suppliedBaseURL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  // Stateful event-flow specs share disposable discussion fixtures. Running
  // them serially prevents one browser journey from racing another journey's
  // lifecycle or moderation changes.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000, toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.01 } },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.SPILL_CROSS_BROWSER === '1' ? [
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ] : []),
  ],
  // A supplied URL is always treated as an already-running target. With no
  // URL, retain the repository's convenient local production-build startup.
  webServer: suppliedBaseURL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180000,
      },
});
