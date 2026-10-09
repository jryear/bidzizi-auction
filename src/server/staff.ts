import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "./db";
import { staff, grant, sessionHash, type Identity } from "./auth";
import { body, mutationMode, object, text, uuid, validation, notFound, ApiError, json, unauthenticated } from "./http";
import { testMode } from "./config";
import { draft as validateDraft, emptyEvent, type EventFields, type LotFields } from "./draft";
import { emptyTradeEvent, isTrade, tradeDraft, type TradeEvent, type TradeLot } from "./timing";
import { validateAssetRefs } from "./staff-assets";

type EventRow = { id: string; org_id: string; revision: number; draft: EventFields; updated_at: Date };
async function eventRow(client: PoolClient, id: string, write = false): Promise<EventRow> {
  const result = await client.query<EventRow>(`SELECT id,org_id,revision,draft,updated_at FROM bz_events WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [id]);
  if (!result.rows[0]) throw notFound();
  return result.rows[0];
}
async function packet(client: PoolClient, actor: Identity, e: EventRow) {
  const org = grant(actor,e.org_id);
  const rows = await client.query<{ data: LotFields }>("SELECT data FROM bz_lots WHERE event_id=$1 AND org_id=$2 ORDER BY position",[e.id,e.org_id]);
  return { version: 1, org, event: { ...e.draft, id: e.id, orgId: org.id },
    lots: rows.rows.map(({data},i) => ({ ...data, number: String(i+1).padStart(2,"0"),
      provider: org.name, logo: "saturn", count: 0, current: 0, history: [] })),
    revision: e.revision, savedAt: e.updated_at.toISOString(), release: null };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
async function operation(client: PoolClient, actor: Identity, name: string, requestId: string, payload: unknown, status: number, run: () => Promise<unknown>) {
  const key = `${actor.person.id}:${name}:${requestId}`;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]);
  const hash = createHash("sha256").update(canonical(payload)).digest("hex");
  const prior = await client.query<{ payload_hash: string; response: unknown; status: number }>(
    "SELECT payload_hash,response,status FROM bz_requests WHERE actor_id=$1 AND operation=$2 AND request_id=$3", [actor.person.id,name,requestId]);
  if (prior.rows[0]) {
    if (prior.rows[0].payload_hash !== hash) throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This request was already used for different edits.");
    return { data: prior.rows[0].response, status: prior.rows[0].status };
  }
  const result = await run();
  await client.query("INSERT INTO bz_requests(actor_id,operation,request_id,payload_hash,response,status) VALUES($1,$2,$3,$4,$5::jsonb,$6)",
    [actor.person.id,name,requestId,hash,JSON.stringify(result),status]);
  return { data: result,status };
}
function enabled(request: Request) { if (!testMode(request)) throw unauthenticated(); }
async function freshStaff(client: PoolClient, request: Request, actor: Identity, orgId: string) {
  const row = await client.query(`SELECT 1 FROM bz_sessions s JOIN bz_people p ON p.id=s.person_id
    JOIN bz_staff_grants g ON g.person_id=p.id JOIN bz_orgs o ON o.id=g.org_id
    WHERE s.token_hash=$1 AND p.id=$2 AND o.id=$3 AND s.revoked_at IS NULL
      AND s.expires_at>clock_timestamp() AND p.active AND p.is_test AND g.active`,[sessionHash(request),actor.person.id,orgId]);
  if (!row.rows.length) throw unauthenticated();
}
async function tradePacket(client: PoolClient, actor: Identity, e: EventRow) {
  const org = grant(actor,e.org_id), saved=e.draft as unknown as TradeEvent;
  const rows = await client.query<{data: TradeLot}>("SELECT data FROM bz_lots WHERE event_id=$1 AND org_id=$2 ORDER BY position",[e.id,e.org_id]);
  return { version:2,org,event:{...saved,id:e.id,orgId:org.id},lots:rows.rows.map(({data},i)=>({...data,number:String(i+1).padStart(2,"0"),provider:org.name,logo:"saturn",count:0,current:0,history:[]})),revision:e.revision,savedAt:e.updated_at.toISOString(),release:null };
}
export async function listEvents(request: Request): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const actor = await staff(client,request);
    const rows = await client.query<{ id: string; org_id: string; revision: number; draft: EventFields; updated_at: Date }>(
      "SELECT id,org_id,revision,draft,updated_at FROM bz_events WHERE org_id=ANY($1::uuid[]) ORDER BY updated_at DESC,id", [actor.organizations.map(o => o.id)]);
    return { events: rows.rows.map(e => ({ id:e.id, organizationId:e.org_id, name:e.draft.name, revision:e.revision, savedAt:e.updated_at.toISOString() })) };
  }));
}
export async function getEvent(request: Request, eventId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client => {
    const actor = await staff(client,request);
    const e = await eventRow(client,uuid(eventId));
    return { draft: await packet(client,actor,e) };
  }));
}
export async function createEvent(request: Request): Promise<Response> {
  enabled(request); mutationMode(request);
  const raw = await body(request);
  const result = await transaction(async client => {
    const actor = await staff(client,request);
    const input = object(raw,["organizationId","name","requestId"]);
    const organizationId = uuid(input.organizationId), name = text(input.name,200), requestId = uuid(input.requestId);
    grant(actor,organizationId);
    return operation(client,actor,"create-event",requestId,{organizationId,name},201,async () => {
      const id = randomUUID();
      const created = await client.query<EventRow>(
        "INSERT INTO bz_events(id,org_id,draft,created_by) VALUES($1,$2,$3::jsonb,$4) RETURNING id,org_id,revision,draft,updated_at",
        [id,organizationId,JSON.stringify(emptyEvent(name)),actor.person.id]);
      return { draft: await packet(client,actor,created.rows[0]) };
    });
  });
  return json(result.data,result.status);
}
export async function saveEvent(request: Request, eventId: string): Promise<Response> {
  enabled(request); mutationMode(request);
  const raw = await body(request);
  const result = await transaction(async client => {
    const actor = await staff(client,request);
    const id = uuid(eventId);
    const e = await eventRow(client,id,true);
    grant(actor,e.org_id);
    if (isTrade(e.draft)) throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","Use the versioned event editor for this event.");
    const input = object(raw,["expectedRevision","requestId","draft"]);
    if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 1) throw validation();
    const requestId = uuid(input.requestId), changes = validateDraft(input.draft);
    await freshStaff(client,request,actor,e.org_id);
    const result=await operation(client,actor,`save:${id}`,requestId,{expectedRevision:input.expectedRevision,draft:changes},200,async () => {
      if (e.revision !== input.expectedRevision) throw new ApiError(409,"REVISION_CONFLICT","This draft changed in another session.",{ revision:e.revision });
      const lotIds = changes.lots.map(l => l.id);
      if (lotIds.length) {
        const owners = await client.query<{ event_id:string; org_id:string }>("SELECT event_id,org_id FROM bz_lots WHERE id=ANY($1::uuid[])",[lotIds]);
        if (owners.rows.some(l => l.event_id !== id || l.org_id !== e.org_id)) throw validation();
      }
      await validateAssetRefs(client,request,id,changes);
      await freshStaff(client,request,actor,e.org_id);
      const updated = await client.query<EventRow>(
        "UPDATE bz_events SET draft=$1::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE id=$2 RETURNING id,org_id,revision,draft,updated_at",[JSON.stringify(changes.event),id]);
      await client.query("DELETE FROM bz_lots WHERE event_id=$1 AND org_id=$2",[id,e.org_id]);
      for (const [position,lot] of changes.lots.entries()) {
        try { await client.query("INSERT INTO bz_lots(id,event_id,org_id,position,data) VALUES($1,$2,$3,$4,$5::jsonb)",[lot.id,id,e.org_id,position,JSON.stringify(lot)]); }
        catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "23505") throw validation();
          throw error;
        }
      }
      return { draft: await packet(client,actor,updated.rows[0]) };
    });
    await freshStaff(client,request,actor,e.org_id);
    return result;
  });
  return json(result.data,result.status);
}

export async function createTradeEvent(request: Request): Promise<Response> {
  enabled(request);mutationMode(request);
  const raw=await body(request);
  const result=await transaction(async client=>{
    const actor=await staff(client,request),input=object(raw,["organizationId","name","requestId"]);
    const organizationId=uuid(input.organizationId),name=text(input.name,200),requestId=uuid(input.requestId);
    grant(actor,organizationId);
    return operation(client,actor,"create-event-v2",requestId,{organizationId,name},201,async()=>{
      await freshStaff(client,request,actor,organizationId);
      const id=randomUUID();
      const created=await client.query<EventRow>("INSERT INTO bz_events(id,org_id,draft,created_by) VALUES($1,$2,$3::jsonb,$4) RETURNING id,org_id,revision,draft,updated_at",[id,organizationId,JSON.stringify(emptyTradeEvent(name)),actor.person.id]);
      await freshStaff(client,request,actor,organizationId);
      return {draft:await tradePacket(client,actor,created.rows[0])};
    });
  });return json(result.data,result.status);
}
export async function getTradeEvent(request: Request,eventId: string): Promise<Response> {
  enabled(request);
  return json(await transaction(async client=>{
    const actor=await staff(client,request),e=await eventRow(client,uuid(eventId));
    if (!isTrade(e.draft)) throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","This event uses the historical editor.");
    grant(actor,e.org_id);await freshStaff(client,request,actor,e.org_id);
    return {draft:await tradePacket(client,actor,e)};
  }));
}
export async function saveTradeEvent(request: Request,eventId: string): Promise<Response> {
  enabled(request);mutationMode(request);const raw=await body(request);
  const result=await transaction(async client=>{
    const actor=await staff(client,request),id=uuid(eventId),e=await eventRow(client,id,true);
    if (!isTrade(e.draft)) throw new ApiError(409,"UNSUPPORTED_EVENT_VERSION","This event uses the historical editor.");
    grant(actor,e.org_id);const input=object(raw,["expectedRevision","requestId","draft"]);
    if (!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision as number)<1) throw validation();
    const requestId=uuid(input.requestId),changes=tradeDraft(input.draft);
    await freshStaff(client,request,actor,e.org_id);
    const result=await operation(client,actor,`save-draft-v2:${id}`,requestId,{expectedRevision:input.expectedRevision,draft:changes},200,async()=>{
      if (await client.query("SELECT 1 FROM bz_catalog_approvals WHERE event_id=$1",[id]).then(r=>r.rows.length)) throw new ApiError(409,"PUBLISHED_TERMS_LOCKED","Published terms cannot be edited.");
      if (e.revision!==input.expectedRevision) throw new ApiError(409,"REVISION_CONFLICT","This draft changed in another session.",{revision:e.revision});
      const lotIds=changes.lots.map(l=>l.id);
      if(lotIds.length){const owners=await client.query<{event_id:string;org_id:string}>("SELECT event_id,org_id FROM bz_lots WHERE id=ANY($1::uuid[])",[lotIds]);if(owners.rows.some(l=>l.event_id!==id||l.org_id!==e.org_id))throw validation();}
      await validateAssetRefs(client,request,id,changes);
      await freshStaff(client,request,actor,e.org_id);
      const updated=await client.query<EventRow>("UPDATE bz_events SET draft=$1::jsonb,revision=revision+1,updated_at=clock_timestamp() WHERE id=$2 RETURNING id,org_id,revision,draft,updated_at",[JSON.stringify(changes.event),id]);
      await client.query("DELETE FROM bz_lots WHERE event_id=$1 AND org_id=$2",[id,e.org_id]);
      for(const [position,lot]of changes.lots.entries())await client.query("INSERT INTO bz_lots(id,event_id,org_id,position,data) VALUES($1,$2,$3,$4,$5::jsonb)",[lot.id,id,e.org_id,position,JSON.stringify(lot)]);
      await freshStaff(client,request,actor,e.org_id);
      return {draft:await tradePacket(client,actor,updated.rows[0])};
    });
    await freshStaff(client,request,actor,e.org_id);
    return result;
  });return json(result.data,result.status);
}
