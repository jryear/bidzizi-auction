// Personal collections use current server VIEW authority, never a device bookmark.
import {event,catalog,lotById} from './data.js';
import {bidder} from './bidding.js';
export const collections={watch:null,history:null,watchError:'',historyError:'',stale:false,intents:new Map(),pending:new Set()};
let scope='',generation=0,refresh=null,watchSequence=0,historySequence=0;
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const actor=()=>bidder.context?.person.id;
const root=()=>'/api/bidder/events/'+encodeURIComponent(event.id);
const changed=()=>window.dispatchEvent(new Event('member-change'));
const key=()=>`bz:watch-intents:v1:${actor()}/${event.id}`;
const save=()=>{try{localStorage.setItem(key(),JSON.stringify([...collections.intents.values()]));}catch{}};
export async function memberRequest(path,body){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};
}
const validWatch=p=>p?.eventId===event.id&&p.releaseId===catalog.approvalId&&p.person?.id===actor()&&Array.isArray(p.lotIds)&&p.lotIds.every(uuid)&&Number.isFinite(Date.parse(p.serverNow));
const validHistory=p=>p?.eventId===event.id&&p.releaseId===catalog.approvalId&&p.person?.id===actor()&&p.scale===100&&p.currency===(catalog.version===2?'SATURN_TRADE_DOLLAR_SYNTHETIC_V1':'USD')&&Array.isArray(p.bids)&&Number.isFinite(Date.parse(p.serverNow))&&p.bids.every(b=>b.receipt?.actorId===actor()&&b.receipt.eventId===event.id&&b.receipt.releaseId===catalog.approvalId&&b.receipt.currency===p.currency&&b.receipt.rulesetId===p.rulesetId&&uuid(b.receipt.requestId)&&uuid(b.receipt.businessId)&&Number.isFinite(Date.parse(b.receipt.decidedAt))&&uuid(b.lot?.id)&&b.receipt.lotId===b.lot.id&&Number.isSafeInteger(b.receipt.amountMinor)&&b.receipt.amountMinor>0&&b.receipt.amountMinor<=1_000_000_000&&b.standing&&(b.standing.currentAmountMinor===null||Number.isSafeInteger(b.standing.currentAmountMinor))&&Number.isSafeInteger(b.standing.version)&&['accepted','rejected'].includes(b.receipt.status)&&['leading','outbid','rejected','closed-leading','closed-outbid'].includes(b.recordedState));
export async function refreshCollections(){
 if(!actor())return;const g=generation,ws=++watchSequence,hs=++historySequence;
 if(bidder.stale||!navigator.onLine){collections.stale=true;changed();return;}
 const [watch,history]=await Promise.allSettled([memberRequest(root()+'/watching'),memberRequest(root()+'/my-bids')]);if(g!==generation)return;
 for(const [name,result,seq,current,valid] of [['watch',watch,ws,watchSequence,validWatch],['history',history,hs,historySequence,validHistory]]){
  if(seq!==current)continue;
  if(result.status==='fulfilled'&&result.value.status===200&&valid(result.value.data)){collections[name]=structuredClone(result.value.data);collections[name+'Error']='';}
  else{const status=result.status==='fulfilled'?result.value.status:null;if([401,403].includes(status))collections[name]=null;collections[name+'Error']=status===404?'This feature is not available for this event.':'The current server view could not be confirmed. Retry to check.';}
 }
 collections.stale=!!collections.watchError||!!collections.historyError;changed();
}
export function setCollectionContext(){
 const next=[event.id,catalog.approvalId,bidder.epoch,actor()].join('/');
 if(next!==scope){++generation;scope=next;refresh=null;collections.watch=null;collections.history=null;collections.watchError='';collections.historyError='';collections.intents.clear();collections.pending.clear();
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
