import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RULESET,OPENING,INCREMENT,AMOUNT_CAP,privilegeTables,paths,intent,noStore,noSecrets,sealedError,denied,rejected,login,post,rows,standing,assertDurable,assertStandingSQL,immutableReceipt,assertTerminalStored } from './protocol.mjs';
import {withBrowser,openLot,expect} from './browser.mjs';
import { boundCases } from './bound-probes.mjs';

export const cases=[
  {id:'BID-A01',name:'context',mode:'acceptance',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper');
    const r=await f.request(`/api/bidder/events/${f.fixtures.event}/context`,{cookie:j.cookie});
    assert.equal(r.status,200);noStore(r);assert.equal(r.data.testMode,true);
    noSecrets(r);assert.deepEqual(Object.keys(r.data).sort(),['testMode','person','businesses'].sort());
    assert.deepEqual(Object.keys(r.data.person).sort(),['id','name']);
    for(const b of r.data.businesses)assert.deepEqual(Object.keys(b).sort(),['id','name','canBid'].sort());
    assert.equal(r.data.person.id,f.fixtures.personJuniper);
    assert.deepEqual(r.data.businesses.map(b=>({id:b.id,canBid:b.canBid})),[
      {id:f.fixtures.businessJuniper,canBid:true},
    ]);
  }},
  {id:'BID-A02',name:'durable-first',mode:'acceptance',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),body=intent(f);
    const initial=await standing(f,j);
    assert.equal(initial.currentAmountMinor,null);assert.equal(initial.minimumAmountMinor,10000);
    assert.equal(initial.acceptedBidCount,0);assert.equal(initial.version,0);
    const r=await post(f,j,body);await assertDurable(f,j,body,r);
    const s=await standing(f,j);assert.equal(s.minimumAmountMinor,12500);
    await assertStandingSQL(f,s,10000,f.fixtures.businessJuniper,1,1);
  }},
  {id:'BID-A03/A05',name:'competing-higher',mode:'acceptance',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),h=await login(f,'bidder-harbor');
    const first=intent(f),second=intent(f,f.fixtures.businessHarbor,12751);
    const original=await assertDurable(f,j,first,await post(f,j,first));
    await assertDurable(f,h,second,await post(f,h,second));
    const s=await standing(f,j);assert.equal(s.minimumAmountMinor,15251);
    await assertStandingSQL(f,s,12751,f.fixtures.businessHarbor,2,2);
    await immutableReceipt(f,j,first,original);
  }},
  {id:'BID-A04/X07',name:'retry-and-conflict',mode:'acceptance',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),body=intent(f);
    const duplicates=await Promise.all([post(f,j,body),post(f,j,body)]);
    assert.deepEqual(duplicates.map(r=>r.status),[201,201]);assert.deepEqual(duplicates[0].data.receipt,duplicates[1].data.receipt);
    const original=await assertDurable(f,j,body,duplicates[0]);
    assert.equal((await standing(f,j)).version,1);assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_manual_bids')).rows[0].n,1);
    const before=await rows(f),fresh=await login(f,'bidder-juniper');
    const replay=await post(f,fresh,body);
    assert.equal(replay.status,201);assert.deepEqual(replay.data.receipt,original);
    assert.deepEqual(await rows(f),before,'Exact retry cannot create/mutate privileged rows.');
    const conflict=await post(f,fresh,{...body,amountMinor:12500});
    assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'IDEMPOTENCY_CONFLICT');
    sealedError(conflict);assert.deepEqual(await rows(f),before);
    await immutableReceipt(f,fresh,body,original);
    // Same UUID belongs independently to a second person; no global request-key shortcut.
    const h=await login(f,'bidder-harbor'),sameUUID=intent(f,f.fixtures.businessHarbor,12500,body.requestId);
    const second=await assertDurable(f,h,sameUUID,await post(f,h,sameUUID));
    assert.notEqual(second.bidId,original.bidId);assert.notEqual(second.actorId,original.actorId);
    await immutableReceipt(f,h,sameUUID,second);await immutableReceipt(f,fresh,body,original);
    assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_bid_receipts WHERE request_id=$1',[body.requestId])).rows[0].n,2);
    await assertStandingSQL(f,await standing(f,h),12500,f.fixtures.businessHarbor,2,2);
  }},
  {id:'BID-A06',name:'same-business-people',mode:'acceptance',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),c=await login(f,'bidder-juniper-coworker');
    assert.notEqual(j.person.id,c.person.id);
    const a=intent(f),b=intent(f);
    const ar=await assertDurable(f,j,a,await post(f,j,a));
    const br=await assertDurable(f,c,b,await post(f,c,b,f.fixtures.lotB),f.fixtures.lotB);
    assert.equal(ar.businessId,br.businessId);assert.notEqual(ar.actorId,br.actorId);
    await withBrowser(f,async({signed})=>{
      const coworker=await signed('bidder-juniper-coworker');await openLot(coworker,f);
      await expect(coworker.frame.locator('main')).toContainText('Juniper Studio');
      assert.equal(await coworker.frame.locator('[data-owned-request="'+ar.requestId+'"]').count(),0,'A business lead cannot fabricate the coworker\'s own accepted request.');
      assert.equal(await coworker.frame.locator('[data-action="raise"]:not([disabled])').count(),0);
    });
  }},
  {id:'BID-X01',name:'admission-denials',mode:'adversarial',scenario:{phase:'open'},async run(f){
    for(const account of ['bidder-member','bidder-viewer','bidder-bid-only','bidder-unlisted','staff-saturn']){
      const actor=await login(f,account),before=await rows(f,privilegeTables);
      denied(await post(f,actor,intent(f)));
      denied(await f.request(paths(f).standing,{cookie:actor.cookie}));
      assert.deepEqual(await rows(f,privilegeTables),before,`${account} must not create privilege or a receipt.`);
    }
  }},
  {id:'BID-X02',name:'typed-claims',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const actor=await login(f,'bidder-unlisted'),before=await rows(f,privilegeTables);
    const r=await post(f,actor,{...intent(f),memberId:'TEST-JUNIPER-MEMBER',
      personId:f.fixtures.personJuniper,role:'bid',accepted:true},f.fixtures.lotA,
      {'x-person-id':f.fixtures.personJuniper,'x-member-id':'TEST-JUNIPER-MEMBER'});
    assert.ok([400,403,404].includes(r.status));sealedError(r);
    assert.equal(r.data?.receipt,undefined);
    assert.deepEqual(await rows(f,privilegeTables),before,'Typed claims cannot change authority or bid rows.');
  }},
  {id:'BID-X03',name:'tenant-and-receipt',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),p=await login(f,'bidder-pine');
    let before=await rows(f,privilegeTables);
    denied(await post(f,p,intent(f,f.fixtures.businessPine)));
    denied(await post(f,j,intent(f,f.fixtures.businessPine)));
    const pineTarget={...f,fixtures:{...f.fixtures,event:f.fixtures.eventPine,release:f.fixtures.releasePine,lotA:f.fixtures.lotPine}};
    denied(await post(pineTarget,j,intent(pineTarget)));
    const foreignStanding=await f.request(paths(pineTarget).standing,{cookie:j.cookie});
    denied(foreignStanding);assert.ok(!foreignStanding.text.includes('Private Pine lot'));
    assert.deepEqual(await rows(f,privilegeTables),before);
    const body=intent(f);await assertDurable(f,j,body,await post(f,j,body));
    const h=await login(f,'bidder-harbor');before=await rows(f,privilegeTables);
    const foreign=await f.request(paths(f).receipt(body.requestId),{cookie:h.cookie});
    denied(foreign,[403,404]);assert.deepEqual(await rows(f,privilegeTables),before);
    assert.doesNotMatch(foreign.text,new RegExp(body.requestId));
  }},
  {id:'BID-X04',name:'revocation',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),body=intent(f);
    const original=await assertDurable(f,j,body,await post(f,j,body));
    await f.db.query('UPDATE bz_business_person_memberships SET active=false WHERE person_id=$1 AND business_id=$2',
      [j.person.id,f.fixtures.businessJuniper]);
    const before=await rows(f,privilegeTables);
    denied(await post(f,j,body));
    denied(await f.request(paths(f).receipt(body.requestId),{cookie:j.cookie}));
    denied(await f.request(paths(f).standing,{cookie:j.cookie}));
    assert.deepEqual(await rows(f,privilegeTables),before);
    const stored=await f.db.query('SELECT receipt FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2',
      [j.person.id,body.requestId]);
    assert.deepEqual(stored.rows[0].receipt,original,'Revocation cannot rewrite accepted history.');
  }},
  {id:'BID-X05',name:'equal-race',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),h=await login(f,'bidder-harbor');
    const actors=[j,h],bodies=[intent(f),intent(f,f.fixtures.businessHarbor)];
    const result=await Promise.all(actors.map((a,i)=>post(f,a,bodies[i])));
    assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
    const winner=result.findIndex(r=>r.status===201),loser=1-winner;
    const accepted=await assertDurable(f,actors[winner],bodies[winner],result[winner]);
    const rejection=rejected(result[loser],'BELOW_MINIMUM',bodies[loser]);
    await assertTerminalStored(f,actors[loser],bodies[loser],rejection);
    const s=await standing(f,actors[winner]);
    await assertStandingSQL(f,s,10000,bodies[winner].businessId,1,1);
    const before=await rows(f);
    for(let i=0;i<2;i++){
      const replay=await post(f,actors[i],bodies[i]);
      assert.equal(replay.status,result[i].status);
      assert.deepEqual(replay.data.receipt,i===winner?accepted:rejection);
    }
    assert.deepEqual(await rows(f),before);
    assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_manual_bids')).rows[0].n,1);
    assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_bid_receipts')).rows[0].n,2);
  }},
  {id:'BID-X06',name:'stale-and-terminal-retry',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),h=await login(f,'bidder-harbor');
    const stale=intent(f),first=intent(f,f.fixtures.businessHarbor);
    await assertDurable(f,h,first,await post(f,h,first));
    const terminal=rejected(await post(f,j,stale),'BELOW_MINIMUM',stale);
    await assertTerminalStored(f,j,stale,terminal);
    const corrected=intent(f,f.fixtures.businessJuniper,12751);
    await assertDurable(f,j,corrected,await post(f,j,corrected));
    const before=await rows(f),again=await post(f,j,stale);
    assert.deepEqual(rejected(again,'BELOW_MINIMUM',stale),terminal);
    assert.deepEqual(await rows(f),before);
    const s=await standing(f,j);await assertStandingSQL(f,s,12751,f.fixtures.businessJuniper,2,2);
    // An explicit unsupported test-version result; this does not prohibit self-raise in a live auction.
    for(const actor of [j,await login(f,'bidder-juniper-coworker')]){
      const own=intent(f,f.fixtures.businessJuniper,15251),beforeRaise=(await rows(f)).bz_manual_bids;
      const terminal=rejected(await post(f,actor,own),'UNSUPPORTED_SELF_RAISE',own);
      await assertTerminalStored(f,actor,own,terminal);
      assert.deepEqual((await rows(f)).bz_manual_bids,beforeRaise);
      assert.equal((await standing(f,actor)).version,2);
    }
  }},
  ...['before','closed'].map(phase=>({id:`BID-X08-${phase}`,name:'window-denials',
    mode:'adversarial',scenario:{phase,transitionOpen:phase==='before'},async run(f){
      const j=await login(f,'bidder-juniper'),body=intent(f);
      const beforeBids=(await rows(f)).bz_manual_bids;
      const first=rejected(await post(f,j,body),phase==='before'?'NOT_OPEN':'CLOSED',body);
      await assertTerminalStored(f,j,body,first);
      const before=await rows(f),again=await post(f,j,body);
      assert.deepEqual(again.data.receipt,first);assert.equal(again.status,409);
      assert.deepEqual(await rows(f),before);assert.deepEqual(before.bz_manual_bids,beforeBids);
      if(phase==='before'){
        const deadline=Date.now()+6000;
        while((await f.dbNow())<f.opensAt&&Date.now()<deadline)await new Promise(done=>setTimeout(done,15));
        assert.ok((await f.dbNow())>=f.opensAt,'Real DB clock must pass opening without an app clock seam or release edit.');
        const replay=await post(f,j,body);assert.deepEqual(rejected(replay,'NOT_OPEN',body),first);
        assert.deepEqual(await rows(f),before,'A terminal early result stays immutable after real opening.');
        const fresh=intent(f);await assertDurable(f,j,fresh,await post(f,j,fresh));
      }
    }})),
  {id:'BID-X11',name:'atomic-failure',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper'),body=intent(f);
    await f.db.query(`CREATE FUNCTION independent_bid003_reject() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'INDEPENDENT_BID_WRITE_REJECT'; END $$;
      CREATE TRIGGER independent_bid003_receipt_rejected BEFORE INSERT ON bz_bid_receipts
      FOR EACH ROW EXECUTE FUNCTION independent_bid003_reject();`);
    const before=await rows(f),r=await post(f,j,body);
    assert.equal(r.status,503);assert.equal(r.data.error.code,'UNAVAILABLE');
    sealedError(r);assert.equal(r.data.receipt,undefined);
    assert.deepEqual(await rows(f),before,'Receipt rejection must roll back bid and standing too.');
    await f.db.query('DROP TRIGGER independent_bid003_receipt_rejected ON bz_bid_receipts;');
    await assertDurable(f,j,body,await post(f,j,body));
    const s=await standing(f,j);await assertStandingSQL(f,s,10000,f.fixtures.businessJuniper,1,1);
    const harbor=await login(f,'bidder-harbor'),second=intent(f,f.fixtures.businessHarbor,12500);
    await f.db.query(`CREATE TRIGGER independent_bid003_standing_rejected BEFORE UPDATE ON bz_lot_standing
      FOR EACH ROW EXECUTE FUNCTION independent_bid003_reject();`);
    const standingBefore=await rows(f),failed=await post(f,harbor,second);
    assert.equal(failed.status,503);assert.equal(failed.data.error.code,'UNAVAILABLE');
    sealedError(failed);assert.equal(failed.data.receipt,undefined);
    assert.deepEqual(await rows(f),standingBefore,'A standing-write failure must roll back both bid and receipt.');
    await f.db.query('DROP TRIGGER independent_bid003_standing_rejected ON bz_lot_standing; DROP FUNCTION independent_bid003_reject();');
    await assertDurable(f,harbor,second,await post(f,harbor,second));
    await assertStandingSQL(f,await standing(f,j),12500,f.fixtures.businessHarbor,2,2);
  }},
  {id:'BID-X15',name:'validation',mode:'adversarial',scenario:{phase:'open'},async run(f){
    const j=await login(f,'bidder-juniper');
    for(const bad of [10000.5,'10000',null,-1,Number.MAX_SAFE_INTEGER+1]){
      const before=await rows(f,privilegeTables),r=await post(f,j,intent(f,f.fixtures.businessJuniper,bad));
      assert.equal(r.status,400);assert.equal(r.data.error.code,'VALIDATION');
      sealedError(r);assert.equal(r.data.receipt,undefined);
      assert.deepEqual(await rows(f,privilegeTables),before);
    }
    const before=await rows(f,privilegeTables);
    const r=await post(f,j,{...intent(f),currency:'EUR',current:0,history:[],accepted:true,maxAmountMinor:100000,donation:true});
    assert.equal(r.status,400);assert.equal(r.data.error.code,'VALIDATION');
    sealedError(r);
    assert.deepEqual(await rows(f,privilegeTables),before);
  }},
  ...boundCases,
];
