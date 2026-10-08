import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {compact} from '../staff-drafts/protocol.mjs';
import {HarnessError} from '../staging-manual-bid/harness.mjs';
import {currentEntry,applied,persisted,preserved,denied,revisionConflict} from './oracles.mjs';
import {ids,entryPath,demoPath,profile,cookie,hashSession,post,login,fresh,readEntry,setEntry,slot,enroll,ack,publishThroughStaff,snapshot,stored,queued} from './setup.mjs';
const state=(f,s,t,enabled,revision)=>readEntry(f,s,t.eventId).then(r=>{currentEntry(r,{eventId:t.eventId,origin:f.origin,enabled,revision});return r;});
async function enabledTarget(f,{published=false}={}){const staff=await login(f),target=await fresh(f,staff);if(published)await publishThroughStaff(f,staff,target);assert.equal((await setEntry(f,staff,target.eventId,0,true)).status,200);return {staff,...target};}
async function publicDiscovery(f,eventId,status){const r=await f.request(demoPath(eventId)+'/entry');assert.equal(r.status,status);if(status===200)assert.deepEqual(r.data,{demoEntry:true,eventId});return r;}
async function session(f,privateCookie){const r=await f.request('/api/session',{cookie:privateCookie});assert.equal(r.status,200);return r.data;}
async function context(f,eventId,privateCookie){const r=await f.request('/api/bidder/events/'+eventId+'/context',{cookie:privateCookie});assert.equal(r.status,200);return r.data;}

export const acceptance={
 async FRESH_DISABLED_DEFAULT(f){
  const staff=await login(f),t=await fresh(f,staff);await state(f,staff,t,false,0);await publicDiscovery(f,t.eventId,404);
  assert.equal((await post(f,demoPath(t.eventId)+'/begin',{entryId:randomUUID()})).status,404);
  assert.equal((await f.db.query('SELECT count(*) n FROM bz_demo_event_entries WHERE event_id=$1',[t.eventId])).rows[0].n,'0');
  return {realStaffCreated:true,disabled:true,entryRevision:0};
 },
 async STAFF_ENABLE_DURABLE(f){
  const staff=await login(f),t=await fresh(f,staff),before=await snapshot(f,t.eventId),requestId=randomUUID();
  await f.restart({skew:true});const dbBefore=await f.dbNow(),r=await setEntry(f,staff,t.eventId,0,true,requestId),dbAfter=await f.dbNow();
  currentEntry(r,{eventId:t.eventId,origin:f.origin,enabled:true,revision:1,clockBounds:{before:dbBefore.getTime(),after:dbAfter.getTime()}});const operation=applied(r,{requestId,enabled:true,revision:1});
  persisted({...await stored(f,t.eventId,{entry:r.data.entry,operation,actorId:staff.personId}),eventId:t.eventId,organizationId:ids.saturn,enabled:true,revision:1,requestId,actorId:staff.personId,expectedRevision:0,operation,entry:r.data.entry});
  preserved(before,await snapshot(f,t.eventId));const readBefore=await f.dbNow(),read=await readEntry(f,staff,t.eventId),readAfter=await f.dbNow();currentEntry(read,{eventId:t.eventId,origin:f.origin,enabled:true,revision:1,clockBounds:{before:readBefore.getTime(),after:readAfter.getTime()}});await publicDiscovery(f,t.eventId,200);
  return {databasePersisted:true,exactSqlActorOrgAndTimestamps:true,dbClockUnderAppSkew:true,entryRevision:1,noAuthorityOrPublicationSideEffects:true};
 },
 async EXACT_RETRY_CURRENT_STATE(f){
  const staff=await login(f),t=await fresh(f,staff),requestId=randomUUID();
  const first=await setEntry(f,staff,t.eventId,0,true,requestId);assert.equal(first.status,200);const original=applied(first,{requestId,enabled:true,revision:1});
  // Treat first committed response as lost; do not generate another request ID.
  const once=await Promise.all([setEntry(f,staff,t.eventId,0,true,requestId),setEntry(f,staff,t.eventId,0,true,requestId)]);
  for(const r of once){currentEntry(r,{eventId:t.eventId,origin:f.origin,enabled:true,revision:1});assert.deepEqual(applied(r,{requestId,enabled:true,revision:1,replayed:true}),original);}
  assert.equal((await stored(f,t.eventId)).ledgerRows.length,1);
  const disabled=await setEntry(f,staff,t.eventId,1,false);assert.equal(disabled.status,200);
  const replay=await setEntry(f,staff,t.eventId,0,true,requestId);
  currentEntry(replay,{eventId:t.eventId,origin:f.origin,enabled:false,revision:2});assert.deepEqual(applied(replay,{requestId,enabled:true,revision:1,replayed:true}),original);
  persisted({...await stored(f,t.eventId,{entry:replay.data.entry,operation:original,actorId:staff.personId}),eventId:t.eventId,organizationId:ids.saturn,enabled:false,operationEnabled:true,revision:2,requestId,actorId:staff.personId,expectedRevision:0,operation:original,entry:replay.data.entry});
  assert.equal((await stored(f,t.eventId)).ledgerRows.length,2);
  return {committedOnce:true,originalOperationPreserved:true,currentEntryDisabled:true};
 },
 async SHARED_DUPLICATE_PRIVATE(f){
  const t=await enabledTarget(f,{published:true});const a=await enroll(f,await slot(f,t.eventId)),b=await enroll(f,await slot(f,t.eventId));
  assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.data.person.id,b.data.person.id);assert.notEqual(a.data.business.id,b.data.business.id);assert.notEqual(cookie(a),cookie(b));
  for(const r of [a,b]){const s=await session(f,cookie(r));assert.equal(s.person.id,r.data.person.id);assert.deepEqual(s.staffOrganizations,[]);assert.equal(r.text.includes(profile.memberId),false);const c=await context(f,t.eventId,cookie(r));assert.equal(c.businesses.length,1);assert.equal(c.businesses[0].id,r.data.business.id);assert.equal(c.businesses[0].canBid,false,'Published scheduled catalog truthfully remains before its bidding window');}
  const grants=(await f.db.query('SELECT person_id,access,active FROM bz_event_bidder_admissions WHERE event_id=$1',[t.eventId])).rows;
  assert.equal(grants.length,2);assert.ok(grants.every(g=>g.access==='BID'&&g.active));
  assert.equal((await f.db.query('SELECT count(*) n FROM bz_manual_bids WHERE event_id=$1',[t.eventId])).rows[0].n,'0');
  const foreign=await post(f,'/api/bidder/events/'+t.eventId+'/lots/'+randomUUID()+'/bids',{requestId:randomUUID(),businessId:a.data.business.id,amountMinor:10000,rulesetId:'staging-usd-manual-v1'},{cookie:cookie(b)});assert.ok([403,404].includes(foreign.status));
  return {sameClaimsSeparatePeople:true,separateBusinesses:true,immediateSyntheticBidAllocation:true,noSeededTarget:true};
 },
 async DISABLE_NEW_ENROLLMENT(f){
  const t=await enabledTarget(f,{published:true}),aSlot=await slot(f,t.eventId),a=await enroll(f,aSlot);assert.equal(a.status,201);assert.equal((await ack(f,aSlot,cookie(a))).status,200);
  const bSlot=await slot(f,t.eventId),b=await enroll(f,bSlot);assert.equal(b.status,201);
  const before=await snapshot(f,t.eventId),disabled=await setEntry(f,t.staff,t.eventId,1,false);currentEntry(disabled,{eventId:t.eventId,origin:f.origin,enabled:false,revision:2});
  await publicDiscovery(f,t.eventId,404);assert.equal((await post(f,demoPath(t.eventId)+'/begin',{entryId:randomUUID()})).status,404);
  assert.equal((await enroll(f,bSlot)).status,404);assert.equal((await ack(f,bSlot,cookie(b))).status,404);
  for(const r of [a,b]){assert.equal((await session(f,cookie(r))).person.id,r.data.person.id);await context(f,t.eventId,cookie(r));}
  preserved(before,await snapshot(f,t.eventId));return {newAllocationDenied:true,ackDisabled:true,currentSessionsAndContextPreserved:true};
 }
};

export const adversarial={
 async FOREIGN_OR_ANON_DENIED(f){
  const t=await enabledTarget(f),foreign=await login(f,'staff-pine'),viewer=await login(f,'bidder-juniper'),before=await stored(f,t.eventId);
  for(const s of [foreign,viewer]){denied(await readEntry(f,s,t.eventId),403,'FORBIDDEN');denied(await setEntry(f,s,t.eventId,1,false),403,'FORBIDDEN');}
  denied(await f.request(entryPath(t.eventId)),401,'UNAUTHENTICATED');denied(await post(f,entryPath(t.eventId),{expectedEntryRevision:1,enabled:false,requestId:randomUUID()}),401,'UNAUTHENTICATED');
  denied(await readEntry(f,t.staff,randomUUID()),404,'NOT_FOUND');preserved(before,await stored(f,t.eventId));return {foreignAndAnonymousDenied:true,noControlWrites:true};
 },
 async ORIGIN_FIELDS_DENIED(f){
  const t=await enabledTarget(f),before=await stored(f,t.eventId),body={expectedEntryRevision:1,enabled:false,requestId:randomUUID()};
  for(const edit of [{actorId:t.staff.personId},{organizationId:ids.pine},{entryId:randomUUID()},{enabled:'false'},{expectedEntryRevision:-1},{expectedEntryRevision:1.5},{expectedEntryRevision:2147483648},{requestId:'invalid'}])denied(await post(f,entryPath(t.eventId),{...body,...edit},t.staff),400,'VALIDATION');
  denied(await f.request(entryPath(t.eventId),{method:'POST',json:body,cookie:t.staff.cookie,headers:{origin:'https://foreign.invalid'}}),403,'FORBIDDEN');
  denied(await f.request(entryPath(t.eventId),{method:'POST',raw:'{}',cookie:t.staff.cookie,headers:{origin:f.origin,'content-type':'text/plain'}}),400,'VALIDATION');
  preserved(before,await stored(f,t.eventId));return {allowlistAndOriginBound:true};
 },
 async REVISION_REQUEST_CONFLICTS(f){
  const staff=await login(f),t=await fresh(f,staff),id=randomUUID();assert.equal((await setEntry(f,staff,t.eventId,0,true,id)).status,200);const before=await stored(f,t.eventId);
  denied(await setEntry(f,staff,t.eventId,0,false,id),409,'ENTRY_REQUEST_CONFLICT');denied(await setEntry(f,staff,t.eventId,1,true,id),409,'ENTRY_REQUEST_CONFLICT');
  revisionConflict(await setEntry(f,staff,t.eventId,0,false),before.entryRows[0].entry_revision);assert.equal(before.entryRows[0].entry_revision,1);preserved(before,await stored(f,t.eventId));
  const same=await setEntry(f,staff,t.eventId,1,true);currentEntry(same,{eventId:t.eventId,origin:f.origin,enabled:true,revision:2});
  return {changedExactBodyDenied:true,staleRevisionDenied:true,distinctNoopRevisionAdvanced:true};
 },
 async POST_EVENT_WAIT_CURRENT_AUTH(f){
  for(const method of ['read','set']){
   const t=await enabledTarget(f),hash=hashSession(t.staff),before=await stored(f,t.eventId);
   const expires=(await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE token_hash=$1 RETURNING expires_at",[hash])).rows[0].expires_at;
   const r=await queued(f,'SELECT id FROM bz_events WHERE id=$1 FOR UPDATE',[t.eventId],()=>method==='read'?readEntry(f,t.staff,t.eventId):setEntry(f,t.staff,t.eventId,1,false),async()=>{
    const end=Date.now()+10_000;while(Date.now()<end){if(await f.dbNow()>=expires)return;await new Promise(done=>setTimeout(done,20));}throw new HarnessError('Database expiry crossing not observed');
   });denied(r,401,'UNAUTHENTICATED');preserved(before,await stored(f,t.eventId));
  }return {readAndMutationRecheckAfterEventWait:true};
 },
 async POST_ENTRY_WAIT_CURRENT_AUTH(f){
  for(const method of ['read','set']){
   const t=await enabledTarget(f),before=await stored(f,t.eventId),expires=(await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE token_hash=$1 RETURNING expires_at",[hashSession(t.staff)])).rows[0].expires_at;
   const r=await queued(f,'SELECT event_id FROM bz_demo_event_entries WHERE event_id=$1 FOR UPDATE',[t.eventId],()=>method==='read'?readEntry(f,t.staff,t.eventId):setEntry(f,t.staff,t.eventId,1,false),async()=>{
    const end=Date.now()+10_000;while(Date.now()<end){if(await f.dbNow()>=expires)return;await new Promise(done=>setTimeout(done,20));}throw new HarnessError('Database expiry crossing not observed');
   });denied(r,401,'UNAUTHENTICATED');preserved(before,await stored(f,t.eventId));
  }return {readAndMutationRecheckExpiryAfterEntryWait:true};
 },
 async POST_REQUEST_WAIT_CURRENT_AUTH(f){
  const t=await enabledTarget(f),requestId=randomUUID(),before=await stored(f,t.eventId),expires=(await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE token_hash=$1 RETURNING expires_at",[hashSession(t.staff)])).rows[0].expires_at;
  const key='bz:staff-event-entry:v1:'+t.staff.personId+':'+t.eventId+':'+requestId;
  const r=await queued(f,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key],()=>setEntry(f,t.staff,t.eventId,1,false,requestId),async()=>{
   const end=Date.now()+10_000;while(Date.now()<end){if(await f.dbNow()>=expires)return;await new Promise(done=>setTimeout(done,20));}throw new HarnessError('Database expiry crossing not observed');
  });denied(r,401,'UNAUTHENTICATED');preserved(before,await stored(f,t.eventId));return {requestWaitExpiryRechecked:true};
 },
 async SAVE_CONTROL_QUEUED_REVOCATION_ORDER(f){
  for(const revocation of ['session','grant']){
   const t=await enabledTarget(f),lock=await f.privilegedConnection(),revoker=await f.privilegedConnection(),requestId=randomUUID();let control,save,revoke;
   try{
    const warm=await f.request('/api/admin/events/'+t.eventId,{method:'PUT',json:{expectedRevision:t.draft.revision,requestId:randomUUID(),draft:compact(t.draft)},cookie:t.staff.cookie,headers:{origin:f.origin}});assert.equal(warm.status,200);t.draft=warm.data.draft;
    await lock.query('BEGIN');await lock.query('SELECT event_id FROM bz_demo_event_entries WHERE event_id=$1 FOR UPDATE',[t.eventId]);
    control=setEntry(f,t.staff,t.eventId,1,false,requestId);
    async function waiting(n){const end=Date.now()+10_000;while(Date.now()<end){if(Number((await f.db.query("SELECT count(*) n FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",[f.runtimeRole])).rows[0].n)>=n)return;await new Promise(done=>setTimeout(done,20));}throw new HarnessError('Declared concurrency lock waits were not observed');}
    await waiting(1);
    save=f.request('/api/admin/events/'+t.eventId,{method:'PUT',json:{expectedRevision:t.draft.revision,requestId:randomUUID(),draft:compact(t.draft)},cookie:t.staff.cookie,headers:{origin:f.origin}});await waiting(2);
    // Shipped runtime pool max=2: control+Save occupy it. Queue the same durable
    // session transition as logout through an independent disposable revoker,
    // and observe that connection PID; never wait for an impossible third app slot.
    await revoker.query('BEGIN');await revoker.query("SET LOCAL statement_timeout='15s'");
    revoke=(revocation==='session'?revoker.query('UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL',[hashSession(t.staff)]):revoker.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[t.staff.personId,ids.saturn])).then(()=>revoker.query('COMMIT'));
    const end=Date.now()+10_000;let held=false;while(Date.now()<end){if((await f.db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[revoker.processID])).rows.length){held=true;break;}await new Promise(done=>setTimeout(done,20));}if(!held)throw new HarnessError('Queued independent authority revocation not observed');
    await lock.query('COMMIT');const [controlResult,saveResult]=await Promise.all([control,save,revoke]);
    assert.equal(controlResult.status,200,'Entry control must settle under compatible lock order');assert.equal(saveResult.status,200,'Concurrent staff Save must settle before queued authority revocation');
    denied(await readEntry(f,t.staff,t.eventId),revocation==='session'?401:403,revocation==='session'?'UNAUTHENTICATED':'FORBIDDEN');
    denied(await setEntry(f,t.staff,t.eventId,1,false,requestId),revocation==='session'?401:403,revocation==='session'?'UNAUTHENTICATED':'FORBIDDEN');
    const storage=await stored(f,t.eventId);assert.equal(storage.entryRows[0].entry_revision,2);assert.equal(storage.entryRows[0].enabled,false);assert.equal(storage.ledgerRows.length,2);
   }finally{
    await lock.query('ROLLBACK').catch(()=>{});await lock.end();await revoker.query('ROLLBACK').catch(()=>{});await revoker.end();await Promise.allSettled([control,save,revoke].filter(Boolean));
    await f.db.query('UPDATE bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[t.staff.personId,ids.saturn]);
   }
  }return {saveAndControlCompatible:true,queuedSessionAndGrantRevocationLinearizeAfter:true,runtimePoolAtMostTwo:true,laterReadsAndReplayDeny:true};
 },
 async REPLAY_RECHECKS_AUTH(f){
  const staff=await login(f),t=await fresh(f,staff),requestId=randomUUID();assert.equal((await setEntry(f,staff,t.eventId,0,true,requestId)).status,200);const before=await stored(f,t.eventId);
  await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[staff.personId,ids.saturn]);
  try{denied(await setEntry(f,staff,t.eventId,0,true,requestId),403,'FORBIDDEN');denied(await readEntry(f,staff,t.eventId),403,'FORBIDDEN');preserved(before,await stored(f,t.eventId));}
  finally{await f.db.query('UPDATE bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[staff.personId,ids.saturn]);}
  await post(f,'/api/session/logout',{},staff);denied(await setEntry(f,staff,t.eventId,0,true,requestId),401,'UNAUTHENTICATED');preserved(before,await stored(f,t.eventId));
  return {receiptNotAuthority:true,logoutCannotReplay:true};
 },
 async RUNTIME_PERMISSION_BOUNDARY(f){
  const t=await enabledTarget(f),before=await stored(f,t.eventId);
  for(const sql of ['UPDATE public.bz_demo_event_entries SET enabled=false','INSERT INTO public.bz_demo_event_entries DEFAULT VALUES','DELETE FROM public.bz_demo_event_entries','SELECT * FROM public.bz_staff_event_entry_requests','INSERT INTO public.bz_staff_event_entry_requests DEFAULT VALUES','UPDATE public.bz_staff_event_entry_requests SET applied_enabled=false','DELETE FROM public.bz_staff_event_entry_requests','SELECT * FROM public.bz_demo_entry_slots','UPDATE public.bz_demo_entry_slots SET consumed_at=clock_timestamp()','SET ROLE '+f.migratorRole]){
   let code;try{await f.runtimeDB.query(sql);}catch(e){code=e.code;}assert.equal(code,'42501','Actual least-privilege SQL refusal');
  }
  const names=['bz_staff_event_entry_read','bz_staff_event_entry_set'];const rows=(await f.db.query('SELECT p.proname,p.prosecdef,p.proconfig,p.proacl::text,r.rolname owner FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.proname=ANY($1::text[])',[names])).rows;
  assert.equal(rows.length,2);for(const r of rows){assert.equal(r.prosecdef,true);assert.equal(r.owner,f.migratorRole);assert.ok(r.proconfig.includes('search_path=pg_catalog'));assert.equal(typeof r.proacl,'string','NULL ACL would retain default PUBLIC execute');assert.equal(/(?:^|[,{])=X\//.test(r.proacl),false);}
  for(const sig of ['bz_staff_event_entry_read(text,uuid)','bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)'])assert.equal((await f.db.query('SELECT has_function_privilege($1,$2,$3) v',[f.runtimeRole,'public.'+sig,'EXECUTE'])).rows[0].v,true);
  const all=(await f.db.query("SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid::regprocedure::text")).rows;
  assert.ok(f.inheritedFunctions,'Independent pre-migration SQL definition inventory required');for(const old of f.inheritedFunctions)assert.deepEqual(all.find(v=>v.identity===old.identity),old,'Additive migration cannot rewrite inherited009/catalog SQL definitions');
  assert.deepEqual(all.filter(v=>!f.inheritedFunctions.some(old=>old.identity===v.identity)).map(v=>v.identity).sort(),['bz_staff_event_entry_read(text,uuid)','bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)'].sort(),'Exactly two new public functions; no PUBLIC helper escape');
  for(const permission of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await f.db.query('SELECT has_table_privilege($1,$2,$3) v',[f.runtimeRole,'public.bz_staff_event_entry_requests',permission])).rows[0].v,false,'Effective ledger table privilege must be denied even with inherited migration defaults');
  const columns=(await f.db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bz_staff_event_entry_requests'")).rows;
  assert.equal(columns.length,8);for(const {column_name} of columns)for(const permission of ['SELECT','INSERT','UPDATE','REFERENCES'])assert.equal((await f.db.query('SELECT has_column_privilege($1,$2,$3,$4) v',[f.runtimeRole,'public.bz_staff_event_entry_requests',column_name,permission])).rows[0].v,false,'Independent column ACL cannot escape table revocation');
  async function directDenied(hash,expected){
   for(const [sql,args] of [['SELECT public.bz_staff_event_entry_read($1,$2) result',[hash,t.eventId]],['SELECT public.bz_staff_event_entry_set($1,$2,$3,$4,$5) result',[hash,t.eventId,1,false,randomUUID()]]]){
    const value=(await f.runtimeDB.query(sql,args)).rows[0].result;assert.deepEqual(value,{error:expected},'Definer itself must deny current authority without entry/operation/person/claim disclosure');preserved(before,await stored(f,t.eventId));
   }
  }
  await directDenied('a'.repeat(64),'UNAUTHENTICATED');const foreign=await login(f,'staff-pine');await directDenied(hashSession(foreign),'FORBIDDEN');
  const hash=hashSession(t.staff),originalSession=(await f.db.query('SELECT expires_at::text expires_at,revoked_at::text revoked_at FROM bz_sessions WHERE token_hash=$1',[hash])).rows[0],originalPerson=(await f.db.query('SELECT active,is_test FROM bz_people WHERE id=$1',[t.staff.personId])).rows[0],originalGrant=(await f.db.query('SELECT active FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2',[t.staff.personId,ids.saturn])).rows[0];
  for(const variation of ['revoked','expired','person-inactive','person-nontest','grant-inactive','grant-absent']){
   try{
    if(variation==='revoked')await f.db.query('UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hash]);
    if(variation==='expired')await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[hash]);
    if(variation==='person-inactive')await f.db.query('UPDATE bz_people SET active=false WHERE id=$1',[t.staff.personId]);
    if(variation==='person-nontest')await f.db.query('UPDATE bz_people SET is_test=false WHERE id=$1',[t.staff.personId]);
    if(variation==='grant-inactive')await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[t.staff.personId,ids.saturn]);
    if(variation==='grant-absent')await f.db.query('DELETE FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2',[t.staff.personId,ids.saturn]);
    await directDenied(hash,variation.startsWith('grant-')?'FORBIDDEN':'UNAUTHENTICATED');
   }finally{
    await f.db.query('UPDATE bz_sessions SET expires_at=$2::timestamptz,revoked_at=$3::timestamptz WHERE token_hash=$1',[hash,originalSession.expires_at,originalSession.revoked_at]);
    await f.db.query('UPDATE bz_people SET active=$2,is_test=$3 WHERE id=$1',[t.staff.personId,originalPerson.active,originalPerson.is_test]);
    await f.db.query('INSERT INTO bz_staff_grants(person_id,org_id,active) VALUES($1,$2,$3) ON CONFLICT(person_id,org_id) DO UPDATE SET active=EXCLUDED.active',[t.staff.personId,ids.saturn,originalGrant.active]);
   }
  }
  const publicProbe='entry_public_'+randomUUID().replaceAll('-','');await f.db.query('CREATE ROLE '+publicProbe+' NOLOGIN');await f.db.query('GRANT USAGE ON SCHEMA public TO '+publicProbe);
  try{await f.db.query('SET ROLE '+publicProbe);for(const sql of ['SELECT public.bz_staff_event_entry_read(NULL,NULL)','SELECT public.bz_staff_event_entry_set(NULL,NULL,NULL,NULL,NULL)']){let code;try{await f.db.query(sql);}catch(e){code=e.code;}assert.equal(code,'42501','Fresh role must have no PUBLIC function execution');}}
  finally{await f.db.query('RESET ROLE');}
  return {twoExactFunctions:true,noDirectEntryOrLedgerRights:true,functionsRecheckAuthority:true};
 },
 async CONTROL_ATOMIC_ROLLBACK(f){
  const t=await enabledTarget(f),before=await stored(f,t.eventId),domain=await snapshot(f,t.eventId);
  await f.db.query("CREATE FUNCTION public.entry_evidence_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ENTRY_EVIDENCE_ONLY'; END $$; CREATE TRIGGER entry_evidence_receipt_rejected BEFORE INSERT ON public.bz_staff_event_entry_requests FOR EACH ROW EXECUTE FUNCTION public.entry_evidence_reject_receipt();");
  try{denied(await setEntry(f,t.staff,t.eventId,1,false),503,'UNAVAILABLE');preserved(before,await stored(f,t.eventId));preserved(domain,await snapshot(f,t.eventId));}
  finally{await f.db.query('DROP TRIGGER entry_evidence_receipt_rejected ON public.bz_staff_event_entry_requests; DROP FUNCTION public.entry_evidence_reject_receipt();');}
  return {entryAndReceiptAtomic:true,noSuccessOnRollback:true};
 }
};

export const regression={
 async LEGACY_009_SOURCE_UNCHANGED(f){
  const binding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url),'utf8'));
  for(const [p,expected] of Object.entries(binding.immutableSources))assert.equal(createHash('sha256').update(await readFile(join(f.repo,p))).digest('hex'),expected,'Frozen source bytes retained: '+p);
  return {protectedSourceCount:Object.keys(binding.immutableSources).length};
 },
 async LEGACY_DISABLED_ACK_PRIVATE_CONTEXT(f){
  const s=await slot(f,ids.event),r=await enroll(f,s);assert.equal(r.status,201);const privateCookie=cookie(r);
  await f.db.query('UPDATE bz_demo_event_entries SET enabled=false WHERE event_id=$1',[ids.event]);
  try{assert.equal((await ack(f,s,privateCookie)).status,404);assert.equal((await enroll(f,s)).status,404);assert.equal((await session(f,privateCookie)).person.id,r.data.person.id);await context(f,ids.event,privateCookie);assert.equal((await f.request('/api/catalog/events/'+ids.event,{cookie:privateCookie})).status,200);}
  finally{await f.db.query('UPDATE bz_demo_event_entries SET enabled=true WHERE event_id=$1',[ids.event]);}
  assert.equal((await ack(f,s,privateCookie)).status,200);assert.equal((await ack(f,s,privateCookie)).status,200);
  return {disabledAckStill404:true,currentPrivateViewAndBidContextRemain:true,reenabledAckIdempotent:true};
 },
 async LEGACY_MATCHING_CLAIMS_SEPARATE(f){
  const a=await enroll(f,await slot(f,ids.event)),b=await enroll(f,await slot(f,ids.event));assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.data.person.id,b.data.person.id);assert.notEqual(a.data.business.id,b.data.business.id);assert.deepEqual((await session(f,cookie(a))).staffOrganizations,[]);
  return {claimsNeverMerge:true,noStaffAllocation:true};
 },
 async LEGACY_STAFF_NOT_REPLACED(f){
  const staff=await login(f),s=await slot(f,ids.event),before=await session(f,staff.cookie);
  assert.equal((await post(f,demoPath(ids.event)+'/begin',{entryId:randomUUID()},staff)).status,409);
  assert.equal((await post(f,demoPath(ids.event)+'/enroll',{entryId:s.entryId,...profile},{cookie:s.cookie+'; '+staff.cookie})).status,409);assert.deepEqual(await session(f,staff.cookie),before);
  return {activeStaffSessionPreserved:true};
 }
};
