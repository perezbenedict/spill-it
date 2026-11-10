import { validateCue, aggregateResults } from './director.js';
import { authAdmission } from './platform.js';
import { readStandaloneStage } from './stages.js';

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const conflict=()=>reply({error:'This stage changed. Review the refreshed Preview and Live before trying again.',code:'concurrent_change'},409);
const parse=(raw,fallback)=>{try{return JSON.parse(raw);}catch{return fallback;}};
const text=(value,max)=>typeof value==='string' && value.trim().length>0 && value.trim().length<=max;
const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const list=async(env,sql,...values)=>(await env.DB.prepare(sql).bind(...values).all()).results;

export function validateStandaloneCue(input){
  const cue=validateCue(input);
  return cue && ['announcement','prompt','reflection','waiting','voting','activity'].includes(cue.kind) ? cue : null;
}
export function standaloneQuestions(kind,input){
  if(kind!=='questions')return [];
  if(!Array.isArray(input) || input.length<2 || input.length>50 || input.some(q=>!text(q,300)))return null;
  const questions=input.map(q=>q.trim());
  return new Set(questions).size===questions.length ? questions : null;
}
async function activityList(env,id,admin=false){
  const all=await list(env,`SELECT id,kind,prompt,questions,status,revealed,revision FROM stage_audience_activities WHERE stage_id=? ${admin?'':"AND status IN ('open','closed')"} ORDER BY created_at DESC,id DESC LIMIT 30`,id);
  for(const a of all){
    a.questions=parse(a.questions,[]);
    const accepted="FROM stage_audience_responses WHERE activity_id=? AND moderation='approved'";
    const [totals,groups]=await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(*) AS total,AVG(CAST(item AS REAL)) AS average ${accepted}`).bind(a.id),
      env.DB.prepare(`SELECT item,COUNT(*) AS count ${accepted} GROUP BY item ORDER BY count DESC,item LIMIT 50`).bind(a.id),
    ]);
    const summary=totals.results[0];
    a.results=aggregateResults(a.kind,groups.results,admin || !!a.revealed,5,summary);
    a.revealed=!!a.revealed;
    if(admin){
      a.responseCount=summary.total;
      a.pending=a.kind==='wordcloud' ? await list(env,"SELECT rowid AS id,item,revision,moderation FROM stage_audience_responses WHERE activity_id=? ORDER BY (moderation='pending') DESC,rowid LIMIT 100",a.id) : [];
    }
  }
  return all;
}
async function ensure(env,id){
  await env.DB.prepare('INSERT OR IGNORE INTO stage_director_state(stage_id) SELECT id FROM standalone_stages WHERE id=?').bind(id).run();
  return env.DB.prepare('SELECT * FROM stage_director_state WHERE stage_id=?').bind(id).first();
}
async function snapshot(env,id){
  const state=await ensure(env,id);
  const row=await env.DB.prepare('SELECT * FROM standalone_stages WHERE id=?').bind(id).first();
  if(!state || !row)return null;
  const [receiver,pending]=await Promise.all([
    env.DB.prepare('SELECT seen_at AS seenAt,revision,visible FROM stage_projector_health WHERE stage_id=?').bind(id).first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM stage_audience_responses r JOIN stage_audience_activities a ON a.id=r.activity_id WHERE a.stage_id=? AND r.moderation='pending'").bind(id).first(),
  ]);
  const liveStage=await readStandaloneStage(env,row);
  return {revision:state.revision,platformRevision:row.revision,rundown:parse(state.rundown,[]),preview:parse(state.preview,null),canRestore:!!state.recovery && liveStage.overlay?.kind==='blackout',live:{stage:liveStage},polls:[],votingEvents:await list(env,"SELECT public_code AS code,title,status FROM voting_events WHERE status IN ('open','closed') ORDER BY (status='open') DESC,updated_at DESC,id DESC LIMIT 50"),health:{serverTime:Date.now(),sessionStatus:'standalone',pending:0,wordPending:pending.count,queued:parse(state.rundown,[]).length,receiver},activities:await activityList(env,id,true)};
}
async function eligible(env,id,cue){
  if(cue.kind==='voting')return !!await env.DB.prepare("SELECT id FROM voting_events WHERE public_code=? AND status IN ('open','closed')").bind(cue.target).first();
  if(cue.kind==='activity')return !!await env.DB.prepare("SELECT id FROM stage_audience_activities WHERE id=? AND stage_id=? AND status IN ('open','closed')").bind(cue.target,id).first();
  return true;
}
function overlayGuard(overlays,id){
  const conditions=[],values=[];
  for(const overlay of overlays){
    if(overlay?.endsAt && Date.parse(overlay.endsAt)<=Date.now())continue;
    if(overlay?.kind==='voting'){conditions.push("EXISTS(SELECT 1 FROM voting_events WHERE public_code=? AND status IN ('open','closed'))");values.push(overlay.eventCode);}
    if(overlay?.kind==='activity'){conditions.push("EXISTS(SELECT 1 FROM stage_audience_activities WHERE id=? AND stage_id=? AND status IN ('open','closed'))");values.push(overlay.activityId,id);}
  }
  return {conditions,values};
}
export async function handleStageDirector(request,env,admin,id){
  const state=await ensure(env,id);
  if(!state)return reply({error:'Stage not found.'},404);
  if(request.method==='GET'){
    if(new URL(request.url).searchParams.get('export')==='aggregate'){
      const activities=(await activityList(env,id)).map(({kind,status,results})=>({kind,status,results:results?{total:results.total,...(['debate','scale'].includes(kind)?{items:results.items,...(kind==='scale'?{average:results.average}:{})}:{})}:null}));
      return reply({format:'spill-standalone-aggregate-v1',minimumGroup:5,activities});
    }
    return reply(await snapshot(env,id));
  }
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  const body=await request.json().catch(()=>null);
  if(!body || !/^[a-f0-9-]{36}$/i.test(body.requestId||'') || !Number.isSafeInteger(body.expectedRevision) || !Number.isSafeInteger(body.expectedPlatformRevision))return reply({error:'Synchronize before changing this stage.'},400);
  const payload=JSON.stringify(body);
  const previous=await env.DB.prepare('SELECT payload FROM stage_director_receipts WHERE stage_id=? AND request_id=?').bind(id,body.requestId).first();
  if(previous)return previous.payload===payload ? reply({...await snapshot(env,id),duplicate:true}) : conflict();
  const row=await env.DB.prepare('SELECT * FROM standalone_stages WHERE id=?').bind(id).first();
  if(!row || state.revision!==body.expectedRevision || row.revision!==body.expectedPlatformRevision)return conflict();
  const mutation=uid();
  const guard='EXISTS(SELECT 1 FROM stage_director_state WHERE stage_id=? AND mutation_id=?)';
  const guarded=(sql,...values)=>env.DB.prepare(sql).bind(...values,id,mutation);
  const lockSql='UPDATE stage_director_state SET revision=revision+1,mutation_id=? WHERE stage_id=? AND revision=? AND EXISTS(SELECT 1 FROM standalone_stages WHERE id=? AND revision=?)';
  const lockValues=[mutation,id,body.expectedRevision,id,body.expectedPlatformRevision];
  const statements=[env.DB.prepare(lockSql+' RETURNING revision').bind(...lockValues)];
  let stage=null;
  if(body.action==='saveRundown'){
    if(!Array.isArray(body.cues) || body.cues.length>50)return reply({error:'Use up to 50 standalone cues.'},400);
    const cues=body.cues.map(validateStandaloneCue);
    if(cues.some(c=>!c) || new Set(cues.map(c=>c.id)).size!==cues.length)return reply({error:'Choose standalone cue types and check their content.'},400);
    statements.push(guarded(`UPDATE stage_director_state SET rundown=? WHERE stage_id=? AND ${guard}`,JSON.stringify(cues),id));
  }else if(body.action==='preview'){
    const cue=validateStandaloneCue(body.cue);
    if(!cue || !await eligible(env,id,cue))return reply({error:'Choose available standalone stage content.'},400);
    statements.push(guarded(`UPDATE stage_director_state SET preview=? WHERE stage_id=? AND ${guard}`,JSON.stringify(cue),id));
  }else if(['take','sendLive','hide','restore','clearLive'].includes(body.action)){
    const stored=parse(row.stage_config,{});
    stage={...stored,overlay:null,returnOverlay:null,presentationCleared:false};
    if(body.action==='clearLive'){
      stage.presentationCleared=true;
      statements.push(guarded(`UPDATE stage_director_state SET recovery=NULL WHERE stage_id=? AND ${guard}`,id));
    }else if(body.action==='hide'){
      if(stored.overlay?.kind!=='blackout')statements.push(guarded(`UPDATE stage_director_state SET recovery=? WHERE stage_id=? AND ${guard}`,row.stage_config,id));
      stage.overlay={kind:'blackout',text:'',endsAt:null};
    }else if(body.action==='restore'){
      if(stored.overlay?.kind!=='blackout')return reply({error:'Emergency hide is no longer active. Review Live before restoring.'},409);
      stage=parse(state.recovery,null);
      if(!stage)return reply({error:'No previous live screen to restore.'},409);
      for(const overlay of [stage.overlay,stage.returnOverlay]){
        if(overlay?.endsAt && Date.parse(overlay.endsAt)<=Date.now())continue;
        if(overlay?.kind==='voting' && !await eligible(env,id,{kind:'voting',target:overlay.eventCode}))return reply({error:'The previous voting event is no longer available.'},409);
        if(overlay?.kind==='activity' && !await eligible(env,id,{kind:'activity',target:overlay.activityId}))return reply({error:'The previous activity is no longer available.'},409);
      }
      statements.push(guarded(`UPDATE stage_director_state SET recovery=NULL WHERE stage_id=? AND ${guard}`,id));
    }else{
      const cue=validateStandaloneCue(body.action==='sendLive'?body.cue:parse(state.preview,null));
      if(!cue || !await eligible(env,id,cue))return reply({error:'This cue is no longer eligible. Choose available stage content.'},409);
      if(cue.kind==='voting')stage.overlay={kind:'voting',eventCode:cue.target,text:'Voting',endsAt:null};
      else if(cue.kind==='activity')stage.overlay={kind:'activity',activityId:cue.target,text:'Audience activity',endsAt:null};
      else if(cue.kind!=='waiting')stage.overlay={kind:cue.kind,text:cue.text,heading:cue.heading||'',subtitle:'',style:'statement',showBrand:false,endsAt:cue.duration?new Date(Date.now()+cue.duration*1000).toISOString():null};
      statements.push(guarded(`UPDATE stage_director_state SET recovery=NULL WHERE stage_id=? AND ${guard}`,id));
    }
    const eligibility=overlayGuard([stage.overlay,stage.returnOverlay],id);
    if(eligibility.conditions.length)statements[0]=env.DB.prepare(lockSql+' AND '+eligibility.conditions.join(' AND ')+' RETURNING revision').bind(...lockValues,...eligibility.values);
    statements.push(guarded(`UPDATE standalone_stages SET stage_config=?,revision=revision+1,mutation_id=?,updated_at=? WHERE id=? AND ${guard}`,JSON.stringify(stage),mutation,now(),id));
  }else if(body.action==='createActivity'){
    const questions=standaloneQuestions(body.kind,body.questions);
    if(!['wordcloud','debate','questions','scale'].includes(body.kind) || !text(body.prompt,300) || !questions)return reply({error:'Choose an activity and prompt. Question priorities need 2–50 distinct questions of up to 300 characters.'},400);
    statements.push(guarded(`INSERT INTO stage_audience_activities(id,stage_id,kind,prompt,questions,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,uid(),id,body.kind,body.prompt.trim(),JSON.stringify(questions.map(content=>({id:uid(),content}))),now()));
  }else if(['openActivity','closeActivity','revealActivity'].includes(body.action)){
    const a=await env.DB.prepare('SELECT id,status FROM stage_audience_activities WHERE id=? AND stage_id=?').bind(body.activityId||'',id).first();
    if(!a)return reply({error:'Activity not found.'},404);
    if(body.action==='openActivity'){
      if(a.status==='closed')return reply({error:'Create another activity for a fresh round.'},409);
      statements.push(guarded(`UPDATE stage_audience_activities SET status='closed',revision=revision+1 WHERE stage_id=? AND status='open' AND ${guard}`,id));
    }
    const change=body.action==='revealActivity'?'revealed=1':`status='${body.action==='openActivity'?'open':'closed'}'`;
    statements.push(guarded(`UPDATE stage_audience_activities SET ${change},revision=revision+1 WHERE id=? AND stage_id=? AND ${guard}`,a.id,id));
  }else if(body.action==='moderateWord'){
    if(!['approved','hidden'].includes(body.status) || !Number.isSafeInteger(body.responseId) || !Number.isSafeInteger(body.responseRevision))return reply({error:'Choose a moderation decision.'},400);
    const word=await env.DB.prepare("SELECT r.revision FROM stage_audience_responses r JOIN stage_audience_activities a ON a.id=r.activity_id WHERE r.rowid=? AND a.stage_id=? AND a.kind='wordcloud'").bind(body.responseId,id).first();
    if(!word || word.revision!==body.responseRevision)return conflict();
    statements.push(guarded(`UPDATE stage_audience_responses SET moderation=?,revision=revision+1 WHERE rowid=? AND revision=? AND ${guard}`,body.status,body.responseId,body.responseRevision));
  }else return reply({error:'Unknown action.'},400);
  statements.push(guarded(`INSERT INTO stage_director_receipts(stage_id,request_id,payload,created_at) SELECT ?,?,?,? WHERE ${guard}`,id,body.requestId,payload,now()));
  statements.push(guarded(`INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,uid(),id,admin.user.id,`standalone_director_${body.action}`,id,now()));
  try{
    const result=await env.DB.batch(statements);
    if(!result[0].results?.length){
      const receipt=await env.DB.prepare('SELECT payload FROM stage_director_receipts WHERE stage_id=? AND request_id=?').bind(id,body.requestId).first();
      return receipt?.payload===payload ? reply({...await snapshot(env,id),duplicate:true}) : conflict();
    }
    return reply(await snapshot(env,id));
  }catch{return conflict();}
}

export async function handleStageDirectorPublic(request,env,code,operation){
  const row=await env.DB.prepare('SELECT id FROM standalone_stages WHERE public_code=?').bind(code).first();
  if(!row)return reply({error:'Stage not found.'},404);
  if(request.method==='GET' && !operation)return reply({activities:await activityList(env,row.id),sessionStatus:'standalone'});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  const body=await request.json().catch(()=>null);
  if(!body)return reply({error:'Invalid request.'},400);
  if(operation==='heartbeat'){
    if(!Number.isSafeInteger(body.revision) || body.revision<0 || typeof body.visible!=='boolean')return reply({error:'Invalid receiver status.'},400);
    const denied=await authAdmission(env,`stage-projector:${row.id}`,60,60);if(denied)return denied;
    await env.DB.prepare('INSERT INTO stage_projector_health(stage_id,seen_at,revision,visible) VALUES(?,?,?,?) ON CONFLICT(stage_id) DO UPDATE SET seen_at=excluded.seen_at,revision=excluded.revision,visible=excluded.visible').bind(row.id,Date.now(),body.revision,body.visible?1:0).run();
    return reply({ok:true});
  }
  if(operation!=='respond' || typeof body.participant_id!=='string' || !/^[\w-]{16,100}$/.test(body.participant_id))return reply({error:'Rejoin to participate.'},400);
  const a=await env.DB.prepare('SELECT * FROM stage_audience_activities WHERE id=? AND stage_id=?').bind(body.activityId||'',row.id).first();
  if(!a)return reply({error:'Activity not found.'},404);
  const item=typeof body.item==='string'?body.item.normalize('NFKC').trim().replace(/\s+/gu,' '):'';
  const accepted=await env.DB.prepare('SELECT item FROM stage_audience_responses WHERE activity_id=? AND participant_id=?').bind(a.id,body.participant_id).first();
  if(accepted)return accepted.item===item?reply({ok:true,duplicate:true}):reply({error:'This browser already responded to this activity.'},409);
  if(a.status!=='open')return reply({error:'This activity is no longer open.'},409);
  const valid=a.kind==='wordcloud'?text(item,30) && !/[\p{Cc}\p{Cf}]/u.test(item):a.kind==='debate'?['agree','disagree'].includes(item):a.kind==='scale'?['1','2','3','4','5'].includes(item):parse(a.questions,[]).some(q=>q.id===item);
  if(!valid)return reply({error:'Choose a valid answer. Words may contain up to 30 characters.'},400);
  const denied=await authAdmission(env,`stage-audience:${row.id}:${body.participant_id}`,10,60) || await authAdmission(env,`stage-audience:${row.id}`,2400,60);if(denied)return denied;
  try{
    await env.DB.prepare('INSERT INTO stage_audience_responses(activity_id,participant_id,item,moderation) VALUES(?,?,?,?)').bind(a.id,body.participant_id,item,a.kind==='wordcloud'?'pending':'approved').run();
    return reply({ok:true});
  }catch{
    const retry=await env.DB.prepare('SELECT item FROM stage_audience_responses WHERE activity_id=? AND participant_id=?').bind(a.id,body.participant_id).first();
    return retry?.item===item?reply({ok:true,duplicate:true}):reply({error:'The activity changed. Refresh before retrying.'},409);
  }
}
