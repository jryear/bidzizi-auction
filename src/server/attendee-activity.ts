import "server-only";
import { sessionHash } from "./auth";
import { testMode } from "./config";
import { transaction } from "./db";
import { ApiError, body, forbidden, json, mutationMode, object, unauthenticated, uuid, validation } from "./http";

export function activityResult(value: Record<string, unknown>): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Activity response unavailable.");
  const code = value.error;
  if (typeof code !== "string") return value;
  if (code === "UNAUTHENTICATED") throw unauthenticated();
  if (code === "FORBIDDEN") throw forbidden();
  if (code === "VALIDATION") throw validation();
  const statuses: Record<string, number> = { NOT_FOUND: 404, IDEMPOTENCY_CONFLICT: 409,
    ACTOR_CHANGED: 409, DONATIONS_DISABLED: 409, NONPROFIT_CHANGED: 409,
    VERSION_CONFLICT: 409, DONATION_POLICY_PENDING: 409, DONATIONS_UNAVAILABLE: 409 };
  if (!statuses[code]) throw new Error("Activity response unavailable.");
  const messages: Record<string, string> = {
    NOT_FOUND: "This record is not available to this account.",
    IDEMPOTENCY_CONFLICT: "This request was already used for different details.",
    ACTOR_CHANGED: "Your account changed. Review this action again.",
    DONATIONS_DISABLED: "Donations are not currently available.",
    DONATIONS_UNAVAILABLE: "Donations are outside their configured availability.",
    NONPROFIT_CHANGED: "This nonprofit changed. Review the donation again.",
    VERSION_CONFLICT: "This nonprofit changed in another session. Refresh before saving.",
    DONATION_POLICY_PENDING: "Donation cap and availability must be configured.",
  };
  throw new ApiError(statuses[code], code, messages[code]);
}

export async function memberOperation(request: Request, eventId: string,
  operation: "watching" | "set" | "receipt" | "my-bids", input: Record<string, unknown> = {}) {
  if (!testMode(request)) throw unauthenticated();
  const hash = sessionHash(request);
  if (!hash) throw unauthenticated();
  return transaction(async client => {
    const row = await client.query<{ result: Record<string, unknown> }>(
      "SELECT public.bz_attendee_activity($1,$2,$3,$4::jsonb) AS result",
      [hash, uuid(eventId), operation, JSON.stringify(input)]);
    return activityResult(row.rows[0].result);
  });
}

export async function getWatching(request: Request, eventId: string): Promise<Response> {
  return json(await memberOperation(request, eventId, "watching"));
}
export async function setWatching(request: Request, eventId: string): Promise<Response> {
  mutationMode(request);
  const input = object(await body(request), ["actorId", "requestId", "lotId", "watching"]);
  if (typeof input.watching !== "boolean") throw validation();
  return json(await memberOperation(request, eventId, "set", {
    actorId: uuid(input.actorId), requestId: uuid(input.requestId), lotId: uuid(input.lotId), watching: input.watching,
  }));
}
export async function getWatchReceipt(request: Request, eventId: string, requestId: string): Promise<Response> {
  return json(await memberOperation(request, eventId, "receipt", { requestId: uuid(requestId) }));
}
export async function getMyBids(request: Request, eventId: string): Promise<Response> {
  return json(await memberOperation(request, eventId, "my-bids"));
}
