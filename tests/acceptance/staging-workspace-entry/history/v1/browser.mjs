import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {HarnessError} from './harness.mjs';
import {compact,eventKeys,lotKeys} from './protocol.mjs';
export {expect};
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
export async function bounded(p,label,ms=8000){let t;try{return await Promise.race([p,new Promise((_,reject)=>t=setTimeout(()=>reject(new HarnessError(label+' internal deadline')),ms))]);}finally{clearTimeout(t);}}
export async function browserFixture(f,packet,fn,{account='staff-saturn',viewport={width:1440,height:900},holdApproval=false}={}){
 let browser;try{browser=await chromium.launch({headless:true});}catch(e){throw new HarnessError('Installed Chromium unavailable: '+e.message);}
 const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(8000);expect.setState?.({timeout:8000});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__workspacePackets=[];addEventListener('message',ev=>{if(ev.origin===location.origin&&ev.source===parent&&ev.data?.type==='staff-draft-preview')window.__workspacePackets.push(structuredClone(ev.data));});});
 try{
  const ui={f,page,context,errors,admin:page.frameLocator('iframe[title="BidZizi admin workspace"]')};
  if(holdApproval)await holdApproval(ui);
  await page.goto(f.origin+'/admin?event='+packet.event.id,{waitUntil:'domcontentloaded'});
  await ui.admin.getByLabel('Test account',{exact:true}).selectOption(account);await ui.admin.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(packet.event.name);
  await expect(ui.admin.locator('#saved')).toHaveText('Saved');
  ui.frame=page.frames().find(x=>x.url().includes('/staging-admin/index.html'));assert.ok(ui.frame);
  if(!holdApproval)await expect(ui.admin.locator('#catalog-approval')).not.toHaveText('Checking approval…');
  await fn(ui);
 }finally{await context.close();await browser.close();}
}
export async function stored(f,packet){
 const event=(await f.db.query('SELECT org_id,revision,draft FROM bz_events WHERE id=$1',[packet.event.id])).rows;
 const lots=(await f.db.query('SELECT id,event_id,org_id,position,data FROM bz_lots WHERE event_id=$1 ORDER BY position',[packet.event.id])).rows;
 assert.equal(event.length,1);assert.equal(event[0].org_id,packet.org.id);assert.equal(event[0].revision,packet.revision);assert.deepEqual(event[0].draft,compact(packet).event);
 assert.deepEqual(lots.map(l=>l.position),packet.lots.map((_,i)=>i));assert.deepEqual(lots.map(l=>l.id),packet.lots.map(l=>l.id));assert.ok(lots.every(l=>l.org_id===packet.org.id&&l.event_id===packet.event.id));assert.deepEqual(lots.map(l=>l.data),compact(packet).lots);
}
export async function preview(ui,packet,{render=true}={}){
 const {page,admin}=ui;await expect(admin.locator('#preview-mode-label')).toHaveText('Saved draft · revision '+packet.revision);
 const frame=page.frames().find(x=>x.url().includes('/staging-bidder-preview/index.html'));assert.ok(frame,'Actual saved A iframe exists');assert.equal(new URL(frame.url()).origin,ui.f.origin);
 await expect.poll(()=>frame.evaluate(()=>window.__workspacePackets.at(-1)?.payload?.revision),{timeout:8000}).toBe(packet.revision);
 const captured=await frame.evaluate(()=>window.__workspacePackets.at(-1)?.payload);assert.equal(captured.mode,'saved');assert.deepEqual(captured.org,packet.org);assert.deepEqual(captured.event,packet.event);assert.deepEqual(captured.lots,packet.lots);
 if(!render)return;
 await admin.locator('[data-action="preview-route"][data-path="/"]').click();await expect(frame.locator('h1')).toContainText(packet.event.name);
 const body=await frame.locator('body').innerText();assert.ok(body.includes(packet.event.welcome));assert.ok(body.includes(packet.org.name));assert.ok(body.includes(packet.event.venue));assert.ok(body.includes(packet.event.eyebrow));
 await expect(frame.locator('img').first()).toBeVisible();
 for(const lot of packet.lots){
  await admin.locator('[data-action="preview-route"][data-path="/lots"]').click();await frame.locator('a[href="#/lot/'+lot.id+'"]').first().click();
  const detail=frame.locator('main[data-lot="'+lot.id+'"]');await expect(detail.locator('h1')).toHaveText(lot.title);
  for(const text of [lot.description,lot.fine,...lot.includes])assert.ok((await detail.innerText()).includes(text),'Rendered complete lot text: '+text);
  await expect(detail.locator('.hero img')).toHaveAttribute('src',new RegExp(lot.image.replaceAll('.','\\.')));
  assert.equal(await detail.locator('[data-action="bid"]:not([disabled])').count(),0);
 }
}
export async function switchTo(ui,packet){await ui.admin.getByRole('button',{name:/^Event studio/}).click();await ui.admin.locator('[data-action="switch-event"][data-id="'+packet.event.id+'"]').click();await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(packet.event.name);await expect(ui.admin.locator('#catalog-approval')).not.toHaveText('Checking approval…');}
export async function assertContext(ui,packet){await expect(ui.admin.locator('#org-name')).toHaveText(packet.org.name);await expect(ui.admin.locator('#event-title')).toHaveText(packet.event.name);await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(packet.event.name);await preview(ui,packet,{render:false});}
export async function navOracle(ui){
 const {admin,frame}=ui;const nav=admin.getByRole('navigation',{name:'Event Studio',exact:true});assert.equal(await nav.count(),1,'NAV_WORKSPACE_ABSENT: exactly one new Event Studio navigation');
 assert.equal(await admin.getByRole('link',{name:'Event',exact:true}).count(),1,'Duplicate Event compatibility controls forbidden');assert.equal(await admin.getByRole('link',{name:/^Lots(?:\s+\d+)?$/}).count(),1,'Duplicate Lots compatibility controls forbidden');
 assert.equal(await nav.getByRole('link',{name:'Event',exact:true}).count(),1);assert.equal(await nav.getByRole('link',{name:/^Lots/}).count(),1);
 const n=await nav.boundingBox(),main=await admin.locator('#main').boundingBox();assert.ok(n&&main);assert.ok(n.x+n.width<=main.x+2,'Renamed-only horizontal nav is not selected workspace sidebar');assert.ok(n.height>=120,'Selected navigation has meaningful sidebar composition');
 await nav.getByRole('link',{name:/^Lots/}).click();await expect(admin.locator('[data-tab="lots"]')).toHaveAttribute('aria-current','page');await nav.getByRole('link',{name:'Event',exact:true}).click();await expect(admin.locator('[data-event="name"]')).toBeVisible();
 assert.ok(await frame.evaluate(()=>document.querySelector('[aria-label="Event Studio"]')?.getBoundingClientRect().width>0));
}
