import { expect, test } from '@playwright/test';
import { E2E, requireLocalMutationTarget } from '../helpers/e2e-env.js';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
for (const motion of ['no-preference','reduce']) {
  test(`4K voting charts scheduling and stationary labels · ${motion}`, async ({ page }, info) => {
    test.setTimeout(120000); requireLocalMutationTarget(test);
    let token='';
    async function api(path,body){const response=await fetch(process.env.SPILL_E2E_WORKER_URL+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${process.env.SPILL_E2E_API_SECRET}`,'X-Admin-Token':token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});expect(response.status).toBe(200);return response.json();}
    token=(await api('/admin/auth/login',{password:E2E.adminPassword})).token;
    let event=(await api('/admin/voting',{title:'Disposable chart profile',questions:[{text:'What helps us listen?',options:['Patience','Curiosity','Kindness']}]})).event;
    async function change(action,fields={}){event=(await api(`/admin/voting/${event.id}`,{action,expectedRevision:event.revision,...fields})).event;}
    await change('open');await change('settings',{settings:{resultsMode:'live'}});await change('present',{questionId:event.questions[0].id,content:'results'});
    await Promise.all([0,1,2].map(index=>api(`/voting/${event.code}/vote`,{participant_id:crypto.randomUUID(),questionId:event.questions[0].id,optionId:event.questions[0].options[index].id})));
    await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:3840,height:2160});
    await page.goto(`/vote/${event.code}/stage`);await expect(page.locator('[data-vote-total]')).toHaveAttribute('data-vote-total','3');
    await expect(page.locator('[data-ambient-quality]')).toHaveAttribute('data-ambient-quality',/^(quiet|full)$/);
    for(const style of ['bars','rows','donut','comparison']){
      await change('settings',{settings:{visualization:style}});
      await expect(page.locator('[data-voting-visualization]')).toHaveAttribute('data-voting-visualization',style);
      await page.waitForTimeout(1000);
      await page.evaluate(()=>new Promise(resolve=>{let frames=0;const tick=()=>++frames>=30?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}));
      const report=await page.evaluate(()=>new Promise(resolve=>{
        const intervals=[],longTasks=[];let first,last;
        const labels=[...document.querySelectorAll('.voting-result-label')];
        const before=labels.map(node=>node.getBoundingClientRect().y);
        const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')?new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(item=>item.duration))):null;
        observer?.observe({entryTypes:['longtask']});
        const tick=at=>{first??=at;if(last!==undefined)intervals.push(at-last);last=at;if(at-first<2000)return requestAnimationFrame(tick);
          observer?.disconnect();const sorted=[...intervals].sort((a,b)=>a-b);
          resolve({frames:intervals.length,durationMs:at-first,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],over50Ms:intervals.filter(value=>value>50).length,longTasks,labelsStationary:labels.every((node,index)=>Math.abs(node.getBoundingClientRect().y-before[index])<.1),quality:document.querySelector('[data-ambient-quality]').dataset.ambientQuality});};requestAnimationFrame(tick);
      }));
      expect(report.labelsStationary).toBe(true);expect(report.frames).toBeGreaterThan(0);
      if(motion==='reduce')expect(await page.locator('.stage-watermark').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
      await info.attach(`chart-profile-${style}-${motion}.json`,{body:JSON.stringify(report,null,2),contentType:'application/json'});
      console.log(JSON.stringify({voting4KProfile:{style,motion,...report,measurement:'Headless Chromium RAF scheduling, not a physical projector or GPU benchmark'}}));
    }
  });
}
