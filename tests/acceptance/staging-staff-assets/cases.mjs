import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ids,login,create,openFields,futureFields,completeLot,uuid,capability,upload,binary,path,compact,save,reload,approve,enroll009,recovered,denied,sessionHash,functions} from './protocol.mjs';
import {assetUUID,hash,meta,neutral,encoded,decoded,persisted,samePublished} from './oracles.mjs';
import {composeNative,board,ui,generationRaces,parserDenialControls} from './native.mjs';
import {bounded,waitBlocked} from './fixture.mjs';
import {HarnessError} from '../staging-catalog/harness.mjs';
import {sqlGuards,sqlAuthority,readCommitFailure,putRollback,quotaControls} from './sql-controls.mjs';
export const manifest=JSON.parse(await readFile(new URL('./fixtures/manifest.json',import.meta.url),'utf8')).fixtures;
export const files={cover:manifest.find(f=>f.name==='cover-exif.jpg'),sponsor:manifest.find(f=>f.name==='sponsor-alpha.png'),item:manifest.find(f=>f.name==='item.webp')};
export async function health(f,record){
 let actor,packet;try{actor=await login(f);packet=await create(f,actor,'Synthetic ASSETS independent health');
 assert.equal((await f.request('/api/session',{cookie:actor.cookie})).status,200);const roundtrip=await reload(f,actor,packet.event.id);assert.equal(roundtrip.event.id,packet.event.id);
 }catch(e){if(e instanceof assert.AssertionError)throw new HarnessError('Released375 staff/session/event prerequisite did not pass:99.');throw e;}
 record({stage:'existing375-health',session:true,eventId:packet.event.id,revision:packet.revision,migrationPresent:f.migrationPresent});return {actor,packet};
}
const rows=(f,ref,createdAt=null)=>f.db.query('SELECT *,created_at=$2::timestamptz AS created_at_matches_meta FROM public.bz_staff_assets WHERE id=$1',[assetUUID(ref),createdAt]).then(r=>r.rows);
const count=(f,event)=>f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets WHERE event_id=$1',[event]).then(r=>r.rows[0].n);
async function fingerprint(f,event){
 const result={};for(const [table,where] of [['bz_catalog_approvals','event_id'],['bz_catalog_lots','event_id'],['bz_manual_bids','event_id']]){
   const r=await f.db.query('SELECT row_to_json(t)::text AS value FROM public.'+table+' t WHERE '+where+'=$1 ORDER BY row_to_json(t)::text',[event]);result[table]=r.rows.map(row=>hash(row.value));}
 const receipts=await f.db.query("SELECT row_to_json(t)::text AS value FROM public.bz_requests t WHERE operation=$1 ORDER BY actor_id,operation,request_id",['catalog-approval:'+event]);
 result.approvedReceipts=receipts.rows.map(r=>hash(r.value));assert.ok(result.approvedReceipts.length>0);
 result.bidReceipts=(await f.db.query('SELECT row_to_json(t)::text AS value FROM public.bz_bid_receipts t ORDER BY actor_id,request_id')).rows.map(r=>hash(r.value));return result;
}
export async function journey(f,record){
 const {actor,packet}=await health(f,record);await capability(f,actor,packet,files.cover,record);
 const pkg=JSON.parse(await readFile(f.repo+'/package.json','utf8'));assert.equal(pkg.dependencies.sharp,'0.35.5','The production decoder must be a declared direct dependency.');
 const result=await composeNative(f,actor,files,await openFields(f),record),{packet:savedPacket,approval,assets}=result,event=savedPacket.event.id;
 const viewer=await enroll009(f,event);
 // One released003 synthetic bid proves actual accepted history preservation;
 // it does not select a new production financial rule.
 const bid=await f.request('/api/bidder/events/'+event+'/lots/'+savedPacket.lots[0].id+'/bids',{method:'POST',cookie:viewer.cookie,headers:{origin:f.origin},json:{requestId:uuid(),businessId:viewer.business,amountMinor:2500,rulesetId:'staging-usd-manual-v1'}});
 assert.equal(bid.status,201);const before=await fingerprint(f,event);assert.ok(before.bz_manual_bids.length>0&&before.bidReceipts.length>0);
 for(const [name,a] of Object.entries(assets)){
   const raw=await readFile(new URL('./fixtures/'+files[name].name,import.meta.url));persisted(await rows(f,a.ref,a.createdAt),a,ids.staff,raw,{eventId:event,orgId:ids.saturn,sourceMime:files[name].mime});
   for(const url of [path.own(event,a.requestId),path.saved(event,assetUUID(a.ref)),path.approved(event,approval.id,assetUUID(a.ref)),path.published(event,approval.id,assetUUID(a.ref))]){
     const r=await binary(f,url,{cookie:url.includes('/api/catalog/')?viewer.cookie:actor.cookie});encoded(r,a);record({stage:'same-normalized-bytes',name,path:url,...await decoded(r.bytes,a,files[name])});
   }
 }
 await board(f,viewer,event,assets.item.ref,record,'uploaded-010-phone');
 const next=await upload(f,actor,event,files.sponsor);assert.equal(next.response.status,201);assert.notEqual(next.asset.ref,assets.item.ref);
 const working=compact(savedPacket);working.lots[0].image=next.asset.ref;working.lots[0].alt='Replacement transparent item image';
 const changed=await save(f,actor,savedPacket,working);assert.equal((await reload(f,actor,event)).lots[0].image,next.asset.ref);
 samePublished(before,await fingerprint(f,event));encoded(await binary(f,path.published(event,approval.id,assetUUID(assets.item.ref)),{cookie:viewer.cookie}),assets.item);
 await denied(f,path.published(event,approval.id,assetUUID(next.asset.ref)),viewer);
 // Existing no-photo publication is a preserved product capability.
 const empty=await create(f,actor,'Optional-photo synthetic event');const fields=await openFields(f);fields.cover=null;fields.sponsorsEnabled=false;fields.sponsors=[];
 const noPhoto={...completeLot('Optional-photo synthetic lot'),image:null,alt:''};const p=await save(f,actor,empty,{event:fields,lots:[noPhoto]});await approve(f,actor,p);
 record({stage:'immutable-replacement-and-optional-photo',event,oldRef:assets.item.ref,newRef:next.asset.ref,oldSnapshotUnchanged:true,optionalPhotoEvent:p.event.id,revision:changed.revision});
}
export async function content(f,record){
 const {actor,packet}=await health(f,record),u=await capability(f,actor,packet,files.cover,record);
 encoded(await binary(f,path.own(packet.event.id,u.requestId),{cookie:actor.cookie}),u.asset);
 for(const file of manifest.filter(v=>!v.status)){const value=await upload(f,actor,packet.event.id,file);assert.equal(value.response.status,201);
   const r=await binary(f,path.own(packet.event.id,value.requestId),{cookie:actor.cookie});encoded(r,value.asset);record({stage:'decode',file:file.name,...await decoded(r.bytes,value.asset,file)});}
 for(const file of manifest.filter(v=>v.status)){
   const before=await count(f,packet.event.id),value=await upload(f,actor,packet.event.id,file);neutral(value.response,file.status,file.code);assert.equal(await count(f,packet.event.id),before);
   record({stage:'rejected-content',file:file.name,status:value.response.status,inserted:0});
 }
 const mismatch=await upload(f,actor,packet.event.id,files.cover,uuid(),{'content-type':'image/png'});neutral(mismatch.response,415,'ASSET_INVALID');
 const raw=await readFile(new URL('./fixtures/sponsor-alpha.png',import.meta.url));
 const huge=await upload(f,actor,packet.event.id,Buffer.concat([raw,Buffer.alloc(2097153-raw.length)]));neutral(huge.response,413,'ASSET_TOO_LARGE');
 for(const mime of ['image/svg+xml','application/json','image/png; charset=utf-8']){const r=await upload(f,actor,packet.event.id,files.sponsor,uuid(),{'content-type':mime});neutral(r.response,415,'ASSET_INVALID');}
 // Streamed overflow has no Content-Length; counting header claims is insufficient.
 const stream=new ReadableStream({start(c){c.enqueue(Buffer.alloc(1048576));c.enqueue(Buffer.alloc(1048576));c.enqueue(Buffer.alloc(1));c.close();}});
 const overflow=await binary(f,path.upload(packet.event.id),{method:'POST',body:stream,cookie:actor.cookie,headers:{origin:f.origin,'content-type':'image/png','x-bidzizi-request-id':uuid()}});neutral(overflow,413,'ASSET_TOO_LARGE');
 const slow=new ReadableStream({start(c){c.enqueue(raw.subarray(0,16));},cancel(){}});
 const start=Date.now(),timed=await binary(f,path.upload(packet.event.id),{method:'POST',body:slow,cookie:actor.cookie,headers:{origin:f.origin,'content-type':'image/png','x-bidzizi-request-id':uuid()}});neutral(timed,408,'UPLOAD_TIMEOUT');assert.ok(Date.now()-start>=9000&&Date.now()-start<17000);
 const unknownField=await f.request('/api/admin/events/'+packet.event.id,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:packet.revision,requestId:uuid(),draft:{...compact(packet),fetchURL:'https://example.invalid/file.png'}}});neutral(unknownField,400,'VALIDATION');
 const r=await rows(f,u.asset.ref);record({stage:'SQL-envelope-is-not-decoder',sourceDigest:r[0].source_sha256,normalizedDigest:r[0].sha256,rawNotStored:r[0].source_sha256!==r[0].sha256});
}
export async function recovery(f,record){
 const {actor,packet}=await health(f,record),u=await capability(f,actor,packet,files.sponsor,record),event=packet.event.id;
 const nextSession=await login(f);assert.deepEqual(await recovered(f,nextSession,event,u.requestId),u.asset);
 const replay=await upload(f,nextSession,event,files.sponsor,u.requestId);assert.equal(replay.response.status,200);assert.deepEqual(replay.asset,u.asset);assert.equal(await count(f,event),1);
 const changed=await upload(f,actor,event,files.item,u.requestId);neutral(changed.response,409,'IDEMPOTENCY_CONFLICT');assert.equal(await count(f,event),1);
 const unknown=await f.request(path.recover(event,uuid()),{cookie:actor.cookie});neutral(unknown,404,'ASSET_UPLOAD_NOT_FOUND');
 // Native response loss occurs only after the independently observed commit.
 const n=await ui(f,actor);await n.page.goto(f.origin+'/admin?event='+event);let committed,requestId;
 await n.page.route('**/api/admin/events/'+event+'/assets',async route=>{const r=await route.fetch(),data=await r.json();committed=meta(data,event,data.asset?.requestId);requestId=committed.requestId;await route.abort('failed');});
 const input=n.studio.getByLabel('Upload event photo',{exact:true});assert.equal(await input.count(),1);await input.setInputFiles(f.repo+'/tests/acceptance/staging-staff-assets/fixtures/cover-exif.jpg');
 const end=Date.now()+10000;while(!committed&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert.ok(committed,'Lost reply must have an actual durable commit.');
 await n.page.unroute('**/api/admin/events/'+event+'/assets');await n.page.reload();
 const end2=Date.now()+10000;while(Date.now()<end2){const list=(await f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets WHERE uploaded_by=$1 AND event_id=$2 AND request_id=$3',[ids.staff,event,requestId])).rows;assert.equal(list[0].n,1);const p=await reload(f,actor,event);assert.equal(p.event.cover,null);if(await n.studio.locator('[data-asset-recovery="confirmed"]').count())break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await n.studio.locator('[data-asset-recovery="confirmed"]').count(),1,'Reload must recover the owned pending descriptor without falsely saving the draft.');
 assert.deepEqual(await recovered(f,actor,event,requestId),committed);await f.capture(n.page,'owned-upload-loss-recovery');
 // Failed Save cannot advance saved A to an uploaded-but-unsaved reference.
 const draft=compact(packet);draft.event.cover=u.asset.ref;draft.event.coverAlt='Synthetic confirmed upload, unsaved draft';
 const conflict=await f.request('/api/admin/events/'+event,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:999,requestId:uuid(),draft}});assert.equal(conflict.status,409);assert.equal((await reload(f,actor,event)).event.cover,null);
 record({stage:'owned-recovery-and-loss',event,requestId,exactlyOneRow:true,originalSavedCover:null,confirmedUnattachedRef:committed.ref});
 await generationRaces(f,actor,files.item,record);
}
export async function authorization(f,record){
 const {actor,packet}=await health(f,record),u=await capability(f,actor,packet,files.item,record),event=packet.event.id,a=u.asset;
 const outsider=await login(f,'staff-pine'),bidder=await login(f,'bidder-juniper');
 await denied(f,path.own(event,u.requestId),null,401,'UNAUTHENTICATED');await denied(f,path.own(event,u.requestId),outsider);await denied(f,path.own(event,u.requestId),bidder);
 await f.db.query('INSERT INTO public.bz_staff_grants(person_id,org_id,active) VALUES($1,$2,true)',[ids.outsider,ids.saturn]);
 try{await denied(f,path.own(event,u.requestId),outsider);const receipt=await f.request(path.recover(event,u.requestId),{cookie:outsider.cookie});neutral(receipt,404,'ASSET_UPLOAD_NOT_FOUND');}
 finally{await f.db.query('DELETE FROM public.bz_staff_grants WHERE person_id=$1 AND org_id=$2',[ids.outsider,ids.saturn]);}
 await denied(f,path.saved(event,assetUUID(a.ref)),actor);await denied(f,path.own(event,uuid()),actor);
 const otherEvent=await create(f,actor,'Same-org other event');await denied(f,path.own(otherEvent.event.id,u.requestId),actor);
 for(const [who,status,code] of [[null,401,'UNAUTHENTICATED'],[bidder,403,'FORBIDDEN'],[outsider,403,'FORBIDDEN']]){const r=await upload(f,who||{cookie:''},event,files.item);neutral(r.response,status,code);}
 const origin=await upload(f,actor,event,files.item,uuid(),{origin:'https://foreign.invalid'});neutral(origin.response,403,'FORBIDDEN');
 const d={event:{...await openFields(f),cover:a.ref,coverAlt:'Saved synthetic photo'},lots:[{...completeLot(),image:a.ref,alt:'Saved synthetic item'}]};
 const saved=await save(f,actor,packet,d),p=await approve(f,actor,saved),viewer=await enroll009(f,event);
 assert.deepEqual(f.inheritedSqlAfter,f.inheritedSqlBefore,'016 must preserve inherited SQL definitions, ownership and ACLs exactly.');
 assert.deepEqual(f.inheritedPermissionAfter,f.inheritedPermissionBefore,'016 must preserve inherited relation/column/default ACLs, role flags and memberships after hostile defaults and before new EXECUTEs.');
 record({stage:'016-existing-permissions-preserved',inheritedFunctions:f.inheritedSqlBefore.length,relations:f.inheritedPermissionBefore.relations.length,columns:f.inheritedPermissionBefore.columns.length,defaultACLsExact:true,roleFlagsAndMembershipsExact:true});
 await sqlAuthority(f,actor,viewer,event,p,a,record);
 for(const alt of ['', '   ', 'x'.repeat(301), '\u0000']){const badAlt=compact(saved);badAlt.event.coverAlt=alt;
   const result=await f.request('/api/admin/events/'+event,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:saved.revision,requestId:uuid(),draft:badAlt}});assert.equal(result.status,400);}
 await parserDenialControls(f,viewer,event,record);
 encoded(await binary(f,path.saved(event,assetUUID(a.ref)),{cookie:actor.cookie}),a);encoded(await binary(f,path.published(event,p.id,assetUUID(a.ref)),{cookie:viewer.cookie}),a);
 for(const url of [path.published(event,uuid(),assetUUID(a.ref)),path.published(event,p.id,uuid()),path.published(otherEvent.event.id,p.id,assetUUID(a.ref)),path.saved(event,assetUUID(a.ref))+'?context=published&approvalId='+p.id])await denied(f,url,viewer);
 const foreign=await upload(f,actor,otherEvent.event.id,files.sponsor);assert.equal(foreign.response.status,201);
 const invalid=compact(saved);invalid.lots[0].image=foreign.asset.ref;
 const bad=await f.request('/api/admin/events/'+event,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:saved.revision,requestId:uuid(),draft:invalid}});assert.equal(bad.status,400);assert.equal((await reload(f,actor,event)).revision,saved.revision);
 for(const ref of ['asset:'+assetUUID(a.ref).toUpperCase(),'asset:../'+assetUUID(a.ref),'https://foreign.invalid/a.png','data:image/png;base64,AA==']){
   const badDraft=compact(saved);badDraft.event.cover=ref;const r=await f.request('/api/admin/events/'+event,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:saved.revision,requestId:uuid(),draft:badDraft}});assert.equal(r.status,400);}
 for(const field of ['active','is_test']){await f.db.query('UPDATE public.bz_people SET '+field+'=false WHERE id=$1',[ids.staff]);
   try{await denied(f,path.saved(event,assetUUID(a.ref)),actor,401,'UNAUTHENTICATED');}finally{await f.db.query('UPDATE public.bz_people SET '+field+'=true WHERE id=$1',[ids.staff]);}}
 const future=await create(f,actor,'Rehearsal pre-opening image visibility control'),cover=await upload(f,actor,future.event.id,files.cover),item=await upload(f,actor,future.event.id,files.item);
 assert.equal(cover.response.status,201);assert.equal(item.response.status,201);
 const beforeOpen=await save(f,actor,future,{event:{...await futureFields(f),cover:cover.asset.ref,coverAlt:'Synthetic exposed header cover'},lots:[{...completeLot(),image:item.asset.ref,alt:'Synthetic item visible before opening'}]});
 const futureApproval=await approve(f,actor,beforeOpen),futureViewer=await enroll009(f,beforeOpen.event.id);
 const projection=await f.request('/api/catalog/events/'+beforeOpen.event.id,{cookie:futureViewer.cookie});assert.equal(projection.status,200);assert.equal(projection.data.phase,'scheduled');assert.equal(projection.data.catalog?.approvalId,futureApproval.id);
 assert.ok(projection.data.catalog.lots.some(lot=>lot.image===item.asset.ref),'An admitted attendee sees the published item before opening.');
 encoded(await binary(f,path.published(beforeOpen.event.id,futureApproval.id,assetUUID(cover.asset.ref)),{cookie:futureViewer.cookie}),cover.asset);
 encoded(await binary(f,path.published(beforeOpen.event.id,futureApproval.id,assetUUID(item.asset.ref)),{cookie:futureViewer.cookie}),item.asset);
 record({stage:'approved-pre-open-published-images',scheduledHeaderReadable:true,scheduledItemReadable:true,unauthorizedStillDenied:true});
 await f.db.query('UPDATE public.bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[viewer.person,event]);await denied(f,path.published(event,p.id,assetUUID(a.ref)),viewer);
 await f.db.query('UPDATE public.bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[sessionHash(actor)]);await denied(f,path.saved(event,assetUUID(a.ref)),actor,401,'UNAUTHENTICATED');
 for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])assert.equal((await f.db.query('SELECT has_table_privilege($1,$2,$3) AS ok',[f.runtimeRole,'public.bz_staff_assets',privilege])).rows[0].ok,false,'Effective runtime table privilege '+privilege);
 const columns=(await f.db.query("SELECT attname FROM pg_attribute WHERE attrelid='public.bz_staff_assets'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows.map(r=>r.attname);
 for(const column of columns)for(const privilege of ['SELECT','INSERT','UPDATE','REFERENCES'])assert.equal((await f.db.query('SELECT has_column_privilege($1,$2,$3,$4) AS ok',[f.runtimeRole,'public.bz_staff_assets',column,privilege])).rows[0].ok,false,'Effective runtime column privilege '+column+' '+privilege);
 const triggers=(await f.db.query("SELECT DISTINCT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,has_function_privilege($1,p.oid,'EXECUTE') AS runtime_execute,coalesce((SELECT bool_or(a.grantee=0 AND a.privilege_type='EXECUTE') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false) AS public_execute FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.bz_staff_assets'::regclass AND NOT t.tgisinternal",[f.runtimeRole])).rows;
 assert.ok(triggers.length>0,'The immutable asset trigger must exist.');for(const t of triggers){assert.equal(t.owner,f.migratorRole);assert.equal(t.runtime_execute,false);assert.equal(t.public_execute,false);}
 const acl=(await f.db.query("SELECT p.oid::regprocedure::text AS signature,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,coalesce((SELECT bool_or(a.grantee=0 AND a.privilege_type='EXECUTE') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false) AS public_execute FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[])",[functions])).rows;
 assert.equal(acl.length,4);for(const r of acl){assert.equal(r.owner,f.migratorRole);assert.equal(r.prosecdef,true);assert.equal(r.public_execute,false);assert.ok(r.proconfig?.includes('search_path=pg_catalog, pg_temp')||r.proconfig?.includes('search_path=pg_catalog,pg_temp'));}
 for(const verb of ['UPDATE public.bz_staff_assets SET width=width','DELETE FROM public.bz_staff_assets']){await f.db.query('BEGIN');try{let failed=false;try{await f.db.query(verb);}catch{failed=true;}assert.ok(failed,'Immutable trigger must reject even owner writes.');}finally{await f.db.query('ROLLBACK');}}
 record({stage:'auth-context-ACL',foreignReferenceAtomic:true,runtimeDirectTableGrants:false,publicFunctionExecute:false,owners:acl.map(r=>({signature:r.signature,owner:r.owner}))});
}
export async function sqlAndQuota(f,record){
 const {actor,packet}=await health(f,record),u=await capability(f,actor,packet,files.sponsor,record);
 record({stage:'SQL-format-and-TABLE-transport',...await sqlGuards(f,actor,packet.event.id,u.asset)});
 record({stage:'read-awaits-complete-commit',...await readCommitFailure(f,actor,packet.event.id,u.asset)});
 record({stage:'put-atomic-failure',...await putRollback(f,actor,packet.event.id,files.item)});
 record({stage:'serialized-quota-boundaries',...await quotaControls(f,actor,packet.event.id,u.asset)});
}
export async function regression(f,record){
 const {actor,packet}=await health(f,record),fields=await openFields(f),lot=completeLot('Released375 fixed-photo item','coffee');
 const p=await save(f,actor,packet,{event:fields,lots:[lot]}),approval=await approve(f,actor,p);
 const claims={name:'Duplicate Synthetic Name',businessName:'Duplicate Synthetic Business',memberId:'DUPLICATE-SYNTHETIC-ID'};
 const one=await enroll009(f,p.event.id,claims),two=await enroll009(f,p.event.id,claims);assert.notEqual(one.person,two.person);assert.notEqual(one.business,two.business);
 const entries=(await f.db.query('SELECT consumed_at,person_id,business_id FROM public.bz_demo_entry_slots WHERE id=ANY($1::uuid[])',[ [one.entryId,two.entryId] ])).rows;
 assert.equal(entries.length,2);assert.ok(entries.every(e=>e.consumed_at&&e.person_id&&e.business_id));
 const audience=await f.request('/api/catalog/events/'+p.event.id,{cookie:one.cookie});assert.equal(audience.status,200);assert.equal(audience.data.catalog.lots[0].image,lot.image);
 await board(f,one,p.event.id,null,record,'release375-fixed-010-phone');
 const old=(await f.db.query('SELECT response::text AS value FROM public.bz_requests WHERE operation=$1',['catalog-approval:'+p.event.id])).rows.map(r=>hash(r.value));
 const next=compact(p);next.event.name='Edited synthetic draft after existing approval';const changed=await save(f,actor,p,next);assert.equal(changed.revision,p.revision+1);
 assert.deepEqual((await f.db.query('SELECT response::text AS value FROM public.bz_requests WHERE operation=$1',['catalog-approval:'+p.event.id])).rows.map(r=>hash(r.value)),old);
 const raw=await binary(f,'/staging-bidder-preview/'+lot.image);assert.equal(raw.status,200);assert.equal(hash(raw.bytes),hash(await readFile(f.repo+'/public/staging-bidder-preview/'+lot.image)));
 const anonymous=await f.request('/api/catalog/events/'+p.event.id);assert.equal(anonymous.status,401);
 await f.db.query('UPDATE public.bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[one.person,p.event.id]);assert.equal((await f.request('/api/catalog/events/'+p.event.id,{cookie:one.cookie})).status,403);
 record({stage:'released375-regression',approval:approval.id,fixedPhoto:lot.image,distinct009Profiles:true,ackConsumed:true,oldReceiptExact:true,anonymousDenied:true,currentVIEWDenied:true});
}
