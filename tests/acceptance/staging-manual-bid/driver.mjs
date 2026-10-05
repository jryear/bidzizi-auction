// Proposed executable independent driver. No implementation imports or answers.
import assert from 'node:assert/strict';
import {withFixture,HarnessError,ApplicationFailure,evidenceExit,browserFailure} from './harness.mjs';
import {prepareFixture} from './fixtures.mjs';
export {HarnessError,ApplicationFailure,evidenceExit,browserFailure};
export async function withBidFixture(run,scenario={phase:'open'}){
  return withFixture(async f=>{
    const healthy=await f.request('/api/session');
    assert.equal(healthy.status,200,'Inherited session API must remain reachable.');
    assert.deepEqual(healthy.data,{authenticated:false,testMode:true});
    const gate=await f.request('/api/bidder/events/40000000-0000-4000-8000-000000000001/context');
    if(gate.status===404)assert.fail('Manual-bid context API is absent (finite feature RED).');
    if(gate.status>=500)throw new ApplicationFailure('Reached bidder dependency could not serve context.');
    const required=['bz_catalog_approvals','bz_catalog_lots','bz_event_view_grants',
      'bz_businesses','bz_business_person_memberships','bz_org_business_memberships',
      'bz_event_bidder_admissions','bz_manual_bids','bz_bid_receipts','bz_lot_standing'];
    for(const name of required){
      const exists=await f.db.query('SELECT to_regclass($1) AS table',[name]);
      assert.ok(exists.rows[0].table,`Required candidate schema ${name} is absent.`);
    }
    // Compile the actual bid handler before allocating the short queued-close fixture.
    const warm=await f.request('/api/bidder/events/40000000-0000-4000-8000-000000000001/lots/60000000-0000-4000-8000-000000000001/bids',
      {method:'POST',json:{},headers:{origin:f.origin}});
    assert.notEqual(warm.status,404,'Actual bid handler must exist before the controlled close-window probe.');
    if(warm.status>=500)throw new ApplicationFailure('Reached bid handler could not complete its harmless unauthorized warm-up.');
    const warmLogin=await f.request('/api/test-auth/login',{method:'POST',json:{account:'not-allowed'},headers:{origin:f.origin}});
    assert.equal(warmLogin.status,400,'Unknown synthetic account warms the inherited login route without creating a session.');
    await prepareFixture(f,scenario);
    return await run(f);
  });
}
