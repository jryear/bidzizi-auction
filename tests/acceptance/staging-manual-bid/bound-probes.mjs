import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RULESET,OPENING,INCREMENT,AMOUNT_CAP,privilegeTables,paths,intent,noStore,noSecrets,sealedError,denied,rejected,
  login,post,rows,standing,assertDurable,assertStandingSQL,immutableReceipt,assertTerminalStored} from './protocol.mjs';
import {withBrowser,expect,openLot,review,confirm,unconfirmed,httpPacket,deferred,bounded} from './browser.mjs';
import {ApplicationFailure,HarnessError} from './harness.mjs';
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const caseOf=(id,name,mode,run,scenario={phase:'open'})=>({id,name,mode,scenario,run});
function alternateEvent(f,event,release,lot){return {...f,fixtures:{...f.fixtures,event,release,lotA:lot}};}
async function noPrivateWrites(f,before){assert.deepEqual(await rows(f,privilegeTables),before);}
async function browserCookie(ui){
  const cookie=(await ui.context.cookies()).find(c=>c.name==='bz_session');
  assert.ok(cookie,'Browser must hold its real test session.');
  return `bz_session=${cookie.value}`;
}

export const boundCases=[
 caseOf('BID-A07/A08','A review, pending confirmation and independent two-browser outbid','acceptance',async f=>{
  await withBrowser(f,async({signed})=>{
   const a=await signed(),b=await signed('bidder-harbor');
   await openLot(a,f);await openLot(b,f);
   assert.equal(await a.frame.locator('[data-action="max-open"]:not([disabled])').count(),0,'Operational003 cannot offer a simulated maximum as real bidding.');
   const requestSeen=deferred(),release=deferred();let submitted;
   await a.page.route('**'+paths(f).bid,async route=>{
    assert.equal(route.request().method(),'POST');submitted=route.request().postDataJSON();requestSeen.resolve();
    await release.promise;await route.continue();
   });
   try{
    const dialog=await review(a,OPENING);
    const acceptedHTTP=a.page.waitForResponse(r=>r.url().endsWith(paths(f).bid)&&r.request().method()==='POST');
    assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_manual_bids')).rows[0].n,0,'Review is not a bid.');
    await confirm(dialog);await bounded(requestSeen.promise,'Pending reviewed bid');
    assert.deepEqual(Object.keys(submitted).sort(),['amountMinor','businessId','requestId','rulesetId']);
    assert.equal(submitted.amountMinor,OPENING);assert.equal(submitted.businessId,f.fixtures.businessJuniper);
    await expect(dialog).toContainText(/Sending|not placed yet|not confirmed/i);
    await expect(dialog).toHaveAttribute('data-bid-state','pending');
    assert.equal(await dialog.locator('.result.t-green').count(),0);
    assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_manual_bids')).rows[0].n,0,'Held request cannot produce durable acceptance.');
    release.resolve();const accepted=await httpPacket(await bounded(acceptedHTTP,'Durable first browser response'));
    await expect(dialog).toContainText(/Bid placed|You're leading/i);
    await expect(dialog).toHaveAttribute('data-bid-state','accepted');
    await expect(dialog.locator('[data-owned-request="'+submitted.requestId+'"]')).toBeVisible();
    const j={person:{id:f.fixtures.personJuniper},cookie:await browserCookie(a)};
    await assertDurable(f,j,submitted,accepted);
    await dialog.getByRole('button',{name:'Keep browsing',exact:true}).click();
    const hDialog=await review(b,12751,'Harbor Company','Test Harbor Bidder');await confirm(hDialog);
    await expect(hDialog).toContainText(/Bid placed|You're leading/i);
    await a.page.reload({waitUntil:'domcontentloaded'});
    await openLot(a,f);await expect(a.frame.locator('.standing')).toContainText(/outbid/i);
    await expect(a.frame.locator('main')).toContainText('Harbor Company');
    const current=await standing(f,j);await assertStandingSQL(f,current,12751,f.fixtures.businessHarbor,2,2);
    // A real terminal409 must not become a green success merely because transport resolved.
    await openLot(a,f,f.fixtures.lotB);const staleDialog=await review(a,OPENING);
    const harbor=await login(f,'bidder-harbor'),rival=intent(f,f.fixtures.businessHarbor,OPENING);
    await assertDurable(f,harbor,rival,await post(f,harbor,rival,f.fixtures.lotB),f.fixtures.lotB);
    const staleHTTP=a.page.waitForResponse(r=>r.url().endsWith(paths(f,f.fixtures.lotB).bid)&&r.request().method()==='POST');
    await confirm(staleDialog);const rejectedHTTP=await httpPacket(await bounded(staleHTTP,'Terminal stale browser response'));
    assert.equal(rejectedHTTP.status,409);assert.equal(rejectedHTTP.data.receipt.status,'rejected');assert.equal(rejectedHTTP.data.receipt.reason,'BELOW_MINIMUM');
    await expect(staleDialog).toHaveAttribute('data-bid-state','rejected');
    await expect(staleDialog).toContainText(/not placed|got there first|minimum/i);
    assert.equal(await staleDialog.locator('.result.t-green').count(),0);
    assert.equal(await staleDialog.locator('[data-owned-request="'+rejectedHTTP.data.receipt.requestId+'"]').count(),0);
    await assertStandingSQL(f,await standing(f,j,f.fixtures.lotB),OPENING,f.fixtures.businessHarbor,1,1,f.fixtures.lotB);
    assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
   }finally{release.resolve();}
  });
 }),
 caseOf('BID-A09','lost acknowledgement recovers original UUID and one durable bid','acceptance',async f=>{
  await withBrowser(f,async({signed})=>{
   const ui=await signed();await openLot(ui,f);
   let original,committed,acceptedHTTP,lookedUp;const dropped=deferred();
   await ui.page.route('**'+paths(f).bid,async route=>{
    original=route.request().postDataJSON();
    const response=await route.fetch();acceptedHTTP=await httpPacket(response);assert.equal(acceptedHTTP.status,201);committed=acceptedHTTP.data.receipt;
    await route.abort('failed');dropped.resolve();
   });
   const dialog=await review(ui,OPENING);await confirm(dialog);await bounded(dropped.promise,'Committed lost acknowledgement');
   await unconfirmed(dialog);
   const actor={person:{id:f.fixtures.personJuniper},cookie:await browserCookie(ui)};
   await assertDurable(f,actor,original,acceptedHTTP);
   const before=await rows(f);
   await ui.page.route('**/bid-receipts/*',async route=>{lookedUp=route.request().url().split('/').at(-1);await route.continue();});
   await dialog.getByRole('button',{name:'Check status',exact:true}).click();
   await expect(dialog).toContainText(/Bid placed|You're leading/i);
   assert.equal(lookedUp,original.requestId,'Recovery must use the original operation UUID.');
   assert.deepEqual(await rows(f),before,'Receipt recovery cannot repeat a bid or standing mutation.');
   await immutableReceipt(f,actor,original,committed);
  });
 }),
 caseOf('BID-X04-rest','network admission business person and session revocation','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),body=intent(f);
  const receipt=await assertDurable(f,actor,body,await post(f,actor,body));
  const token=actor.cookie.slice('bz_session='.length),hash=createHash('sha256').update(token).digest('hex');
  const revocations=[
   ['business','UPDATE bz_businesses SET active=$1 WHERE id=$2',[f.fixtures.businessJuniper]],
   ['membership permission','UPDATE bz_business_person_memberships SET can_bid=$1 WHERE person_id=$2 AND business_id=$3',[actor.person.id,f.fixtures.businessJuniper]],
   ['network','UPDATE bz_org_business_memberships SET active=$1 WHERE org_id=$2 AND business_id=$3',[f.fixtures.saturn,f.fixtures.businessJuniper]],
   ['admission','UPDATE bz_event_bidder_admissions SET active=$1 WHERE person_id=$2 AND event_id=$3',[actor.person.id,f.fixtures.event]],
   ['catalog VIEW with BID still active','UPDATE bz_event_view_grants SET active=$1 WHERE person_id=$2 AND event_id=$3',[actor.person.id,f.fixtures.event]],
   ['person','UPDATE bz_people SET active=$1 WHERE id=$2',[actor.person.id]],
  ];
  for(const [label,query,params] of revocations){
   await f.db.query(query,[false,...params]);const before=await rows(f,privilegeTables);
   if(label==='catalog VIEW with BID still active'){
    const bidGrant=(await f.db.query('SELECT active,access FROM bz_event_bidder_admissions WHERE person_id=$1 AND event_id=$2',[actor.person.id,f.fixtures.event])).rows[0];
    assert.deepEqual({active:bidGrant.active,access:bidGrant.access},{active:true,access:'BID'});
   }
   denied(await post(f,actor,body));denied(await post(f,actor,intent(f,f.fixtures.businessJuniper,12500)));
   denied(await f.request(paths(f).standing,{cookie:actor.cookie}));
   denied(await f.request(paths(f).receipt(body.requestId),{cookie:actor.cookie}));
   await noPrivateWrites(f,before);
   assert.deepEqual((await f.db.query('SELECT receipt FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2',[actor.person.id,body.requestId])).rows[0].receipt,receipt,label+' cannot rewrite history.');
   await f.db.query(query,[true,...params]);
  }
  const downgrade='UPDATE bz_event_bidder_admissions SET access=$1 WHERE person_id=$2 AND event_id=$3';
   await f.db.query(downgrade,['VIEW',actor.person.id,f.fixtures.event]);const downgradeBefore=await rows(f,privilegeTables);
   denied(await post(f,actor,body));denied(await f.request(paths(f).receipt(body.requestId),{cookie:actor.cookie}));
   await noPrivateWrites(f,downgradeBefore);
  await f.db.query(downgrade,['BID',actor.person.id,f.fixtures.event]);
  for(const mutation of ["UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1",
    "UPDATE bz_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1"]){
   await f.db.query(mutation,[hash]);const before=await rows(f);
   denied(await post(f,actor,body));denied(await f.request(paths(f).standing,{cookie:actor.cookie}));
   denied(await f.request(paths(f).receipt(body.requestId),{cookie:actor.cookie}));assert.deepEqual(await rows(f),before);
   await f.db.query("UPDATE bz_sessions SET revoked_at=NULL,expires_at=clock_timestamp()+interval '1 hour' WHERE token_hash=$1",[hash]);
  }
  await immutableReceipt(f,actor,body,receipt);
 }),
 caseOf('BID-X07-rest','changed authorized event lot business and ruleset under one key','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),body=intent(f);
  const receipt=await assertDurable(f,actor,body,await post(f,actor,body));
  await f.db.query("INSERT INTO bz_businesses(id,name,active) VALUES($1,'Alternate Test Business',true)",[f.fixtures.businessAlternate]);
  await f.db.query('INSERT INTO bz_business_person_memberships(person_id,business_id,can_bid,active) VALUES($1,$2,true,true)',[actor.person.id,f.fixtures.businessAlternate]);
  await f.db.query('INSERT INTO bz_org_business_memberships(org_id,business_id,active) VALUES($1,$2,true)',[f.fixtures.saturn,f.fixtures.businessAlternate]);
  const other=alternateEvent(f,f.fixtures.eventOther,f.fixtures.releaseOther,f.fixtures.lotOther),before=await rows(f,privilegeTables);
  for(const [target,payload,lot] of [[f,{...body,businessId:f.fixtures.businessAlternate},f.fixtures.lotA],
    [f,body,f.fixtures.lotB],[other,body,other.fixtures.lotA]]){
   const r=await post(target,actor,payload,lot);assert.equal(r.status,409);assert.equal(r.data.error.code,'IDEMPOTENCY_CONFLICT');
   sealedError(r);assert.equal(r.data.receipt,undefined);await noPrivateWrites(f,before);
  }
  const invalid=await post(f,actor,{...body,rulesetId:'staging-usd-manual-v2'});
  assert.equal(invalid.status,400);assert.equal(invalid.data.error.code,'VALIDATION');sealedError(invalid);await noPrivateWrites(f,before);
  for(const target of [f,other]){
   const lot=target===f?f.fixtures.lotB:other.fixtures.lotA;
   denied(await f.request(paths(target,lot).receipt(body.requestId),{cookie:actor.cookie}),[403,404]);
   await noPrivateWrites(f,before);
  }
  await immutableReceipt(f,actor,body,receipt);
 }),
 caseOf('BID-X08-unselected','unselected draft and cross-event lot cannot become public or bid','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),before=await rows(f,privilegeTables);
  const role=(await f.runtimeDB.query('SELECT current_user AS name,rolsuper,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.equal(role.name,f.runtimeRole);assert.equal(role.rolsuper,false);assert.equal(role.rolcreaterole,false);assert.equal(role.rolcreatedb,false);assert.equal(role.rolinherit,false);
  for(const sql of ["UPDATE bz_businesses SET active=false","UPDATE bz_business_person_memberships SET can_bid=false",
    "UPDATE bz_org_business_memberships SET active=false","UPDATE bz_event_bidder_admissions SET access='BID'",
    "UPDATE bz_event_view_grants SET active=true","UPDATE bz_bid_receipts SET http_status=201",
    "DELETE FROM bz_manual_bids","UPDATE bz_catalog_lots SET snapshot='{}'::jsonb"]){
    await assert.rejects(f.runtimeDB.query(sql),e=>e.code==='42501','Runtime must not mutate authority or immutable auction history.');
  }
  await noPrivateWrites(f,before);
  for(const lot of [f.fixtures.lotC,f.fixtures.lotOther,f.fixtures.lotPine]){
   denied(await post(f,actor,intent(f),lot),[403,404]);
   const r=await f.request(`/api/catalog/events/${f.fixtures.event}/lots/${lot}`,{cookie:actor.cookie});
   assert.equal(r.status,404);sealedError(r);assert.ok(!r.text.includes(f.privateLot.title));
  }
  const catalog=await f.request(`/api/catalog/events/${f.fixtures.event}`,{cookie:actor.cookie});
  assert.equal(catalog.status,200);assert.deepEqual(catalog.data.catalog.lots,f.approvedLots);
  assert.ok(!catalog.text.includes(f.privateLot.id)&&!catalog.text.includes(f.privateLot.title));
  await noPrivateWrites(f,before);
 }),
 caseOf('BID-X09','actual lot-lock wait crosses immutable DB close boundary','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),body=intent(f);
  const earlier=intent(f),acceptedEarlier=await assertDurable(f,actor,earlier,await post(f,actor,earlier,f.fixtures.lotB),f.fixtures.lotB);
  assert.ok(Date.parse(acceptedEarlier.decidedAt)<f.closesAt.getTime());
  const holder=await f.privilegedConnection(),before=(await rows(f)).bz_manual_bids;let pending;
  try{
   const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   await holder.query('BEGIN');
   await holder.query('SELECT 1 FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2 FOR UPDATE',[f.fixtures.release,f.fixtures.lotA]);
   const started=await f.dbNow();
   if(started>=f.closesAt)throw new HarnessError('Independent close-window setup expired before POST delivery.');
   pending=post(f,actor,body);let waitRecord;
   const barrierDeadline=Date.now()+1800;
   while(Date.now()<barrierDeadline){
    const r=await f.db.query(`SELECT pid,xact_start,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE usename=$1 AND wait_event_type='Lock' AND $2=ANY(pg_blocking_pids(pid))`,[f.runtimeRole,pid]);
    if(r.rows.length){waitRecord=r.rows[0];break;}await sleep(15);
   }
   if(!waitRecord)throw new ApplicationFailure('Delivered open bid never reached the independently observed held lot lock.');
   assert.ok(waitRecord.xact_start<f.closesAt,'Real bid transaction must begin while the lot is still open.');
   while((await f.dbNow())<f.closesAt)await sleep(15);
   const released=await f.dbNow();assert.ok(released-started<4800,'Evidence hold must remain below existing five-second statement timeout.');
   await holder.query('COMMIT');
   const r=await pending,receipt=rejected(r,'CLOSED',body);await assertTerminalStored(f,actor,body,receipt);
   assert.ok(Date.parse(receipt.decidedAt)>=f.closesAt.getTime(),'Decision time must be current DB time obtained AFTER lock acquisition; now() remains transaction-start time.');
   assert.ok(Date.parse(receipt.decidedAt)<=(await f.dbNow()).getTime());
   assert.deepEqual((await rows(f)).bz_manual_bids,before);assert.equal((await standing(f,actor)).acceptedBidCount,0);
   const afterClose=await rows(f),replayed=await post(f,actor,earlier,f.fixtures.lotB);
   assert.equal(replayed.status,201);assert.deepEqual(replayed.data.receipt,acceptedEarlier);
   await immutableReceipt(f,actor,earlier,acceptedEarlier,f.fixtures.lotB);
   assert.deepEqual(await rows(f),afterClose,'A close cannot replace an already durable accepted retry outcome.');
  }finally{await holder.query('ROLLBACK').catch(()=>{});await holder.end();if(pending)await pending.catch(()=>{});}
  // Clock expiry cannot be held active by an authorization row-share lock.
  const openTarget=alternateEvent(f,f.fixtures.eventOther,f.fixtures.releaseOther,f.fixtures.lotOther);
  for(const transport of ['bid','standing','receipt']){
   const fresh=await login(f,'bidder-juniper'),hash=createHash('sha256').update(fresh.cookie.slice('bz_session='.length)).digest('hex');
   const lock=await f.privilegedConnection();let operation;
   try{
    const pid=(await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await lock.query('BEGIN');
    if(transport==='bid')await lock.query('SELECT 1 FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2 FOR UPDATE',[openTarget.fixtures.release,openTarget.fixtures.lotA]);
    else await lock.query('SELECT 1 FROM bz_business_person_memberships WHERE person_id=$1 AND business_id=$2 FOR UPDATE',[fresh.person.id,f.fixtures.businessJuniper]);
    const expiry=(await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1500 milliseconds' WHERE token_hash=$1 RETURNING expires_at",[hash])).rows[0].expires_at;
    const beforeExpiry=await rows(f,privilegeTables),started=await f.dbNow(),expiryBody=intent(openTarget);
    operation=transport==='bid'?post(openTarget,fresh,expiryBody):transport==='standing'?
      f.request(paths(openTarget).standing,{cookie:fresh.cookie}):f.request(paths(f,f.fixtures.lotB).receipt(earlier.requestId),{cookie:fresh.cookie});
    const deadline=Date.now()+1200;let observed;
    while(Date.now()<deadline){
     const rows=(await f.db.query("SELECT xact_start FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND $2=ANY(pg_blocking_pids(pid))",[f.runtimeRole,pid])).rows;
     if(rows.length){observed=rows[0];break;}await sleep(15);
    }
    if(!observed)throw new ApplicationFailure('Valid '+transport+' did not reach the independent pre-expiry authority/standing lock barrier.');
    assert.ok(observed.xact_start<expiry,'Identity must be valid at actual transaction entry.');
    while((await f.dbNow())<expiry)await sleep(15);
    assert.ok((await f.dbNow())-started<4800);await lock.query('COMMIT');
    denied(await operation,[401]);await noPrivateWrites(f,beforeExpiry);
    denied(await post(openTarget,fresh,expiryBody),[401]);
    denied(await f.request(paths(openTarget).standing,{cookie:fresh.cookie}),[401]);
    denied(await f.request(paths(f,f.fixtures.lotB).receipt(earlier.requestId),{cookie:fresh.cookie}),[401]);
   }finally{await lock.query('ROLLBACK').catch(()=>{});await lock.end();if(operation)await operation.catch(()=>{});}
  }
 },{phase:'open',queuedClose:true}),
 caseOf('BID-X10','browser clock and forged timestamps do not authorize open or closed bids','adversarial',async f=>{
  await f.restart({skew:true});
  const actor=await login(f,'bidder-juniper');
  const payload={...intent(f),clientNow:'2200-01-01T00:00:00Z'};
  const invalid=await post(f,actor,payload);assert.equal(invalid.status,400);assert.equal(invalid.data.error.code,'VALIDATION');sealedError(invalid);
  const before=await f.dbNow(),body=intent(f),r=await post(f,actor,body,f.fixtures.lotA,
    {'x-server-now':'1900-01-01','x-test-now':'2200-01-01','x-bidzizi-clock':'2200-01-01'});
  const receipt=await assertDurable(f,actor,body,r),after=await f.dbNow();
  assert.ok(Date.parse(receipt.decidedAt)>=before.getTime()&&Date.parse(receipt.decidedAt)<=after.getTime());
  await withBrowser(f,async({signed})=>{
   for(const skewMs of [-86400000,86400000]){
    const ui=await signed('bidder-harbor',{skewMs});await openLot(ui,f,f.fixtures.lotB);
    const current=await standing(f,await login(f,'bidder-harbor'),f.fixtures.lotB);
    assert.equal(current.phase,'open');await expect(ui.frame.locator('main')).not.toContainText('Bidding closed');
    const dialog=await review(ui,OPENING,'Harbor Company','Test Harbor Bidder');
    await expect(dialog.locator('[data-action="place"]')).toBeEnabled();
    await dialog.getByRole('button',{name:'Not now',exact:true}).click();
   }
  });
  for(const phase of ['before','closed']){
   const entry=f.phaseFixtures[phase],target={...f,fixtures:{...f.fixtures,event:entry.event,release:entry.release,lotA:entry.lotA},approvedEvent:entry.approvedEvent,approvedLots:entry.approvedLots};
   for(const clock of ['1900-01-01T00:00:00Z','2200-01-01T00:00:00Z']){
    const body=intent(target),response=await post(target,actor,body,target.fixtures.lotA,{'x-test-now':clock,'x-server-now':clock});
    const receipt=rejected(response,phase==='before'?'NOT_OPEN':'CLOSED',body);await assertTerminalStored(target,actor,body,receipt);
   }
   await withBrowser(target,async({signed})=>{
    for(const skewMs of [-86400000,86400000]){
     const ui=await signed('bidder-juniper',{skewMs});
     if(phase==='before'){
      assert.equal(await ui.frame.locator('a[href*="#/lot/"]').count(),0);
      assert.ok(!(await ui.frame.locator('body').innerText()).includes(entry.approvedLots[0].title));
     }else{
      await openLot(ui,target);assert.equal(await ui.frame.locator('[data-action="bid"]:not([disabled])').count(),0);
     }
    }
   });
  }
 }),
 caseOf('BID-X12','aborted request preserves intent without fabricated acceptance','adversarial',async f=>{
  await withBrowser(f,async({signed})=>{
   const ui=await signed();await openLot(ui,f);const before=await rows(f);let original;
   await ui.page.route('**'+paths(f).bid,async route=>{original=route.request().postDataJSON();await route.abort('failed');});
   const dialog=await review(ui,OPENING);await confirm(dialog);await unconfirmed(dialog);
   assert.deepEqual(await rows(f),before,'Request aborted before server delivery cannot mutate storage.');
   await ui.page.unroute('**'+paths(f).bid);
   let retry;
   await ui.page.route('**'+paths(f).bid,async route=>{retry=route.request().postDataJSON();await route.continue();});
   await dialog.getByRole('button',{name:'Check status',exact:true}).click();
   await expect(dialog).toContainText(/not recorded|wasn't placed|not placed/i);
   await dialog.getByRole('button',{name:'Try again',exact:true}).click();
   await expect(dialog).toContainText(/Bid placed|You're leading/i);assert.deepEqual(retry,original);
   const actor={person:{id:f.fixtures.personJuniper},cookie:await browserCookie(ui)};
   await assertDurable(f,actor,original,await post(f,actor,original));
   // A received503, not just an aborted socket, must remain unconfirmed after rollback.
   await dialog.getByRole('button',{name:'Keep browsing',exact:true}).click();await openLot(ui,f,f.fixtures.lotB);
   await f.db.query(`CREATE FUNCTION independent_browser503() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INDEPENDENT_BROWSER_503'; END $$;
    CREATE TRIGGER independent_browser503_reject BEFORE INSERT ON bz_bid_receipts FOR EACH ROW EXECUTE FUNCTION independent_browser503();`);
   try{
    const before503=await rows(f),failure=ui.page.waitForResponse(r=>r.url().endsWith(paths(f,f.fixtures.lotB).bid)&&r.request().method()==='POST');
    const second=await review(ui,OPENING);await confirm(second);
    const received=await httpPacket(await bounded(failure,'Actual503 browser response'));
    assert.equal(received.status,503);sealedError(received);assert.equal(received.data.error.code,'UNAVAILABLE');
    await unconfirmed(second);assert.deepEqual(await rows(f),before503);
   }finally{await f.db.query('DROP TRIGGER independent_browser503_reject ON bz_bid_receipts; DROP FUNCTION independent_browser503();');}
  });
 }),
 caseOf('BID-X13','previously authorized context and receipt cannot repopulate another actor','adversarial',async f=>{
  await withBrowser(f,async({signed})=>{
   const ui=await signed();await openLot(ui,f);let body;
   await ui.page.route('**'+paths(f).bid,async route=>{body=route.request().postDataJSON();const r=await route.fetch();assert.equal(r.status(),201);await route.abort('failed');});
   const dialog=await review(ui,OPENING);await confirm(dialog);await unconfirmed(dialog);
   const arrived=deferred(),release=deferred(),delivered=deferred();let captured=false;
   await ui.page.route('**/bid-receipts/*',async route=>{
    if(captured)return route.continue();captured=true;
    const response=await route.fetch();assert.equal(response.status(),200);
    assert.equal((await response.json()).receipt.actorId,f.fixtures.personJuniper);
    arrived.resolve();await release.promise;await route.fulfill({response});delivered.resolve();
   });
   try{
    await dialog.getByRole('button',{name:'Check status',exact:true}).click();await bounded(arrived.promise,'Authorized Juniper receipt capture');
    await ui.page.getByRole('button',{name:'Sign out',exact:true}).click();
    await ui.page.getByRole('combobox',{name:'Test account',exact:true}).selectOption('bidder-harbor');
    await ui.page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(ui.page.locator('[data-bidder-person]')).toHaveAttribute('data-bidder-person',f.fixtures.personHarbor);
    const before=await rows(f);release.resolve();await bounded(delivered.promise,'Old authorized receipt delivery');
    await ui.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    await openLot(ui,f);
    await expect(ui.frame.locator('main')).toContainText('Harbor Company');
    assert.equal(await ui.frame.locator('[data-owned-request="'+body.requestId+'"]').count(),0,'Harbor cannot inherit Juniper-owned success.');
    assert.ok(!(await ui.frame.locator('body').innerText()).includes('Test Juniper Bidder'));
    assert.deepEqual(await rows(f),before);
   }finally{release.resolve();}
   await ui.page.unroute('**/bid-receipts/*');
   await ui.page.unroute('**'+paths(f).bid);
   const contextArrived=deferred(),contextRelease=deferred(),contextDelivered=deferred();let contextCaptured=false;
   await ui.page.route('**/api/bidder/events/*/context',async route=>{
    if(contextCaptured)return route.continue();contextCaptured=true;
    const response=await route.fetch();assert.equal(response.status(),200);
    assert.equal((await response.json()).person.id,f.fixtures.personHarbor);
    contextArrived.resolve();await contextRelease.promise;await route.fulfill({response});contextDelivered.resolve();
   });
   try{
    await ui.page.getByRole('button',{name:'Refresh event',exact:true}).click();await bounded(contextArrived.promise,'Authorized Harbor context capture');
    await ui.page.getByRole('button',{name:'Sign out',exact:true}).click();
    await ui.page.getByRole('combobox',{name:'Test account',exact:true}).selectOption('bidder-juniper');
    await ui.page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(ui.page.locator('[data-bidder-person]')).toHaveAttribute('data-bidder-person',f.fixtures.personJuniper);
    contextRelease.resolve();await bounded(contextDelivered.promise,'Old authorized context delivery');
    await ui.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    await expect(ui.page.locator('[data-bidder-person]')).toHaveAttribute('data-bidder-person',f.fixtures.personJuniper);
   }finally{contextRelease.resolve();}
  });
 }),
 caseOf('BID-X14','offline snapshot is timestamped stale and reload recovers DB truth','adversarial',async f=>{
  const h=await login(f,'bidder-harbor');
  await withBrowser(f,async({signed})=>{
   const ui=await signed();await openLot(ui,f);let first;
   await ui.page.route('**'+paths(f).bid,async route=>{
    assert.equal(route.request().method(),'POST');first=route.request().postDataJSON();await route.continue();
   });
   const acceptedHTTP=ui.page.waitForResponse(r=>r.url().endsWith(paths(f).bid)&&r.request().method()==='POST');
   const dialog=await review(ui,OPENING);await confirm(dialog);
   const accepted=await httpPacket(await bounded(acceptedHTTP,'Offline-case actual A bid response'));
   await expect(dialog).toHaveAttribute('data-bid-state','accepted');
   await expect(dialog.locator('[data-owned-request="'+first.requestId+'"]')).toBeVisible();
   const j={person:{id:f.fixtures.personJuniper},cookie:await browserCookie(ui)};
   const ownReceipt=await assertDurable(f,j,first,accepted);
   await ui.page.unroute('**'+paths(f).bid);
   await dialog.getByRole('button',{name:'Keep browsing',exact:true}).click();
   await ui.frame.locator('a[href="#/lots"]').first().click();
   const beforeRead=await f.dbNow();await openLot(ui,f);
   await expect(ui.frame.locator('.standing')).toContainText(/leading/i);
   const stamp=await ui.frame.locator('[data-standing-as-of]').getAttribute('data-standing-as-of');
   assert.ok(Number.isFinite(Date.parse(stamp))&&Date.parse(stamp)>=beforeRead.getTime()-1&&Date.parse(stamp)<=(await f.dbNow()).getTime(),
    'Visible as-of must lie in the independent DB-time bracket for the actual lot read.');
   const captured=await rows(f);
   await ui.context.setOffline(true);
   await expect(ui.frame.getByRole('status').filter({hasText:/as of|out of date|stale|offline|No connection/i}).first()).toBeVisible();
   const asOf=ui.frame.locator('[data-standing-as-of]');await expect(asOf).toHaveAttribute('data-standing-as-of',stamp);
   const competing=intent(f,f.fixtures.businessHarbor,12751);
   await assertDurable(f,h,competing,await post(f,h,competing));
   // The browser remains on the confirmed snapshot; its visible timestamp cannot advance.
   await expect(asOf).toHaveAttribute('data-standing-as-of',stamp);
   await expect(ui.frame.locator('[data-action="bid"]').first()).toBeDisabled();
   assert.equal(captured.bz_manual_bids.length,1);
   const afterCompeting=await rows(f);
   const recoveredHTTP=ui.page.waitForResponse(r=>r.url().endsWith(paths(f).receipt(first.requestId))&&r.request().method()==='GET');
   await ui.context.setOffline(false);await ui.page.reload({waitUntil:'domcontentloaded'});await openLot(ui,f);
   const recovered=await httpPacket(await bounded(recoveredHTTP,'Reload must recover the browser-owned durable operation'));
   assert.equal(recovered.status,200);noStore(recovered);noSecrets(recovered);
   assert.deepEqual(Object.keys(recovered.data),['receipt']);assert.deepEqual(recovered.data.receipt,ownReceipt);
   await expect(ui.frame.locator('.standing')).toContainText(/outbid/i);
   await assertStandingSQL(f,await standing(f,j),12751,f.fixtures.businessHarbor,2,2);
   await immutableReceipt(f,j,first,ownReceipt);
   assert.deepEqual(await rows(f),afterCompeting,'Reload/receipt lookup cannot bid again or mutate durable standing.');
   assert.deepEqual(ui.errors,[]);
  });
 }),
 caseOf('BID-X15-rest','Origin JSON size malformed UUID and cap validation','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),before=await rows(f,privilegeTables);
  const mutations=[
   {json:intent(f),headers:{}},
   {json:intent(f),headers:{origin:'https://hostile.example'}},
   {json:intent(f),headers:{origin:f.origin,'content-type':'text/plain'}},
   {json:{...intent(f),requestId:'not-a-uuid'},headers:{origin:f.origin}},
   {json:{...intent(f),businessId:'not-a-uuid'},headers:{origin:f.origin}},
   {json:intent(f,f.fixtures.businessJuniper,AMOUNT_CAP+1),headers:{origin:f.origin}},
   {raw:'{',headers:{origin:f.origin,'content-type':'application/json'}},
   {raw:JSON.stringify({...intent(f),padding:'x'.repeat(70*1024)}),headers:{origin:f.origin,'content-type':'application/json'}},
  ];
  for(const options of mutations){
   const r=await f.request(paths(f).bid,{method:'POST',cookie:actor.cookie,...options});
   assert.ok([400,403].includes(r.status));sealedError(r);assert.equal(r.data?.receipt,undefined);await noPrivateWrites(f,before);
  }
  const maximum=intent(f,f.fixtures.businessJuniper,AMOUNT_CAP);await assertDurable(f,actor,maximum,await post(f,actor,maximum));
  const s=await standing(f,actor);assert.equal(s.minimumAmountMinor,null);assert.equal(s.canBid,false);
  await assertStandingSQL(f,s,AMOUNT_CAP,f.fixtures.businessJuniper,1,1);
  const harbor=await login(f,'bidder-harbor'),capped=intent(f,f.fixtures.businessHarbor,AMOUNT_CAP);
  const rejectedAtCap=rejected(await post(f,harbor,capped),'AMOUNT_LIMIT',capped);await assertTerminalStored(f,harbor,capped,rejectedAtCap);
  assert.equal((await standing(f,harbor)).acceptedBidCount,1);
  const edge=intent(f,f.fixtures.businessJuniper,AMOUNT_CAP-INCREMENT);
  await assertDurable(f,actor,edge,await post(f,actor,edge,f.fixtures.lotB),f.fixtures.lotB);
  const stillAvailable=await standing(f,harbor,f.fixtures.lotB);assert.equal(stillAvailable.minimumAmountMinor,AMOUNT_CAP);assert.equal(stillAvailable.canBid,true);
  const atExactCap=intent(f,f.fixtures.businessHarbor,AMOUNT_CAP);await assertDurable(f,harbor,atExactCap,await post(f,harbor,atExactCap,f.fixtures.lotB),f.fixtures.lotB);
  assert.equal((await standing(f,actor,f.fixtures.lotB)).minimumAmountMinor,null);
  const other=alternateEvent(f,f.fixtures.eventOther,f.fixtures.releaseOther,f.fixtures.lotOther),onePast=intent(other,f.fixtures.businessJuniper,AMOUNT_CAP-INCREMENT+1);
  await assertDurable(other,actor,onePast,await post(other,actor,onePast));
  assert.equal((await standing(other,harbor)).minimumAmountMinor,null);assert.equal((await standing(other,harbor)).canBid,false);
  const impossible=intent(other,f.fixtures.businessHarbor,AMOUNT_CAP);
  const limitReceipt=rejected(await post(other,harbor,impossible),'AMOUNT_LIMIT',impossible);await assertTerminalStored(other,harbor,impossible,limitReceipt);
  // Catalog002 approved increment5000 cannot silently become fixed-ruleset2500.
  const unsupported=alternateEvent(f,f.fixtures.eventUnsupported,f.fixtures.releaseUnsupported,f.fixtures.lotUnsupported),beforeUnsupported=await rows(f,privilegeTables);
  for(const response of [await post(unsupported,actor,intent(unsupported)),await f.request(paths(unsupported).standing,{cookie:actor.cookie})]){
   assert.equal(response.status,409);sealedError(response);assert.equal(response.data.error.code,'UNSUPPORTED_RULESET');
  }
  const unsupportedContext=await f.request(`/api/bidder/events/${unsupported.fixtures.event}/context`,{cookie:actor.cookie});
  assert.equal(unsupportedContext.status,200);assert.ok(unsupportedContext.data.businesses.every(b=>b.canBid===false));
  await noPrivateWrites(f,beforeUnsupported);
 }),
 caseOf('BID-X16','flag production custom origin and unsafe local DB deny prior sessions','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),body=intent(f),receipt=await assertDurable(f,actor,body,await post(f,actor,body));
  const before=await rows(f,privilegeTables);
  for(const overrides of [{disabled:true},{production:true},{customPreview:true},{unsafeOrigin:true},{unsafeDatabase:true}]){
   await f.restart(overrides);
   denied(await post(f,actor,body));denied(await f.request(paths(f).standing,{cookie:actor.cookie}));
   denied(await f.request(paths(f).receipt(body.requestId),{cookie:actor.cookie}));
   denied(await f.request(`/api/bidder/events/${f.fixtures.event}/context`,{cookie:actor.cookie}));
   await noPrivateWrites(f,before);
  }
  await f.restart();const fresh=await login(f,'bidder-juniper');await immutableReceipt(f,fresh,body,receipt);
  assert.deepEqual(await rows(f,privilegeTables),before);
 }),
 caseOf('BID-X17','full immutable release receipt bid and standing survive process restart','adversarial',async f=>{
  const actor=await login(f,'bidder-juniper'),body=intent(f),receipt=await assertDurable(f,actor,body,await post(f,actor,body));
  const before=await rows(f,privilegeTables),publication=await f.publicationRows(f.fixtures.event);
  await f.restart();
  await immutableReceipt(f,actor,body,receipt);
  const fresh=await login(f,'bidder-juniper');await immutableReceipt(f,fresh,body,receipt);
  await assertStandingSQL(f,await standing(f,fresh),OPENING,f.fixtures.businessJuniper,1,1);
  assert.deepEqual(await rows(f,privilegeTables),before);assert.deepEqual(await f.publicationRows(f.fixtures.event),publication);
 }),
];
