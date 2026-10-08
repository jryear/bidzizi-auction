// Complete normal navigation reads before requesting the next normal Back/Forward.
// Pending/held/dirty/unknown challenge cases do not use this precondition.
import {HarnessError} from '../staging-workspace-entry/harness.mjs';
import {bounded} from '../staging-workspace-entry/browser.mjs';
import {waitActualAdminFrame,currentAdminFrame,readyConsumedRead} from './readiness.mjs';
const identity=frame=>frame.evaluate(()=>({timeOrigin:performance.timeOrigin,origin:location.origin,path:location.pathname}));
const same=(a,b)=>a.timeOrigin===b.timeOrigin&&a.origin===b.origin&&a.path===b.path;
export async function markNavigationReads(ui){
 const deadline=Date.now()+8000,left=()=>Math.max(1,deadline-Date.now());
 while(Date.now()<deadline){
  const frame=await waitActualAdminFrame(ui,left());
  const marker=await bounded(frame.evaluate(()=>({document:{timeOrigin:performance.timeOrigin,origin:location.origin,path:location.pathname},sequence:window.__workspaceReadIssued})),'Atomic current-document issued history marker',left());
  if(!Number.isInteger(marker.sequence)||marker.sequence<0)throw new HarnessError('History request-sequence observer unavailable');
  if(frame.isDetached()||currentAdminFrame(ui)!==frame)continue;
  const current=await bounded(identity(frame),'History marker current-document confirmation',left());if(!same(marker.document,current))continue;
  return {frame,...marker};
 }
 throw new HarnessError('Stable pretrigger history document marker unavailable before total deadline');
}
export async function completeNavigationReads(ui,marker,eventId=null,{deadlineMs=8000}={}){
 const deadline=Date.now()+deadlineMs,left=()=>Math.max(1,deadline-Date.now());
 while(Date.now()<deadline){
  const frame=await waitActualAdminFrame(ui,left()),document=await bounded(identity(frame),'History completion current admin document',left());
  // Same iframe/document requires requests issued after the trigger marker. A real
  // outer reload replaces the document and its issued sequence restarts at zero.
  const reset=frame!==marker.frame||!same(document,marker.document),after=reset?0:marker.sequence;
  try{
   const paths=eventId?['/api/admin/events/'+eventId,'/api/admin/events/'+eventId+'/catalog-approval']:['/api/admin/events'];
   const reads=[];for(const path of paths)reads.push(await readyConsumedRead(ui,path,{status:200,after,deadlineMs:left()}));
   if(frame.isDetached()||currentAdminFrame(ui)!==frame)continue;
   await bounded(frame.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,0));await Promise.resolve();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}),'Normal history native task/microtask/twoRAF completion',left());
   const current=await bounded(identity(frame),'History completion same current admin document',left());if(!same(document,current))continue;
   return {document,after,reset,reads};
  }catch(error){
   if((frame.isDetached()||/execution context was destroyed|cannot find context|frame was detached/i.test(error?.message||''))&&Date.now()<deadline)continue;
   throw error;
  }
 }
 throw new HarnessError('Fresh normal navigation draft/approval consumption unavailable before total deadline');
}
