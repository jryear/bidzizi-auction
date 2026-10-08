import assert from 'node:assert/strict';
import {meta,encoded,persisted,samePublished,hash} from './oracles.mjs';
// These retained observation-level broken controls test our rejection oracles.
// They are not app mutants, do not run an app or prove feature implementation.
// Candidate semantic mutation schedules remain an independent-review gate.
export async function controls(_f,record){
 const ref='asset:60000000-0000-4000-8000-000000000001',event='70000000-0000-4000-8000-000000000001',request='80000000-0000-4000-8000-000000000001',actor='90000000-0000-4000-8000-000000000001';
 const bytes=Buffer.from('RIFFxxxxWEBPfixture'),raw=Buffer.from('synthetic raw fixture');
 const a={ref,eventId:event,requestId:request,mime:'image/webp',width:2,height:2,byteLength:bytes.length,sha256:hash(bytes),createdAt:'2030-01-15T00:00:00Z'};
 const r={status:200,bytes,headers:new Headers({'content-type':'image/webp','cache-control':'private, no-store','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','content-disposition':'inline; filename="image.webp"'})};
 const expected={eventId:event,orgId:request,sourceMime:'image/png'};
 const row={org_id:expected.orgId,source_mime:expected.sourceMime,created_at_matches_meta:true,id:ref.slice(6),event_id:event,uploaded_by:actor,request_id:request,mime:a.mime,width:2,height:2,byte_length:bytes.length,sha256:a.sha256,bytes,source_size:raw.length,source_sha256:hash(raw),normalization_version:'raster-webp-v1'};
 assert.deepEqual(meta({asset:a},event,request),a);encoded(r,a);persisted([row],a,actor,raw,expected);samePublished({receipt:'exact'}, {receipt:'exact'});
 const broken=[['remote-reference',()=>meta({asset:{...a,ref:'https://foreign.invalid/image.png'}},event,request)],
  ['missing-durable-row',()=>persisted([],a,actor,raw,expected)],['foreign-event-row',()=>persisted([{...row,event_id:request}],a,actor,raw,expected)],
  ['foreign-org-row',()=>persisted([{...row,org_id:event}],a,actor,raw,expected)],['wrong-source-MIME',()=>persisted([{...row,source_mime:'image/jpeg'}],a,actor,raw,expected)],['timestamp-rounded',()=>persisted([{...row,created_at_matches_meta:false}],a,actor,raw,expected)],
  ['different-render-bytes',()=>encoded({...r,bytes:Buffer.from('changed bytes')},a)],['missing-private-headers',()=>encoded({...r,headers:new Headers({'content-type':'image/webp'})},a)],
  ['rewritten-published-receipt',()=>samePublished({receipt:'exact'},{receipt:'changed'})]];
 const witnessed=[];for(const [name,fn] of broken){let failed=false;try{fn();}catch(e){if(!(e instanceof assert.AssertionError))throw e;failed=true;}assert.ok(failed,'Broken control was not rejected: '+name);witnessed.push(name);}
 record({stage:'observation-oracle-negative-controls',positiveWitnesses:4,rejected:witnessed,applicationMutationEvidence:false});
}
