import assert from 'node:assert/strict';
import {login,create,uuid,sessionHash,capability,upload,binary,path,compact,save,approve,enroll009,completeLot,openFields} from './protocol.mjs';
import {assetUUID,neutral} from './oracles.mjs';
import {bounded,waitBlocked} from './fixture.mjs';
import {files,health} from './cases.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function expireWhileHeld(f,actor,event,hold,operation,record){
 const lock=await f.connect();await lock.query('BEGIN');await hold(lock);
 const expiration=(await f.db.query("UPDATE public.bz_sessions SET expires_at=clock_timestamp()+interval '1500 milliseconds' WHERE token_hash=$1 RETURNING expires_at",[sessionHash(actor)])).rows[0].expires_at;
 let pending;try{
   pending=operation();const waiter=await waitBlocked(f,r=>r.query.includes('bz_staff_asset_')||r.query.includes('bz_events')||r.query.includes('bz_catalog_lots')||r.query.includes('pg_advisory_xact_lock'));
   while((await f.dbNow()).getTime()<=expiration.getTime())await pause(30);
   await lock.query('COMMIT');const r=await bounded(pending,8000);
   assert.ok([401,403].includes(r.status),`Current authority must deny after a witnessed wait crosses expiry (status ${r.status}, response ${JSON.stringify(r.data)}).`);
   assert.ok(r.data?.error&&r.headers.get('content-type')?.includes('json'));assert.ok(!r.bytes?.subarray(0,4).equals(Buffer.from('RIFF')));
   record({stage:'post-wait-expiry',event,waitEvent:waiter.wait_event,status:r.status,deniedImageBytes:0,expiredAt:expiration.toISOString()});
 }finally{await lock.query('ROLLBACK').catch(()=>{});await pending?.catch(()=>{});}
}
export async function concurrency(f,record){
 let {actor,packet}=await health(f,record);
 const u=await capability(f,actor,packet,files.item,record),event=packet.event.id;
 const knownDraft={event:{...await openFields(f),cover:u.asset.ref,coverAlt:'Synthetic locked cover'},lots:[{...completeLot(),image:u.asset.ref,alt:'Synthetic locked item'}]};
 packet=await save(f,actor,packet,knownDraft);
 assert.equal((await binary(f,path.saved(event,assetUUID(u.asset.ref)),{cookie:actor.cookie})).status,200);
 assert.equal((await f.request(path.recover(event,u.requestId),{cookie:actor.cookie})).status,200);
 const warmLogout=await login(f);assert.equal((await f.request('/api/session/logout',{method:'POST',cookie:warmLogout.cookie,headers:{origin:f.origin},json:{}})).status,200);
 const before=(await f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets')).rows[0].n;
 await expireWhileHeld(f,actor,event,c=>c.query('SELECT id FROM public.bz_events WHERE id=$1 FOR UPDATE',[event]),()=>upload(f,actor,event,files.sponsor).then(v=>v.response),record);
 assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM public.bz_staff_assets')).rows[0].n,before);
 actor=await login(f);const request=uuid();
 await expireWhileHeld(f,actor,event,c=>c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['bz-asset-request:'+actorId()+':'+event+':'+request]),()=>upload(f,actor,event,files.item,request).then(v=>v.response),record);
 actor=await login(f);
 await expireWhileHeld(f,actor,event,c=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['bz-asset-quota:10000000-0000-4000-8000-000000000001']),()=>upload(f,actor,event,files.item).then(v=>v.response),record);
 actor=await login(f);
 await expireWhileHeld(f,actor,event,c=>c.query('SELECT id FROM public.bz_staff_assets WHERE id=$1 FOR UPDATE',[assetUUID(u.asset.ref)]),()=>binary(f,path.saved(event,assetUUID(u.asset.ref)),{cookie:actor.cookie}),record);
 actor=await login(f);
 await expireWhileHeld(f,actor,event,c=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['bz-asset-request:'+actorId()+':'+event+':'+u.requestId]),()=>f.request(path.recover(event,u.requestId),{cookie:actor.cookie}),record);
 actor=await login(f);const expiredSave=uuid(),saveBody=knownDraft;
 await expireWhileHeld(f,actor,event,c=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actorId()+':save:'+event+':'+expiredSave]),()=>f.request('/api/admin/events/'+event,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:packet.revision,requestId:expiredSave,draft:saveBody}}),record);
 assert.equal((await f.db.query('SELECT revision FROM public.bz_events WHERE id=$1',[event])).rows[0].revision,packet.revision,'Expired actual Save must roll back before receipt/mutation.');
 // Real Save reaches its existing request lock after authority/event UPDATE.
 // Queue logout, exercise the actual standalone predicate while revocation is
 // queued, then release Save. No nested locking auth helper is supplied here.
 for(const revoke of ['logout','staff-grant']){
   actor=await login(f);const blocker=await f.connect();await blocker.query('BEGIN');const q=uuid(),key=actorId()+':save:'+event+':'+q;
   await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
   let savePromise,revocation,revoker,validationPromise,assetCalls=[];try{
     const d=compact(packet);d.event.welcome='Serialized actual Save '+revoke;
     savePromise=f.request('/api/admin/events/'+event,{method:'PUT',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:packet.revision,requestId:q,draft:d}});
     const saveWait=await waitBlocked(f,r=>r.query.includes('pg_advisory_xact_lock'));
     if(revoke==='logout')revocation=f.request('/api/session/logout',{method:'POST',cookie:actor.cookie,headers:{origin:f.origin},json:{}});
     else{revoker=await f.connect();revocation=revoker.query('UPDATE public.bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[actorId(),'10000000-0000-4000-8000-000000000001']);}
     const revokeWait=await waitBlocked(f,r=>r.query.includes(revoke==='logout'?'UPDATE bz_sessions':'UPDATE public.bz_staff_grants'));
     const stored=(await f.db.query('SELECT bytes,width,height,source_mime,source_size,source_sha256 FROM public.bz_staff_assets WHERE id=$1',[assetUUID(u.asset.ref)])).rows[0];
     const probes=[['put','SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[sessionHash(actor),event,uuid(),stored.source_mime,stored.source_size,stored.source_sha256,stored.bytes,stored.width,stored.height]],
       ['recover','SELECT public.bz_staff_asset_recover($1,$2,$3) AS value',[sessionHash(actor),event,u.requestId]],
       ['read','SELECT * FROM public.bz_staff_asset_read($1,$2,$3,$4,$5)',[sessionHash(actor),event,assetUUID(u.asset.ref),'saved',null]]];
     for(const [kind,sql,args] of probes){const c=await f.connect();await c.query('SET ROLE '+f.runtimeRole);await c.query('BEGIN');
       const call=c.query(sql,args).then(async r=>{await c.query('COMMIT');return {kind,rows:r.rows};},async error=>{await c.query('ROLLBACK');if(!['PBA02','PBA03'].includes(error.code))throw error;return {kind,state:error.code};});assetCalls.push(call);
       const wait=await waitBlocked(f,r=>r.query.includes('bz_staff_asset_'+kind));
       assert.ok(wait.blockers.includes(revokeWait.pid),`Asset ${kind} must block on queued authority before reaching Save event (wait ${JSON.stringify(wait)}, queued revocation ${revokeWait.pid}, Save ${saveWait.pid}).`);
       assert.ok(!wait.blockers.includes(saveWait.pid),'Asset '+kind+' cannot take event before authority.');
       record({stage:'Save-queued-'+revoke+'-'+kind,waitBackend:wait.pid,blockingAuthority:revokeWait.pid});
     }
     validationPromise=f.sqlRuntime('SELECT public.bz_staff_asset_validate($1,$2,$3::uuid[]) AS value',[sessionHash(actor),event,[assetUUID(u.asset.ref)]]);
     const validation=await Promise.race([validationPromise,pause(500).then(()=>null)]);
     if(!validation){const wait=await waitBlocked(f,r=>r.query.includes('bz_staff_asset_validate'));record({stage:'forbidden-validate-lock',waitEvent:wait.wait_event,blockers:wait.blockers});assert.fail('Controlled standalone validate waited behind queued authority revocation; it must be lock-free.');}
     assert.deepEqual(validation.rows[0].value,{valid:true});
     // This current predicate is not a reservation: the same call denies once
     // the queued logout/revocation commits.
     await blocker.query('COMMIT');const saved=await bounded(savePromise);assert.equal(saved.status,200);packet=saved.data.draft;
     const revoked=await bounded(revocation);if(revoke==='logout')assert.equal(revoked.status,200);
     for(const outcome of await bounded(Promise.all(assetCalls))){if(outcome.kind==='read')assert.equal(outcome.state,revoke==='logout'?'PBA02':'PBA03');else assert.deepEqual(outcome.rows[0].value,{error:'DENIED'});}
     const after=await f.sqlRuntime('SELECT public.bz_staff_asset_validate($1,$2,$3::uuid[]) AS value',[sessionHash(actor),event,[assetUUID(u.asset.ref)]]);assert.deepEqual(after.rows[0].value,{error:'DENIED'});
     const def=(await f.db.query("SELECT prosrc FROM pg_proc WHERE oid='public.bz_staff_asset_validate(text,uuid,uuid[])'::regprocedure")).rows[0].prosrc.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,'');
     assert.doesNotMatch(def,/\bFOR\s+(?:SHARE|UPDATE|KEY\s+SHARE|NO\s+KEY\s+UPDATE)\b|\bpg_advisory|\bLOCK\s+TABLE\b|\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|public\.)/i);
     record({stage:'Save-queued-'+revoke,saveBackend:saveWait.pid,revocationBackend:revokeWait.pid,saveStatus:saved.status,standalonePredicateNotReservation:true,lockFreeValidateBody:true});
   }finally{await blocker.query('ROLLBACK').catch(()=>{});await Promise.allSettled([savePromise,revocation,validationPromise,...assetCalls]);await f.db.query('UPDATE public.bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[actorId(),'10000000-0000-4000-8000-000000000001']);}
 }
 // Approval shares the same caller direction; queued VIEW revocation on a
 // published read may proceed only after that read releases held authority.
 // Actual approval expiry after a later blocking catalog insert rolls back
 // both header and child rows. This controlled trigger is disposable only.
 actor=await login(f);await f.request('/api/admin/events/'+event+'/catalog-approval',{cookie:actor.cookie});
 const approvalKey='evidence-assets-approval:'+event;
 await f.db.query("CREATE FUNCTION public.evidence_assets_approval_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('"+approvalKey+"',0)); RETURN NEW; END $$; CREATE TRIGGER evidence_assets_approval_wait BEFORE INSERT ON public.bz_catalog_lots FOR EACH ROW EXECUTE FUNCTION public.evidence_assets_approval_wait()");
 try{await expireWhileHeld(f,actor,event,c=>c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[approvalKey]),()=>f.request('/api/admin/events/'+event+'/catalog-approval',{method:'POST',cookie:actor.cookie,headers:{origin:f.origin},json:{expectedRevision:packet.revision,requestId:uuid(),lotIds:packet.lots.map(l=>l.id)}}),record);
   assert.equal((await f.db.query('SELECT count(*)::integer AS n FROM public.bz_catalog_approvals WHERE event_id=$1',[event])).rows[0].n,0,'Expired approval must roll back its partial header.');}
 finally{await f.db.query('DROP TRIGGER evidence_assets_approval_wait ON public.bz_catalog_lots; DROP FUNCTION public.evidence_assets_approval_wait()');}
 actor=await login(f);const approval=await approve(f,actor,packet),viewer=await enroll009(f,event),held=await f.connect();
 assert.equal((await binary(f,path.published(event,approval.id,assetUUID(u.asset.ref)),{cookie:viewer.cookie})).status,200);
 await held.query('BEGIN');await held.query('SELECT id FROM public.bz_staff_assets WHERE id=$1 FOR UPDATE',[assetUUID(u.asset.ref)]);
 let readPromise,revocation;try{
   readPromise=binary(f,path.published(event,approval.id,assetUUID(u.asset.ref)),{cookie:viewer.cookie});const imageWait=await waitBlocked(f,r=>r.query.includes('bz_staff_asset_read'));
   const revoker=await f.connect();revocation=revoker.query('UPDATE public.bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[viewer.person,event]);
   const viewWait=await waitBlocked(f,r=>r.query.includes('UPDATE public.bz_event_view_grants'));
   await held.query('COMMIT');const read=await bounded(readPromise);assert.equal(read.status,200);await bounded(revocation);
   neutral(await binary(f,path.published(event,approval.id,assetUUID(u.asset.ref)),{cookie:viewer.cookie}),404,'ASSET_UNAVAILABLE');
   record({stage:'published-read-queued-VIEW-revocation',readBackend:imageWait.pid,revocationBackend:viewWait.pid,serializedBeforeRevocation:true,replayDenied:true});
 }finally{await held.query('ROLLBACK').catch(()=>{});await Promise.allSettled([readPromise,revocation]);}
}
function actorId(){return '20000000-0000-4000-8000-000000000001';}
