import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { identity, sessionHash, type Identity } from "./auth";
import { testMode } from "./config";
import { ApiError, body, forbidden, json, mutationMode, object, unauthenticated, uuid, validation } from "./http";

// Bounded synthetic fixture version; these are not live auction policies.
const RULESET = "staging-usd-manual-v1", INCREMENT = 2500, CAP = 1_000_000_000;
type Release = { id: string; event_id: string; org_id: string; opens_at: Date; closes_at: Date; approved_at: Date; event_snapshot: { increment: number } };
type Business = { id: string; name: string; can_bid: boolean };
type Authority = { actor: Identity; release: Release; businesses: Business[]; bidAdmission: boolean };
type StandingRow = { current_amount_minor: string | null; leading_business_id: string | null; accepted_bid_count: number; version: number; updated_at: Date };
type BidReceipt = { requestId: string; eventId: string; releaseId: string; lotId: string; actorId: string; businessId: string; amountMinor: number; rulesetId: string; currency: string; status: "accepted" | "rejected"; reason: string | null; bidId: string | null; decidedAt: string };
const missing = (kind: "event" | "lot" | "bid receipt") => new ApiError(404, "NOT_FOUND", `This ${kind} could not be found.`);
const unsupported = () => new ApiError(409, "UNSUPPORTED_RULESET", "This event does not support this test bidding version.");
function enabled(request: Request) { if (!testMode(request)) throw unauthenticated(); }
async function authority(client: PoolClient, request: Request, eventId: string, requiredBid = true, businessId?: string): Promise<Authority> {
  const actor = await identity(client, request), id = uuid(eventId);
  const view = await client.query("SELECT person_id FROM bz_event_view_grants WHERE person_id=$1 AND event_id=$2 AND active FOR SHARE", [actor.person.id, id]);
  if (!view.rows.length) throw forbidden();
  const release = (await client.query<Release>("SELECT id,event_id,org_id,opens_at,closes_at,approved_at,event_snapshot FROM bz_catalog_approvals WHERE event_id=$1", [id])).rows[0];
  if (!release) throw missing("event");
  const admission = (await client.query<{ access: string }>("SELECT access FROM bz_event_bidder_admissions WHERE person_id=$1 AND event_id=$2 AND active FOR SHARE", [actor.person.id, id])).rows[0];
  const bidAdmission = admission?.access === "BID";
  const businesses = (await client.query<Business>(
    `SELECT b.id,b.name,m.can_bid FROM bz_businesses b
     JOIN bz_business_person_memberships m ON m.business_id=b.id
     JOIN bz_org_business_memberships n ON n.business_id=b.id
     WHERE m.person_id=$1 AND n.org_id=$2 AND b.active AND m.active AND n.active
     ORDER BY b.name,b.id FOR SHARE OF b,m,n`, [actor.person.id, release.org_id])).rows;
  if (requiredBid && (!bidAdmission || !businesses.some(b => b.can_bid && (!businessId || b.id === businessId)))) throw forbidden();
  return { actor, release, businesses, bidAdmission };
}
async function clock(client: PoolClient, request: Request): Promise<Date> {
  // Capture after all waits. Row-share locks cannot prevent a session expiring.
  const at = (await client.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0].at;
  const active = await client.query(
    `SELECT p.id FROM bz_sessions s JOIN bz_people p ON p.id=s.person_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2::timestamptz AND p.active AND p.is_test FOR SHARE OF s,p`, [sessionHash(request), at.toISOString()]);
  if (!active.rows.length) throw unauthenticated();
  return at;
}
async function phase(client: PoolClient, release: Release, at: Date): Promise<"scheduled" | "open" | "closed"> {
  return (await client.query<{ phase: "scheduled" | "open" | "closed" }>("SELECT bz_catalog_phase($1::timestamptz,$2::timestamptz,$3::timestamptz) AS phase", [release.opens_at.toISOString(), release.closes_at.toISOString(), at.toISOString()])).rows[0].phase;
}
function supported(release: Release) { if (release.event_snapshot.increment !== INCREMENT) throw unsupported(); }
async function selectedLot(client: PoolClient, release: Release, lotId: string): Promise<{ id: string; opening: number }> {
  const row = (await client.query<{ snapshot: { id: string; opening: number } }>("SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 AND lot_id=$2", [release.id, uuid(lotId)])).rows[0];
  if (!row) throw missing("lot");
  return row.snapshot;
}
async function lockedStanding(client: PoolClient, release: Release, lotId: string, write: boolean): Promise<StandingRow> {
  const lockSQL = `SELECT current_amount_minor::text,leading_business_id,accepted_bid_count,version,updated_at FROM bz_lot_standing
     WHERE release_id=$1 AND lot_id=$2 FOR ${write ? "UPDATE" : "SHARE"}`;
  const existing = (await client.query<StandingRow>(lockSQL, [release.id, lotId])).rows[0];
  if (existing) return existing;
  if (!write) return { current_amount_minor: null, leading_business_id: null, accepted_bid_count: 0, version: 0, updated_at: release.approved_at };
  // Reads project an absent row from the immutable release without writing.
  // Create only a zero state for a new bid decision. Concurrent
  // first access serializes on its key, then obtains the same explicit lot lock.
  await client.query(
    `INSERT INTO bz_lot_standing(release_id,lot_id,event_id,org_id,ruleset_id,currency,increment_minor,amount_cap_minor)
     VALUES($1,$2,$3,$4,$5,'USD',$6,$7) ON CONFLICT(release_id,lot_id) DO NOTHING`, [release.id, lotId, release.event_id, release.org_id, RULESET, INCREMENT, CAP]);
  return (await client.query<StandingRow>(lockSQL, [release.id, lotId])).rows[0];
}

function minimum(row: StandingRow, opening: number): number | null {
  const next = row.current_amount_minor === null ? opening : Number(row.current_amount_minor) + INCREMENT;
  return next <= CAP ? next : null;
}
async function projection(client: PoolClient, auth: Authority, lot: { id: string; opening: number }, row: StandingRow, at: Date) {
  const currentPhase = await phase(client, auth.release, at), min = minimum(row, lot.opening);
  const leading = row.leading_business_id ? (await client.query<{ id: string; name: string }>("SELECT id,name FROM bz_businesses WHERE id=$1", [row.leading_business_id])).rows[0] : null;
  return {
    releaseId: auth.release.id, lotId: lot.id, rulesetId: RULESET, currency: "USD", incrementMinor: INCREMENT, amountCapMinor: CAP,
    phase: currentPhase, currentAmountMinor: row.current_amount_minor === null ? null : Number(row.current_amount_minor), minimumAmountMinor: min,
    acceptedBidCount: row.accepted_bid_count, version: row.version, leadingBusiness: leading,
    serverNow: at.toISOString(), updatedAt: row.updated_at.toISOString(),
    canBid: currentPhase === "open" && min !== null && auth.businesses.some(b => b.can_bid && b.id !== row.leading_business_id),
  };
}
export async function bidderContext(request: Request, eventId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const auth = await authority(client, request, eventId, false), at = await clock(client, request), p = await phase(client, auth.release, at);
    return { testMode: true, person: auth.actor.person, businesses: auth.businesses.map(b => ({ id: b.id, name: b.name, canBid: b.can_bid && auth.bidAdmission && auth.release.event_snapshot.increment === INCREMENT && p === "open" })) };
  }));
}
export async function bidStanding(request: Request, eventId: string, lotId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const auth = await authority(client, request, eventId);
    const lot = await selectedLot(client, auth.release, lotId); supported(auth.release);
    const before = await clock(client, request);
    if (await phase(client, auth.release, before) === "scheduled") throw new ApiError(409, "CATALOG_NOT_OPEN", "The catalog appears when bidding opens.");
    const row = await lockedStanding(client, auth.release, lot.id, false), at = await clock(client, request);
    return { standing: await projection(client, auth, lot, row, at) };
  }));
}
function payloadHash(eventId: string, lotId: string, businessId: string, amountMinor: number, rulesetId: string) {
  return createHash("sha256").update(JSON.stringify([eventId, lotId, businessId, amountMinor, rulesetId])).digest("hex");
}
export async function placeManualBid(request: Request, eventId: string, lotId: string): Promise<Response> {
  enabled(request); mutationMode(request);
  const input = object(await body(request), ["requestId", "businessId", "amountMinor", "rulesetId"]);
  const requestId = uuid(input.requestId), businessId = uuid(input.businessId), event = uuid(eventId), lotIdValue = uuid(lotId);
  if (!Number.isSafeInteger(input.amountMinor) || (input.amountMinor as number) < 0 || (input.amountMinor as number) > CAP || input.rulesetId !== RULESET) throw validation();
  const amountMinor = input.amountMinor as number, hash = payloadHash(event, lotIdValue, businessId, amountMinor, RULESET);
  const result = await transaction(async client => {
    const auth = await authority(client, request, event, true, businessId), lot = await selectedLot(client, auth.release, lotIdValue);
    // Actor/key serializes across lots/events before any lot lock; it never grants authority.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [auth.actor.person.id + "/" + requestId]);
    const prior = (await client.query<{ payload_hash: string; receipt: BidReceipt; http_status: number }>("SELECT payload_hash,receipt,http_status FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2", [auth.actor.person.id, requestId])).rows[0];
    await clock(client, request);
    if (prior) {
      if (prior.payload_hash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This request was already used for another bid.");
      if (prior.http_status === 409) return { status: 409, data: { receipt: prior.receipt } };
      const row = await lockedStanding(client, auth.release, lot.id, false), at = await clock(client, request);
      return { status: 201, data: { receipt: prior.receipt, standing: await projection(client, auth, lot, row, at) } };
    }
    supported(auth.release);
    const row = await lockedStanding(client, auth.release, lot.id, true), at = await clock(client, request), p = await phase(client, auth.release, at), min = minimum(row, lot.opening);
    const reason = p === "scheduled" ? "NOT_OPEN" : p === "closed" ? "CLOSED" : min === null ? "AMOUNT_LIMIT" : row.leading_business_id === businessId ? "UNSUPPORTED_SELF_RAISE" : amountMinor < min ? "BELOW_MINIMUM" : null;
    const bidId = reason ? null : randomUUID();
    const receipt: BidReceipt = { requestId, eventId: event, releaseId: auth.release.id, lotId: lot.id, actorId: auth.actor.person.id, businessId, amountMinor, rulesetId: RULESET, currency: "USD", status: reason ? "rejected" : "accepted", reason, bidId, decidedAt: at.toISOString() };
    if (bidId) {
      await client.query(
        `INSERT INTO bz_manual_bids(id,actor_id,business_id,request_id,event_id,org_id,release_id,lot_id,amount_minor,ruleset_id,currency,standing_version,decided_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'USD',$11,$12::timestamptz)`, [bidId, auth.actor.person.id, businessId, requestId, event, auth.release.org_id, auth.release.id, lot.id, amountMinor, RULESET, row.version + 1, at.toISOString()]);
      await client.query(
        `UPDATE bz_lot_standing SET current_amount_minor=$3,leading_business_id=$4,accepted_bid_id=$5,accepted_bid_count=accepted_bid_count+1,version=version+1,updated_at=$6::timestamptz
         WHERE release_id=$1 AND lot_id=$2`, [auth.release.id, lot.id, amountMinor, businessId, bidId, at.toISOString()]);
    }
    const status = reason ? 409 : 201;
    await client.query("INSERT INTO bz_bid_receipts(actor_id,request_id,payload_hash,receipt,http_status) VALUES($1,$2,$3,$4::jsonb,$5)", [auth.actor.person.id, requestId, hash, JSON.stringify(receipt), status]);
    if (reason) return { status, data: { receipt } };
    const updated = (await client.query<StandingRow>("SELECT current_amount_minor::text,leading_business_id,accepted_bid_count,version,updated_at FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2", [auth.release.id, lot.id])).rows[0];
    return { status, data: { receipt, standing: await projection(client, auth, lot, updated, at) } };
  });
  return json(result.data, result.status);
}
export async function manualBidReceipt(request: Request, eventId: string, lotId: string, requestId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const auth = await authority(client, request, eventId), lot = await selectedLot(client, auth.release, lotId);
    const row = (await client.query<{ receipt: BidReceipt }>("SELECT receipt FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2", [auth.actor.person.id, uuid(requestId)])).rows[0];
    await clock(client, request);
    if (!row || row.receipt.eventId !== auth.release.event_id || row.receipt.releaseId !== auth.release.id || row.receipt.lotId !== lot.id) throw missing("bid receipt");
    if (!auth.businesses.some(b => b.can_bid && b.id === row.receipt.businessId)) throw forbidden();
    return { receipt: row.receipt };
  }));
}
