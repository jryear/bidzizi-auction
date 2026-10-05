// Evidence-of-evidence preparation only: no app/network/database/browser process.
import assert from 'node:assert/strict';
import {denied,standing,post,assertDurable,RULESET,INCREMENT,AMOUNT_CAP} from './protocol.mjs';
const stamp='2026-10-05T12:00:00.000Z',earlier='2026-10-05T11:00:00.000Z';
const dto={releaseId:'r',lotId:'l',rulesetId:RULESET,currency:'USD',incrementMinor:INCREMENT,amountCapMinor:AMOUNT_CAP,
 phase:'open',currentAmountMinor:10000,minimumAmountMinor:12500,acceptedBidCount:1,version:1,
 leadingBusiness:{id:'b',name:'Juniper Studio'},serverNow:stamp,updatedAt:earlier,canBid:true};
const packet=(status,data)=>({status,headers:new Headers({'cache-control':'no-store'}),data,text:JSON.stringify(data)});
const window={opens_at:new Date('2026-10-01T00:00:00.000Z'),closes_at:new Date('2026-10-07T00:00:00.000Z')};
const fixture=body=>({fixtures:{release:'r',lotA:'l',event:'e'},dbNow:async()=>new Date(stamp),
 db:{query:async()=>({rows:[window]})},request:async()=>packet(200,{standing:body})});
const error={error:{code:'FORBIDDEN',message:'This action is not available to this account.'}};
denied(packet(403,error));
assert.throws(()=>denied(packet(403,{...error,debug:{actorId:'other',businessName:'Juniper Studio',amountMinor:10000}})));
assert.throws(()=>denied(packet(403,{error:{code:'FORBIDDEN',message:'Juniper Studio: 10000'}})));
await standing(fixture(dto),{cookie:'synthetic-not-a-session'});
await assert.rejects(standing(fixture({...dto,privateActor:{name:'Test Juniper Bidder'}}),{cookie:'synthetic'}));
await assert.rejects(standing(fixture({...dto,serverNow:'2200-01-01T00:00:00.000Z'}),{cookie:'synthetic'}));
await assert.rejects(standing(fixture({...dto,phase:'closed'}),{cookie:'synthetic'}));

// An immutable receipt replay must retain its old decidedAt, not acquire the
// later lookup/request bracket as an invented new decision timestamp.
const session={person:{id:'p'},cookie:'synthetic'},body={requestId:'q',businessId:'b',amountMinor:10000,rulesetId:RULESET};
const receipt={requestId:'q',eventId:'e',releaseId:'r',lotId:'l',actorId:'p',businessId:'b',amountMinor:10000,
 rulesetId:RULESET,currency:'USD',status:'accepted',reason:null,bidId:'bid',decidedAt:earlier};
const bid={id:'bid',actor_id:'p',business_id:'b',request_id:'q',event_id:'e',org_id:'o',release_id:'r',lot_id:'l',
 amount_minor:'10000',ruleset_id:RULESET,currency:'USD',decided_at:new Date(earlier),standing_version:1};
const replayFixture={fixtures:{event:'e',release:'r',lotA:'l',saturn:'o'},dbNow:async()=>new Date(stamp),
 db:{query:async sql=>sql.startsWith('SELECT 1 FROM bz_bid_receipts')?{rows:[{present:true}]}:
   sql.includes('FROM bz_manual_bids')?{rows:[bid]}:{rows:[{receipt,http_status:201}]}},
 request:async()=>packet(201,{receipt,standing:dto})};
const replay=await post(replayFixture,session,body);
assert.equal(replay.timeBracket.newDecision,false);
assert.deepEqual(await assertDurable(replayFixture,session,body,replay),receipt);
await assert.rejects(assertDurable(replayFixture,session,body,{...replay,timeBracket:{...replay.timeBracket,newDecision:true}}));
console.log(JSON.stringify({sealed_denial_control:1,nested_private_and_copy_counterexamples_rejected:2,
 standing_control:1,standing_private_time_phase_counterexamples_rejected:3,
 old_immutable_replay_control:1,false_new_decision_counterexample_rejected:1,
 app_network_db_browser_processes:0}));
