/* SPILL API — single-file Cloudflare Worker, no dependencies, no build step.
   Binds a D1 database as env.DB (see wrangler.toml). Every route except
   /health requires `Authorization: Bearer <SPILL_API_SECRET>`; admin routes
   additionally require the `X-Admin-Token` header of a live admin_sessions
   row. Fixed friendly error messages only — SQL, ids and stacks never leave
   this process. */

import { handlePlatform, handleEngagement, exportSession, credentialVersion, authAdmission, clearAuthAdmission } from './platform.js';
import { handleVotingCollection, handleVotingAdmin, handleVotingPublic } from './voting.js';
import { handleActivity } from './activity.js';
import { handleStandaloneStages } from './stages.js';

const KNOWN_CATEGORIES = ['question', 'opinion', 'challenge', 'twocents'];
const SESSION_STATUSES = ['draft', 'live', 'paused', 'closed'];
const MODERATION_STATUSES = ['pending', 'approved', 'hidden'];

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_LENGTH = 8;
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

const DEFAULT_MIN_CONTENT_LENGTH = 3;
const DEFAULT_MAX_CONTENT_LENGTH = 1000;
const MAX_NICKNAME_LENGTH = 60;
const MAX_TITLE_LENGTH = 200;
const MAX_TOPIC_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_WELCOME_MESSAGE_LENGTH = 1000;

const RATE_LIMIT_MAX_SUBMISSIONS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const DUPLICATE_WINDOW_SECONDS = 600;
const NICKNAME_RESERVATION_HOURS = 24;

const ADMIN_SESSION_HOURS = 7 * 24;
const PBKDF2_ITERATIONS = 100000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
const DESTRUCTIVE_AUTH_MAX_FAILURES = 5;
const DESTRUCTIVE_AUTH_FAILURE_WINDOW_SECONDS = 15 * 60;
// The admin_users.email column is NOT NULL, but with a single shared password
// this address is internal only - never displayed and never accepted as input.
const ADMIN_EMAIL_PLACEHOLDER = 'admin@spill.local';

// Status transition matrix. "closed" can be reopened with an explicit
// Reopen action (POST /admin/sessions/:id/reopen), but we keep a guard
// that only one discussion may be live at a time.
const ALLOWED_TRANSITIONS = {
  draft: ['live'],
  live: ['paused', 'closed'],
  paused: ['live', 'closed'],
  closed: ['live'],
};

// Fixed, friendly copy. Internal identifiers never appear in responses.
const MSG_SUBMISSION_GENERIC =
  'Something went wrong and your thought was not saved. Please try again.';
const MSG_RATE_LIMITED = 'Slow down a moment - try again shortly.';
const MSG_BAD_BODY = 'Check your submission and try again.';
const MSG_SESSION_GENERIC = 'Could not save this discussion. Please try again.';
const MSG_INVALID = 'Invalid contribution.';
const MSG_NICKNAME_TAKEN = "That nickname's already taken. Try another one.";
const MSG_LOGIN_INVALID = 'Incorrect password.';

function json(body, status = 200, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function clampLength(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1000, Math.max(1, parsed));
}

// Same normalization the Next app uses for duplicate suppression.
function normalizeContent(content) {
  return String(content).replace(/\s+/g, ' ').trim();
}

function displayNickname(nickname) {
  return String(nickname == null ? '' : nickname)
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeNickname(nickname) {
  return displayNickname(nickname).toLocaleLowerCase('en-US');
}

function nicknameReservationExpiry() {
  return new Date(Date.now() + NICKNAME_RESERVATION_HOURS * 60 * 60 * 1000).toISOString();
}

// A single INSERT owns the race. The participant-key conflict lets a returning
// browser refresh or change its own nickname; the normalized-name conflict only
// updates when the existing owner is that same anonymous participant. If a
// participant changes to someone else's name, SQLite aborts the statement and
// preserves their previous reservation.
async function reserveSessionNickname(env, { sessionId, participantId, nickname }) {
  const display = displayNickname(nickname);
  const normalized = normalizeNickname(display);
  if (!display || display.length > MAX_NICKNAME_LENGTH || !normalized) {
    return { ok: false, invalid: true };
  }

  const now = nowIso();
  const expiresAt = nicknameReservationExpiry();
  await env.DB.prepare(
    'DELETE FROM nickname_reservations WHERE session_id = ? AND expires_at <= ?'
  )
    .bind(sessionId, now)
    .run();

  // Normalize legacy spellings once per session. Thereafter the reservation
  // index owns lookups; event growth no longer adds a submission scan per send.
  const backfilled = await env.DB.prepare('SELECT session_id FROM nickname_backfills WHERE session_id=?').bind(sessionId).first();
  if (!backfilled) {
    const { results: legacyNames } = await env.DB.prepare('SELECT participant_id,nickname FROM submissions WHERE session_id=? ORDER BY created_at,id').bind(sessionId).all();
    const statements = legacyNames.flatMap(row => [
      env.DB.prepare('INSERT OR IGNORE INTO nickname_reservations(session_id,normalized_nickname,participant_id,display_nickname,reserved_at,refreshed_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(sessionId, normalizeNickname(row.nickname), row.participant_id, displayNickname(row.nickname), now, now, expiresAt),
      env.DB.prepare('INSERT OR IGNORE INTO legacy_nickname_claims(session_id,normalized_nickname,participant_id) VALUES(?,?,?)').bind(sessionId, normalizeNickname(row.nickname), row.participant_id),
    ]);
    for (let index = 0; index < statements.length; index += 100) await env.DB.batch(statements.slice(index, index + 100));
    await env.DB.prepare('INSERT OR IGNORE INTO nickname_backfills(session_id) VALUES(?)').bind(sessionId).run();
  }
  const historicalOwner = await env.DB.prepare('SELECT participant_id FROM legacy_nickname_claims WHERE session_id=? AND normalized_nickname=? AND participant_id<>? LIMIT 1').bind(sessionId, normalized, participantId).first();
  if (historicalOwner) return { ok: false, taken: true };

  try {
    await env.DB.prepare(
      'INSERT INTO nickname_reservations (' +
        'session_id, normalized_nickname, participant_id, display_nickname, ' +
        'reserved_at, refreshed_at, expires_at' +
        ') VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(session_id, participant_id) DO UPDATE SET ' +
        'normalized_nickname = excluded.normalized_nickname, ' +
        'display_nickname = excluded.display_nickname, ' +
        'refreshed_at = excluded.refreshed_at, expires_at = excluded.expires_at ' +
        'ON CONFLICT(session_id, normalized_nickname) DO UPDATE SET ' +
        'display_nickname = excluded.display_nickname, ' +
        'refreshed_at = excluded.refreshed_at, expires_at = excluded.expires_at ' +
        'WHERE nickname_reservations.participant_id = excluded.participant_id'
    )
      .bind(sessionId, normalized, participantId, display, now, now, expiresAt)
      .run();
  } catch {
    const owner = await env.DB.prepare(
      'SELECT participant_id FROM nickname_reservations ' +
        'WHERE session_id = ? AND normalized_nickname = ?'
    )
      .bind(sessionId, normalized)
      .first()
      .catch(() => null);
    return owner && owner.participant_id !== participantId
      ? { ok: false, taken: true }
      : { ok: false };
  }

  const reservation = await env.DB.prepare(
    'SELECT participant_id, display_nickname FROM nickname_reservations ' +
      'WHERE session_id = ? AND normalized_nickname = ?'
  )
    .bind(sessionId, normalized)
    .first();
  if (!reservation || reservation.participant_id !== participantId) {
    return { ok: false, taken: true };
  }
  return { ok: true, nickname: reservation.display_nickname };
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function serializeSession(row) {
  if (!row) return null;
  return {
    ...row,
    available_categories: parseJson(row.available_categories, []),
    configuration: parseJson(row.configuration, {}),
  };
}

function serializeSubmission(row) {
  if (!row) return null;
  const { participant_id: _participantId, request_id: _requestId, ...publicRow } = row;
  void _participantId; void _requestId;
  return {
    ...publicRow,
    is_pinned: row.is_pinned === 1,
    hidden_from_presentation: row.hidden_from_presentation === 1,
  };
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function uniqueUuidArray(value, maxLength) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxLength) return null;
  if (!value.every(isUuid)) return null;
  const unique = [...new Set(value)];
  return unique.length === value.length ? unique : null;
}

function randomHex(bytesLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/* ---------- auth ---------- */

function isSecretAuthorized(request, env) {
  if (!env.SPILL_API_SECRET) return false; // refuse everything if the secret is unset
  return request.headers.get('Authorization') === 'Bearer ' + env.SPILL_API_SECRET;
}

async function hashPassword(password, saltHex, iterations) {
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return `pbkdf2$${iterations}$${saltHex}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let candidate;
  try {
    candidate = await hashPassword(password, parts[2], iterations);
  } catch {
    return false;
  }
  // Constant-time-ish compare; lengths always match for our own scheme.
  const expected = parts[3];
  const actual = candidate.split('$')[3];
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

// Resolves the X-Admin-Token header to a live admin_sessions row, pruning the
// row when expired. Null means unauthenticated or expired.
async function requireAdminUser(request, env) {
  const token = request.headers.get('X-Admin-Token');
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT t.token AS token, t.expires_at AS expires_at, t.credential_version, ' +
      'u.id AS id, u.email AS email, u.role AS role ' +
      'FROM admin_sessions t JOIN admin_users u ON u.id = t.user_id ' +
      'WHERE t.token = ?'
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at <= nowIso() || row.credential_version !== await credentialVersion(env)) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { token: row.token, user: { id: row.id, email: row.email, role: row.role } };
}


// Password equality that walks every byte: both sides are encoded to bytes
// and XOR-compared over the full (padded) length, with the length difference
// seeded into the diff, so there is no early-exit signal beyond length.
function constantTimeEquals(a, b) {
  const bytesA = new TextEncoder().encode(String(a));
  const bytesB = new TextEncoder().encode(String(b));
  const length = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (bytesA[i] || 0) ^ (bytesB[i] || 0);
  }
  return diff === 0;
}

async function verifyDestructiveAdminPassword(request, env, admin, password) {
  if (admin.user.role !== 'admin') {
    return { response: json({ error: 'Administrator access is required.' }, 403) };
  }

  const distributedLimit = await authAdmission(env, `destructive:${admin.user.id}`, DESTRUCTIVE_AUTH_MAX_FAILURES, DESTRUCTIVE_AUTH_FAILURE_WINDOW_SECONDS);
  if (distributedLimit) return { response: distributedLimit };

  if (!password) {
    return { response: json({ error: 'Admin password is required.' }, 401) };
  }

  const user = await env.DB.prepare('SELECT id, password_hash FROM admin_users WHERE id = ?')
    .bind(admin.user.id)
    .first();
  const matchesHash = !env.SPILL_ADMIN_PASSWORD && user ? await verifyPassword(password, user.password_hash) : false;
  const matchesSecret =
    !matchesHash &&
    !!env.SPILL_ADMIN_PASSWORD &&
    constantTimeEquals(password, env.SPILL_ADMIN_PASSWORD);

  if (!user || (!matchesHash && !matchesSecret)) {
    return { response: json({ error: 'Incorrect admin password.' }, 401) };
  }

  await clearAuthAdmission(env, `destructive:${admin.user.id}`, DESTRUCTIVE_AUTH_FAILURE_WINDOW_SECONDS);
  return { ok: true };
}

async function handleLogin(request, env) {
  const distributedLimit = await authAdmission(env, 'admin-login', LOGIN_MAX_FAILURES, LOGIN_FAILURE_WINDOW_SECONDS);
  if (distributedLimit) return distributedLimit;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }
  // Single shared admin password - no email or username is accepted.
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    return json({ error: MSG_LOGIN_INVALID }, 401);
  }

  // Documented bootstrap: seed the first admin when the table is empty and
  // the password secret is set.
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_users').first();
  if ((countRow?.n ?? 0) === 0 && env.SPILL_ADMIN_PASSWORD) {
    try {
      await env.DB.prepare(
        'INSERT INTO admin_users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(
          crypto.randomUUID(),
          ADMIN_EMAIL_PLACEHOLDER,
          await hashPassword(env.SPILL_ADMIN_PASSWORD, randomHex(16), PBKDF2_ITERATIONS),
          'admin',
          nowIso()
        )
        .run();
    } catch {
      // Concurrent seed attempt - fall through to the credential check.
    }
  }

  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, role FROM admin_users ORDER BY created_at ASC LIMIT 1'
  ).first();

  const matchesHash = !env.SPILL_ADMIN_PASSWORD && user ? await verifyPassword(password, user.password_hash) : false;
  const matchesSecret =
    !matchesHash && !!env.SPILL_ADMIN_PASSWORD && constantTimeEquals(password, env.SPILL_ADMIN_PASSWORD);

  if (!user || (!matchesHash && !matchesSecret)) {
    return json({ error: MSG_LOGIN_INVALID }, 401);
  }

  if (matchesSecret && !(await verifyPassword(password, user.password_hash))) {
    // Accepted via the env secret while the stored hash differs: rotate the
    // stored hash to the presented password with a fresh random salt.
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').bind(await hashPassword(password, randomHex(16), PBKDF2_ITERATIONS), user.id),
        env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(user.id),
      ]);
    } catch {
      return json({ error: 'Could not rotate administrator credentials. Try again.' }, 503);
    }
  }

  await clearAuthAdmission(env, 'admin-login', LOGIN_FAILURE_WINDOW_SECONDS);

  const token = randomHex(32); // 256-bit random admin session token
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(createdAt),
    env.DB.prepare(
      'INSERT INTO admin_sessions (token, user_id, created_at, expires_at, credential_version) VALUES (?, ?, ?, ?, ?)'
    ).bind(token, user.id, createdAt, expiresAt, await credentialVersion(env)),
  ]);

  return json({ token, expiresAt, user: { id: user.id, email: user.email, role: user.role } });
}

async function handleLogout(request, env, admin) {
  await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(admin.token).run();
  return json({ ok: true });
}

/* ---------- public ---------- */

async function handleGetSessionByCode(env, code) {
  const row = await env.DB.prepare(
    'SELECT id, public_code, title, description, welcome_message, status, ' +
      'available_categories, configuration, opens_at, closes_at, topic, created_at, updated_at ' +
      'FROM discussion_sessions WHERE public_code = ? AND status <> ?'
  )
    .bind(code, 'draft')
    .first();
  if (!row) return json({ error: 'This discussion could not be found.' }, 404);
  return json({ session: serializeSession(row) });
}

// Public: lets a participant land on the site with no typed code and be
// routed to the discussion that is open right now. Returns the most recently
// updated live session; 404 when nothing is open. Draft/paused/closed are
// never exposed here - direct links (QR /join/CODE) still reach paused ones.
async function handleGetLiveSession(env) {
  const row = await env.DB.prepare(
    'SELECT id, public_code, title, description, welcome_message, status, ' +
      'available_categories, configuration, opens_at, closes_at, topic, created_at, updated_at ' +
      'FROM discussion_sessions WHERE status = ? ORDER BY updated_at DESC LIMIT 1'
  )
    .bind('live')
    .first();
  if (!row) return json({ error: 'No discussion is open right now.' }, 404);
  return json({ session: serializeSession(row) });
}

async function handleGetRoomByCode(env, code) {
  const session = await env.DB.prepare(
    'SELECT id, public_code, title, description, welcome_message, status, ' +
      'available_categories, configuration, opens_at, closes_at, topic, created_at, updated_at ' +
      'FROM discussion_sessions WHERE public_code = ? AND status <> ?'
  )
    .bind(code, 'draft')
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);

  const { results } = await env.DB.prepare(
    'SELECT id, nickname, category, content, moderation_status, is_pinned, ' +
      'hidden_from_presentation, created_at ' +
    'FROM submissions WHERE session_id = ? AND moderation_status = ? ' +
      'AND hidden_from_presentation=0 AND id=(SELECT current_submission_id FROM presentation_state WHERE session_id=?) LIMIT 1'
  )
    .bind(session.id, 'approved', session.id)
    .all();

  const submissions = results.map(serializeSubmission);
  const pointerRow = await env.DB.prepare(
    'SELECT current_submission_id FROM presentation_state WHERE session_id = ?'
  )
    .bind(session.id)
    .first();
  const currentId = pointerRow?.current_submission_id ?? null;
  // An unapproved or screen-hidden contribution never reaches the display,
  // even when the pointer still names it.
  const currentSubmission = currentId
    ? submissions.find((row) => row.id === currentId && !row.hidden_from_presentation) ?? null
    : null;

  return json({
    session: serializeSession(session),
    submissions,
    currentId: currentSubmission ? currentId : null,
    currentSubmission,
  });
}

async function handleCreateSubmission(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const sessionCode =
    typeof body?.sessionCode === 'string' ? body.sessionCode.trim().toUpperCase() : '';
  if (!CODE_PATTERN.test(sessionCode)) {
    return json({ error: 'This discussion could not be found.' }, 404);
  }
  // The caller is the trusted Next server, which read the participant id from
  // the httpOnly cookie; the body is the only channel for it here.
  const participantId = typeof body?.participant_id === 'string' ? body.participant_id : '';
  if (!isUuid(participantId)) return json({ error: MSG_BAD_BODY }, 400);
  const requestId = typeof body?.request_id === 'string' ? body.request_id.trim() : '';
  if (!REQUEST_ID_PATTERN.test(requestId)) return json({ error: MSG_BAD_BODY }, 400);

  const session = await env.DB.prepare(
    'SELECT id, status, available_categories, configuration, closes_at ' +
      'FROM discussion_sessions WHERE public_code = ?'
  )
    .bind(sessionCode)
    .first();
  if (!session || session.status === 'draft') {
    return json({ error: 'This discussion could not be found.' }, 404);
  }

  // A replay of a completed logical attempt is successful even if the
  // discussion was paused or closed after the first response. This lookup is
  // only an optimization; the unique D1 index is the concurrency-safe guard.
  const completedAttempt = await env.DB.prepare(
    'SELECT id FROM submissions WHERE session_id = ? AND participant_id = ? AND request_id = ?'
  )
    .bind(session.id, participantId, requestId)
    .first();
  if (completedAttempt) return json({ ok: true, duplicate: true });

  const availableCategories = parseJson(session.available_categories, []);
  const configuration = parseJson(session.configuration, {});
  const minLength = clampLength(configuration.min_content_length, DEFAULT_MIN_CONTENT_LENGTH);
  const maxLength = clampLength(configuration.max_content_length, DEFAULT_MAX_CONTENT_LENGTH);

  const category = typeof body?.category === 'string' ? body.category : '';
  const requestedNickname = typeof body?.nickname === 'string' ? body.nickname : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const requestedDisplayNickname = displayNickname(requestedNickname);

  // Fixed validation copy, mirroring the Next route's zod messages.
  if (!KNOWN_CATEGORIES.includes(category)) return json({ error: MSG_BAD_BODY }, 400);
  if (!requestedDisplayNickname || requestedDisplayNickname.length > MAX_NICKNAME_LENGTH) {
    return json({ error: 'Pick a nickname before sending.' }, 400);
  }
  if (content.length > maxLength) {
    return json({ error: `Keep it under ${maxLength} characters.` }, 400);
  }
  if (content.length < minLength) {
    return json({ error: `Say a little more - at least ${minLength} characters.` }, 400);
  }

  if (session.status !== 'live') {
    return json({ error: 'Submissions are currently closed for this discussion.' }, 409);
  }
  if (session.closes_at && session.closes_at <= nowIso()) {
    return json({ error: 'Submissions are currently closed for this discussion.' }, 409);
  }
  if (!Array.isArray(availableCategories) || !availableCategories.includes(category)) {
    return json({ error: 'That type of contribution is not open right now.' }, 400);
  }

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM submissions ' +
      'WHERE session_id = ? AND participant_id = ? AND created_at >= ?'
  )
    .bind(session.id, participantId, windowStart)
    .first();
  if ((countRow?.n ?? 0) >= RATE_LIMIT_MAX_SUBMISSIONS) {
    return json({ error: MSG_RATE_LIMITED }, 429, {
      'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS),
    });
  }

  // Refresh the participant's reservation only after the rest of the request
  // is valid, preventing malformed direct requests from squatting nicknames.
  const claim = await reserveSessionNickname(env, {
    sessionId: session.id,
    participantId,
    nickname: requestedNickname,
  });
  if (claim.taken) return json({ error: MSG_NICKNAME_TAKEN, code: 'nickname_taken' }, 409);
  if (!claim.ok) return json({ error: MSG_SUBMISSION_GENERIC }, 500);
  const nickname = claim.nickname;

  // Idempotent double-click/retry protection: same content from the same
  // participant in this session recently counts as already delivered.
  const duplicateCutoff = new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000).toISOString();
  const { results: recent } = await env.DB.prepare(
    'SELECT content, created_at FROM submissions ' +
      'WHERE session_id = ? AND participant_id = ? ' +
      'ORDER BY created_at DESC LIMIT 20'
  )
    .bind(session.id, participantId)
    .all();
  const normalized = normalizeContent(content);
  const isDuplicate = recent.some(
    (row) => row.created_at >= duplicateCutoff && normalizeContent(row.content) === normalized
  );
  if (isDuplicate) return json({ ok: true, duplicate: true });

  try {
    const inserted = await env.DB.prepare(
      'INSERT INTO submissions (id, session_id, participant_id, request_id, nickname, category, content, ' +
        'moderation_status, is_pinned, hidden_from_presentation, created_at, updated_at) ' +
      "SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ? FROM discussion_sessions ds WHERE ds.id=? AND ds.status='live' AND (ds.closes_at IS NULL OR ds.closes_at>?) AND (SELECT COUNT(*) FROM submissions WHERE session_id=ds.id AND participant_id=? AND created_at>=?) < ? AND NOT EXISTS(SELECT 1 FROM submissions WHERE session_id=ds.id AND participant_id=? AND trim(content)=? AND created_at>=?) RETURNING id"
    )
      .bind(
        crypto.randomUUID(),
        session.id,
        participantId,
        requestId,
        nickname,
        category,
        content,
        'pending',
        nowIso(),
        nowIso(),
        session.id, nowIso(), participantId, windowStart, RATE_LIMIT_MAX_SUBMISSIONS,
        participantId, content, duplicateCutoff
      )
      .first();
    if (!inserted) {
      const duplicate = await env.DB.prepare('SELECT id FROM submissions WHERE session_id=? AND participant_id=? AND ((request_id=?) OR (trim(content)=? AND created_at>=?)) LIMIT 1').bind(session.id, participantId, requestId, content, duplicateCutoff).first();
      if (duplicate) return json({ ok: true, duplicate: true });
      const active = await env.DB.prepare("SELECT id FROM discussion_sessions WHERE id=? AND status='live' AND (closes_at IS NULL OR closes_at>?)").bind(session.id, nowIso()).first();
      if (!active) return json({ error: 'Submissions are currently closed for this discussion.' }, 409);
      return json({ error: MSG_RATE_LIMITED }, 429, { 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) });
    }
  } catch {
    // Concurrent copies of the same request can both miss the fast lookup,
    // but only one can satisfy submissions_request_id_idx. Treat the losing
    // copy as the same successful delivery after confirming the row exists.
    const delivered = await env.DB.prepare(
      'SELECT id FROM submissions WHERE session_id = ? AND participant_id = ? AND request_id = ?'
    )
      .bind(session.id, participantId, requestId)
      .first()
      .catch(() => null);
    if (delivered) return json({ ok: true, duplicate: true });
    return json({ error: MSG_SUBMISSION_GENERIC }, 500);
  }

  return json({ ok: true });
}

// Atomically reserves one normalized nickname for the session-scoped anonymous
// participant. A returning participant refreshes the same reservation, while a
// simultaneous claimant receives a conflict from the D1 uniqueness guarantee.
async function handleCheckNickname(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const sessionCode =
    typeof body?.sessionCode === 'string' ? body.sessionCode.trim().toUpperCase() : '';
  if (!CODE_PATTERN.test(sessionCode)) {
    return json({ error: 'This discussion could not be found.' }, 404);
  }
  const nickname = typeof body?.nickname === 'string' ? body.nickname : '';
  if (!displayNickname(nickname)) return json({ error: 'Pick a nickname before sending.' }, 400);
  const participantId = typeof body?.participant_id === 'string' ? body.participant_id : '';
  if (!isUuid(participantId)) return json({ error: MSG_BAD_BODY }, 400);

  const session = await env.DB.prepare(
    'SELECT id FROM discussion_sessions WHERE public_code = ? AND status <> ?'
  )
    .bind(sessionCode, 'draft')
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);

  const claim = await reserveSessionNickname(env, {
    sessionId: session.id,
    participantId,
    nickname,
  });
  if (claim.invalid) return json({ error: 'Pick a nickname before sending.' }, 400);
  if (claim.taken) return json({ error: MSG_NICKNAME_TAKEN, code: 'nickname_taken' }, 409);
  if (!claim.ok) return json({ error: MSG_SUBMISSION_GENERIC }, 500);
  return json({ available: true, reserved: true, nickname: claim.nickname });
}

/* ---------- admin: sessions ---------- */

function validateSessionValues(body, { partial }) {
  // Returns { values } with normalized fields, { fieldErrors }, or { invalid }.
  const values = {};

  if (body?.title !== undefined || !partial) {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > MAX_TITLE_LENGTH) return { fieldErrors: { title: true } };
    values.title = title;
  }
  if (body?.topic !== undefined || !partial) {
    const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
    if (!topic || topic.length > MAX_TOPIC_LENGTH) return { fieldErrors: { topic: true } };
    values.topic = topic;
  }
  if (body?.description !== undefined || !partial) {
    const description = typeof body?.description === 'string' ? body.description : '';
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return { fieldErrors: { description: true } };
    }
    values.description = description;
  }
  if (body?.welcome_message !== undefined || !partial) {
    const welcome = typeof body?.welcome_message === 'string' ? body.welcome_message : '';
    if (welcome.length > MAX_WELCOME_MESSAGE_LENGTH) {
      return { fieldErrors: { welcome_message: true } };
    }
    values.welcome_message = welcome;
  }
  if (body?.available_categories !== undefined || !partial) {
    const categories = Array.isArray(body?.available_categories) ? body.available_categories : [];
    const unique = [...new Set(categories)];
    if (
      unique.length === 0 ||
      !unique.every((c) => typeof c === 'string' && KNOWN_CATEGORIES.includes(c))
    ) {
      return { fieldErrors: { available_categories: true } };
    }
    values.available_categories = JSON.stringify(unique);
  }
  if (body?.configuration !== undefined) {
    const config = body.configuration && typeof body.configuration === 'object' ? body.configuration : {};
    values.configuration = JSON.stringify(config);
  }
  if (body?.opens_at !== undefined || !partial) {
    const opensAt = body?.opens_at || null;
    if (opensAt !== null && Number.isNaN(new Date(opensAt).getTime())) {
      return { fieldErrors: { opens_at: true } };
    }
    values.opens_at = opensAt ? new Date(opensAt).toISOString() : null;
  }
  if (body?.closes_at !== undefined || !partial) {
    const closesAt = body?.closes_at || null;
    if (closesAt !== null && Number.isNaN(new Date(closesAt).getTime())) {
      return { fieldErrors: { closes_at: true } };
    }
    values.closes_at = closesAt ? new Date(closesAt).toISOString() : null;
  }
  if (
    values.opens_at !== undefined &&
    values.closes_at !== undefined &&
    values.opens_at &&
    values.closes_at &&
    values.closes_at <= values.opens_at
  ) {
    return { fieldErrors: { closes_at: true } };
  }
  if (body?.public_code !== undefined) {
    const code = typeof body.public_code === 'string' ? body.public_code.trim().toUpperCase() : '';
    if (!CODE_PATTERN.test(code)) return { fieldErrors: { public_code: true } };
    values.public_code = code;
  }
  return { values };
}

function generatePublicCode() {
  // Rejection sampling avoids modulo bias, same as lib/session-code.js.
  const acceptLimit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  const byte = new Uint8Array(1);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    do {
      crypto.getRandomValues(byte);
    } while (byte[0] >= acceptLimit);
    code += CODE_ALPHABET[byte[0] % CODE_ALPHABET.length];
  }
  return code;
}

function isUniqueViolation(err, fragment) {
  const message = String((err && err.message) || err);
  return /UNIQUE constraint failed/i.test(message) && (!fragment || message.includes(fragment));
}

async function listAdminSessions(env, url) {
  const where = [];
  const params = [];

  const status = url.searchParams.get('status');
  if (status) {
    if (!SESSION_STATUSES.includes(status)) return json({ error: MSG_BAD_BODY }, 400);
    where.push('status = ?');
    params.push(status);
  }
  if (url.searchParams.get('published') === '1') where.push("status <> 'draft'");
  const publicCode = url.searchParams.get('public_code');
  if (publicCode) {
    where.push('public_code = ?');
    params.push(publicCode.toUpperCase());
  }

  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const totalRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM discussion_sessions' + whereSql
  )
    .bind(...params)
    .first();
  const { results } = await env.DB.prepare(
    'SELECT * FROM discussion_sessions' + whereSql + ' ORDER BY updated_at DESC LIMIT ?'
  )
    .bind(...params, limit)
    .all();

  return json({ items: results.map(serializeSession), total: totalRow?.n ?? 0 });
}

async function handleGetAdminSession(env, id) {
  const row = await env.DB.prepare('SELECT * FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  if (!row) return json({ error: 'That discussion no longer exists.' }, 404);
  return json({ session: serializeSession(row) });
}

async function handleCreateAdminSession(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const { values, fieldErrors } = validateSessionValues(body, { partial: false });
  if (fieldErrors) return json({ error: 'Please fix the highlighted fields.', fieldErrors }, 400);
  // Configuration is optional on create; the column default is '{}'.
  values.configuration = values.configuration ?? '{}';

  const requestedStatus = typeof body?.status === 'string' ? body.status : 'draft';
  if (requestedStatus !== 'draft' && requestedStatus !== 'live') {
    return json({ error: MSG_BAD_BODY }, 400);
  }
  const wantsLive = requestedStatus === 'live';

  if (wantsLive) {
    const liveRow = await env.DB.prepare(
      "SELECT id FROM discussion_sessions WHERE status = 'live' LIMIT 1"
    ).first();
    if (liveRow) {
      return json(
        { error: 'Another discussion is already live - pause or close it first.', code: 'live_conflict' },
        409
      );
    }
  }

  const createdAt = nowIso();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        'INSERT INTO discussion_sessions (id, title, topic, description, welcome_message, public_code, ' +
          'status, available_categories, configuration, opens_at, closes_at, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          id,
          values.title,
          values.topic,
          values.description,
          values.welcome_message,
          generatePublicCode(),
          wantsLive ? 'live' : 'draft',
          values.available_categories,
          values.configuration,
          values.opens_at,
          values.closes_at,
          createdAt,
          createdAt
        )
        .run();
      const row = await env.DB.prepare('SELECT * FROM discussion_sessions WHERE id = ?')
        .bind(id)
        .first();
      return json({ session: serializeSession(row) }, 201);
    } catch (err) {
      if (isUniqueViolation(err, 'public_code')) continue; // code collision - retry
      if (isUniqueViolation(err, 'discussion_sessions_one_live')) {
        return json(
          {
            error: 'Another discussion is already live - pause or close it first.',
            code: 'live_conflict',
          },
          409
        );
      }
      return json({ error: MSG_SESSION_GENERIC }, 500);
    }
  }
  return json({ error: MSG_SESSION_GENERIC }, 500);
}

async function handleUpdateAdminSession(request, env, admin, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const { values, fieldErrors } = validateSessionValues(body, { partial: true });
  if (fieldErrors) return json({ error: 'Please fix the highlighted fields.', fieldErrors }, 400);

  if (!Number.isInteger(body.expectedRevision)) return json({ error: 'Refresh before saving.', code: 'revision_required' }, 400);
  const current = await env.DB.prepare('SELECT id, revision FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  if (!current) return json({ error: 'That discussion no longer exists.' }, 404);
  if (current.revision !== body.expectedRevision) return json({ error: 'Another moderator updated this discussion. Refresh before saving.', code: 'concurrent_change' }, 409);
  if (Object.keys(values).length === 0) return json({ error: MSG_SESSION_GENERIC }, 400);

  if (values.public_code) {
    const existing = await env.DB.prepare(
      'SELECT id FROM discussion_sessions WHERE public_code = ? AND id <> ?'
    ).bind(values.public_code, id).first();
    if (existing) return json({ error: 'That join code is already in use.', code: 'duplicate_code' }, 409);
  }

  const columns = Object.keys(values);
  try {
    const updated = await env.DB.prepare(
      'UPDATE discussion_sessions SET ' +
        columns.map((c) => `${c} = ?`).join(', ') +
        ', updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?'
    )
      .bind(...columns.map((c) => values[c]), nowIso(), id, body.expectedRevision)
      .run();
    if (!updated.meta.changes) return json({ error: 'Another moderator updated this discussion. Refresh before saving.', code: 'concurrent_change' }, 409);
  } catch {
    return json({ error: MSG_SESSION_GENERIC }, 500);
  }
  const row = await env.DB.prepare('SELECT * FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  return json({ session: serializeSession(row) });
}

async function handleSetSessionStatus(request, env, admin, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }
  const next = typeof body?.status === 'string' ? body.status : '';
  if (!SESSION_STATUSES.includes(next)) return json({ error: MSG_SESSION_GENERIC }, 400);

  const current = await env.DB.prepare('SELECT status FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  if (!current) return json({ error: 'That discussion no longer exists.' }, 404);

  if (!ALLOWED_TRANSITIONS[current.status]?.includes(next)) {
    return json(
      { error: 'That change is not available from the current status - refresh and try again.' },
      400
    );
  }

  if (next === 'live') {
    const liveRow = await env.DB.prepare(
      "SELECT id FROM discussion_sessions WHERE status = 'live' AND id <> ? LIMIT 1"
    )
      .bind(id)
      .first();
    if (liveRow) {
      return json(
        { error: 'Another discussion is already live - pause or close it first.', code: 'live_conflict' },
        409
      );
    }
  }

  // Conditional update in one transaction: 0 rows means the status changed
  // concurrently; the partial unique index on live is the final guard for
  // races this check cannot see (batch rolls back on constraint failure).
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        'UPDATE discussion_sessions SET status = ?, updated_at = ?, revision=revision+1 WHERE id = ? AND status = ?'
      ).bind(next, nowIso(), id, current.status),
    ]);
    if (!results[0]?.meta?.changes) {
      return json(
        {
          error: 'This discussion changed state in another tab - refresh and try again.',
          code: 'concurrent_change',
        },
        409
      );
    }
  } catch (err) {
    if (isUniqueViolation(err, 'discussion_sessions_one_live')) {
      return json(
        { error: 'Another discussion is already live - pause or close it first.', code: 'live_conflict' },
        409
      );
    }
    return json({ error: MSG_SESSION_GENERIC }, 500);
  }

  return json({ ok: true, status: next });
}

// Reopen a closed discussion. Only available from "closed" via an explicit
// Reopen action; auto-reopening is intentionally disabled. The single-live
// guard is enforced by a conditional UPDATE (no-op if another session is live).
async function handleReopenSession(request, env, admin, id) {
  const current = await env.DB.prepare('SELECT status FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  if (!current) return json({ error: 'That discussion no longer exists.' }, 404);

  if (current.status !== 'closed') {
    return json({ error: 'That change is not available from the current status.' }, 400);
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        'UPDATE discussion_sessions SET status = ?, updated_at = ?, revision=revision+1 WHERE id = ? AND status = ?'
      ).bind('live', nowIso(), id, 'closed'),
    ]);
    if (!results[0]?.meta?.changes) {
      return json(
        { error: 'This discussion is no longer closed - refresh and try again.', code: 'concurrent_change' },
        409
      );
    }
  } catch (err) {
    if (isUniqueViolation(err, 'discussion_sessions_one_live')) {
      return json({ error: 'Another discussion is already live - pause or close it first.' }, 409);
    }
    return json({ error: MSG_SESSION_GENERIC }, 500);
  }

  const refreshed = await env.DB.prepare('SELECT * FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  return json({ session: serializeSession(refreshed) });
}

async function handleDeleteAdminSession(request, env, admin, id) {
  if (admin.user.role !== 'admin') {
    return json({ error: 'Administrator access is required.' }, 403);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const current = await env.DB.prepare(
    'SELECT id, title, public_code, status FROM discussion_sessions WHERE id = ?'
  )
    .bind(id)
    .first();
  if (!current) return json({ error: 'That discussion no longer exists.' }, 404);
  if (current.status === 'live') {
    return json(
      {
        error: 'Close this live discussion before deleting it.',
        code: 'live_session',
      },
      409
    );
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  const verification = await verifyDestructiveAdminPassword(request, env, admin, password);
  if (verification.response) return verification.response;

  const confirmText = typeof body?.confirm_text === 'string' ? body.confirm_text.trim() : '';
  if (confirmText !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);

  // D1 executes a batch atomically. The single conditional parent delete is
  // the concurrency guard: if the discussion became live after the read, no
  // row is removed. Schema FKs cascade the same transaction through its
  // submissions and presentation state without touching any other session.
  let results;
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM discussion_sessions WHERE id = ? AND status <> 'live'"
      ).bind(id),
    ]);
  } catch {
    return json({ error: 'Could not delete this discussion. Please try again.' }, 500);
  }

  if (!results[0]?.meta?.changes) {
    const refreshed = await env.DB.prepare(
      'SELECT status FROM discussion_sessions WHERE id = ?'
    )
      .bind(id)
      .first();
    if (refreshed?.status === 'live') {
      return json(
        {
          error: 'Close this live discussion before deleting it.',
          code: 'live_session',
        },
        409
      );
    }
    return json({ error: 'That discussion no longer exists.' }, 404);
  }

  return json({
    ok: true,
    deleted: { id: current.id, title: current.title, public_code: current.public_code },
  });
}

async function handleBulkDeleteAdminSessions(request, env, admin) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const sessionIds = uniqueUuidArray(body?.session_ids, 50);
  if (!sessionIds) {
    return json({ error: 'Select between 1 and 50 valid discussions.' }, 400);
  }
  if (typeof body?.confirm_text !== 'string' || body.confirm_text.trim() !== 'DELETE') {
    return json({ error: 'Type DELETE to confirm.' }, 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  const verification = await verifyDestructiveAdminPassword(request, env, admin, password);
  if (verification.response) return verification.response;

  const placeholders = sessionIds.map(() => '?').join(', ');
  let result;
  try {
    // Materialize the complete selection before deleting. The count and live
    // guards are evaluated from that immutable snapshot, so a missing row or
    // concurrent transition to live makes the one DELETE affect zero rows.
    result = await env.DB.prepare(
      `WITH selection AS MATERIALIZED (` +
        `SELECT id, status FROM discussion_sessions WHERE id IN (${placeholders})` +
      `) DELETE FROM discussion_sessions ` +
      `WHERE id IN (SELECT id FROM selection) ` +
      `AND (SELECT COUNT(*) FROM selection) = ? ` +
      `AND NOT EXISTS (SELECT 1 FROM selection WHERE status = 'live') ` +
      `RETURNING id`
    )
      .bind(...sessionIds, sessionIds.length)
      .all();
  } catch {
    return json({ error: 'Could not delete those discussions. Please try again.' }, 500);
  }

  const deletedIds = Array.isArray(result?.results)
    ? result.results.map((row) => row.id)
    : [];
  const deleted = deletedIds.length;
  if (deleted !== sessionIds.length) {
    const state = await env.DB.prepare(
      `SELECT COUNT(*) AS total, ` +
        `SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live ` +
        `FROM discussion_sessions WHERE id IN (${placeholders})`
    )
      .bind(...sessionIds)
      .first()
      .catch(() => null);
    if ((state?.live ?? 0) > 0) {
      return json(
        {
          error: 'Close every live discussion before deleting the selection.',
          code: 'live_sessions',
        },
        409
      );
    }
    return json(
      {
        error: 'The discussion selection changed. Refresh and try again.',
        code: 'selection_changed',
      },
      409
    );
  }

  return json({ ok: true, deleted, deleted_ids: deletedIds, requested: sessionIds.length });
}

/* ---------- admin: submissions ---------- */

async function listAdminSubmissions(env, url) {
  const where = [];
  const params = [];

  const sessionId = url.searchParams.get('session_id');
  if (sessionId) {
    where.push('session_id = ?');
    params.push(sessionId);
  }
  const status = url.searchParams.get('status');
  if (status) {
    if (!MODERATION_STATUSES.includes(status)) return json({ error: MSG_BAD_BODY }, 400);
    where.push('moderation_status = ?');
    params.push(status);
  }
  const category = url.searchParams.get('category');
  if (category) {
    if (!KNOWN_CATEGORIES.includes(category)) return json({ error: MSG_BAD_BODY }, 400);
    where.push('category = ?');
    params.push(category);
  }
  const search = typeof url.searchParams.get('search') === 'string' ? url.searchParams.get('search').trim() : '';
  if (search) {
    where.push('(content LIKE ? OR nickname LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%');
  }

  const sortRaw = url.searchParams.get('sort') || 'newest';
  const sorts = {
    newest: 'created_at DESC, id DESC',
    oldest: 'created_at ASC, id ASC',
    pinned: 'is_pinned DESC, created_at DESC, id DESC',
    // Presentation queue: pinned first, then oldest first.
    queue: 'is_pinned DESC, created_at ASC, id ASC',
  };
  const orderBy = sorts[sortRaw] || sorts.newest;
  if (sortRaw === 'queue') {
    where.push('hidden_from_presentation = 0');
  }

  const pageRaw = Number.parseInt(url.searchParams.get('page') ?? '', 10);
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 25;

  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const totalRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions' + whereSql)
    .bind(...params)
    .first();
  const { results } = await env.DB.prepare(
    'SELECT * FROM submissions' + whereSql + ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, (page - 1) * limit)
    .all();

  const response = { items: results.map(serializeSubmission), total: totalRow?.n ?? 0 };

  // Dashboard summaries for a session use the same filters minus search so the
  // summary always reflects the whole session.
  if (sessionId) {
    const summaryRow = await env.DB.prepare(
      "SELECT COUNT(*) AS total, " +
        "SUM(CASE WHEN category = 'question' THEN 1 ELSE 0 END) AS question, " +
        "SUM(CASE WHEN category = 'opinion' THEN 1 ELSE 0 END) AS opinion, " +
        "SUM(CASE WHEN category = 'challenge' THEN 1 ELSE 0 END) AS challenge, " +
        "SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) AS pending " +
        'FROM submissions WHERE session_id = ?'
    )
      .bind(sessionId)
      .first();
    response.summaries = {
      total: summaryRow?.total ?? 0,
      question: summaryRow?.question ?? 0,
      opinion: summaryRow?.opinion ?? 0,
      challenge: summaryRow?.challenge ?? 0,
      pending: summaryRow?.pending ?? 0,
    };
  }

  return json(response);
}

async function handleGetAdminSubmission(env, id) {
  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: MSG_INVALID }, 404);
  return json({ row: serializeSubmission(row) });
}

async function handlePatchAdminSubmission(request, env, admin, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const current = await env.DB.prepare(
    'SELECT id, session_id, revision, moderation_status, is_pinned, hidden_from_presentation, discussed_at ' +
      'FROM submissions WHERE id = ?'
  )
    .bind(id)
    .first();
  if (!current) return json({ error: MSG_INVALID }, 404);
  if (!Number.isInteger(body.expectedRevision)) return json({ error: 'Refresh before moderating.', code: 'revision_required' }, 400);
  if (body.expectedRevision !== current.revision) return json({ error: 'Another moderator changed this contribution. Refresh and try again.', code: 'concurrent_change' }, 409);

  const updates = {};
  let invalid = false;
  if (body?.moderation_status !== undefined) {
    if (!MODERATION_STATUSES.includes(body.moderation_status)) invalid = true;
    else updates.moderation_status = body.moderation_status;
  }
  if (body?.is_pinned !== undefined) {
    if (typeof body.is_pinned !== 'boolean') invalid = true;
    else updates.is_pinned = body.is_pinned ? 1 : 0;
  }
  if (body?.hidden_from_presentation !== undefined) {
    if (typeof body.hidden_from_presentation !== 'boolean') invalid = true;
    else updates.hidden_from_presentation = body.hidden_from_presentation ? 1 : 0;
  }
  if (body?.discussed_at !== undefined) {
    const value = body.discussed_at;
    if (value !== null && (typeof value !== 'string' || Number.isNaN(new Date(value).getTime()))) {
      invalid = true;
    } else {
      updates.discussed_at = value ? new Date(value).toISOString() : null;
    }
  }
  if (invalid || Object.keys(updates).length === 0) return json({ error: MSG_INVALID }, 400);

  const now = nowIso();
  const columns = Object.keys(updates);

  // Mirrors the Next app: hiding a contribution (moderation or presentation)
  // clears the projector pointer when it points at this row (the WHERE clause
  // below). Same transaction as the update, so the pointer never dangles.
  const mustClearPointer =
    updates.moderation_status === 'hidden' || updates.hidden_from_presentation === 1;

  const statements = [
    env.DB.prepare(
      'UPDATE submissions SET ' +
        columns.map((c) => `${c} = ?`).join(', ') +
        ', updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? RETURNING id'
    ).bind(...columns.map((c) => updates[c]), now, id, body.expectedRevision),
  ];
  if (mustClearPointer) {
    statements.push(
      env.DB.prepare(
        'UPDATE presentation_state SET current_submission_id = NULL, updated_at = ?, updated_by = ? ' +
          'WHERE session_id = (SELECT session_id FROM submissions WHERE id = ?) ' +
          'AND current_submission_id = ? AND changes() > 0'
      ).bind(now, admin.user.id, id, id)
    );
  }

  try {
    const changed = await env.DB.batch(statements);
    if (!changed[0].results?.length) return json({ error: 'Another moderator changed this contribution. Refresh and try again.', code: 'concurrent_change' }, 409);
  } catch {
    return json({ error: 'Could not update that contribution. Please try again.' }, 500);
  }

  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  return json({ row: serializeSubmission(row) });
}

async function handleDeleteAdminSubmission(request, env, admin, id) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const password = typeof body?.password === 'string' ? body.password : '';
  const verification = await verifyDestructiveAdminPassword(request, env, admin, password);
  if (verification.response) return verification.response;

  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: MSG_INVALID }, 404);

  // Clear the live-display pointer and delete in the same D1 batch. The FK is
  // also ON DELETE SET NULL, but the explicit update keeps the invariant even
  // if this schema is imported into an SQLite environment with FKs disabled.
  const now = nowIso();
  try {
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE presentation_state SET current_submission_id = NULL, updated_at = ?, updated_by = ? ' +
          'WHERE session_id = ? AND current_submission_id = ?'
      ).bind(now, admin.user.id, row.session_id, id),
      env.DB.prepare('DELETE FROM submissions WHERE id = ? AND session_id = ?')
        .bind(id, row.session_id),
    ]);
  } catch {
    return json({ error: 'Could not delete that contribution. Please try again.' }, 500);
  }
  return json({ ok: true, row: serializeSubmission(row) });
}

async function handleBulkDeleteAdminSubmissions(request, env, admin) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }

  const sessionId = typeof body?.session_id === 'string' ? body.session_id : '';
  const submissionIds = uniqueUuidArray(body?.submission_ids, 200);
  if (!isUuid(sessionId) || !submissionIds) {
    return json({ error: 'Select between 1 and 200 valid contributions.' }, 400);
  }
  if (typeof body?.confirm_text !== 'string' || body.confirm_text.trim() !== 'DELETE') {
    return json({ error: 'Type DELETE to confirm.' }, 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  const verification = await verifyDestructiveAdminPassword(request, env, admin, password);
  if (verification.response) return verification.response;

  const placeholders = submissionIds.map(() => '?').join(', ');
  let result;
  try {
    // The materialized selection is scoped to exactly one session. Its count
    // guard turns a stale/mixed selection into a zero-row delete, while the FK
    // clears a matching presentation pointer in the same database statement.
    result = await env.DB.prepare(
      `WITH selection AS MATERIALIZED (` +
        `SELECT id FROM submissions WHERE session_id = ? AND id IN (${placeholders})` +
      `) DELETE FROM submissions ` +
      `WHERE session_id = ? AND id IN (SELECT id FROM selection) ` +
      `AND (SELECT COUNT(*) FROM selection) = ? ` +
      `RETURNING id`
    )
      .bind(sessionId, ...submissionIds, sessionId, submissionIds.length)
      .all();
  } catch {
    return json({ error: 'Could not delete those contributions. Please try again.' }, 500);
  }

  const deletedIds = Array.isArray(result?.results)
    ? result.results.map((row) => row.id)
    : [];
  const deleted = deletedIds.length;
  if (deleted !== submissionIds.length) {
    return json(
      {
        error: 'The contribution selection changed. Refresh and try again.',
        code: 'selection_changed',
      },
      409
    );
  }

  return json({ ok: true, deleted, deleted_ids: deletedIds, requested: submissionIds.length });
}

async function handleClearSessionContributions(request, env, admin, sessionId) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const password = typeof body?.password === 'string' ? body.password : '';

  const confirmName = typeof body?.confirm_name === 'string' ? body.confirm_name.trim() : '';
  const confirmText = typeof body?.confirm_text === 'string' ? body.confirm_text.trim() : '';

  const verification = await verifyDestructiveAdminPassword(request, env, admin, password);
  if (verification.response) return verification.response;

  const session = await env.DB.prepare('SELECT id, title FROM discussion_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  if (!session) return json({ error: 'That discussion no longer exists.' }, 404);

  if (!confirmName || confirmName.toLowerCase() !== String(session.title).trim().toLowerCase()) {
    return json({ error: 'Session name does not match.' }, 400);
  }
  if (confirmText !== 'DELETE') {
    return json({ error: 'Type DELETE to confirm.' }, 400);
  }

  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM submissions WHERE session_id = ?'
  )
    .bind(sessionId)
    .first();
  const count = countRow?.n ?? 0;

  const now = nowIso();
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM submissions WHERE session_id = ?').bind(sessionId),
      env.DB.prepare(
        'UPDATE presentation_state SET current_submission_id = NULL, updated_at = ?, updated_by = ? ' +
          'WHERE session_id = ?'
      ).bind(now, admin.user.id, sessionId),
    ]);
  } catch {
    return json({ error: 'Could not clear contributions. Please try again.' }, 500);
  }

  return json({ ok: true, deleted: count });
}

/* ---------- admin: presentation pointer ---------- */

async function handleGetPresentation(env, sessionId) {
  const session = await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);
  const row = await env.DB.prepare(
    'SELECT current_submission_id, revision FROM presentation_state WHERE session_id = ?'
  )
    .bind(sessionId)
    .first();
  return json({ currentId: row?.current_submission_id ?? null, revision: row?.revision ?? 0 });
}

async function handlePutPresentation(request, env, admin, sessionId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }
  if (!Number.isInteger(body.expectedRevision)) return json({ error: 'Refresh presentation controls before continuing.', code: 'revision_required' }, 400);
  let currentId =
    body?.current_submission_id == null ? null : String(body.current_submission_id);
  if (currentId !== null && !isUuid(currentId)) {
    return json({ error: 'Invalid contribution.' }, 400);
  }

  const session = await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);

  await env.DB.prepare('INSERT OR IGNORE INTO presentation_state(session_id) VALUES(?)').bind(sessionId).run();
  await env.DB.prepare('INSERT OR IGNORE INTO platform_state(session_id) VALUES(?)').bind(sessionId).run();
  const pointer = await env.DB.prepare('SELECT revision,current_submission_id FROM presentation_state WHERE session_id=?').bind(sessionId).first();
  const platform = await env.DB.prepare('SELECT revision FROM platform_state WHERE session_id=?').bind(sessionId).first();
  if (pointer.revision !== body.expectedRevision) return json({ error: 'The screen changed in another moderator tab. Refresh and try again.', code: 'concurrent_change' }, 409);
  if (body.action === 'next' || body.action === 'prev') {
    const { results: eligible } = await env.DB.prepare("SELECT id FROM submissions WHERE session_id=? AND moderation_status='approved' AND hidden_from_presentation=0 ORDER BY is_pinned DESC,created_at ASC,id ASC").bind(sessionId).all();
    if (!eligible.length) currentId = null;
    else {
      const index = eligible.findIndex(item => item.id === pointer.current_submission_id);
      const next = index < 0 ? (body.action === 'prev' ? eligible.length - 1 : 0) : (index + (body.action === 'prev' ? -1 : 1) + eligible.length) % eligible.length;
      currentId = eligible[next].id;
    }
  }

  if (currentId !== null) {
    // Only approved, presentation-visible contributions reach the screen.
    const submission = await env.DB.prepare(
      'SELECT id FROM submissions WHERE id = ? AND session_id = ? ' +
        "AND moderation_status = 'approved' AND hidden_from_presentation = 0"
    )
      .bind(currentId, sessionId)
      .first();
    if (!submission) {
      return json({ error: 'That contribution is not ready for the screen.' }, 400);
    }
  }

  const now = nowIso();
  const mutationId = crypto.randomUUID();
  let results;
  try {
    results = await env.DB.batch([
    env.DB.prepare("UPDATE platform_state SET revision=revision+1,mutation_id=?,projected_poll_id=NULL,stage_config=json_set(stage_config,'$.overlay',NULL,'$.returnOverlay',NULL) WHERE session_id=? AND revision=? AND EXISTS(SELECT 1 FROM presentation_state WHERE session_id=? AND revision=?) RETURNING revision").bind(mutationId, sessionId, platform.revision, sessionId, body.expectedRevision),
    env.DB.prepare('UPDATE presentation_state SET current_submission_id=?,updated_at=?,updated_by=?,revision=revision+1 WHERE session_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_state WHERE session_id=? AND mutation_id=?) RETURNING revision').bind(currentId, now, admin.user.id, sessionId, body.expectedRevision, sessionId, mutationId),
    env.DB.prepare("INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) SELECT ?,?,?,'project',?,? WHERE EXISTS(SELECT 1 FROM platform_state WHERE session_id=? AND mutation_id=?)").bind(crypto.randomUUID(), sessionId, admin.user.id, currentId, now, sessionId, mutationId),
    ]);
  } catch {
    return json({ error: 'The screen or contribution changed. Synchronize and try again.', code: 'concurrent_change' }, 409);
  }
  if (!results[1].results?.length) return json({ error: 'The screen changed in another moderator tab. Refresh and try again.', code: 'concurrent_change' }, 409);
  return json({ ok: true, currentId, revision: results[1].results[0].revision });
}

/* ---------- router ---------- */

const worker = {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    try {
      if (path === '/health' && method === 'GET') return json({ ok: true });

      if (!isSecretAuthorized(request, env)) return json({ error: 'unauthorized' }, 401);

      if (path === '/sessions' && method === 'GET') {
        const code = (url.searchParams.get('code') || '').trim().toUpperCase();
        if (!CODE_PATTERN.test(code)) return json({ error: 'This discussion could not be found.' }, 404);
        return await handleGetSessionByCode(env, code);
      }

      if (path === '/live' && method === 'GET') {
        return await handleGetLiveSession(env);
      }

      if (path === '/rooms' && method === 'GET') {
        const code = (url.searchParams.get('code') || '').trim().toUpperCase();
        if (!CODE_PATTERN.test(code)) return json({ error: 'This discussion could not be found.' }, 404);
        return await handleGetRoomByCode(env, code);
      }

      if (path === '/submissions' && method === 'POST') {
        return await handleCreateSubmission(request, env);
      }

      if (path === '/nickname' && method === 'POST') {
        return await handleCheckNickname(request, env);
      }

      const engagementMatch = path.match(/^\/sessions\/([^/]+)\/(engagement|vote|reactions)$/);
      if (engagementMatch && ((engagementMatch[2] === 'engagement' && method === 'GET') || (engagementMatch[2] !== 'engagement' && method === 'POST'))) {
        return await handleEngagement(request, env, engagementMatch[1].toUpperCase(), engagementMatch[2]);
      }

      const votingPublicMatch = path.match(/^\/voting\/([^/]+)(?:\/(vote))?$/);
      if (votingPublicMatch) return await handleVotingPublic(request, env, votingPublicMatch[1].toUpperCase(), votingPublicMatch[2]);
      const standalonePublicMatch = path.match(/^\/stages\/([^/]+)$/);
      if (standalonePublicMatch) return await handleStandaloneStages(request, env, null, standalonePublicMatch[1], true);

      // ----- admin -----

      if (path === '/admin/auth/login' && method === 'POST') {
        return await handleLogin(request, env);
      }

      const admin = await requireAdminUser(request, env);
      if (!admin) return json({ error: 'unauthorized' }, 401);

      if (path === '/admin/voting') return await handleVotingCollection(request, env, admin);
      const votingAdminMatch = path.match(/^\/admin\/voting\/([^/]+)$/);
      if (votingAdminMatch) return await handleVotingAdmin(request, env, admin, votingAdminMatch[1], verifyDestructiveAdminPassword);

      if (path === '/admin/auth/logout' && method === 'POST') {
        return await handleLogout(request, env, admin);
      }
      if (path === '/admin/auth/me' && method === 'GET') {
        return json({ user: admin.user });
      }
      if (path === '/admin/activity') return await handleActivity(request, env, admin);
      if (path === '/admin/stages') return await handleStandaloneStages(request, env, admin);
      const standaloneAdminMatch = path.match(/^\/admin\/stages\/([^/]+)$/);
      if (standaloneAdminMatch) return await handleStandaloneStages(request, env, admin, standaloneAdminMatch[1]);

      const platformMatch = path.match(/^\/admin\/sessions\/([^/]+)\/(platform|export)$/);
      if (platformMatch && isUuid(platformMatch[1])) {
        if (platformMatch[2] === 'export' && method === 'GET') return await exportSession(env, platformMatch[1]);
        if (platformMatch[2] === 'platform') return await handlePlatform(request, env, admin, platformMatch[1], verifyDestructiveAdminPassword);
      }

      if (path === '/admin/sessions') {
        if (method === 'GET') return await listAdminSessions(env, url);
        if (method === 'POST') return await handleCreateAdminSession(request, env);
      }

      if (path === '/admin/submissions' && method === 'GET') {
        return await listAdminSubmissions(env, url);
      }

      // Collection actions must precede the /:id matchers below.
      if (path === '/admin/sessions/bulk-delete' && method === 'POST') {
        return await handleBulkDeleteAdminSessions(request, env, admin);
      }
      if (path === '/admin/submissions/bulk-delete' && method === 'POST') {
        return await handleBulkDeleteAdminSubmissions(request, env, admin);
      }

      const sessionMatch = path.match(/^\/admin\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_SESSION_GENERIC }, 400);
        if (method === 'GET') return await handleGetAdminSession(env, id);
        if (method === 'PATCH') return await handleUpdateAdminSession(request, env, admin, id);
        if (method === 'DELETE') {
          return await handleDeleteAdminSession(request, env, admin, id);
        }
      }

      const statusMatch = path.match(/^\/admin\/sessions\/([^/]+)\/status$/);
      if (statusMatch && method === 'POST') {
        const id = decodeURIComponent(statusMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_SESSION_GENERIC }, 400);
        return await handleSetSessionStatus(request, env, admin, id);
      }

      const reopenMatch = path.match(/^\/admin\/sessions\/([^/]+)\/reopen$/);
      if (reopenMatch && method === 'POST') {
        const id = decodeURIComponent(reopenMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_SESSION_GENERIC }, 400);
        return await handleReopenSession(request, env, admin, id);
      }

      const clearMatch = path.match(/^\/admin\/sessions\/([^/]+)\/clear-contributions$/);
      if (clearMatch && method === 'POST') {
        const id = decodeURIComponent(clearMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_SESSION_GENERIC }, 400);
        return await handleClearSessionContributions(request, env, admin, id);
      }

      const submissionMatch = path.match(/^\/admin\/submissions\/([^/]+)$/);
      if (submissionMatch) {
        const id = decodeURIComponent(submissionMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_INVALID }, 400);
        if (method === 'GET') return await handleGetAdminSubmission(env, id);
        if (method === 'PATCH') return await handlePatchAdminSubmission(request, env, admin, id);
        if (method === 'DELETE') return await handleDeleteAdminSubmission(request, env, admin, id);
      }

      const presentationMatch = path.match(/^\/admin\/presentation\/([^/]+)$/);
      if (presentationMatch) {
        const sessionId = decodeURIComponent(presentationMatch[1]);
        if (!isUuid(sessionId)) return json({ error: 'This discussion could not be found.' }, 400);
        if (method === 'GET') return await handleGetPresentation(env, sessionId);
        if (method === 'PUT') return await handlePutPresentation(request, env, admin, sessionId);
      }
    } catch {
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }

    return json({ error: 'not found' }, 404);
  },
};

export default worker;
