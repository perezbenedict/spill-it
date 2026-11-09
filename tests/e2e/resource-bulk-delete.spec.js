import { expect, test } from '@playwright/test';
import { handleVotingCollection } from '../../api/voting.js';
import { handleStandaloneStages } from '../../api/stages.js';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';
let token;
async function api(path, body, status = 200, authenticated = true) {
  const response = await fetch(process.env.SPILL_E2E_WORKER_URL + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'Content-Type':'application/json', ...(authenticated ? { 'X-Admin-Token':token } : {}) }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  expect(response.status, await response.clone().text()).toBe(status);
  return response.json();
}
const stage = async title => (await api('/admin/stages',{title},201)).item;
const vote = async title => (await api('/admin/voting',{title,questions:[{text:'Choose a perspective',options:['One','Two']}]})).event;
const selection = row => ({id:row.id,revision:row.revision});
const bulk = (path, items, extra={},status=200) => api(path,{action:'bulkDelete',items:items.map(selection),confirmed:true,password:E2E.adminPassword,...extra},status);
test('bulk deletion rejects moderators before touching the database',async()=>{
 const request=()=>new Request('http://localhost/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'bulkDelete'})});
 const admin={user:{id:'actor',role:'moderator'}};
 expect((await handleVotingCollection(request(),{},admin)).status).toBe(403);
 expect((await handleStandaloneStages(request(),{},admin)).status).toBe(403);
});
test.beforeAll(async()=>{requireLocalMutationTarget(test);token=(await api('/admin/auth/login',{password:E2E.adminPassword},200,false)).token;});
test('standalone bulk deletion validates explicit selection and preserves unrelated stages',async()=>{
  const a=await stage('Bulk stage A'),b=await stage('Bulk stage B'),keep=await stage('Bulk stage keep');
  await bulk('/admin/stages',[a,a],{},400);await bulk('/admin/stages',[],{},400);await bulk('/admin/stages',Array.from({length:51},()=>a),{},400);await bulk('/admin/stages',[a],{confirmed:false},400);await bulk('/admin/stages',[a],{password:'incorrect'},401);
  const changed=(await api(`/admin/stages/${b.id}`,{action:'configureStage',expectedRevision:b.revision,stage:{...b.stage,atmosphere:'royal'}})).item;
  const result=await bulk('/admin/stages',[a,b]);expect(result.deletedIds).toEqual([a.id]);expect(result.results[1].status).toBe('rejected');
  await api(`/stages/${a.code}`,undefined,404);expect((await api(`/admin/stages/${b.id}`)).item.revision).toBe(changed.revision);expect((await api(`/admin/stages/${keep.id}`)).item.id).toBe(keep.id);
});
test('simultaneous stage bulk operations delete each stage only once and retain audit',async()=>{
 const a=await stage('Concurrent bulk stage');const results=await Promise.all([bulk('/admin/stages',[a]),bulk('/admin/stages',[a])]);expect(results.flatMap(r=>r.deletedIds)).toEqual([a.id]);
 const activity=await api(`/admin/activity?q=${a.id}`);expect(activity.items.filter(row=>row.action==='standalone_delete')).toHaveLength(1);
});
test('voting bulk rejects open, visible and stage-referenced votes while deleting eligible drafts',async()=>{
 const eligible=await vote('Eligible draft'),open=await vote('Open vote'),attached=await vote('Attached vote');
 const opened=(await api(`/admin/voting/${open.id}`,{action:'open',expectedRevision:open.revision})).event;
 let linked=(await api(`/admin/voting/${attached.id}`,{action:'open',expectedRevision:attached.revision})).event;linked=(await api(`/admin/voting/${attached.id}`,{action:'close',expectedRevision:linked.revision})).event;
 const s=await stage('Retained reference stage');await api(`/admin/stages/${s.id}`,{action:'configureStage',expectedRevision:s.revision,stage:{...s.stage,overlay:{kind:'voting',eventCode:attached.code,endsAt:null}}});
 const result=await bulk('/admin/voting',[eligible,opened,linked]);expect(result.deletedIds).toEqual([eligible.id]);expect(result.results.slice(1).every(r=>r.status==='rejected')).toBe(true);
 expect((await api(`/admin/stages/${s.id}`)).item.id).toBe(s.id);await api(`/admin/voting/${eligible.id}`,undefined,404);expect((await api(`/admin/voting/${open.id}`)).event.status).toBe('open');
 await api(`/admin/voting/${linked.id}`,{action:'delete',expectedRevision:linked.revision,password:E2E.adminPassword},409);
});
test('bulk stage selection cancellation, select displayed and successful removal',async({page,context})=>{
 await context.addCookies([{name:'spill_admin_session',value:token,url:E2E.baseURL,httpOnly:true,sameSite:'Lax'}]);const a=await stage('UI bulk one'),b=await stage('UI bulk two');await page.goto('/admin/stage?mode=standalone');
 await page.getByRole('checkbox',{name:`Select stage ${a.title} · ${a.code}`,exact:true}).check();await page.getByRole('checkbox',{name:`Select stage ${b.title} · ${b.code}`,exact:true}).check();
 await page.getByRole('button',{name:'Delete selected',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Delete 2 standalone stages?',exact:true});await expect(dialog).toContainText(a.title);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect((await api(`/admin/stages/${a.id}`)).item.id).toBe(a.id);
 await page.getByRole('button',{name:'Deselect all',exact:true}).click();await page.getByRole('button',{name:'Select displayed',exact:true}).click();await page.getByRole('button',{name:'Deselect all',exact:true}).click();await page.getByRole('checkbox',{name:`Select stage ${a.title} · ${a.code}`,exact:true}).check();await page.getByRole('button',{name:'Delete selected',exact:true}).click();const single=page.getByRole('dialog',{name:'Delete 1 standalone stages?',exact:true});await single.getByLabel('Admin password').fill(E2E.adminPassword);await single.getByRole('button',{name:'Delete permanently',exact:true}).click();await expect(single).toBeHidden();await expect(page.getByRole('checkbox',{name:`Select stage ${a.title} · ${a.code}`,exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:`Select stage ${b.title} · ${b.code}`,exact:true})).toBeVisible();
});

test('voting selection respects filters, cancellation and accurate list removal',async({page,context})=>{
 await context.addCookies([{name:'spill_admin_session',value:token,url:E2E.baseURL,httpOnly:true,sameSite:'Lax'}]);const a=await vote('UI voting delete fixture'),b=await vote('UI voting retained fixture');await page.goto('/admin/voting');
 await page.getByRole('checkbox',{name:`Select voting event ${a.title}`,exact:true}).check();
 await page.getByRole('button',{name:'Delete selected',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Delete 1 voting events?',exact:true});await expect(dialog).toContainText(a.title);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect((await api(`/admin/voting/${a.id}`)).event.id).toBe(a.id);
 await page.getByRole('combobox',{name:'Show',exact:true}).selectOption('closed');await expect(page.getByRole('button',{name:'Delete selected',exact:true})).toBeEnabled();await page.getByRole('combobox',{name:'Show',exact:true}).selectOption('draft');
 await page.getByRole('button',{name:'Delete selected',exact:true}).click();await dialog.getByLabel('Admin password').fill(E2E.adminPassword);await dialog.getByRole('button',{name:'Delete permanently',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.getByRole('checkbox',{name:`Select voting event ${a.title}`,exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:`Select voting event ${b.title}`,exact:true})).toBeVisible();
});

test('discussion projection and voting deletion cannot create a dangling reference',async()=>{
 const event=await vote('Projection deletion race');
 let current=(await api(`/admin/voting/${event.id}`)).event;
 await api(`/admin/voting/${event.id}`,{action:'open',expectedRevision:current.revision});
 current=(await api(`/admin/voting/${event.id}`)).event;
 await api(`/admin/voting/${event.id}`,{action:'close',expectedRevision:current.revision});
 current=(await api(`/admin/voting/${event.id}`)).event;
 const path=`/admin/sessions/${E2E.adminSessionId}/platform`;
 const platform=await api(path);
 const projection=fetch(process.env.SPILL_E2E_WORKER_URL+path,{method:'POST',headers:{Authorization:`Bearer ${process.env.SPILL_E2E_API_SECRET}`,'X-Admin-Token':token,'Content-Type':'application/json'},body:JSON.stringify({action:'configureStage',expectedRevision:platform.revision,stage:{...platform.stage,overlay:{kind:'voting',eventCode:event.code,endsAt:null}}})});
 const [result,response]=await Promise.all([bulk('/admin/voting',[current]),projection]);
 expect([200,400,409]).toContain(response.status);
 const after=await api(path);
 if(result.deletedIds.includes(event.id)){expect(after.stage.overlay?.eventCode).not.toBe(event.code);await api(`/admin/voting/${event.id}`,undefined,404);}else{expect((await api(`/admin/voting/${event.id}`)).event.id).toBe(event.id);expect(after.stage.overlay?.eventCode).toBe(event.code);}
});
