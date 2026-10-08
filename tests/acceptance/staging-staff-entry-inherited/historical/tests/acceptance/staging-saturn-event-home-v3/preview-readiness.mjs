import assert from 'node:assert/strict';
import {preview as frozenPreview,bounded} from '../staging-workspace-entry/browser.mjs';
import {HarnessError,browserFailure} from '../staging-workspace-entry/harness.mjs';
import {currentAdminFrame} from './readiness.mjs';
const productFailure=why=>new assert.AssertionError({message:why});
const remaining=deadline=>Math.max(1,deadline-Date.now());
const documentIdentity=frame=>frame.evaluate(()=>({timeOrigin:performance.timeOrigin,origin:location.origin,path:location.pathname}));
const contextChanged=error=>/execution context was destroyed|cannot find context|frame was detached/i.test(error?.message||'');
export async function inspectCurrentBidder(ui,deadline){
 const admin=currentAdminFrame(ui);if(!admin)return null;
 let element;try{
  element=await bounded(admin.$('#bidder-frame'),'Actual bidder iframe element access',remaining(deadline));if(!element)return null;
  const [title,src,connected,frame]=await bounded(Promise.all([element.getAttribute('title'),element.getAttribute('src'),element.evaluate(el=>el.isConnected&&el===document.querySelector('#bidder-frame')),element.contentFrame()]),'Actual bidder element/title/child relationship',remaining(deadline));
  if(!connected||title!=='Interactive bidder preview'||!src)return null;
  const expected=new URL(src,ui.f.origin);if(expected.origin!==new URL(ui.f.origin).origin||expected.pathname!=='/staging-bidder-preview/index.html')return null;
  if(!frame||frame.isDetached()||frame.parentFrame()!==admin)return null;
  let actual;try{actual=new URL(frame.url());}catch{return null;}
  if(actual.origin!==expected.origin||actual.pathname!==expected.pathname||currentAdminFrame(ui)!==admin)return null;
  const [adminDocument,bidderDocument]=await bounded(Promise.all([documentIdentity(admin),documentIdentity(frame)]),'Actual admin/bidder document identities',remaining(deadline));
  if(!Number.isFinite(adminDocument.timeOrigin)||!Number.isFinite(bidderDocument.timeOrigin)||adminDocument.timeOrigin<=0||bidderDocument.timeOrigin<=0)throw new HarnessError('Invalid actual preview document identity');
  return {admin,frame,adminDocument,bidderDocument};
 }catch(error){if(admin.isDetached()||contextChanged(error))return null;throw browserFailure(error);}
 finally{if(element)await bounded(element.dispose(),'Actual bidder iframe handle cleanup',remaining(deadline));}
}
export async function waitActualBidder(ui,deadlineMs=8000){
 if(ui.page.isClosed())throw new HarnessError('Actual preview browser page is closed');
 const deadline=Date.now()+deadlineMs;
 return new Promise((resolve,reject)=>{
  let done=false,timer,checking=false,repeat=false;
  const cleanup=()=>{clearTimeout(timer);for(const name of ['framenavigated','frameattached','framedetached'])ui.page.off(name,check);ui.page.off('close',closed);ui.page.off('crash',closed);};
  const finish=(error,value)=>{if(done)return;done=true;cleanup();error?reject(error):resolve(value);};
  const closed=()=>finish(new HarnessError('Actual preview browser closed or crashed'));
  const check=()=>{if(done)return;if(checking){repeat=true;return;}checking=true;inspectCurrentBidder(ui,deadline).then(value=>{checking=false;if(done)return;if(value)finish(null,value);else if(repeat){repeat=false;check();}},error=>{checking=false;finish(browserFailure(error));});};
  for(const name of ['framenavigated','frameattached','framedetached'])ui.page.on(name,check);ui.page.on('close',closed);ui.page.on('crash',closed);
  timer=setTimeout(()=>finish(ui.page.isClosed()?new HarnessError('Actual preview browser closed'):productFailure('Required saved A iframe did not reach its current titled same-origin document before deadline')),deadlineMs);
  check();
 });
}
async function sameBinding(ui,binding,deadline){
 const current=await inspectCurrentBidder(ui,deadline);return current&&current.admin===binding.admin&&current.frame===binding.frame&&JSON.stringify(current.adminDocument)===JSON.stringify(binding.adminDocument)&&JSON.stringify(current.bidderDocument)===JSON.stringify(binding.bidderDocument);
}
export async function savedPreview(ui,packet,options={}){
 const deadlineMs=options.deadlineMs||8000,deadline=Date.now()+deadlineMs;
 while(Date.now()<deadline){
  const binding=await waitActualBidder(ui,remaining(deadline));
  // This facade returns a verified REAL Frame. All unchanged packet and renderer assertions still run natively.
  const observedPage=new Proxy(ui.page,{get(target,key){if(key==='frames')return ()=>[binding.frame];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  try{
   const originalOptions={...options};delete originalOptions.deadlineMs;
   let timer;try{await Promise.race([frozenPreview({...ui,page:observedPage},packet,originalOptions),new Promise((_,reject)=>{timer=setTimeout(()=>reject(ui.page.isClosed()?new HarnessError('Actual preview browser closed'):productFailure('Required saved A packet/content did not complete before deadline')),remaining(deadline));})]);}finally{clearTimeout(timer);}
   if(Date.now()>=deadline)throw productFailure('Required saved A document/content stability did not finish before deadline');
   if(await sameBinding(ui,binding,deadline))return;
  }catch(error){
   const classified=browserFailure(error);if(classified instanceof HarnessError)throw classified;
   if(Date.now()>=deadline){if(ui.page.isClosed())throw new HarnessError('Actual preview browser closed');throw error;}
   let replaced=binding.admin.isDetached()||binding.frame.isDetached()||contextChanged(error);
   if(!replaced)replaced=!(await sameBinding(ui,binding,deadline));
   if(!replaced)throw error;
  }
 }
 throw productFailure('Required saved A iframe/document changed before its complete packet assertions could finish');
}
