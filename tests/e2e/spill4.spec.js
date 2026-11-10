import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {E2E,requireLocalMutationTarget} from '../helpers/e2e-env.js';
import fs from 'node:fs/promises';

const worker=process.env.SPILL_E2E_WORKER_URL;
let token;
const id=E2E.adminSessionId;
const code=E2E.liveCode;
async function api(path,body,status=200,admin=true,method){
 const response=await fetch(worker+path,{method:method || (body===undefined?'GET':'POST'),headers:{Authorization:`Bearer ${process.env.SPILL_E2E_API_SECRET}`,'Content-Type':'application/json',...(admin?{'X-Admin-Token':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 expect(response.status,await response.clone().text()).toBe(status);return response.json();
}
const state=()=>api(`/admin/director/${id}`);
const platform=()=>api(`/admin/sessions/${id}/platform`);
async function packet(fields){const s=await state();return {expectedRevision:s.revision,expectedPlatformRevision:s.platformRevision,requestId:crypto.randomUUID(),...fields};}
async function change(fields,status=200){return api(`/admin/director/${id}`,await packet(fields),status);}
const cue=(text='Private cue, public only after Take Live')=>({id:crypto.randomUUID(),label:'Opening',kind:'announcement',text});
const publicStage=()=>api(`/sessions/${code}/engagement`,undefined,200,false);
const publicActivity=()=>api(`/director/${code}`,undefined,200,false);
async function newActivity(kind='wordcloud'){
 const created=await change({action:'createActivity',kind,prompt:({wordcloud:'What word describes tonight?',debate:'Can two perspectives both hold value?',questions:'Which question should we discuss next?',scale:'How confident do you feel?'}[kind])});
 const a=created.activities[0];await change({action:'openActivity',activityId:a.id});return a;
}
async function respond(a,item,participant=crypto.randomUUID(),status=200){return api(`/director/${code}/respond`,{activityId:a.id,item,participant_id:participant},status,false);}
async function authorize(context){await context.addCookies([{name:'spill_admin_session',value:token,url:E2E.baseURL,httpOnly:true,sameSite:'Lax'}]);}
async function cleanStage(){const p=await platform();await api(`/admin/sessions/${id}/platform`,{action:'configureStage',expectedRevision:p.revision,stage:{...p.stage,overlay:null}});}

test.beforeAll(async()=>{requireLocalMutationTarget(test);if(!worker)throw Error('Use the disposable runner.');token=(await api('/admin/auth/login',{password:E2E.adminPassword},200,false)).token;});
test.beforeEach(cleanStage);

test('private rundown and preview never leak and Take Live has an idempotent receipt',async()=>{
 const prepared=cue();const before=await publicStage();
 await change({action:'saveRundown',cues:[prepared]});await change({action:'preview',cue:prepared});
 expect(await publicStage()).toEqual(before);expect(JSON.stringify(await publicActivity())).not.toContain(prepared.text);
 const take=await packet({action:'take'});
 const first=await api(`/admin/director/${id}`,take);const revision=first.platformRevision;
 const retry=await api(`/admin/director/${id}`,take);expect(retry.duplicate).toBe(true);expect(retry.platformRevision).toBe(revision);
 expect((await publicStage()).stage.overlay.text).toBe(prepared.text);
 await api(`/admin/director/${id}`,{...take,action:'hide'},409);
});
test('competing director and original Stage Controls changes reject stale takes',async()=>{
 await change({action:'preview',cue:cue('Race protection')});const take=await packet({action:'take'});
 const p=await platform();await api(`/admin/sessions/${id}/platform`,{action:'configureStage',expectedRevision:p.revision,stage:{...p.stage,overlay:{kind:'prompt',text:'Original controls win',endsAt:null}}});
 await api(`/admin/director/${id}`,take,409);expect((await publicStage()).stage.overlay.text).toBe('Original controls win');
 const packetA=await packet({action:'saveRundown',cues:[cue('A')]});const packetB={...packetA,requestId:crypto.randomUUID(),cues:[cue('B')]};
 const statuses=await Promise.all([packetA,packetB].map(async body=>(await fetch(`${worker}/admin/director/${id}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SPILL_E2E_API_SECRET}`,'X-Admin-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)})).status));
 expect(statuses.sort()).toEqual([200,409]);
});
test('emergency hide is repeatable and safely restores the previous contribution',async()=>{
 const contribution=E2E.projectionIds[0];
 await change({action:'preview',cue:{id:'approved',label:'Approved question',kind:'contribution',target:contribution}});await change({action:'take'});
 await change({action:'hide'});await change({action:'hide'});
 expect((await publicStage()).stage.overlay.kind).toBe('blackout');expect((await state()).live.contribution).toBeNull();
 await change({action:'restore'});expect((await state()).live.contribution.id).toBe(contribution);
 await change({action:'hide'});
 const row=(await api(`/admin/submissions/${contribution}`)).row;
 await api(`/admin/submissions/${contribution}`,{expectedRevision:row.revision,moderation_status:'hidden'},200,true,'PATCH');
 await change({action:'restore'},409);expect((await publicStage()).stage.overlay.kind).toBe('blackout');
 const hidden=(await api(`/admin/submissions/${contribution}`)).row;
 await api(`/admin/submissions/${contribution}`,{expectedRevision:hidden.revision,moderation_status:'approved'},200,true,'PATCH');
});
test('word cloud stays moderated and hidden until explicit reveal and five approved responses',async()=>{
 const a=await newActivity();const participant=crypto.randomUUID();
 await respond(a,'Hope',participant);expect((await respond(a,'Hope',participant)).duplicate).toBe(true);await respond(a,'Changed',participant,409);
 for(let i=0;i<4;i++)await respond(a,i===0?'=PRIVATEFORMULA':'Hope');
 let s=await state();expect(s.health.wordPending).toBe(5);const words=s.activities.find(x=>x.id===a.id).pending;
 expect(JSON.stringify(await publicActivity())).not.toContain('=PRIVATEFORMULA');
 await change({action:'revealActivity',activityId:a.id});expect((await publicActivity()).activities.find(x=>x.id===a.id).results).toBeNull();
 for(const word of words)await change({action:'moderateWord',responseId:word.id,responseRevision:word.revision,status:'approved'});
 let result=(await publicActivity()).activities.find(x=>x.id===a.id).results;expect(result.total).toBe(5);
 const approved=(await state()).activities.find(x=>x.id===a.id).pending[0];
 await change({action:'moderateWord',responseId:approved.id,responseRevision:approved.revision,status:'hidden'});
 expect((await publicActivity()).activities.find(x=>x.id===a.id).results).toBeNull();
 await change({action:'moderateWord',responseId:approved.id,responseRevision:approved.revision,status:'approved'},409);
 const exported=await api(`/admin/director/${id}?export=aggregate`);
 expect(JSON.stringify(exported)).not.toContain('PRIVATEFORMULA');expect(JSON.stringify(exported)).not.toContain(participant);
 await change({action:'closeActivity',activityId:a.id});await respond(a,'late',crypto.randomUUID(),409);
});
test('debate and scale responses have browser uniqueness and hidden result privacy',async()=>{
 for(const kind of ['debate','scale']){
  const a=await newActivity(kind);const before=await publicActivity();
  await respond(a,kind==='scale'?'6':'maybe',crypto.randomUUID(),400);
  for(let i=0;i<5;i++)await respond(a,kind==='scale'?'4':'agree');
  expect(await publicActivity()).toEqual(before);
  await change({action:'revealActivity',activityId:a.id});
  const result=(await publicActivity()).activities.find(x=>x.id===a.id).results;expect(result.total).toBe(5);if(kind==='scale')expect(result.average).toBe(4);
  await change({action:'closeActivity',activityId:a.id});await change({action:'openActivity',activityId:a.id},409);
 }
});
test('question priority accepts only approved visible session questions',async()=>{
 const a=await newActivity('questions');const question=E2E.projectionIds[1];
 await respond(a,question);await respond(a,'not-a-question',crypto.randomUUID(),400);
 const row=(await api(`/admin/submissions/${question}`)).row;
 await api(`/admin/submissions/${question}`,{expectedRevision:row.revision,hidden_from_presentation:true},200,true,'PATCH');
 await respond(a,question,crypto.randomUUID(),400);
 expect((await publicActivity()).activities.find(x=>x.id===a.id).questions.some(x=>x.id===question)).toBe(false);
 const current=(await api(`/admin/submissions/${question}`)).row;await api(`/admin/submissions/${question}`,{expectedRevision:current.revision,hidden_from_presentation:false},200,true,'PATCH');
});
test('health accepts bounded receiver status and private endpoints require authentication',async()=>{
 const s=await state();await api(`/director/${code}/heartbeat`,{revision:s.platformRevision,visible:true},200,true);
 await api(`/director/${code}/heartbeat`,{revision:s.platformRevision,visible:true},401,false);
 const health=(await state()).health;expect(health.projectorFresh).toBe(true);expect(health.synchronized).toBe(true);
 await api(`/director/${code}/heartbeat`,{revision:-1,visible:true},400,true);
 await api(`/admin/director/${id}`,undefined,401,false);
});
test('rehearsal performs no mutation requests and keeps real Live unchanged',async({page,context})=>{
 await authorize(context);await page.goto(`/admin/stage?session=${id}`);
 const director=page.getByRole('region',{name:'Live Director',exact:true});await expect(director.getByRole('button',{name:'Run event checks'})).toBeEnabled();
 await expect.poll(async()=>await director.getByText('Connecting…',{exact:true}).count()).toBe(0);
 const before=await state();const posts=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await director.getByLabel('Rehearsal mode').check();await director.getByRole('button',{name:'Preview sample question'}).click();await director.getByRole('button',{name:'Take rehearsal cue'}).click();
 await expect(director.getByText('Rehearsal: what makes a conversation meaningful?',{exact:true})).toHaveCount(2);
 await director.getByRole('button',{name:'Hide rehearsal screen'}).click();await director.getByRole('button',{name:'Restore previous screen'}).click();
 expect(posts).toEqual([]);expect((await state()).platformRevision).toBe(before.platformRevision);expect((await state()).revision).toBe(before.revision);
 await expect(director.getByRole('button',{name:'Create activity draft'})).toBeDisabled();
});
test('director browser Take Live, emergency recovery, screenshots and accessibility',async({page,context},testInfo)=>{
 await authorize(context);await change({action:'preview',cue:cue('A calm, considered perspective.')});
 await page.goto(`/admin/stage?session=${id}`);const director=page.getByRole('region',{name:'Live Director',exact:true});
 await expect(director.getByRole('button',{name:'Take Live',exact:true})).toBeEnabled();
 const projector=await context.newPage();await projector.goto(`/room/${code}`);
 await director.getByRole('button',{name:'Take Live',exact:true}).click();await expect(projector.locator('[data-stage-overlay="announcement"]')).toContainText('A calm, considered perspective.');
 await director.getByRole('button',{name:'Emergency hide',exact:true}).click();await expect(projector.locator('[data-emergency-blackout]')).toBeVisible();
 await director.getByRole('button',{name:'Restore previous screen',exact:true}).click();await expect(projector.locator('[data-stage-overlay="announcement"]')).toBeVisible();
 await expect(projector.locator('[data-emergency-blackout]')).toHaveCount(0);
 const violations=(await new AxeBuilder({page}).include('[data-live-director]').withTags(['wcag2a','wcag2aa']).analyze()).violations;expect(violations).toEqual([]);
 await fs.mkdir('artifacts/spill4/screens',{recursive:true});
 for(const theme of ['dark','light']){
  await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.evaluate(()=>window.scrollTo(0,0));
   const unstuck=await page.addStyleTag({content:'.sticky { position:static !important; }'});
   await director.screenshot({path:`artifacts/spill4/screens/director-${theme}-${width}-${testInfo.project.name}.png`});
   await unstuck.evaluate(element=>element.remove());
  }
 }
 await projector.screenshot({path:`artifacts/spill4/screens/projector-${testInfo.project.name}.png`});
 await expect.poll(async()=>(await state()).health.projectorFresh,{timeout:20000}).toBe(true);
 await projector.close();
});
test('proxy enforces origin and server-owned browser identity; low bandwidth keeps participant usable',async({page,context})=>{
 await authorize(context);const a=await newActivity('scale');
 const bad=await page.request.post(`/api/director/admin/${id}`,{headers:{Origin:'https://wrong.example'},data:await packet({action:'hide'})});expect(bad.status()).toBe(403);
 const endpoint=`${E2E.baseURL}/api/director/public/${code}/respond`;
 for(let i=0;i<2;i++){
  const response=await context.request.post(endpoint,{headers:{Origin:E2E.baseURL},data:{activityId:a.id,item:'3',participant_id:crypto.randomUUID()}});expect(response.status()).toBe(200);expect((await response.json()).duplicate || false).toBe(i===1);
 }
 await page.goto(`/join/${code}`);
 await page.getByLabel(/Low bandwidth/).check();
 await expect(page.locator('html')).toHaveAttribute('data-low-bandwidth','true');
 await context.setOffline(true);
 await expect(page.getByText(/You are offline/)).toBeVisible();
 await context.setOffline(false);
 // Audience participation appears after the participant enters; existing journey tests cover navigation.
 expect((await state()).activities.find(x=>x.id===a.id).responseCount).toBe(1);
});

test('lost server acknowledgement retries the identical operation without a second live change',async({page,context})=>{
 await authorize(context);await change({action:'preview',cue:cue('Safe retry screen')});
 await page.goto(`/admin/stage?session=${id}`);const director=page.getByRole('region',{name:'Live Director',exact:true});
 await expect(director.getByRole('button',{name:'Take Live',exact:true})).toBeEnabled();
 const before=await state();let lost=false;const bodies=[];
 await page.route(`**/api/director/admin/${id}`,async route=>{
  if(route.request().method()!=='POST')return route.continue();
  bodies.push(route.request().postDataJSON());
  if(!lost){lost=true;await route.fetch();return route.abort('failed');}
  return route.continue();
 });
 await director.getByRole('button',{name:'Take Live',exact:true}).click();
 await expect(director.getByRole('button',{name:'Retry unconfirmed action safely'})).toBeVisible();
 await director.getByRole('button',{name:'Retry unconfirmed action safely'}).click();
 await expect(director.getByRole('button',{name:'Retry unconfirmed action safely'})).toHaveCount(0);
 expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);
 const after=await state();expect(after.platformRevision).toBe(before.platformRevision+1);expect(after.revision).toBe(before.revision+1);
});

test('all engagement modes project readable public results and remain usable at 320px',async({page,context},testInfo)=>{
 await authorize(context);
 const projector=await context.newPage();await projector.setViewportSize({width:1920,height:1080});
 for(const kind of ['wordcloud','debate','questions','scale']){
  const a=await newActivity(kind);
  for(let i=0;i<5;i++)await respond(a,kind==='wordcloud'?['hope','community','hope','kindness','community'][i]:kind==='debate'?(i%2?'disagree':'agree'):kind==='questions'?E2E.projectionIds[0]:String(i+1));
  if(kind==='wordcloud')for(const word of (await state()).activities.find(x=>x.id===a.id).pending)await change({action:'moderateWord',responseId:word.id,responseRevision:word.revision,status:'approved'});
  await change({action:'revealActivity',activityId:a.id});
  await change({action:'preview',cue:{id:`visual-${kind}`,label:a.prompt,kind:'activity',target:a.id}});await change({action:'take'});
  await projector.goto(`/room/${code}`);await expect(projector.getByRole('heading',{name:a.prompt,exact:true})).toBeVisible();
  await expect(projector.getByLabel('Audience activity results')).toContainText('5 approved responses');
  for(const width of [1920,3840,320]){
   await projector.setViewportSize({width,height:width===320?700:width===3840?2160:1080});
   expect(await projector.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await projector.setViewportSize({width:1920,height:1080});
  await projector.screenshot({path:`artifacts/spill4/screens/activity-${kind}-${testInfo.project.name}.png`});
  await page.setViewportSize({width:320,height:700});await page.goto(`/join/${code}`);
  await expect(page.getByRole('heading',{name:a.prompt,exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(kind==='scale'){
   const analysis=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();expect(analysis.violations).toEqual([]);
   await page.screenshot({path:`artifacts/spill4/screens/participant-scale-${testInfo.project.name}.png`,fullPage:true});
  }
 }
 await projector.close();
});

test('100 audience responses aggregate exactly and retries cannot inflate totals',async()=>{
 const a=await newActivity('scale');const hidden=await publicActivity();
 const voters=Array.from({length:100},(_,i)=>({participant:crypto.randomUUID(),item:String(i%5+1)}));
 const first=await Promise.all(voters.map(v=>respond(a,v.item,v.participant)));
 expect(first.every(result=>result.ok)).toBe(true);
 const retries=await Promise.all(voters.map(v=>respond(a,v.item,v.participant)));
 expect(retries.every(result=>result.duplicate)).toBe(true);
 expect((await state()).activities.find(x=>x.id===a.id).responseCount).toBe(100);
 expect(await publicActivity()).toEqual(hidden);
 await change({action:'closeActivity',activityId:a.id});
 await respond(a,'3',crypto.randomUUID(),409);
 await change({action:'revealActivity',activityId:a.id});
 const result=(await publicActivity()).activities.find(x=>x.id===a.id).results;
 expect(result.total).toBe(100);expect(result.average).toBe(3);expect(result.items.map(x=>x.count)).toEqual([20,20,20,20,20]);
});
