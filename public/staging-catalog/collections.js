// Personal collections use current server VIEW authority, never a device bookmark.
import {event,catalog,lotById} from './data.js';
import {bidder} from './bidding.js';
export const collections={watch:null,history:null,watchError:'',historyError:'',watchDenied:false,historyDenied:false,stale:false,intents:new Map(),pending:new Set()};
let scope='',generation=0,refresh=null,watchSequence=0,historySequence=0;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const actor=()=>bidder.context?.person.id;
const root=()=>'/api/bidder/events/'+encodeURIComponent(event.id);
const changed=()=>window.dispatchEvent(new Event('member-change'));
const key=()=>`bz:watch-intents:v1:${actor()}/${event.id}`;
const save=()=>{try{localStorage.setItem(key(),JSON.stringify([...collections.intents.values()]));}catch{}};
export async function memberRequest(path,body){
 const expectedActor=actor(),expectedEpoch=bidder.epoch,expectedEvent=event.id,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(path,{signal:controller.signal,credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});const data=await r.json();
  const sessionResponse=await fetch('/api/session',{signal:controller.signal,credentials:'same-origin',cache:'no-store'}),session=await sessionResponse.json();
  if(!sessionResponse.ok||session.authenticated!==true||session.person?.id!==expectedActor){window.dispatchEvent(new Event('member-session-changed'));throw new Error('The private session changed. The original request is retained for its owner.');}
  if(catalog.version===2){const viewResponse=await fetch(`/api/v2/bidder/events/${encodeURIComponent(expectedEvent)}/context`,{signal:controller.signal,credentials:'same-origin',cache:'no-store'}),view=await viewResponse.json();if([401,403,404].includes(viewResponse.status)||viewResponse.ok&&view.person?.id!==expectedActor){window.dispatchEvent(new Event('member-session-changed'));throw new Error('Current private event access changed.');}if(!viewResponse.ok||view.testMode!==true)throw new Error('Current private event access could not be confirmed.');}
  if(expectedActor!==actor()||expectedEpoch!==bidder.epoch||expectedEvent!==event.id)throw new Error('The member view changed before this response could be used.');
  return {status:r.status,data};
 }finally{clearTimeout(timer);}
}
const validWatch=p=>p?.eventId===event.id&&p.releaseId===catalog.approvalId&&p.person?.id===actor()&&typeof p.person.name==='string'&&Array.isArray(p.lotIds)&&p.lotIds.every(uuid)&&Number.isFinite(Date.parse(p.serverNow));
const validHistory=p=>p?.eventId===event.id&&p.releaseId===catalog.approvalId&&p.person?.id===actor()&&typeof p.person.name==='string'&&p.scale===100&&p.currency===(catalog.version===2?'SATURN_TRADE_DOLLAR_SYNTHETIC_V1':'USD')&&p.rulesetId===(catalog.version===2?'saturn-trade-tiered-v1':'staging-usd-manual-v1')&&['scheduled','open','closed'].includes(p.phase)&&Array.isArray(p.bids)&&Number.isFinite(Date.parse(p.serverNow))&&p.bids.every(b=>{
 const r=b.receipt,s=b.standing;if(!r||!s)return false;
 const statusMatches=r.status==='rejected'?b.recordedState==='rejected':r.status==='accepted'&&['leading','outbid','closed-leading','closed-outbid'].includes(b.recordedState);
 const leader=s.leadingBusiness===null||(uuid(s.leadingBusiness?.id)&&typeof s.leadingBusiness.name==='string');
 return statusMatches&&r.actorId===actor()&&r.eventId===event.id&&r.releaseId===catalog.approvalId&&r.currency===p.currency&&r.rulesetId===p.rulesetId&&uuid(r.requestId)&&uuid(r.businessId)&&Number.isFinite(Date.parse(r.decidedAt))&&uuid(b.lot?.id)&&typeof b.lot.title==='string'&&typeof b.lot.number==='string'&&r.lotId===b.lot.id&&Number.isSafeInteger(r.amountMinor)&&r.amountMinor>0&&r.amountMinor<=1_000_000_000&&(r.status==='accepted'?uuid(r.bidId)&&r.reason===null:r.bidId===null&&typeof r.reason==='string')&&(s.currentAmountMinor===null||Number.isSafeInteger(s.currentAmountMinor)&&s.currentAmountMinor>=0&&s.currentAmountMinor<=1_000_000_000)&&Number.isSafeInteger(s.version)&&s.version>=0&&Number.isSafeInteger(s.acceptedBidCount)&&s.acceptedBidCount>=0&&Number.isFinite(Date.parse(s.updatedAt))&&leader&&(!b.recordedState.includes('leading')||s.leadingBusiness?.id===r.businessId)&&(!b.recordedState.includes('outbid')||s.leadingBusiness?.id!==r.businessId);
});
export async function refreshCollections(){
 if(!actor())return;const g=generation,ws=++watchSequence,hs=++historySequence;
 if(bidder.stale||!navigator.onLine){collections.stale=true;changed();return;}
 const [watch,history]=await Promise.allSettled([memberRequest(root()+'/watching'),memberRequest(root()+'/my-bids')]);if(g!==generation)return;
 for(const [name,result,seq,current,valid] of [['watch',watch,ws,watchSequence,validWatch],['history',history,hs,historySequence,validHistory]]){
  if(seq!==current)continue;
  if(result.status==='fulfilled'&&result.value.status===200&&valid(result.value.data)){collections[name]=structuredClone(result.value.data);collections[name+'Error']='';collections[name+'Denied']=false;}
  else{const status=result.status==='fulfilled'?result.value.status:null;if([401,403].includes(status)){collections[name]=null;collections[name+'Denied']=true;}collections[name+'Error']=status===404?'This feature is not available for this event.':'The current server view could not be confirmed. Retry to check.';}
 }
 collections.stale=!!collections.watchError||!!collections.historyError;changed();
}
export function setCollectionContext(){
 const next=[event.id,catalog.approvalId,bidder.epoch,actor()].join('/');
 if(next!==scope){++generation;scope=next;refresh=null;collections.watch=null;collections.history=null;collections.watchError='';collections.historyError='';collections.watchDenied=false;collections.historyDenied=false;collections.intents.clear();collections.pending.clear();
  if(actor())try{const values=JSON.parse(localStorage.getItem(key()));if(Array.isArray(values))for(const v of values){if(v.actorId===actor()&&uuid(v.requestId)&&uuid(v.lotId)&&typeof v.watching==='boolean'&&lotById(v.lotId))collections.intents.set(v.lotId,v);}}catch{}
 }
 if(!actor()){changed();return;}
 if(refresh!==bidder.refresh){refresh=bidder.refresh;void refreshCollections();for(const id of collections.intents.keys())void recoverWatch(id);}
}
export const isWatched=id=>!!collections.watch?.lotIds.includes(id);
export const watchAvailable=()=>!!collections.watch&&!collections.watchError&&!bidder.stale&&navigator.onLine;
function matches(response,intent){const w=response?.watch;return response?.operation?.requestId===intent.requestId&&w?.eventId===event.id&&w.releaseId===catalog.approvalId&&w.lotId===intent.lotId&&w.watching===intent.watching&&Number.isFinite(Date.parse(w.updatedAt));}
async function operateWatch(id,recovery=false){
 const intent=collections.intents.get(id);if(!intent||collections.pending.has(id)||!actor()||!navigator.onLine)return;
 const g=generation;collections.pending.add(id);++watchSequence;changed();
 try{const r=await memberRequest(root()+'/watching'+(recovery?'/requests/'+encodeURIComponent(intent.requestId):''),recovery?undefined:{actorId:intent.actorId,requestId:intent.requestId,lotId:intent.lotId,watching:intent.watching});if(g!==generation)return;
  if([200,201].includes(r.status)&&matches(r.data,intent)){collections.intents.delete(id);save();collections.watchError='';await refreshCollections();}
  else{intent.error=r.status===404?'No receipt found. Retry the original watch request.':r.data.error?.message||'Watching could not be confirmed. Check the original request.';intent.notFound=r.status===404;save();}
 }catch{if(g===generation){intent.error='Watching is unconfirmed. Check the original request before changing it.';save();}}
 finally{if(g===generation){collections.pending.delete(id);changed();}}
}
export function toggleWatch(id){if(!watchAvailable()||!lotById(id)||collections.intents.has(id))return;collections.intents.set(id,{actorId:actor(),requestId:crypto.randomUUID(),lotId:id,watching:!isWatched(id)});save();void operateWatch(id);}
export const recoverWatch=id=>operateWatch(id,true);
export const retryWatch=id=>operateWatch(id,false);
