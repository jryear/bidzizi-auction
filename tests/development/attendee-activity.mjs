// Actual server/routes + SQL under a disposable capability-only role. Development
// observations, not a new frozen acceptance baseline or connected release proof.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { createServer, createConnection } from 'node:net';
import pg from 'pg';
const repo=resolve(fileURLToPath(new URL('../..',import.meta.url))), loaded=new Map();
const sha=v=>createHash('sha256').update(v).digest('hex');
loaded.set(relative(repo,fileURLToPath(import.meta.url)),sha(readFileSync(fileURLToPath(import.meta.url))));
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {url:'data:text/javascript,export{}',shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.startsWith(pathToFileURL(join(repo,'src')).href)){
  const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(fileURLToPath(url)))return next(url.href,context);
 }return next(specifier,context);
},load(url,context,next){if(url.startsWith(pathToFileURL(join(repo,'src')).href)){
 const p=fileURLToPath(url);loaded.set(relative(repo,p),sha(readFileSync(p)));}return next(url,context);}});
const paths={watch:'bidder/events/[eventId]/watching',watchReceipt:'bidder/events/[eventId]/watching/requests/[requestId]',
 history:'bidder/events/[eventId]/my-bids',context:'bidder/events/[eventId]/donation-pledges/context',
 pledge:'bidder/events/[eventId]/donation-pledges',pledgeReceipt:'bidder/events/[eventId]/donation-pledges/[requestId]',
 staff:'admin/events/[id]/donations',create:'admin/events/[id]/donations/nonprofits',
 edit:'admin/events/[id]/donations/nonprofits/[nonprofitId]',export:'admin/events/[id]/donations/export'};
const routes={};for(const [name,p] of Object.entries(paths))routes[name]=await import(pathToFileURL(join(repo,'src/app/api',p,'route.ts')));
const id=()=>randomUUID(), org=id(),org2=id(),actor=id(),coworker=id(),staff=id(),wrongStaff=id(),event=id(),otherEvent=id();
const release=id(),foreignRelease=id(),lot=id(),foreignLot=id(),business=id(),rival=id();
const tokens={actor:'a'.repeat(43),coworker:'b'.repeat(43),staff:'c'.repeat(43),wrongStaff:'d'.repeat(43)};
const hashes=Object.fromEntries(Object.entries(tokens).map(([k,v])=>[k,sha(v)]));
const actorIds={actor,coworker,staff,wrongStaff}, origin='http://127.0.0.1:43987';
const pgBin='/opt/homebrew/opt/postgresql@18/bin', root=await mkdtemp(join(tmpdir(),'bz-attendee-activity-')),cluster=join(root,'cluster');
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const connection={host:'127.0.0.1',port,database:'bz_test_attendee_activity',user:process.env.USER};
const receipt={developmentOnly:true,sourceRoot:repo,gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
 nodeVersion:process.version,cases:[],witnesses:[],syntheticDonationPolicy:{amountCapMinor:1000000000,availability:{mode:'any-time'}}};
const clients=[],pools=new Set(), originalConnect=pg.Pool.prototype.connect;
pg.Pool.prototype.connect=function(...args){pools.add(this);return originalConnect.apply(this,args);};
let admin,started=false,postgresPid,destination,originalPledge,originalWatch;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(runtime=false){const c=new pg.Client({...connection,...(runtime?{user:'activity_runtime',password:'disposable-only'}:{})});
 await c.connect();clients.push(c);await c.query("SET statement_timeout='8s'");return c;}
async function call(name,method='GET',body,who='actor',params={},headers={}){
 const request=new Request(origin+'/api/'+paths[name],{method,headers:{host:new URL(origin).host,origin,cookie:'bz_session='+tokens[who],
 'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await routes[name][method](request,{params:Promise.resolve({eventId:event,id:event,...params})});
 const data=response.headers.get('content-type')?.startsWith('text/csv')?await response.text():await response.json();
 assert.equal(response.headers.get('cache-control'),'private, no-store');return {status:response.status,data,headers:response.headers};
}
async function ok(name,method,body,who,params,status=200){const r=await call(name,method,body,who,params);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
async function denied(name,method,body,who,params,status,code){const r=await call(name,method,body,who,params);assert.equal(r.status,status,JSON.stringify(r.data));assert.equal(r.data.error.code,code);return r.data;}
function watchBody(extra={}){return {actorId:actor,requestId:id(),lotId:lot,watching:true,...extra};}
function pledgeBody(extra={}){return {actorId:actor,requestId:id(),businessId:business,nonprofitId:destination.id,nonprofitVersion:destination.version,amountMinor:2500,...extra};}
async function resetAuthority(){await admin.query("UPDATE bz_sessions SET revoked_at=NULL,expires_at=clock_timestamp()+interval '1 hour'");
 await admin.query('UPDATE bz_people SET active=true,is_test=true');await admin.query('UPDATE bz_event_view_grants SET active=true');
 await admin.query('UPDATE bz_staff_grants SET active=true');await admin.query("UPDATE bz_event_bidder_admissions SET active=true,access='BID'");
 await admin.query('UPDATE bz_business_person_memberships SET active=true,can_bid=true');await admin.query('UPDATE bz_businesses SET active=true');await admin.query('UPDATE bz_org_business_memberships SET active=true');}
async function configure(fields={}){return ok('staff','PUT',{enabled:true,...receipt.syntheticDonationPolicy,...fields},'staff');}
async function waitFor(pid){const end=Date.now()+3000;while(Date.now()<end){const row=(await admin.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
 if(row?.wait_event_type==='Lock'){receipt.witnesses.push(row);return row;}await pause(10);}assert.fail('Required SQL lock wait absent for '+pid);}
async function expireAfterWait(table,fn,input,check,who='actor'){
 const blocker=await connect(),runtime=await connect(true),key='test:late:'+id(),requestId=input.requestId;
 await admin.query(`CREATE FUNCTION development_activity_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('${key}',0)); RETURN NEW; END $$;
 CREATE TRIGGER development_activity_wait BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION development_activity_wait()`);
 await admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE token_hash=$1",[hashes[who]]);
 await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
 await runtime.query('BEGIN');const pid=(await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 const pending=runtime.query(`SELECT public.${fn}($1,$2,$3,$4::jsonb) AS result`,[hashes[who],event,fn==='bz_attendee_activity'?'set':fn==='bz_donation_staff'?'create':'submit',JSON.stringify(input)]);
 try{await waitFor(pid);while(!(await admin.query('SELECT expires_at<=clock_timestamp() AS expired FROM bz_sessions WHERE token_hash=$1',[hashes[who]])).rows[0].expired)await pause(10);
 await blocker.query('COMMIT');assert.deepEqual((await pending).rows[0].result,{error:'UNAUTHENTICATED'});await runtime.query('COMMIT');
 assert.equal((await admin.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${fn==='bz_donation_staff'?'create_request_id':'request_id'}=$1`,[requestId])).rows[0].n,0);await check?.();
 }finally{await blocker.query('ROLLBACK');await pending.catch(()=>{});await runtime.query('ROLLBACK');await admin.query(`DROP TRIGGER development_activity_wait ON ${table}; DROP FUNCTION development_activity_wait()`);}
}
const cases={
 'capability installation and private helpers':async()=>{
  for(const table of ['bz_people','bz_sessions','bz_event_view_grants','bz_bid_receipts','bz_attendee_watches','bz_attendee_watch_requests','bz_donation_settings','bz_donation_nonprofits','bz_donation_pledges']){
   const row=(await admin.query("SELECT has_table_privilege('activity_runtime',$1,'SELECT,INSERT,UPDATE,DELETE') AS access",[table])).rows[0];assert.equal(row.access,false,table);
  }
  const functions=(await admin.query("SELECT oid::regprocedure::text AS name,prosecdef,proconfig,has_function_privilege('activity_runtime',oid,'EXECUTE') AS permitted,EXISTS(SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public FROM pg_proc WHERE proname IN ('bz_activity_authority','bz_activity_fresh','bz_donation_eligible','bz_attendee_activity','bz_donation_member','bz_donation_staff') ORDER BY proname")).rows;
  assert.equal(functions.length,6);for(const f of functions){assert.equal(f.prosecdef,true);assert.deepEqual(f.proconfig,['search_path=pg_catalog']);assert.equal(f.public,false);assert.equal(f.permitted,!['bz_activity_authority','bz_activity_fresh','bz_donation_eligible'].some(n=>f.name.startsWith(n+'(')));}
  const c=await connect(true);await assert.rejects(c.query('SELECT * FROM bz_donation_pledges'),e=>e.code==='42501');await assert.rejects(c.query('SELECT bz_activity_authority($1,$2,false)',[hashes.actor,event]),e=>e.code==='42501');receipt.installation=functions;
 },
 'default disabled and unconfigured without fictional recipients':async()=>{
  const c=await ok('context');assert.equal(c.enabled,false);assert.equal(c.policyReady,false);assert.equal(c.amountCapMinor,null);assert.equal(c.availability,null);assert.deepEqual(c.nonprofits,[]);assert.equal(c.person.id,actor);assert.equal(c.availableNow,false);assert.equal(c.businesses[0].canPledge,false);assert.ok(Number.isFinite(Date.parse(c.serverNow)));
  await denied('staff','PUT',{enabled:true},'staff',{},409,'DONATION_POLICY_PENDING');
  const s=await ok('staff','GET',undefined,'staff');assert.equal(s.minimumMinor,1);assert.deepEqual(s.pledges,[]);assert.equal(s.policyReady,false);
 },
 'personal watch uses VIEW only and exact owned recovery':async()=>{
  await admin.query("UPDATE bz_event_bidder_admissions SET access='VIEW' WHERE person_id=$1",[actor]);await admin.query('UPDATE bz_business_person_memberships SET can_bid=false WHERE person_id=$1',[actor]);
  const body=watchBody();originalWatch=body;const first=await ok('watch','POST',body);assert.equal(first.replayed,false);assert.equal(first.watch.lotId,lot);
  assert.deepEqual((await ok('watch')).lotIds,[lot]);assert.deepEqual((await ok('watch','GET',undefined,'coworker')).lotIds,[]);
  const replay=await ok('watch','POST',body);assert.equal(replay.replayed,true);assert.deepEqual(replay.watch,first.watch);
  assert.deepEqual((await ok('watchReceipt','GET',undefined,'actor',{requestId:body.requestId})).watch,first.watch);
  await denied('watchReceipt','GET',undefined,'coworker',{requestId:body.requestId},404,'NOT_FOUND');
  await denied('watch','POST',{...body,watching:false},'actor',{},409,'IDEMPOTENCY_CONFLICT');
  await denied('watch','POST',watchBody({actorId:coworker}),'actor',{},409,'ACTOR_CHANGED');
  await denied('watch','POST',watchBody({lotId:foreignLot}),'actor',{},404,'NOT_FOUND');
  await denied('watch','POST',body,'actor',{eventId:otherEvent},409,'IDEMPOTENCY_CONFLICT');
  await ok('watch','POST',watchBody({watching:false}));assert.deepEqual((await ok('watch')).lotIds,[]);
  assert.equal((await ok('watchReceipt','GET',undefined,'actor',{requestId:body.requestId})).watch.watching,true);
 },
 'concurrent desired watches share one durable request':async()=>{
  const body=watchBody(),results=await Promise.all([ok('watch','POST',body),ok('watch','POST',body)]);
  assert.equal(results.filter(r=>r.replayed).length,1);assert.deepEqual(results[0].watch,results[1].watch);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_attendee_watch_requests WHERE request_id=$1',[body.requestId])).rows[0].n,1);
  await ok('watch','POST',watchBody({watching:false}));
 },
 'My Bids excludes coworkers, keeps snapshots and refreshes business standing':async()=>{
  await admin.query("UPDATE bz_event_bidder_admissions SET access='VIEW' WHERE person_id=$1",[actor]);
  const first=await ok('history');assert.equal(first.person.id,actor);assert.equal(first.bids.length,2);assert.equal(first.phase,'open');
  const accepted=first.bids.find(r=>r.receipt.status==='accepted');assert.equal(accepted.recordedState,'leading');assert.equal(accepted.lot.title,'Frozen title');assert.equal(first.bids.find(r=>r.receipt.status==='rejected').recordedState,'rejected');
  await admin.query("UPDATE bz_lots SET data=jsonb_set(data,'{title}','\"Draft changed\"') WHERE id=$1",[lot]);
  await admin.query('UPDATE bz_lot_standing SET leading_business_id=$1 WHERE release_id=$2',[rival,release]);
  const after=await ok('history');assert.equal(after.bids.find(r=>r.receipt.status==='accepted').recordedState,'outbid');assert.deepEqual(after.bids[0].lot,first.bids[0].lot);assert.deepEqual(after.bids[0].receipt,first.bids[0].receipt);
  await admin.query("UPDATE bz_catalog_approvals SET opens_at=clock_timestamp()-interval '2 hours',closes_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[release]);
  assert.equal((await ok('history')).bids.find(r=>r.receipt.status==='accepted').recordedState,'closed-outbid');
  await admin.query('UPDATE bz_lot_standing SET leading_business_id=$1 WHERE release_id=$2',[business,release]);
  const closed=await ok('history');assert.equal(closed.bids.find(r=>r.receipt.status==='accepted').recordedState,'closed-leading');assert.doesNotMatch(JSON.stringify(closed),/award|settled/);
 },
 'curated staff create retry and optimistic editing':async()=>{
  const body={requestId:id(),name:'=Synthetic nonprofit',description:'Fixture only, manual staff processing'};
  destination=(await ok('create','POST',body,'staff',{},201)).nonprofit;
  assert.deepEqual((await ok('create','POST',body,'staff',{},201)).nonprofit,destination);
  await denied('create','POST',{...body,name:'Different'},'staff',{},409,'IDEMPOTENCY_CONFLICT');
  const edited=await ok('edit','PUT',{expectedVersion:1,name:'=Renamed nonprofit',description:'Revised fixture',active:true},'staff',{nonprofitId:destination.id});destination=edited.nonprofit;
  assert.equal(destination.version,2);assert.deepEqual((await ok('create','POST',body,'staff',{},201)).nonprofit,{id:destination.id,name:destination.name,description:destination.description,version:2});
  await denied('edit','PUT',{expectedVersion:1,name:'Stale',description:'Stale',active:true},'staff',{nonprofitId:destination.id},409,'VERSION_CONFLICT');
  await denied('staff','GET',undefined,'wrongStaff',{},403,'FORBIDDEN');await denied('create','POST',body,'actor',{},403,'FORBIDDEN');
 },
 'event controls require explicit cap and availability and preserve omitted fields':async()=>{
  await ok('staff','PUT',{enabled:false,amountCapMinor:1000000000},'staff');await denied('staff','PUT',{enabled:true},'staff',{},409,'DONATION_POLICY_PENDING');
  const configured=await configure();assert.equal(configured.policyReady,true);assert.equal(configured.minimumMinor,1);
  const before=(await admin.query('SELECT updated_at FROM bz_donation_settings WHERE event_id=$1',[event])).rows[0].updated_at.toISOString();
  assert.deepEqual(await ok('staff','PUT',{enabled:true},'staff'),configured);assert.equal((await admin.query('SELECT updated_at FROM bz_donation_settings WHERE event_id=$1',[event])).rows[0].updated_at.toISOString(),before);
  const context=await ok('context');assert.equal(context.policyReady,true);assert.equal(context.availableNow,true);assert.ok(Number.isFinite(Date.parse(context.serverNow)));assert.equal(context.businesses[0].canPledge,true);assert.equal(context.nonprofits[0].id,destination.id);
  await denied('staff','PUT',{enabled:true,availability:{mode:'window',opensAt:'invalid',closesAt:'invalid'}},'staff',{},400,'VALIDATION');
 },
 'manual pledge survives lost acknowledgment, disable, edits and spending revocation':async()=>{
  const body=pledgeBody();originalPledge=body;const first=await ok('pledge','POST',body,'actor',{},201);assert.equal(first.receipt.status,'pending_staff_settlement');assert.equal(first.receipt.scale,100);
  assert.deepEqual((await ok('pledgeReceipt','GET',undefined,'actor',{requestId:body.requestId})),first);
  await ok('staff','PUT',{enabled:false},'staff');await ok('edit','PUT',{expectedVersion:destination.version,name:'Changed again',description:'Changed',active:false},'staff',{nonprofitId:destination.id});
  await admin.query('UPDATE bz_business_person_memberships SET can_bid=false WHERE person_id=$1',[actor]);await admin.query("UPDATE bz_event_bidder_admissions SET access='VIEW' WHERE person_id=$1",[actor]);
  assert.deepEqual(await ok('pledge','POST',body,'actor',{},201),first);assert.deepEqual(await ok('pledgeReceipt','GET',undefined,'actor',{requestId:body.requestId}),first);
  await denied('pledge','POST',{...body,amountMinor:5000},'actor',{},409,'IDEMPOTENCY_CONFLICT');
  await denied('pledgeReceipt','GET',undefined,'coworker',{requestId:body.requestId},404,'NOT_FOUND');
  await denied('pledgeReceipt','GET',undefined,'actor',{eventId:otherEvent,requestId:body.requestId},404,'NOT_FOUND');
  await denied('pledge','POST',pledgeBody(),'actor',{},409,'DONATIONS_DISABLED');
  const s=await ok('staff','GET',undefined,'staff');assert.deepEqual(s.pledges,[first.receipt]);
  const csv=await ok('export','GET',undefined,'staff');assert.match(csv,/"'=Renamed nonprofit"/);assert.match(csv,/"2500","25.00"/);assert.doesNotMatch(csv,/Changed again/);
  await denied('export','GET',undefined,'wrongStaff',{},403,'FORBIDDEN');
  destination=(await ok('edit','PUT',{expectedVersion:destination.version+1,name:'=Renamed nonprofit',description:'Revised fixture',active:true},'staff',{nonprofitId:destination.id})).nonprofit;await configure();
 },
 'new pledge validates exact positive minors, version, private actor and event':async()=>{
  for(const amountMinor of [0,-1,0.5,'2500',1000000001,9007199254740992])await denied('pledge','POST',pledgeBody({amountMinor}),'actor',{},400,'VALIDATION');
  await denied('pledge','POST',pledgeBody({actorId:coworker}),'actor',{},409,'ACTOR_CHANGED');
  await denied('pledge','POST',pledgeBody({nonprofitVersion:1}),'actor',{},409,'NONPROFIT_CHANGED');
  await denied('pledge','POST',pledgeBody({nonprofitId:foreignLot}),'actor',{},404,'NOT_FOUND');
  await ok('pledge','POST',pledgeBody({amountMinor:1}),'actor',{},201);await ok('pledge','POST',pledgeBody({amountMinor:1000000000}),'actor',{},201);
 },
 'every fresh spending authority dimension denies while VIEW recovery survives':async()=>{
  const variants=[['UPDATE bz_business_person_memberships SET can_bid=false WHERE person_id=$1',[actor]],['UPDATE bz_business_person_memberships SET active=false WHERE person_id=$1',[actor]],
   ['UPDATE bz_businesses SET active=false WHERE id=$1',[business]],['UPDATE bz_org_business_memberships SET active=false WHERE business_id=$1',[business]],
   ["UPDATE bz_event_bidder_admissions SET access='VIEW' WHERE person_id=$1",[actor]],['UPDATE bz_event_bidder_admissions SET active=false WHERE person_id=$1',[actor]]];
  for(const [sql,args] of variants){await resetAuthority();await admin.query(sql,args);await denied('pledge','POST',pledgeBody(),'actor',{},403,'FORBIDDEN');await ok('pledgeReceipt','GET',undefined,'actor',{requestId:originalPledge.requestId});}
 },
 'explicit donation window uses DB time independently of closed auction':async()=>{
  await configure({availability:{mode:'window',opensAt:new Date(Date.now()+3600000).toISOString(),closesAt:new Date(Date.now()+7200000).toISOString()}});
  const future=await ok('context');assert.equal(future.availableNow,false);assert.equal(future.businesses[0].canPledge,false);
  await denied('pledge','POST',pledgeBody(),'actor',{},409,'DONATIONS_UNAVAILABLE');
  await configure({availability:{mode:'window',opensAt:new Date(Date.now()-3600000).toISOString(),closesAt:new Date(Date.now()+3600000).toISOString()}});
  assert.equal((await ok('history')).phase,'closed');assert.equal((await ok('context')).availableNow,true);await ok('pledge','POST',pledgeBody(),'actor',{},201);await configure();
 },
 'concurrent identical pledges create one immutable receipt':async()=>{
  const body=pledgeBody();const packets=await Promise.all([ok('pledge','POST',body,'actor',{},201),ok('pledge','POST',body,'actor',{},201)]);assert.deepEqual(packets[0],packets[1]);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_donation_pledges WHERE request_id=$1',[body.requestId])).rows[0].n,1);
 },
 'committed queued membership revocation is checked after its real lock wait':async()=>{
  const blocker=await connect(),runtime=await connect(true);await blocker.query('BEGIN');await blocker.query('UPDATE bz_business_person_memberships SET can_bid=false WHERE person_id=$1',[actor]);
  const pid=(await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,body=pledgeBody();const pending=runtime.query('SELECT bz_donation_member($1,$2,$3,$4::jsonb) AS result',[hashes.actor,event,'submit',JSON.stringify(body)]);
  try{await waitFor(pid);await blocker.query('COMMIT');assert.deepEqual((await pending).rows[0].result,{error:'FORBIDDEN'});assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_donation_pledges WHERE request_id=$1',[body.requestId])).rows[0].n,0);}
  finally{await blocker.query('ROLLBACK');await pending.catch(()=>{});}
 },
 'late watch request insert expiry rolls back desired state even on direct COMMIT':async()=>{
  await ok('watch','POST',watchBody({watching:false}));await expireAfterWait('bz_attendee_watch_requests','bz_attendee_activity',watchBody(),async()=>assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_attendee_watches WHERE actor_id=$1',[actor])).rows[0].n,0));
 },
 'late pledge insert expiry leaves no receipt or commitment on direct COMMIT':async()=>{
  await expireAfterWait('bz_donation_pledges','bz_donation_member',pledgeBody());
 },
 'current private session and VIEW required for every recovery':async()=>{
  await admin.query('UPDATE bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[actor,event]);
  for(const [name,params] of [['watch',{}],['history',{}],['context',{}],['watchReceipt',{requestId:originalWatch.requestId}],['pledgeReceipt',{requestId:originalPledge.requestId}]])await denied(name,'GET',undefined,'actor',params,403,'FORBIDDEN');
  await resetAuthority();await admin.query('UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hashes.actor]);
  await denied('pledgeReceipt','GET',undefined,'actor',{requestId:originalPledge.requestId},401,'UNAUTHENTICATED');await denied('watchReceipt','GET',undefined,'actor',{requestId:originalWatch.requestId},401,'UNAUTHENTICATED');
 },
 'staff create concurrency, foreign event and source-bound donation names':async()=>{
  const input={requestId:id(),name:'Synthetic second destination',description:'Fixture'};
  const pairs=await Promise.all([ok('create','POST',input,'staff',{},201),ok('create','POST',input,'staff',{},201)]);assert.deepEqual(pairs[0],pairs[1]);
  await denied('create','POST',input,'staff',{id:otherEvent},409,'IDEMPOTENCY_CONFLICT');
  await denied('edit','PUT',{expectedVersion:destination.version,name:'Wrong event',description:'Fixture',active:true},'staff',{id:otherEvent,nonprofitId:destination.id},404,'NOT_FOUND');
  await admin.query("UPDATE bz_people SET name='Changed actor' WHERE id=$1",[actor]);await admin.query("UPDATE bz_businesses SET name='Changed business' WHERE id=$1",[business]);
  const prior=(await ok('pledgeReceipt','GET',undefined,'actor',{requestId:originalPledge.requestId})).receipt;assert.equal(prior.actorName,'=Actor');assert.equal(prior.businessName,'@Business');
  const csv=await ok('export','GET',undefined,'staff');assert.match(csv,/"'=Actor"/);assert.match(csv,/"'@Business"/);
 },
 'explicit clearing and representation bounds do not invent donation policy':async()=>{
  const cleared=await ok('staff','PUT',{enabled:false,amountCapMinor:null,availability:null},'staff');assert.equal(cleared.policyReady,false);assert.equal(cleared.amountCapMinor,null);assert.equal(cleared.availability,null);
  await denied('staff','PUT',{enabled:true},'staff',{},409,'DONATION_POLICY_PENDING');
  await denied('staff','PUT',{enabled:false,availability:{mode:'window',opensAt:'2026-02-30T00:00:00Z',closesAt:'2026-03-10T00:00:00Z'}},'staff',{},400,'VALIDATION');
  await configure({amountCapMinor:Number.MAX_SAFE_INTEGER});const edge=await ok('pledge','POST',pledgeBody({amountMinor:Number.MAX_SAFE_INTEGER}),'actor',{},201);assert.equal(edge.receipt.amountMinor,Number.MAX_SAFE_INTEGER);
  assert.match(await ok('export','GET',undefined,'staff'),/"9007199254740991","90071992547409.91"/);await configure();
 },
 'window closing during provisional insertion rolls back its pledge':async()=>{
  const blocker=await connect(),runtime=await connect(true),key='test:window-close:'+id(),body=pledgeBody();
  await configure({availability:{mode:'window',opensAt:new Date(Date.now()-3600000).toISOString(),closesAt:new Date(Date.now()+700).toISOString()}});
  await admin.query(`CREATE FUNCTION development_window_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('${key}',0)); RETURN NEW; END $$;
    CREATE TRIGGER development_window_wait BEFORE INSERT ON bz_donation_pledges FOR EACH ROW EXECUTE FUNCTION development_window_wait()`);
  await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);await runtime.query('BEGIN');const pid=(await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const pending=runtime.query('SELECT bz_donation_member($1,$2,$3,$4::jsonb) AS result',[hashes.actor,event,'submit',JSON.stringify(body)]);
  try{await waitFor(pid);while(!(await admin.query("SELECT (availability->>'closesAt')::timestamptz<=clock_timestamp() AS closed FROM bz_donation_settings WHERE event_id=$1",[event])).rows[0].closed)await pause(10);
   await blocker.query('COMMIT');assert.deepEqual((await pending).rows[0].result,{error:'DONATIONS_UNAVAILABLE'});await runtime.query('COMMIT');assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_donation_pledges WHERE request_id=$1',[body.requestId])).rows[0].n,0);
  }finally{await blocker.query('ROLLBACK');await pending.catch(()=>{});await runtime.query('ROLLBACK');await admin.query('DROP TRIGGER development_window_wait ON bz_donation_pledges; DROP FUNCTION development_window_wait()');}await configure();
 },
 'direct capability rejects null actions, wrong types and shadow tables':async()=>{
  const c=await connect(true);
  for(const fn of ['bz_attendee_activity','bz_donation_member','bz_donation_staff'])assert.deepEqual((await c.query(`SELECT ${fn}($1,$2,NULL,'{}'::jsonb) AS result`,[hashes.actor,event])).rows[0].result,{error:'VALIDATION'});
  assert.deepEqual((await c.query('SELECT bz_donation_staff($1,$2,$3,$4::jsonb) AS result',[hashes.staff,event,'create',JSON.stringify({requestId:id(),name:123,description:'Fixture'})])).rows[0].result,{error:'VALIDATION'});
  await c.query('CREATE TEMP TABLE bz_people(id uuid,name text); CREATE TEMP TABLE bz_sessions(token_hash text,person_id uuid)');
  const result=(await c.query("SELECT bz_attendee_activity($1,$2,'watching','{}'::jsonb) AS result",[hashes.actor,event])).rows[0].result;assert.equal(result.person.id,actor);assert.equal(result.person.name,'Changed actor');
 },
 'staff expiry after recipient insertion wait rolls back its create request':async()=>{
  await expireAfterWait('bz_donation_nonprofits','bz_donation_staff',{requestId:id(),name:'Late fixture',description:'Fixture'},undefined,'staff');
 },
 'queued disable and recipient edits reject a new pledge after real waits':async()=>{
  for(const [sql,args,code,restore] of [
   ['UPDATE bz_donation_settings SET enabled=false WHERE event_id=$1',[event],'DONATIONS_DISABLED',()=>configure()],
   ['UPDATE bz_donation_nonprofits SET version=version+1 WHERE id=$1',[destination.id],'NONPROFIT_CHANGED',async()=>{destination=(await ok('staff','GET',undefined,'staff')).nonprofits.find(n=>n.id===destination.id);}]
  ]){
   const blocker=await connect(),runtime=await connect(true),body=pledgeBody();await blocker.query('BEGIN');await blocker.query(sql,args);
   const pid=(await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   const pending=runtime.query('SELECT bz_donation_member($1,$2,$3,$4::jsonb) AS result',[hashes.actor,event,'submit',JSON.stringify(body)]);
   try{await waitFor(pid);await blocker.query('COMMIT');assert.deepEqual((await pending).rows[0].result,{error:code});assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_donation_pledges WHERE request_id=$1',[body.requestId])).rows[0].n,0);}
   finally{await blocker.query('ROLLBACK');await pending.catch(()=>{});}await restore();
  }
 },
 'request mode and payload defenses remain real route behavior':async()=>{
  const response=await call('watch','POST',watchBody(),'actor',{}, {origin:'https://foreign.invalid'});assert.equal(response.status,403);
  await denied('watch','POST',{...watchBody(),extra:'unexpected'},'actor',{},400,'VALIDATION');
  await denied('pledge','POST',{...pledgeBody(),extra:'unexpected'},'actor',{},400,'VALIDATION');
  const saved=process.env.BIDZIZI_STAGING_TEST_AUTH;process.env.BIDZIZI_STAGING_TEST_AUTH='false';try{await denied('context','GET',undefined,'actor',{},401,'UNAUTHENTICATED');}finally{process.env.BIDZIZI_STAGING_TEST_AUTH=saved;}
 },
};
try{
 execFileSync(join(pgBin,'initdb'),['-D',cluster,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
 execFileSync(join(pgBin,'pg_ctl'),['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start'],{stdio:'pipe'});started=true;postgresPid=Number((await readFile(join(cluster,'postmaster.pid'),'utf8')).split('\n')[0]);
 let bootstrap=new pg.Client({...connection,database:'postgres'});await bootstrap.connect();await bootstrap.query('CREATE DATABASE bz_test_attendee_activity');await bootstrap.end();admin=await connect();
 receipt.postgresVersion=(await admin.query('SELECT version() AS version')).rows[0].version;
 await admin.query("CREATE ROLE activity_runtime LOGIN PASSWORD 'disposable-only'");
 for(const name of ['001_staging_staff.sql','002_staging_catalog.sql','003_staging_manual_bid.sql','018_attendee_activity_donations.sql']){
  if(name.startsWith('018'))await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO activity_runtime; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO activity_runtime');
  const source=await readFile(join(repo,'migrations',name));loaded.set('migrations/'+name,sha(source));await admin.query(source.toString());
 }
 await admin.query('GRANT USAGE ON SCHEMA public TO activity_runtime; GRANT EXECUTE ON FUNCTION bz_attendee_activity(text,uuid,text,jsonb),bz_donation_member(text,uuid,text,jsonb),bz_donation_staff(text,uuid,text,jsonb) TO activity_runtime');
 await admin.query("INSERT INTO bz_orgs(id,name,initials) VALUES($1,'Synthetic Saturn','SS'),($2,'Foreign org','FO')",[org,org2]);
 for(const [who,person] of Object.entries(actorIds)){await admin.query('INSERT INTO bz_people(id,alias,name,is_test) VALUES($1,$2,$3,true)',[person,who,who==='actor'?'=Actor':who]);await admin.query("INSERT INTO bz_sessions(token_hash,person_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[hashes[who],person]);}
 await admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$2),($3,$4)',[staff,org,wrongStaff,org2]);
 await admin.query('INSERT INTO bz_events(id,org_id,created_by,draft) VALUES($1,$3,$4,$5),($2,$3,$4,$5)',[event,otherEvent,org,staff,JSON.stringify({name:'Synthetic event',version:2})]);
 for(const e of [event,otherEvent])for(const person of [actor,coworker]){
  await admin.query('INSERT INTO bz_event_view_grants(person_id,event_id) VALUES($1,$2)',[person,e]);await admin.query("INSERT INTO bz_event_bidder_admissions(person_id,event_id,access) VALUES($1,$2,'BID')",[person,e]);
 }
 for(const [r,e,l] of [[release,event,lot],[foreignRelease,otherEvent,foreignLot]]){
  await admin.query("INSERT INTO bz_catalog_approvals(id,event_id,org_id,source_revision,approved_by,local_date,local_start,local_end,timezone,opens_at,closes_at,organization_snapshot,event_snapshot) VALUES($1,$2,$3,1,$4,'2026-10-08','00:00','23:59','UTC',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',$5,$6)",[r,e,org,staff,JSON.stringify({id:org,name:'Frozen org'}),JSON.stringify({version:2,name:'Frozen event'})]);
  const snapshot={id:l,number:'001',title:'Frozen title',opening:2500};
  await admin.query('INSERT INTO bz_catalog_lots(approval_id,event_id,org_id,lot_id,position,snapshot) VALUES($1,$2,$3,$4,0,$5)',[r,e,org,l,JSON.stringify(snapshot)]);
  await admin.query('INSERT INTO bz_lots(id,event_id,org_id,position,data) VALUES($1,$2,$3,0,$4)',[l,e,org,JSON.stringify(snapshot)]);
 }
 await admin.query("INSERT INTO bz_businesses(id,name) VALUES($1,'@Business'),($2,'Rival')",[business,rival]);
 await admin.query('INSERT INTO bz_business_person_memberships(person_id,business_id,can_bid) VALUES($1,$3,true),($2,$3,true)',[actor,coworker,business]);
 await admin.query('INSERT INTO bz_org_business_memberships(org_id,business_id) VALUES($1,$2),($1,$3)',[org,business,rival]);
 const acceptedBid=id();await admin.query("INSERT INTO bz_manual_bids(id,actor_id,business_id,request_id,event_id,org_id,release_id,lot_id,amount_minor,ruleset_id,currency,standing_version,decided_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,2500,'saturn-trade-tiered-v1','SATURN_TRADE_DOLLAR_SYNTHETIC_V1',1,clock_timestamp())",[acceptedBid,actor,business,id(),event,org,release,lot]);
 await admin.query("INSERT INTO bz_lot_standing(release_id,lot_id,event_id,org_id,ruleset_id,currency,increment_minor,amount_cap_minor,current_amount_minor,leading_business_id,accepted_bid_id,accepted_bid_count,version) VALUES($1,$2,$3,$4,'saturn-trade-tiered-v1','SATURN_TRADE_DOLLAR_SYNTHETIC_V1',2500,1000000000,2500,$5,$6,1,1)",[release,lot,event,org,business,acceptedBid]);
 for(const [person,status] of [[actor,'accepted'],[actor,'rejected'],[coworker,'accepted']]){const key=id();const data={actorId:person,requestId:key,eventId:event,releaseId:release,lotId:lot,businessId:business,amountMinor:2500,rulesetId:'saturn-trade-tiered-v1',currency:'SATURN_TRADE_DOLLAR_SYNTHETIC_V1',status,reason:status==='rejected'?'STALE_MINIMUM':null,bidId:status==='accepted'?acceptedBid:null,decidedAt:new Date().toISOString()};
 await admin.query('INSERT INTO bz_bid_receipts(actor_id,request_id,payload_hash,receipt,http_status) VALUES($1,$2,$3,$4,$5)',[person,key,sha(key),JSON.stringify(data),status==='accepted'?201:409]);}
 Object.assign(process.env,{BIDZIZI_APP_MODE:'local-test',BIDZIZI_STAGING_TEST_AUTH:'true',BIDZIZI_LOCAL_TEST_DATABASE:'true',APP_ORIGIN:origin,DATABASE_URL:`postgres://activity_runtime:disposable-only@127.0.0.1:${port}/bz_test_attendee_activity`});
 for(const [name,run] of Object.entries(cases)){
  await resetAuthority();try{await run();receipt.cases.push({name,result:'PASS'});console.log('PASS '+name);}catch(e){receipt.cases.push({name,result:'FAIL',message:e.message});console.error('FAIL '+name+': '+e.stack);process.exitCode=1;}
 }
}catch(e){console.error(e);receipt.setupError=e.message;process.exitCode=1;}
finally{
 await Promise.allSettled([...pools].map(p=>p.end()));await Promise.allSettled(clients.map(c=>c.end()));
 if(started)execFileSync(join(pgBin,'pg_ctl'),['-D',cluster,'-m','fast','-w','stop'],{stdio:'pipe'});
 let processAbsent=false;if(postgresPid)try{process.kill(postgresPid,0);}catch(e){if(e.code==='ESRCH')processAbsent=true;else throw e;}
 const portClosed=await new Promise(r=>{const socket=createConnection({host:'127.0.0.1',port});socket.on('connect',()=>{socket.destroy();r(false);});socket.on('error',e=>{socket.destroy();r(e.code==='ECONNREFUSED');});socket.setTimeout(500,()=>{socket.destroy();r(false);});});
 await rm(cluster,{recursive:true,force:true});receipt.cleanup={clusterStopped:started,clusterRemoved:true,postgresPid,processAbsent,port,portClosed};if(started&&(!processAbsent||!portClosed))process.exitCode=1;
 receipt.sourceBefore=Object.fromEntries(loaded);receipt.sourceAfter=Object.fromEntries([...loaded.keys()].map(p=>[p,sha(readFileSync(join(repo,p)))]));assert.deepEqual(receipt.sourceAfter,receipt.sourceBefore,'Source changed during check');
 await writeFile(join(root,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Receipt '+join(root,'RESULT.json'));
}
