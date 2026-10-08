import {oracles,clean,current,onlySelected,cleared} from './oracles.mjs';
export {clean,current,onlySelected,cleared} from './oracles.mjs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { prepareFixture, ids } from '../staging-manual-bid/fixtures.mjs';
import { login, post, intent, rows } from '../staging-manual-bid/protocol.mjs';

export const groups = [
 { name: 'Private board read authority, scheduled withholding and unavailable states', ids: ['DR01_PRIVATE_READ_ONLY','DR02_SCHEDULED_WITHHOLD','DR03_VIEW_STAFF_SEPARATION','DR04_EMPTY_ERROR'], run: authority },
 { name: 'Immutable selected standing, exact money, individual as-of and privacy', ids: ['DR05_SNAPSHOT_RELEASE_MATCH','DR06_NO_BID_NULL','DR07_EXACT_MONEY_ASOF_PRIVACY','DR08_CLOSED_NOT_WINNER','DR09_MALFORMED_UNSUPPORTED'], run: truth },
 { name: 'Current authority clearing, stale offline and late response isolation', ids: ['DR10_DENIED_CLEARING','DR11_STALE_OFFLINE','DR12_ACCOUNT_EVENT_LATE_ISOLATION'], run: recovery },
 { name: 'Server clock refresh, bounded visible polling and actual responsive DOM', ids: ['DR13_SERVER_PHASE_REFRESH','DR14_BOUNDED_VISIBLE_REFRESH','DR15_NATIVE_RESPONSIVE'], run: refreshLayout },
];
const main = 'main[data-private-board]';
const row = id => `[data-lot-id="${id}"]`;
const apiCatalog = event => `/api/catalog/events/${event}`;
const apiStanding = (event,lot) => `/api/bidder/events/${event}/lots/${lot}/standing`;
const need = (x,why) => { if (!x) throw Error('HARNESS99 '+why); };
const gate = () => { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; };
const flush = page => page.evaluate(()=>new Promise(done=>queueMicrotask(()=>queueMicrotask(done))));
async function deliver(r,actual){try{await r.fulfill({response:actual});}catch(e){if(!r.request().failure())throw e;}}
export async function observe(page) {
 const observation=await page.evaluate(()=>{
  const m=document.querySelector('main[data-private-board]');
  return {url:location.pathname,text:document.body.innerText,html:document.documentElement.outerHTML,boardHTML:m?.outerHTML||'',board:m?{mode:m.dataset.privateBoard,eventId:m.dataset.eventId,state:m.dataset.state,phase:m.dataset.phase}:null,
   lots:[...document.querySelectorAll('[data-lot-id]')].map(e=>({id:e.dataset.lotId,state:e.dataset.standingState,text:e.innerText,
    amount:e.querySelector('[data-current-amount]')?.textContent.trim()||null,
    asOf:e.querySelector('time[data-standing-as-of]')?.getAttribute('datetime')||null,
    asOfText:e.querySelector('time[data-standing-as-of]')?.textContent||null,
    updatedAt:e.querySelector('time[data-standing-updated-at]')?.getAttribute('datetime')||null,
    updatedText:e.querySelector('time[data-standing-updated-at]')?.textContent||null})),
   persisted:{local:JSON.stringify({...localStorage}),session:JSON.stringify({...sessionStorage})}};
 });return {...observation,pageErrors:[...(page.__displayCaseErrors||[])]};
}




async function seeded(f){
 const ready=await f.request('/api/session');need(ready.status===200&&ready.data.authenticated===false,'real session route readiness before fixture');
 await prepareFixture(f,{phase:'open'});
 await f.db.query("UPDATE bz_catalog_approvals SET closes_at=clock_timestamp()+interval '4 hours' WHERE event_id IN($1,$2,$3)",[ids.event,ids.eventOther,ids.eventPine]);
}
async function accountContext(f,account,viewport={width:1280,height:800},clock){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport}),page=await context.newPage();
 page.setDefaultTimeout(10000);const errors=[],requests=[],responses=[],active=new Set();let maxInFlight=0;page.__displayCaseErrors=errors;page.on('pageerror',e=>errors.push(e.message));
 if(account){const session=await login(f,account);await context.addCookies([{name:'bz_session',value:session.cookie.slice('bz_session='.length),url:f.origin}]);}
 if(clock){
  await page.clock.install({time:new Date(clock)});
  await page.addInitScript(()=>{
   // Observe actual browser timer requests; this does not install any app polling.
   const timers=new Map(),history=[],set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window),interval=window.setInterval.bind(window),clearInterval=window.clearInterval.bind(window);
   const tracked=(fn,delay,args,repeating)=>{let id;const watch=delay===5000||delay===30000;const callback=()=>{if(watch){if(repeating)timers.set(id,{at:Date.now(),delay,repeating});else timers.delete(id);}return fn(...args);};id=(repeating?interval:set)(watch?callback:fn,delay,...(watch?[]:args));if(watch){timers.set(id,{at:Date.now(),delay,repeating});history.push({at:Date.now(),delay,repeating});}return id;};
   window.setTimeout=(fn,delay,...args)=>tracked(fn,delay,args,false);window.setInterval=(fn,delay,...args)=>tracked(fn,delay,args,true);
   window.clearTimeout=id=>{timers.delete(id);clear(id);};window.clearInterval=id=>{timers.delete(id);clearInterval(id);};
   window.__displayTimerEvidence=()=>({now:Date.now(),timers:[...timers.values()],history:[...history]});
  });
 }
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')){requests.push({path:new URL(r.url()).pathname,method:r.method()});active.add(r);maxInFlight=Math.max(maxInFlight,active.size);}});
 page.on('requestfinished',r=>active.delete(r));page.on('requestfailed',r=>active.delete(r));
 page.on('response',async r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/')){let data;try{data=await r.json();}catch{data=null;}responses.push({path,status:r.status(),data});}});
 const releases=[];return {browser,context,page,errors,requests,responses,releases,get maxInFlight(){return maxInFlight;},get activeReads(){return active.size;},
  async close(){for(const r of releases)r();await page.unrouteAll({behavior:'wait'});await context.close();await browser.close();},
 };
}
async function go(ui,f,mode='results',event=ids.event){
 const response=await ui.page.goto(f.origin+`/events/${event}/${mode}`,{waitUntil:'domcontentloaded'});
 need(response&&response.status()<500,'reachable new HTML route');
 if(response.status()===404)return {missing:true,status:404,path:`/events/${event}/${mode}`,body:await ui.page.locator('body').innerText()};
 need(response.status()===200,'new route status');
 if(await ui.page.locator(main).count()===0)return {missing:true,status:200,path:`/events/${event}/${mode}`,reason:'Required native board DOM absent in the reached document',body:await ui.page.locator('body').innerText()};
 await settled(ui.page);return null;
}
async function settled(page){await page.waitForFunction(()=>{const m=document.querySelector('main[data-private-board]');return m&&m.getAttribute('aria-busy')!=='true'&&m.dataset.state!=='loading'&&![...m.querySelectorAll('[data-lot-id]')].some(e=>e.dataset.standingState==='loading');});await flush(page);}
async function refresh(ui){const label=await ui.page.locator(main).getAttribute('data-private-board');await ui.page.getByRole('button',{name:label==='display'?'Refresh display':'Refresh standing',exact:true}).click();await settled(ui.page);}
async function recordMissing(group,record,o){for(const id of group.ids)await record(id,{missingRoute:o},()=>assert.fail('Requested private display/results route is absent'));
}
async function withUI(f,account,fn,opts={}){const ui=await accountContext(f,account,opts.viewport,opts.clock);try{return await fn(ui);}finally{await ui.close();}}
async function reachable(f,group,record,fn){return withUI(f,'bidder-juniper',async ui=>{const resultsRoute=await go(ui,f),displayRoute=await go(ui,f,'display');if(resultsRoute||displayRoute){await recordMissing(group,record,{results:resultsRoute,display:displayRoute});return false;}await go(ui,f);await fn(ui);return true;});}
async function captureResponse(ui,path){
 const found=ui.responses.findLast(r=>r.path===path&&r.status===200);need(found?.data,'independent successful response capture '+path);return found.data;
}

async function authority(f,record){await seeded(f);await reachable(f,groups[0],record,async ui=>{
 // An absent row is a stronger read-only witness than an already allocated zero row.
 await f.db.query('DELETE FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2',[ids.release,ids.lotB]);
 const before=await rows(f),requestsStart=ui.requests.length;await refresh(ui);await go(ui,f,'display');await go(ui,f,'results');
 const after=await rows(f),o=await observe(ui.page);await record(groups[0].ids[0],{o,requests:ui.requests.slice(requestsStart),before,after},oracles.DR01_PRIVATE_READ_ONLY,ui.page);
 await go(ui,f,'display',ids.eventBefore);const scheduled=await observe(ui.page),scheduledRequests=ui.requests.filter(r=>r.path.includes(ids.eventBefore));
 await record(groups[0].ids[1],{o:scheduled,requests:scheduledRequests},oracles.DR02_SCHEDULED_WITHHOLD,ui.page);
 const scenarios=[];for(const account of ['bidder-viewer','staff-saturn','staff-pine','bidder-bid-only','bidder-unlisted','bidder-pine',null])await withUI(f,account,async test=>{for(const mode of ['display','results']){await go(test,f,mode);scenarios.push({account,mode,o:await observe(test.page),requests:[...test.requests]});}});
 await record(groups[0].ids[2],{scenarios},oracles.DR03_VIEW_STAFF_SEPARATION,ui.page);
 await go(ui,f);await ui.page.route('**'+apiCatalog(ids.event),async r=>{const actual=await r.fetch();const body=await actual.json();body.catalog.lots=[];await r.fulfill({response:actual,json:body});});await refresh(ui);const empty=await observe(ui.page);await ui.page.unrouteAll({behavior:'wait'});
 await ui.page.route('**'+apiCatalog(ids.event),r=>r.fulfill({status:503,contentType:'application/json',json:{error:{code:'UNAVAILABLE',message:'This request could not be confirmed.'}}}));await ui.page.reload({waitUntil:'domcontentloaded'});await settled(ui.page);const error=await observe(ui.page);
 await record(groups[0].ids[3],{empty,error},oracles.DR04_EMPTY_ERROR,ui.page);
 });}

async function truth(f,record){await seeded(f);await reachable(f,groups[1],record,async ui=>{
 const initial=await observe(ui.page);await f.db.query("UPDATE bz_lots SET data=jsonb_set(data,'{title}','\"PRIVATE DRAFT CHANGED\"'::jsonb) WHERE event_id=$1",[ids.event]);await refresh(ui);const updated=await observe(ui.page);
 await record(groups[1].ids[0],{initial,updated},oracles.DR05_SNAPSHOT_RELEASE_MATCH,ui.page);
 await f.db.query('DELETE FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2',[ids.release,ids.lotB]);await refresh(ui);const noBid=await observe(ui.page),absent=(await f.db.query('SELECT 1 FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2',[ids.release,ids.lotB])).rows.length;
 await record(groups[1].ids[1],{o:noBid,absent},oracles.DR06_NO_BID_NULL,ui.page);
 const actor=await login(f,'bidder-harbor'),accepted=await post(f,actor,intent(f,ids.businessHarbor,123456789));need(accepted.status===201&&accepted.data.receipt.status==='accepted','independently accepted exact cents fixture');
 await refresh(ui);const money=await observe(ui.page),packets=[];for(const lot of [ids.lotA,ids.lotB])packets.push((await captureResponse(ui,apiStanding(ids.event,lot))).standing);
 await record(groups[1].ids[2],{o:money,packets},oracles.DR07_EXACT_MONEY_ASOF_PRIVACY,ui.page);
 await f.db.query("UPDATE bz_catalog_approvals SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ids.release]);await refresh(ui);const closed=await observe(ui.page);await record(groups[1].ids[3],{o:closed,standing:(await captureResponse(ui,apiStanding(ids.event,ids.lotA))).standing},oracles.DR08_CLOSED_NOT_WINNER,ui.page);
 const malformed=[];for(const patch of [{releaseId:ids.releaseOther},{lotId:ids.lotOther},{currentAmountMinor:1.5},{currency:'EUR'},{rulesetId:'invented-v2'}]){await ui.page.route('**'+apiStanding(ids.event,ids.lotA),async r=>{const actual=await r.fetch(),body=await actual.json();Object.assign(body.standing,patch);await r.fulfill({response:actual,json:body});});await refresh(ui);malformed.push({patch,o:await observe(ui.page)});await ui.page.unrouteAll({behavior:'wait'});}
 await go(ui,f,'results',ids.eventUnsupported);const unsupported=await observe(ui.page);await record(groups[1].ids[4],{malformed,unsupported},oracles.DR09_MALFORMED_UNSUPPORTED,ui.page);
 });}

async function recovery(f,record){await seeded(f);await reachable(f,groups[2],record,async ui=>{
 const actor=await login(f,'bidder-harbor'),accepted=await post(f,actor,intent(f,ids.businessHarbor,123456789));need(accepted.status===201,'real recovery fixture bid');await refresh(ui);
 const deniedModes=[];for(const mode of ['display','results']){
  await go(ui,f,mode);await f.db.query("UPDATE bz_event_bidder_admissions SET active=false WHERE person_id=$1 AND event_id=$2",[ids.personJuniper,ids.event]);await refresh(ui);const bidRevoked=await observe(ui.page);await f.db.query("UPDATE bz_event_bidder_admissions SET active=true WHERE person_id=$1 AND event_id=$2",[ids.personJuniper,ids.event]);await refresh(ui);
  await f.grantViewer(ids.personJuniper,ids.event,false);await refresh(ui);const viewRevoked=await observe(ui.page);await f.grantViewer(ids.personJuniper,ids.event,true);await refresh(ui);
  await f.db.query("UPDATE bz_people SET active=false WHERE id=$1",[ids.personJuniper]);await refresh(ui);const sessionRevoked=await observe(ui.page);await f.db.query("UPDATE bz_people SET active=true WHERE id=$1",[ids.personJuniper]);await refresh(ui);deniedModes.push({mode,bidRevoked,viewRevoked,sessionRevoked});
 }
 await record(groups[2].ids[0],{deniedModes},oracles.DR10_DENIED_CLEARING,ui.page);
 const staleModes=[];for(const mode of ['display','results']){
  await go(ui,f,mode);const fresh=await observe(ui.page);await ui.page.route('**'+apiStanding(ids.event,ids.lotA),r=>r.fulfill({status:503,contentType:'application/json',json:{error:{code:'UNAVAILABLE',message:'This request could not be confirmed.'}}}));await refresh(ui);const stale=await observe(ui.page);await ui.page.unrouteAll({behavior:'wait'});
  await ui.context.setOffline(true);await ui.page.getByRole('button',{name:mode==='display'?'Refresh display':'Refresh standing',exact:true}).click();await settled(ui.page);const offline=await observe(ui.page);await ui.context.setOffline(false);await refresh(ui);staleModes.push({mode,fresh,stale,offline});
 }
 await record(groups[2].ids[1],{staleModes},oracles.DR11_STALE_OFFLINE,ui.page);
 const entered=gate(),release=gate();ui.releases.push(release.resolve);await ui.page.route('**'+apiStanding(ids.event,ids.lotA),async r=>{const actual=await r.fetch();entered.resolve();await release.promise;await deliver(r,actual);});
 await ui.page.getByRole('button',{name:'Refresh standing',exact:true}).click();await entered.promise;
 const viewer=await login(f,'bidder-viewer');await ui.context.addCookies([{name:'bz_session',value:viewer.cookie.slice('bz_session='.length),url:f.origin}]);
 // No extra refresh may mask a missing final session recheck: finish this original cycle.
 release.resolve();await settled(ui.page);const finalSessionGuard=await observe(ui.page);
 await refresh(ui);const changedAccount=await observe(ui.page);
 await ui.page.unrouteAll({behavior:'wait'});const original=await login(f,'bidder-juniper');await ui.context.addCookies([{name:'bz_session',value:original.cookie.slice('bz_session='.length),url:f.origin}]);await refresh(ui);
 const enteredGeneration=gate(),releaseGeneration=gate();ui.releases.push(releaseGeneration.resolve);await ui.page.route('**'+apiStanding(ids.event,ids.lotA),async r=>{const actual=await r.fetch();enteredGeneration.resolve();await releaseGeneration.promise;await deliver(r,actual);});await ui.page.getByRole('button',{name:'Refresh standing',exact:true}).click();await enteredGeneration.promise;
 const viewerAgain=await login(f,'bidder-viewer');await ui.context.addCookies([{name:'bz_session',value:viewerAgain.cookie.slice('bz_session='.length),url:f.origin}]);await ui.page.getByRole('button',{name:'Refresh standing',exact:true}).evaluate(e=>e.click());releaseGeneration.resolve();await settled(ui.page);const changedGeneration=await observe(ui.page);
 await ui.page.unrouteAll({behavior:'wait'});await go(ui,f,'results',ids.eventOther);const deniedOther=await observe(ui.page);
 const juniper=await login(f,'bidder-juniper');await ui.context.addCookies([{name:'bz_session',value:juniper.cookie.slice('bz_session='.length),url:f.origin}]);await go(ui,f);
 const entered2=gate(),release2=gate();ui.releases.push(release2.resolve);await ui.page.route('**'+apiStanding(ids.event,ids.lotA),async r=>{const actual=await r.fetch();entered2.resolve();await release2.promise;await deliver(r,actual);});await ui.page.getByRole('button',{name:'Refresh standing',exact:true}).click();await entered2.promise;await go(ui,f,'display',ids.eventOther);release2.resolve();await flush(ui.page);const changedEvent=await observe(ui.page);
 await record(groups[2].ids[2],{finalSessionGuard,noExtraRefreshBeforeFinalSessionGuard:true,changedAccount,changedGeneration,deniedOther,changedEvent},oracles.DR12_ACCOUNT_EVENT_LATE_ISOLATION,ui.page);
 });}

async function refreshLayout(f,record){await seeded(f);
 const actor=await login(f,'bidder-harbor'),accepted=await post(f,actor,intent(f,ids.businessHarbor,999999999));need(accepted.status===201&&accepted.data.receipt.status==='accepted','large odd-cent real layout fixture');
 await f.db.query("UPDATE bz_catalog_approvals SET event_snapshot=jsonb_set(event_snapshot,'{cover}','null'::jsonb) WHERE id=$1",[ids.release]);
 if(!await reachable(f,groups[3],record,async ui=>{
 await go(ui,f,'display',ids.eventBefore);await ui.page.clock.install({time:new Date('2099-01-01T00:00:00Z')});await refresh(ui);const skew=await observe(ui.page);await f.db.query("UPDATE bz_catalog_approvals SET opens_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ids.releaseBefore]);await refresh(ui);const opened=await observe(ui.page);await f.db.query("UPDATE bz_catalog_approvals SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ids.releaseBefore]);await refresh(ui);const closed=await observe(ui.page);
 await record(groups[3].ids[0],{skew,opened,closed},oracles.DR13_SERVER_PHASE_REFRESH,ui.page);
 }))return;
 // Three selected rows force the max2 oracle to distinguish a bounded queue from Promise.all.
 const third={...f.privateLot,title:'Third published concurrency witness',short:'Independent concurrency fixture',description:'Third independent approved concurrency fixture.',number:'04'};
 await f.db.query('INSERT INTO bz_catalog_lots(approval_id,event_id,org_id,lot_id,position,snapshot) VALUES($1,$2,$3,$4,2,$5)',[ids.release,ids.event,ids.saturn,ids.lotC,third]);
 // All timers below are controlled browser time; payloads and phases remain real database reads.
 await withUI(f,'bidder-juniper',async ui=>{
 const order=[];let held=null;await ui.page.route('**/api/**',async r=>{const path=new URL(r.request().url()).pathname;order.push(path);const actual=await r.fetch();if(held&&path===apiStanding(ids.event,ids.lotA)){const holding=held;held=null;holding.entered.resolve();await holding.release.promise;}await deliver(r,actual);});
 const missing=await go(ui,f);if(missing){return;}const initialSelectedCount=(await observe(ui.page)).lots.length;await ui.page.clock.pauseAt(new Date(await ui.page.evaluate(()=>Date.now()+100)));
 const cycleCount=()=>ui.requests.filter(r=>r.path===apiCatalog(ids.event)).length;
 const openTimer=await ui.page.evaluate(()=>window.__displayTimerEvidence()),openPending=openTimer.timers.find(t=>t.delay===5000),openRemaining=openPending?Math.max(1,openPending.at+5000-openTimer.now):5000;
 const initial=cycleCount();await ui.page.clock.runFor(openRemaining-1);const before5=cycleCount();await ui.page.clock.runFor(2);await settled(ui.page);const after5=cycleCount();
 await f.db.query("UPDATE bz_catalog_approvals SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ids.release]);await refresh(ui);
 const closeTimer=await ui.page.evaluate(()=>window.__displayTimerEvidence()),closePending=closeTimer.timers.find(t=>t.delay===30000),closeRemaining=closePending?Math.max(1,closePending.at+30000-closeTimer.now):30000;
 const closeInitial=cycleCount();await ui.page.clock.runFor(closeRemaining-1);const before30=cycleCount();await ui.page.clock.runFor(2);await settled(ui.page);const after30=cycleCount();
 await f.db.query("UPDATE bz_catalog_approvals SET opens_at=clock_timestamp()+interval '1 hour',closes_at=clock_timestamp()+interval '2 hours' WHERE id=$1",[ids.releaseBefore]);await go(ui,f,'display',ids.eventBefore);
 const scheduledCycleCount=()=>ui.requests.filter(r=>r.path===apiCatalog(ids.eventBefore)).length,scheduledTimer=await ui.page.evaluate(()=>window.__displayTimerEvidence()),scheduledPending=scheduledTimer.timers.find(t=>t.delay===5000),scheduledRemaining=scheduledPending?Math.max(1,scheduledPending.at+5000-scheduledTimer.now):5000;
 const scheduledInitial=scheduledCycleCount();await ui.page.clock.runFor(scheduledRemaining-1);const beforeScheduled5=scheduledCycleCount();await ui.page.clock.runFor(2);await settled(ui.page);const afterScheduled5=scheduledCycleCount();
 await ui.page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});const hideStart=scheduledCycleCount();await ui.page.clock.runFor(90001);const hidden=scheduledCycleCount();await ui.page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await settled(ui.page);const resumed=scheduledCycleCount();
 await go(ui,f);const holding={entered:gate(),release:gate()};ui.releases.push(holding.release.resolve);held=holding;
 await ui.page.getByRole('button',{name:'Refresh standing',exact:true}).click();await holding.entered.promise;const activeWhileHeld=ui.activeReads;
 await ui.page.getByRole('button',{name:'Refresh standing',exact:true}).evaluate(e=>e.click());holding.release.resolve();await settled(ui.page);const afterCancelledCycle=await observe(ui.page);
 await record(groups[3].ids[1],{initial,before5,after5,closeInitial,before30,after30,scheduledInitial,beforeScheduled5,afterScheduled5,hideStart,hidden,resumed,max:ui.maxInFlight,initialSelectedCount,order,openTimer,closeTimer,scheduledTimer,activeWhileHeld,afterCancelledCycle,initialLoadIncluded:true,clientRequestLifecycleCounter:true,controlledVisibility:true,controlledNativeTimers:true},oracles.DR14_BOUNDED_VISIBLE_REFRESH,ui.page);
 },{clock:'2099-01-01T00:00:00Z'});
 const layout=[];for(const mode of ['display','results'])for(const viewport of [{width:320,height:568},{width:1280,height:800},{width:1920,height:1080}])await withUI(f,'bidder-juniper',async ui=>{await go(ui,f,mode);const refresh=ui.page.getByRole('button',{name:mode==='display'?'Refresh display':'Refresh standing',exact:true});await refresh.focus();const actual=await ui.page.evaluate(()=>{
 const m=document.querySelector('main[data-private-board]'),a=document.activeElement,s=getComputedStyle(a),r=a.getBoundingClientRect();
 const amounts=[...document.querySelectorAll('[data-current-amount]')].map(e=>{const range=document.createRange();range.selectNodeContents(e);const b=range.getBoundingClientRect();let complete=b.left>=-1&&b.right<=innerWidth+1;for(let p=e;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();if(['hidden','clip','scroll','auto'].includes(s.overflowX)&&(b.left<r.left-1||b.right>r.right+1))complete=false;}return {text:e.textContent,complete};});
 return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,heading:!!m?.querySelector('h1'),focus:{native:a.tagName==='BUTTON',visible:r.width>0&&r.height>0&&s.visibility!=='hidden',outline:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0},table:!!m?.querySelector('table thead th'),amounts,links:[...m.querySelectorAll('a[href]')].map(e=>e.getAttribute('href'))};
 });layout.push({mode,viewport,actual,o:await observe(ui.page)});await ui.page.screenshot({path:f.evidenceOutput+`/layout-${mode}-${viewport.width}.png`,fullPage:true});await ui.page.reload({waitUntil:'domcontentloaded'});await settled(ui.page);const reloaded=await observe(ui.page);assert.equal(reloaded.board.eventId,ids.event);}, {viewport});
 await record(groups[3].ids[2],{layout,realFixtureAmountMinor:999999999,nullCoverFixture:true},oracles.DR15_NATIVE_RESPONSIVE);
}
