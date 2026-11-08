import { expect, test } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

const worker = process.env.SPILL_E2E_WORKER_URL;
const secret = process.env.SPILL_E2E_API_SECRET;
let token;
async function call(path, body, admin = true, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(worker + path, { method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(admin ? { 'X-Admin-Token': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function create(title = 'A question worth asking') {
  const result = await call('/admin/voting', { title, sessionId: null, questions: [{ text: 'What should we explore?', options: ['Faith', 'Community', 'Purpose'] }] });
  expect(result.status).toBe(200);
  return result.body.event;
}
async function current(id) {
  const response = await call(`/admin/voting/${id}`);
  expect(response.status).toBe(200);
  return response.body.event;
}
async function action(id, action, fields = {}) {
  const state = await current(id);
  return call(`/admin/voting/${id}`, { action, expectedRevision: state.revision, ...fields });
}
const vote = (event, participant = crypto.randomUUID(), option = 0) => call(`/voting/${event.code}/vote`, {
  questionId: event.questions[0].id, optionId: event.questions[0].options[option].id, participant_id: participant,
}, false);
const publicEvent = async code => call(`/voting/${code}`, undefined, false);
function expectRedacted(event) {
  for (const question of event.questions) {
    expect(question.totalVotes).toBeUndefined();
    for (const option of question.options) { expect(option.votes).toBeUndefined(); expect(option.percentage).toBeUndefined(); }
  }
}

test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  if (!worker || !secret) throw Error('Use the isolated fixture runner.');
  const result = await call('/admin/auth/login', { password: E2E.adminPassword }, false);
  expect(result.status).toBe(200); token = result.body.token;
});

test('hidden voting is isolated, retry-safe and absent from public result APIs', async () => {
  const event = await create();
  const other = await create('Separate ballot');
  expect((await publicEvent(event.code)).status).toBe(404);
  expect((await action(event.id, 'open')).status).toBe(200);
  const before = (await publicEvent(event.code)).body.event;
  expectRedacted(before);
  const participant = crypto.randomUUID();
  expect((await vote(event, participant)).status).toBe(200);
  expect((await vote(event, participant)).status).toBe(200);
  expect((await vote(event, participant, 1)).status).toBe(409);
  const wrongQuestion = await call(`/voting/${event.code}/vote`, { questionId: other.questions[0].id, optionId: other.questions[0].options[0].id, participant_id: crypto.randomUUID() }, false);
  expect([400, 404]).toContain(wrongQuestion.status);
  const after = (await publicEvent(event.code)).body.event;
  expectRedacted(after);
  expect(after.version).toBe(before.version);
  expect((await current(event.id)).questions[0].totalVotes).toBe(1);
  expect((await current(other.id)).questions[0].totalVotes).toBe(0);
  expect((await call(`/admin/voting/${event.id}`, undefined, false)).status).toBe(401);
  expect((await action(event.id, 'present', { questionId: event.questions[0].id, content: 'results', reveal: true })).status).toBe(409);
  expect((await action(event.id, 'close')).status).toBe(200);
  expect((await vote(event)).status).toBe(409);
  expect((await vote(event, participant)).status).toBe(200);
  expectRedacted((await publicEvent(event.code)).body.event);
  expect((await action(event.id, 'present', { questionId: event.questions[0].id, content: 'results', reveal: true })).status).toBe(200);
  expect((await publicEvent(event.code)).body.event.questions[0].totalVotes).toBe(1);
});

test('live publication, visibility reversal and moderator revision conflicts are explicit', async () => {
  const event = await create();
  expect((await action(event.id, 'open')).status).toBe(200);
  expect((await action(event.id, 'settings', { settings: { resultsMode: 'live' } })).status).toBe(200);
  expect((await action(event.id, 'present', { questionId: event.questions[0].id, content: 'results', reveal: false })).status).toBe(200);
  await Promise.all([vote(event, crypto.randomUUID(), 0), vote(event, crypto.randomUUID(), 1), vote(event, crypto.randomUUID(), 2)]);
  const visible = (await publicEvent(event.code)).body.event;
  expect(visible.questions[0].options.map(option => option.votes)).toEqual([1, 1, 1]);
  expect(visible.questions[0].options.reduce((sum, option) => sum + option.percentage, 0)).toBe(100);
  const version = await current(event.id);
  const conflicts = await Promise.all(['bars', 'donut'].map(visualization => call(`/admin/voting/${event.id}`, { action: 'settings', expectedRevision: version.revision, settings: { visualization } })));
  expect(conflicts.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await action(event.id, 'settings', { settings: { resultsMode: 'hidden' } })).status).toBe(200);
  const hidden = (await publicEvent(event.code)).body.event;
  expect(hidden.previouslyPublic).toBe(true);
  expectRedacted(hidden);
  expect((await action(event.id, 'delete', { password: 'incorrect-password' })).status).toBe(401);
  expect((await action(event.id, 'delete', { password: E2E.adminPassword })).status).toBe(200);
  expect((await publicEvent(event.code)).status).toBe(404);
});

for (const concurrency of [10, 25, 50, 100]) {
  test(`${concurrency} concurrent voters retain accurate totals and update the projector`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const event = await create(`Disposable concurrency ${concurrency}`);
    expect((await action(event.id, 'open')).status).toBe(200);
    expect((await action(event.id, 'settings', { settings: { resultsMode: 'live' } })).status).toBe(200);
    expect((await action(event.id, 'present', { questionId: event.questions[0].id, content: 'results', reveal: false })).status).toBe(200);
    await page.goto(`/vote/${event.code}/stage`);
    await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total', '0');
    const started = performance.now();
    const endpoint = `${E2E.baseURL}/api/voting/public/${event.code}/vote`;
    const results = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const at = performance.now();
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: E2E.baseURL },
        body: JSON.stringify({ questionId: event.questions[0].id, optionId: event.questions[0].options[index % 3].id }) });
      await response.json();
      return { status: response.status, latencyMs: performance.now() - at, cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
    }));
    const acknowledged = performance.now();
    await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total', String(concurrency), { timeout: 15000 });
    const observed = performance.now();
    expect(results.filter(r => r.status === 200)).toHaveLength(concurrency);
    const duplicate = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: E2E.baseURL, Cookie: results[0].cookie },
      body: JSON.stringify({ questionId: event.questions[0].id, optionId: event.questions[0].options[0].id }) });
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).duplicate).toBe(true);
    const final = await current(event.id);
    expect(final.questions[0].totalVotes).toBe(concurrency);
    expect(final.questions[0].options.reduce((sum, option) => sum + option.votes, 0)).toBe(concurrency);
    const sorted = results.map(r => r.latencyMs).sort((a, b) => a - b);
    const report = { concurrency, successes: results.filter(r => r.status === 200).length, errors: results.filter(r => r.status !== 200).length,
      p50Ms: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))],
      acknowledgedMs: acknowledged - started, browserObservedFromStartMs: observed - started, browserObservedAfterLastAckMs: observed - acknowledged,
      totalVotes: final.questions[0].totalVotes, duplicateRetryInflation: 0, target: 'loopback Next voting proxy, disposable Worker and local D1' };
    await testInfo.attach(`voting-load-${concurrency}.json`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    console.log(JSON.stringify({ votingLoad: report }));
    expect((await action(event.id, 'close')).status).toBe(200);
    expect((await vote(event)).status).toBe(409);
    expect((await current(event.id)).questions[0].totalVotes).toBe(concurrency);
  });
}
