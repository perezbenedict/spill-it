import { beforeEach, describe, expect, it } from 'vitest';
import { createD1 } from '../helpers/d1.js';
import { handleVotingAdmin, handleVotingPublic, votingPercentages } from '../../api/voting.js';

const ADMIN = { user: { id: 'admin-1', role: 'admin' } };
const PARTICIPANT = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_2 = '22222222-2222-4222-8222-222222222222';
const OPTION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPTION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const QUESTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();

function jsonRequest(body) {
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedEvent(env, { status = 'draft', scheduledOpenAt = null, deadlineAt = null, instructions = '' } = {}) {
  await env.DB.prepare(
    'INSERT INTO voting_events(id,public_code,title,status,session_id,settings,presentation,created_at,updated_at,scheduled_open_at,deadline_at,instructions,current_round) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)'
  ).bind(EVENT_ID, 'ABCDEFGH', 'Which topic this Sunday', status, null, '{"resultsMode":"hidden"}', '{"questionId":"' + QUESTION + '","content":"hidden","revealId":null}', iso(-60000), iso(-60000), scheduledOpenAt, deadlineAt, instructions).run();
  await env.DB.prepare('INSERT INTO voting_rounds(event_id,round_number,created_at) VALUES(?,?,?)').bind(EVENT_ID, 1, iso(-60000)).run();
  await env.DB.prepare('INSERT INTO voting_questions(id,event_id,text,position) VALUES(?,?,?,0)').bind(QUESTION, EVENT_ID, 'Pick the Sunday topic').run();
  await env.DB.prepare('INSERT INTO voting_options(id,question_id,label,position,description) VALUES(?,?,?,?,?)').bind(OPTION_A, QUESTION, 'Faith at work', 0, 'How faith shows up Monday morning').run();
  await env.DB.prepare('INSERT INTO voting_options(id,question_id,label,position) VALUES(?,?,?,1)').bind(OPTION_B, QUESTION, 'Money and mindset').run();
}

async function vote(env, optionId = OPTION_A, participant = PARTICIPANT) {
  return handleVotingPublic(
    jsonRequest({ questionId: QUESTION, optionId, round: 1, participant_id: participant }),
    env,
    'ABCDEFGH',
    'vote'
  );
}

async function readPublic(env) {
  return handleVotingPublic(new Request('https://example.test/api'), env, 'ABCDEFGH', undefined);
}

let env;
beforeEach(async () => {
  env = createD1();
});

describe('pre-Sunday topic voting schedule', () => {
  it('keeps a scheduled event closed until its opening time', async () => {
    await seedEvent(env, { scheduledOpenAt: iso(60_000) });
    const response = await vote(env);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/not opened/i);
    const row = await env.DB.prepare('SELECT status FROM voting_events WHERE id=?').bind(EVENT_ID).first();
    expect(row.status).toBe('draft');
  });

  it('auto-opens at the scheduled time on the first ballot without a prior read', async () => {
    await seedEvent(env, { scheduledOpenAt: iso(-1000) });
    const response = await vote(env);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    const row = await env.DB.prepare('SELECT status FROM voting_events WHERE id=?').bind(EVENT_ID).first();
    expect(row.status).toBe('open');
  });

  it('auto-opens on a public read and reports the schedule to participants', async () => {
    await seedEvent(env, { scheduledOpenAt: iso(-1000), deadlineAt: iso(3_600_000), instructions: 'Vote for one topic before Sunday.' });
    const response = await readPublic(env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.status).toBe('open');
    expect(body.event.schedule.deadlineAt).toBeTruthy();
    expect(body.event.schedule.instructions).toBe('Vote for one topic before Sunday.');
    expect(body.event.deadlinePassed).toBe(false);
  });

  it('closes an open event at the deadline on read and refuses further ballots', async () => {
    await seedEvent(env, { status: 'open', deadlineAt: iso(-5000) });
    const read = await readPublic(env);
    expect(read.status).toBe(200);
    expect((await read.json()).event.status).toBe('closed');

    const response = await vote(env);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/deadline/i);
    const votes = await env.DB.prepare('SELECT COUNT(*) AS n FROM voting_votes').first();
    expect(Number(votes.n)).toBe(0);
  });

  it('closes at the deadline even when the ballot arrives before any read', async () => {
    await seedEvent(env, { status: 'open', deadlineAt: iso(-1) });
    const response = await vote(env);
    expect(response.status).toBe(409);
    const row = await env.DB.prepare('SELECT status,closed_at FROM voting_events WHERE id=?').bind(EVENT_ID).first();
    expect(row.status).toBe('closed');
    expect(row.closed_at).toBeTruthy();
    const activity = await env.DB.prepare("SELECT action FROM admin_activity WHERE target_id=?").bind(EVENT_ID).all();
    expect(activity.results.map(item => item.action)).toContain('voting_deadline_close');
  });

  it('accepts ballots while open and before the deadline', async () => {
    await seedEvent(env, { status: 'open', deadlineAt: iso(600_000) });
    const response = await vote(env);
    expect(response.status).toBe(200);
    expect((await response.json()).duplicate).toBe(false);
  });

  it('rejects a deadline that is not after the opening time', async () => {
    await seedEvent(env, { status: 'open' });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'schedule', expectedRevision: 0, scheduledOpenAt: iso(600_000), deadlineAt: iso(300_000) }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/after the voting opening/i);
  });

  it('rejects extending an open event to an already-passed deadline', async () => {
    // The stored deadline is still in the future, so the lazy closer does not
    // fire first and the moderator's request itself is what must be refused.
    await seedEvent(env, { status: 'open', deadlineAt: iso(600_000) });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'schedule', expectedRevision: 0, deadlineAt: iso(-500) }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/already passed/i);
  });

  it('stores instructions and deadlines set by a moderator', async () => {
    await seedEvent(env, { status: 'draft' });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'schedule', expectedRevision: 0, scheduledOpenAt: iso(60_000), deadlineAt: iso(86_400_000), instructions: 'One vote per browser.' }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.schedule.instructions).toBe('One vote per browser.');
    expect(body.event.schedule.deadlineAt).toBeTruthy();
  });

  it('ignores schedule keys that were not sent so a partial edit cannot clear a deadline', async () => {
    await seedEvent(env, { status: 'open', deadlineAt: iso(600_000), instructions: 'Keep me' });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'schedule', expectedRevision: 0, instructions: 'Updated' }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.schedule.instructions).toBe('Updated');
    expect(body.event.schedule.deadlineAt).toBeTruthy();
  });
});

describe('moderator topic confirmation', () => {
  it('refuses to confirm before voting closes', async () => {
    await seedEvent(env, { status: 'open' });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'confirm', expectedRevision: 0, optionId: OPTION_A }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Close voting/i);
  });

  it('refuses to confirm an empty poll', async () => {
    await seedEvent(env, { status: 'closed' });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'confirm', expectedRevision: 0, optionId: OPTION_A }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/no votes/i);
  });

  it('requires an explicit choice on a tied result', async () => {
    await seedEvent(env, { status: 'open' });
    await vote(env, OPTION_A);
    await vote(env, OPTION_B, PARTICIPANT_2);
    const closed = await handleVotingAdmin(
      jsonRequest({ action: 'close', expectedRevision: 0 }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(closed.status).toBe(200);

    const tied = await handleVotingAdmin(
      jsonRequest({ action: 'confirm', expectedRevision: 1, optionId: OPTION_B }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(tied.status).toBe(409);
    expect((await tied.json()).error).toMatch(/tied/i);
  });

  it('confirms a clear winner only through an explicit moderator action', async () => {
    await seedEvent(env, { status: 'open' });
    await vote(env, OPTION_A);
    await vote(env, OPTION_A, PARTICIPANT_2);
    const closed = await handleVotingAdmin(
      jsonRequest({ action: 'close', expectedRevision: 0 }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(closed.status).toBe(200);

    const response = await handleVotingAdmin(
      jsonRequest({ action: 'confirm', expectedRevision: 1, optionId: OPTION_A }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.schedule.confirmedOptionId).toBe(OPTION_A);
    expect(body.event.schedule.confirmedAt).toBeTruthy();
    // The active discussion topic is never rewritten by confirmation.
    const session = await env.DB.prepare('SELECT topic FROM discussion_sessions WHERE id IS NOT NULL LIMIT 1').first();
    expect(session ?? null).toBeNull();
  });

  it('rejects confirming an option that is not on this ballot', async () => {
    await seedEvent(env, { status: 'closed' });
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'confirm', expectedRevision: 0, optionId: '99999999-9999-4999-8999-999999999999' }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(400);
  });

  it('allows withdrawing a confirmation', async () => {
    await seedEvent(env, { status: 'open' });
    await vote(env, OPTION_A);
    await handleVotingAdmin(
      jsonRequest({ action: 'close', expectedRevision: 0 }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    await env.DB.prepare("UPDATE voting_events SET confirmed_option_id=?,confirmed_at=? WHERE id=?").bind(OPTION_A, iso(-1000), EVENT_ID).run();
    const response = await handleVotingAdmin(
      jsonRequest({ action: 'confirm', expectedRevision: 1, confirmed: false }),
      env, ADMIN, EVENT_ID, () => ({ ok: true })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).event.schedule.confirmedOptionId).toBeNull();
  });
});

describe('existing voting behaviour stays intact', () => {
  it('still reports percentage rounding exactly as before', () => {
    expect(votingPercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(votingPercentages([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('still refuses a second vote from the same browser in a round', async () => {
    await seedEvent(env, { status: 'open' });
    expect((await vote(env)).status).toBe(200);
    const second = await vote(env, OPTION_B);
    expect(second.status).toBe(409);
    expect((await second.json()).error).toMatch(/already voted/i);
  });

  it('still rejects a duplicate identical ballot as idempotent', async () => {
    await seedEvent(env, { status: 'open' });
    expect((await vote(env)).status).toBe(200);
    const repeat = await vote(env);
    expect(repeat.status).toBe(200);
    expect((await repeat.json()).duplicate).toBe(true);
  });

  it('still hides results from participants until revealed', async () => {
    await seedEvent(env, { status: 'open' });
    await vote(env);
    const body = await (await readPublic(env)).json();
    const question = body.event.questions[0];
    expect(question.resultsVisible).toBe(false);
    expect(question.options[0].votes).toBeUndefined();
  });

  it('still refuses ballots on a closed event', async () => {
    await seedEvent(env, { status: 'closed' });
    const response = await vote(env);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/closed/i);
  });
});
