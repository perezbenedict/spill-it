import {expect,test} from '@playwright/test';
import fs from 'node:fs/promises';
import {E2E,requireLocalMutationTarget} from '../helpers/e2e-env.js';
let token;
async function api(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(process.env.SPILL_E2E_WORKER_URL+path,{method,headers:{Authorization:`Bearer ${process.env.SPILL_E2E_API_SECRET}`,'X-Admin-Token':token || '','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});expect(response.ok,await response.clone().text()).toBe(true);return response.json();
}
async function contribution(content,category='question'){
 const nickname='Post'+crypto.randomUUID().slice(0,8),participant_id=crypto.randomUUID();
 await api('/nickname',{sessionCode:E2E.liveCode,participant_id,nickname});await api('/submissions',{sessionCode:E2E.liveCode,participant_id,nickname,category,content,request_id:crypto.randomUUID()});
 const row=(await api(`/admin/submissions?session_id=${E2E.adminSessionId}&search=${nickname}`)).items[0];return (await api(`/admin/submissions/${row.id}`,{expectedRevision:row.revision,moderation_status:'approved'},'PATCH')).row;
}
async function authorize(context){await context.addCookies([{name:'spill_admin_session',value:token,url:E2E.baseURL,httpOnly:true,sameSite:'Lax'}]);}
async function ready(page,options={}){const canvas=page.getByRole('img',{name:'Social post image preview'});if(options.size)await expect(canvas).toHaveAttribute('data-post-size',options.size);if(options.theme)await expect(canvas).toHaveAttribute('data-post-theme',options.theme);if(options.font)await expect(canvas).toHaveAttribute('data-post-font',options.font);await expect(canvas).toHaveAttribute('data-post-ready','true');}
test.beforeAll(async()=>{requireLocalMutationTarget(test);token=(await api('/admin/auth/login',{password:E2E.adminPassword})).token;});
test('a selected question has an editable optional title and independent branding, topic and link controls; PNG equals preview',async({page,context},info)=>{
 await authorize(context);const row=await contribution('What would change if we listened to understand, instead of listening to reply?');
 await page.goto(`/admin/posts?session=${E2E.adminSessionId}&post=${row.id}`);await ready(page);await page.getByRole('checkbox',{name:'Include post type',exact:true}).uncheck();
 await expect(page.getByRole('heading',{name:'A voice worth sharing.'})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Include title',exact:true})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Include title',exact:true}).check();await page.getByLabel('Post title',{exact:true}).fill('A question worth asking');await page.getByLabel('Topic text',{exact:true}).fill('Learning to listen');
 await page.getByRole('checkbox',{name:'Include discussion link',exact:true}).check();await page.getByText('View caption',{exact:true}).click();
 const caption=page.getByLabel('Post caption',{exact:true});await expect(caption).toHaveValue(`A question worth asking\n\nLearning to listen\n\n${row.content}\n\n${E2E.baseURL}/join/${E2E.liveCode}`);
 await page.getByRole('checkbox',{name:'Include emblem',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Include Spill It logo',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Include discussion topic',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Include discussion link',exact:true}).uncheck();await ready(page);
 await expect(caption).toHaveValue(`A question worth asking\n\n${row.content}`);
 for(const size of ['portrait','vertical','square']){
  await page.getByLabel('Image size',{exact:true}).selectOption(size);await ready(page,{size});await expect(page.getByRole('img',{name:'Social post image preview'})).toHaveAttribute('data-post-fits','true');
  const preview=await page.getByRole('img',{name:'Social post image preview'}).evaluate(async canvas=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data))).join(','));
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download=await downloadPromise;const bytes=await fs.readFile(await download.path());
  expect(bytes.readUInt32BE(16)).toBe(1080);expect(bytes.readUInt32BE(20)).toBe(size==='portrait'?1350:size==='vertical'?1920:1080);
  const pixels=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,canvas.width,canvas.height).data))).join(',');},bytes.toString('base64'));
  await fs.mkdir('artifacts/social-posts/exports',{recursive:true});await fs.writeFile(`artifacts/social-posts/exports/${size}-${info.project.name}.png`,bytes);expect(pixels).toBe(preview);
 }
 await page.getByLabel('Image size',{exact:true}).selectOption('portrait');await page.getByRole('checkbox',{name:'Include emblem',exact:true}).check();await page.getByRole('checkbox',{name:'Include Spill It logo',exact:true}).check();await page.getByRole('checkbox',{name:'Include discussion topic',exact:true}).check();await ready(page);
 await fs.mkdir('artifacts/social-posts/screens',{recursive:true});
 for(const [id,theme] of [['aurora','Violet aurora'],['ivory','Ivory editorial'],['midnight','Midnight gold'],['velvet','Crimson velvet']]){await page.getByRole('button',{name:`Use ${theme} background`,exact:true}).click();await ready(page,{theme:id});await page.screenshot({path:`artifacts/social-posts/screens/${theme.toLowerCase().replaceAll(' ','-')}-${info.project.name}.png`});}
 await page.getByRole('button',{name:'Enlarge preview',exact:true}).click();await expect(page.getByRole('dialog',{name:'Post preview',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close preview',exact:true}).click();
 await page.getByRole('button',{name:'Switch to light mode',exact:true}).click();await page.screenshot({path:`artifacts/social-posts/screens/light-${info.project.name}.png`});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`artifacts/social-posts/screens/mobile-${info.project.name}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('post download rechecks moderation and anonymous visitors cannot read post data',async({page,context,request})=>{
 expect((await request.get(`/api/admin/social-posts?session=${E2E.adminSessionId}`)).status()).toBe(401);
 await authorize(context);const row=await contribution('A disposable post for the moderation recheck.');await page.goto(`/admin/posts?session=${E2E.adminSessionId}&post=${row.id}`);await ready(page);
 const foreign=await page.request.get(`/api/admin/social-posts?session=${E2E.bulkSessionIds[0]}&post=${row.id}`);expect(foreign.status()).toBe(409);expect(await foreign.text()).not.toContain(row.content);
 await api(`/admin/submissions/${row.id}`,{expectedRevision:row.revision,hidden_from_presentation:true},'PATCH');let downloads=0;page.on('download',()=>downloads++);await page.getByRole('button',{name:'Download PNG',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'no longer approved and visible'})).toBeVisible();expect(downloads).toBe(0);await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeDisabled();
 await page.reload();await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeDisabled();
});
test('long contributions stay complete in Vertical and do not export a clipped square',async({page,context})=>{
 await authorize(context);const content=('Listening creates room for voices we have not heard. ').repeat(19).slice(0,990).trim(),row=await contribution(content,'opinion');
 await page.goto(`/admin/posts?session=${E2E.adminSessionId}&post=${row.id}`);await page.getByLabel('Image size',{exact:true}).selectOption('square');await ready(page);await expect(page.getByRole('img',{name:'Social post image preview'})).toHaveAttribute('data-post-fits','false');await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeDisabled();
 await page.getByLabel('Image size',{exact:true}).selectOption('vertical');await ready(page);await expect(page.getByRole('img',{name:'Social post image preview'})).toHaveAttribute('data-post-fits','true');await page.getByText('View caption',{exact:true}).click();expect((await page.getByLabel('Post caption',{exact:true}).inputValue()).includes(content)).toBe(true);
});
test('post-only corrections, contributor names, quote marks, post type, grain and playful fonts export without changing the original',async({page,context},info)=>{
 await authorize(context);const row=await contribution('I thinks we can listen better.','opinion'),original=(await api(`/admin/submissions/${row.id}`)).row;
 await page.goto(`/admin/posts?session=${E2E.adminSessionId}&post=${row.id}`);await ready(page);
 await page.getByLabel('Post text',{exact:true}).fill('I think we can listen better.');await page.getByRole('checkbox',{name:'Include discussion topic',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Include contributor name',exact:true}).check();await page.getByRole('checkbox',{name:'Use quotation marks',exact:true}).check();await page.getByText('View caption',{exact:true}).click();
 await expect(page.getByLabel('Post caption',{exact:true})).toHaveValue(`OPINION\n\n“I think we can listen better.”\n— ${row.nickname}`);
 await page.getByRole('button',{name:'Use Grainy purple background',exact:true}).click();await ready(page,{theme:'grain-purple'});await expect(page.getByRole('checkbox',{name:'Add grain texture',exact:true})).toBeChecked();
 await fs.mkdir('artifacts/social-posts/exports',{recursive:true});
 for(const font of ['fredoka','balsamiq','patrick','caveat']){
  await page.getByLabel('Comment font',{exact:true}).selectOption(font);await ready(page,{font});await expect(page.getByRole('img',{name:'Social post image preview'})).toHaveAttribute('data-post-fits','true');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download=await downloadPromise;await fs.copyFile(await download.path(),`artifacts/social-posts/exports/playful-${font}-${info.project.name}.png`);
 }
 const alignment=await page.getByRole('img',{name:'Social post image preview'}).evaluate(canvas=>{const ctx=canvas.getContext('2d');const count=(x,y,w,h,red)=>{const pixels=ctx.getImageData(x,y,w,h).data;let total=0;for(let i=0;i<pixels.length;i+=4)if(red?pixels[i]>130 && pixels[i+1]<100 && pixels[i+2]<130:pixels[i]>220 && pixels[i+1]>220 && pixels[i+2]>220)total++;return total;};return {centerEmblem:count(470,90,140,90,true),leftEmblem:count(90,90,140,90,true),centerLogo:count(350,185,380,70,false),leftLogo:count(90,185,200,70,false)};});
 expect(alignment.centerEmblem).toBeGreaterThan(100);expect(alignment.leftEmblem).toBeLessThan(10);expect(alignment.centerLogo).toBeGreaterThan(100);expect(alignment.leftLogo).toBeLessThan(10);
 expect((await api(`/admin/submissions/${row.id}`)).row).toEqual(original);
 await page.getByRole('checkbox',{name:'Include contributor name',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Use quotation marks',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Include post type',exact:true}).uncheck();await expect(page.getByLabel('Post caption',{exact:true})).toHaveValue('I think we can listen better.');
 await page.getByRole('button',{name:'Reset to original',exact:true}).click();await expect(page.getByLabel('Post text',{exact:true})).toHaveValue(row.content);await page.getByLabel('Post text',{exact:true}).fill('');await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeDisabled();
});
test('standalone posts have independent optional copy, exact font sizing, optional community names and no contribution writes',async({page,context},info)=>{
 await authorize(context);const before=(await api(`/admin/sessions/${E2E.adminSessionId}`)).session;
 await page.goto(`/admin/posts?session=${E2E.adminSessionId}`);await page.getByLabel('Post layout',{exact:true}).selectOption('standalone');
 await page.getByLabel('Post text',{exact:true}).fill('Our voices matter.\nOur conversations bring us together.');await page.getByLabel('Post title',{exact:true}).fill('Top ten thoughts');
 for(const name of ['Include Grace Nation Wealthy Youths','Include GNWY'])await expect(page.getByRole('checkbox',{name,exact:true})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Include extra text 1',exact:true}).check();await page.getByLabel('Extra text 1',{exact:true}).fill('A Sunday recap');await page.getByRole('checkbox',{name:'Include extra text 2',exact:true}).check();await page.getByLabel('Extra text 2',{exact:true}).fill('See you next Sunday.');
 await page.getByRole('checkbox',{name:'Include Grace Nation Wealthy Youths',exact:true}).check();await page.getByRole('checkbox',{name:'Include GNWY',exact:true}).check();await page.getByRole('checkbox',{name:'Include extra text 2',exact:true}).uncheck();
 await page.getByText('View caption',{exact:true}).click();const caption=page.getByLabel('Post caption',{exact:true});await expect(caption).toHaveValue('Grace Nation Wealthy Youths\n\nGNWY\n\nTop ten thoughts\n\nOur voices matter.\nOur conversations bring us together.\n\nA Sunday recap');
 await page.getByRole('checkbox',{name:'Include GNWY',exact:true}).uncheck();await expect(caption).not.toHaveValue(/\nGNWY\n/);
 const canvas=page.getByRole('img',{name:'Social post image preview'});await ready(page);await page.getByLabel('Main text size',{exact:true}).fill('48');await expect(canvas).toHaveAttribute('data-post-font-size','48');await page.getByRole('button',{name:'Increase main text size',exact:true}).click();await expect(canvas).toHaveAttribute('data-post-font-size','52');await page.getByRole('button',{name:'Decrease main text size',exact:true}).click();await expect(canvas).toHaveAttribute('data-post-font-size','48');
 let writes=0,sourceReads=0;page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes++;if(r.url().includes('/api/admin/social-posts'))sourceReads++;});
 await page.getByRole('button',{name:'Use Grainy purple background',exact:true}).click();await ready(page,{theme:'grain-purple'});await expect(canvas).toHaveAttribute('data-post-fits','true');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download=await pending;await fs.copyFile(await download.path(),`artifacts/social-posts/exports/standalone-${info.project.name}.png`);expect(writes).toBe(0);expect(sourceReads).toBe(0);
 await page.getByLabel('Post layout',{exact:true}).selectOption('invitation');await page.getByLabel('Post layout',{exact:true}).selectOption('standalone');await expect(page.getByLabel('Post text',{exact:true})).toHaveValue('Our voices matter.\nOur conversations bring us together.');await expect(page.getByLabel('Extra text 1',{exact:true})).toHaveValue('A Sunday recap');
 await page.getByLabel('Main text size',{exact:true}).fill('180');await ready(page);await expect(canvas).toHaveAttribute('data-post-font-size','180');await expect(canvas).toHaveAttribute('data-post-fits','false');await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Auto fit',exact:true}).click();await ready(page);await expect(canvas).toHaveAttribute('data-post-fits','true');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect((await api(`/admin/sessions/${E2E.adminSessionId}`)).session).toEqual(before);
});
test('invitations, QR cards and raw QR images use the current discussion link without opening the discussion',async({page,context},info)=>{
 await authorize(context);const before=(await api(`/admin/sessions/${E2E.adminSessionId}`)).session;
 await page.goto(`/admin/posts?session=${E2E.adminSessionId}`);await page.getByLabel('Post layout',{exact:true}).selectOption('invitation');await expect(page.getByRole('note')).toContainText('Live discussion');
 await page.getByLabel('Event date and time',{exact:true}).fill('Sunday · 10:00 AM');await page.getByLabel('Event venue',{exact:true}).fill('Grace Nation · Youth gathering');
 await page.getByRole('button',{name:'Use Grainy purple background',exact:true}).click();
 const canvas=page.getByRole('img',{name:'Social post image preview'});await fs.mkdir('artifacts/social-posts/exports',{recursive:true});
 for(const size of ['portrait','vertical','square']){
  await page.getByLabel('Image size',{exact:true}).selectOption(size);await ready(page,{size});await expect(canvas).toHaveAttribute('data-post-layout','invitation');await expect(canvas).toHaveAttribute('data-post-fits','true');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download=await pending;await fs.copyFile(await download.path(),`artifacts/social-posts/exports/invitation-${size}-${info.project.name}.png`);
 }
 await page.getByRole('checkbox',{name:'Include QR code',exact:true}).uncheck();await ready(page);await expect(canvas).toHaveAttribute('data-post-fits','true');await page.getByRole('checkbox',{name:'Include QR code',exact:true}).check();
 await page.getByLabel('Post layout',{exact:true}).selectOption('qr');await page.getByLabel('Image size',{exact:true}).selectOption('portrait');await ready(page);await expect(canvas).toHaveAttribute('data-post-layout','qr');await expect(canvas).toHaveAttribute('data-post-fits','true');
 let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();let download=await pending;await fs.copyFile(await download.path(),`artifacts/social-posts/exports/qr-card-${info.project.name}.png`);
 pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download QR only',exact:true}).click();download=await pending;const bytes=await fs.readFile(await download.path());expect(bytes.readUInt32BE(16)).toBe(1024);expect(bytes.readUInt32BE(20)).toBe(1024);await fs.writeFile(`artifacts/social-posts/exports/qr-raw-${info.project.name}.png`,bytes);
 expect((await api(`/admin/sessions/${E2E.adminSessionId}`)).session).toEqual(before);
});
test('pinned contributions are first and labelled in the picker without adding a pinned label to the post',async({page,context})=>{
 await authorize(context);const row=await contribution('Pinned contribution for the social picker.');await api(`/admin/submissions/${row.id}`,{expectedRevision:row.revision,is_pinned:true},'PATCH');await page.goto(`/admin/posts?session=${E2E.adminSessionId}`);const cards=page.locator('.post-source-list .post-source-card');await expect(cards.first()).toContainText('Pinned');const result=await page.request.get(`/api/admin/social-posts?session=${E2E.adminSessionId}`),data=await result.json();expect(data.items.some(item=>item.id===row.id && item.isPinned)).toBe(true);let unpinned=false;for(const item of data.items){if(!item.isPinned)unpinned=true;else expect(unpinned).toBe(false);}
 await page.getByRole('radio',{name:`Use contribution: ${row.content}`,exact:true}).check();await page.getByText('View caption',{exact:true}).click();await expect(page.getByLabel('Post caption',{exact:true})).toHaveValue(`${E2E.topic}\n\nQUESTION\n\n${row.content}`);
});
test('the element layer adds text and shapes, drags, restyles, undoes and exports over the post',async({page,context},info)=>{
 await authorize(context);const row=await contribution('Layers give a post its own voice.');
 await page.goto(`/admin/posts?session=${E2E.adminSessionId}&post=${row.id}`);await ready(page);
 const canvas=page.getByRole('img',{name:'Social post image preview'}),overlay=page.getByRole('application',{name:/Element layer/});
 await page.getByRole('button',{name:'Text',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','1');
 await expect(page.getByLabel('Layer text',{exact:true})).toHaveValue('Your text here');
 await page.getByLabel('Layer text',{exact:true}).fill('Layer test');
 await page.getByLabel('Layer text size',{exact:true}).fill('0.08');
 await expect(canvas).toHaveAttribute('data-post-fits','true');
 const box=await overlay.boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.48);
 await page.mouse.down();await page.mouse.move(box.x+box.width*.64,box.y+box.height*.6,{steps:10});await page.mouse.up();
 await page.getByRole('button',{name:'Rectangle',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','2');
 await expect(page.locator('.post-element-row')).toHaveCount(2);
 await page.getByLabel('Layer rotation',{exact:true}).fill('30');
 await page.getByRole('button',{name:'Duplicate',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','3');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','2');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','3');
 await page.getByLabel('Layer template',{exact:true}).selectOption('quote-sticker');
 await expect(canvas).toHaveAttribute('data-post-elements','5');
 await page.getByRole('button',{name:'Clear layers',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','0');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(canvas).toHaveAttribute('data-post-elements','5');
 await fs.mkdir('artifacts/social-posts/exports',{recursive:true});
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download=await pending;const bytes=await fs.readFile(await download.path());
 expect(bytes.readUInt32BE(16)).toBe(1080);await fs.writeFile(`artifacts/social-posts/exports/element-layer-${info.project.name}.png`,bytes);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
