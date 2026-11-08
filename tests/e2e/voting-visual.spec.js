import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

let token;
const worker = process.env.SPILL_E2E_WORKER_URL;
async function api(path, body) {
  const response = await fetch(worker + path, { method: body ? 'POST' : 'GET', headers: {
    Authorization: `Bearer ${process.env.SPILL_E2E_API_SECRET}`, 'X-Admin-Token': token || '', 'Content-Type': 'application/json',
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}
async function create(long = false) {
  return (await api('/admin/voting', { title: 'A shared perspective', questions: [{
    text: long ? 'How can we create a thoughtful space where every perspective is heard and everyone feels able to take part?' : 'What matters most?',
    options: long ? ['Listening with patience and making room for different perspectives'.repeat(2).slice(0,120), 'Building a welcoming community together', 'Taking time for thoughtful reflection'] : ['Listening', 'Community', 'Reflection'],
  }] })).event;
}
async function change(event, action, fields = {}) {
  const latest = (await api(`/admin/voting/${event.id}`)).event;
  return (await api(`/admin/voting/${event.id}`, { action, expectedRevision: latest.revision, ...fields })).event;
}
async function cast(event, option = 0) {
  return api(`/voting/${event.code}/vote`, { participant_id: crypto.randomUUID(), questionId: event.questions[0].id, optionId: event.questions[0].options[option].id });
}
async function accessible(page) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(report.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}
test.beforeAll(async () => {
  requireLocalMutationTarget(test);
  token = (await api('/admin/auth/login', { password: E2E.adminPassword })).token;
});

test('moderators create and edit private drafts, preview, open and configure voting', async ({ page, context }) => {
  await context.addCookies([{name:'spill_admin_session',value:token,url:E2E.baseURL,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/admin/voting');
  await page.getByText('Create a voting event',{exact:true}).click();
  await page.getByLabel('Voting event title',{exact:true}).fill('A moderator-created vote');
  await page.getByLabel('Voting question',{exact:true}).fill('What should we discuss?');
  await page.getByLabel('Answer choice 1',{exact:true}).fill('Listening');
  await page.getByLabel('Answer choice 2',{exact:true}).fill('Belonging');
  await page.getByRole('button',{name:'Create voting event',exact:true}).click();
  await page.waitForURL(/\/admin\/voting\/[0-9a-f-]+$/);
  await page.getByLabel('Voting event title',{exact:true}).fill('A refined vote');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A refined vote',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Preview voter experience',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close preview',exact:true}).click();
  await page.getByRole('button',{name:'Open voting',exact:true}).click();
  await expect(page.getByRole('button',{name:'Close voting',exact:true})).toBeVisible();
  await page.getByLabel('Results display mode').selectOption('live');
  await expect(page.getByRole('button',{name:'Project Live Results',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Project Live Results',exact:true}).click();
  await page.getByLabel('Visualization style').selectOption('donut');
  await expect(page.locator('[data-voting-visualization]')).toHaveAttribute('data-voting-visualization','donut');
  await accessible(page);
});

test('mobile voting needs no nickname, retries survive reload, and controls are accessible', async ({ page }) => {
  const event = await create(); await change(event, 'open');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/vote/${event.code}`);
  await expect(page.getByRole('heading', { name: 'What matters most?' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await accessible(page);
  await expect(page).toHaveScreenshot('voting-mobile.png');
  await page.getByRole('radio', { name: 'Listening', exact: true }).check();
  await page.getByRole('button', { name: 'Submit vote', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your voice is in.' })).toBeVisible();
  await page.reload();
  await page.getByRole('radio', { name: 'Listening', exact: true }).check();
  await page.getByRole('button', { name: 'Submit vote', exact: true }).click();
  await expect(page.getByText('Vote received for this browser.', { exact: true })).toBeVisible();
  expect((await api(`/admin/voting/${event.id}`)).event.questions[0].totalVotes).toBe(1);
  const forged = await page.evaluate(async ({code,questionId,optionId}) => (await fetch(`/api/voting/public/${code}/vote`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId,optionId,participant_id:crypto.randomUUID()})})).status,
    {code:event.code,questionId:event.questions[0].id,optionId:event.questions[0].options[1].id});
  expect(forged).toBe(409);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('four result styles switch live without replay, reconnect, and preserve accurate totals', async ({ page, context }, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const event = await create(true); await change(event, 'open');
  await change(event, 'settings', { settings: { resultsMode: 'live' } });
  await change(event, 'present', { questionId: event.questions[0].id, content: 'results' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/vote/${event.code}/stage`);
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','0');
  await expect(page.getByText('No votes recorded yet. Every voice starts here.')).toBeVisible();
  await Promise.all([cast(event,0),cast(event,1),cast(event,2)]);
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','3');
  await expect(page.getByText('Tied lead', { exact: false })).toBeVisible();
  for (const style of ['bars','rows','donut','comparison']) {
    await change(event,'settings',{settings:{visualization:style}});
    const chart = page.locator('[data-voting-visualization]');
    await expect(chart).toHaveAttribute('data-voting-visualization',style);
    await chart.evaluate(element => { element.dataset.retained = 'yes'; });
    await cast(event,0);
    await expect(chart).toHaveAttribute('data-retained','yes');
    await expect(chart).toHaveAttribute('data-vote-total',String(4+['bars','rows','donut','comparison'].indexOf(style)));
    await accessible(page);
    await expect.poll(()=>page.locator('.voting-result-summary p span[aria-hidden="true"]').first().textContent()).toBe(String(4+['bars','rows','donut','comparison'].indexOf(style)));
    await page.waitForTimeout(850);
    await expect(page).toHaveScreenshot(`voting-${style}.png`);
    await info.attach(`voting-${style}.png`,{body:await page.screenshot(),contentType:'image/png'});
  }
  await context.setOffline(true);
  await expect(page.getByText('Reconnecting · displayed information may be stale')).toBeVisible();
  await cast(event,1);
  await context.setOffline(false);
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','8');
  await expect(page.getByText('Reconnecting · displayed information may be stale')).toBeHidden();
  const publicSnapshot = await api(`/voting/${event.code}`);
  const old = structuredClone(publicSnapshot);
  old.event.version -= 1; old.event.questions[0].totalVotes = 0;
  let staleResponses=0;
  await page.route(`**/api/voting/public/${event.code}`,async route=>{staleResponses++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(old)});});
  await expect.poll(()=>staleResponses).toBeGreaterThan(0);
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','8');
  await page.unroute(`**/api/voting/public/${event.code}`);
  await change(event,'settings',{settings:{resultsMode:'hidden'}});
  await expect(page.locator('[data-vote-total]')).toHaveCount(0);
  await expect(page.getByText('Result updates are paused. Earlier results were publicly visible.')).toBeVisible();
  await change(event,'close');
  await page.evaluate(() => {
    window.finalRevealSamples=[];window.sampleReveal=true;
    const sample=()=>{const value=document.querySelector('.voting-result-summary p span[aria-hidden="true"]');if(value)window.finalRevealSamples.push(Number(value.textContent));if(window.sampleReveal)requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  await change(event,'present',{questionId:event.questions[0].id,content:'results',reveal:true});
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','8');
  await expect.poll(()=>page.locator('.voting-result-summary p span[aria-hidden="true"]').first().textContent()).toBe('8');
  const samples=await page.evaluate(()=>{window.sampleReveal=false;return window.finalRevealSamples;});
  expect(Math.min(...samples)).toBeLessThan(8);
  await page.locator('[data-vote-total]').evaluate(element=>{element.dataset.retained='final';});
  await page.waitForTimeout(2400);
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-retained','final');
  const reveal = await page.locator('[data-voting-stage]').getAttribute('data-reveal-id');
  await page.reload();
  await expect(page.locator('[data-voting-stage]')).toHaveAttribute('data-reveal-id',reveal);
  await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','8');
  await change(event,'archive');
  await expect(page.locator('[data-vote-total]')).toHaveCount(0);
  await expect(page.locator('.voting-stage-empty[role="alert"]')).toHaveText('Voting event not found.');
});

test('long result labels fit all projector resolutions and narrow mobile', async ({ page }, info) => {
  test.setTimeout(120000);
  const event=await create(true); await change(event,'open');
  await change(event,'settings',{settings:{resultsMode:'live'}});
  await change(event,'present',{questionId:event.questions[0].id,content:'results'});
  await cast(event);
  for(const [width,height] of [[320,740],[1280,720],[1366,768],[1920,1080],[2560,1440],[3840,2160]]){
    await page.setViewportSize({width,height}); await page.goto(`/vote/${event.code}/stage`);
    await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','1');
    expect(await page.evaluate(()=>({page:document.documentElement.scrollWidth<=innerWidth,main:document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth+1}))).toEqual({page:true,main:true});
    await info.attach(`voting-${width}x${height}.png`,{body:await page.screenshot(),contentType:'image/png'});
  }
});
