// Additive ordinary-navigation check. No pending/held/dirty helper uses this barrier.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homeBrowser} from '../staging-saturn-event-home-v3/checks.mjs';
import {markNavigationReads,completeNavigationReads} from '../staging-saturn-event-home-v3/history-readiness.mjs';
import {expect,bounded,stored,taskFrameFlush,preview} from '../staging-saturn-event-home-v3/browser.mjs';
import {fixture,readPacket} from '../staging-workspace-entry/fixtures.mjs';
import {HarnessError} from '../staging-workspace-entry/harness.mjs';

export async function ROUTER_REFRESH_EVENT_ROUTE(f,out){
 const x=await fixture(f,'006 refresh retains selected saved event'),p=x.packet;
 await homeBrowser(f,async ui=>{
  try{
   const ready=await bounded(ui.page.waitForFunction(()=>typeof window.next?.router?.refresh==='function'&&history.state?.__NA===true,null,{timeout:7500}),'Actual outer framework router readiness',8000);
   await ready.dispose();
  }catch(error){throw new HarnessError('Real outer Next router readiness unavailable: '+error.message);}
  const installed=await ui.page.evaluate(()=>{
   if(typeof window.next?.router?.refresh!=='function')return false;
   window.__eventPreparationHistory={timeOrigin:performance.timeOrigin,operations:[]};
   const original=history.replaceState;
   history.replaceState=function(...args){
    const before=location.href,result=original.apply(this,args);
    window.__eventPreparationHistory.operations.push({before,after:location.href,at:Date.now(),url:String(args[2]),internal:args[0]?.__NA===true});
    return result;
   };
   return true;
  });
  if(!installed)throw new HarnessError('Real outer Next router refresh unavailable');
  const marker=await markNavigationReads(ui);
  await ui.admin.locator('[data-action="switch-event"][data-id="'+p.event.id+'"]').click();
  const consumed=await completeNavigationReads(ui,marker,p.event.id);
  await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(p.event.name);
  await expect(ui.admin.locator('#saved')).toHaveText('Saved');
  await expect(ui.admin.locator('#catalog-approval')).not.toHaveText('Checking approval…');
  await preview(ui,p,{render:false});await stored(f,p);
  assert.deepEqual(await readPacket(f,x.actor,p.event.id),p,'Selected complete packet matches saved API and SQL');
  await taskFrameFlush(ui,'Selected event before real router refresh');
  await bounded(ui.page.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));await Promise.resolve();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}),'Selected outer document task/frame completion');
  const before=await ui.page.evaluate(()=>({href:location.href,timeOrigin:performance.timeOrigin,operationCount:window.__eventPreparationHistory.operations.length}));
  assert.equal(new URL(ui.page.url()).searchParams.get('event'),p.event.id,'Outer durable URL contains selected event');
  assert.equal(new URL(before.href).searchParams.get('event'),p.event.id,'Native outer URL contains selected event before refresh');
  let refreshRequest,responseObservedAt,resolveResponse,observation,refresh;
  const responseReady=new Promise(resolve=>{resolveResponse=resolve;});
  const requested=request=>{
   const headers=request.headers();
   if(refreshRequest||request.method()!=='GET'||new URL(request.url()).pathname!=='/admin'||headers.rsc!=='1'||headers['next-router-prefetch']!==undefined||/prefetch/i.test(headers.purpose||headers['sec-purpose']||'')||request.frame()!==ui.page.mainFrame())return;
   refreshRequest=request;
  };
  const responded=response=>{if(response.request()===refreshRequest){responseObservedAt=Date.now();resolveResponse(response);}};
  ui.page.on('request',requested);ui.page.on('response',responded);
  try{
   const trigger=await ui.page.evaluate(()=>{const at=Date.now();window.next.router.refresh();return {at,timeOrigin:performance.timeOrigin};});
   const response=await bounded(responseReady,'Fresh outer router refresh RSC response',8000);
   if(response.status()!==200||!response.headers()['content-type']?.includes('text/x-component'))throw new HarnessError('Real router refresh RSC response was not successful');
   const finished=await bounded(response.finished(),'Fresh outer router refresh response completion',8000);
   if(finished!==null)throw new HarnessError('Real router refresh response did not finish successfully');
   const timing=refreshRequest.timing(),headersAt=timing.startTime+timing.responseStart;
   if(![headersAt,timing.startTime,timing.responseStart,timing.responseEnd].every(Number.isFinite)||timing.responseStart<0||timing.responseEnd<timing.responseStart||timing.startTime<trigger.at-1)throw new HarnessError('Fresh native router refresh request timing unavailable');
   refresh={url:refreshRequest.url(),method:refreshRequest.method(),rsc:refreshRequest.headers().rsc,mainFrame:true,prefetch:false,status:response.status(),contentType:response.headers()['content-type'],trigger,responseObservedAt,finishedAt:Date.now(),responseFinished:true,timing,headersAt};
   const handle=await bounded(ui.page.waitForFunction(({before,headersAt})=>{
    const historyObservation=window.__eventPreparationHistory;
    return performance.timeOrigin===before.timeOrigin&&historyObservation?.timeOrigin===before.timeOrigin&&historyObservation.operations.slice(before.operationCount).some(operation=>operation.internal&&operation.at>=Math.floor(headersAt));
   },{before,headersAt},{timeout:7500}),'Actual current-document HistoryUpdater after fresh RSC response',8000);
   await handle.dispose();
   await bounded(ui.page.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));await Promise.resolve();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}),'Completed refresh outer task/microtask/twoRAF',8000);
   observation=await ui.page.evaluate(()=>({href:location.href,timeOrigin:performance.timeOrigin,operations:window.__eventPreparationHistory.operations}));
  }catch(error){throw new HarnessError('Actual current-document router refresh completion unavailable: '+error.message);}
  finally{ui.page.off('request',requested);ui.page.off('response',responded);}
  assert.equal(observation.timeOrigin,before.timeOrigin,'Refresh observation belongs to the same real outer document');
  assert.equal(refresh.trigger.timeOrigin,before.timeOrigin,'Refresh trigger belongs to the same real outer document');
  assert.ok(observation.operations.slice(before.operationCount).some(operation=>operation.internal&&operation.at>=Math.floor(refresh.headersAt)),'Actual framework HistoryUpdater ran after the fresh RSC response began');
  await expect(ui.admin.locator('[data-event="name"]')).toHaveValue(p.event.name);
  await expect(ui.admin.locator('#saved')).toHaveText('Saved');
  await expect(ui.admin.locator('#catalog-approval')).not.toHaveText('Checking approval…');
  await preview(ui,p,{render:false});await stored(f,p);
  const afterPacket=await readPacket(f,x.actor,p.event.id);assert.deepEqual(afterPacket,p,'Router refresh preserves the complete saved API and SQL packet');
  const cached=ui.page.url(),native=await ui.page.evaluate(()=>({href:location.href,timeOrigin:performance.timeOrigin,at:Date.now()}));
  await writeFile(join(out,'ROUTER_REFRESH_EVENT_ROUTE.json'),JSON.stringify({id:'ROUTER_REFRESH_EVENT_ROUTE',eventId:p.event.id,consumed,before,refresh,observation,cached,native,afterPacket,fullSavedPacketAndSQL:true},(key,value)=>key==='frame'?undefined:value,2)+'\n',{flag:'wx'});
  assert.equal(new URL(cached).searchParams.get('event'),p.event.id,'Outer durable URL contains selected event');
  assert.equal(new URL(native.href).searchParams.get('event'),p.event.id,'Native outer durable URL contains selected event');
 });
}
