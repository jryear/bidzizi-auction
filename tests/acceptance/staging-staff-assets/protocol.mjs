import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {HarnessError} from '../staging-catalog/harness.mjs';
import {ids,login,create,openFields,futureFields,completeLot} from '../staging-catalog/protocol.mjs';
import {hash,meta,neutral} from './oracles.mjs';
// Legacy v1 regressions use the original open fixture. Fresh v2 publication
// evidence supplies its own explicit future window.
export {ids,login,create,openFields,futureFields,completeLot};
export const uuid=()=>randomUUID();
export const functions=[
 'public.bz_staff_asset_put(text,uuid,uuid,text,integer,text,bytea,integer,integer)',
 'public.bz_staff_asset_recover(text,uuid,uuid)',
 'public.bz_staff_asset_validate(text,uuid,uuid[])',
 'public.bz_staff_asset_read(text,uuid,uuid,text,uuid)',
];
export const path={upload:e=>'/api/admin/events/'+e+'/assets',recover:(e,q)=>'/api/admin/events/'+e+'/asset-uploads/'+q,
 own:(e,q)=>'/api/admin/events/'+e+'/asset-uploads/'+q+'/content',saved:(e,a)=>'/api/admin/events/'+e+'/assets/'+a,
 approved:(e,p,a)=>'/api/admin/events/'+e+'/catalog-approval/'+p+'/assets/'+a,
 published:(e,p,a)=>'/api/catalog/events/'+e+'/assets/'+a+'?approvalId='+p};
export async function binary(f,url,{method='GET',body,cookie,headers={},signal}={}){
 let r,bytes;try{r=await fetch(f.origin+url,{method,body,cookie,headers:{...headers,...(cookie?{cookie}:{})},redirect:'manual',signal:signal||AbortSignal.timeout(20000),...(body instanceof ReadableStream?{duplex:'half'}:{})});bytes=Buffer.from(await r.arrayBuffer());}
 catch(e){throw new HarnessError('Asset transport/deadline unavailable ('+e.name+').');}
 const text=bytes.toString('utf8');let data=null;try{data=JSON.parse(text);}catch{}
 return {status:r.status,headers:r.headers,bytes,text,data};
}
export async function upload(f,actor,event,file,requestId=uuid(),extra={}){
 const bytes=Buffer.isBuffer(file)?file:await readFile(new URL('./fixtures/'+file.name,import.meta.url));
 const type=Buffer.isBuffer(file)?'image/png':file.mime;
 const r=await binary(f,path.upload(event),{method:'POST',body:bytes,cookie:actor.cookie,headers:{origin:f.origin,'content-type':type,'x-bidzizi-request-id':requestId,...extra}});
 return {response:r,raw:bytes,requestId,...([200,201].includes(r.status)?{asset:meta(r.data,event,requestId)}:{})};
}
export async function capability(f,actor,packet,fixture,record){
 const observed=(await f.db.query('SELECT to_regclass($1) AS asset_table, '+functions.map((_,i)=>'to_regprocedure($'+(i+2)+') AS f'+i).join(', '),['public.bz_staff_assets',...functions])).rows[0];
 const u=await upload(f,actor,packet.event.id,fixture);record({stage:'actual-upload-capability',sqlObjects:observed,httpStatus:u.response.status,bodyCode:u.response.data?.error?.code||null});
 if(u.response.status>=500)throw new HarnessError('Required ASSETS application/dependency failed before a finite capability observation:99.');
 // Explicitly observed route absence is finite feature RED, after staff/event
 // health succeeded. Missing modules, startup errors and transports are99.
 assert.equal(u.response.status,201,'A real authorized raster upload must exist and commit.');assert.ok(observed.asset_table&&functions.every((_,i)=>observed['f'+i]),'All successor SQL functions must actually exist.');
 return u;
}
export function compact(p){
 const eventKeys=['name','eyebrow','welcome','venue','cover','date','start','end','timezone','increment','sponsorsEnabled','sponsors','coverAlt'];
 const lotKeys=['id','title','short','description','category','image','alt','opening','includes','fine','windowId'];
 return {event:Object.fromEntries(eventKeys.filter(k=>k in p.event).map(k=>[k,p.event[k]])),
   lots:p.lots.map(l=>Object.fromEntries(lotKeys.map(k=>[k,l[k]])))};
}
export async function save(f,actor,p,draft,requestId=uuid()){
 const r=await f.request('/api/admin/events/'+p.event.id,{method:'PUT',json:{expectedRevision:p.revision,requestId,draft},cookie:actor.cookie,headers:{origin:f.origin}});
 assert.equal(r.status,200,'Save must atomically validate opaque ownership and persist.');return r.data.draft;
}
export async function reload(f,actor,event){const r=await f.request('/api/admin/events/'+event,{cookie:actor.cookie});assert.equal(r.status,200);return r.data.draft;}
export async function approve(f,actor,p,lotIds=p.lots.map(l=>l.id),requestId=uuid()){
 const r=await f.request('/api/admin/events/'+p.event.id+'/catalog-approval',{method:'POST',json:{expectedRevision:p.revision,requestId,lotIds},cookie:actor.cookie,headers:{origin:f.origin}});
 assert.equal(r.status,201);return r.data.approval;
}
export async function enroll009(f,event,claims={name:'Synthetic Assets Attendee',businessName:'Synthetic Assets Business',memberId:'SYNTHETIC-ASSETS-009'}){
 // Bounded009 regression setup only: operator opt-in is not staff admission
 // capability and never substitutes for a future staff-entry contract.
 await f.db.query('INSERT INTO public.bz_demo_event_entries(event_id,org_id,enabled) SELECT id,org_id,true FROM public.bz_events WHERE id=$1 ON CONFLICT(event_id) DO UPDATE SET enabled=true',[event]);
 const entryId=uuid(),begin=await f.request('/api/demo/events/'+event+'/begin',{method:'POST',json:{entryId},headers:{origin:f.origin}});
 assert.equal(begin.status,200);const boot=begin.headers.get('set-cookie')?.split(';')[0];assert.ok(boot);
 const r=await f.request('/api/demo/events/'+event+'/enroll',{method:'POST',json:{entryId,...claims},cookie:boot,headers:{origin:f.origin}});
 assert.equal(r.status,201);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('bz_session='));
 const ack=await f.request('/api/demo/events/'+event+'/acknowledge',{method:'POST',json:{entryId},cookie,headers:{origin:f.origin}});assert.equal(ack.status,200);
 return {cookie,person:r.data.person.id,business:r.data.business.id,entryId};
}
export const sessionHash=actor=>hash(actor.cookie.split('=')[1]);
export async function recovered(f,actor,event,requestId){const r=await f.request(path.recover(event,requestId),{cookie:actor.cookie});assert.equal(r.status,200);return meta(r.data,event,requestId);}
export async function denied(f,url,actor,status=404,code='ASSET_UNAVAILABLE'){const r=await binary(f,url,{cookie:actor?.cookie});neutral(r,status,code);return r;}
