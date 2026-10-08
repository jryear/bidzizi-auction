import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,expect} from '@playwright/test';
import {HarnessError,browserFailure} from '../staging-manual-bid/harness.mjs';
import {profile,demoPath,login,fresh,readEntry,setEntry,publishThroughStaff} from '../staging-staff-event-entry/setup.mjs';

import {preserveErrorSite} from './oracles.mjs';

const storageKey=id=>'bz:demo-entry-slot:v1:'+id;
async function deadline(promise,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new HarnessError(message)),20_000))]);}finally{clearTimeout(timer);}}
async function browser(run,viewport={width:1280,height:900}){
 let b;try{b=await chromium.launch({headless:true});}catch{throw new HarnessError('Independent Chromium unavailable');}
 try{return await run(b,viewport);}catch(e){throw preserveErrorSite(browserFailure(e),e);}finally{await b.close();}
}
async function staffUI(b,f,t,viewport){
 const context=await b.newContext({viewport,permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
 await page.goto(f.origin+'/admin',{waitUntil:'domcontentloaded',timeout:20_000});
 const frame=page.frameLocator('iframe[title="BidZizi admin workspace"]');
 await frame.getByLabel('Test account',{exact:true}).selectOption('staff-saturn');await frame.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(frame.getByRole('heading',{name:'Events',exact:true})).toBeVisible();
 await frame.getByText(t.name,{exact:true}).click();
 await frame.locator('[data-tab="event"]').click();
 const panel=frame.locator('[data-event-entry]');await expect(panel).toBeVisible();
 return {context,page,frame,panel};
}
async function target(f,{enabled=true,published=false}={}){const staff=await login(f),t=await fresh(f,staff);if(published)await publishThroughStaff(f,staff,t);if(enabled)assert.equal((await setEntry(f,staff,t.eventId,0,true)).status,200);return {staff,...t};}
async function attendee(b,f,t){const context=await b.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(f.origin+'/events/'+t.eventId,{waitUntil:'domcontentloaded',timeout:20_000});await expect(page.getByRole('heading',{name:'Create your demo profile'})).toBeVisible();return {context,page};}
async function fill(ui){for(const [label,value] of [['Your name',profile.name],['Business name',profile.businessName],['Member ID',profile.memberId]])await ui.page.getByLabel(label,{exact:true}).fill(value);}
async function session(ui,f){const r=await ui.page.request.get(f.origin+'/api/session');assert.equal(r.status(),200);return await r.json();}
async function heldAck(ui){
 let release,reached;const gate=new Promise(r=>release=r),hit=new Promise(r=>reached=r);
 await ui.page.route('**/api/demo/events/*/acknowledge',async route=>{reached(route.request().postDataJSON());await gate;await route.continue();},{times:1});
 await fill(ui);await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();
 const intent=await deadline(hit,'Native ACK hold did not reach declared seam');
 return {release,intent};
}
async function pending(ui,id){return await ui.page.evaluate(key=>sessionStorage.getItem(key),storageKey(id));}
async function shown(ui,personId){await expect(ui.page.locator('[data-catalog-phase]')).toBeVisible();await expect(ui.page.locator('[data-bidder-person]')).toHaveAttribute('data-bidder-person',personId);}

async function paintedPrivatePhone(ui,personId,png){
 await ui.page.bringToFront();await shown(ui,personId);
 await ui.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const observe=()=>ui.page.evaluate(()=>{
  const markers=[...document.querySelectorAll('[data-catalog-phase][data-bidder-person]')],el=markers[0],rect=el?.getBoundingClientRect(),style=el?getComputedStyle(el):null;
  return {visibilityState:document.visibilityState,hasFocus:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight},chooserCount:[...document.querySelectorAll('h1,h2')].filter(h=>h.textContent.trim()==='Choose a test account').length,markerCount:markers.length,
   marker:el?{phase:el.dataset.catalogPhase,personId:el.dataset.bidderPerson,bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},visible:rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0,withinViewport:rect.left<innerWidth&&rect.right>0&&rect.top<innerHeight&&rect.bottom>0}:null};
 });
 const validate=state=>{assert.equal(state.visibilityState,'visible');assert.equal(state.chooserCount,0);assert.equal(state.markerCount,1);assert.equal(state.marker?.personId,personId);assert.ok(state.marker?.phase);assert.equal(state.marker?.visible,true);assert.equal(state.marker?.withinViewport,true);};
 const path=png.replace(/\.png$/,'.paint-witness.json'),witness={expectedPersonId:personId,before:await observe()};
 await writeFile(path,JSON.stringify(witness,null,2)+'\n',{flag:'wx'});validate(witness.before);
 await ui.page.screenshot({path:png});witness.pngSha256=createHash('sha256').update(await readFile(png)).digest('hex');witness.after=await observe();
 await writeFile(path,JSON.stringify(witness,null,2)+'\n');validate(witness.after);
 return {path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),pngPath:png,pngSha256:witness.pngSha256};
}

export const native={
 async NATIVE_STAFF_ENABLE_SHARE_QR(f,output){return await browser(async(b,viewport)=>{
  const t=await target(f,{enabled:false}),ui=await staffUI(b,f,t,viewport);
  try{
   await expect(ui.panel).toHaveAttribute('data-entry-state','disabled');await ui.panel.getByRole('button',{name:'Enable event entry',exact:true}).click();await expect(ui.panel).toHaveAttribute('data-entry-state','enabled');
   const link=ui.panel.getByLabel('Event link',{exact:true});assert.equal(await link.inputValue(),f.origin+'/events/'+t.eventId);
   // One native click revalidates current entry asynchronously before clipboard write.
   const copyBy=Date.now()+20_000,copyRead=ui.page.waitForResponse(r=>r.request().method()==='GET'&&r.url()===f.origin+'/api/admin/events/'+t.eventId+'/entry',{timeout:20_000});
   await ui.panel.getByRole('button',{name:'Copy event link',exact:true}).click();
   const copyResponse=await copyRead;assert.equal(copyResponse.status(),200);let copyBodyTimer;
   try{assert.equal(await Promise.race([copyResponse.finished(),new Promise((_,reject)=>copyBodyTimer=setTimeout(()=>reject(new HarnessError('Current-entry copy response did not settle')),Math.max(1,copyBy-Date.now())))]),null);}finally{clearTimeout(copyBodyTimer);}
   await expect.poll(()=>ui.page.evaluate(()=>navigator.clipboard.readText()),{timeout:Math.max(1,copyBy-Date.now())}).toBe(f.origin+'/events/'+t.eventId);
   assert.equal(await ui.page.evaluate(()=>navigator.clipboard.readText()),f.origin+'/events/'+t.eventId);
   const png=join(output,'fresh-event-entry-qr.png');await ui.panel.getByRole('img',{name:'Event entry QR code',exact:true}).screenshot({path:png});
   const decoded=spawnSync('/usr/bin/xcrun',['swift',fileURLToPath(new URL('../staging-staff-event-entry/decode-qr.swift',import.meta.url)),png],{cwd:f.repo,encoding:'utf8',timeout:45_000,maxBuffer:128*1024,env:{PATH:'/usr/bin:/bin',HOME:f.scratch,TMPDIR:f.scratch,CLANG_MODULE_CACHE_PATH:join(f.scratch,'clang-cache'),SWIFT_MODULECACHE_PATH:join(f.scratch,'swift-cache')}});
   if(decoded.error||decoded.status===99||(decoded.status!==0&&decoded.stderr.trim()!=='QR_PIXELS_UNDECODABLE'))throw new HarnessError('Independent native QR decoder unavailable');
   assert.equal(decoded.status,0,'Rendered QR pixels must decode');assert.equal(decoded.stdout.trim(),f.origin+'/events/'+t.eventId);
   await ui.page.screenshot({path:join(output,'staff-enable-share-desktop.png')});const read=await readEntry(f,t.staff,t.eventId);assert.equal(read.data.entry.enabled,true);
   const guest=await attendee(b,f,t);try{await guest.page.screenshot({path:join(output,'shared-fresh-event-profile-phone.png')});assert.equal((await session(guest,f)).authenticated,false);}finally{await guest.context.close();}
   return {staffNativeEnable:true,clipboardExactEventURL:true,renderedQRDecoded:true,sharedFreshSignup:true};
  }finally{await ui.context.close();}
 });},
 async NATIVE_HELD_LOST_CONTROL(f,output){return await browser(async(b,viewport)=>{
  const t=await target(f,{enabled:false}),ui=await staffUI(b,f,t,viewport);let release,reached;const gate=new Promise(r=>release=r),hit=new Promise(r=>reached=r);const intents=[];
  try{
   await ui.page.route('**/api/admin/events/*/entry',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    intents.push(route.request().postDataJSON());if(intents.length===1){reached();await gate;await route.fetch();await route.abort();}else await route.continue();
   });
   await ui.panel.getByRole('button',{name:'Enable event entry',exact:true}).click();await deadline(hit,'Control request not observed');
   try{await expect(ui.panel).toHaveAttribute('data-entry-state','saving');await expect(ui.panel.getByRole('button',{name:'Copy event link',exact:true})).toBeDisabled();assert.equal((await readEntry(f,t.staff,t.eventId)).data.entry.enabled,false);}finally{release();}
   await expect(ui.panel).toHaveAttribute('data-entry-state','uncertain');await expect(ui.panel.getByRole('button',{name:'Copy event link',exact:true})).toBeDisabled();
   await ui.page.screenshot({path:join(output,'staff-entry-uncertain-desktop.png')});await ui.panel.getByRole('button',{name:'Check entry update',exact:true}).click();await expect(ui.panel).toHaveAttribute('data-entry-state','enabled');
   assert.equal(intents.length,2);assert.deepEqual(intents[1],intents[0],'Lost response retries original exact body/request UUID');
   const rows=(await f.db.query('SELECT request_id FROM bz_staff_event_entry_requests WHERE event_id=$1',[t.eventId])).rows;assert.equal(rows.length,1);assert.equal(rows[0].request_id,intents[0].requestId);
   return {heldNotEnabled:true,lostResponseUncertain:true,exactOriginalRetry:true,durableOnce:true};
  }finally{release?.();await ui.context.close();}
 });},
 async NATIVE_TWO_BROWSER_PRIVATE(f,output){return await browser(async b=>{
  const t=await target(f,{published:true}),left=await attendee(b,f,t),right=await attendee(b,f,t);
  try{
   await fill(left);await fill(right);await Promise.all([left.page.getByRole('button',{name:'Enter demo event',exact:true}).click(),right.page.getByRole('button',{name:'Enter demo event',exact:true}).click()]);
   await expect(left.page.locator('[data-catalog-phase]')).toBeVisible();await expect(right.page.locator('[data-catalog-phase]')).toBeVisible();const a=await session(left,f),c=await session(right,f);assert.notEqual(a.person.id,c.person.id);assert.deepEqual(a.staffOrganizations,[]);assert.deepEqual(c.staffOrganizations,[]);
   await shown(left,a.person.id);await shown(right,c.person.id);await left.page.reload();await shown(left,a.person.id);assert.equal((await session(left,f)).person.id,a.person.id);
   const paintWitnesses=[await paintedPrivatePhone(left,a.person.id,join(output,'fresh-attendee-left-phone.png')),await paintedPrivatePhone(right,c.person.id,join(output,'fresh-attendee-right-phone.png'))];
   const beforeRight=(await session(right,f)).person.id;await left.page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal((await session(left,f)).authenticated,false);assert.equal((await session(right,f)).person.id,beforeRight);
   return {matchingClaimsDistinctPrivateBrowsers:true,refreshContinuity:true,logoutIsolated:true,paintWitnesses};
  }finally{await left.context.close();await right.context.close();}
 });},
 async NATIVE_DISABLED_ACK_REENABLE_RECOVERY(f,output){return await browser(async b=>{
  const t=await target(f,{published:true}),ui=await attendee(b,f,t);let hold;
  try{
   hold=await heldAck(ui);const person=(await session(ui,f)).person.id,uuid=await pending(ui,t.eventId);assert.equal(uuid,hold.intent.entryId);
   assert.equal((await setEntry(f,t.staff,t.eventId,1,false)).status,200);hold.release();await expect(ui.page.getByRole('button',{name:'Check entry',exact:true})).toBeVisible();assert.equal(await ui.page.locator('iframe').count(),0);
   const actualAck=await ui.page.request.post(f.origin+demoPath(t.eventId)+'/acknowledge',{data:{entryId:uuid},headers:{origin:f.origin}});assert.equal(actualAck.status(),404);
   const beforeCookies=(await ui.context.cookies()).filter(c=>c.name==='bz_session'||c.name==='bz_demo_entry_'+uuid);
   await ui.page.getByRole('button',{name:'Check entry',exact:true}).click();await expect(ui.page.getByRole('alert')).toContainText(/unavailable|could not|retry|recover/i);assert.equal(await ui.page.locator('iframe').count(),0);
   const after=await session(ui,f),catalog=await ui.page.request.get(f.origin+'/api/catalog/events/'+t.eventId),ctx=await ui.page.request.get(f.origin+'/api/bidder/events/'+t.eventId+'/context');
   const row=(await f.db.query('SELECT consumed_at FROM bz_demo_entry_slots WHERE id=$1',[uuid])).rows[0];assert.equal(row.consumed_at,null);
   assert.deepEqual((await ui.context.cookies()).filter(c=>c.name==='bz_session'||c.name==='bz_demo_entry_'+uuid),beforeCookies,'Disabled ACK does not reissue/clear private credentials');
   assert.equal(after.person.id,person);assert.equal(catalog.status(),200);assert.equal(ctx.status(),200);assert.equal(await pending(ui,t.eventId),uuid);
   assert.equal(await ui.page.getByRole('button',{name:'Continue with current profile',exact:true}).count(),0,'Deferred continuation action is outside initial D1');
   await ui.page.screenshot({path:join(output,'disabled-entry-ack-recovery-phone.png')});
   assert.equal((await setEntry(f,t.staff,t.eventId,2,true)).status,200);await ui.page.getByRole('button',{name:'Check entry',exact:true}).click();await shown(ui,person);assert.equal(await pending(ui,t.eventId),null);assert.ok((await f.db.query('SELECT consumed_at FROM bz_demo_entry_slots WHERE id=$1',[uuid])).rows[0].consumed_at);
   await ui.page.screenshot({path:join(output,'reenabled-entry-same-profile-phone.png')});return {disabledAckTruthfulRecovery:true,reEnableRequired:true,pendingIdentityRetained:true,sameOriginalSessionAfterAck:true};
  }finally{hold?.release();await ui.context.close();}
 });}
};
