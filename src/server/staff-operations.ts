import "server-only";
import type { PoolClient } from "pg";
import { grant, sessionHash, sessionIsCurrent, staff, type Identity } from "./auth";
import { testMode } from "./config";
import { transaction } from "./db";
import { ApiError, body, forbidden, json, mutationMode, notFound, object, unauthenticated, uuid, validation } from "./http";
import { isTrade, TRADE_DENOMINATION, TRADE_RULESET } from "./timing";

type EventRow = { id: string; org_id: string; draft: Record<string, unknown> };
type Approval = { id: string; event_id: string; org_id: string; approved_at: Date; opens_at: Date; closes_at: Date; timezone: string;
  event_snapshot: Record<string, unknown>; organization_snapshot: { id: string; name: string; initials: string } };
type Lot = { id: string; number: string; title: string; [key: string]: unknown };
type Standing = { lot_id: string; current_amount_minor: string | null; leading_business_id: string | null; leading_business_name: string | null;
  accepted_bid_count: number; version: number; updated_at: Date };
const bidderOperation = "staff-bidder-set:v1";

function enabled(request: Request) { if (!testMode(request)) throw unauthenticated(); }
async function staffEvent(client: PoolClient, request: Request, eventId: string) {
  const actor = await staff(client, request);
  const event = (await client.query<EventRow>("SELECT id,org_id,draft FROM bz_events WHERE id=$1 FOR SHARE", [uuid(eventId)])).rows[0];
  if (!event) throw notFound();
  const organization = grant(actor, event.org_id);
  return { actor, event, organization };
}

/** Database time and committed authority are checked again after every read wait. */
async function freshStaff(client: PoolClient, request: Request, actor: Identity, event: EventRow): Promise<Date> {
  const row = (await client.query<{ at: Date }>(`WITH t AS MATERIALIZED (SELECT clock_timestamp() AS at)
    SELECT t.at FROM t,bz_sessions s JOIN bz_people p ON p.id=s.person_id
    JOIN bz_staff_grants g ON g.person_id=p.id JOIN bz_events e ON e.org_id=g.org_id
    WHERE s.token_hash=$1 AND p.id=$2 AND e.id=$3 AND e.org_id=$4
      AND s.revoked_at IS NULL AND s.expires_at>t.at AND p.active AND p.is_test AND g.active`,
    [sessionHash(request), actor.person.id, event.id, event.org_id])).rows[0];
  if (row) return row.at;
  if (!await sessionIsCurrent(client, request)) throw unauthenticated();
  throw forbidden();
}
function exactMoney(value: string | null): number | null {
  if (value === null) return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Recorded amount unavailable.");
  return amount;
}

export async function getStaffResults(request: Request, eventId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const { actor, event, organization } = await staffEvent(client, request, eventId);
    const approval = (await client.query<Approval>(`SELECT id,event_id,org_id,approved_at,opens_at,closes_at,timezone,event_snapshot,organization_snapshot
      FROM bz_catalog_approvals WHERE event_id=$1 AND org_id=$2`, [event.id, event.org_id])).rows[0];
    if (!approval) {
      const at = await freshStaff(client, request, actor, event);
      return { schemaVersion: 1, testMode: true, published: false, eventId: event.id, releaseId: null,
        event: { ...event.draft, id: event.id }, organization, schedule: null, phase: "draft", serverNow: at.toISOString(),
        currency: isTrade(event.draft) ? TRADE_DENOMINATION : "USD", rulesetId: isTrade(event.draft) ? TRADE_RULESET : "staging-usd-manual-v1",
        scale: 100, finalized: false, lots: [] };
    }
    const lots = (await client.query<{ snapshot: Lot }>("SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 ORDER BY position", [approval.id])).rows;
    // A single PostgreSQL statement observes all current standings together.
    // No absent-row seed or finalization is performed by a read.
    const standings = (await client.query<Standing>(`SELECT s.lot_id,s.current_amount_minor::text,s.leading_business_id,b.name AS leading_business_name,
      s.accepted_bid_count,s.version,s.updated_at FROM bz_lot_standing s
      LEFT JOIN bz_businesses b ON b.id=s.leading_business_id WHERE s.release_id=$1`, [approval.id])).rows;
    const at = await freshStaff(client, request, actor, event);
    const phase = at < approval.opens_at ? "scheduled" : at < approval.closes_at ? "open" : "closed";
    const rows = new Map(standings.map(row => [row.lot_id, row]));
    return { schemaVersion: 1, testMode: true, published: true, eventId: event.id, releaseId: approval.id,
      event: { ...approval.event_snapshot, id: event.id }, organization: approval.organization_snapshot,
      schedule: { opensAt: approval.opens_at.toISOString(), closesAt: approval.closes_at.toISOString(), timezone: approval.timezone },
      phase, serverNow: at.toISOString(), currency: isTrade(approval.event_snapshot) ? TRADE_DENOMINATION : "USD",
      rulesetId: isTrade(approval.event_snapshot) ? TRADE_RULESET : "staging-usd-manual-v1", scale: 100, finalized: false,
      assetContext: { version: 1, approvalId: approval.id },
      lots: lots.map(({ snapshot: lot }) => {
        const row = rows.get(lot.id), amount = exactMoney(row?.current_amount_minor ?? null);
        return { lot, standing: { currentAmountMinor: amount,
          leadingBusiness: row?.leading_business_id ? { id: row.leading_business_id, name: row.leading_business_name ?? "" } : null,
          acceptedBidCount: row?.accepted_bid_count ?? 0, version: row?.version ?? 0,
          updatedAt: (row?.updated_at ?? approval.approved_at).toISOString() },
          recordedState: amount === null ? "no-bids" : "recorded-standing" };
      }) };
  }));
}

/** Quote every cell and defuse spreadsheet formulas, including whitespace prefixes. */
export function csvCell(value: unknown): string {
  let cell = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return '"' + cell.replaceAll('"', '""') + '"';
}
export async function exportStaffResults(request: Request, eventId: string): Promise<Response> {
  const response = await getStaffResults(request, eventId);
  const result = await response.json();
  if (!result.published) throw new ApiError(409, "NOT_PUBLISHED", "Publish the saved catalog before exporting results.");
  const columns = ["Event", "Event ID", "Release ID", "Lot", "Title", "Denomination", "Rules", "Opens at", "Closes at", "Timezone", "Amount minor units", "Leading business", "Bid count", "Recorded state", "Observed at"];
  const rows = result.lots.map((row: { lot: Lot; standing: { currentAmountMinor: number | null; leadingBusiness: { name: string } | null; acceptedBidCount: number }; recordedState: string }) =>
    [result.event.name, result.eventId, result.releaseId, row.lot.number, row.lot.title, result.currency, result.rulesetId,
      result.schedule.opensAt, result.schedule.closesAt, result.schedule.timezone, row.standing.currentAmountMinor,
      row.standing.leadingBusiness?.name ?? "", row.standing.acceptedBidCount, row.recordedState, result.serverNow]);
  const csv = [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="event-${uuid(eventId)}-recorded-results.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" } });
}

export async function getStaffBidders(request: Request, eventId: string): Promise<Response> {
  enabled(request);
  const hash = sessionHash(request);
  if (!hash) throw unauthenticated();
  return json(await transaction(async client => {
    // An allowlisted definer projection avoids granting the runtime raw access
    // to enrollment slots, which contain private entry/session hashes.
    const result = (await client.query<{ result: { error?: string; bidders?: unknown[]; [key: string]: unknown } }>(
      "SELECT public.bz_staff_bidder_list($1,$2) AS result", [hash, uuid(eventId)])).rows[0].result;
    if (result.error === "UNAUTHENTICATED") throw unauthenticated();
    if (result.error === "FORBIDDEN") throw forbidden();
    if (result.error === "NOT_FOUND") throw notFound();
    if (result.error || !Array.isArray(result.bidders)) throw new Error("Attendee list unavailable.");
    return result;
  }));
}

function bidderResult(result: { error?: string; currentRevision?: number; [key: string]: unknown }) {
  if (result.error === "UNAUTHENTICATED") throw unauthenticated();
  if (result.error === "FORBIDDEN") throw forbidden();
  if (result.error === "NOT_FOUND") throw notFound();
  if (result.error === "VALIDATION") throw validation();
  if (result.error === "IDEMPOTENCY_CONFLICT") throw new ApiError(409, result.error, "This request was already used for a different attendee change.");
  if (result.error === "BIDDER_REVISION_CONFLICT") throw new ApiError(409, result.error, "This attendee changed. Reload the current access before saving.", { currentRevision: result.currentRevision });
  if (result.error || !result.operation) throw new Error("Attendee operation unavailable.");
  return result;
}
export async function setStaffBidder(request: Request, eventId: string): Promise<Response> {
  enabled(request); mutationMode(request);
  const hash = sessionHash(request);
  if (!hash) throw unauthenticated();
  const input = object(await body(request), ["requestId", "personId", "expectedRevision", "access", "active"]);
  if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0 || (input.expectedRevision as number) >= 2147483647 ||
    !["VIEW", "BID"].includes(input.access as string) || typeof input.active !== "boolean") throw validation();
  return json(await transaction(async client => {
    try {
      const row = (await client.query<{ result: { error?: string; [key: string]: unknown } }>("SELECT public.bz_staff_bidder_set($1,$2,$3,$4,$5,$6,$7) AS result",
        [hash, uuid(eventId), uuid(input.requestId), uuid(input.personId), input.expectedRevision, input.access, input.active])).rows[0];
      return bidderResult(row.result);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "PBO02") throw unauthenticated();
      throw error;
    }
  }));
}
export async function getStaffBidderReceipt(request: Request, eventId: string, requestId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const { actor, event } = await staffEvent(client, request, eventId);
    const row = (await client.query<{ response: { operation: { eventId: string }; [key: string]: unknown } }>(
      "SELECT response FROM bz_requests WHERE actor_id=$1 AND operation=$2 AND request_id=$3", [actor.person.id, bidderOperation, uuid(requestId)])).rows[0];
    await freshStaff(client, request, actor, event);
    if (!row || row.response.operation.eventId !== event.id) throw notFound();
    return { ...row.response, replayed: true };
  }));
}
