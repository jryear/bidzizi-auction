import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localFixture,request,sha,sleep,waitOn,sourceHash } from './local-fixture.mjs';
const ops=await import('../../src/server/staff-operations.ts');
const {handle}=await import('../../src/server/http.ts');
const {emptyTradeEvent,TRADE_DENOMINATION,TRADE_RULESET,tradeDraft}=await import('../../src/server/timing.ts');
const files=['src/server/staff-operations.ts','src/server/catalog.ts','src/server/timing.ts','src/server/staff-assets.ts','tests/development/staff-operations.mjs','tests/development/local-fixture.mjs'];
const before=Object.fromEntries(files.map(file=>[file,sourceHash(file)]));
const f=await localFixture('bz_test_staff_ops',['001_staging_staff.sql','002_staging_catalog.sql','003_staging_manual_bid.sql','009_demo_attendee_entry.sql','015_staff_event_entry.sql','016_staging_staff_assets.sql','019_staff_bidder_operations.sql']);
const ids=Object.fromEntries(['org','otherOrg','staff','coworker','foreignStaff','member','business','event','otherEvent','release','lot','bid'].map(name=>[name,randomUUID()]));
const tokens={staff:'a'.repeat(43),coworker:'b'.repeat(43),foreignStaff:'c'.repeat(43),member:'d'.repeat(43)};
const read=token=>request(token),post=(token,data)=>request(token,data);
async function status(run,expected){const response=await handle(run);assert.equal(response.status,expected);return response.json();}
async function test(name,run){try{await run();f.report.cases.push({name,result:'PASS'});console.log('PASS '+name);}catch(error){f.report.cases.push({name,result:'FAIL',message:error.message});throw error;}}
try {
  await f.admin.query('GRANT EXECUTE ON FUNCTION bz_staff_bidder_list(text,uuid),bz_staff_bidder_set(text,uuid,uuid,uuid,integer,text,boolean) TO fixture_runtime');
  await f.admin.query("INSERT INTO bz_orgs(id,name,initials) VALUES($1,'Saturn','SA'),($2,'Other org','OT')",[ids.org,ids.otherOrg]);
  for(const who of ['staff','coworker','foreignStaff','member']) {
    await f.admin.query('INSERT INTO bz_people(id,alias,name,is_test) VALUES($1,$2,$2,true)',[ids[who],who]);
    await f.admin.query("INSERT INTO bz_sessions(token_hash,person_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[sha(tokens[who]),ids[who]]);
  }
  await f.admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$4),($2,$4),($3,$5)',[ids.staff,ids.coworker,ids.foreignStaff,ids.org,ids.otherOrg]);
  const event=emptyTradeEvent('Draft title');event.welcome='Synthetic test';event.sponsorsEnabled=true;event.sponsors=[{name:'Real sponsor awaiting image',logo:null}];
  await f.admin.query('INSERT INTO bz_events(id,org_id,created_by,draft) VALUES($1,$3,$4,$5),($2,$6,$4,$5)',[ids.event,ids.otherEvent,ids.org,ids.staff,event,ids.otherOrg]);
  await f.admin.query("INSERT INTO bz_businesses(id,name) VALUES($1,'+Leading synthetic business')",[ids.business]);
  await f.admin.query('INSERT INTO bz_business_person_memberships(person_id,business_id,can_bid) VALUES($1,$2,true)',[ids.member,ids.business]);
  await f.admin.query('INSERT INTO bz_org_business_memberships(org_id,business_id) VALUES($1,$2)',[ids.org,ids.business]);
  await f.admin.query('INSERT INTO bz_event_view_grants(person_id,event_id) VALUES($1,$2)',[ids.member,ids.event]);
  await f.admin.query("INSERT INTO bz_event_bidder_admissions(person_id,event_id,access) VALUES($1,$2,'BID')",[ids.member,ids.event]);
  await test('staff-only-and-org-private',async()=>{
    await status(()=>ops.getStaffResults(read(),ids.event),401);
    await status(()=>ops.getStaffResults(read(tokens.member),ids.event),403);
    await status(()=>ops.getStaffResults(read(tokens.foreignStaff),ids.event),403);
    const result=await status(()=>ops.getStaffResults(read(tokens.staff),ids.event),200);
    assert.equal(result.published,false);assert.equal(result.phase,'draft');assert.equal(result.finalized,false);assert.equal(result.lots.length,0);
  });
  await test('nullable-sponsor-validated',async()=>{
    const lot={id:ids.lot,title:'Test',short:'',description:'Test',category:'Test',image:null,alt:'',opening:100,includes:[],fine:'',fixedRaiseMinor:null};
    assert.equal(tradeDraft({event,lots:[lot]}).event.sponsors[0].logo,null);
    assert.throws(()=>tradeDraft({event:{...event,sponsors:[{name:'Bad',logo:'https://foreign.invalid/image'}]},lots:[lot]}));
  });
  const frozen={...event,name:'Frozen event title'};
  const lot={id:ids.lot,number:'01',title:'=HYPERLINK("bad")',description:'Immutable',category:'Test',opening:100,image:null,provider:{id:ids.org,name:'Saturn',initials:'SA'}};
  await f.admin.query(`INSERT INTO bz_catalog_approvals(id,event_id,org_id,source_revision,approved_by,local_date,local_start,local_end,timezone,opens_at,closes_at,organization_snapshot,event_snapshot)
    VALUES($1,$2,$3,1,$4,'2026-10-08','08:00','09:00','America/Los_Angeles',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',$5,$6)`,
    [ids.release,ids.event,ids.org,ids.staff,{id:ids.org,name:'Saturn',initials:'SA'},frozen]);
  await f.admin.query('INSERT INTO bz_catalog_lots(approval_id,event_id,org_id,lot_id,position,snapshot) VALUES($1,$2,$3,$4,0,$5)',[ids.release,ids.event,ids.org,ids.lot,lot]);
  await test('closed-no-bids-is-read-only',async()=>{
    const result=await status(()=>ops.getStaffResults(read(tokens.staff),ids.event),200);
    assert.equal(result.event.name,'Frozen event title');assert.equal(result.phase,'closed');assert.equal(result.finalized,false);
    assert.equal(result.schedule.timezone,'America/Los_Angeles');assert.equal(result.lots[0].standing.currentAmountMinor,null);assert.equal(result.lots[0].recordedState,'no-bids');
    assert.equal((await f.admin.query('SELECT count(*)::integer AS n FROM bz_lot_standing')).rows[0].n,0);
  });
  await f.admin.query(`INSERT INTO bz_manual_bids(id,actor_id,business_id,request_id,event_id,org_id,release_id,lot_id,amount_minor,ruleset_id,currency,standing_version,decided_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,1000000000,$9,$10,1,clock_timestamp()-interval '90 minutes')`,[ids.bid,ids.member,ids.business,randomUUID(),ids.event,ids.org,ids.release,ids.lot,TRADE_RULESET,TRADE_DENOMINATION]);
  await f.admin.query(`INSERT INTO bz_lot_standing(release_id,lot_id,event_id,org_id,ruleset_id,currency,increment_minor,amount_cap_minor,current_amount_minor,leading_business_id,accepted_bid_id,accepted_bid_count,version)
    VALUES($1,$2,$3,$4,$5,$6,25000,1000000000,1000000000,$7,$8,1,1)`,[ids.release,ids.lot,ids.event,ids.org,TRADE_RULESET,TRADE_DENOMINATION,ids.business,ids.bid]);
  await test('exact-cap-and-recorded-standing-without-bid-authority',async()=>{
    const result=await status(()=>ops.getStaffResults(read(tokens.staff),ids.event),200);
    assert.equal(result.currency,TRADE_DENOMINATION);assert.equal(result.lots[0].standing.currentAmountMinor,1000000000);assert.equal(result.lots[0].recordedState,'recorded-standing');
    assert.equal(result.event.name,'Frozen event title');assert.equal(result.finalized,false);
    assert.equal((await f.admin.query('SELECT count(*)::integer AS n FROM bz_event_bidder_admissions WHERE person_id=$1',[ids.staff])).rows[0].n,0);
  });
  await test('private-formula-safe-snapshot-csv',async()=>{
    const csv=await ops.exportStaffResults(read(tokens.staff),ids.event),text=await csv.text();
    assert.match(text,/'=HYPERLINK/);assert.match(text,/'\+Leading/);assert.match(text,/1000000000/);assert.match(text,/Frozen event title/);
    assert.equal(csv.headers.get('cache-control'),'private, no-store');
    await status(()=>ops.exportStaffResults(read(tokens.member),ids.event),403);
    for(const cell of ['\t=bad',' @bad','\r+bad','-bad'])assert.ok(ops.csvCell(cell).startsWith('"\''));
  });
  await test('event-bidder-list-claims-and-no-secrets',async()=>{
    const result=await status(()=>ops.getStaffBidders(read(tokens.staff),ids.event),200);
    assert.equal(result.bidders.length,1);assert.equal(result.bidders[0].revision,0);assert.equal(result.bidders[0].businesses[0].canBid,true);
    assert.equal(result.bidders[0].claimedMemberId,null);assert.ok(!JSON.stringify(result).includes(sha(tokens.member)));
  });
  const intent={requestId:randomUUID(),personId:ids.member,expectedRevision:0,access:'VIEW',active:false};
  let original;
  await test('scoped-durable-disable',async()=>{
    original=await status(()=>ops.setStaffBidder(post(tokens.staff,intent),ids.event),200);assert.equal(original.operation.revision,1);
    const a=(await f.admin.query('SELECT access,active FROM bz_event_bidder_admissions WHERE person_id=$1 AND event_id=$2',[ids.member,ids.event])).rows[0];
    assert.deepEqual(a,{access:'VIEW',active:false});assert.equal((await f.admin.query('SELECT can_bid FROM bz_business_person_memberships WHERE person_id=$1',[ids.member])).rows[0].can_bid,true);
  });
  await test('exact-replay-recovery-and-private-receipt',async()=>{
    const again=await status(()=>ops.setStaffBidder(post(tokens.staff,intent),ids.event),200);assert.deepEqual(again.operation,original.operation);assert.equal(again.replayed,true);
    const recovered=await status(()=>ops.getStaffBidderReceipt(read(tokens.staff),ids.event,intent.requestId),200);assert.deepEqual(recovered.operation,original.operation);
    await status(()=>ops.getStaffBidderReceipt(read(tokens.coworker),ids.event,intent.requestId),404);
    await status(()=>ops.setStaffBidder(post(tokens.staff,{...intent,active:true}),ids.event),409);
    await status(()=>ops.setStaffBidder(post(tokens.foreignStaff,intent),ids.event),403);
  });
  await test('optimistic-access-revision-and-reenable',async()=>{
    const stale=await status(()=>ops.setStaffBidder(post(tokens.staff,{...intent,requestId:randomUUID(),active:true}),ids.event),409);assert.equal(stale.error.code,'BIDDER_REVISION_CONFLICT');
    const next=await status(()=>ops.setStaffBidder(post(tokens.staff,{...intent,requestId:randomUUID(),expectedRevision:1,active:true}),ids.event),200);assert.equal(next.operation.revision,2);
    assert.equal((await f.admin.query('SELECT active FROM bz_event_view_grants WHERE person_id=$1 AND event_id=$2',[ids.member,ids.event])).rows[0].active,true);
    assert.equal((await f.admin.query('SELECT access FROM bz_event_bidder_admissions WHERE person_id=$1',[ids.member])).rows[0].access,'VIEW');
    await status(()=>ops.setStaffBidder(post(tokens.staff,{...intent,requestId:randomUUID(),personId:ids.foreignStaff,expectedRevision:0}),ids.event),404);
  });
  await test('expiry-after-event-wait-no-write',async()=>{
    const blocker=await f.client();await blocker.query('BEGIN');await blocker.query('SELECT id FROM bz_events WHERE id=$1 FOR UPDATE',[ids.event]);
    await f.admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '180 milliseconds' WHERE token_hash=$1",[sha(tokens.staff)]);
    const pending=status(()=>ops.setStaffBidder(post(tokens.staff,{...intent,requestId:randomUUID(),expectedRevision:2}),ids.event),401);
    await waitOn(f.admin,'bz_staff_bidder_set');await sleep(220);await blocker.query('COMMIT');await pending;
    assert.equal((await f.admin.query('SELECT revision FROM bz_staff_bidder_controls WHERE event_id=$1 AND person_id=$2',[ids.event,ids.member])).rows[0].revision,2);
    await f.admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE token_hash=$1",[sha(tokens.staff)]);
  });
  await test('late-function-denial-rolls-back-under-direct-caller',async()=>{
    const blocker=await f.client(),runtime=await f.client(true);await blocker.query('BEGIN');await blocker.query('SELECT person_id FROM bz_event_view_grants WHERE event_id=$1 AND person_id=$2 FOR UPDATE',[ids.event,ids.member]);
    await f.admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '180 milliseconds' WHERE token_hash=$1",[sha(tokens.staff)]);
    await runtime.query('BEGIN');await runtime.query('SAVEPOINT intent');
    const pending=runtime.query('SELECT bz_staff_bidder_set($1,$2,$3,$4,2,\'BID\',false)',[sha(tokens.staff),ids.event,randomUUID(),ids.member]).catch(error=>error);
    await waitOn(f.admin,'bz_staff_bidder_set');await sleep(220);await blocker.query('COMMIT');const error=await pending;assert.equal(error.code,'PBO02');
    await runtime.query('ROLLBACK TO SAVEPOINT intent');await runtime.query('COMMIT');
    assert.equal((await f.admin.query('SELECT revision FROM bz_staff_bidder_controls WHERE event_id=$1 AND person_id=$2',[ids.event,ids.member])).rows[0].revision,2);
    assert.equal((await f.admin.query('SELECT active FROM bz_event_view_grants WHERE event_id=$1 AND person_id=$2',[ids.event,ids.member])).rows[0].active,true);
    await f.admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE token_hash=$1",[sha(tokens.staff)]);
  });
  await test('minimal-runtime-and-committed-staff-revocation',async()=>{
    const acl=(await f.admin.query("SELECT has_table_privilege('fixture_runtime','bz_staff_bidder_controls','UPDATE') AS can_update,has_table_privilege('fixture_runtime','bz_event_view_grants','UPDATE') AS can_mutate_view,has_table_privilege('fixture_runtime','bz_demo_entry_slots','SELECT') AS can_read_slots")).rows[0];assert.deepEqual(acl,{can_update:false,can_mutate_view:false,can_read_slots:false});
    await f.admin.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.org]);
    await status(()=>ops.getStaffResults(read(tokens.staff),ids.event),403);
    await status(()=>ops.setStaffBidder(post(tokens.staff,{...intent,requestId:randomUUID(),expectedRevision:2}),ids.event),403);
  });
}catch(error){console.error(error);f.report.failure=error.message;process.exitCode=1;}
finally{assert.deepEqual(Object.fromEntries(files.map(file=>[file,sourceHash(file)])),before);f.report.source={...f.report.source,...before};await f.close();}
