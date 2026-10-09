import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { identity, staff, grant, sessionHash, type Organization } from "./auth";
import { testMode } from "./config";
import { ApiError, body, forbidden, json, mutationMode, notFound, object, unauthenticated, uuid, validation } from "./http";
import { draft as validateDraft, type EventFields, type LotFields } from "./draft";
import { isTrade, resolveWindow, tradeDraft, TRADE_CAP, type TradeEvent, type TradeLot } from "./timing";
import { referencedAssets, validateAssetRefs } from "./staff-assets";

type ApprovedLot = LotFields & { number: string; provider: Organization };
type ApprovalRow = {
  id: string; event_id: string; org_id: string; source_revision: number; approved_at: Date;
  local_date: string; local_start: string; local_end: string; timezone: string;
  opens_at: Date; closes_at: Date; organization_snapshot: Organization; event_snapshot: EventFields;
};
function enabled(request: Request) { if (!testMode(request)) throw unauthenticated(); }
const incomplete = () => new ApiError(400, "CATALOG_INCOMPLETE", "Complete the selected saved lots and event details before approval.");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Resolve a local minute only when it corresponds to exactly one UTC instant. */
function localInstant(date: string, time: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw validation();
  const local = `${date}T${time}:00.000Z`, nominal = Date.parse(local);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString() !== local) throw validation();
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); }
  catch { throw validation(); }
  function projected(at: number): string {
    const parts = Object.fromEntries(format.formatToParts(new Date(at)).map(p => [p.type, p.value]));
    return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
  }
  // Collect offsets on both sides of any nearby transition; test each inverse.
  const offsets = new Set<number>();
  for (let delta = -36 * 3600000; delta <= 36 * 3600000; delta += 1800000) {
    const sample = nominal + delta;
    offsets.add(Date.parse(projected(sample)) - sample);
  }
  const candidates = [...offsets].map(offset => nominal - offset).filter(at => projected(at) === local);
  if (candidates.length !== 1) throw validation();
  return new Date(candidates[0]);
}
async function header(client: PoolClient, eventId: string): Promise<ApprovalRow | null> {
  return (await client.query<ApprovalRow>("SELECT * FROM bz_catalog_approvals WHERE event_id=$1", [eventId])).rows[0] ?? null;
}
async function approvedLots(client: PoolClient, approvalId: string): Promise<ApprovedLot[]> {
  return (await client.query<{ snapshot: ApprovedLot }>("SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 ORDER BY position", [approvalId])).rows.map(r => r.snapshot);
}
async function receipt(client: PoolClient, row: ApprovalRow) {
  return { approval: {
    id: row.id, eventId: row.event_id, organizationId: row.org_id, sourceRevision: row.source_revision,
    approvedAt: row.approved_at.toISOString(), opensAt: row.opens_at.toISOString(), closesAt: row.closes_at.toISOString(),
    local: { date: row.local_date, start: row.local_start, end: row.local_end, timezone: row.timezone },
    snapshot: { organization: row.organization_snapshot, event: row.event_snapshot, lots: await approvedLots(client, row.id) },
  } };
}
async function staffEvent(client: PoolClient, request: Request, eventId: string, write: boolean) {
  const actor = await staff(client, request);
  const event = (await client.query<{ id: string; org_id: string; revision: number; draft: EventFields }>(
    `SELECT id,org_id,revision,draft FROM bz_events WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [uuid(eventId)])).rows[0];
  if (!event) throw notFound();
  const organization = grant(actor, event.org_id);
  return { actor, event, organization };
}
export async function getApproval(request: Request, eventId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const { event } = await staffEvent(client, request, eventId, false);
    const row = await header(client, event.id);
    return row ? receipt(client, row) : { approval: null };
  }));
}
export async function approveCatalog(request: Request, eventId: string): Promise<Response> {
  enabled(request); mutationMode(request);
  const raw = await body(request);
  const result = await transaction(async client => {
    const { actor, event, organization } = await staffEvent(client, request, eventId, true);
    if (isTrade(event.draft)) throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","Use the versioned publication route for this event.");
    const input = object(raw, ["expectedRevision", "requestId", "lotIds"]);
    if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 1 || !Array.isArray(input.lotIds) || !input.lotIds.length || input.lotIds.length > 100) throw validation();
    const requestId = uuid(input.requestId), lotIds = input.lotIds.map(uuid).sort();
    if (new Set(lotIds).size !== lotIds.length) throw validation();
    const operation = `catalog-approval:${event.id}`;
    const payloadHash = createHash("sha256").update(canonical({ expectedRevision: input.expectedRevision, lotIds })).digest("hex");
    // Current authority was locked above. The event lock serializes approval and draft saves.
    const prior = (await client.query<{ payload_hash: string; response: unknown; status: number }>(
      "SELECT payload_hash,response,status FROM bz_requests WHERE actor_id=$1 AND operation=$2 AND request_id=$3", [actor.person.id, operation, requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== payloadHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This request was already used for a different catalog selection.");
      return { data: prior.response, status: prior.status };
    }
    if (await header(client, event.id)) throw new ApiError(409, "CATALOG_APPROVAL_EXISTS", "This event already has an approved catalog.");
    if (event.revision !== input.expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "This draft changed in another session.", { revision: event.revision });
    const source = (await client.query<{ id: string; position: number; data: LotFields }>(
      "SELECT id,position,data FROM bz_lots WHERE event_id=$1 AND org_id=$2 AND id=ANY($3::uuid[]) ORDER BY position", [event.id, event.org_id, lotIds])).rows;
    if (source.length !== lotIds.length) throw validation();
    if ([event.draft.name, event.draft.welcome, event.draft.date, event.draft.start, event.draft.end, event.draft.timezone].some(v => typeof v !== "string" || !v.trim()) ||
        source.some(r => [r.data.title, r.data.description, r.data.category].some(v => typeof v !== "string" || !v.trim()))) throw incomplete();
    const validated = validateDraft({ event: event.draft, lots: source.map(r => r.data) });
    await validateAssetRefs(client,request,event.id,validated);
    if(referencedAssets(validated).length)await freshPublisher(client,request,actor.person.id,event.org_id,event.id);
    const e = validated.event;
    if (![e.name, e.welcome, e.date, e.start, e.end, e.timezone].every(v => v.trim()) || !Number.isSafeInteger(e.increment) || (e.increment as number) <= 0 ||
        validated.lots.some(l => !l.title.trim() || !l.description.trim() || !l.category.trim() || l.windowId !== "main" || !Number.isSafeInteger(l.opening) || (l.opening as number) <= 0)) throw incomplete();
    const opensAt = localInstant(e.date, e.start, e.timezone), closesAt = localInstant(e.date, e.end, e.timezone);
    if (opensAt >= closesAt) throw validation();
    const clock = (await client.query<{ at: Date }>("SELECT clock_timestamp() AS at")).rows[0].at;
    if (clock >= closesAt) throw new ApiError(409, "WINDOW_CLOSED", "This auction window has closed.");
    const id = randomUUID();
    const row = (await client.query<ApprovalRow>(
      `INSERT INTO bz_catalog_approvals(id,event_id,org_id,source_revision,approved_by,approved_at,local_date,local_start,local_end,timezone,opens_at,closes_at,organization_snapshot,event_snapshot)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb) RETURNING *`,
      [id, event.id, event.org_id, event.revision, actor.person.id, clock.toISOString(), e.date, e.start, e.end, e.timezone, opensAt.toISOString(), closesAt.toISOString(), JSON.stringify(organization), JSON.stringify(e)])).rows[0];
    for (const [position, lot] of validated.lots.entries()) {
      const snapshot: ApprovedLot = { ...lot, number: String(source[position].position + 1).padStart(2, "0"), provider: organization };
      await client.query("INSERT INTO bz_catalog_lots(approval_id,event_id,org_id,lot_id,position,snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb)", [id, event.id, event.org_id, lot.id, position, JSON.stringify(snapshot)]);
    }
    const data = await receipt(client, row);
    await client.query("INSERT INTO bz_requests(actor_id,operation,request_id,payload_hash,response,status) VALUES($1,$2,$3,$4,$5::jsonb,201)", [actor.person.id, operation, requestId, payloadHash, JSON.stringify(data)]);
    if(referencedAssets(validated).length)await freshPublisher(client,request,actor.person.id,event.org_id,event.id);
    return { data, status: 201 };
  });
  return json(result.data, result.status);
}
async function viewerApproval(client: PoolClient, request: Request, eventId: string) {
  const actor = await identity(client, request), id = uuid(eventId);
  const permission = await client.query("SELECT person_id FROM bz_event_view_grants WHERE person_id=$1 AND event_id=$2 AND active FOR SHARE", [actor.person.id, id]);
  if (!permission.rows.length) throw forbidden();
  const approval = await header(client, id);
  if (!approval) throw new ApiError(404, "NOT_FOUND", "This catalog could not be found.");
  const clock = (await client.query<{ at: Date; phase: "scheduled" | "open" | "closed" }>(
    "WITH t AS MATERIALIZED (SELECT clock_timestamp() AS at) SELECT at,bz_catalog_phase($1::timestamptz,$2::timestamptz,at) AS phase FROM t", [approval.opens_at.toISOString(), approval.closes_at.toISOString()])).rows[0];
  return { approval, clock };
}
export async function getCatalog(request: Request, eventId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const { approval: a, clock } = await viewerApproval(client, request, eventId);
    if (isTrade(a.event_snapshot)) throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","Use the versioned catalog route for this event.");
    const e = a.event_snapshot;
    return {
      event: { id: a.event_id, name: e.name, eyebrow: e.eyebrow, welcome: e.welcome, venue: e.venue,
        cover: clock.phase==="scheduled"&&e.cover?.startsWith("asset:")?null:e.cover, sponsorsEnabled: e.sponsorsEnabled, sponsors: e.sponsors },
      organization: a.organization_snapshot, schedule: { opensAt: a.opens_at.toISOString(), closesAt: a.closes_at.toISOString() },
      serverNow: clock.at.toISOString(), phase: clock.phase, biddingEnabled: false,
      ...(clock.phase!=="scheduled"&&referencedAssets({event:e,lots:await approvedLots(client,a.id)}).length?{assetContext:{version:1,approvalId:a.id}}:{}),
      catalog: clock.phase === "scheduled" ? null : { approvalId: a.id, sourceRevision: a.source_revision, lots: await approvedLots(client, a.id) },
    };
  }));
}
export async function getCatalogLot(request: Request, eventId: string, lotId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const { approval: a, clock } = await viewerApproval(client, request, eventId);
    if (isTrade(a.event_snapshot)) throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","Use the versioned catalog route for this event.");
    const lot = (await client.query<{ snapshot: ApprovedLot }>("SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 AND lot_id=$2", [a.id, uuid(lotId)])).rows[0]?.snapshot;
    if (!lot) throw new ApiError(404, "NOT_FOUND", "This lot could not be found.");
    if (clock.phase === "scheduled") throw new ApiError(409, "CATALOG_NOT_OPEN", "The catalog appears when bidding opens.");
    return { eventId: a.event_id, approvalId: a.id, lot, phase: clock.phase, serverNow: clock.at.toISOString(), biddingEnabled: false };
  }));
}

async function freshPublisher(client: PoolClient, request: Request, personId: string, orgId: string, eventId: string): Promise<Date> {
  const row=await client.query<{at:Date}>(`WITH t AS MATERIALIZED (SELECT clock_timestamp() AS at)
    SELECT t.at FROM t,bz_sessions s JOIN bz_people p ON p.id=s.person_id
    JOIN bz_staff_grants g ON g.person_id=p.id JOIN bz_orgs o ON o.id=g.org_id
    JOIN bz_events e ON e.org_id=o.id
    WHERE s.token_hash=$1 AND p.id=$2 AND o.id=$3 AND e.id=$4
      AND s.revoked_at IS NULL AND s.expires_at>t.at AND p.active AND p.is_test AND g.active`,
    [sessionHash(request),personId,orgId,eventId]);
  if(!row.rows[0])throw unauthenticated();
  return row.rows[0].at;
}
async function tradeReceipt(client: PoolClient,row: ApprovalRow) {
  return {approval:{id:row.id,eventId:row.event_id,organizationId:row.org_id,sourceRevision:row.source_revision,
    approvedAt:row.approved_at.toISOString(),opensAt:row.opens_at.toISOString(),closesAt:row.closes_at.toISOString(),
    local:{date:row.local_date,start:row.local_start,end:row.local_end,timezone:row.timezone},
    snapshot:{organization:row.organization_snapshot,event:row.event_snapshot,lots:await approvedLots(client,row.id)}}};
}
export async function getTradeApproval(request:Request,eventId:string):Promise<Response>{
  enabled(request);
  return json(await transaction(async client=>{
    const {actor,event}=await staffEvent(client,request,eventId,false);
    if(!isTrade(event.draft))throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","This is a historical event.");
    await freshPublisher(client,request,actor.person.id,event.org_id,event.id);
    const row=await header(client,event.id);return row?tradeReceipt(client,row):{approval:null};
  }));
}
export async function approveTradeCatalog(request:Request,eventId:string):Promise<Response>{
  enabled(request);mutationMode(request);const raw=await body(request);
  const result=await transaction(async client=>{
    const {actor,event,organization}=await staffEvent(client,request,eventId,true);
    if(!isTrade(event.draft))throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","This is a historical event.");
    const input=object(raw,["expectedRevision","requestId","lotIds"]);
    if(!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision as number)<1||!Array.isArray(input.lotIds)||!input.lotIds.length||input.lotIds.length>100)throw validation();
    const requestId=uuid(input.requestId),lotIds=input.lotIds.map(uuid);
    if(new Set(lotIds).size!==lotIds.length)throw validation();
    const operation=`catalog-approval-v2:${event.id}`,payloadHash=createHash("sha256").update(canonical({expectedRevision:input.expectedRevision,lotIds})).digest("hex");
    // Event serialization precedes owned ledger inspection. Exact committed replay survives opening.
    const prior=(await client.query<{payload_hash:string;response:unknown;status:number}>("SELECT payload_hash,response,status FROM bz_requests WHERE actor_id=$1 AND operation=$2 AND request_id=$3",[actor.person.id,operation,requestId])).rows[0];
    await freshPublisher(client,request,actor.person.id,event.org_id,event.id);
    if(prior){if(prior.payload_hash!==payloadHash)throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This request was already used for different terms.");return {data:prior.response,status:prior.status};}
    if(await header(client,event.id))throw new ApiError(409,"CATALOG_APPROVAL_EXISTS","This event is already published.");
    if(event.revision!==input.expectedRevision)throw new ApiError(409,"REVISION_CONFLICT","This draft changed.",{revision:event.revision});
    const selected=(await client.query<{id:string;position:number;data:TradeLot}>("SELECT id,position,data FROM bz_lots WHERE event_id=$1 AND org_id=$2 AND id=ANY($3::uuid[]) ORDER BY position",[event.id,event.org_id,lotIds])).rows;
    if(selected.length!==lotIds.length)throw validation();
    const validated=tradeDraft({event:event.draft,lots:selected.map(r=>r.data)}),e=validated.event;
    await validateAssetRefs(client,request,event.id,validated);
    if(!e.name.trim()||!e.welcome.trim()||validated.lots.some(l=>!l.title.trim()||!l.description.trim()||!l.category.trim()||l.opening===null||l.opening<=0))throw incomplete();
    const {opensAt,closesAt}=resolveWindow(e.timing);
    const decision=await freshPublisher(client,request,actor.person.id,event.org_id,event.id);
    if(decision>=opensAt)throw new ApiError(409,"PUBLICATION_STARTED","Publication must be authorized before bidding opens.");
    const id=randomUUID(),snapshot={...e,version:2};
    const row=(await client.query<ApprovalRow>(`INSERT INTO bz_catalog_approvals(id,event_id,org_id,source_revision,approved_by,approved_at,local_date,local_start,local_end,timezone,opens_at,closes_at,organization_snapshot,event_snapshot)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb) RETURNING *`,
      [id,event.id,event.org_id,event.revision,actor.person.id,decision.toISOString(),e.timing.startDate,e.timing.start,e.timing.end,e.timing.timezone,opensAt.toISOString(),closesAt.toISOString(),JSON.stringify(organization),JSON.stringify(snapshot)])).rows[0];
    for(const [position,lot]of validated.lots.entries()){
      const selectedRow=selected[position],immutable={...lot,number:String(selectedRow.position+1).padStart(2,"0"),provider:organization,timing:{opensAt:opensAt.toISOString(),closesAt:closesAt.toISOString()},effectiveRaiseMinor:lot.fixedRaiseMinor};
      await client.query("INSERT INTO bz_catalog_lots(approval_id,event_id,org_id,lot_id,position,snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[id,event.id,event.org_id,lot.id,position,JSON.stringify(immutable)]);
    }
    const data=await tradeReceipt(client,row);
    await client.query("INSERT INTO bz_requests(actor_id,operation,request_id,payload_hash,response,status) VALUES($1,$2,$3,$4,$5::jsonb,201)",[actor.person.id,operation,requestId,payloadHash,JSON.stringify(data)]);
    await freshPublisher(client,request,actor.person.id,event.org_id,event.id);
    return {data,status:201};
  });return json(result.data,result.status);
}
export async function getTradeCatalog(request:Request,eventId:string):Promise<Response>{
  enabled(request);
  return json(await transaction(async client=>{
    const {approval:a,clock}=await viewerApproval(client,request,eventId);
    if(!isTrade(a.event_snapshot))throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","This is a historical catalog.");
    const e=a.event_snapshot as TradeEvent,schedule={opensAt:a.opens_at.toISOString(),closesAt:a.closes_at.toISOString(),timezone:a.timezone};
    const lots=await approvedLots(client,a.id);
    return {version:2,event:{id:a.event_id,name:e.name,eyebrow:e.eyebrow,welcome:e.welcome,venue:e.venue,cover:e.cover,coverAlt:e.coverAlt,sponsorsEnabled:e.sponsorsEnabled,sponsors:e.sponsors},organization:a.organization_snapshot,
      schedule,serverNow:clock.at.toISOString(),phase:clock.phase,biddingEnabled:clock.phase==="open",
      ...(referencedAssets({event:e,lots}).length?{assetContext:{version:1,approvalId:a.id}}:{}),
      catalog:{approvalId:a.id,sourceRevision:a.source_revision,lots:lots.map(l=>({...l,phase:clock.phase,timing:schedule}))}};
  }));
}
export async function getTradeCatalogLot(request:Request,eventId:string,lotId:string):Promise<Response>{
  enabled(request);
  return json(await transaction(async client=>{
    const {approval:a,clock}=await viewerApproval(client,request,eventId);
    if(!isTrade(a.event_snapshot))throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","This is a historical catalog.");
    const lot=(await client.query<{snapshot:ApprovedLot}>("SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 AND lot_id=$2",[a.id,uuid(lotId)])).rows[0]?.snapshot;
    if(!lot)throw new ApiError(404,"NOT_FOUND","This lot could not be found.");
    return {version:2,eventId:a.event_id,approvalId:a.id,lot:{...lot,phase:clock.phase,timing:{opensAt:a.opens_at.toISOString(),closesAt:a.closes_at.toISOString(),timezone:a.timezone}},phase:clock.phase,serverNow:clock.at.toISOString(),biddingEnabled:clock.phase==="open"};
  }));
}
