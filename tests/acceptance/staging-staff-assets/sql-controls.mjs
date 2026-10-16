import assert from 'node:assert/strict';
import {login,create,uuid,sessionHash,functions,binary,path,upload} from './protocol.mjs';
import {assetUUID,neutral,hash} from './oracles.mjs';
// Every call below executes as the actual restricted runtime role. HTTP
// authentication cannot hide a missing SECURITY DEFINER authority predicate.
export async function sqlAuthority(f,actor,viewer,event,approval,asset,record){
 const id=assetUUID(asset.ref),staffHash=sessionHash(actor),viewerHash=sessionHash(viewer);
 const stored=(await f.db.query('SELECT * FROM public.bz_staff_assets WHERE id=$1',[id])).rows[0];
 const staffPerson=stored.uploaded_by;
 const putArgs=request=>[staffHash,event,request,stored.source_mime,stored.source_size,stored.source_sha256,stored.bytes,stored.width,stored.height];
 const json=async(name,args)=>{const r=await f.sqlRuntime('SELECT public.bz_staff_asset_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS value',args);assert.equal(r.rows.length,1);const v=r.rows[0].value;assert.ok(v!==null&&typeof v==='object'&&!Array.isArray(v));return v;};
 const read=async(h,context,binding)=>f.sqlRuntime('SELECT * FROM public.bz_staff_asset_read($1,$2,$3,$4,$5)',[h,event,id,context,binding]);
 const contexts=[['upload',asset.requestId],['saved',null],['staff-approved',approval.id]];
 const deniedRead=async(h,context,binding,state)=>{let caught;try{await read(h,context,binding);}catch(e){caught=e;}assert.equal(caught?.code,state);assert.equal(caught.detail,undefined);assert.equal(caught.hint,undefined);};
 async function positive(){
  const put=await json('put',putArgs(asset.requestId)),recovery=await json('recover',[staffHash,event,asset.requestId]);
  for(const v of [put,recovery]){assert.ok(v.asset!==null&&typeof v.asset==='object'&&!Array.isArray(v.asset));assert.equal(v.asset.ref,asset.ref);}
  assert.deepEqual(await json('validate',[staffHash,event,[id]]),{valid:true});
  for(const [h,context,binding] of [...contexts.map(([c,b])=>[staffHash,c,b]),[viewerHash,'published',approval.id]]){const r=await read(h,context,binding);assert.equal(r.rows.length,1);assert.ok(Buffer.isBuffer(r.rows[0].bytes));assert.equal(hash(r.rows[0].bytes),asset.sha256);}
 }
 const fingerprint=async()=>(await f.db.query('SELECT row_to_json(a)::text AS value FROM public.bz_staff_assets a ORDER BY id')).rows.map(r=>hash(r.value));
 await positive();const before=await fingerprint();
 const staffSession=(await f.db.query('SELECT expires_at,revoked_at FROM public.bz_sessions WHERE token_hash=$1',[staffHash])).rows[0];
 const staffGrant=(await f.db.query('SELECT active FROM public.bz_staff_grants WHERE person_id=$1 AND org_id=$2',[staffPerson,stored.org_id])).rows[0];
 const mutations=[
  ['staff-session-revoked',()=>f.db.query('UPDATE public.bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[staffHash]),()=>f.db.query('UPDATE public.bz_sessions SET revoked_at=$2 WHERE token_hash=$1',[staffHash,staffSession.revoked_at]),'PBA02'],
  ['staff-session-expired',()=>f.db.query("UPDATE public.bz_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[staffHash]),()=>f.db.query('UPDATE public.bz_sessions SET expires_at=$2 WHERE token_hash=$1',[staffHash,staffSession.expires_at]),'PBA02'],
  ...['active','is_test'].map(field=>['staff-person-'+field,()=>f.db.query('UPDATE public.bz_people SET '+field+'=false WHERE id=$1',[staffPerson]),()=>f.db.query('UPDATE public.bz_people SET '+field+'=true WHERE id=$1',[staffPerson]),'PBA02']),
  ['staff-grant-inactive',()=>f.db.query('UPDATE public.bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[staffPerson,stored.org_id]),()=>f.db.query('UPDATE public.bz_staff_grants SET active=$3 WHERE person_id=$1 AND org_id=$2',[staffPerson,stored.org_id,staffGrant.active]),'PBA03'],
  ['staff-grant-absent',()=>f.db.query('DELETE FROM public.bz_staff_grants WHERE person_id=$1 AND org_id=$2',[staffPerson,stored.org_id]),()=>f.db.query('INSERT INTO public.bz_staff_grants(person_id,org_id,active) VALUES($1,$2,$3)',[staffPerson,stored.org_id,staffGrant.active]),'PBA03'],
 ];
 for(const [label,change,restore,state] of mutations){await positive();await change();try{
   for(const request of [asset.requestId,uuid()])assert.deepEqual(await json('put',putArgs(request)),{error:'DENIED'});
   assert.deepEqual(await json('recover',[staffHash,event,asset.requestId]),{error:'DENIED'});
   assert.deepEqual(await json('validate',[staffHash,event,[id]]),{error:'DENIED'});
   for(const [context,binding] of contexts)await deniedRead(staffHash,context,binding,state);
   assert.deepEqual(await fingerprint(),before);record({stage:'direct-SQL-authority',control:label,putReplayAndFreshDenied:true,recoverValidateDenied:true,readContexts:contexts.map(c=>c[0]),sqlState:state,bytesOnDenial:0});
  }finally{await restore();}await positive();}
 const vSession=(await f.db.query('SELECT expires_at,revoked_at FROM public.bz_sessions WHERE token_hash=$1',[viewerHash])).rows[0];
 const viewGrant=(await f.db.query('SELECT active FROM public.bz_event_view_grants WHERE person_id=$1 AND event_id=$2',[viewer.person,event])).rows[0];
 const views=[
  ['VIEW-session-revoked',()=>f.db.query('UPDATE public.bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[viewerHash]),()=>f.db.query('UPDATE public.bz_sessions SET revoked_at=$2 WHERE token_hash=$1',[viewerHash,vSession.revoked_at]),'PBA02'],
  ['VIEW-session-expired',()=>f.db.query("UPDATE public.bz_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[viewerHash]),()=>f.db.query('UPDATE public.bz_sessions SET expires_at=$2 WHERE token_hash=$1',[viewerHash,vSession.expires_at]),'PBA02'],
  ...['active','is_test'].map(field=>['VIEW-person-'+field,()=>f.db.query('UPDATE public.bz_people SET '+field+'=false WHERE id=$1',[viewer.person]),()=>f.db.query('UPDATE public.bz_people SET '+field+'=true WHERE id=$1',[viewer.person]),'PBA02']),
  ['VIEW-grant-inactive',()=>f.db.query('UPDATE public.bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[viewer.person,event]),()=>f.db.query('UPDATE public.bz_event_view_grants SET active=$3 WHERE person_id=$1 AND event_id=$2',[viewer.person,event,viewGrant.active]),'PBA03'],
  ['VIEW-grant-absent',()=>f.db.query('DELETE FROM public.bz_event_view_grants WHERE person_id=$1 AND event_id=$2',[viewer.person,event]),()=>f.db.query('INSERT INTO public.bz_event_view_grants(person_id,event_id,active) VALUES($1,$2,$3)',[viewer.person,event,viewGrant.active]),'PBA03'],
 ];
 for(const [label,change,restore,state] of views){await positive();await change();try{await deniedRead(viewerHash,'published',approval.id,state);assert.deepEqual(await fingerprint(),before);record({stage:'direct-SQL-authority',control:label,readContext:'published',sqlState:state,bytesOnDenial:0});}finally{await restore();}await positive();}
 // An active authenticated VIEW actor still has no staff mutation authority.
 const viewerPut=putArgs(uuid());viewerPut[0]=viewerHash;
 assert.deepEqual(await json('put',viewerPut),{error:'DENIED'});
 assert.deepEqual(await json('recover',[viewerHash,event,asset.requestId]),{error:'DENIED'});
 assert.deepEqual(await json('validate',[viewerHash,event,[id]]),{error:'DENIED'});
 for(const [context,binding] of contexts)await deniedRead(viewerHash,context,binding,'PBA03');
 assert.deepEqual(await fingerprint(),before);
}
export async function sqlGuards(f,actor,event,asset){
 const h=sessionHash(actor),id=assetUUID(asset.ref);
 for(const [args,state] of [[[null,event,id,'saved',null],'PBA01'],[[h,event,id,'saved',uuid()],'PBA01'],[[h,event,id,'unknown',uuid()],'PBA03'],[['0'.repeat(64),event,id,'saved',null],'PBA02'],[[h,event,uuid(),'saved',null],'PBA03']]){
   let error;try{await f.sqlRuntime('SELECT * FROM public.bz_staff_asset_read($1,$2,$3,$4,$5)',args);}catch(e){error=e;}
   assert.equal(error?.code,state,'Exact TABLE-read failure SQLSTATE');assert.equal(error.detail,undefined);assert.equal(error.hint,undefined);
 }
 for(const refs of [null,[null],[id,id],Array(122).fill(id)]){
   const r=await f.sqlRuntime('SELECT public.bz_staff_asset_validate($1,$2,$3::uuid[]) AS value',[h,event,refs]);assert.deepEqual(r.rows[0].value,{error:'INVALID'});
 }
 const valid=await f.sqlRuntime('SELECT public.bz_staff_asset_validate($1,$2,$3::uuid[]) AS value',[h,event,[]]);assert.deepEqual(valid.rows[0].value,{valid:true});
 const existing=(await f.db.query('SELECT bytes,width,height,source_mime,source_size,source_sha256 FROM public.bz_staff_assets WHERE id=$1',[id])).rows[0];
 const args=[h,event,uuid(),existing.source_mime,existing.source_size,existing.source_sha256,existing.bytes,existing.width,existing.height];
 for(const [slot,value] of [[0,null],[1,null],[2,null],[3,'image/svg+xml'],[4,0],[4,2097153],[5,'ABC'],[6,Buffer.from('not-webp')],[7,1601],[8,0]]){
   const bad=[...args];bad[slot]=value;const r=await f.sqlRuntime('SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',bad);assert.deepEqual(r.rows[0].value,{error:'INVALID'});
 }
 const badEnvelope=Buffer.from(existing.bytes);badEnvelope.writeUInt32LE(0,4);const badArgs=[...args];badArgs[6]=badEnvelope;
 assert.deepEqual((await f.sqlRuntime('SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',badArgs)).rows[0].value,{error:'INVALID'});
 // Existing SQL envelope acceptance is explicitly not a complete image decoder.
 return {readReservedStates:['PBA01','PBA02','PBA03'],nullArrayAndRangeRejected:true,sqlDoesNotDecodeRaster:true};
}
export async function readCommitFailure(f,actor,event,asset){
 // Controlled failure instrumentation in this disposable DB only. Rename the
 // actual candidate read function, wrap that same implementation, then defer a
 // failure until COMMIT. This is not a shadow image implementation or success
 // fixture: the only accepted observation is503 with zero image bytes.
 const original=functions[3],renamed='public.evidence_assets_real_read(text,uuid,uuid,text,uuid)';
 await f.db.query('BEGIN');try{
   await f.db.query('ALTER FUNCTION '+original+' RENAME TO evidence_assets_real_read');
   await f.db.query("CREATE TABLE public.evidence_assets_commit_probe(id integer); CREATE FUNCTION public.evidence_assets_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_PROVIDER_DETAIL_MUST_NOT_ESCAPE' USING ERRCODE='40001'; END $$; CREATE CONSTRAINT TRIGGER evidence_assets_fail_commit AFTER INSERT ON public.evidence_assets_commit_probe DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.evidence_assets_commit_fail()");
   await f.db.query('CREATE FUNCTION '+original+" RETURNS TABLE(mime text,width integer,height integer,byte_length integer,sha256 text,bytes bytea) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ BEGIN RETURN QUERY SELECT * FROM public.evidence_assets_real_read($1,$2,$3,$4,$5); INSERT INTO public.evidence_assets_commit_probe VALUES(1); END $$");
   await f.db.query('REVOKE ALL ON FUNCTION '+original+' FROM PUBLIC; GRANT EXECUTE ON FUNCTION '+original+' TO '+f.runtimeRole);await f.db.query('COMMIT');
 }catch(e){await f.db.query('ROLLBACK');throw e;}
 try{const r=await binary(f,path.own(event,asset.requestId),{cookie:actor.cookie});neutral(r,503,'UNAVAILABLE');assert.ok(!r.text.includes('SYNTHETIC_PROVIDER_DETAIL'));return {forcedDeferredCommitFailure:true,status:r.status,imageBytes:0};}
 finally{await f.db.query('BEGIN');try{await f.db.query('DROP FUNCTION '+original+'; ALTER FUNCTION '+renamed+' RENAME TO bz_staff_asset_read; DROP TABLE public.evidence_assets_commit_probe; DROP FUNCTION public.evidence_assets_commit_fail(); COMMIT');}catch(e){await f.db.query('ROLLBACK');throw e;}}
}
export async function putRollback(f,actor,event,file){
 await f.db.query("CREATE FUNCTION public.evidence_asset_insert_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_INSERT_FAILURE'; END $$; CREATE TRIGGER evidence_asset_insert_fail BEFORE INSERT ON public.bz_staff_assets FOR EACH ROW EXECUTE FUNCTION public.evidence_asset_insert_fail()");
 try{const before=(await f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets WHERE event_id=$1',[event])).rows[0].n;
   const r=await upload(f,actor,event,file);neutral(r.response,503,'UNAVAILABLE');assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets WHERE event_id=$1',[event])).rows[0].n,before);return {forcedInsertRollback:true,status:r.response.status};}
 finally{await f.db.query('DROP TRIGGER evidence_asset_insert_fail ON public.bz_staff_assets; DROP FUNCTION public.evidence_asset_insert_fail()');}
}
export async function quotaControls(f,actor,event,asset){
 const base=(await f.db.query('SELECT * FROM public.bz_staff_assets WHERE id=$1',[assetUUID(asset.ref)])).rows[0];
 // Adversarial resource occupancy only. These filler rows are never offered as
 // uploaded fixtures, rendered images or application-success evidence.
 const add=(e,n,bytes=base.bytes)=>f.db.query("INSERT INTO public.bz_staff_assets(event_id,org_id,uploaded_by,request_id,source_mime,source_size,source_sha256,normalization_version,mime,width,height,bytes) SELECT $1,$2,$3,gen_random_uuid(),$4,$5,$6,'raster-webp-v1','image/webp',1,1,$7 FROM generate_series(1,$8)",[e,base.org_id,base.uploaded_by,base.source_mime,base.source_size,base.source_sha256,bytes,n]);
 await add(event,254);
 const args=request=>[sessionHash(actor),event,request,base.source_mime,base.source_size,base.source_sha256,base.bytes,base.width,base.height];
 async function put(){const client=await f.connect();await client.query('SET ROLE '+f.runtimeRole);await client.query('BEGIN');try{const r=await client.query('SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',args(uuid()));await client.query('COMMIT');return r.rows[0].result;}catch(e){await client.query('ROLLBACK');throw e;}}
 const pair=await Promise.all([put(),put()]);assert.equal(pair.filter(v=>v.asset).length,1);assert.deepEqual(pair.find(v=>v.error),{error:'QUOTA'});
 assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets WHERE event_id=$1',[event])).rows[0].n,256);
 const replay=await f.sqlRuntime('SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[sessionHash(actor),event,asset.requestId,base.source_mime,base.source_size,base.source_sha256,base.bytes,base.width,base.height]);assert.equal(replay.rows[0].value.asset.ref,asset.ref);
 // Organization count on four full events. API-created event IDs, never owner
 // event fixture rows, continue to anchor tenant ownership.
 for(let i=0;i<3;i++){const p=await create(f,actor,'Synthetic quota occupancy '+i);await add(p.event.id,256);}
 const extra=await create(f,actor,'Synthetic quota rejected event');const overflow=await f.sqlRuntime('SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[sessionHash(actor),extra.event.id,uuid(),base.source_mime,base.source_size,base.source_sha256,base.bytes,base.width,base.height]);assert.deepEqual(overflow.rows[0].value,{error:'QUOTA'});
 // A separate disposable occupancy reset tests bytes below count caps. No
 // approved row exists in this suite; runtime has no TRUNCATE privilege.
 await f.db.query('TRUNCATE public.bz_staff_assets');
 const envelope=Buffer.alloc(1048576);envelope.write('RIFF',0);envelope.writeUInt32LE(envelope.length-8,4);envelope.write('WEBP',8);
 await add(event,128,envelope);await add(extra.event.id,128,envelope);
 const atBytes=await f.sqlRuntime('SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[sessionHash(actor),extra.event.id,uuid(),base.source_mime,base.source_size,base.source_sha256,base.bytes,base.width,base.height]);assert.deepEqual(atBytes.rows[0].value,{error:'QUOTA'});
 return {realPutRowsAtEventBoundary:1,rejectedConcurrentPuts:1,eventRows:256,organizationCount:1024,organizationPayloadBytes:268435456,ownerFillerRowsAreResourceControlsOnly:true};
}
