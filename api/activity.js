const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const ELIGIBLE = ['moderation', 'status_draft', 'status_live', 'status_paused', 'status_closed', 'enqueue', 'remove', 'reorder', 'clearQueue', 'advance', 'project', 'createPoll', 'openPoll', 'closePoll', 'projectPoll', 'clearProjection', 'clearPoll', 'setReactions', 'configureStage', 'voting_create', 'voting_edit', 'voting_open', 'voting_close', 'voting_settings', 'voting_present', 'voting_reopen', 'voting_newRound', 'voting_new_round', 'voting_startRound', 'voting_start_round'];
const ELIGIBLE_SQL = `a.action IN (${ELIGIBLE.map(action => `'${action}'`).join(',')})`;
const CATEGORY_SQL = `CASE WHEN a.action LIKE 'standalone_%' THEN 'stage' WHEN a.action NOT IN (${ELIGIBLE.map(action => `'${action}'`).join(',')}) THEN 'administrative' WHEN a.action='moderation' THEN 'moderation' WHEN a.action LIKE 'voting_%' THEN 'voting' WHEN a.action IN ('enqueue','remove','reorder','clearQueue','advance','project','projectPoll','clearProjection','clearPoll','configureStage') THEN 'stage' ELSE 'discussion' END`;
const categories = ['all', 'discussion', 'voting', 'moderation', 'stage', 'administrative'];
const joins = `LEFT JOIN discussion_sessions d ON d.id=a.session_id LEFT JOIN voting_events v ON v.id=a.session_id OR (a.action LIKE 'voting_%' AND v.id=a.target_id) LEFT JOIN standalone_stages s ON s.id=a.session_id AND a.action LIKE 'standalone_%' LEFT JOIN activity_archives ar ON ar.activity_id=a.id LEFT JOIN activity_history_batches b ON b.id=a.target_id AND a.action='clear_activity_history'`;
const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(value) {
  if (typeof value !== 'string' || value.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid activity cursor.');
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0)))); }
  catch { throw Error('Invalid activity cursor.'); }
}
async function signature(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`spill-activity-snapshot:v1:${value}`)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > 6000) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 6000) { await reader.cancel(); return null; }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}
async function signSnapshot(snapshot, secret) {
  const encoded = encode(snapshot);
  return `${encoded}.${await signature(encoded, secret)}`;
}
async function readSnapshot(token, secret) {
  if (typeof token !== 'string' || token.length > 4500) throw Error('Refresh activity before clearing history.');
  const [encoded, supplied, extra] = token.split('.');
  if (!encoded || !supplied || extra) throw Error('Invalid activity snapshot.');
  const expected = await signature(encoded, secret);
  let difference = expected.length ^ supplied.length;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ (supplied.charCodeAt(index) || 0);
  if (difference) throw Error('Invalid activity snapshot.');
  const result = decode(encoded);
  if (result.version !== 1 || !Number.isSafeInteger(result.cutoff) || result.cutoff < 0 || !Number.isFinite(result.expires) || result.expires < Date.now() || typeof result.id !== 'string') throw Error('Activity view expired. Refresh and try again.');
  return result;
}
function filters(params) {
  const category = params.get('category') || 'all';
  const view = params.get('view') || 'active';
  const q = (params.get('q') || '').trim();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  if (!categories.includes(category) || !['active', 'archived'].includes(view) || q.length > 120) throw Error('Use a valid activity filter.');
  for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw Error('Use valid calendar dates.');
  if (from && to && from > to) throw Error('The end date must follow the start date.');
  return { category, view, q, from, to };
}
function condition(scope, cutoff) {
  const clauses = ['a.rowid<=?', scope.view === 'archived' ? 'ar.activity_id IS NOT NULL' : 'ar.activity_id IS NULL'];
  const args = [cutoff];
  if (scope.category === 'voting') clauses.push("a.action LIKE 'voting_%'");
  else if (scope.category === 'discussion') clauses.push("a.action NOT LIKE 'voting_%' AND a.action NOT LIKE 'standalone_%' AND a.session_id<>'activity-history'");
  else if (scope.category !== 'all') { clauses.push(`(${CATEGORY_SQL})=?`); args.push(scope.category); }
  if (scope.q) { clauses.push("(instr(lower(COALESCE(d.title,v.title,s.title,'')),lower(?))>0 OR instr(lower(a.action),lower(?))>0 OR instr(lower(a.session_id),lower(?))>0 OR instr(lower(COALESCE(a.target_id,'')),lower(?))>0)"); args.push(scope.q, scope.q, scope.q, scope.q); }
  if (scope.from) { clauses.push('a.created_at>=?'); args.push(`${scope.from}T00:00:00.000Z`); }
  if (scope.to) { const next = new Date(`${scope.to}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); clauses.push('a.created_at<?'); args.push(next.toISOString()); }
  return { sql: clauses.join(' AND '), args };
}
const labels = {
  standalone_delete: 'Standalone stage permanently deleted', standalone_create: 'Standalone stage created', standalone_configure: 'Standalone presentation updated', standalone_clear: 'Standalone presentation cleared',
  moderation: 'Contribution moderation updated', status_draft: 'Discussion returned to draft', status_live: 'Discussion opened', status_paused: 'Discussion paused', status_closed: 'Discussion closed',
  enqueue: 'Contribution added to projection queue', remove: 'Contribution removed from projection queue', reorder: 'Projection queue reordered', clearQueue: 'Projection queue cleared', advance: 'Next contribution projected', project: 'Contribution projection changed', clearProjection: 'Discussion stage cleared',
  createPoll: 'Discussion poll created', openPoll: 'Discussion poll opened', closePoll: 'Discussion poll closed', projectPoll: 'Discussion poll results projected', clearPoll: 'Discussion poll results hidden', deletePoll: 'Discussion poll permanently deleted', setReactions: 'Audience reaction setting changed', configureStage: 'Stage presentation settings updated',
  delete_contribution: 'Contribution permanently deleted', delete_session: 'Discussion permanently deleted', voting_create: 'Voting event created', voting_edit: 'Voting draft updated', voting_open: 'Voting opened', voting_close: 'Voting closed', voting_reopen: 'Voting reopened', voting_newRound: 'New voting round started', voting_new_round: 'New voting round started', voting_startRound: 'New voting round started', voting_start_round: 'New voting round started', voting_settings: 'Voting presentation settings updated', voting_present: 'Voting presentation changed', voting_archive: 'Voting event archived', voting_delete: 'Voting event permanently deleted', clear_activity_history: 'Visible operational history archived',
};
function serialize(item) {
  return { id: item.id, action: item.action, description: labels[item.action] || item.action.replaceAll('_', ' '), category: item.category,
    eventId: item.action.startsWith('standalone_') ? item.stage_id : item.action.startsWith('voting_') ? item.voting_id : item.discussion_id,
    eventReference: item.session_id === 'activity-history' ? null : item.action.startsWith('voting_') ? item.target_id || item.session_id : item.session_id,
    eventType: item.action.startsWith('standalone_') ? 'stage' : item.action.startsWith('voting_') ? 'voting' : item.session_id === 'activity-history' ? 'administrative' : 'discussion',
    eventTitle: item.event_title || (item.action.startsWith('standalone_') ? 'Standalone stage' : item.session_id === 'activity-history' ? 'Activity administration' : item.action.startsWith('voting_') ? 'Deleted voting event' : 'Deleted discussion'),
    createdAt: item.created_at, created_at: item.created_at, session_id: item.session_id,
    archivedAt: item.archived_at, protected: !item.eligible, archivedCount: item.archived_count ?? null };
}

export async function handleActivity(request, env, admin) {
  if (!admin?.user?.id) return reply({ error: 'Not authorized.' }, 401);
  try {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const scope = filters(params);
      const limit = params.has('limit') ? Number(params.get('limit')) : 25;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return reply({ error: 'Choose a page size from 1 to 50.' }, 400);
      let snapshot;
      let token = params.get('snapshot');
      if (token) {
        snapshot = await readSnapshot(token, env.SPILL_API_SECRET);
        if (JSON.stringify(snapshot.filters) !== JSON.stringify(scope)) return reply({ error: 'Filters changed. Refresh this activity view.' }, 400);
      } else {
        const maximum = await env.DB.prepare('SELECT COALESCE(MAX(rowid),0) AS cutoff FROM admin_activity').first();
        snapshot = { version: 1, id: crypto.randomUUID(), cutoff: maximum.cutoff, filters: scope, expires: Date.now() + 900000 };
        token = await signSnapshot(snapshot, env.SPILL_API_SECRET);
      }
      const query = condition(scope, snapshot.cutoff);
      let cursorSql = '';
      const cursorArgs = [];
      if (params.get('cursor')) {
        const cursor = decode(params.get('cursor'));
        if (typeof cursor.id !== 'string' || cursor.id.length > 100 || typeof cursor.createdAt !== 'string' || cursor.createdAt.length > 40 || !Number.isFinite(Date.parse(cursor.createdAt))) throw Error('Invalid activity cursor.');
        cursorSql = ' AND (a.created_at<? OR (a.created_at=? AND a.id<?))'; cursorArgs.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      const result = await env.DB.batch([
        env.DB.prepare(`SELECT a.id,a.action,a.session_id,a.target_id,a.created_at,d.id AS discussion_id,v.id AS voting_id,s.id AS stage_id,CASE WHEN a.action LIKE 'standalone_%' THEN s.title WHEN a.action LIKE 'voting_%' THEN v.title ELSE d.title END AS event_title,ar.archived_at,b.archived_count,${CATEGORY_SQL} AS category,${ELIGIBLE_SQL} AS eligible FROM admin_activity a ${joins} WHERE ${query.sql}${cursorSql} ORDER BY a.created_at DESC,a.id DESC LIMIT ?`).bind(...query.args, ...cursorArgs, limit + 1),
        env.DB.prepare(`SELECT COALESCE(SUM(${ELIGIBLE_SQL}),0) AS eligible,COALESCE(SUM(NOT (${ELIGIBLE_SQL})),0) AS protected FROM admin_activity a ${joins} WHERE ${query.sql}`).bind(...query.args),
      ]);
      const found = result[0].results;
      const items = found.slice(0, limit);
      const last = items.at(-1);
      return reply({ items: items.map(serialize), nextCursor: found.length > limit && last ? encode({ createdAt: last.created_at, id: last.id }) : null, snapshot: token,
        eligibleCount: result[1].results[0].eligible, protectedCount: result[1].results[0].protected, filters: scope, snapshotExpiresAt: new Date(snapshot.expires).toISOString(), canArchive: admin.user.role === 'admin' });
    }
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    if (admin.user.role !== 'admin') return reply({ error: 'Administrator access is required to archive activity.' }, 403);
    const text = await boundedBody(request);
    if (text === null) return reply({ error: 'Request too large.' }, 413);
    const body = JSON.parse(text);
    if (!body || body.action !== 'clearVisible') return reply({ error: 'Unknown activity operation.' }, 400);
    const snapshot = await readSnapshot(body.snapshot, env.SPILL_API_SECRET);
    if (snapshot.filters.view !== 'active') return reply({ error: 'Archived history cannot be cleared.' }, 400);
    const query = condition(snapshot.filters, snapshot.cutoff);
    const timestamp = new Date().toISOString();
    const result = await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO activity_history_batches(id,actor_id,created_at,cutoff_rowid,archived_count) VALUES(?,?,?,?,0)').bind(snapshot.id, admin.user.id, timestamp, snapshot.cutoff),
      env.DB.prepare(`INSERT OR IGNORE INTO activity_archives(activity_id,archived_at,batch_id) SELECT a.id,?,? FROM admin_activity a ${joins} WHERE ${query.sql} AND ${ELIGIBLE_SQL}`).bind(timestamp, snapshot.id, ...query.args),
      env.DB.prepare('UPDATE activity_history_batches SET archived_count=(SELECT COUNT(*) FROM activity_archives WHERE batch_id=?) WHERE id=?').bind(snapshot.id, snapshot.id),
      env.DB.prepare("INSERT OR IGNORE INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) VALUES(?,'activity-history',?,'clear_activity_history',?,?)").bind(snapshot.id, admin.user.id, snapshot.id, timestamp),
      env.DB.prepare('SELECT archived_count FROM activity_history_batches WHERE id=?').bind(snapshot.id),
    ]);
    return reply({ ok: true, archivedCount: result[4].results[0].archived_count, duplicate: result[0].meta?.changes === 0 });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: 'Invalid activity request.' }, 400);
    if (/^(Invalid activity|Activity view expired|Refresh activity|Use a valid activity|Use valid calendar|The end date)/.test(error.message || '')) return reply({ error: error.message }, 400);
    throw error;
  }
}
