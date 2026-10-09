import "server-only";
import { sessionHash } from "./auth";
import { testMode } from "./config";
import { transaction } from "./db";
import { ApiError, body, forbidden, json, mutationMode, notFound, object, unauthenticated, uuid, validation } from "./http";

type Entry = { eventId: string; enabled: boolean; entryRevision: number; updatedAt: string | null };
type Result = { error?: string; currentEntryRevision?: number; entry: Entry; serverNow: string;
  replayed?: boolean; operation?: { requestId: string; appliedRevision: number; enabled: boolean; appliedAt: string } };

function result(value: Result, origin: string, mutation = false) {
  if (value.error === "UNAUTHENTICATED") throw unauthenticated();
  if (value.error === "FORBIDDEN") throw forbidden();
  if (value.error === "NOT_FOUND") throw notFound();
  if (value.error === "VALIDATION") throw validation();
  if (value.error === "ENTRY_REQUEST_CONFLICT") throw new ApiError(409, value.error, "This entry request was already used for a different update.");
  if (value.error === "ENTRY_REVISION_CONFLICT") throw new ApiError(409, value.error, "Entry changed in another session. Check its current state.", { currentEntryRevision: value.currentEntryRevision });
  if (value.error || !value.entry || typeof value.serverNow !== "string") throw new Error("Entry response unavailable.");
  const e = value.entry;
  // Construct the public allowlist explicitly; database credentials and actor
  // authority never become part of a control or share response.
  const packet = { entry: { eventId: e.eventId, enabled: e.enabled, entryRevision: e.entryRevision,
    updatedAt: e.updatedAt, shareUrl: `${origin}/events/${e.eventId}` }, serverNow: value.serverNow };
  if (!mutation) return packet;
  if (!value.operation || typeof value.replayed !== "boolean") throw new Error("Entry operation unavailable.");
  const op = value.operation;
  return { ...packet, replayed: value.replayed, operation: { requestId: op.requestId,
    appliedRevision: op.appliedRevision, enabled: op.enabled, appliedAt: op.appliedAt } };
}

export async function getEventEntry(request: Request, eventId: string): Promise<Response> {
  const mode = testMode(request), hash = sessionHash(request);
  if (!mode || !hash) throw unauthenticated();
  const id = uuid(eventId);
  return json(await transaction(async client => {
    const row = await client.query<{ result: Result }>("SELECT public.bz_staff_event_entry_read($1,$2) AS result", [hash, id]);
    return result(row.rows[0].result, mode.origin);
  }));
}

export async function setEventEntry(request: Request, eventId: string): Promise<Response> {
  if (!testMode(request)) throw unauthenticated();
  const mode = mutationMode(request), hash = sessionHash(request);
  if (!hash) throw unauthenticated();
  const id = uuid(eventId), input = object(await body(request), ["expectedEntryRevision", "enabled", "requestId"]);
  if (!Number.isSafeInteger(input.expectedEntryRevision) || (input.expectedEntryRevision as number) < 0 ||
      (input.expectedEntryRevision as number) > 2147483647 || typeof input.enabled !== "boolean") throw validation();
  const requestId = uuid(input.requestId);
  return json(await transaction(async client => {
    const row = await client.query<{ result: Result }>("SELECT public.bz_staff_event_entry_set($1,$2,$3,$4,$5) AS result",
      [hash, id, input.expectedEntryRevision, input.enabled, requestId]);
    return result(row.rows[0].result, mode.origin, true);
  }));
}
