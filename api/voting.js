import { authAdmission } from './platform.js';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => reply({ error: message }, status);
const conflict = () => reply({ error: 'This voting event changed. Review the refreshed state and retry.', code: 'concurrent_change' }, 409);
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isCode = value => typeof value === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const DEFAULT_SETTINGS = { resultsMode: 'hidden', visualization: 'bars', showTotal: true, showCounts: true, showPercentages: true, highlightLeader: true, animations: true, participantResults: false, atmosphere: 'midnight' };
const SETTINGS_ENUMS = { resultsMode: ['live', 'hidden'], visualization: ['bars', 'rows', 'donut', 'comparison'], atmosphere: ['midnight', 'electric', 'reflection', 'royal', 'celestial', 'velvet', 'aurora'] };
const settingsOf = row => ({ ...DEFAULT_SETTINGS, ...parse(row.settings, {}) });

function settingsInput(value, previous = DEFAULT_SETTINGS) {
  if (!object(value)) return null;
  const result = { ...previous };
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) return null;
    if (Object.hasOwn(SETTINGS_ENUMS, key) ? !SETTINGS_ENUMS[key].includes(item) : typeof item !== 'boolean') return null;
    result[key] = item;
  }
  return result;
}

function draftInput(body) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200 || !Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 10) return null;
  if (body.sessionId !== undefined && body.sessionId !== null && !isUuid(body.sessionId)) return null;
  const questions = [];
  for (const question of body.questions) {
    if (!object(question) || typeof question.text !== 'string' || !question.text.trim() || question.text.trim().length > 300 || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 8) return null;
    const labels = question.options.map(label => typeof label === 'string' ? label.trim() : '');
    if (labels.some(label => !label || label.length > 120) || new Set(labels.map(label => label.toLowerCase())).size !== labels.length) return null;
    questions.push({ id: uuid(), text: question.text.trim(), options: labels.map(label => ({ id: uuid(), label })) });
  }
  return { title: body.title.trim(), sessionId: body.sessionId || null, questions };
}

async function jsonBody(request) {
  if (Number(request.headers.get('content-length')) > 32768) return { response: fail('Request too large.', 413) };
  try {
    const text = await request.text();
    if (text.length > 32768) return { response: fail('Request too large.', 413) };
    const body = JSON.parse(text);
    return object(body) ? { body } : { response: fail('Invalid request.') };
  } catch { return { response: fail('Invalid request.') }; }
}

function publicCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let value = '';
  while (value.length < 8) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    if (byte < limit) value += alphabet[byte % alphabet.length];
  }
  return value;
}

export function votingPercentages(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map(count => count * 100 / total);
  const rounded = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - rounded[index] })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let remaining = 100 - rounded.reduce((sum, count) => sum + count, 0), index = 0; remaining > 0; remaining--, index++) rounded[order[index].index]++;
  return rounded;
}

const aggregateSql = `SELECT q.id AS question_id,q.event_id,q.text,q.ballot_type,q.position AS question_position,q.revealed,o.id AS option_id,o.label,o.position AS option_position,COUNT(v.option_id) AS votes
 FROM voting_questions q JOIN voting_options o ON o.question_id=q.id
 LEFT JOIN voting_votes v ON v.question_id=q.id AND v.option_id=o.id AND v.round_number=%ROUND%
 WHERE q.event_id=(SELECT id FROM voting_events WHERE %FILTER%)
 GROUP BY q.id,o.id ORDER BY q.position,o.position`;

function questionsFromRows(rows) {
  const questions = [];
  const grouped = new Map();
  for (const row of rows) {
    let question = grouped.get(row.question_id);
    if (!question) {
      question = { id: row.question_id, text: row.text, ballotType: row.ballot_type, revealed: !!row.revealed, options: [] };
      grouped.set(question.id, question); questions.push(question);
    }
    question.options.push({ id: row.option_id, label: row.label, votes: Number(row.votes) });
  }
  return questions;
}

async function snapshot(env, value, byCode = false, historyRound = null) {
  const filter = byCode ? 'public_code=?' : 'id=?';
  // D1 batch reads share one transactional snapshot, including the version and
  // aggregates, rather than pairing newer counts with an older response version.
  const result = await env.DB.batch([
    env.DB.prepare(`SELECT e.*,(SELECT ever_public FROM voting_rounds r WHERE r.event_id=e.id AND r.round_number=e.current_round) AS round_ever_public FROM voting_events e WHERE ${filter}`).bind(value),
    env.DB.prepare(aggregateSql.replace('%FILTER%', filter).replace('%ROUND%', '(SELECT current_round FROM voting_events WHERE id=q.event_id)')).bind(value),
    ...(!byCode ? [env.DB.prepare(`SELECT r.round_number AS roundNumber,r.created_at AS createdAt,r.opened_at AS openedAt,r.last_opened_at AS lastOpenedAt,r.closed_at AS closedAt,r.reopen_count AS reopenCount,r.ever_public AS previouslyPublic,COUNT(v.option_id) AS totalVotes FROM voting_rounds r LEFT JOIN voting_votes v ON v.event_id=r.event_id AND v.round_number=r.round_number WHERE r.event_id=? GROUP BY r.round_number ORDER BY r.round_number DESC LIMIT 50`).bind(value)] : []),
    ...(!byCode && historyRound ? [env.DB.prepare(aggregateSql.replace('%FILTER%', filter).replace('%ROUND%', '?')).bind(historyRound, value), env.DB.prepare('SELECT round_number AS roundNumber,created_at AS createdAt,closed_at AS closedAt,reopen_count AS reopenCount,ever_public AS previouslyPublic FROM voting_rounds WHERE event_id=? AND round_number=?').bind(value, historyRound)] : []),
  ]);
  const event = result[0].results[0];
  if (!event) return null;
  const history = historyRound && result[4]?.results[0] ? { ...result[4].results[0], questions: questionsFromRows(result[3].results) } : null;
  return { event, questions: questionsFromRows(result[1].results), rounds: result[2]?.results || [], history };
}

function resultQuestion(question) {
  const counts = question.options.map(option => option.votes);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const percentages = votingPercentages(counts);
  const highest = Math.max(...counts);
  const leaders = total ? question.options.filter(option => option.votes === highest).map(option => option.id) : [];
  return { id: question.id, text: question.text, ballotType: question.ballotType, resultsVisible: true, options: question.options.map((option, index) => ({ ...option, percentage: percentages[index] })), totalVotes: total, leaderIds: leaders, outcome: !total ? 'empty' : leaders.length > 1 ? 'tied' : 'leading' };
}

function presentationOf(row, questions = []) {
  const value = parse(row.presentation, {});
  return { questionId: value.questionId || questions[0]?.id || null, content: ['qr', 'question', 'results', 'hidden'].includes(value.content) ? value.content : 'hidden', revealId: value.revealId || null };
}

function serialize(data, admin = false) {
  const row = data.event;
  const settings = settingsOf(row);
  const presentation = presentationOf(row, data.questions);
  const finalized = row.status === 'closed';
  const projectionAllowed = question => presentation.content === 'results' && presentation.questionId === question.id &&
    ((settings.resultsMode === 'live' && ['open', 'closed'].includes(row.status)) || (finalized && question.revealed));
  let visibleVotes = 0;
  const questions = data.questions.map(question => {
    const visible = admin || projectionAllowed(question) || (finalized && settings.participantResults);
    const base = { id: question.id, text: question.text, ballotType: question.ballotType, resultsVisible: visible, options: question.options.map(option => ({ id: option.id, label: option.label })) };
    if (admin) base.revealed = question.revealed;
    if (!visible) return base;
    const result = resultQuestion(question);
    visibleVotes += result.totalVotes;
    return { ...base, ...result };
  });
  const selected = data.questions.find(question => question.id === presentation.questionId);
  return {
    ...(admin ? { id: row.id, sessionId: row.session_id, rounds: data.rounds || [], history: data.history ? { ...data.history, questions: data.history.questions.map(resultQuestion) } : null } : {}),
    code: row.public_code, title: row.title, status: row.status,
    currentRound: row.current_round || 1,
    revision: row.revision,
    // Hidden public versions expose configuration changes only. Visible public
    // versions derive exclusively from the counts actually authorized here.
    version: row.revision + (admin ? row.results_version : visibleVotes),
    settings, presentation, previouslyPublic: !!row.ever_public, roundPreviouslyPublic: !!row.round_ever_public,
    resultsVisible: !!selected && projectionAllowed(selected),
    questionCount: questions.length, questions,
    createdAt: row.created_at, updatedAt: row.updated_at, closedAt: row.closed_at,
  };
}

function activity(env, admin, event, action, guard = '', params = []) {
  return env.DB.prepare(`INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) SELECT ?,?,?,?,?,? ${guard ? `WHERE ${guard}` : ''}`)
    .bind(uuid(), event.session_id || event.id, admin.user.id, `voting_${action}`, event.id, now(), ...params);
}

async function sessionExists(env, id) {
  return !id || !!await env.DB.prepare('SELECT id FROM discussion_sessions WHERE id=?').bind(id).first();
}

function questionStatements(env, eventId, questions, guard = '', params = []) {
  const statements = [];
  questions.forEach((question, index) => {
    statements.push(env.DB.prepare(`INSERT INTO voting_questions(id,event_id,text,position) SELECT ?,?,?,? ${guard ? `WHERE ${guard}` : ''}`).bind(question.id, eventId, question.text, index, ...params));
    question.options.forEach((option, position) => statements.push(env.DB.prepare(`INSERT INTO voting_options(id,question_id,label,position) SELECT ?,?,?,? ${guard ? `WHERE ${guard}` : ''}`).bind(option.id, question.id, option.label, position, ...params)));
  });
  return statements;
}

export async function handleVotingCollection(request, env, admin, verifyPassword) {
  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get('limit') || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || [...params.keys()].some(key => !['limit','cursor'].includes(key))) return fail('Use a voting page size from 1 to 50.');
    let cursor;
    if (params.has('cursor')) {
      try { const value = params.get('cursor'); if (value.length > 500 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error(); cursor = JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/'))); if (!isUuid(cursor.id) || typeof cursor.at !== 'string' || cursor.at.length > 40 || !Number.isFinite(Date.parse(cursor.at))) throw Error(); }
      catch { return fail('Refresh the voting list before loading another page.'); }
    }
    const sql = 'SELECT e.*,(SELECT COUNT(*) FROM voting_questions q WHERE q.event_id=e.id) AS question_count FROM voting_events e';
    const query = cursor ? env.DB.prepare(sql + ' WHERE e.created_at<? OR (e.created_at=? AND e.id<?) ORDER BY e.created_at DESC,e.id DESC LIMIT ?').bind(cursor.at,cursor.at,cursor.id,limit+1) : env.DB.prepare(sql+' ORDER BY e.created_at DESC,e.id DESC LIMIT ?').bind(limit+1);
    const rows = (await query.all()).results || [];
    const results = rows.slice(0,limit); const last = results.at(-1);
    const nextCursor = rows.length > limit && last ? btoa(JSON.stringify({ at:last.created_at,id:last.id })).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'') : null;
    return reply({ events: results.map(row => ({ ...serialize({ event: row, questions: [] }, true), questionCount: row.question_count })), nextCursor });
  }
  if (request.method !== 'POST') return fail('Method not allowed.', 405);
  const input = await jsonBody(request);
  if (input.response) return input.response;
  if (input.body.action === 'bulkDelete') return bulkDelete(request, env, admin, input.body, verifyPassword);
  const draft = draftInput(input.body);
  const settings = input.body.settings === undefined ? { ...DEFAULT_SETTINGS } : settingsInput(input.body.settings);
  if (!draft || !settings || !await sessionExists(env, draft.sessionId)) return fail('Use a title, up to ten questions, two to eight distinct choices each, and an existing optional discussion.');
  const id = uuid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = publicCode();
    const timestamp = now();
    const presentation = { questionId: draft.questions[0].id, content: 'hidden', revealId: null };
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO voting_events(id,public_code,title,session_id,settings,presentation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id, code, draft.title, draft.sessionId, JSON.stringify(settings), JSON.stringify(presentation), timestamp, timestamp),
        ...questionStatements(env, id, draft.questions),
        activity(env, admin, { id, session_id: draft.sessionId }, 'create'),
      ]);
      return reply({ event: serialize(await snapshot(env, id), true) });
    } catch (error) {
      if (!String(error).includes('voting_events.public_code') || attempt === 4) throw error;
    }
  }
  return fail('Could not create this voting event. Please retry.', 503);
}

export async function handleVotingAdmin(request, env, admin, id, verifyPassword) {
  if (!isUuid(id)) return fail('Voting event not found.', 404);
  const requestedRound = new URL(request.url).searchParams.get('round');
  if (requestedRound !== null && (!/^[1-9][0-9]{0,5}$/.test(requestedRound))) return fail('Choose a valid voting round.');
  const data = await snapshot(env, id, false, request.method === 'GET' && requestedRound ? Number(requestedRound) : null);
  if (!data) return fail('Voting event not found.', 404);
  if (request.method === 'GET') return requestedRound && !data.history ? fail('Voting round not found.', 404) : reply({ event: serialize(data, true) });
  if (request.method !== 'POST') return fail('Method not allowed.', 405);
  const input = await jsonBody(request);
  if (input.response) return input.response;
  const body = input.body;
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return fail('Refresh before changing this voting event.');
  if (body.expectedRevision !== data.event.revision) return conflict();
  const actions = ['edit', 'open', 'reopen', 'newRound', 'close', 'archive', 'delete', 'settings', 'present'];
  if (!actions.includes(body.action)) return fail('Unknown voting operation.');
  if (data.event.status === 'archived' && body.action !== 'delete') return fail('Archived voting events are read-only.', 409);
  if (body.action === 'delete') {
    if (admin?.user?.role !== 'admin') return fail('Administrator access is required.', 403);
    const eligible = await env.DB.prepare(`SELECT id FROM voting_events WHERE id=? AND status!='open' AND json_extract(presentation,'$.content')='hidden' AND NOT EXISTS(SELECT 1 FROM standalone_stages s,json_tree(CASE WHEN json_valid(s.stage_config) THEN s.stage_config ELSE '{}' END) j WHERE j.key='eventCode' AND j.value=voting_events.public_code) AND NOT EXISTS(SELECT 1 FROM platform_state s,json_tree(CASE WHEN json_valid(s.stage_config) THEN s.stage_config ELSE '{}' END) j WHERE j.key='eventCode' AND j.value=voting_events.public_code)`).bind(id).first();
    if (!eligible) return fail('Close voting, hide its presentation and detach all stage references before deleting.', 409);
    const verified = await verifyPassword(request, env, admin, body.password);
    if (!verified?.ok) return verified?.response || fail('Password verification failed.',403);
  }
  const mutationId = uuid();
  const guard = 'EXISTS(SELECT 1 FROM voting_events WHERE id=? AND mutation_id=?)';
  const guardParams = [id, mutationId];
  const guarded = (sql, ...params) => env.DB.prepare(sql).bind(...params, ...guardParams);
  const statements = [env.DB.prepare(`UPDATE voting_events SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? ${body.action === 'delete' ? ` AND status!='open' AND json_extract(presentation,'$.content')='hidden' AND NOT EXISTS(SELECT 1 FROM standalone_stages s,json_tree(CASE WHEN json_valid(s.stage_config) THEN s.stage_config ELSE '{}' END) j WHERE j.key='eventCode' AND j.value=voting_events.public_code) AND NOT EXISTS(SELECT 1 FROM platform_state s,json_tree(CASE WHEN json_valid(s.stage_config) THEN s.stage_config ELSE '{}' END) j WHERE j.key='eventCode' AND j.value=voting_events.public_code)` : ''} RETURNING revision`).bind(mutationId, now(), id, body.expectedRevision)];
  const settings = settingsOf(data.event);
  let nextSettings = settings;
  let presentation = presentationOf(data.event, data.questions);
  let releasedQuestion = null;
  if (body.action === 'edit') {
    if (data.event.status !== 'draft') return fail('Only draft voting events can be edited.', 409);
    const draft = draftInput(body);
    if (!draft || !await sessionExists(env, draft.sessionId)) return fail('Use a valid title, questions and optional discussion.');
    presentation = { questionId: draft.questions[0].id, content: 'hidden', revealId: null };
    statements.push(guarded(`UPDATE voting_events SET title=?,session_id=?,presentation=? WHERE id=? AND ${guard}`, draft.title, draft.sessionId, JSON.stringify(presentation), id));
    statements.push(guarded(`DELETE FROM voting_questions WHERE event_id=? AND ${guard}`, id));
    statements.push(...questionStatements(env, id, draft.questions, guard, guardParams));
  } else if (body.action === 'open') {
    if (data.event.status !== 'draft') return fail('Use Reopen Voting for a closed event.', 409);
    statements.push(guarded(`UPDATE voting_events SET status='open' WHERE id=? AND status='draft' AND ${guard}`, id));
    statements.push(guarded(`UPDATE voting_rounds SET opened_at=COALESCE(opened_at,?),last_opened_at=? WHERE event_id=? AND round_number=? AND ${guard}`, now(), now(), id, data.event.current_round));
  } else if (body.action === 'reopen' || body.action === 'newRound') {
    if (data.event.status !== 'closed') return fail('Close voting before reopening or starting another round.', 409);
    const fresh = body.action === 'newRound';
    if (fresh && body.confirmed !== true) return fail('Confirm that a new round starts a separate set of votes.');
    if (fresh && data.event.current_round >= 999999) return fail('This event has reached its round limit.', 409);
    nextSettings = { ...settings, participantResults: false };
    presentation = { ...presentation, revealId: fresh ? uuid() : presentation.revealId };
    statements.push(guarded(`UPDATE voting_events SET status='open',closed_at=NULL,current_round=current_round+?,settings=?,presentation=? WHERE id=? AND ${guard}`, fresh ? 1 : 0, JSON.stringify(nextSettings), JSON.stringify(presentation), id));
    statements.push(guarded(`UPDATE voting_questions SET revealed=0 WHERE event_id=? AND ${guard}`, id));
    if (fresh) {
      statements.push(guarded(`INSERT INTO voting_rounds(event_id,round_number,created_at,opened_at,last_opened_at) SELECT id,current_round,?,?,? FROM voting_events WHERE id=? AND ${guard}`, now(), now(), now(), id));
    } else {
      statements.push(guarded(`UPDATE voting_rounds SET opened_at=COALESCE(opened_at,?),last_opened_at=?,closed_at=NULL,reopen_count=reopen_count+1 WHERE event_id=? AND round_number=? AND ${guard}`, now(), now(), id, data.event.current_round));
    }
  } else if (body.action === 'close') {
    if (data.event.status !== 'open') return fail('This voting event is not open.', 409);
    statements.push(guarded(`UPDATE voting_events SET status='closed',closed_at=? WHERE id=? AND status='open' AND ${guard}`, now(), id));
    statements.push(guarded(`UPDATE voting_rounds SET closed_at=? WHERE event_id=? AND round_number=? AND ${guard}`, now(), id, data.event.current_round));
  } else if (body.action === 'archive') {
    if (data.event.status !== 'closed') return fail('Close voting before archiving.', 409);
    statements.push(guarded(`UPDATE voting_events SET status='archived' WHERE id=? AND status='closed' AND ${guard}`, id));
  } else if (body.action === 'settings') {
    nextSettings = settingsInput(body.settings, settings);
    if (!nextSettings) return fail('Use valid voting presentation settings.');
    statements.push(guarded(`UPDATE voting_events SET settings=? WHERE id=? AND ${guard}`, JSON.stringify(nextSettings), id));
    if (settings.resultsMode === 'live' && nextSettings.resultsMode === 'hidden') statements.push(guarded(`UPDATE voting_questions SET revealed=0 WHERE event_id=? AND ${guard}`, id));
  } else if (body.action === 'present') {
    if (!['open', 'closed'].includes(data.event.status)) return fail('Open voting before presenting it.', 409);
    if (!['qr', 'question', 'results', 'hidden'].includes(body.content)) return fail('Choose a valid stage content type.');
    const question = data.questions.find(item => item.id === (body.questionId || presentation.questionId));
    if (!question) return fail('Choose a question from this voting event.');
    if (body.reveal !== undefined && typeof body.reveal !== 'boolean') return fail('Use a valid reveal setting.');
    if (body.content === 'results' && settings.resultsMode === 'hidden') {
      if (data.event.status !== 'closed' || (!body.reveal && !question.revealed)) return fail('Close voting, then explicitly reveal the final results.', 409);
      if (body.reveal) {
        releasedQuestion = question.id;
        statements.push(guarded(`UPDATE voting_questions SET revealed=1 WHERE id=? AND event_id=? AND ${guard}`, question.id, id));
      }
    }
    if (body.reveal && (body.content !== 'results' || data.event.status !== 'closed')) return fail('Final reveal is available only after voting closes.', 409);
    const changed = presentation.questionId !== question.id || presentation.content !== body.content || body.reveal;
    presentation = { questionId: question.id, content: body.content, revealId: changed ? uuid() : presentation.revealId };
    statements.push(guarded(`UPDATE voting_events SET presentation=? WHERE id=? AND ${guard}`, JSON.stringify(presentation), id));
  }
  const selected = data.questions.find(question => question.id === presentation.questionId);
  const nextStatus = ['open','reopen','newRound'].includes(body.action) ? 'open' : body.action === 'close' ? 'closed' : body.action === 'archive' ? 'archived' : data.event.status;
  const projectedPublic = presentation.content === 'results' && ['open', 'closed'].includes(nextStatus) &&
    (nextSettings.resultsMode === 'live' || (nextStatus === 'closed' && (releasedQuestion || (selected?.revealed && !(settings.resultsMode === 'live' && nextSettings.resultsMode === 'hidden')))));
  if (projectedPublic || (nextStatus === 'closed' && nextSettings.participantResults)) {
    statements.push(guarded(`UPDATE voting_events SET ever_public=1 WHERE id=? AND ${guard}`, id));
    statements.push(guarded(`UPDATE voting_rounds SET ever_public=1 WHERE event_id=? AND round_number=(SELECT current_round FROM voting_events WHERE id=?) AND ${guard}`, id, id));
  }
  statements.push(activity(env, admin, data.event, body.action, guard, guardParams));
  if (body.action === 'delete') statements.push(guarded(`DELETE FROM voting_events WHERE id=? AND ${guard}`, id));
  const changed = await env.DB.batch(statements);
  if (!changed[0].results.length) return conflict();
  if (body.action === 'delete') return reply({ ok: true });
  return reply({ event: serialize(await snapshot(env, id), true) });
}

export async function handleVotingPublic(request, env, code, operation) {
  if (!isCode(code)) return fail('Voting event not found.', 404);
  if (!operation && request.method === 'GET') {
    const data = await snapshot(env, code, true);
    if (!data || ['draft', 'archived'].includes(data.event.status)) return fail('Voting event not found.', 404);
    return reply({ event: serialize(data) });
  }
  if (operation !== 'vote' || request.method !== 'POST') return fail('Method not allowed.', 405);
  const input = await jsonBody(request);
  if (input.response) return input.response;
  const body = input.body;
  if (!isUuid(body.participant_id) || !isUuid(body.questionId) || !isUuid(body.optionId)) return fail('Choose a valid answer.');
  const event = await env.DB.prepare('SELECT id,status,current_round FROM voting_events WHERE public_code=?').bind(code).first();
  if (!event || event.status === 'draft') return fail('Voting event not found.', 404);
  const round = body.round === undefined ? 1 : body.round;
  if (!Number.isInteger(round) || round < 1) return fail('Choose a valid voting round.');
  if (round !== event.current_round) return reply({ error: 'The voting round changed. Review the current question and vote again.', code: 'round_changed' }, 409);
  const option = await env.DB.prepare('SELECT o.id FROM voting_options o JOIN voting_questions q ON q.id=o.question_id WHERE o.id=? AND q.id=? AND q.event_id=? AND q.ballot_type=\'single\'').bind(body.optionId, body.questionId, event.id).first();
  if (!option) return fail('Choose an answer from this ballot.');
  const previous = () => env.DB.prepare('SELECT option_id FROM voting_votes WHERE event_id=? AND question_id=? AND participant_id=? AND round_number=?').bind(event.id, body.questionId, body.participant_id, round).first();
  const existing = await previous();
  if (existing) return existing.option_id === body.optionId ? reply({ ok: true, duplicate: true, round }) : fail('This browser has already voted on this question in this round.', 409);
  if (event.status === 'archived') return fail('Voting event not found.', 404);
  if (event.status !== 'open') return fail('Voting is closed.', 409);
  const eventLimited = await authAdmission(env, `ballot-event:${event.id}`, 2400, 60);
  if (eventLimited) return eventLimited;
  const limited = await authAdmission(env, `ballot:${event.id}:${round}:${body.participant_id}`, 10, 60);
  if (limited) return limited;
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO voting_votes(event_id,question_id,participant_id,option_id,created_at,round_number)
    SELECT e.id,q.id,?,?,?,? FROM voting_events e JOIN voting_questions q ON q.event_id=e.id
    JOIN voting_options o ON o.question_id=q.id WHERE e.id=? AND e.status='open' AND e.current_round=? AND q.id=? AND q.ballot_type='single' AND o.id=?
    RETURNING option_id`).bind(body.participant_id, body.optionId, Date.now(), round, event.id, round, body.questionId, body.optionId).first();
  if (inserted) return reply({ ok: true, duplicate: false, round });
  const replay = await previous();
  if (replay) return replay.option_id === body.optionId ? reply({ ok: true, duplicate: true, round }) : fail('This browser has already voted on this question in this round.', 409);
  return fail('Voting closed or the round changed before your answer was received.', 409);
}


async function bulkDelete(request, env, admin, body, verifyPassword) {
  if (admin?.user?.role !== 'admin') return fail('Administrator access is required.', 403);
  if (body.confirmed !== true || !Array.isArray(body.items) || !body.items.length || body.items.length > 50 || body.items.some(item => !object(item) || !isUuid(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 0) || new Set(body.items.map(item => item.id)).size !== body.items.length) return fail('Confirm between 1 and 50 distinct records with their selected revisions.');
  if (typeof verifyPassword !== 'function') return fail('Password verification is unavailable.', 503);
  const verified = await verifyPassword(request, env, admin, body.password);
  if (!verified?.ok) return verified?.response || fail('Password verification failed.', 403);
  const statements = [];
  const timestamp = new Date().toISOString();
  for (const item of body.items) {
    statements.push(env.DB.prepare(`DELETE FROM voting_events WHERE id=? AND revision=? AND status!='open' AND json_extract(presentation,'$.content')='hidden' AND NOT EXISTS(SELECT 1 FROM standalone_stages s,json_tree(CASE WHEN json_valid(s.stage_config) THEN s.stage_config ELSE '{}' END) j WHERE j.key='eventCode' AND j.value=voting_events.public_code) AND NOT EXISTS(SELECT 1 FROM platform_state s,json_tree(CASE WHEN json_valid(s.stage_config) THEN s.stage_config ELSE '{}' END) j WHERE j.key='eventCode' AND j.value=voting_events.public_code) RETURNING id`).bind(item.id, item.revision));
    statements.push(env.DB.prepare("INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) SELECT ?,?,?,'voting_delete',?,? WHERE changes()=1").bind(crypto.randomUUID(), item.id, admin.user.id, item.id, timestamp));
  }
  try {
    const result = await env.DB.batch(statements);
    const results = body.items.map((item, i) => ({ id: item.id, status: result[i * 2].results?.length ? 'deleted' : 'rejected', reason: result[i * 2].results?.length ? null : 'Changed, missing, open or projected. Close voting, hide its presentation and detach stage references before retrying.' }));
    return reply({ results, deletedIds: results.filter(item => item.status === 'deleted').map(item => item.id) });
  } catch { return fail('The transaction failed. Nothing was deleted. Refresh before retrying.', 503); }
}
