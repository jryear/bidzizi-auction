// Native navigation scaffolding only. No auth, request, fixture or application substitutions.
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {preview,stored,bounded} from '../browser.mjs';

async function entryState(admin,ms){
 const state=await admin.locator('body').evaluate((body,ms)=>new Promise(resolve=>{
  let timer;const ready=()=>{const home=document.querySelector('#events-home'),editor=document.querySelector('[data-event="name"]');const status=document.querySelector('#events-status');const completedHome=home&&status&&!/^Loading events/i.test(status.textContent.trim());if(completedHome||editor){clearTimeout(timer);observer.disconnect();resolve({home:Boolean(completedHome),editor:Boolean(editor)});}};
  const observer=new MutationObserver(ready);observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});
  timer=setTimeout(()=>{observer.disconnect();resolve({home:false,editor:false});},ms);ready();
 }),ms);
 assert.ok(state.home||state.editor,'Native staff entry must reach Events home or the existing authorized Event editor');return state;
}
export async function selectExistingEvent(page,admin,packet){
 const deadline=Date.now()+8000,left=()=>Math.max(1,deadline-Date.now());
 return bounded((async()=>{const state=await entryState(admin,left());
 if(state.home){
  const card=admin.locator('#events-home [data-action="switch-event"][data-id="'+packet.event.id+'"]');
  assert.equal(await card.count(),1,'Events home must contain exactly the actual authorized event UID');
  assert.ok(await card.isVisible(),'Authorized event card must be visible');
  assert.ok(await card.isEnabled(),'Authorized event card must be enabled');
  assert.ok((await card.innerText()).includes(packet.event.name),'Authorized event card has its actual saved identity');
  await card.click({timeout:left()});
 }
 await expect(admin.locator('[data-event="name"]')).toHaveValue(packet.event.name,{timeout:left()});
 assert.equal(await admin.locator('#org-name').innerText(),packet.org.name,'Selected editor must retain actual authorized organization');
 assert.equal(await admin.locator('#event-title').innerText(),packet.event.name,'Selected editor must retain actual saved event identity');
 if(state.home){
  await expect(admin.locator('#catalog-approval')).not.toHaveText('Checking approval…',{timeout:left()});
  await bounded(admin.locator('body').evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));await Promise.resolve();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}),'Completed native event selection task/frame flush',left());
  assert.equal(new URL(await page.evaluate(()=>location.href)).searchParams.get('event'),packet.event.id,'Completed native Events selection must write the real event UID');
 }
 assert.equal(await admin.locator('[data-event="name"]').inputValue(),packet.event.name,'Completed selection still belongs to the actual requested event');
 assert.equal(await admin.locator('#org-name').innerText(),packet.org.name,'Completed selection still belongs to the authorized organization');
 })(),'Native authorized Event selection total deadline',left());
}
export async function installPacketObservation(context){
 await context.addInitScript(()=>{window.__workspacePackets=[];addEventListener('message',ev=>{if(ev.origin===location.origin&&ev.source===parent&&ev.data?.type==='staff-draft-preview')window.__workspacePackets.push(structuredClone(ev.data));});});
}
export async function observeRestoredCatalog(f,staff,page,admin,packet){
 await expect(admin.locator('#saved')).toHaveText('Saved');
 assert.equal(new URL(page.url()).searchParams.get('event'),packet.event.id,'Reload retains exact authorized event UID');
 assert.equal(await admin.locator('#event-title').innerText(),packet.event.name,'Reload retains saved event identity before Event reselection');
 assert.equal(await admin.locator('#org-name').innerText(),packet.org.name,'Reload retains authorized organization before Event reselection');
 const observed=await admin.locator('body').evaluate(()=>({hash:location.hash,tabs:Array.from(document.querySelectorAll('[data-tab][aria-current="page"]'),el=>el.dataset.tab)}));
 assert.equal(observed.tabs.length,1,'Reload has exactly one truthful selected management tab');
 assert.ok(['event','lots'].includes(observed.tabs[0]));
 assert.equal(observed.tabs[0],observed.hash.startsWith('#/lots')?'lots':'event','Actual inner URL and management tab agree');
 const outer=new URL(page.url());if(outer.searchParams.has('tab'))assert.equal(observed.tabs[0],outer.searchParams.get('tab'),'Declared outer management tab agrees with actual restored tab');
 const response=await f.request('/api/admin/events/'+packet.event.id,{cookie:staff.cookie});assert.equal(response.status,200);assert.deepEqual(response.data.draft,packet,'Reload must retain complete server saved packet');
 await stored(f,packet);await preview({f,page,admin},packet,{render:false});
 console.log('NAVIGATION_OBSERVATION '+JSON.stringify({event:packet.event.id,revision:packet.revision,outerURL:page.url(),innerHash:observed.hash,tab:observed.tabs[0],completePacketAndSQL:true}));
}
