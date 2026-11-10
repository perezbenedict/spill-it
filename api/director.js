import { platformState, authAdmission } from './platform.js';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const conflict = () => reply({ error: 'The event changed. Review the refreshed Preview and Live before trying again.', code: 'concurrent_change' }, 409);
const list = async (env, sql, ...values) => (await env.DB.prepare(sql).bind(...values).all()).results;
const parse = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export function validateCue(input) {
  if (!input || typeof input !== 'object' || !text(input.id, 80) || !/^[\w-]+$/.test(input.id) || !text(input.label, 120)) return null;
  const cue = { id: input.id, label: input.label.trim(), kind: input.kind };
  if (['contribution','poll','voting'].includes(input.kind)) {
    if (!text(input.target, 80)) return null;
    return { ...cue, target: input.target };
  }
  if (input.kind === 'waiting') return cue;
  if (input.kind === 'activity') {
    if (!text(input.target, 80)) return null;
    return { ...cue, target: input.target };
  }
  if (!['announcement','prompt','reflection'].includes(input.kind) || !text(input.text, input.kind === 'announcement' ? 1500 : 500)) return null;
  if (input.heading !== undefined && (typeof input.heading !== 'string' || input.heading.length > 120)) return null;
  if (input.duration !== undefined && (!Number.isInteger(input.duration) || input.duration < 0 || input.duration > 3600)) return null;
  if (input.duration && input.kind === 'prompt') return null;
  return { ...cue, text: input.text.trim(), heading: (input.heading || '').trim(), duration: input.duration || 0 };
}

export function aggregateResults(kind, responses, revealed, minimum = 5, summary = null) {
  const total=summary?.total ?? responses.length;
  if (!revealed || total < minimum) return null;
  const counts = new Map();
  responses.forEach(row => counts.set(row.item, (counts.get(row.item) || 0) + (summary ? row.count : 1)));
  return { total, items: [...counts].map(([label, count]) => ({ label, count })).sort((a,b) => b.count-a.count || a.label.localeCompare(b.label)), ...(kind === 'scale' ? { average: Math.round((summary ? summary.average : responses.reduce((sum,row) => sum + Number(row.item), 0) / total) * 10) / 10 } : {}) };
}

async function ensure(env, id) {
  await env.DB.prepare('INSERT OR IGNORE INTO director_state(session_id) SELECT id FROM discussion_sessions WHERE id=?').bind(id).run();
  return env.DB.prepare('SELECT * FROM director_state WHERE session_id=?').bind(id).first();
}
async function activities(env, id, admin = false) {
  const all = await list(env, `SELECT id,kind,prompt,status,revealed,revision FROM audience_activities WHERE session_id=? ${admin ? '' : "AND status IN ('open','closed')"} ORDER BY created_at DESC,id DESC LIMIT 30`, id);
  for (const activity of all) {
    // Aggregate inside D1: never load an unbounded list of individual answers into Worker memory.
    const accepted="FROM audience_responses r WHERE r.activity_id=? AND r.moderation='approved' AND (?!='questions' OR EXISTS(SELECT 1 FROM submissions s WHERE s.id=r.item AND s.session_id=? AND s.moderation_status='approved' AND s.hidden_from_presentation=0))";
    const [totals,groups]=await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(*) AS total,AVG(CAST(r.item AS REAL)) AS average ${accepted}`).bind(activity.id,activity.kind,id),
      env.DB.prepare(`SELECT r.item,COUNT(*) AS count ${accepted} GROUP BY r.item ORDER BY count DESC,r.item LIMIT 50`).bind(activity.id,activity.kind,id),
    ]);
    const summary=totals.results[0];
    activity.results = aggregateResults(activity.kind, groups.results, admin || !!activity.revealed,5,summary);
    activity.revealed = !!activity.revealed;
    if (activity.kind === 'questions') activity.questions = await list(env, "SELECT id,content FROM submissions WHERE session_id=? AND category='question' AND moderation_status='approved' AND hidden_from_presentation=0 ORDER BY created_at,id LIMIT 50", id);
    if (admin) {
      activity.responseCount = summary.total;
      activity.pending = await list(env, "SELECT rowid AS id,item,revision,moderation FROM audience_responses WHERE activity_id=? AND moderation IN ('pending','approved','hidden') AND EXISTS(SELECT 1 FROM audience_activities a WHERE a.id=activity_id AND a.kind='wordcloud') ORDER BY (moderation='pending') DESC,rowid LIMIT 100", activity.id);
    }
  }
  return all;
}
async function snapshot(env, id) {
  const state = await ensure(env,id);
  if (!state) return null;
  const platform = await platformState(env,id);
  const projected = await env.DB.prepare('SELECT current_submission_id FROM presentation_state WHERE session_id=?').bind(id).first();
  const receiver = await env.DB.prepare('SELECT seen_at AS seenAt,revision,visible FROM projector_health WHERE session_id=?').bind(id).first();
  const wordPending = await env.DB.prepare("SELECT COUNT(*) AS count FROM audience_responses r JOIN audience_activities a ON a.id=r.activity_id WHERE a.session_id=? AND r.moderation='pending'").bind(id).first();
  const current = projected?.current_submission_id ? await env.DB.prepare("SELECT id,content FROM submissions WHERE id=? AND session_id=? AND moderation_status='approved' AND hidden_from_presentation=0").bind(projected.current_submission_id,id).first() : null;
  return { revision: state.revision, rundown: parse(state.rundown,[]), preview: parse(state.preview,null), canRestore: !!state.recovery, live: { stage: platform.stage, contribution: current, poll: platform.polls.find(p=>p.id===platform.projectedPollId) || null }, platformRevision: platform.revision, polls: platform.polls, health: { serverTime: Date.now(), sessionStatus: platform.sessionStatus, pending: platform.insights.pending || 0, wordPending: wordPending.count, queued: platform.queue.length, receiver, projectorFresh: !!receiver && Date.now()-receiver.seenAt < 30000, synchronized: !!receiver && receiver.revision === platform.revision }, activities: await activities(env,id,true) };
}

async function eligible(env,id,cue) {
  if (cue.kind === 'contribution') return !!await env.DB.prepare("SELECT id FROM submissions WHERE id=? AND session_id=? AND moderation_status='approved' AND hidden_from_presentation=0").bind(cue.target,id).first();
  if (cue.kind === 'poll') return !!await env.DB.prepare("SELECT id FROM polls WHERE id=? AND session_id=? AND status IN ('open','closed')").bind(cue.target,id).first();
  if (cue.kind === 'voting') return !!await env.DB.prepare("SELECT id FROM voting_events WHERE public_code=? AND status IN ('open','closed')").bind(cue.target).first();
  if (cue.kind === 'activity') return !!await env.DB.prepare("SELECT id FROM audience_activities WHERE id=? AND session_id=? AND status IN ('open','closed')").bind(cue.target,id).first();
  return true;
}

export async function handleDirector(request,env,admin,id) {
  const state = await ensure(env,id);
  if (!state) return reply({ error:'Discussion not found.' },404);
  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('export') === 'aggregate') {
      const counts = await env.DB.prepare("SELECT COUNT(*) AS contributions, SUM(moderation_status='approved') AS approved FROM submissions WHERE session_id=?").bind(id).first();
      const groups = await list(env,'SELECT category,COUNT(*) AS count FROM submissions WHERE session_id=? GROUP BY category',id);
      // Suppress small groups and avoid participant identifiers, bodies, exact times and nicknames.
      return reply({ format:'spill-aggregate-v1', minimumGroup:5, contributions: counts.contributions >=5 ? counts.contributions : null, categories: groups.filter(g=>g.count>=5), activities: (await activities(env,id)).map(({kind,status,results})=>({kind,status,results: results ? {total:results.total,...(['debate','scale'].includes(kind)?{items:results.items,...(kind==='scale'?{average:results.average}:{})}:{})}:null})) });
    }
    return reply(await snapshot(env,id));
  }
  if (request.method !== 'POST') return reply({error:'Method not allowed.'},405);
  const body = await request.json().catch(()=>null);
  if (!body || !/^[a-f0-9-]{36}$/i.test(body.requestId || '') || !Number.isInteger(body.expectedRevision) || !Number.isInteger(body.expectedPlatformRevision)) return reply({error:'Synchronize before changing this event.'},400);
  const payload = JSON.stringify(body);
  const receipt = await env.DB.prepare('SELECT payload FROM director_receipts WHERE session_id=? AND request_id=?').bind(id,body.requestId).first();
  if (receipt) return receipt.payload === payload ? reply({ ...(await snapshot(env,id)), duplicate:true }) : reply({error:'This retry key belongs to a different action.'},409);
  if (body.expectedRevision !== state.revision) return conflict();
  const platform = await platformState(env,id);
  if (platform.revision !== body.expectedPlatformRevision) return conflict();
  const mutation = uid();
  const guard = 'EXISTS(SELECT 1 FROM director_state WHERE session_id=? AND mutation_id=?)';
  const guarded = (sql,...values) => env.DB.prepare(sql).bind(...values,id,mutation);
  const statements = [env.DB.prepare('UPDATE director_state SET revision=revision+1,mutation_id=? WHERE session_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_state WHERE session_id=? AND revision=?) RETURNING revision').bind(mutation,id,body.expectedRevision,id,body.expectedPlatformRevision)];
  let liveChange = false;
  let stage, submission = null, poll = null;
  const storedPlatform = await env.DB.prepare('SELECT stage_config FROM platform_state WHERE session_id=?').bind(id).first();
  if (body.action === 'saveRundown') {
    if (!Array.isArray(body.cues) || body.cues.length > 50) return reply({error:'Use up to 50 cues.'},400);
    const cues = body.cues.map(validateCue);
    if (cues.some(c=>!c) || new Set(cues.map(c=>c.id)).size!==cues.length) return reply({error:'Check cue labels, content and duration.'},400);
    statements.push(guarded(`UPDATE director_state SET rundown=? WHERE session_id=? AND ${guard}`,JSON.stringify(cues),id));
  } else if (body.action === 'preview') {
    const cue = validateCue(body.cue);
    if (!cue || !await eligible(env,id,cue)) return reply({error:'Choose approved, visible and available content.'},400);
    statements.push(guarded(`UPDATE director_state SET preview=? WHERE session_id=? AND ${guard}`,JSON.stringify(cue),id));
  } else if (['take','hide','restore'].includes(body.action)) {
    liveChange = true;
    const actualStage={...platform.stage,...parse(storedPlatform.stage_config,{})};
    delete actualStage.resumeOverlay;
    stage = {...actualStage, overlay:null,returnOverlay:null};
    if (body.action === 'hide') {
      if (platform.stage.overlay?.kind !== 'blackout') {
        const recovery = {stage:actualStage,submission:platform.currentSubmissionId,poll:platform.projectedPollId};
        statements.push(guarded(`UPDATE director_state SET recovery=? WHERE session_id=? AND ${guard}`,JSON.stringify(recovery),id));
      }
      stage.overlay = {kind:'blackout',text:'',endsAt:null};
    } else if (body.action === 'restore') {
      const recovery = parse(state.recovery,null);
      if (!recovery) return reply({error:'No previous live screen to restore.'},400);
      if (recovery.submission && !await eligible(env,id,{kind:'contribution',target:recovery.submission})) return reply({error:'The previous contribution is no longer approved. Preview a safe cue instead.'},409);
      if (recovery.poll && !await eligible(env,id,{kind:'poll',target:recovery.poll})) return reply({error:'The previous poll is no longer available.'},409);
      for (const overlay of [recovery.stage?.overlay,recovery.stage?.returnOverlay]) {
        if (overlay?.kind==='voting' && !await eligible(env,id,{kind:'voting',target:overlay.eventCode})) return reply({error:'The previous voting event is no longer available.'},409);
        if (overlay?.kind==='activity' && !await eligible(env,id,{kind:'activity',target:overlay.activityId})) return reply({error:'The previous activity is no longer available.'},409);
      }
      stage = recovery.stage; submission = recovery.submission; poll = recovery.poll;
      statements.push(guarded(`UPDATE director_state SET recovery=NULL WHERE session_id=? AND ${guard}`,id));
    } else {
      const cue = parse(state.preview,null);
      if (!cue || !await eligible(env,id,cue)) return reply({error:'Preview content is no longer eligible. Select a safe cue.'},409);
      if (cue.kind === 'contribution') submission = cue.target;
      else if (cue.kind === 'poll') poll = cue.target;
      else if (cue.kind === 'voting') stage.overlay = {kind:'voting',eventCode:cue.target,text:'Voting',endsAt:null};
      else if (cue.kind === 'activity') stage.overlay = {kind:'activity',activityId:cue.target,text:'Audience activity',endsAt:null};
      else if (cue.kind !== 'waiting') stage.overlay = {kind:cue.kind,text:cue.text,heading:cue.heading || '',subtitle:'',style:'statement',showBrand:false,endsAt:cue.duration ? new Date(Date.now()+cue.duration*1000).toISOString() : null};
      statements.push(guarded(`UPDATE director_state SET recovery=NULL WHERE session_id=? AND ${guard}`,id));
    }
  } else if (body.action === 'createActivity') {
    if (!['wordcloud','debate','questions','scale'].includes(body.kind) || !text(body.prompt,300)) return reply({error:'Choose a supported activity and a prompt of up to 300 characters.'},400);
    statements.push(guarded(`INSERT INTO audience_activities(id,session_id,kind,prompt,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,uid(),id,body.kind,body.prompt.trim(),now()));
  } else if (['openActivity','closeActivity','revealActivity'].includes(body.action)) {
    const activity = await env.DB.prepare('SELECT id,status FROM audience_activities WHERE id=? AND session_id=?').bind(body.activityId || '',id).first();
    if (!activity) return reply({error:'Activity not found.'},404);
    if (body.action==='openActivity') {
      if (activity.status==='closed') return reply({error:'Create a new activity to collect another round.'},409);
      statements.push(guarded(`UPDATE audience_activities SET status='closed',revision=revision+1 WHERE session_id=? AND status='open' AND ${guard}`,id));
    }
    const changes = body.action==='revealActivity' ? 'revealed=1' : `status='${body.action==='openActivity'?'open':'closed'}'`;
    statements.push(guarded(`UPDATE audience_activities SET ${changes},revision=revision+1 WHERE id=? AND session_id=? AND ${guard}`,activity.id,id));
  } else if (body.action === 'moderateWord') {
    if (!['approved','hidden'].includes(body.status) || !Number.isInteger(body.responseId) || !Number.isInteger(body.responseRevision)) return reply({error:'Choose a moderation decision.'},400);
    const row = await env.DB.prepare('SELECT r.revision FROM audience_responses r JOIN audience_activities a ON a.id=r.activity_id WHERE r.rowid=? AND a.session_id=?').bind(body.responseId,id).first();
    if (!row || row.revision!==body.responseRevision) return conflict();
    statements.push(guarded(`UPDATE audience_responses SET moderation=?,revision=revision+1 WHERE rowid=? AND revision=? AND ${guard}`,body.status,body.responseId,body.responseRevision));
  } else return reply({error:'Unknown action.'},400);
  if (liveChange) {
    const conditions=[],values=[];
    if (poll) {conditions.push("EXISTS(SELECT 1 FROM polls WHERE id=? AND session_id=? AND status IN ('open','closed'))");values.push(poll,id);}
    for(const overlay of [stage.overlay,stage.returnOverlay]) {
      if(overlay?.kind==='voting'){conditions.push("EXISTS(SELECT 1 FROM voting_events WHERE public_code=? AND status IN ('open','closed'))");values.push(overlay.eventCode);}
      if(overlay?.kind==='activity'){conditions.push("EXISTS(SELECT 1 FROM audience_activities WHERE id=? AND session_id=? AND status IN ('open','closed'))");values.push(overlay.activityId,id);}
    }
    if(conditions.length) statements[0]=env.DB.prepare(`UPDATE director_state SET revision=revision+1,mutation_id=? WHERE session_id=? AND revision=? AND EXISTS(SELECT 1 FROM platform_state WHERE session_id=? AND revision=?) AND ${conditions.join(' AND ')} RETURNING revision`).bind(mutation,id,body.expectedRevision,id,body.expectedPlatformRevision,...values);

    // Platform revision is locked in the same transaction as the private director revision.
    statements.push(guarded(`UPDATE platform_state SET revision=revision+1,mutation_id=?,stage_config=?,projected_poll_id=? WHERE session_id=? AND ${guard}`,mutation,JSON.stringify(stage),poll,id));
    statements.push(guarded(`UPDATE presentation_state SET current_submission_id=?,revision=revision+1,updated_at=?,updated_by=? WHERE session_id=? AND ${guard}`,submission,now(),admin.user.id,id));
  }
  statements.push(guarded(`INSERT INTO director_receipts(session_id,request_id,payload,created_at) SELECT ?,?,?,? WHERE ${guard}`,id,body.requestId,payload,now()));
  statements.push(guarded(`INSERT INTO admin_activity(id,session_id,actor_id,action,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,uid(),id,admin.user.id,`director_${body.action}`,now()));
  try {
    const results = await env.DB.batch(statements);
    if (!results[0].results?.length) {
      const previous = await env.DB.prepare('SELECT payload FROM director_receipts WHERE session_id=? AND request_id=?').bind(id,body.requestId).first();
      return previous?.payload === payload ? reply({...(await snapshot(env,id)),duplicate:true}) : conflict();
    }
    return reply(await snapshot(env,id));
  } catch { return conflict(); }
}

export async function handleDirectorPublic(request,env,code,operation) {
  const session = await env.DB.prepare("SELECT id,status,closes_at FROM discussion_sessions WHERE public_code=? AND status!='draft'").bind(code).first();
  if (!session) return reply({error:'Discussion not found.'},404);
  if (request.method === 'GET' && !operation) return reply({ activities:await activities(env,session.id), sessionStatus:session.status });
  if (request.method !== 'POST') return reply({error:'Method not allowed.'},405);
  const body = await request.json().catch(()=>null);
  if (!body) return reply({error:'Invalid request.'},400);
  if (operation === 'heartbeat') {
    if (!Number.isInteger(body.revision) || body.revision<0 || typeof body.visible!=='boolean') return reply({error:'Invalid receiver status.'},400);
    const denied = await authAdmission(env,`projector:${session.id}`,60,60);
    if (denied) return denied;
    await env.DB.prepare('INSERT INTO projector_health(session_id,seen_at,revision,visible) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET seen_at=excluded.seen_at,revision=excluded.revision,visible=excluded.visible').bind(session.id,Date.now(),body.revision,body.visible?1:0).run();
    return reply({ok:true});
  }
  if (operation !== 'respond' || typeof body.participant_id !== 'string' || !/^[\w-]{16,100}$/.test(body.participant_id)) return reply({error:'Rejoin to participate.'},400);
  const activity = await env.DB.prepare('SELECT * FROM audience_activities WHERE id=? AND session_id=?').bind(body.activityId || '',session.id).first();
  if (!activity) return reply({error:'Activity not found.'},404);
  const item = typeof body.item==='string' ? body.item.normalize('NFKC').trim().replace(/\s+/gu,' ') : '';
  const existing = await env.DB.prepare('SELECT item FROM audience_responses WHERE activity_id=? AND participant_id=?').bind(activity.id,body.participant_id).first();
  if (existing) return existing.item===item ? reply({ok:true,duplicate:true}) : reply({error:'This browser already responded to this activity.'},409);
  if (session.status!=='live' || (session.closes_at && Date.parse(session.closes_at)<=Date.now()) || activity.status!=='open') return reply({error:'This activity is no longer open.'},409);
  const valid = activity.kind==='wordcloud' ? text(item,30) && !/[\p{Cc}\p{Cf}]/u.test(item) : activity.kind==='debate' ? ['agree','disagree'].includes(item) : activity.kind==='scale' ? ['1','2','3','4','5'].includes(item) : await eligible(env,session.id,{kind:'contribution',target:item}) && !!await env.DB.prepare("SELECT id FROM submissions WHERE id=? AND category='question'").bind(item).first();
  if (!valid) return reply({error:'Choose a valid answer. Words may contain up to 30 characters.'},400);
  const denied = await authAdmission(env,`audience:${session.id}:${body.participant_id}`,10,60) || await authAdmission(env,`audience:${session.id}`,2400,60);
  if (denied) return denied;
  try {
    await env.DB.prepare('INSERT INTO audience_responses(activity_id,participant_id,item,moderation) VALUES(?,?,?,?)').bind(activity.id,body.participant_id,item,activity.kind==='wordcloud'?'pending':'approved').run();
    return reply({ok:true});
  } catch {
    const retry = await env.DB.prepare('SELECT item FROM audience_responses WHERE activity_id=? AND participant_id=?').bind(activity.id,body.participant_id).first();
    return retry?.item===item ? reply({ok:true,duplicate:true}) : reply({error:'The activity changed. Refresh before trying again.'},409);
  }
}
