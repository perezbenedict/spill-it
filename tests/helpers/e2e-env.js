const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';

export const E2E = Object.freeze({
  baseURL: configuredBaseURL,
  liveCode: process.env.SPILL_E2E_SESSION_CODE || '',
  longCode: process.env.SPILL_E2E_LONG_SESSION_CODE || '',
  secondCode: process.env.SPILL_E2E_SECOND_SESSION_CODE || '',
  topic: process.env.SPILL_E2E_TOPIC || '',
  closedCode: process.env.SPILL_E2E_CLOSED_SESSION_CODE || '',
  roomCode: process.env.SPILL_E2E_ROOM_CODE || '',
  presentedText: process.env.SPILL_E2E_PRESENTED_TEXT || '',
  projectionIds: (process.env.SPILL_E2E_PROJECTION_IDS || '').split(',').filter(Boolean),
  adminPassword: process.env.SPILL_E2E_ADMIN_PASSWORD || '',
  adminSessionId: process.env.SPILL_E2E_ADMIN_SESSION_ID || '',
  bulkSubmissionIds: (process.env.SPILL_E2E_BULK_SUBMISSION_IDS || '').split(',').filter(Boolean),
  bulkSessionIds: (process.env.SPILL_E2E_BULK_SESSION_IDS || '').split(',').filter(Boolean),
  runLifecycle: process.env.SPILL_E2E_RUN_LIFECYCLE === '1',
});

export function isLoopbackTarget(value = configuredBaseURL) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function requireFixture(test, value, variableName) {
  if (!value && process.env.SPILL_E2E_REQUIRED === '1') {
    throw new Error(`${variableName} is required; isolated release tests must not skip.`);
  }
  test.skip(!value, `${variableName} is required for this disposable-fixture test.`);
}

export function requireLocalMutationTarget(test) {
  test.skip(
    !isLoopbackTarget(),
    'This test writes disposable data and is intentionally restricted to a loopback target.'
  );
}

export async function loginAsAdmin(page) {
  await page.goto('/admin/login');
  await page.getByLabel(/admin password/i).fill(E2E.adminPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname === '/admin');
}

export async function enterNicknameStep(page) {
  const enter = page.getByRole('button', { name: 'Enter the Conversation', exact: true });
  await enter.click();

  const nickname = page.getByLabel('Your nickname');
  for (let step = 0; step < 3 && !(await nickname.isVisible().catch(() => false)); step += 1) {
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.click();
  }
  await nickname.waitFor({ state: 'visible' });
  return nickname;
}

export function uniqueNickname(prefix = 'E2E') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 60);
}
