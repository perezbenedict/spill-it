import { validateStage } from './platform.js';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (error, status = 400) => reply({ error }, status);
const conflict = () => reply({ error: 'This stage changed. Refresh and try again.', code: 'concurrent_change' }, 409);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isCode = value => typeof value === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(value);
const emptyStage = () => ({ atmosphere: 'midnight', chapters: [], activeChapterId: null, prompts: [], announcements: [], overlay: null });
const titleInput = value => value === undefined || (typeof value === 'string' && value.trim().length <= 200);
const active = (overlay, now) => object(overlay) && (overlay.endsAt === null || (typeof overlay.endsAt === 'string' && Date.parse(overlay.endsAt) > now)) ? overlay : null;
const interrupts = overlay => overlay && ['reflection', 'announcement', 'voting'].includes(overlay.kind);

async function jsonBody(request) {
  if (Number(request.headers.get('content-length')) > 100000) return { response: fail('Request too large.', 413) };
  try {
    const reader = request.body?.getReader();
    if (!reader) return { response: fail('Invalid request.') };
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) { await reader.cancel(); return { response: fail('Request too large.', 413) }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return object(body) ? { body } : { response: fail('Invalid request.') };
  } catch { return { response: fail('Invalid request.') }; }
}

function publicCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let code = '';
  while (code.length < 8) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    if (byte < limit) code += alphabet[byte % alphabet.length];
  }
  return code;
}

async function eligibleOverlay(env, overlay, now) {
  const candidate = active(overlay, now);
  if (!candidate) return null;
  const validated = validateStage({ ...emptyStage(), overlay: candidate }, now)?.overlay;
  if (!validated) return null;
  if (validated.kind === 'voting') {
    const event = await env.DB.prepare("SELECT id FROM voting_events WHERE public_code=? AND status IN ('open','closed')").bind(validated.eventCode).first();
    if (!event) return null;
  }
  return validated;
}

async function readStage(env, row, now = Date.now()) {
  let stored;
  try { stored = JSON.parse(row.stage_config); } catch { stored = emptyStage(); }
  if (!object(stored)) stored = emptyStage();
  const overlay = await eligibleOverlay(env, stored.overlay, now);
  const resume = await eligibleOverlay(env, stored.returnOverlay, now);
  const stage = validateStage({ ...emptyStage(), ...stored, overlay: overlay || resume }, now) || emptyStage();
  return { ...stage, resumeOverlay: overlay && interrupts(overlay) ? resume : null };
}

async function stageItem(env, row, publicRead = false) {
  const stage = await readStage(env, row);
  if (publicRead) return { title: row.title, code: row.public_code, revision: row.revision, stage: { atmosphere: stage.atmosphere, overlay: stage.overlay } };
  return { id: row.id, code: row.public_code, title: row.title, revision: row.revision, stage, createdAt: row.created_at, updatedAt: row.updated_at };
}

// Voting settings, question/QR publication and results stay owned by /admin/voting.
// Configure that existing event there, then attach its open/closed public code as
// { kind: 'voting', eventCode, endsAt: null }. Attachment never changes the event.
export async function handleStandaloneStages(request, env, admin, identifier, publicRead = false) {
  if (publicRead) {
    if (request.method !== 'GET') return fail('Method not allowed.', 405);
    if (!isCode(identifier)) return fail('Invalid stage code.');
    const row = await env.DB.prepare('SELECT * FROM standalone_stages WHERE public_code=?').bind(identifier).first();
    return row ? reply({ item: await stageItem(env, row, true) }) : fail('Stage not found.', 404);
  }
  if (!admin?.user?.id || !['admin', 'moderator'].includes(admin.user.role)) return fail('Administrator access is required.', 403);
  if (!['GET', 'POST'].includes(request.method)) return fail('Method not allowed.', 405);
  if (identifier !== undefined && identifier !== null && !isUuid(identifier)) return fail('Invalid stage ID.');
  if (!identifier && request.method === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM standalone_stages ORDER BY updated_at DESC,id DESC LIMIT 50').all()).results || [];
    return reply({ items: await Promise.all(rows.map(row => stageItem(env, row))) });
  }
  if (identifier && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM standalone_stages WHERE id=?').bind(identifier).first();
    return row ? reply({ item: await stageItem(env, row) }) : fail('Stage not found.', 404);
  }
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  const { body } = parsed;
  if (!titleInput(body.title)) return fail('Use a title of up to 200 characters.');
  if (!identifier) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = crypto.randomUUID();
      const code = publicCode();
      const timestamp = new Date().toISOString();
      try {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO standalone_stages(id,public_code,title,stage_config,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(id, code, (body.title || '').trim(), JSON.stringify(emptyStage()), timestamp, timestamp),
          env.DB.prepare("INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) VALUES(?,?,?,'standalone_create',?,?)").bind(crypto.randomUUID(), id, admin.user.id, id, timestamp),
        ]);
        const row = await env.DB.prepare('SELECT * FROM standalone_stages WHERE id=?').bind(id).first();
        return reply({ item: await stageItem(env, row) }, 201);
      } catch (error) {
        if (!/unique constraint failed: standalone_stages\.(public_code|id)/i.test(String(error?.message || error))) return fail('Could not create this stage. Try again.', 500);
      }
    }
    return fail('Could not allocate a stage code. Try again.', 503);
  }
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) return reply({ error: 'Refresh before making this change.', code: 'revision_required' }, 400);
  if (!['configureStage', 'clearStage'].includes(body.action)) return fail('Unknown action.');
  const row = await env.DB.prepare('SELECT * FROM standalone_stages WHERE id=?').bind(identifier).first();
  if (!row) return fail('Stage not found.', 404);
  if (row.revision !== body.expectedRevision) return conflict();
  const now = Date.now();
  const previous = await readStage(env, row, now);
  let stage;
  let returnOverlay = null;
  if (body.action === 'clearStage') {
    stage = { ...previous, overlay: null };
    delete stage.resumeOverlay;
  } else {
    // Expired timers from a previously fetched complete config resolve before
    // validation; newly supplied expired timers still fail validation.
    let candidate = body.stage;
    let stored;
    try { stored = JSON.parse(row.stage_config); } catch { stored = {}; }
    if (object(candidate) && candidate.overlay && !active(candidate.overlay, now) && JSON.stringify(candidate.overlay) === JSON.stringify(stored.overlay)) candidate = { ...candidate, overlay: previous.overlay };
    stage = validateStage(candidate, now);
    if (!stage) return fail('Use a valid stage configuration. Timed messages must end within 24 hours.');
    if (stage.overlay?.kind === 'voting' && !await eligibleOverlay(env, stage.overlay, now)) return fail('Open a valid voting event before projecting it.');
    if (interrupts(stage.overlay)) returnOverlay = previous.overlay?.kind === stage.overlay.kind ? previous.resumeOverlay : previous.overlay;
    if (!stage.overlay && interrupts(previous.overlay)) stage.overlay = previous.resumeOverlay;
  }
  const timestamp = new Date(now).toISOString();
  const mutationId = crypto.randomUUID();
  try {
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE standalone_stages SET stage_config=?,title=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND revision=? RETURNING revision').bind(JSON.stringify({ ...stage, returnOverlay }), body.title === undefined ? row.title : body.title.trim(), mutationId, timestamp, identifier, body.expectedRevision),
      env.DB.prepare('INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM standalone_stages WHERE id=? AND mutation_id=?)').bind(crypto.randomUUID(), identifier, admin.user.id, body.action === 'clearStage' ? 'standalone_clear' : 'standalone_configure', identifier, timestamp, identifier, mutationId),
    ]);
    if (!results[0].results?.length) return conflict();
    const updated = await env.DB.prepare('SELECT * FROM standalone_stages WHERE id=?').bind(identifier).first();
    return reply({ item: await stageItem(env, updated) });
  } catch { return fail('Could not apply this change. Refresh and try again.', 409); }
}
