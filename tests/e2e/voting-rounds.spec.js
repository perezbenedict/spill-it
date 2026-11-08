import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
let token;
async function api(path, body, authorized = true) {
  const response = await fetch(worker + path, { method: body === undefined ? 'GET' : 'POST', headers: {
    Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': token } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
async function current(id, round) {
  const result = await api(`/admin/voting/${id}${round ? `?round=${round}` : ''}`);
  expect(result.status).toBe(200);
  return result.body.event;
}
async function create() {
  const result = await api('/admin/voting', { title: 'Disposable round lifecycle', questions: [{ text: 'Should we make room to listen?', options: ['Yes', 'No'] }] });
  expect(result.status).toBe(200);
  return result.body.event;
}
async function mutate(id, action, fields = {}) {
  const state = await current(id);
  return api(`/admin/voting/${id}`, { action, expectedRevision: state.revision, ...fields });
}
async function act(id, action, fields = {}) {
  const result = await mutate(id, action, fields);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.event;
}
const vote = (event, participant = crypto.randomUUID(), option = 0, round = event.currentRound) => api(`/voting/${event.code}/vote`, {
  participant_id: participant, questionId: event.questions[0].id, optionId: event.questions[0].options[option].id, round,
}, false);
async function publicEvent(code) {
  const result = await api(`/voting/${code}`, undefined, false);
  expect(result.status).toBe(200);
  return result.body.event;
}
function redacted(event) {
  expect(event.rounds).toBeUndefined(); expect(event.history).toBeUndefined();
  for (const question of event.questions) {
    expect(question.totalVotes).toBeUndefined();
    for (const option of question.options) { expect(option.votes).toBeUndefined(); expect(option.percentage).toBeUndefined(); }
  }
}
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !process.env.SPILL_E2E_API_SECRET) throw new Error('Use disposable isolated fixtures.');
  const login = await api('/admin/auth/login', { password: E2E.adminPassword }, false);
  expect(login.status).toBe(200); token = login.body.token;
});

test('reopening retains votes and links while revoking old hidden-result publication', async () => {
  let event = await create(); const code = event.code;
  expect(event.currentRound).toBe(1);
  event = await act(event.id, 'open');
  const participant = crypto.randomUUID();
  expect((await vote(event, participant)).status).toBe(200);
  event = await act(event.id, 'close');
  expect((await vote(event)).status).toBe(409);
  expect((await vote(event, participant)).body.duplicate).toBe(true);
  await act(event.id, 'settings', { settings: { participantResults: true } });
  await act(event.id, 'present', { content: 'results', questionId: event.questions[0].id, reveal: true });
  expect((await publicEvent(code)).questions[0].totalVotes).toBe(1);
  event = await act(event.id, 'reopen');
  expect(event.status).toBe('open'); expect(event.currentRound).toBe(1); expect(event.code).toBe(code);
  expect(event.settings.participantResults).toBe(false);
  expect(event.questions[0].totalVotes).toBe(1);
  const hidden = await publicEvent(code); redacted(hidden); expect(hidden.previouslyPublic).toBe(true);
  expect((await vote(event, participant)).body.duplicate).toBe(true);
  expect((await vote(event, participant, 1)).status).toBe(409);
  expect((await vote(event)).status).toBe(200);
  event = await act(event.id, 'close');
  redacted(await publicEvent(code));
  expect(event.questions[0].totalVotes).toBe(2);
  await act(event.id, 'present', { content: 'results', questionId: event.questions[0].id, reveal: true });
  expect((await publicEvent(code)).questions[0].totalVotes).toBe(2);
  await act(event.id, 'reopen'); event = await act(event.id, 'close');
  expect(event.rounds[0].reopenCount).toBe(2); redacted(await publicEvent(code));
});

test('a confirmed new round preserves historical totals and rejects stale-round submissions', async () => {
  let event = await create(); event = await act(event.id, 'open');
  const participant = crypto.randomUUID();
  expect((await vote(event, participant)).status).toBe(200);
  await act(event.id, 'close');
  expect((await mutate(event.id, 'newRound')).status).toBe(400);
  const previous = event;
  event = await act(event.id, 'newRound', { confirmed: true });
  expect(event.currentRound).toBe(2); expect(event.status).toBe('open'); expect(event.code).toBe(previous.code);
  expect(event.questions[0].id).toBe(previous.questions[0].id); expect(event.questions[0].totalVotes).toBe(0);
  expect((await vote(previous, participant)).status).toBe(409);
  expect((await vote(event, participant, 1)).status).toBe(200);
  expect((await vote(event, participant, 1)).body.duplicate).toBe(true);
  const history = await current(event.id, 1);
  expect(history.history.roundNumber).toBe(1); expect(history.history.questions[0].totalVotes).toBe(1);
  expect(history.history.questions[0].options.map(option => option.votes)).toEqual([1, 0]);
  expect(history.questions[0].options.map(option => option.votes)).toEqual([0, 1]);
  expect((await api(`/admin/voting/${event.id}?round=1`, undefined, false)).status).toBe(401);
  redacted(await publicEvent(event.code));
  const probe = await api(`/voting/${event.code}?round=1`, undefined, false);
  expect(probe.body.event.currentRound).toBe(2); redacted(probe.body.event);
});

test('concurrent lifecycle operations accept one revision and ballots remain unique per round', async () => {
  let event = await create(); await act(event.id, 'open'); event = await act(event.id, 'close');
  const reopen = await Promise.all([0, 1].map(() => api(`/admin/voting/${event.id}`, { action: 'reopen', expectedRevision: event.revision })));
  expect(reopen.map(result => result.status).sort()).toEqual([200, 409]);
  event = await act(event.id, 'close');
  const rounds = await Promise.all([0, 1].map(() => api(`/admin/voting/${event.id}`, { action: 'newRound', confirmed: true, expectedRevision: event.revision })));
  expect(rounds.map(result => result.status).sort()).toEqual([200, 409]);
  event = await current(event.id); expect(event.currentRound).toBe(2); expect(event.rounds).toHaveLength(2);
  const participant = crypto.randomUUID();
  const ballots = await Promise.all([vote(event, participant, 0), vote(event, participant, 1)]);
  expect(ballots.map(result => result.status).sort()).toEqual([200, 409]);
  const people = await Promise.all([vote(event), vote(event)]); expect(people.map(result => result.status)).toEqual([200, 200]);
  event = await act(event.id, 'close'); expect(event.questions[0].totalVotes).toBe(3);
  expect((await vote(event)).status).toBe(409); expect((await current(event.id)).questions[0].totalVotes).toBe(3);
});

test('live projected totals continue after reopening without remounting the result chart', async ({ page }) => {
  let event = await create(); await act(event.id, 'open');
  await act(event.id, 'settings', { settings: { resultsMode: 'live' } });
  await act(event.id, 'present', { content: 'results', questionId: event.questions[0].id });
  await page.goto(`/vote/${event.code}/stage`);
  const chart = page.locator('[data-vote-total]'); await expect(chart).toHaveAttribute('data-vote-total', '0');
  await vote(event); await expect(chart).toHaveAttribute('data-vote-total', '1');
  await chart.evaluate(element => { element.dataset.roundProbe = 'retained'; });
  await act(event.id, 'close'); event = await act(event.id, 'reopen');
  await vote(event); await expect(chart).toHaveAttribute('data-vote-total', '2');
  await expect(chart).toHaveAttribute('data-round-probe', 'retained');
  await page.reload(); await expect(chart).toHaveAttribute('data-vote-total', '2');
});

test('admin reopen and confirmed new-round workflows reset participant eligibility without a new link', async ({ page, context, browser }) => {
  test.setTimeout(90000);
  let event = await create(); await act(event.id, 'open');
  const audience = await browser.newContext({ baseURL: E2E.baseURL, reducedMotion: 'reduce' });
  try {
    const voter = await audience.newPage(); await voter.goto(`/vote/${event.code}`);
    await voter.getByRole('radio', { name: 'Yes', exact: true }).check();
    await voter.getByRole('button', { name: 'Submit vote', exact: true }).click();
    await expect(voter.getByRole('heading', { name: 'Your voice is in.', exact: true })).toBeVisible();
    await context.addCookies([{ name: 'spill_admin_session', value: token, url: E2E.baseURL, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`/admin/voting/${event.id}`);
    const qr = await page.locator('.voting-qr img').getAttribute('src');
    await page.getByRole('button', { name: 'Close voting', exact: true }).click();
    await page.getByRole('button', { name: 'Reopen Voting', exact: true }).click();
    await expect(page.getByText(/Voting reopened for round 1/)).toBeVisible();
    expect(await page.locator('.voting-qr img').getAttribute('src')).toBe(qr);
    await expect(voter.getByRole('heading', { name: 'Your voice is in.', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close voting', exact: true }).click();
    await page.getByRole('button', { name: 'Start New Round', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Previously recorded votes are not deleted');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await current(event.id)).currentRound).toBe(1);
    await page.getByRole('button', { name: 'Start New Round', exact: true }).click();
    await page.getByRole('button', { name: 'Start confirmed round', exact: true }).click();
    await expect(page.locator('[data-voting-current-round]')).toHaveAttribute('data-voting-current-round', '2');
    await expect(voter.getByRole('button', { name: 'Submit vote', exact: true })).toBeVisible();
    await voter.getByRole('radio', { name: 'No', exact: true }).check();
    await voter.getByRole('button', { name: 'Submit vote', exact: true }).click();
    await expect(voter.getByRole('heading', { name: 'Your voice is in.', exact: true })).toBeVisible();
    await page.getByLabel('Review round', { exact: true }).selectOption('1');
    await expect(page.locator('[data-voting-history-round="1"] [data-vote-total]')).toHaveAttribute('data-vote-total', '1');
    event = await current(event.id); expect(event.questions[0].totalVotes).toBe(1);
  } finally { await audience.close(); }
});

test('a full multi-question ballot can be answered again in a separate round without rate-limit carryover', async () => {
  const created = await api('/admin/voting', { title: 'Multi-question rounds', questions: Array.from({ length: 10 }, (_, index) => ({ text: `Perspective ${index + 1}?`, options: ['Yes', 'No'] })) });
  expect(created.status).toBe(200);
  let event = await act(created.body.event.id, 'open');
  const participant = crypto.randomUUID();
  async function answerAll() {
    const responses = await Promise.all(event.questions.map(question => api(`/voting/${event.code}/vote`, { participant_id: participant, questionId: question.id, optionId: question.options[0].id, round: event.currentRound }, false)));
    expect(responses.map(response => response.status)).toEqual(Array(10).fill(200));
  }
  await answerAll();
  await act(event.id, 'close');
  event = await act(event.id, 'newRound', { confirmed: true });
  await answerAll();
  const latest = await current(event.id);
  const history = await current(event.id, 1);
  expect(latest.questions.map(question => question.totalVotes)).toEqual(Array(10).fill(1));
  expect(history.history.questions.map(question => question.totalVotes)).toEqual(Array(10).fill(1));
  expect((await vote(event, participant)).body.duplicate).toBe(true);
  expect((await vote(event, participant, 1)).status).toBe(409);
});
