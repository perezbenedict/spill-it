/* SPILL API — single-file Cloudflare Worker, no dependencies, no build step.
   Binds a D1 database as env.DB (see wrangler.toml). Every route except
   /health requires `Authorization: Bearer <SPILL_API_SECRET>`; admin routes
   additionally require the `X-Admin-Token` header of a live admin_sessions
   row. Fixed friendly error messages only — SQL, ids and stacks never leave
   this process. */

const KNOWN_CATEGORIES = ['question', 'opinion', 'challenge', 'twocents'];
const SESSION_STATUSES = ['draft', 'live', 'paused', 'closed'];
const MODERATION_STATUSES = ['pending', 'approved', 'hidden'];

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_LENGTH = 8;
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

const DEFAULT_MIN_CONTENT_LENGTH = 3;
const DEFAULT_MAX_CONTENT_LENGTH = 1000;
const MAX_NICKNAME_LENGTH = 60;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_WELCOME_MESSAGE_LENGTH = 1000;

const RATE_LIMIT_MAX_SUBMISSIONS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const DUPLICATE_WINDOW_SECONDS = 600;

const ADMIN_SESSION_HOURS = 7 * 24;
const PBKDF2_ITERATIONS = 100000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
// The admin_users.email column is NOT NULL, but with a single shared password
// this address is internal only - never displayed and never accepted as input.
const ADMIN_EMAIL_PLACEHOLDER = 'admin@spill.local';

// closed is terminal; only the transitions the UI offers are allowed.
const ALLOWED_TRANSITIONS = {
  draft: ['live'],
  live: ['paused', 'closed'],
  paused: ['live', 'closed'],
  closed: [],
};

// Fixed, friendly copy. Internal identifiers never appear in responses.
const MSG_SUBMISSION_GENERIC =
  'Something went wrong and your thought was not saved. Please try again.';
const MSG_RATE_LIMITED = 'Slow down a moment - try again shortly.';
const MSG_BAD_BODY = 'Check your submission and try again.';
const MSG_SESSION_GENERIC = 'Could not save this discussion. Please try again.';
const MSG_INVALID = 'Invalid contribution.';
const MSG_NICKNAME_TAKEN = 'That nickname is already taken. Try another one.';
const MSG_LOGIN_INVALID = 'Incorrect password.';
const MSG_LOGIN_THROTTLED = 'Too many attempts. Try again shortly.';

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
  return {
    ...row,
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
    'SELECT t.token AS token, t.expires_at AS expires_at, ' +
      'u.id AS id, u.email AS email, u.role AS role ' +
      'FROM admin_sessions t JOIN admin_users u ON u.id = t.user_id ' +
      'WHERE t.token = ?'
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at <= nowIso()) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { token: row.token, user: { id: row.id, email: row.email, role: row.role } };
}

// In-memory login throttle keyed by client IP - per worker isolate, no DB
// table. Failed attempts count toward LOGIN_MAX_FAILURES inside a fixed
// window that starts at the first failure.
const loginFailures = new Map();

function loginThrottleFor(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return null;
  if (entry.resetAt <= Date.now()) {
    loginFailures.delete(ip);
    return null;
  }
  if (entry.count < LOGIN_MAX_FAILURES) return null;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
  return json({ error: MSG_LOGIN_THROTTLED }, 429, { 'Retry-After': String(retryAfter) });
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginFailures.get(ip);
  if (!entry || entry.resetAt <= now) {
    loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_FAILURE_WINDOW_SECONDS * 1000 });
    return;
  }
  entry.count += 1;
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

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const throttled = loginThrottleFor(ip);
  if (throttled) return throttled;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }
  // Single shared admin password - no email or username is accepted.
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    recordLoginFailure(ip);
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

  const matchesHash = user ? await verifyPassword(password, user.password_hash) : false;
  const matchesSecret =
    !matchesHash && !!env.SPILL_ADMIN_PASSWORD && constantTimeEquals(password, env.SPILL_ADMIN_PASSWORD);

  if (!user || (!matchesHash && !matchesSecret)) {
    recordLoginFailure(ip);
    return json({ error: MSG_LOGIN_INVALID }, 401);
  }

  if (matchesSecret) {
    // Accepted via the env secret while the stored hash differs: rotate the
    // stored hash to the presented password with a fresh random salt.
    try {
      await env.DB.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
        .bind(await hashPassword(password, randomHex(16), PBKDF2_ITERATIONS), user.id)
        .run();
    } catch {
      // Non-fatal: this attempt is still valid via the env secret.
    }
  }

  loginFailures.delete(ip);

  const token = randomHex(32); // 256-bit random admin session token
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(createdAt),
    env.DB.prepare(
      'INSERT INTO admin_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(token, user.id, createdAt, expiresAt),
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
      'ORDER BY is_pinned DESC, created_at DESC, id DESC'
  )
    .bind(session.id, 'approved')
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

  const session = await env.DB.prepare(
    'SELECT id, status, available_categories, configuration, closes_at ' +
      'FROM discussion_sessions WHERE public_code = ?'
  )
    .bind(sessionCode)
    .first();
  if (!session || session.status === 'draft') {
    return json({ error: 'This discussion could not be found.' }, 404);
  }

  const availableCategories = parseJson(session.available_categories, []);
  const configuration = parseJson(session.configuration, {});
  const minLength = clampLength(configuration.min_content_length, DEFAULT_MIN_CONTENT_LENGTH);
  const maxLength = clampLength(configuration.max_content_length, DEFAULT_MAX_CONTENT_LENGTH);

  const category = typeof body?.category === 'string' ? body.category : '';
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  // Fixed validation copy, mirroring the Next route's zod messages.
  if (!KNOWN_CATEGORIES.includes(category)) return json({ error: MSG_BAD_BODY }, 400);
  if (!nickname || nickname.length > MAX_NICKNAME_LENGTH) {
    return json({ error: 'Pick a nickname before sending.' }, 400);
  }

  // Session-scoped nickname uniqueness (authoritative). Compare the trimmed,
  // lowercased nickname against existing submissions in THIS session only —
  // not globally. lower(trim(...)) mirrors the client pre-check in
  // lib/nickname.js; SQLite lower() is ASCII-only, which is the intended
  // case-folding. The original display capitalization is stored as-is.
  //
  // The current participant is excluded so they can keep their own nickname
  // across the multiple submissions this flow allows (rate limit + "Submit
  // another"); uniqueness is enforced across distinct participants.
  const takenRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM submissions ' +
      'WHERE session_id = ? AND LOWER(TRIM(nickname)) = ? AND participant_id <> ?'
  )
    .bind(session.id, nickname.toLowerCase(), participantId)
    .first();
  if ((takenRow?.n ?? 0) > 0) {
    return json({ error: MSG_NICKNAME_TAKEN, code: 'nickname_taken' }, 409);
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
  if (isDuplicate) return json({ ok: true });

  try {
    await env.DB.prepare(
      'INSERT INTO submissions (id, session_id, participant_id, nickname, category, content, ' +
        'moderation_status, is_pinned, hidden_from_presentation, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)'
    )
      .bind(
        crypto.randomUUID(),
        session.id,
        participantId,
        nickname,
        category,
        content,
        'pending',
        nowIso(),
        nowIso()
      )
      .run();
  } catch {
    return json({ error: MSG_SUBMISSION_GENERIC }, 500);
  }

  return json({ ok: true });
}

// Authoritative nickname-availability check for a session. Returns whether the
// trimmed, lowercased nickname is already in use by a DIFFERENT participant in
// this session (the caller's own submissions are excluded, matching the
// uniqueness rule in handleCreateSubmission). The frontend pre-check in
// lib/nickname.js is a convenience; this endpoint is the source of truth.
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
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  if (!nickname) return json({ error: 'Pick a nickname before sending.' }, 400);
  const participantId = typeof body?.participant_id === 'string' ? body.participant_id : '';
  const participantFilter = participantId && isUuid(participantId) ? participantId : null;

  const session = await env.DB.prepare(
    'SELECT id FROM discussion_sessions WHERE public_code = ? AND status <> ?'
  )
    .bind(sessionCode, 'draft')
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);

  const takenRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM submissions ' +
      'WHERE session_id = ? AND LOWER(TRIM(nickname)) = ?' +
      (participantFilter ? ' AND participant_id <> ?' : '')
  )
    .bind(
      session.id,
      nickname.toLowerCase(),
      ...(participantFilter ? [participantFilter] : [])
    )
    .first();

  return json({ available: (takenRow?.n ?? 0) === 0 });
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
        'INSERT INTO discussion_sessions (id, title, description, welcome_message, public_code, ' +
          'status, available_categories, configuration, opens_at, closes_at, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
        .bind(
          id,
          values.title,
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

  const current = await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .first();
  if (!current) return json({ error: 'That discussion no longer exists.' }, 404);
  if (Object.keys(values).length === 0) return json({ error: MSG_SESSION_GENERIC }, 400);

  if (values.public_code) {
    const existing = await env.DB.prepare(
      'SELECT id FROM discussion_sessions WHERE public_code = ? AND id <> ?'
    ).bind(values.public_code, id).first();
    if (existing) return json({ error: 'That join code is already in use.', code: 'duplicate_code' }, 409);
  }

  const columns = Object.keys(values);
  try {
    await env.DB.prepare(
      'UPDATE discussion_sessions SET ' +
        columns.map((c) => `${c} = ?`).join(', ') +
        ', updated_at = ? WHERE id = ?'
    )
      .bind(...columns.map((c) => values[c]), nowIso(), id)
      .run();
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
        'UPDATE discussion_sessions SET status = ?, updated_at = ? WHERE id = ? AND status = ?'
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

async function handleDeleteAdminSession(env, id) {
  const result = await env.DB.prepare('DELETE FROM discussion_sessions WHERE id = ?')
    .bind(id)
    .run();
  if (!result.meta.changes) return json({ error: 'That discussion no longer exists.' }, 404);
  return json({ ok: true });
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
    'SELECT id, moderation_status, is_pinned, hidden_from_presentation, discussed_at ' +
      'FROM submissions WHERE id = ?'
  )
    .bind(id)
    .first();
  if (!current) return json({ error: MSG_INVALID }, 404);

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
        ', updated_at = ? WHERE id = ?'
    ).bind(...columns.map((c) => updates[c]), now, id),
  ];
  if (mustClearPointer) {
    statements.push(
      env.DB.prepare(
        'UPDATE presentation_state SET current_submission_id = NULL, updated_at = ?, updated_by = ? ' +
          'WHERE session_id = (SELECT session_id FROM submissions WHERE id = ?) ' +
          'AND current_submission_id = ?'
      ).bind(now, admin.user.id, id, id)
    );
  }

  try {
    await env.DB.batch(statements);
  } catch {
    return json({ error: 'Could not update that contribution. Please try again.' }, 500);
  }

  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  return json({ row: serializeSubmission(row) });
}

async function handleDeleteAdminSubmission(env, id) {
  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!row) return json({ error: MSG_INVALID }, 404);
  // presentation_state.current_submission_id is ON DELETE SET NULL.
  await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
  return json({ ok: true, row: serializeSubmission(row) });
}

/* ---------- admin: presentation pointer ---------- */

async function handleGetPresentation(env, sessionId) {
  const session = await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);
  const row = await env.DB.prepare(
    'SELECT current_submission_id FROM presentation_state WHERE session_id = ?'
  )
    .bind(sessionId)
    .first();
  return json({ currentId: row?.current_submission_id ?? null });
}

async function handlePutPresentation(request, env, admin, sessionId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: MSG_BAD_BODY }, 400);
  }
  const currentId =
    body?.current_submission_id == null ? null : String(body.current_submission_id);
  if (currentId !== null && !isUuid(currentId)) {
    return json({ error: 'Invalid contribution.' }, 400);
  }

  const session = await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id = ?')
    .bind(sessionId)
    .first();
  if (!session) return json({ error: 'This discussion could not be found.' }, 404);

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
  await env.DB.prepare(
    'INSERT INTO presentation_state (session_id, current_submission_id, updated_at, updated_by) ' +
      'VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET ' +
      'current_submission_id = excluded.current_submission_id, ' +
      'updated_at = excluded.updated_at, updated_by = excluded.updated_by'
  )
    .bind(sessionId, currentId, now, admin.user.id)
    .run();

  return json({ ok: true, currentId });
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

      // ----- admin -----

      if (path === '/admin/auth/login' && method === 'POST') {
        return await handleLogin(request, env);
      }

      const admin = await requireAdminUser(request, env);
      if (!admin) return json({ error: 'unauthorized' }, 401);

      if (path === '/admin/auth/logout' && method === 'POST') {
        return await handleLogout(request, env, admin);
      }
      if (path === '/admin/auth/me' && method === 'GET') {
        return json({ user: admin.user });
      }

      if (path === '/admin/sessions') {
        if (method === 'GET') return await listAdminSessions(env, url);
        if (method === 'POST') return await handleCreateAdminSession(request, env);
      }

      if (path === '/admin/submissions' && method === 'GET') {
        return await listAdminSubmissions(env, url);
      }

      const sessionMatch = path.match(/^\/admin\/sessions\/([^/]+)$/);
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_SESSION_GENERIC }, 400);
        if (method === 'GET') return await handleGetAdminSession(env, id);
        if (method === 'PATCH') return await handleUpdateAdminSession(request, env, admin, id);
        if (method === 'DELETE') return await handleDeleteAdminSession(env, id);
      }

      const statusMatch = path.match(/^\/admin\/sessions\/([^/]+)\/status$/);
      if (statusMatch && method === 'POST') {
        const id = decodeURIComponent(statusMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_SESSION_GENERIC }, 400);
        return await handleSetSessionStatus(request, env, admin, id);
      }

      const submissionMatch = path.match(/^\/admin\/submissions\/([^/]+)$/);
      if (submissionMatch) {
        const id = decodeURIComponent(submissionMatch[1]);
        if (!isUuid(id)) return json({ error: MSG_INVALID }, 400);
        if (method === 'GET') return await handleGetAdminSubmission(env, id);
        if (method === 'PATCH') return await handlePatchAdminSubmission(request, env, admin, id);
        if (method === 'DELETE') return await handleDeleteAdminSubmission(env, id);
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
