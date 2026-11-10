import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {E2E,requireLocalMutationTarget} from '../helpers/e2e-env.js';
import fs from 'node:fs/promises';

const worker=process.env.SPILL_E2E_WORKER_URL;
let token,stage;
const base={atmosphere:'midnight',chapters:[],activeChapterId:null,prompts:[],announcements:[],overlay:null};
const cue=(text='A private standalone moment')=>({id:crypto.randomUUID(),label:'Opening cue',kind:'announcement',text});
async function api(path,body,status=200,admin=true){
 const r=await fetch(worker+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${process.env.SPILL_E2E_API_SECRET}`,'Content-Type':'application/json',...(admin?{'X-Admin-Token':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 expect(r.status,await r.clone().text()).toBe(status);return r.json();
}
const state=()=>api(`/admin/stage-director/${stage.id}`);
const publicStage=()=>api(`/stages/${stage.code}`,undefined,200,false);
const audience=()=>api(`/stage-director/${stage.code}`,undefined,200,false);
async function packet(fields){const s=await state();return {requestId:crypto.randomUUID(),expectedRevision:s.revision,expectedPlatformRevision:s.platformRevision,...fields};}
async function change(fields,status=200){return api(`/admin/stage-director/${stage.id}`,await packet(fields),status);}
async function legacy(config){const item=(await api(`/admin/stages/${stage.id}`)).item;return api(`/admin/stages/${stage.id}`,{action:'configureStage',expectedRevision:item.revision,stage:config});}
async function authorize(context){await context.addCookies([{name:'spill_admin_session',value:token,url:E2E.baseURL,httpOnly:true,sameSite:'Lax'}]);}
async function activity(kind){const s=await change({action:'createActivity',kind,prompt:`Standalone ${kind} moment`,...(kind==='questions'?{questions:['What helps us listen?','What could we change?']}:{})});const a=s.activities[0];await change({action:'openActivity',activityId:a.id});return a;}
const respond=(a,item,participant=crypto.randomUUID(),status=200)=>api(`/stage-director/${stage.code}/respond`,{activityId:a.id,item,participant_id:participant},status,false);

test.beforeAll(async()=>{requireLocalMutationTarget(test);if(!worker)throw Error('Use the disposable runner.');token=(await api('/admin/auth/login',{password:E2E.adminPassword},200,false)).token;});
test.beforeEach(async()=>{stage=(await api('/admin/stages',{title:'Standalone Director fixture'} ,201)).item;});

test('private cues stay private, retries are at most once, and discussions and other stages are isolated',async()=>{
 const before=await publicStage();const discussion=await api(`/admin/sessions/${E2E.adminSessionId}/platform`);
 const other=(await api('/admin/stages',{title:'Other isolated stage'},201)).item;const otherBefore=await api(`/stages/${other.code}`,undefined,200,false);
 const prepared=cue();await change({action:'saveRundown',cues:[prepared]});await change({action:'preview',cue:prepared});
 expect(await publicStage()).toEqual(before);expect(JSON.stringify(await audience())).not.toContain(prepared.text);
 const take=await packet({action:'take'});const first=await api(`/admin/stage-director/${stage.id}`,take);const retry=await api(`/admin/stage-director/${stage.id}`,take);
 expect(retry.duplicate).toBe(true);expect(retry.platformRevision).toBe(first.platformRevision);expect((await publicStage()).item.stage.overlay.text).toBe(prepared.text);
 await api(`/admin/stage-director/${stage.id}`,{...take,action:'hide'},409);
 expect(await api(`/stages/${other.code}`,undefined,200,false)).toEqual(otherBefore);expect(await api(`/admin/sessions/${E2E.adminSessionId}/platform`)).toEqual(discussion);
 await change({action:'preview',cue:{id:'bad',label:'Discussion content',kind:'contribution',target:E2E.projectionIds[0]}},400);
 await change({action:'saveRundown',cues:[{id:'poll',label:'Discussion poll',kind:'poll',target:'other'}]},400);
});

test('original stage controls reject stale Take and simultaneous safe retries apply once',async()=>{
 await change({action:'preview',cue:cue()});const stale=await packet({action:'take'});
 await legacy({...base,overlay:{kind:'prompt',text:'Original controls still own Live',endsAt:null}});
 await api(`/admin/stage-director/${stage.id}`,stale,409);expect((await publicStage()).item.stage.overlay.text).toBe('Original controls still own Live');
 const take=await packet({action:'take'});const results=await Promise.all([api(`/admin/stage-director/${stage.id}`,take),api(`/admin/stage-director/${stage.id}`,take)]);
 expect(results.some(r=>r.duplicate)).toBe(true);expect((await state()).platformRevision).toBe(take.expectedPlatformRevision+1);
});

test('emergency hide survives refresh and repeated hide restores complete original stage settings',async({page,context})=>{
 await authorize(context);
 const config={...base,atmosphere:'aurora',chapters:[{id:'welcome',title:'A private prepared chapter'}],activeChapterId:'welcome',prompts:[{id:'later',text:'PRIVATE_SAVED_PROMPT'}],overlay:{kind:'prompt',text:'Restore this exact perspective.',endsAt:null}};
 await legacy(config);await change({action:'hide'});await change({action:'hide'});
 await page.goto(`/stage/${stage.code}`);await expect(page.locator('[data-emergency-blackout]')).toBeVisible();await page.reload();await expect(page.locator('[data-emergency-blackout]')).toBeVisible();
 await change({action:'restore'});await expect(page.locator('[data-stage-overlay="prompt"]')).toContainText(config.overlay.text);await expect(page.locator('[data-emergency-blackout]')).toHaveCount(0);
 expect((await api(`/admin/stages/${stage.id}`)).item.stage).toMatchObject(config);expect(JSON.stringify(await publicStage())).not.toContain('PRIVATE_SAVED_PROMPT');
});

test('all standalone audience modes protect hidden results, moderate words and close safely',async()=>{
 for(const kind of ['wordcloud','debate','questions','scale']){
  const a=await activity(kind);const before=await audience();const ids=Array.from({length:5},()=>crypto.randomUUID());
  const answer=kind==='wordcloud'?'PRIVATE_AUDIENCE_WORD':kind==='debate'?'agree':kind==='questions'?a.questions[0].id:'3';
  for(const id of ids)await respond(a,answer,id);
  expect(await audience()).toEqual(before);
  if(kind==='questions')await respond(a,E2E.projectionIds[0],crypto.randomUUID(),400);
  if(kind==='scale')await respond(a,'6',crypto.randomUUID(),400);
  await change({action:'revealActivity',activityId:a.id});
  if(kind==='wordcloud'){
   const words=(await state()).activities.find(x=>x.id===a.id).pending;expect((await state()).health.wordPending).toBe(5);
   for(const word of words)await change({action:'moderateWord',responseId:word.id,responseRevision:word.revision,status:'approved'});
  }
  const results=(await audience()).activities.find(x=>x.id===a.id).results;expect(results.total).toBe(5);if(kind==='scale')expect(results.average).toBe(3);
  await change({action:'closeActivity',activityId:a.id});await respond(a,answer,crypto.randomUUID(),409);expect((await respond(a,answer,ids[0])).duplicate).toBe(true);
  await change({action:'openActivity',activityId:a.id},409);
  const exported=JSON.stringify(await api(`/admin/stage-director/${stage.id}?export=aggregate`));expect(exported).not.toContain('PRIVATE_AUDIENCE_WORD');expect(exported).not.toContain(a.questions?.[0]?.content||'nonexistent question sentinel');expect(exported).not.toContain(ids[0]);
 }
});

test('cross-stage activity projection, responses and moderation are rejected',async()=>{
 const a=await activity('wordcloud');await respond(a,'Original stage only');const word=(await state()).activities[0].pending[0];
 stage=(await api('/admin/stages',{title:'Second owner'},201)).item;
 await change({action:'preview',cue:{id:'foreign',label:'Other stage activity',kind:'activity',target:a.id}},400);
 await respond(a,'Wrong stage',crypto.randomUUID(),404);
 await change({action:'moderateWord',responseId:word.id,responseRevision:word.revision,status:'approved'},409);
 const current=(await api(`/admin/stages/${stage.id}`)).item;
 await api(`/admin/stages/${stage.id}`,{action:'configureStage',expectedRevision:current.revision,stage:{...base,overlay:{kind:'activity',activityId:a.id,text:'Foreign activity',endsAt:null}}},400);
 expect((await state()).activities).toEqual([]);
});

test('100 scale responses and 100 exact retries keep correct totals',async()=>{
 const a=await activity('scale');const votes=Array.from({length:100},(_,i)=>({id:crypto.randomUUID(),value:String(i%5+1)}));
 expect((await Promise.all(votes.map(v=>respond(a,v.value,v.id)))).every(r=>r.ok)).toBe(true);
 expect((await Promise.all(votes.map(v=>respond(a,v.value,v.id)))).every(r=>r.duplicate)).toBe(true);
 expect((await state()).activities[0].responseCount).toBe(100);
 await change({action:'revealActivity',activityId:a.id});const result=(await audience()).activities[0].results;
 expect(result).toMatchObject({total:100,average:3});expect(result.items.map(i=>i.count)).toEqual([20,20,20,20,20]);
});

test('rehearsal and named voting picker work with branded private and public monitors',async({page,context},testInfo)=>{
 await authorize(context);
 let event=(await api('/admin/voting',{title:`Named open audience vote ${testInfo.project.name}`,questions:[{text:'Which direction?',options:['First','Second']}]})).event;
 event=(await api(`/admin/voting/${event.id}`,{action:'open',expectedRevision:event.revision})).event;
 const before=await publicStage();await page.goto(`/admin/stage?mode=standalone&stage=${stage.id}`);
 const director=page.getByRole('region',{name:'Live Director',exact:true});await expect(director.getByLabel('Spill It stage identity')).toHaveCount(2);
 await director.getByRole('button',{name:'Add cue',exact:true}).click();await director.getByLabel('Cue label',{exact:true}).fill('Choose a named vote');await director.getByRole('combobox',{name:'Cue type',exact:true}).selectOption('voting');
 const picker=director.getByRole('combobox',{name:'Voting event',exact:true});await expect(picker.getByRole('option',{name:`Named open audience vote ${testInfo.project.name} · Open`,exact:true})).toHaveCount(1);await picker.selectOption(event.code);
 await expect(director.getByLabel('Voting event code',{exact:true})).toHaveCount(0);
 await director.getByRole('button',{name:'Keep cue locally'}).click();await director.getByRole('button',{name:'Save private rundown'}).click();
 await expect.poll(async()=>(await state()).rundown.length).toBe(1);
 const posts=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await director.getByLabel('Rehearsal mode').check();await director.getByRole('button',{name:'Preview sample question'}).click();await director.getByRole('button',{name:'Take rehearsal cue'}).click();
 await director.getByRole('button',{name:'Hide rehearsal screen'}).click();await director.getByRole('button',{name:'Restore previous screen'}).click();await director.getByRole('button',{name:'Clear rehearsal screen'}).click();
 expect(posts).toEqual([]);expect(await publicStage()).toEqual(before);
 await director.getByLabel('Rehearsal mode').uncheck();await director.getByRole('button',{name:'Preview cue',exact:true}).click();
 await expect(director.getByRole('button',{name:'Take Live',exact:true})).toBeEnabled();
 const analysis=await new AxeBuilder({page}).include('[data-live-director]').withTags(['wcag2a','wcag2aa']).analyze();expect(analysis.violations).toEqual([]);
 await fs.mkdir('artifacts/standalone-director/screens',{recursive:true});
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const bounds=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1 && e.width>0).slice(0,12)}));expect(bounds.width,JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewport+1);await page.addStyleTag({content:'.sticky{position:static!important}'});await director.screenshot({path:`artifacts/standalone-director/screens/director-${theme}-${width}-${testInfo.project.name}.png`,scale:'css'});}
 }
});

test('browser Take, hide and restore work on the standalone projector with authenticated health',async({page,context})=>{
 await authorize(context);await change({action:'preview',cue:cue('A deliberate standalone perspective.')});
 await page.goto(`/admin/stage?mode=standalone&stage=${stage.id}`);const director=page.getByRole('region',{name:'Live Director',exact:true});const projector=await context.newPage();await projector.goto(`/stage/${stage.code}`);
 await director.getByRole('button',{name:'Take Live',exact:true}).click();await expect(projector.locator('[data-stage-overlay="announcement"]')).toContainText('A deliberate standalone perspective.');
 await director.getByRole('button',{name:'Emergency hide',exact:true}).click();await expect(projector.locator('[data-emergency-blackout]')).toBeVisible();
 await director.getByRole('button',{name:'Restore previous screen',exact:true}).click();await expect(projector.locator('[data-emergency-blackout]')).toHaveCount(0);await expect(projector.locator('[data-stage-overlay="announcement"]')).toBeVisible();
 await expect.poll(async()=>{const s=await state();return s.health.receiver?.revision===s.platformRevision;}).toBe(true);
 await api(`/stage-director/${stage.code}/heartbeat`,{revision:0,visible:true},401,false);
 await api(`/admin/stage-director/${stage.id}`,undefined,401,false);
 await director.getByRole('button',{name:'Clear Live',exact:true}).click();await expect(projector.locator('[data-stage-overlay]')).toHaveCount(0);await expect(projector.locator('.standalone-projector')).toHaveAttribute('data-stage-mode','cleared');
 await projector.close();
});

test('participant link and QR use an independent protected identity and project every audience mode',async({page,context},testInfo)=>{
 const projector=await context.newPage();await projector.setViewportSize({width:1920,height:1080});
 for(const kind of ['wordcloud','debate','questions','scale']){
  const a=await activity(kind);const answer=kind==='wordcloud'?'Community':kind==='debate'?'agree':kind==='questions'?a.questions[0].id:'4';
  for(let i=0;i<5;i++)await respond(a,answer);
  if(kind==='wordcloud')for(const word of (await state()).activities[0].pending)await change({action:'moderateWord',responseId:word.id,responseRevision:word.revision,status:'approved'});
  await change({action:'revealActivity',activityId:a.id});await change({action:'preview',cue:{id:`show-${kind}`,label:'Audience moment',kind:'activity',target:a.id}});await change({action:'take'});
  await projector.goto(`/stage/${stage.code}`);await expect(projector.getByRole('heading',{name:a.prompt,exact:true})).toBeVisible();
  for(const width of [320,1920,3840]){await projector.setViewportSize({width,height:width===320?700:width===3840?2160:1080});expect(await projector.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
  await projector.setViewportSize({width:1920,height:1080});await fs.mkdir('artifacts/standalone-director/screens',{recursive:true});await projector.screenshot({path:`artifacts/standalone-director/screens/projector-${kind}-${testInfo.project.name}.png`,scale:'css'});
 }
 await page.setViewportSize({width:320,height:800});await page.goto(`/stage/${stage.code}/join`);
 await expect(page.getByRole('heading',{name:'Standalone scale moment',exact:true}).first()).toBeVisible();await expect(page.getByAltText('QR code to join this standalone audience')).toBeVisible();
 await page.getByLabel('4 / 5',{exact:true}).check();await page.getByRole('button',{name:'Send response'}).click();await expect(page.getByRole('status').filter({hasText:'Your response is received.'})).toBeVisible();
 const identity=(await context.cookies()).find(c=>c.name===`spill_p_STANDALONE-${stage.code}`);expect(identity.httpOnly).toBe(true);
 expect((await context.cookies()).some(c=>c.name===`spill_p_${stage.code}`)).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const analysis=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();expect(analysis.violations).toEqual([]);
 await page.screenshot({path:`artifacts/standalone-director/screens/participant-${testInfo.project.name}.png`,fullPage:true,scale:'css'});
 await projector.close();
});

test('standalone proxy enforces origin and replaces forged participant identity',async({request,context})=>{
 await authorize(context);const a=await activity('scale');const endpoint=`/api/director/standalone/public/${stage.code}/respond`;
 expect((await request.post(endpoint,{headers:{Origin:'https://unrelated.invalid'},data:{activityId:a.id,item:'3'}})).status()).toBe(403);
 const first=await request.post(endpoint,{headers:{Origin:E2E.baseURL},data:{activityId:a.id,item:'3',participant_id:'forged-participant-id'}});expect(first.status()).toBe(200);
 const retry=await request.post(endpoint,{headers:{Origin:E2E.baseURL},data:{activityId:a.id,item:'3',participant_id:'a-different-forgery'}});expect((await retry.json()).duplicate).toBe(true);
 expect((await state()).activities[0].responseCount).toBe(1);
});

test('discussion Director also has branded monitors and named voting selection',async({page,context},testInfo)=>{
 await authorize(context);const event=(await api('/admin/voting',{title:`Discussion named vote ${testInfo.project.name}`,questions:[{text:'Which?',options:['Yes','No']}]})).event;await api(`/admin/voting/${event.id}`,{action:'open',expectedRevision:event.revision});
 await page.goto(`/admin/stage?session=${E2E.adminSessionId}`);const director=page.getByRole('region',{name:'Live Director',exact:true});await expect(director.getByLabel('Spill It stage identity')).toHaveCount(2);
 await director.getByRole('button',{name:'Add cue',exact:true}).click();await director.getByRole('combobox',{name:'Cue type',exact:true}).selectOption('voting');await expect(director.getByRole('combobox',{name:'Voting event',exact:true}).getByRole('option',{name:`Discussion named vote ${testInfo.project.name} · Open`,exact:true})).toHaveCount(1);
 await expect(director.getByLabel('Voting event code',{exact:true})).toHaveCount(0);
 await director.getByRole('combobox',{name:'Cue type',exact:true}).selectOption('poll');await expect(director.getByRole('combobox',{name:'Discussion poll',exact:true})).toBeVisible();
});


test('Clear Live returns to waiting and preserves preparation in both Directors',async()=>{
 const prepared=cue('Keep this prepared cue');const saved=await change({action:'saveRundown',cues:[prepared]});await change({action:'preview',cue:prepared});await change({action:'take'});await change({action:'hide'});
 const clear=await packet({action:'clearLive'});const cleared=await api(`/admin/stage-director/${stage.id}`,clear);expect(cleared.canRestore).toBe(false);expect(cleared.preview.text).toBe(prepared.text);expect(cleared.rundown).toEqual(saved.rundown);expect(cleared.live.stage.overlay).toBeNull();expect(cleared.live.stage.cleared).toBe(true);
 expect((await api(`/admin/stage-director/${stage.id}`,clear)).duplicate).toBe(true);await change({action:'restore'},409);
 const path=`/admin/director/${E2E.adminSessionId}`;let d=await api(path);const send=async fields=>{const result=await api(path,{requestId:crypto.randomUUID(),expectedRevision:d.revision,expectedPlatformRevision:d.platformRevision,...fields});d=result;return result;};
 await send({action:'saveRundown',cues:[prepared]});await send({action:'preview',cue:prepared});await send({action:'take'});await send({action:'hide'});await send({action:'clearLive'});
 expect(d.canRestore).toBe(false);expect(d.preview.text).toBe(prepared.text);expect(d.rundown).toEqual(saved.rundown);expect(d.live.stage.overlay).toBeNull();expect(d.live.contribution).toBeNull();expect(d.live.poll).toBeNull();
});


test('Send Live bypasses Preview safely and leaves prepared Preview unchanged in both Directors',async()=>{
 const privateCue=cue('Keep this private Preview'),directCue=cue('Send this directly Live');
 await change({action:'preview',cue:privateCue});const send=await packet({action:'sendLive',cue:directCue});const sent=await api(`/admin/stage-director/${stage.id}`,send);
 expect(sent.preview.text).toBe(privateCue.text);expect(sent.live.stage.overlay.text).toBe(directCue.text);expect((await api(`/admin/stage-director/${stage.id}`,send)).duplicate).toBe(true);
 await change({action:'sendLive',cue:{id:'bad',label:'Discussion source',kind:'contribution',target:E2E.projectionIds[0]}},409);
 const path=`/admin/director/${E2E.adminSessionId}`;let d=await api(path);const post=async fields=>{const packet={requestId:crypto.randomUUID(),expectedRevision:d.revision,expectedPlatformRevision:d.platformRevision,...fields};const result=await api(path,packet);d=result;return result;};
 await post({action:'preview',cue:privateCue});await post({action:'sendLive',cue:directCue});expect(d.preview.text).toBe(privateCue.text);expect(d.live.stage.overlay.text).toBe(directCue.text);
});

test('cue editor and rundown send directly to screen without altering private Preview',async({page,context})=>{
 await authorize(context);await change({action:'preview',cue:cue('Private Preview stays ready')});
 await page.goto(`/admin/stage?mode=standalone&stage=${stage.id}`);const director=page.getByRole('region',{name:'Live Director',exact:true});await director.getByRole('button',{name:'Add cue',exact:true}).click();
 await director.getByLabel('Cue label',{exact:true}).fill('Immediate welcome');await director.getByLabel('Cue text',{exact:true}).fill('Direct from cue editor.');
 await director.getByRole('button',{name:'Send Live now',exact:true}).click();await expect.poll(async()=>(await publicStage()).item.stage.overlay?.text).toBe('Direct from cue editor.');
 expect((await state()).preview.text).toBe('Private Preview stays ready');
 await director.getByRole('button',{name:'Keep cue locally',exact:true}).click();await director.getByRole('button',{name:'Clear Live',exact:true}).click();await expect.poll(async()=>(await publicStage()).item.stage.overlay).toBeNull();
 await director.getByRole('button',{name:'Send Immediate welcome Live',exact:true}).click();await expect.poll(async()=>(await publicStage()).item.stage.overlay?.text).toBe('Direct from cue editor.');expect((await state()).preview.text).toBe('Private Preview stays ready');
});


test('legacy manual clear prevents restoring obsolete emergency content',async()=>{
 await change({action:'sendLive',cue:cue('Old emergency content')});await change({action:'hide'});
 const current=(await api(`/admin/stages/${stage.id}`)).item;await api(`/admin/stages/${stage.id}`,{action:'clearStage',expectedRevision:current.revision});
 expect((await state()).canRestore).toBe(false);await change({action:'restore'},409);expect((await publicStage()).item.stage.overlay).toBeNull();
});
