/** Allowlisted staff projection; attendee catalog/BID authority never supplies this board. */
export type Phase = 'draft' | 'scheduled' | 'open' | 'closed';
export type Currency = 'USD' | 'SATURN_TRADE_DOLLAR_SYNTHETIC_V1';
export type Standing = {currentAmountMinor:number|null;leadingBusiness:{id:string;name:string}|null;acceptedBidCount:number;version:number;updatedAt:string};
export type ResultLot = {lot:{id:string;number:string;title:string;short:string;category:string;image:string|null;alt:string};standing:Standing;recordedState:'no-bids'|'recorded-standing'};
export type StaffResults = {eventId:string;releaseId:string|null;event:{id:string;name:string;welcome:string;venue:string};organization:{id:string;name:string;initials:string};schedule:{opensAt:string;closesAt:string;timezone:string}|null;phase:Phase;serverNow:string;currency:Currency;rulesetId:string;scale:100;published:boolean;finalized:false;lots:ResultLot[]};
export class InvalidPayload extends Error {}
export class ReadFailure extends Error {constructor(readonly status:number){super('This read could not be confirmed.');}}
function requireValue(value:unknown):asserts value {if(!value)throw new InvalidPayload('This response could not be verified.');}
function object(value:unknown):Record<string,unknown>{requireValue(value&&typeof value==='object'&&!Array.isArray(value));return value as Record<string,unknown>;}
function text(value:unknown,max:number):string{requireValue(typeof value==='string'&&value.length<=max);return value as string;}
function id(value:unknown):string{const v=text(value,36);requireValue(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v));return v.toLowerCase();}
function integer(value:unknown,min:number,max=1_000_000_000):number{requireValue(Number.isSafeInteger(value)&&(value as number)>=min&&(value as number)<=max);return value as number;}
function timestamp(value:unknown):string{const v=text(value,35);requireValue(Number.isFinite(Date.parse(v)));return v;}
const photos=new Set(['cabin','coffee','dinner','ceramics','bicycle','flowers'].map(v=>`assets/lots/${v}.jpg`));
function image(value:unknown):string|null{if(value==null)return null;const v=text(value,100);requireValue(photos.has(v)||/^asset:[a-f0-9-]{36}$/i.test(v));if(v.startsWith('asset:'))id(v.slice(6));return v;}
export function parseSession(value:unknown):string|null{const v=object(value);requireValue(typeof v.authenticated==='boolean');if(!v.authenticated)return null;return id(object(v.person).id);}
export function parseResults(value:unknown,eventId:string):StaffResults{
 const v=object(value),event=object(v.event),org=object(v.organization);
 requireValue(v.schemaVersion===1&&v.testMode===true&&v.finalized===false&&v.scale===100&&typeof v.published==='boolean'&&id(v.eventId)===eventId&&id(event.id)===eventId);
 requireValue(v.currency==='USD'||v.currency==='SATURN_TRADE_DOLLAR_SYNTHETIC_V1');
 const currency=v.currency as Currency,rulesetId=text(v.rulesetId,100);requireValue(rulesetId===(currency==='USD'?'staging-usd-manual-v1':'saturn-trade-tiered-v1'));
 requireValue(['draft','scheduled','open','closed'].includes(v.phase as string));const phase=v.phase as Phase,serverNow=timestamp(v.serverNow);
 let schedule:StaffResults['schedule']=null,releaseId:string|null=null;
 if(v.published){releaseId=id(v.releaseId);const s=object(v.schedule),timezone=text(s.timezone,100);try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}catch{throw new InvalidPayload();}schedule={opensAt:timestamp(s.opensAt),closesAt:timestamp(s.closesAt),timezone};requireValue(Date.parse(schedule.opensAt)<Date.parse(schedule.closesAt)&&phase!=='draft');}
 else requireValue(v.releaseId===null&&v.schedule===null&&phase==='draft');
 requireValue(Array.isArray(v.lots)&&v.lots.length<=100&& (v.published||v.lots.length===0));
 const lots:ResultLot[]=v.lots.map(value=>{const r=object(value),l=object(r.lot),s=object(r.standing),count=integer(s.acceptedBidCount,0,2_147_483_647),version=integer(s.version,0,2_147_483_647),amount=s.currentAmountMinor===null?null:integer(s.currentAmountMinor,1),updatedAt=timestamp(s.updatedAt);
  requireValue(Date.parse(updatedAt)<=Date.parse(serverNow));requireValue(amount===null?count===0&&version===0&&s.leadingBusiness===null&&r.recordedState==='no-bids':count>0&&version>0&&r.recordedState==='recorded-standing');
  const leader=s.leadingBusiness===null?null:object(s.leadingBusiness);requireValue(amount===null||leader!==null);
  return {lot:{id:id(l.id),number:text(l.number,10),title:text(l.title,200),short:text(l.short??'',500),category:text(l.category??'',100),image:image(l.image),alt:text(l.alt??'',300)},standing:{currentAmountMinor:amount,leadingBusiness:leader?{id:id(leader.id),name:text(leader.name,200)}:null,acceptedBidCount:count,version,updatedAt},recordedState:r.recordedState as ResultLot['recordedState']};
 });requireValue(new Set(lots.map(r=>r.lot.id)).size===lots.length);
 if(v.assetContext!==undefined){const context=object(v.assetContext);requireValue(context.version===1&&id(context.approvalId)===releaseId);}
 return {eventId,releaseId,event:{id:eventId,name:text(event.name,200),welcome:text(event.welcome??'',5000),venue:text(event.venue??'',300)},organization:{id:id(org.id),name:text(org.name,200),initials:text(org.initials,20)},schedule,phase,serverNow,currency,rulesetId,scale:100,published:v.published,finalized:false,lots};
}
export async function readJSON(path:string,signal:AbortSignal):Promise<unknown>{const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});if(!response.ok)throw new ReadFailure(response.status);try{return await response.json();}catch{throw new InvalidPayload();}}
export function money(minor:number,currency:Currency):string{return `${currency==='USD'?'$':'T$'}${Math.floor(minor/100).toLocaleString('en-US')}.${String(minor%100).padStart(2,'0')}`;}
export function currencyLabel(currency:Currency):string{return currency==='USD'?'Legacy USD':'Synthetic Saturn trade dollars';}
export function dateTime(iso:string,zone='UTC'):string{return new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(iso));}
export function asset(path:string,packet:StaffResults):string{return path.startsWith('asset:')?`/api/admin/events/${packet.eventId}/catalog-approval/${packet.releaseId}/assets/${path.slice(6)}`:`/staging-bidder-preview/${path}`;}
