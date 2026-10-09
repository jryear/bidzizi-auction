import "server-only";
import { sessionHash } from "./auth";
import { testMode } from "./config";
import { transaction } from "./db";
import { activityResult } from "./attendee-activity";
import { body, json, mutationMode, object, text, unauthenticated, uuid, validation } from "./http";

async function operation(request: Request, eventId: string, staff: boolean,
  action: string, input: Record<string, unknown> = {}) {
  if (!testMode(request)) throw unauthenticated();
  const hash = sessionHash(request);
  if (!hash) throw unauthenticated();
  return transaction(async client => {
    const sql = staff ? "SELECT public.bz_donation_staff($1,$2,$3,$4::jsonb) AS result"
      : "SELECT public.bz_donation_member($1,$2,$3,$4::jsonb) AS result";
    const row = await client.query<{ result: Record<string, unknown> }>(sql,
      [hash, uuid(eventId), action, JSON.stringify(input)]);
    return activityResult(row.rows[0].result);
  });
}
export async function getDonationContext(request: Request, eventId: string): Promise<Response> {
  return json(await operation(request, eventId, false, "context"));
}
export async function pledgeDonation(request: Request, eventId: string): Promise<Response> {
  mutationMode(request);
  const input = object(await body(request), ["actorId", "requestId", "businessId", "nonprofitId", "nonprofitVersion", "amountMinor"]);
  if (!Number.isSafeInteger(input.nonprofitVersion) || (input.nonprofitVersion as number) < 1 ||
    (input.nonprofitVersion as number) >= 2147483647 || !Number.isSafeInteger(input.amountMinor)) throw validation();
  return json(await operation(request, eventId, false, "submit", {
    actorId: uuid(input.actorId), requestId: uuid(input.requestId), businessId: uuid(input.businessId),
    nonprofitId: uuid(input.nonprofitId), nonprofitVersion: input.nonprofitVersion, amountMinor: input.amountMinor,
  }), 201);
}
export async function getDonationReceipt(request: Request, eventId: string, requestId: string): Promise<Response> {
  return json(await operation(request, eventId, false, "receipt", { requestId: uuid(requestId) }));
}
export async function getStaffDonations(request: Request, eventId: string): Promise<Response> {
  return json(await operation(request, eventId, true, "read"));
}
export async function setStaffDonations(request: Request, eventId: string): Promise<Response> {
  mutationMode(request);
  const input = object(await body(request), ["enabled", "amountCapMinor", "availability"]);
  if (typeof input.enabled !== "boolean") throw validation();
  const settings: Record<string, unknown> = { enabled: input.enabled };
  if ("amountCapMinor" in input) {
    if (input.amountCapMinor !== null && (!Number.isSafeInteger(input.amountCapMinor) || (input.amountCapMinor as number) < 1)) throw validation();
    settings.amountCapMinor = input.amountCapMinor;
  }
  if ("availability" in input) {
    if (input.availability === null) settings.availability = null;
    else {
      const availability = object(input.availability, ["mode", "opensAt", "closesAt"]);
      if (availability.mode === "any-time") {
        if ("opensAt" in availability || "closesAt" in availability) throw validation();
        settings.availability = { mode: "any-time" };
      } else if (availability.mode === "window") {
        const opensAt = text(availability.opensAt, 40), closesAt = text(availability.closesAt, 40);
        const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
        if (!iso.test(opensAt) || !iso.test(closesAt) || !Number.isFinite(Date.parse(opensAt)) ||
          !Number.isFinite(Date.parse(closesAt)) || Date.parse(opensAt) >= Date.parse(closesAt)) throw validation();
        for (const instant of [opensAt, closesAt]) {
          const expected = instant.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`);
          if (new Date(instant).toISOString() !== expected) throw validation();
        }
        settings.availability = { mode: "window", opensAt: new Date(opensAt).toISOString(), closesAt: new Date(closesAt).toISOString() };
      } else throw validation();
    }
  }
  return json(await operation(request, eventId, true, "settings", settings));
}
function nonprofitFields(input: Record<string, unknown>) {
  const name = text(input.name, 200), description = text(input.description, 5000);
  if (!name.trim()) throw validation();
  return { name, description };
}
export async function createNonprofit(request: Request, eventId: string): Promise<Response> {
  mutationMode(request);
  const input = object(await body(request), ["requestId", "name", "description"]);
  return json(await operation(request, eventId, true, "create", { requestId: uuid(input.requestId), ...nonprofitFields(input) }), 201);
}
export async function editNonprofit(request: Request, eventId: string, nonprofitId: string): Promise<Response> {
  mutationMode(request);
  const input = object(await body(request), ["expectedVersion", "name", "description", "active"]);
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1 ||
    (input.expectedVersion as number) >= 2147483647 || typeof input.active !== "boolean") throw validation();
  return json(await operation(request, eventId, true, "edit", { nonprofitId: uuid(nonprofitId),
    expectedVersion: input.expectedVersion, active: input.active, ...nonprofitFields(input) }));
}
type Receipt = { id: string; requestId: string; eventId: string; actorName: string; businessName: string;
  nonprofit: { id: string; name: string; version: number }; amountMinor: number; unit: string; scale: number;
  status: string; recordedAt: string };
function cell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function exportDonations(request: Request, eventId: string): Promise<Response> {
  const data = await operation(request, eventId, true, "read");
  const receipts = data.pledges as Receipt[];
  const header = ["id", "request_id", "event_id", "actor_name", "business_name", "nonprofit_id", "nonprofit_name",
    "nonprofit_version", "amount_minor", "amount", "unit", "scale", "status", "recorded_at"];
  const rows = receipts.map(r => [r.id, r.requestId, r.eventId, r.actorName, r.businessName, r.nonprofit.id,
    r.nonprofit.name, r.nonprofit.version, r.amountMinor,
    `${Math.floor(r.amountMinor / 100)}.${String(r.amountMinor % 100).padStart(2, "0")}`, r.unit, r.scale, r.status, r.recordedAt]);
  return new Response([header, ...rows].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n", { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="donations-${uuid(eventId)}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
  } });
}
