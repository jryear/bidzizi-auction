import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {withFixture,HarnessError,ApplicationFailure} from '../staging-workspace-entry/harness.mjs';
import {prepareFixture,ids} from '../staging-manual-bid/fixtures.mjs';
import {openLot,review,confirm} from '../staging-manual-bid/browser.mjs';

export const groups=[
 {name:'Demo entry and durable connected authority',kind:'acceptance',ids:['DISCOVERY_PRIVATE','EMPTY_SCOPED_ENROLLMENT','CONCURRENT_IDENTICAL_RETRY','CHANGED_RETRY_DENIED','CLAIMS_DUPLICATE_ISOLATED','REAL_BID_FOREIGN_RECEIPT_OPAQUE']},
 {name:'Demo entry adversarial authority and recovery',kind:'adversarial',ids:['ORIGIN_FIELDS_VALIDATION','BOOTSTRAP_EVENT_SECRET_REQUIRED','BEGIN_SLOT_RACES','DISABLED_EXPIRED_POST_LOCK','ATOMIC_SESSION_FAILURE','ACK_REPLAY_LOGOUT','STAFF_SESSION_NOT_REPLACED','RUNTIME_ACL_DENIALS','CURRENT_GRANT_REVOCATION']},
 {name:'Native demo entry pending interruption refresh and bid',kind:'acceptance',ids:['NATIVE_EMPTY_PROFILE','HELD_ENROLLMENT_UNCONFIRMED','LOST_ENROLL_ACK_RETRY','REFRESH_PRIVATE_CONTINUITY','LOST_ACK_IDEMPOTENT','NATIVE_REAL_BID_OUTBID']}
];
const prefix=event=>'/api/demo/events/'+event;
const profile={name:'Demo Ada',businessName:'Juniper Studio',memberId:'DEMO-ONLY-MEMBER'};
const cookies=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const post=(f,path,json,cookie)=>f.request(path,{method:'POST',json,cookie,headers:{origin:f.origin}});
const slotName=id=>'bz_demo_entry_'+id;
async function crossing(f,expiry){
 const before=await f.dbNow();assert.ok(before<expiry,'Request is held before unchanged DB expiry');
 const until=Date.now()+10_000;let after;
 while(Date.now()<until){after=await f.dbNow();if(after>=expiry)return {before:before.toISOString(),expiry:expiry.toISOString(),after:after.toISOString()};await new Promise(r=>setTimeout(r,20));}
 throw new HarnessError('Independent DB clock never crossed bounded expiry');
}
async function begin(f,event=ids.event,entryId=randomUUID()){
 const r=await post(f,prefix(event)+'/begin',{entryId});assert.equal(r.status,200);return {entryId,cookie:cookies(r),response:r,event};
}
const enroll=(f,s,p=profile,cookie=s.cookie)=>post(f,prefix(s.event)+'/enroll',{entryId:s.entryId,...p},cookie);
const ack=(f,s,cookie)=>post(f,prefix(s.event)+'/acknowledge',{entryId:s.entryId},cookie);
async function counts(f){
 const tables=['bz_people','bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_view_grants','bz_event_bidder_admissions','bz_sessions','bz_staff_grants','bz_lot_standing','bz_manual_bids','bz_bid_receipts'];
 const rows={};for(const t of tables)rows[t]=Number((await f.db.query('SELECT count(*) n FROM '+t)).rows[0].n);return rows;
}
async function current(f,cookie){const r=await f.request('/api/session',{cookie});assert.equal(r.status,200);return r.data;}
async function queued(f,table,id,request,mutate){
 const lock=await f.privilegedConnection();await lock.query('BEGIN');await lock.query('SELECT * FROM '+table+' WHERE '+(table==='bz_demo_event_entries'?'event_id':table==='bz_sessions'?'token_hash':'id')+'=$1 FOR UPDATE',[id]);
 const pending=request();let observed=false;
 try{
  const until=Date.now()+10_000;
  while(Date.now()<until){const rows=await f.db.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",[f.runtimeRole]);if(rows.rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,20));}
  if(!observed)throw new HarnessError('Held request never reached the observed database lock.');
  await mutate(lock);await lock.query('COMMIT');return await pending;
 }finally{await lock.query('ROLLBACK').catch(()=>{});await lock.end();await pending.catch(()=>{});}
}
async function setup(f){
 assert.equal((await f.request('/api/session')).status,200,'Known baseline API reachability');
 await prepareFixture(f,{phase:'open'});
 // Existing immutable fixture and scoped role are proven before finite route absence.
 assert.equal((await f.db.query('SELECT count(*) n FROM bz_catalog_lots WHERE approval_id=$1',[ids.release])).rows[0].n,'2');
 assert.equal((await f.runtimeDB.query('SELECT current_user u')).rows[0].u,f.runtimeRole);
 const discovery=await f.request(prefix(ids.event)+'/entry');
 if(discovery.status===404 && discovery.data===null)return {absent:true,discovery};
 const file=join(f.repo,'migrations/009_demo_attendee_entry.sql');
 try{await access(file);}catch{throw new HarnessError('Reached demo feature lacks required migration.');}
 try{await f.db.query('SET ROLE '+f.migratorRole);await f.db.query(await readFile(file,'utf8'));}
 catch(e){throw new HarnessError('Demo migration setup failed: '+e.message);}
 finally{await f.db.query('RESET ROLE');}
 for(const t of ['bz_demo_event_entries','bz_demo_entry_slots'])if(!(await f.db.query('SELECT to_regclass($1) t',[t])).rows[0].t)throw new HarnessError('Required demo schema absent.');
 await f.db.query('GRANT SELECT ON bz_demo_event_entries TO '+f.runtimeRole);
 for(const sig of ['bz_demo_begin(uuid,uuid,text)','bz_demo_enroll(uuid,uuid,text,text,text,text,text,text)','bz_demo_acknowledge(uuid,uuid,text)'])await f.db.query('GRANT EXECUTE ON FUNCTION '+sig+' TO '+f.runtimeRole);
 await f.db.query('INSERT INTO bz_demo_event_entries(event_id,org_id,enabled) VALUES($1,$2,true)',[ids.event,ids.saturn]);
 return {absent:false};
}
export async function runGroup(index,record,output){
 const g=groups[index];
 await withFixture(async f=>{
  const setupState=await setup(f);
  const cases= index===0?entryCases:index===1?adversarialCases:browserCases;
  for(const id of g.ids){
   if(setupState.absent){const r=await f.request(prefix(ids.event)+'/entry');await record(id,()=>assert.equal(r.status,200,'Reached demo entry route absent; finite feature RED'),{status:r.status});continue;}
   await record(id,()=>cases[id](f,output));
  }
 });
}
const entryCases={
 async DISCOVERY_PRIVATE(f){
  const r=await f.request(prefix(ids.event)+'/entry');assert.equal(r.status,200);assert.deepEqual(r.data,{demoEntry:true,eventId:ids.event});assert.equal(r.headers.get('cache-control'),'private, no-store');
  const session=await current(f);assert.equal(session.authenticated,false);
  assert.equal((await f.request('/api/catalog/events/'+ids.event)).status,401);
  assert.equal((await f.request(prefix(ids.eventPine)+'/entry')).status,404);
  return {entry:r.data,anonymous:true};
 },
 async EMPTY_SCOPED_ENROLLMENT(f){
  const s=await begin(f),before=await counts(f),published=await f.publicationRows(ids.event),r=await enroll(f,s);
  assert.equal(r.status,201);const cookie=cookies(r);assert.ok(/^bz_session=[A-Za-z0-9_-]{43}$/.test(cookie),'Private session shape');assert.ok(/HttpOnly; SameSite=Lax/.test(r.headers.get('set-cookie')),'Private session attributes');
  const actual=await current(f,cookie);assert.equal(actual.person.id,r.data.person.id);assert.deepEqual(actual.staffOrganizations,[]);assert.equal(r.data.eventId,ids.event);assert.equal(r.data.business.name,profile.businessName);assert.equal(r.text.includes(profile.memberId),false);
  const after=await counts(f);for(const table of ['bz_people','bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_view_grants','bz_event_bidder_admissions','bz_sessions'])assert.equal(after[table],before[table]+1,table);
  for(const table of ['bz_staff_grants','bz_lot_standing','bz_manual_bids','bz_bid_receipts'])assert.equal(after[table],before[table],table);
  assert.deepEqual(await f.publicationRows(ids.event),published);
  const context=await f.request('/api/bidder/events/'+ids.event+'/context',{cookie});assert.equal(context.status,200);assert.deepEqual(context.data.businesses,[{id:r.data.business.id,name:profile.businessName,canBid:true}]);
  assert.equal((await f.request('/api/bidder/events/'+ids.eventPine+'/context',{cookie})).status,403);
  const history=await f.db.query('SELECT * FROM bz_manual_bids WHERE actor_id=$1',[r.data.person.id]);assert.equal(history.rows.length,0);
  const standing=await f.request('/api/bidder/events/'+ids.event+'/lots/'+ids.lotA+'/standing',{cookie});assert.equal(standing.status,200);assert.equal(standing.data.standing.version,0);assert.equal(standing.data.standing.leadingBusiness,null);assert.equal(standing.data.standing.currentAmountMinor,null);
  return {person:r.data.person,business:r.data.business,emptyHistory:true,event:r.data.eventId};
 },
 async CONCURRENT_IDENTICAL_RETRY(f){
  const s=await begin(f),before=await counts(f),rows=await Promise.all([enroll(f,s),enroll(f,s),enroll(f,s)]);
  for(const r of rows)assert.equal(r.status,201);assert.deepEqual(rows.map(r=>r.data.person.id),Array(3).fill(rows[0].data.person.id));assert.ok(rows.every(r=>cookies(r)===cookies(rows[0])),'Identical retry private session equality');
  const after=await counts(f);assert.equal(after.bz_people,before.bz_people+1);assert.equal(after.bz_sessions,before.bz_sessions+1);
  const normalized=await enroll(f,s,{name:'  '+profile.name+'  ',businessName:' '+profile.businessName+' ',memberId:' '+profile.memberId+' '});assert.equal(normalized.status,201);assert.equal(normalized.data.person.id,rows[0].data.person.id);
  return {samePerson:true,sameSession:true,createdOnce:true};
 },
 async CHANGED_RETRY_DENIED(f){const s=await begin(f),a=await enroll(f,s),before=await counts(f),b=await enroll(f,s,{...profile,name:'Changed'});assert.equal(a.status,201);assert.equal(b.status,409);assert.equal(b.headers.has('set-cookie'),false);assert.deepEqual(await counts(f),before);return {changedStatus:b.status};},
 async CLAIMS_DUPLICATE_ISOLATED(f){
  const a=await enroll(f,await begin(f)),b=await enroll(f,await begin(f));assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.data.person.id,b.data.person.id);assert.notEqual(a.data.business.id,b.data.business.id);
  assert.notEqual(a.data.person.id,ids.personJuniper);assert.notEqual(a.data.business.id,ids.businessJuniper);
  return {separateActors:true,separateBusinesses:true};
 },
 async REAL_BID_FOREIGN_RECEIPT_OPAQUE(f){
  const a=await enroll(f,await begin(f)),b=await enroll(f,await begin(f)),requestId=randomUUID(),path='/api/bidder/events/'+ids.event+'/lots/'+ids.lotA;
  const bid=await post(f,path+'/bids',{requestId,businessId:a.data.business.id,amountMinor:10000,rulesetId:'staging-usd-manual-v1'},cookies(a));assert.equal(bid.status,201);assert.equal(bid.data.receipt.actorId,a.data.person.id);
  assert.equal((await f.request(path+'/bid-receipts/'+requestId,{cookie:cookies(b)})).status,404);
  assert.equal((await post(f,path+'/bids',{requestId:randomUUID(),businessId:a.data.business.id,amountMinor:12500,rulesetId:'staging-usd-manual-v1'},cookies(b))).status,403);
  return {receipt:bid.data.receipt,foreignReceipt:404,foreignBusiness:403};
 }
};
const adversarialCases={
 async ORIGIN_FIELDS_VALIDATION(f){
  const s=await begin(f),before=await counts(f);
  const invalid=[{...profile,personId:ids.staff},{...profile,businessId:ids.businessJuniper},{...profile,canBid:true}];for(const key of ['name','businessName','memberId'])for(const value of ['','   ','\u0001bad','x'.repeat(key==='businessName'?121:81)])invalid.push({...profile,[key]:value});
  for(const fields of invalid)assert.equal((await enroll(f,s,fields)).status,400);
  assert.equal((await f.request(prefix(ids.event)+'/enroll',{method:'POST',json:{entryId:s.entryId,...profile},cookie:s.cookie,headers:{origin:'https://foreign.invalid'}})).status,403);
  assert.equal((await f.request(prefix(ids.event)+'/enroll',{method:'POST',raw:'{}',cookie:s.cookie,headers:{origin:f.origin,'content-type':'text/plain'}})).status,400);
  assert.deepEqual(await counts(f),before);return {invalidRejected:true,noAuthorityWrites:true};
 },
 async BOOTSTRAP_EVENT_SECRET_REQUIRED(f){
  const s=await begin(f),before=await counts(f);
  assert.equal((await enroll(f,s,profile,'')).status,403);
  assert.equal((await enroll(f,s,profile,slotName(s.entryId)+'='+'a'.repeat(43))).status,403);
  await f.db.query('INSERT INTO bz_demo_event_entries(event_id,org_id,enabled) VALUES($1,$2,true)',[ids.eventPine,ids.pine]);
  const transplanted=await enroll(f,{...s,event:ids.eventPine});assert.equal(transplanted.status,403);assert.equal(transplanted.headers.has('set-cookie'),false);
  assert.equal((await ack(f,s,'')).status,401);assert.deepEqual(await counts(f),before);return {publicIdPowerless:true,eventScoped:true};
 },
 async BEGIN_SLOT_RACES(f){
  const entryId=randomUUID(),rows=await Promise.all([post(f,prefix(ids.event)+'/begin',{entryId}),post(f,prefix(ids.event)+'/begin',{entryId})]);assert.deepEqual(rows.map(r=>r.status).sort(),[200,409]);assert.equal(rows.find(r=>r.status===409).headers.has('set-cookie'),false);
  const winner=rows.find(r=>r.status===200);assert.ok(winner.headers.get('set-cookie').includes(slotName(entryId)),'Correct slot cookie');assert.ok(/HttpOnly; SameSite=Strict/.test(winner.headers.get('set-cookie')),'Private bootstrap attributes');assert.ok(winner.headers.get('set-cookie').includes('Path='+prefix(ids.event)),'Event cookie path');
  const a=await begin(f),b=await begin(f);assert.ok(cookies(a)!==cookies(b),'Separate private cookies');assert.ok(cookies(a).includes(slotName(a.entryId)),'First slot cookie');assert.ok(cookies(b).includes(slotName(b.entryId)),'Second slot cookie');
  const both=b.cookie+'; '+a.cookie;assert.equal((await enroll(f,a,profile,both)).status,201);assert.equal((await enroll(f,b,profile,both)).status,201);
  let browser;try{browser=await chromium.launch({headless:true});}catch{throw new HarnessError('Independent Chromium unavailable');}
  const context=await browser.newContext(),page=await context.newPage();
  let release,held;const blocked=new Promise(r=>{held=r;}),gate=new Promise(r=>{release=r;});const left=randomUUID(),right=randomUUID();
  try{
   await page.goto(f.origin+'/events/'+ids.event,{waitUntil:'domcontentloaded'});
   await page.route('**/api/demo/events/*/begin',async route=>{
    const request=route.request(),body=request.postDataJSON();const response=await post(f,prefix(ids.event)+'/begin',body,request.headers().cookie);
    if(body.entryId===right){held();await gate;}
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:response.text});
   });
   const rightCall=page.evaluate(async({path,entryId})=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryId})})).status,{path:prefix(ids.event)+'/begin',entryId:right});await blocked;
   const leftStatus=await page.evaluate(async({path,entryId})=>(await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryId})})).status,{path:prefix(ids.event)+'/begin',entryId:left});assert.equal(leftStatus,200);
   const enrolled=await page.evaluate(async({path,entryId,profile})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryId,...profile})});return {status:r.status,body:await r.json()};},{path:prefix(ids.event)+'/enroll',entryId:left,profile});assert.equal(enrolled.status,201);
   release();assert.equal(await rightCall,200);const actualCookies=await context.cookies();assert.ok(actualCookies.some(c=>c.name===slotName(left)));assert.ok(actualCookies.some(c=>c.name===slotName(right)));
   const same=await page.evaluate(async({path,entryId,profile})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entryId,...profile})});return {status:r.status,body:await r.json()};},{path:prefix(ids.event)+'/enroll',entryId:left,profile});assert.equal(same.status,201);assert.equal(same.body.person.id,enrolled.body.person.id);
  }finally{release();await context.close();await browser.close();}
  return {sameSlotLoser:409,separateCookieSlots:true,lateDistinctBeginResponseSafe:true};
 },
 async DISABLED_EXPIRED_POST_LOCK(f){
  // Warm the handler before allocating the short expiry; never rewrite expiry while held.
  await post(f,prefix(ids.event)+'/enroll',{});
  const s=await begin(f),expiry=(await f.db.query("UPDATE bz_demo_entry_slots SET expires_at=clock_timestamp()+interval '3 seconds' WHERE id=$1 RETURNING expires_at",[s.entryId])).rows[0].expires_at;let clockBracket;
  let r=await queued(f,'bz_demo_entry_slots',s.entryId,()=>enroll(f,s),async()=>{clockBracket=await crossing(f,expiry);});assert.equal(r.status,403);
  const s2=await begin(f);r=await queued(f,'bz_demo_event_entries',ids.event,()=>enroll(f,s2),c=>c.query('UPDATE bz_demo_event_entries SET enabled=false WHERE event_id=$1',[ids.event]));assert.equal(r.status,404);
  await f.db.query('UPDATE bz_demo_event_entries SET enabled=true WHERE event_id=$1',[ids.event]);
  const s3=await begin(f),created=await enroll(f,s3);assert.equal(created.status,201);
  const lock=await f.privilegedConnection();await lock.query('BEGIN');await lock.query('UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE person_id=$1',[created.data.person.id]);
  const pending=enroll(f,s3);let blocked=false;try{const until=Date.now()+10_000;while(Date.now()<until){if((await f.db.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",[f.runtimeRole])).rows.length){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}if(!blocked)throw new HarnessError('Revocation lock not observed');await lock.query('COMMIT');r=await pending;assert.equal(r.status,403);}finally{await lock.query('ROLLBACK').catch(()=>{});await lock.end();await pending.catch(()=>{});}
  const s4=await begin(f),created4=await enroll(f,s4);assert.equal(created4.status,201);const sessionHash=(await f.db.query('SELECT session_hash FROM bz_demo_entry_slots WHERE id=$1',[s4.entryId])).rows[0].session_hash;
  const sessionExpiry=(await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '3 seconds' WHERE token_hash=$1 RETURNING expires_at",[sessionHash])).rows[0].expires_at;let sessionClockBracket;
  const expiredSession=await queued(f,'bz_sessions',sessionHash,()=>enroll(f,s4),async()=>{sessionClockBracket=await crossing(f,sessionExpiry);});assert.equal(expiredSession.status,403);
  return {queuedExpired:403,clockBracket,queuedDisabled:404,queuedRevoked:403,queuedSessionExpired:403,sessionClockBracket};
 },
 async ATOMIC_SESSION_FAILURE(f){
  const s=await begin(f),before=await counts(f);
  await f.db.query("CREATE FUNCTION demo_probe_reject_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PROBE_ONLY'; END $$; CREATE TRIGGER demo_probe_session BEFORE INSERT ON bz_sessions FOR EACH ROW EXECUTE FUNCTION demo_probe_reject_session();");
  try{const r=await enroll(f,s);assert.equal(r.status,503);assert.equal(r.headers.has('set-cookie'),false);assert.equal(r.text.includes('PROBE_ONLY'),false);assert.deepEqual(await counts(f),before);assert.equal((await f.db.query('SELECT person_id FROM bz_demo_entry_slots WHERE id=$1',[s.entryId])).rows[0].person_id,null);}finally{await f.db.query('DROP TRIGGER demo_probe_session ON bz_sessions; DROP FUNCTION demo_probe_reject_session();');}
  assert.equal((await enroll(f,s)).status,201);return {rollbackComplete:true,retryCreated:true};
 },
 async ACK_REPLAY_LOGOUT(f){
  const s=await begin(f),r=await enroll(f,s),privateCookie=cookies(r);assert.equal((await ack(f,s,s.cookie+'; '+privateCookie)).status,200);assert.equal((await ack(f,s,privateCookie)).status,200);assert.equal((await enroll(f,s)).status,403);
  await post(f,'/api/session/logout',{},privateCookie);assert.equal((await ack(f,s,privateCookie)).status,401);assert.equal((await enroll(f,s)).status,403);
  const unacked=await begin(f),created=await enroll(f,unacked);await post(f,'/api/session/logout',{},cookies(created));assert.equal((await enroll(f,unacked)).status,403);
  return {ackIdempotent:true,consumedCannotEnroll:true,logoutNoResurrection:true};
 },
 async STAFF_SESSION_NOT_REPLACED(f){
  const staff=await post(f,'/api/test-auth/login',{account:'staff-saturn'}),cookie=cookies(staff),s=await begin(f);
  const before=await current(f,cookie);assert.equal((await post(f,prefix(ids.event)+'/begin',{entryId:randomUUID()},cookie)).status,409);assert.equal((await enroll(f,s,profile,s.cookie+'; '+cookie)).status,409);assert.deepEqual(await current(f,cookie),before);
  return {staffPreserved:true};
 },
 async RUNTIME_ACL_DENIALS(f){
  const denied=["INSERT INTO bz_people(id,alias,name,is_test) VALUES(gen_random_uuid(),'forged','Forged',true)","INSERT INTO bz_staff_grants(person_id,org_id) VALUES('"+ids.personUnlisted+"','"+ids.saturn+"')","UPDATE bz_demo_event_entries SET enabled=false","SELECT * FROM bz_demo_entry_slots",'UPDATE bz_demo_entry_slots SET consumed_at=clock_timestamp()',"INSERT INTO bz_demo_entry_slots(id,event_id,token_hash,expires_at) VALUES(gen_random_uuid(),'"+ids.event+"',repeat('a',64),clock_timestamp())",'CREATE TABLE public.demo_runtime_escape(id uuid)','SET ROLE '+f.migratorRole];
  for(const t of ['bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_view_grants','bz_event_bidder_admissions'])denied.push('INSERT INTO '+t+' DEFAULT VALUES');
  for(const sql of denied){let code;try{await f.runtimeDB.query(sql);}catch(e){code=e.code;}assert.equal(code,'42501','Actual runtime permission denial: '+sql);}
  const functions=await f.db.query("SELECT p.prosecdef,p.proconfig,p.proacl::text FROM pg_proc p WHERE p.proname IN ('bz_demo_begin','bz_demo_enroll','bz_demo_acknowledge')");assert.equal(functions.rows.length,3);for(const row of functions.rows){assert.equal(row.prosecdef,true);assert.ok(row.proconfig.some(v=>v==='search_path=pg_catalog'));assert.equal(/(?:^|[,{])=X\//.test(row.proacl),false);}
  const publicRole='public_probe_'+randomUUID().replaceAll('-','');await f.db.query('CREATE ROLE '+publicRole+' NOLOGIN');await f.db.query('GRANT USAGE ON SCHEMA public TO '+publicRole);
  try{await f.db.query('SET ROLE '+publicRole);let code;try{await f.db.query('SELECT public.bz_demo_begin(NULL,NULL,NULL)');}catch(e){code=e.code;}assert.equal(code,'42501','Fresh role inherits no PUBLIC function execution');}finally{await f.db.query('RESET ROLE');}
  return {actualDeniedSQL:denied.length,publicExecuteRevoked:true};
 },
 async CURRENT_GRANT_REVOCATION(f){
  const r=await enroll(f,await begin(f)),cookie=cookies(r),path='/api/bidder/events/'+ids.event+'/lots/'+ids.lotB+'/bids';await f.db.query('UPDATE bz_event_bidder_admissions SET active=false WHERE person_id=$1',[r.data.person.id]);
  assert.equal((await post(f,path,{requestId:randomUUID(),businessId:r.data.business.id,amountMinor:10000,rulesetId:'staging-usd-manual-v1'},cookie)).status,403);return {revokedBidDenied:true};
 }
};
async function native(f,run){
 let browser;try{browser=await chromium.launch({headless:true});}catch{throw new HarnessError('Independent Chromium unavailable');}
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await page.goto(f.origin+'/events/'+ids.event,{waitUntil:'domcontentloaded',timeout:20_000});await expect(page.getByRole('heading',{name:'Create your demo profile'})).toBeVisible();return await run({context,page,frame:page.frameLocator('iframe[title="BidZizi event"]'),errors});}finally{await context.close();await browser.close();}
}
async function fill(ui){await ui.page.getByLabel('Your name',{exact:true}).fill(profile.name);await ui.page.getByLabel('Business name',{exact:true}).fill(profile.businessName);await ui.page.getByLabel('Member ID',{exact:true}).fill(profile.memberId);}
async function entered(ui){await expect(ui.frame.locator('h1')).toContainText('Staging manual bid event');await expect(ui.page.getByText(profile.name,{exact:true})).toBeVisible();}
const browserCases={
 async NATIVE_EMPTY_PROFILE(f,output){return native(f,async ui=>{await expect(ui.page.getByText(/Self-entered.*not verified/i)).toBeVisible();assert.equal(await ui.page.locator('iframe').count(),0);await fill(ui);await ui.page.screenshot({path:join(output,'profile-phone.png')});await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();await entered(ui);await ui.page.screenshot({path:join(output,'entry-connected-phone.png')});assert.deepEqual(ui.errors,[]);return {profileAndConnected:true};});},
 async HELD_ENROLLMENT_UNCONFIRMED(f){return native(f,async ui=>{await fill(ui);let release,held;const wait=new Promise(r=>{release=r;}),reached=new Promise(r=>{held=r;});await ui.page.route('**/api/demo/events/*/enroll',async route=>{held();await wait;await route.continue();});await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();await reached;try{assert.equal(await ui.page.locator('iframe').count(),0);await expect(ui.page.getByRole('button',{name:'Entering…',exact:true})).toBeDisabled();await expect(ui.page.getByLabel('Member ID',{exact:true})).toBeDisabled();}finally{release();}await entered(ui);return {heldNeverAccepted:true};});},
 async LOST_ENROLL_ACK_RETRY(f){return native(f,async ui=>{await fill(ui);const before=await counts(f);await ui.page.route('**/api/demo/events/*/enroll',async route=>{await route.fetch();await route.abort();},{times:1});await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();await expect(ui.page.getByRole('button',{name:'Check entry',exact:true})).toBeVisible();assert.equal(await ui.page.locator('iframe').count(),0);await ui.page.getByRole('button',{name:'Check entry',exact:true}).click();await entered(ui);const after=await counts(f);assert.equal(after.bz_people,before.bz_people+1);return {lostAckRecoveredOnce:true};});},
 async REFRESH_PRIVATE_CONTINUITY(f){return native(f,async ui=>{await fill(ui);await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();await entered(ui);const before=await ui.page.request.get(f.origin+'/api/session');const p=(await before.json()).person.id;await ui.page.reload();await entered(ui);const after=await ui.page.request.get(f.origin+'/api/session');assert.equal((await after.json()).person.id,p);return {sameActorAfterReload:true};});},
 async LOST_ACK_IDEMPOTENT(f){return native(f,async ui=>{await fill(ui);await ui.page.route('**/api/demo/events/*/acknowledge',async route=>{await route.fetch();await route.abort();},{times:1});await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();await expect(ui.page.getByRole('button',{name:'Check entry',exact:true})).toBeVisible();assert.equal(await ui.page.locator('iframe').count(),0);await ui.page.reload();await entered(ui);return {lostConsumedAckRecoveredBySession:true};});},
 async NATIVE_REAL_BID_OUTBID(f,output){return native(f,async ui=>{await fill(ui);await ui.page.getByRole('button',{name:'Enter demo event',exact:true}).click();await entered(ui);await openLot(ui,{fixtures:ids});const standing=await f.db.query('SELECT current_amount_minor FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2',[ids.release,ids.lotB]);const amount=standing.rows[0].current_amount_minor===null?10000:Number(standing.rows[0].current_amount_minor)+2500;await openLot(ui,{fixtures:ids},ids.lotB);const dialog=await review(ui,amount,profile.businessName,profile.name);await confirm(dialog);await expect(dialog).toContainText(/accepted/i);await ui.page.screenshot({path:join(output,'bid-accepted-phone.png')});const rival=await enroll(f,await begin(f),{...profile,name:'Demo Rival'});const r=await post(f,'/api/bidder/events/'+ids.event+'/lots/'+ids.lotB+'/bids',{requestId:randomUUID(),businessId:rival.data.business.id,amountMinor:amount+2500,rulesetId:'staging-usd-manual-v1'},cookies(rival));assert.equal(r.status,201);await ui.page.getByRole('button',{name:'Refresh event',exact:true}).click();await expect(ui.frame.locator('main[data-lot="'+ids.lotB+'"]')).toContainText(/outbid/i);await ui.page.screenshot({path:join(output,'outbid-phone.png')});return {realAcceptedThenOutbid:true};});}
};
