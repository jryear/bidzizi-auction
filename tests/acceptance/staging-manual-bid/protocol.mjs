// Concrete draft HTTP/SQL assertions. Table/route bindings are proposals and
// must be reconciled independently with002 before freeze. Not an app helper.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const RULESET='staging-usd-manual-v1';
export const OPENING=10000;
export const INCREMENT=2500;
export const AMOUNT_CAP=1_000_000_000;
export const privilegeTables=[
  'bz_manual_bids','bz_bid_receipts','bz_lot_standing',
  'bz_businesses','bz_business_person_memberships',
  'bz_org_business_memberships','bz_event_bidder_admissions',
  'bz_event_view_grants','bz_people','bz_staff_grants','bz_orgs','bz_catalog_approvals','bz_catalog_lots',
];
export const liveTables=privilegeTables.slice(0,3);

export function paths(f,lot=f.fixtures.lotA) {
  const root=`/api/bidder/events/${f.fixtures.event}/lots/${lot}`;
  return {bid:`${root}/bids`,standing:`${root}/standing`,
    receipt:requestId=>`${root}/bid-receipts/${requestId}`};
}
export function intent(f,business=f.fixtures.businessJuniper,amount=OPENING,requestId=randomUUID()) {
  return {requestId,businessId:business,amountMinor:amount,rulesetId:RULESET};
}
export function noStore(r) {
  assert.match(r.headers.get('cache-control')||'',/no-store/i);
}
export function noSecrets(r) {
  assert.doesNotMatch(r.text||'',/postgres(?:ql)?:|token_hash|\.neon\.tech|BEGIN;|INSERT INTO|SELECT .*FROM|stack_trace|\b[a-f0-9]{64}\b/i);
}
export function sealedError(r){
  noStore(r);noSecrets(r);
  assert.deepEqual(Object.keys(r.data).sort(),['error'],'Errors must have the exact sealed DTO.');
  assert.deepEqual(Object.keys(r.data.error).sort(),['code','message']);
  assert.equal(typeof r.data.error.code,'string');assert.equal(typeof r.data.error.message,'string');
  assert.doesNotMatch(r.data.error.message,/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    'Denied error copy cannot reveal actor, event, bid or operation identities.');
}
export function denied(r,statuses=[401,403,404]) {
  assert.ok(statuses.includes(r.status),`Expected denied request, got ${r.status}.`);
  sealedError(r);
  assert.match(r.data.error.message,/^(?:Sign in to continue\.|This action is not available to this account\.|This (?:event|lot|draft|request|bid receipt) could not be found\.)$/,
    'Denied copy must stay generic, without private business/person/amount sentinels.');
}
export function rejected(r,reason,body) {
  assert.equal(r.status,409);noStore(r);noSecrets(r);
  assert.deepEqual(Object.keys(r.data).sort(),['receipt']);receiptDTO(r.data.receipt);
  assert.equal(r.data.receipt.status,'rejected');
  assert.equal(r.data.receipt.reason,reason);
  assert.equal(r.data.receipt.requestId,body.requestId);
  assert.equal(r.data.receipt.amountMinor,body.amountMinor);
  assert.equal(r.data.receipt.bidId,null);
  return r.data.receipt;
}
export async function login(f,account) {
  const r=await f.request('/api/test-auth/login',{
    method:'POST',json:{account},headers:{origin:f.origin},
  });
  assert.equal(r.status,200,`Enrolled ${account} must sign in through gated test auth.`);
  noStore(r);assert.equal(r.data.testMode,true);
  const raw=r.headers.get('set-cookie')||'';
  assert.match(raw,/bz_session=/);assert.match(raw,/HttpOnly/i);assert.match(raw,/SameSite=Lax/i);
  return {account,cookie:raw.split(';')[0],person:r.data.person};
}
export async function post(f,session,body,lot=f.fixtures.lotA,extra={}) {
  const before=await f.dbNow();
  const prior=(await f.db.query('SELECT 1 FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2',[session.person.id,body.requestId])).rows.length;
  const response=await f.request(paths(f,lot).bid,{
    method:'POST',json:body,cookie:session.cookie,headers:{origin:f.origin,...extra},
  });
  return {...response,timeBracket:{before,after:await f.dbNow(),newDecision:prior===0}};
}
export async function rows(f,tables=liveTables) {
  const packet={};
  for (const table of tables) {
    // Names are fixed evidence constants, never browser/request input.
    packet[table]=(await f.db.query(
      `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`
    )).rows.map(x=>x.row);
  }
  return packet;
}
export async function standing(f,session,lot=f.fixtures.lotA) {
  const before=await f.dbNow();
  const r=await f.request(paths(f,lot).standing,{cookie:session.cookie});
  const after=await f.dbNow();
  assert.equal(r.status,200);noStore(r);noSecrets(r);
  assert.deepEqual(Object.keys(r.data),['standing']);standingDTO(r.data.standing);
  const s=r.data.standing;
  assert.equal(s.releaseId,f.fixtures.release);assert.equal(s.lotId,lot);
  assert.equal(s.rulesetId,RULESET);assert.equal(s.currency,'USD');
  assert.equal(s.incrementMinor,INCREMENT);
  const time=Date.parse(s.serverNow);
  assert.ok(time>=before.getTime()-1&&time<=after.getTime()+1,'Standing serverNow must lie in the independent database-time read bracket.');
  const window=(await f.db.query('SELECT opens_at,closes_at FROM bz_catalog_approvals WHERE id=$1',[f.fixtures.release])).rows[0];
  assert.equal(s.phase,time<window.opens_at.getTime()?'scheduled':time<window.closes_at.getTime()?'open':'closed');
  return s;
}
export function receiptDTO(a){
  assert.deepEqual(Object.keys(a).sort(),['requestId','eventId','releaseId','lotId','actorId','businessId',
    'amountMinor','rulesetId','currency','status','reason','bidId','decidedAt'].sort());
}
export function standingDTO(s){
  assert.deepEqual(Object.keys(s).sort(),['releaseId','lotId','rulesetId','currency','incrementMinor','amountCapMinor',
    'phase','currentAmountMinor','minimumAmountMinor','acceptedBidCount','version','leadingBusiness','serverNow','updatedAt','canBid'].sort());
  assert.equal(s.amountCapMinor,AMOUNT_CAP);assert.equal(typeof s.canBid,'boolean');
  assert.ok(Number.isFinite(Date.parse(s.serverNow))&&Number.isFinite(Date.parse(s.updatedAt)));
  assert.ok(Date.parse(s.updatedAt)<=Date.parse(s.serverNow));
  if(s.leadingBusiness!==null)assert.deepEqual(Object.keys(s.leadingBusiness).sort(),['id','name']);
}
export async function assertDurable(f,session,body,r,lot=f.fixtures.lotA) {
  assert.equal(r.status,201);noStore(r);noSecrets(r);
  assert.deepEqual(Object.keys(r.data).sort(),['receipt','standing']);receiptDTO(r.data.receipt);standingDTO(r.data.standing);
  const a=r.data.receipt;
  assert.equal(a.status,'accepted');assert.equal(a.reason,null);
  assert.equal(a.actorId,session.person.id);assert.equal(a.businessId,body.businessId);
  assert.equal(a.requestId,body.requestId);assert.equal(a.amountMinor,body.amountMinor);
  assert.equal(a.eventId,f.fixtures.event);assert.equal(a.releaseId,f.fixtures.release);
  assert.equal(a.lotId,lot);assert.equal(a.rulesetId,RULESET);assert.equal(a.currency,'USD');
  assert.ok(typeof a.bidId==='string');assert.ok(Number.isFinite(Date.parse(a.decidedAt)));
  if(r.timeBracket?.newDecision)assert.ok(Date.parse(a.decidedAt)>=r.timeBracket.before.getTime()-1&&Date.parse(a.decidedAt)<=r.timeBracket.after.getTime()+1);
  assert.ok(Date.parse(a.decidedAt)<=Date.parse(r.data.standing.serverNow));
  const bids=await f.db.query(
    `SELECT id,actor_id,business_id,request_id,event_id,org_id,release_id,lot_id,amount_minor::text,
      ruleset_id,currency,decided_at,standing_version FROM bz_manual_bids WHERE actor_id=$1 AND request_id=$2`,
    [session.person.id,body.requestId]
  );
  assert.equal(bids.rows.length,1,'Exactly one committed bid binds actor/request.');
  const b=bids.rows[0];
  assert.equal(b.id,a.bidId);assert.equal(b.actor_id,a.actorId);
  assert.equal(b.business_id,a.businessId);assert.equal(b.request_id,a.requestId);
  assert.equal(b.release_id,a.releaseId);assert.equal(b.lot_id,a.lotId);
  assert.equal(b.event_id,a.eventId);assert.equal(b.org_id,f.fixtures.saturn);
  assert.equal(b.currency,'USD');assert.equal(b.decided_at.toISOString(),a.decidedAt);
  assert.equal(b.amount_minor,String(body.amountMinor));assert.equal(b.ruleset_id,RULESET);
  const stored=await f.db.query(
    'SELECT receipt,http_status FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2',
    [session.person.id,body.requestId]
  );
  assert.equal(stored.rows.length,1);assert.equal(stored.rows[0].http_status,201);
  assert.deepEqual(stored.rows[0].receipt,a,'Complete immutable receipt must match SQL.');
  return a;
}
export async function assertStandingSQL(f,s,amount,business,count,version,lot=f.fixtures.lotA) {
  assert.equal(s.currentAmountMinor,amount);assert.equal(s.leadingBusiness.id,business);
  assert.equal(s.acceptedBidCount,count);assert.equal(s.version,version);
  const stored=await f.db.query(
    `SELECT current_amount_minor::text,leading_business_id,accepted_bid_count,version,updated_at,
      accepted_bid_id FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2`,
    [f.fixtures.release,lot]
  );
  assert.equal(stored.rows.length,1);
  const actual=stored.rows[0];
  assert.equal(actual.current_amount_minor,String(amount));
  assert.equal(actual.leading_business_id,business);assert.equal(actual.accepted_bid_count,count);
  assert.equal(actual.version,version);
  assert.equal(actual.updated_at.toISOString(),s.updatedAt);
  const latest=await f.db.query(
    'SELECT business_id,amount_minor::text,standing_version FROM bz_manual_bids WHERE id=$1',
    [actual.accepted_bid_id]
  );
  assert.equal(latest.rows.length,1);assert.equal(latest.rows[0].business_id,business);
  assert.equal(latest.rows[0].amount_minor,String(amount));
  assert.equal(latest.rows[0].standing_version,version);
}
export async function immutableReceipt(f,session,body,original,lot=f.fixtures.lotA) {
  const r=await f.request(paths(f,lot).receipt(body.requestId),{cookie:session.cookie});
  assert.equal(r.status,200);noStore(r);noSecrets(r);assert.deepEqual(Object.keys(r.data),['receipt']);
  receiptDTO(r.data.receipt);assert.deepEqual(r.data.receipt,original);
}
export async function assertTerminalStored(f,session,body,receipt) {
  assert.equal(receipt.actorId,session.person.id);assert.equal(receipt.businessId,body.businessId);
  assert.equal(receipt.eventId,f.fixtures.event);assert.equal(receipt.releaseId,f.fixtures.release);
  assert.equal(receipt.lotId,f.fixtures.lotA);assert.equal(receipt.rulesetId,RULESET);assert.equal(receipt.currency,'USD');
  assert.ok(Number.isFinite(Date.parse(receipt.decidedAt)));
  const stored=await f.db.query(
    'SELECT receipt,http_status FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2',
    [session.person.id,body.requestId]
  );
  assert.equal(stored.rows.length,1,'Typed terminal rejection must have one durable receipt.');
  assert.equal(stored.rows[0].http_status,409);
  assert.deepEqual(stored.rows[0].receipt,receipt,'Complete rejected receipt must match SQL.');
  assert.equal((await f.db.query(
    'SELECT count(*)::int n FROM bz_manual_bids WHERE actor_id=$1 AND request_id=$2',
    [session.person.id,body.requestId]
  )).rows[0].n,0,'A rejected request cannot have an accepted bid row.');
}
