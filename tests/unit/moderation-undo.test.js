import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import worker from '../../api/worker';
import { credentialVersion } from '../../api/platform';
import { createD1 } from '../helpers/d1.js';

const SECRET = 'local-api';
const PASSWORD = 'local-admin-password';
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUBMISSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_SUBMISSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ADMIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN = 'admin-token';

let env;

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  env = createD1();
  env.SPILL_API_SECRET = SECRET;
  env.SPILL_ADMIN_PASSWORD = PASSWORD;

  const version = await credentialVersion(env);
  const stamp = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO admin_users(id,email,password_hash,role,created_at) VALUES(?,?,?, 'admin', ?)"
  ).bind(ADMIN_ID, 'admin@example.test', 'unused-hash', stamp).run();
  await env.DB.prepare(
    'INSERT INTO admin_sessions(token,credential_version,user_id,created_at,expires_at) VALUES(?,?,?,?,?)'
  ).bind(TOKEN, version, ADMIN_ID, stamp, '2099-01-01T00:00:00.000Z').run();
  await env.DB.prepare(
    "INSERT INTO discussion_sessions(id,title,topic,public_code,status) VALUES(?, 'Session', 'Topic', 'ABCDEFGH', 'live')"
  ).bind(SESSION_ID).run();
  await env.DB.prepare(
    'INSERT INTO submissions(id,revision,session_id,participant_id,nickname,category,content,moderation_status,created_at,updated_at) ' +
      "VALUES(?,0,?, 'participant-1', 'Anonymous', 'question', 'How do I prepare?', 'hidden', ?, ?)"
  ).bind(SUBMISSION_ID, SESSION_ID, stamp, stamp).run();
  await env.DB.prepare(
    'INSERT INTO submissions(id,revision,session_id,participant_id,nickname,category,content,moderation_status,created_at,updated_at) ' +
      "VALUES(?,0,?, 'participant-2', 'Anonymous', 'opinion', 'Already on screen.', 'approved', ?, ?)"
  ).bind(OTHER_SUBMISSION_ID, SESSION_ID, stamp, stamp).run();
  await env.DB.prepare(
    'INSERT INTO presentation_state(session_id,current_submission_id,updated_at) VALUES(?,?,?)'
  ).bind(SESSION_ID, OTHER_SUBMISSION_ID, stamp).run();
});

function patch(body) {
  return new Request(`https://local/admin/submissions/${SUBMISSION_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET}`,
      'X-Admin-Token': TOKEN,
    },
    body: JSON.stringify(body),
  });
}

function get() {
  return new Request(`https://local/admin/submissions/${SUBMISSION_ID}`, {
    headers: { Authorization: `Bearer ${SECRET}`, 'X-Admin-Token': TOKEN },
  });
}

async function historyRows() {
  const { results } = await env.DB.prepare(
    'SELECT actor_id, from_status, to_status, action FROM moderation_history WHERE submission_id = ? ORDER BY created_at'
  ).bind(SUBMISSION_ID).all();
  return results;
}

describe('moderation undo (restore to Pending Review)', () => {
  it('restores a rejected contribution to pending without publishing it', async () => {
    const response = await worker.fetch(patch({ moderation_status: 'pending', expectedRevision: 0 }), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    // Undo lands on Pending Review - never approved, so nothing is published
    // or queued for presentation without a separate moderator approval.
    expect(body.row.moderation_status).toBe('pending');
    expect(body.row.revision).toBe(1);
    const pointer = await env.DB.prepare('SELECT current_submission_id FROM presentation_state WHERE session_id = ?').bind(SESSION_ID).first();
    expect(pointer.current_submission_id).toBe(OTHER_SUBMISSION_ID);

    const history = await historyRows();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      actor_id: ADMIN_ID,
      from_status: 'hidden',
      to_status: 'pending',
      action: 'restore',
    });
  });

  it('records an auditable trail for reject and approve transitions', async () => {
    await worker.fetch(patch({ moderation_status: 'approved', expectedRevision: 0 }), env);
    await worker.fetch(patch({ moderation_status: 'hidden', expectedRevision: 1 }), env);
    const history = await historyRows();
    expect(history.map(row => row.action)).toEqual(['approve', 'hide']);
    expect(history[0]).toMatchObject({ from_status: 'hidden', to_status: 'approved' });
    expect(history[1]).toMatchObject({ from_status: 'approved', to_status: 'hidden' });
  });

  it('keeps the projector pointer invariant: rejecting clears it only for its own row', async () => {
    await env.DB.prepare('UPDATE presentation_state SET current_submission_id = ? WHERE session_id = ?').bind(SUBMISSION_ID, SESSION_ID).run();
    const response = await worker.fetch(patch({ moderation_status: 'hidden', expectedRevision: 0 }), env);
    expect(response.status).toBe(200);
    const pointer = await env.DB.prepare('SELECT current_submission_id FROM presentation_state WHERE session_id = ?').bind(SESSION_ID).first();
    expect(pointer.current_submission_id).toBeNull();
    // The rejected row itself is hidden, not pending: no accidental restore.
    const row = await env.DB.prepare('SELECT moderation_status FROM submissions WHERE id = ?').bind(SUBMISSION_ID).first();
    expect(row.moderation_status).toBe('hidden');
    // A hidden->hidden patch is not a transition, so no history noise.
    expect(await historyRows()).toHaveLength(0);
  });

  it('writes no history when a concurrent change wins (stale revision)', async () => {
    const response = await worker.fetch(patch({ moderation_status: 'pending', expectedRevision: 5 }), env);
    expect(response.status).toBe(409);
    expect(await historyRows()).toHaveLength(0);
    const row = await env.DB.prepare('SELECT moderation_status, revision FROM submissions WHERE id = ?').bind(SUBMISSION_ID).first();
    expect(row).toMatchObject({ moderation_status: 'hidden', revision: 0 });
  });

  it('refuses invalid statuses and non-admin callers', async () => {
    const invalid = await worker.fetch(patch({ moderation_status: 'archived', expectedRevision: 0 }), env);
    expect(invalid.status).toBe(400);

    const noAdmin = await worker.fetch(
      new Request(`https://local/admin/submissions/${SUBMISSION_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ moderation_status: 'pending', expectedRevision: 0 }),
      }),
      env
    );
    expect(noAdmin.status).toBe(401);
    expect(await historyRows()).toHaveLength(0);
  });

  it('serves the moderation trail with the contribution', async () => {
    await worker.fetch(patch({ moderation_status: 'approved', expectedRevision: 0 }), env);
    const response = await worker.fetch(get(), env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.row.moderation_status).toBe('approved');
    expect(body.history).toHaveLength(1);
    expect(body.history[0].action).toBe('approve');
    // The participant identity stays out of every admin response.
    expect(body.row.participant_id).toBeUndefined();
  });
});
