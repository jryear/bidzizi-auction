/** Private display projections. Only consumed, validated fields survive the wire. */
export type Phase = "scheduled" | "open" | "closed";
export type Organization = { id: string; name: string; initials: string };
export type Lot = { id: string; number: string; title: string; short: string; category: string; image: string | null; alt: string; opening: number };
export type Catalog = {
  event: { id: string; name: string; eyebrow: string; welcome: string; venue: string; cover: string | null; sponsorsEnabled: boolean; sponsors: { name: string }[] };
  organization: Organization; schedule: { opensAt: string; closesAt: string }; phase: Phase; serverNow: string;
  catalog: { approvalId: string; sourceRevision: number; lots: Lot[] } | null;
};
export type Standing = { lotId: string; releaseId: string; phase: "open" | "closed"; currentAmountMinor: number | null; acceptedBidCount: number; version: number; serverNow: string; updatedAt: string };
export type Row = { state: "current" | "stale" | "denied" | "unsupported" | "unavailable"; standing: Standing | null };
export class InvalidPayload extends Error {}
export class UnsupportedPayload extends InvalidPayload {}
export class ReadFailure extends Error {
  constructor(readonly status: number, readonly code: string = "") { super("This read could not be confirmed."); }
}
function requireValue(value: unknown): asserts value { if (!value) throw new InvalidPayload("This response could not be verified."); }
function object(value: unknown): Record<string, unknown> { requireValue(value && typeof value === "object" && !Array.isArray(value)); return value as Record<string, unknown>; }
function text(value: unknown, max: number): string { requireValue(typeof value === "string" && value.length <= max); return value as string; }
function id(value: unknown): string { const result = text(value, 36); requireValue(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result)); return result.toLowerCase(); }
function integer(value: unknown, min: number, max = 1_000_000_000): number { requireValue(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max); return value as number; }
function timestamp(value: unknown): string { const result = text(value, 30); requireValue(Number.isFinite(Date.parse(result)) && new Date(result).toISOString() === result); return result; }
function phase(value: unknown): Phase { requireValue(value === "scheduled" || value === "open" || value === "closed"); return value as Phase; }
const images = new Set(["cabin", "coffee", "dinner", "ceramics", "bicycle", "flowers"].map(name => `assets/lots/${name}.jpg`));
function image(value: unknown): string | null { if (value === null) return null; requireValue(typeof value === "string" && images.has(value)); return value as string; }
function organization(value: unknown): Organization { const raw = object(value); return { id: id(raw.id), name: text(raw.name, 200), initials: text(raw.initials, 20) }; }

export function parseSession(value: unknown): string | null {
  const raw = object(value); requireValue(typeof raw.authenticated === "boolean" && typeof raw.testMode === "boolean");
  if (!raw.authenticated) return null;
  requireValue(raw.testMode === true); return id(object(raw.person).id);
}
export function parseCatalog(value: unknown, eventId: string): Catalog {
  const raw = object(value), event = object(raw.event), org = organization(raw.organization), schedule = object(raw.schedule);
  const eventKey = id(event.id); requireValue(eventKey === eventId.toLowerCase());
  const opensAt = timestamp(schedule.opensAt), closesAt = timestamp(schedule.closesAt), serverNow = timestamp(raw.serverNow), currentPhase = phase(raw.phase);
  requireValue(Date.parse(opensAt) < Date.parse(closesAt) && raw.biddingEnabled === false);
  requireValue(typeof event.sponsorsEnabled === "boolean" && Array.isArray(event.sponsors) && event.sponsors.length <= 20);
  const sponsors = event.sponsors.map(value => ({ name: text(object(value).name, 200) }));
  let catalog: Catalog["catalog"] = null;
  if (currentPhase === "scheduled") requireValue(raw.catalog === null);
  else {
    const selected = object(raw.catalog); requireValue(Array.isArray(selected.lots) && selected.lots.length <= 100);
    const lots = selected.lots.map(value => {
      const lot = object(value); requireValue(organization(lot.provider).id === org.id && lot.windowId === "main");
      return { id: id(lot.id), number: text(lot.number, 10), title: text(lot.title, 200), short: text(lot.short, 500), category: text(lot.category, 100), image: image(lot.image), alt: text(lot.alt, 300), opening: integer(lot.opening, 1) };
    });
    requireValue(new Set(lots.map(lot => lot.id)).size === lots.length);
    catalog = { approvalId: id(selected.approvalId), sourceRevision: integer(selected.sourceRevision, 1), lots };
  }
  return { event: { id: eventKey, name: text(event.name, 200), eyebrow: text(event.eyebrow, 200), welcome: text(event.welcome, 5000), venue: text(event.venue, 300), cover: image(event.cover), sponsorsEnabled: event.sponsorsEnabled, sponsors }, organization: org, schedule: { opensAt, closesAt }, phase: currentPhase, serverNow, catalog };
}
export function parseStanding(value: unknown, catalog: Catalog, lot: Lot): Standing {
  const raw = object(object(value).standing);
  requireValue(catalog.catalog && id(raw.releaseId) === catalog.catalog.approvalId && id(raw.lotId) === lot.id);
  if (raw.rulesetId !== "staging-usd-manual-v1" || raw.currency !== "USD" || raw.incrementMinor !== 2500 || raw.amountCapMinor !== 1_000_000_000) throw new UnsupportedPayload("Unsupported test standing.");
  const currentPhase = phase(raw.phase); requireValue(currentPhase !== "scheduled");
  const amount = raw.currentAmountMinor === null ? null : integer(raw.currentAmountMinor, lot.opening);
  const count = integer(raw.acceptedBidCount, 0, 2_147_483_647), version = integer(raw.version, 0, 2_147_483_647);
  requireValue(amount === null ? count === 0 && version === 0 : count > 0 && version > 0);
  const serverNow = timestamp(raw.serverNow), updatedAt = timestamp(raw.updatedAt); requireValue(Date.parse(updatedAt) <= Date.parse(serverNow));
  return { lotId: lot.id, releaseId: catalog.catalog!.approvalId, phase: currentPhase, currentAmountMinor: amount, acceptedBidCount: count, version, serverNow, updatedAt };
}
export async function readJSON(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) });
  if (!response.ok) {
    let code = "";
    try { const body = object(await response.json()); const error = object(body.error); if (error.code === "UNSUPPORTED_RULESET") code = "UNSUPPORTED_RULESET"; } catch {}
    throw new ReadFailure(response.status, code);
  }
  try { return await response.json(); } catch { throw new InvalidPayload("This response could not be verified."); }
}
export function transient(error: unknown): boolean { return !(error instanceof InvalidPayload) && (!(error instanceof ReadFailure) || error.status >= 500 || error.status === 429); }
export function money(minor: number): string { return `$${Math.floor(minor / 100).toLocaleString("en-US")}.${String(minor % 100).padStart(2, "0")}`; }
export function utc(iso: string): string { return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(iso)) + " UTC"; }
export function asset(path: string): string { return `/staging-bidder-preview/${path}`; }
