// Bounded native iframe readiness, followed by inherited actual JSON/task/frame consumption.
import {HarnessError} from '../staging-workspace-entry/harness.mjs';
import {consumedRead,bounded} from '../staging-workspace-entry/browser.mjs';
export function currentAdminFrame(ui){
 const origin=new URL(ui.f.origin).origin,main=ui.page.mainFrame();
 const matches=ui.page.frames().filter(frame=>{if(frame.isDetached()||frame.parentFrame()!==main)return false;try{const url=new URL(frame.url());return url.origin===origin&&url.pathname==='/staging-admin/index.html';}catch{return false;}});
 if(matches.length>1)throw new HarnessError('Multiple current admin iframes cannot satisfy readiness');
 return matches[0]||null;
}
export async function waitActualAdminFrame(ui,ms=8000){
 if(!Number.isFinite(ms)||ms<=0)throw new HarnessError('Actual admin iframe readiness deadline');
 return new Promise((resolve,reject)=>{
  let timer,done=false;
  const cleanup=()=>{clearTimeout(timer);for(const name of ['framenavigated','frameattached','framedetached'])ui.page.off(name,check);};
  const finish=(error,frame)=>{if(done)return;done=true;cleanup();error?reject(error):resolve(frame);};
  const check=()=>{try{const frame=currentAdminFrame(ui);if(frame)finish(null,frame);}catch(error){finish(error);}};
  for(const name of ['framenavigated','frameattached','framedetached'])ui.page.on(name,check);
  timer=setTimeout(()=>finish(new HarnessError('Actual admin iframe navigation missing before bounded deadline')),ms);
  // Observe current state after registering native listeners; already-completed navigation is valid.
  check();
 });
}
export async function readyConsumedRead(ui,path,{status,after=0,deadlineMs=8000}={}){
 const deadline=Date.now()+deadlineMs;
 while(Date.now()<deadline){
  const frame=await waitActualAdminFrame(ui,deadline-Date.now());
  try{
   const element=await bounded(frame.frameElement(),'Current admin iframe relationship',deadline-Date.now());
   try{if(await bounded(element.getAttribute('title'),'Actual admin iframe title',deadline-Date.now())!=='BidZizi admin workspace')throw new HarnessError('Matching admin URL is not the titled admin workspace iframe');}finally{await bounded(element.dispose(),'Current admin iframe handle cleanup',deadline-Date.now());}
   const documentIdentity=await bounded(frame.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href})),'Current admin document identity',deadline-Date.now());
   if(!Number.isFinite(documentIdentity.timeOrigin)||documentIdentity.timeOrigin<=0)throw new HarnessError('Invalid admin document identity');
   const read=await bounded(consumedRead({...ui,frame},path,{status,after}),'Current admin JSON consumption/task/frame completion',deadline-Date.now());
   if(frame.isDetached()||currentAdminFrame(ui)!==frame)continue;
   const documentAfter=await bounded(frame.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href})),'Consumed admin document identity',deadline-Date.now());
   if(documentAfter.timeOrigin!==documentIdentity.timeOrigin||documentAfter.url!==documentIdentity.url)continue;
   if(read.parsed!==true)throw new HarnessError('Matching admin response was not parsed JSON');
   return read;
  }catch(error){
   if((frame.isDetached()||/execution context was destroyed|cannot find context|frame was detached/i.test(error?.message||''))&&Date.now()<deadline)continue;
   if(error instanceof HarnessError)throw error;
   throw new HarnessError('Admin iframe readiness/consumption unavailable: '+String(error?.message||error));
  }
 }
 throw new HarnessError('Current admin iframe/read consumption missing before bounded deadline');
}
