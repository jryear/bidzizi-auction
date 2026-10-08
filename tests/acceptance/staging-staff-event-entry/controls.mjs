import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {currentEntry,applied,persisted,preserved,denied,revisionConflict} from './oracles.mjs';

export function negativeControls(){
 const id='40000000-0000-4000-8000-000000000011',actor='20000000-0000-4000-8000-000000000001',request='60000000-0000-4000-8000-000000000011',origin='http://127.0.0.1:12345',time='2026-10-08T00:00:00.000Z';
 const response={status:200,headers:new Headers({'cache-control':'private, no-store'}),text:'{}',data:{entry:{eventId:id,enabled:true,entryRevision:1,updatedAt:time,shareUrl:origin+'/events/'+id},serverNow:time,operation:{requestId:request,appliedRevision:1,enabled:true,appliedAt:time},replayed:false}};
 const copy=()=>({...response,data:structuredClone(response.data),headers:new Headers(response.headers)});
 currentEntry(response,{eventId:id,origin,enabled:true,revision:1});applied(response,{requestId:request,enabled:true,revision:1});
 let n=0;
 const breaks=mutate=>{const r=copy();mutate(r);assert.throws(()=>currentEntry(r,{eventId:id,origin,enabled:true,revision:1}),assert.AssertionError);n++;};
 for(const mutate of [r=>r.status=404,r=>r.headers.delete('cache-control'),r=>r.data.entry.eventId=actor,r=>r.data.entry.enabled=false,r=>r.data.entry.entryRevision=0,r=>r.data.entry.shareUrl+='?bootstrap=secret',r=>r.data.entry.shareUrl='https://foreign.invalid/events/'+id,r=>r.data.entry.updatedAt=null,r=>r.data.serverNow='browser-clock',r=>r.data.entry.sessionHash='forged'])breaks(mutate);
 for(const mutate of [r=>r.data.operation.requestId=actor,r=>r.data.operation.appliedRevision=2,r=>r.data.operation.enabled=false,r=>r.data.replayed=true]){const r=copy();mutate(r);assert.throws(()=>applied(r,{requestId:request,enabled:true,revision:1}),assert.AssertionError);n++;}
 const read=copy();delete read.data.operation;delete read.data.replayed;currentEntry(read,{eventId:id,origin,enabled:true,revision:1});
 for(const base of [response,read])for(const key of ['sessionHash','token','person','business','claims','bootstrap']){const r={...base,data:structuredClone(base.data)};r.data[key]='private';assert.throws(()=>currentEntry(r,{eventId:id,origin,enabled:true,revision:1}),assert.AssertionError);n++;}
 for(const mutate of [r=>delete r.data.operation,r=>delete r.data.replayed,r=>r.data.operation.sessionHash='private'])breaks(mutate);
 const org='10000000-0000-4000-8000-000000000001';
 const storage={entryRows:[{event_id:id,org_id:org,enabled:true,entry_revision:1,updated_by:actor,updated_at:time}],ledgerRows:[{actor_id:actor,event_id:id,request_id:request,expected_revision:0,requested_enabled:true,applied_revision:1,applied_enabled:true,applied_at:time}],sqlTimeMatches:{entry:true,operation:true}};
 const expected={eventId:id,organizationId:org,enabled:true,revision:1,requestId:request,actorId:actor,expectedRevision:0,operation:response.data.operation,entry:response.data.entry};persisted({...storage,...expected});
 for(const mutate of [s=>s.ledgerRows=[],s=>s.ledgerRows.push({...s.ledgerRows[0]}),s=>s.ledgerRows[0].actor_id=id,s=>s.ledgerRows[0].expected_revision=1,s=>s.entryRows[0].enabled=false,s=>s.entryRows[0].org_id=id,s=>s.entryRows[0].updated_by=id,s=>s.entryRows[0].updated_at='2026-10-08T00:00:01.000Z',s=>s.ledgerRows[0].applied_at='2026-10-08T00:00:01.000Z',s=>s.sqlTimeMatches.entry=false,s=>s.sqlTimeMatches.operation=false]){const s=structuredClone(storage);mutate(s);assert.throws(()=>persisted({...s,...expected}),assert.AssertionError);n++;}
 preserved({bids:[],sessions:['current']},{bids:[],sessions:['current']});assert.throws(()=>preserved({bids:[],sessions:['current']},{bids:[],sessions:[]}),assert.AssertionError);n++;
 const refusal={status:403,headers:new Headers({'cache-control':'private, no-store'}),text:'{"error":{"code":"FORBIDDEN","message":"Unavailable"}}',data:{error:{code:'FORBIDDEN',message:'Unavailable'}}};denied(refusal,403,'FORBIDDEN');
 assert.throws(()=>denied({...refusal,headers:new Headers({'cache-control':'private, no-store','set-cookie':'bz_session=forged'})},403,'FORBIDDEN'),assert.AssertionError);n++;
 for(const privateField of ['entry','operation']){const r={...refusal,data:{...refusal.data,[privateField]:{personId:actor}},text:'{}'};assert.throws(()=>denied(r,403,'FORBIDDEN'),assert.AssertionError);n++;}
 const conflict={...refusal,status:409,text:'{}',data:{error:{code:'ENTRY_REVISION_CONFLICT',message:'Current revision changed'},currentEntryRevision:1}};revisionConflict(conflict,1);
 for(const mutate of [r=>r.data.currentEntryRevision=0,r=>delete r.data.currentEntryRevision,r=>r.data.person={id:actor},r=>r.data.error.code='ENTRY_REQUEST_CONFLICT']){const r={...conflict,data:structuredClone(conflict.data)};mutate(r);assert.throws(()=>revisionConflict(r,1),assert.AssertionError);n++;}
 assert.equal(n,48);return {rejectedBrokenObservations:n,productRuntime:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(negativeControls()));}catch(e){console.error('CONTROL_FAILURE '+e.name);process.exitCode=1;}
}
