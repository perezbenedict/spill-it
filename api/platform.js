const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const conflict = () => reply({ error: 'Another moderator changed this discussion. Refresh and try again.', code: 'concurrent_change' }, 409);
const uuid = () => crypto.randomUUID();
const iso = () => new Date().toISOString();
const rows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

const ATMOSPHERES = ['midnight', 'electric', 'reflection', 'royal', 'celestial', 'velvet', 'aurora'];
const defaultStage = () => ({ atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: null });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stageId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const stageText = (value, maximum) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum;
const optionalStageText = (value, maximum) => value === undefined || (typeof value === 'string' && value.trim().length <= maximum);

function announcement(value) {
  if (!record(value) || !stageText(value.text, 1500) || !optionalStageText(value.heading, 120) || !optionalStageText(value.subtitle, 240)) return null;
  if ((value.style !== undefined && !['statement', 'notice', 'quote'].includes(value.style)) || (value.showBrand !== undefined && typeof value.showBrand !== 'boolean')) return null;
  return { heading: (value.heading || '').trim(), text: value.text.trim(), subtitle: (value.subtitle || '').trim(), style: value.style === undefined ? 'statement' : value.style, showBrand: value.showBrand === true };
}

export function validateStage(value, now = Date.now()) {
  if (!record(value) || !ATMOSPHERES.includes(value.atmosphere)) return null;
  if (!Array.isArray(value.chapters) || value.chapters.length > 20 || !Array.isArray(value.prompts) || value.prompts.length > 20) return null;
  if (value.chapters.some(item => !record(item) || !stageId(item.id) || !stageText(item.title, 120)) || value.prompts.some(item => !record(item) || !stageId(item.id) || !stageText(item.text, 500))) return null;
  if (new Set(value.chapters.map(item => item.id)).size !== value.chapters.length || new Set(value.prompts.map(item => item.id)).size !== value.prompts.length) return null;
  if (value.activeChapterId !== null && !value.chapters.some(item => item.id === value.activeChapterId)) return null;
  const announcements = value.announcements === undefined ? [] : value.announcements;
  if (!Array.isArray(announcements) || announcements.length > 20 || announcements.some(item => !stageId(item?.id) || !announcement(item)) || new Set(announcements.map(item => item.id)).size !== announcements.length) return null;
  let overlay = null;
  if (value.overlay !== null) {
    const candidate = value.overlay;
    if (!record(candidate) || !['prompt', 'reflection', 'announcement', 'voting'].includes(candidate.kind)) return null;
    if (['prompt', 'reflection'].includes(candidate.kind) && !stageText(candidate.text, 500)) return null;
    if (candidate.kind === 'announcement' && !announcement(candidate)) return null;
    if (candidate.kind === 'voting' && (typeof candidate.eventCode !== 'string' || !/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(candidate.eventCode))) return null;
    if (candidate.endsAt !== null) {
      if (!['reflection', 'announcement'].includes(candidate.kind) || typeof candidate.endsAt !== 'string') return null;
      const end = Date.parse(candidate.endsAt);
      if (!Number.isFinite(end) || end <= now || end > now + 86400000) return null;
    }
    overlay = candidate.kind === 'announcement'
      ? { kind: 'announcement', ...announcement(candidate), endsAt: candidate.endsAt === null ? null : new Date(candidate.endsAt).toISOString() }
      : candidate.kind === 'voting'
        ? { kind: 'voting', eventCode: candidate.eventCode, text: 'Voting', endsAt: null }
        : { kind: candidate.kind, text: candidate.text.trim(), endsAt: candidate.endsAt === null ? null : new Date(candidate.endsAt).toISOString() };
  }
  return { atmosphere: value.atmosphere, chapters: value.chapters.map(({ id, title }) => ({ id, title: title.trim() })), activeChapterId: value.activeChapterId, prompts: value.prompts.map(({ id, text }) => ({ id, text: text.trim() })), announcements: announcements.map(item => ({ id: item.id, ...announcement(item) })), overlay };
}

function storedStage(state) {
  let stage;
  try { stage = JSON.parse(state.stage_config || '{}'); } catch { return defaultStage(); }
  return record(stage) && ATMOSPHERES.includes(stage.atmosphere) ? { ...defaultStage(), ...stage } : defaultStage();
}

const activeOverlay = overlay => overlay && (!overlay.endsAt || Date.parse(overlay.endsAt) > Date.now()) ? overlay : null;
const resumableOverlay = overlay => ['prompt', 'reflection', 'announcement', 'voting'].includes(overlay?.kind) ? activeOverlay(overlay) : null;
const overrideOverlay = overlay => ['announcement', 'voting'].includes(overlay?.kind);

function readStage(state) {
  const { returnOverlay, ...stage } = storedStage(state);
  const resumeOverlay = resumableOverlay(returnOverlay);
  return { ...stage, overlay: activeOverlay(stage.overlay) || (overrideOverlay(stage.overlay) ? resumeOverlay : null), resumeOverlay: activeOverlay(stage.overlay) && overrideOverlay(stage.overlay) ? resumeOverlay : null };
}

function publicStage(state) {
  const stage = readStage(state);
  return { ...stage, chapters: stage.chapters.filter(item => item.id === stage.activeChapterId), prompts: [], announcements: [] };
}

async function eligibleStage(env, stage) {
  for (const key of ['overlay', 'resumeOverlay']) {
    if (stage[key]?.kind !== 'voting') continue;
    const event = await env.DB.prepare("SELECT id FROM voting_events WHERE public_code=? AND status IN ('open','closed')").bind(stage[key].eventCode).first();
    if (!event) stage[key] = null;
  }
  if (!stage.overlay && stage.resumeOverlay) { stage.overlay = stage.resumeOverlay; stage.resumeOverlay = null; }
  return stage;
}

export async function credentialVersion(env) {
  if (!env.SPILL_ADMIN_PASSWORD) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SPILL_ADMIN_PASSWORD));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

// Atomic, shared D1 fixed-window admission. Account-wide keys deliberately do
// not trust proxy/client supplied IP headers.
export async function authAdmission(env, key, maximum, seconds) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = `${key}:${Math.floor(now / seconds)}`;
  const expiry = (Math.floor(now / seconds) + 1) * seconds;
  const result = await env.DB.prepare('INSERT INTO auth_rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(bucket, expiry, maximum).first();
  // Cleanup is bounded to expired entries; no identity/IP data is stored.
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE expires_at < ?').bind(now - seconds).run();
  return result ? null : reply({ error: 'Too many attempts. Try again shortly.' }, 429, { 'Retry-After': String(Math.max(1, expiry - now)) });
}

export async function clearAuthAdmission(env, key, seconds) {
  const bucket = `${key}:${Math.floor(Date.now() / 1000 / seconds)}`;
  await env.DB.prepare('DELETE FROM auth_rate_limits WHERE bucket=?').bind(bucket).run();
}

async function ensureState(env, sessionId) {
  await env.DB.prepare('INSERT OR IGNORE INTO platform_state(session_id) SELECT id FROM discussion_sessions WHERE id=?').bind(sessionId).run();
  await env.DB.prepare('INSERT OR IGNORE INTO presentation_state(session_id) SELECT id FROM discussion_sessions WHERE id=?').bind(sessionId).run();
  return env.DB.prepare('SELECT * FROM platform_state WHERE session_id=?').bind(sessionId).first();
}

async function pollData(env, sessionId) {
  const polls = await rows(env.DB, 'SELECT id,question,status,created_at FROM polls WHERE session_id=? ORDER BY created_at DESC', sessionId);
  const options = await rows(env.DB, 'SELECT o.poll_id,o.id,o.label,COUNT(v.option_id) AS votes FROM poll_options o JOIN polls p ON p.id=o.poll_id LEFT JOIN poll_votes v ON v.option_id=o.id AND v.poll_id=o.poll_id WHERE p.session_id=? GROUP BY o.id ORDER BY o.poll_id,o.position', sessionId);
  const grouped = new Map();
  for (const { poll_id, ...option } of options) {
    if (!grouped.has(poll_id)) grouped.set(poll_id, []);
    grouped.get(poll_id).push(option);
  }
  for (const poll of polls) {
    poll.options = grouped.get(poll.id) || [];
    poll.totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
  }
  return polls;
}

export async function platformState(env, sessionId) {
  const state = await ensureState(env, sessionId);
  if (!state) return null;
  const queue = await rows(env.DB, "SELECT s.id,s.nickname,s.category,s.content,s.moderation_status,q.position FROM projection_queue q JOIN submissions s ON s.id=q.submission_id AND s.session_id=q.session_id WHERE q.session_id=? AND s.moderation_status='approved' AND s.hidden_from_presentation=0 ORDER BY q.position,s.id", sessionId);
  const polls = await pollData(env, sessionId);
  const activity = await rows(env.DB, 'SELECT id,action,target_id,created_at FROM admin_activity WHERE session_id=? ORDER BY created_at DESC LIMIT 100', sessionId);
  const totals = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(moderation_status='pending') AS pending,SUM(moderation_status='approved') AS approved,SUM(moderation_status='hidden') AS rejected,SUM(discussed_at IS NOT NULL) AS discussed,COUNT(DISTINCT participant_id) AS participants FROM submissions WHERE session_id=?").bind(sessionId).first();
  const categories = await rows(env.DB, 'SELECT category,COUNT(*) AS count FROM submissions WHERE session_id=? GROUP BY category', sessionId);
  const timeline = await rows(env.DB, "SELECT substr(created_at,1,13) AS hour,COUNT(*) AS count FROM submissions WHERE session_id=? GROUP BY hour ORDER BY hour", sessionId);
  const projected = await env.DB.prepare("SELECT COUNT(DISTINCT target_id) AS count FROM admin_activity WHERE session_id=? AND action IN ('advance','project')").bind(sessionId).first();
  const presentation = await env.DB.prepare('SELECT p.current_submission_id,s.status FROM discussion_sessions s LEFT JOIN presentation_state p ON p.session_id=s.id WHERE s.id=?').bind(sessionId).first();
  return { revision: state.revision, stage: await eligibleStage(env, readStage(state)), currentSubmissionId: presentation?.current_submission_id ?? null, sessionStatus: presentation?.status ?? null, queue, polls, reactionsEnabled: !!state.reactions_enabled, projectedPollId: state.projected_poll_id, activity, insights: { ...totals, projected: projected.count, categories, timeline, polls } };
}

export async function handlePlatform(request, env, admin, sessionId, verifyPassword) {
  if (request.method === 'GET') {
    const state = await platformState(env, sessionId);
    return state ? reply(state) : reply({ error: 'Discussion not found.' }, 404);
  }
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  const body = await request.json().catch(() => null);
  if (!body || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return reply({ error: 'Refresh before making this change.', code: 'revision_required' }, 400);
  const state = await ensureState(env, sessionId);
  if (!state) return reply({ error: 'Discussion not found.' }, 404);
  if (state.revision !== body.expectedRevision) return conflict();
  const allowed = ['enqueue','remove','reorder','clearQueue','advance','createPoll','openPoll','closePoll','projectPoll','deletePoll','setReactions','clearProjection','clearPoll','configureStage'];
  if (!allowed.includes(body.action)) return reply({ error: 'Unknown action.' }, 400);
  const mutationId = uuid();
  const guard = 'EXISTS(SELECT 1 FROM platform_state WHERE session_id=? AND mutation_id=?)';
  const guarded = (sql, ...params) => env.DB.prepare(sql).bind(...params, sessionId, mutationId);
  const statements = [env.DB.prepare('UPDATE platform_state SET revision=revision+1,mutation_id=? WHERE session_id=? AND revision=? RETURNING revision').bind(mutationId, sessionId, body.expectedRevision)];
  let target = body.submissionId || body.pollId || null;
  if (body.action === 'configureStage') {
    const previous = readStage(state);
    const stored = storedStage(state);
    let candidate = record(body.stage) && body.stage.announcements === undefined ? { ...body.stage, announcements: previous.announcements } : body.stage;
    if (record(candidate) && candidate.overlay?.endsAt && Date.parse(candidate.overlay.endsAt) <= Date.now() && JSON.stringify(candidate.overlay) === JSON.stringify(stored.overlay)) {
      candidate = { ...candidate, overlay: previous.overlay };
    }
    const stage = validateStage(candidate);
    if (!stage) return reply({ error: 'Use a valid atmosphere, up to 20 chapters, prompts and announcements, and a supported stage message. Timed messages must end within 24 hours.' }, 400);
    if (stage.overlay?.kind === 'voting') {
      const event = await env.DB.prepare("SELECT id FROM voting_events WHERE public_code=? AND status IN ('open','closed')").bind(stage.overlay.eventCode).first();
      if (!event) return reply({ error: 'Open a valid voting event before projecting it.' }, 400);
    }
    const returnOverlay = overrideOverlay(stage.overlay)
      ? previous.overlay?.kind === stage.overlay.kind ? resumableOverlay(stored.returnOverlay) : resumableOverlay(previous.overlay)
      : null;
    if (!stage.overlay && overrideOverlay(previous.overlay)) stage.overlay = resumableOverlay(stored.returnOverlay);
    const votingCodes = [...new Set([stage.overlay, returnOverlay].filter(item => item?.kind === 'voting').map(item => item.eventCode))];
    if (votingCodes.length) {
      const eligibility = votingCodes.map(() => "EXISTS(SELECT 1 FROM voting_events WHERE public_code=? AND status IN ('open','closed'))").join(' AND ');
      statements[0] = env.DB.prepare(`UPDATE platform_state SET revision=revision+1,mutation_id=? WHERE session_id=? AND revision=? AND ${eligibility} RETURNING revision`).bind(mutationId, sessionId, body.expectedRevision, ...votingCodes);
    }
    statements.push(guarded(`UPDATE platform_state SET stage_config=? WHERE session_id=? AND ${guard}`, JSON.stringify({ ...stage, returnOverlay }), sessionId));
  } else if (body.action === 'enqueue') {
    const eligible = await env.DB.prepare("SELECT id FROM submissions WHERE id=? AND session_id=? AND moderation_status='approved' AND hidden_from_presentation=0").bind(body.submissionId || '', sessionId).first();
    if (!eligible) return reply({ error: 'Only approved, visible contributions can be queued.' }, 400);
    statements.push(guarded(`INSERT OR IGNORE INTO projection_queue(session_id,submission_id,position) SELECT ?,?,COALESCE((SELECT MAX(position)+1 FROM projection_queue WHERE session_id=?),0) WHERE ${guard}`, sessionId, body.submissionId, sessionId));
  } else if (body.action === 'remove') {
    statements.push(guarded(`DELETE FROM projection_queue WHERE session_id=? AND submission_id=? AND ${guard}`, sessionId, String(body.submissionId || '')));
  } else if (body.action === 'clearQueue') {
    statements.push(guarded(`DELETE FROM projection_queue WHERE session_id=? AND ${guard}`, sessionId));
  } else if (body.action === 'reorder') {
    const ids = body.submissionIds || body.ids;
    const current = await rows(env.DB, 'SELECT submission_id FROM projection_queue WHERE session_id=?', sessionId);
    if (!Array.isArray(ids) || ids.length > 1000 || ids.length !== current.length || new Set(ids).size !== ids.length || current.some(item => !ids.includes(item.submission_id))) return reply({ error: 'Queue changed. Refresh before reordering.' }, 409);
    statements.push(guarded(`UPDATE projection_queue SET position=(SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value=projection_queue.submission_id) WHERE session_id=? AND ${guard}`, JSON.stringify(ids), sessionId));
  } else if (body.action === 'advance') {
    const next = await env.DB.prepare("SELECT s.id FROM projection_queue q JOIN submissions s ON s.id=q.submission_id AND s.session_id=q.session_id WHERE q.session_id=? AND s.moderation_status='approved' AND s.hidden_from_presentation=0 ORDER BY q.position,s.id LIMIT 1").bind(sessionId).first();
    if (!next) return reply({ error: 'The projection queue is empty.' }, 400);
    target = next.id;
    statements.push(guarded(`INSERT INTO presentation_state(session_id,current_submission_id,updated_at,updated_by,revision) SELECT ?,?,?,?,1 WHERE ${guard} ON CONFLICT(session_id) DO UPDATE SET current_submission_id=excluded.current_submission_id,updated_at=excluded.updated_at,updated_by=excluded.updated_by,revision=presentation_state.revision+1`, sessionId, next.id, iso(), admin.user.id));
    statements.push(guarded(`DELETE FROM projection_queue WHERE session_id=? AND submission_id=? AND ${guard}`, sessionId, next.id));
    statements.push(guarded(`UPDATE platform_state SET projected_poll_id=NULL WHERE session_id=? AND ${guard}`, sessionId));
  } else if (body.action === 'clearPoll') {
    statements.push(guarded(`UPDATE platform_state SET projected_poll_id=NULL WHERE session_id=? AND ${guard}`, sessionId));
  } else if (body.action === 'clearProjection') {
    statements.push(guarded(`UPDATE presentation_state SET current_submission_id=NULL,revision=revision+1,updated_at=? WHERE session_id=? AND ${guard}`, iso(), sessionId));
    statements.push(guarded(`UPDATE platform_state SET projected_poll_id=NULL WHERE session_id=? AND ${guard}`, sessionId));
  } else if (body.action === 'createPoll') {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const options = Array.isArray(body.options) ? body.options.map(value => typeof value === 'string' ? value.trim() : '') : [];
    if (!question || question.length > 300 || options.length < 2 || options.length > 8 || options.some(value => !value || value.length > 120) || new Set(options).size !== options.length) return reply({ error: 'Use a question and 2–8 different choices.' }, 400);
    const pollId = uuid(); target = pollId;
    statements.push(guarded(`INSERT INTO polls(id,session_id,question,status,created_at) SELECT ?,?,?,'draft',? WHERE ${guard}`, pollId, sessionId, question, iso()));
    options.forEach((label, index) => statements.push(guarded(`INSERT INTO poll_options(id,poll_id,label,position) SELECT ?,?,?,? WHERE ${guard}`, uuid(), pollId, label, index)));
  } else if (['openPoll','closePoll','projectPoll','deletePoll'].includes(body.action)) {
    const poll = await env.DB.prepare('SELECT id FROM polls WHERE id=? AND session_id=?').bind(String(body.pollId || ''), sessionId).first();
    if (!poll) return reply({ error: 'Poll not found in this discussion.' }, 404);
    if (body.action === 'deletePoll') {
      const verified = await verifyPassword(request, env, admin, body.password);
      if (verified.response) return verified.response;
      statements.push(guarded(`UPDATE platform_state SET projected_poll_id=NULL WHERE session_id=? AND projected_poll_id=? AND ${guard}`, sessionId, poll.id));
      statements.push(guarded(`DELETE FROM polls WHERE id=? AND session_id=? AND ${guard}`, poll.id, sessionId));
    } else if (body.action === 'projectPoll') {
      statements.push(guarded(`UPDATE platform_state SET projected_poll_id=? WHERE session_id=? AND ${guard}`, poll.id, sessionId));
      statements.push(guarded(`UPDATE presentation_state SET current_submission_id=NULL,revision=revision+1,updated_at=? WHERE session_id=? AND ${guard}`, iso(), sessionId));
    } else {
      if (body.action === 'openPoll') statements.push(guarded(`UPDATE polls SET status='closed' WHERE session_id=? AND status='open' AND ${guard}`, sessionId));
      statements.push(guarded(`UPDATE polls SET status=? WHERE id=? AND session_id=? AND ${guard}`, body.action === 'openPoll' ? 'open' : 'closed', poll.id, sessionId));
    }
  } else if (body.action === 'setReactions') {
    if (typeof body.enabled !== 'boolean') return reply({ error: 'Choose whether reactions are enabled.' }, 400);
    statements.push(guarded(`UPDATE platform_state SET reactions_enabled=? WHERE session_id=? AND ${guard}`, body.enabled ? 1 : 0, sessionId));
  }
  if (['advance', 'projectPoll', 'clearProjection'].includes(body.action)) {
    statements.push(guarded(`UPDATE platform_state SET stage_config=json_set(stage_config,'$.overlay',NULL,'$.returnOverlay',NULL) WHERE session_id=? AND ${guard}`, sessionId));
  }
  statements.push(guarded(`INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`, uuid(), sessionId, admin.user.id, body.action, target, iso()));
  try {
    const results = await env.DB.batch(statements);
    if (!results[0].results?.length) return conflict();
    return reply(await platformState(env, sessionId));
  } catch {
    return reply({ error: 'Could not apply this change. Refresh and try again.' }, 409);
  }
}

export async function handleEngagement(request, env, code, action) {
  const session = await env.DB.prepare('SELECT id,status FROM discussion_sessions WHERE public_code=?').bind(code).first();
  if (!session) return reply({ error: 'Discussion not found.' }, 404);
  const state = await ensureState(env, session.id);
  if (request.method === 'GET') {
    const polls = await pollData(env, session.id);
    const poll = polls.find(item => item.status === 'open') || null;
    const projectedPoll = polls.find(item => item.id === state.projected_poll_id) || null;
    const reactions = state.reactions_enabled ? await rows(env.DB, 'SELECT reaction,COUNT(*) AS count FROM reaction_events WHERE session_id=? AND created_at>? GROUP BY reaction', session.id, Date.now() - 15000) : [];
    const stage = await eligibleStage(env, publicStage(state));
    return reply({ stage, poll, projectedPoll, presentationPoll: projectedPoll, reactionsEnabled: !!state.reactions_enabled, reactions });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.participant_id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.participant_id)) return reply({ error: 'Rejoin this discussion before participating.' }, 400);
  if (session.status !== 'live') return reply({ error: 'Participation is paused.' }, 409);
  if (action === 'vote') {
    if (typeof body.poll_id !== 'string' || typeof body.option_id !== 'string') return reply({ error: 'Choose an answer.' }, 400);
    const poll = await env.DB.prepare("SELECT p.id FROM polls p JOIN poll_options o ON o.poll_id=p.id WHERE p.id=? AND o.id=? AND p.session_id=? AND p.status='open'").bind(body.poll_id, body.option_id, session.id).first();
    if (!poll) return reply({ error: 'This poll is no longer open.' }, 409);
    const admitted = await env.DB.prepare("INSERT OR IGNORE INTO poll_votes(poll_id,participant_id,option_id,created_at) SELECT p.id,?,?,? FROM polls p JOIN discussion_sessions s ON s.id=p.session_id WHERE p.id=? AND p.session_id=? AND p.status='open' AND s.status='live' AND EXISTS(SELECT 1 FROM poll_options WHERE id=? AND poll_id=p.id) RETURNING poll_id").bind(body.participant_id, body.option_id, iso(), body.poll_id, session.id, body.option_id).first();
    if (!admitted) {
      const existing = await env.DB.prepare('SELECT option_id FROM poll_votes WHERE poll_id=? AND participant_id=?').bind(body.poll_id, body.participant_id).first();
      if (existing) return reply({ ok: true, duplicate: true, optionId: existing.option_id });
      return reply({ error: 'Voting closed before your answer was received.' }, 409);
    }
    return reply({ ok: true, duplicate: false, optionId: body.option_id });
  }
  if (action === 'reactions') {
    if (!['agree','insight','heart'].includes(body.reaction)) return reply({ error: 'Choose a supported reaction.' }, 400);
    const now = Date.now();
    const result = await env.DB.prepare("INSERT OR IGNORE INTO reaction_events(session_id,participant_id,reaction,created_at) SELECT s.id,?,?,? FROM discussion_sessions s JOIN platform_state p ON p.session_id=s.id WHERE s.id=? AND s.status='live' AND p.reactions_enabled=1 AND NOT EXISTS(SELECT 1 FROM reaction_events WHERE session_id=s.id AND participant_id=? AND created_at>?) RETURNING session_id").bind(body.participant_id, body.reaction, now, session.id, body.participant_id, now - 3000).first();
    await env.DB.prepare('DELETE FROM reaction_events WHERE session_id=? AND created_at<?').bind(session.id, now - 60000).run();
    return result ? reply({ ok: true }) : reply({ error: state.reactions_enabled ? 'Give the room a moment before reacting again.' : 'Reactions are disabled.' }, state.reactions_enabled ? 429 : 409);
  }
  return reply({ error: 'Not found.' }, 404);
}

export async function exportSession(env, sessionId) {
  const session = await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id=?').bind(sessionId).first();
  if (!session) return reply({ error: 'Discussion not found.' }, 404);
  const data = await rows(env.DB, "SELECT category,content,created_at,discussed_at FROM submissions WHERE session_id=? AND moderation_status='approved' ORDER BY created_at", sessionId);
  const cell = value => {
    const text = String(value ?? '');
    const safe = /^\s*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = ['category,content,created_at,discussed_at', ...data.map(row => [row.category,row.content,row.created_at,row.discussed_at].map(cell).join(','))].join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="session-approved-contributions.csv"', 'Cache-Control': 'no-store' } });
}
