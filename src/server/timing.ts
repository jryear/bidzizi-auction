import "server-only";
import { object, text, uuid, validation } from "./http";

export const TRADE_RULESET = "saturn-trade-tiered-v1";
export const TRADE_DENOMINATION = "SATURN_TRADE_DOLLAR_SYNTHETIC_V1";
export const TRADE_CAP = 1_000_000_000;
export const TRADE_TIERS = [
  { belowMinor: 50_000, raiseMinor: 2_500 },
  { belowMinor: 100_000, raiseMinor: 5_000 },
  { belowMinor: 250_000, raiseMinor: 10_000 },
  { belowMinor: null, raiseMinor: 25_000 },
] as const;

export type TradeTiming = { startDate: string; start: string; endDate: string; end: string; timezone: string };
export type TradeRules = { rulesetId: typeof TRADE_RULESET; denomination: typeof TRADE_DENOMINATION; scale: 100; amountCapMinor: typeof TRADE_CAP; tiers: { belowMinor: number | null; raiseMinor: number }[] };
export type TradeEvent = { version: 2; name: string; eyebrow: string; welcome: string; venue: string; cover: string | null; coverAlt?: string; timing: TradeTiming; rules: TradeRules; sponsorsEnabled: boolean; sponsors: { name: string; logo: string | null; alt?: string }[] };
export type TradeLot = { id: string; title: string; short: string; description: string; category: string; image: string | null; alt: string; opening: number | null; includes: string[]; fine: string; fixedRaiseMinor: number | null };
export type TradeDraft = { event: TradeEvent; lots: TradeLot[] };

const fixedPhotos = new Set(["cabin", "coffee", "dinner", "ceramics", "bicycle", "flowers"].map(s => `assets/lots/${s}.jpg`));
const fixedLogos = new Set(["cedar", "coffee", "table", "earth", "spoke", "floral", "harbor", "saturn"]);
export const isTrade = (value: unknown): value is TradeEvent => Boolean(value && typeof value === "object" && (value as {version?: unknown}).version === 2);
export const defaultRules = (): TradeRules => ({ rulesetId: TRADE_RULESET, denomination: TRADE_DENOMINATION, scale: 100, amountCapMinor: TRADE_CAP, tiers: TRADE_TIERS.map(t => ({ ...t })) });
export function emptyTradeEvent(name: string): TradeEvent {
  return { version: 2, name, eyebrow: "Member auction", welcome: "", venue: "", cover: null,
    timing: { startDate: "", start: "", endDate: "", end: "", timezone: "America/Los_Angeles" },
    rules: defaultRules(), sponsorsEnabled: false, sponsors: [] };
}
export function photoRef(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !(fixedPhotos.has(value) || /^asset:[a-f0-9-]{36}$/.test(value))) throw validation();
  if (value.startsWith("asset:")) uuid(value.slice(6));
  return value;
}
export function logoRef(value: unknown): string | null {
  if (value === null || value === "") return null;
  const v = text(value, 100);
  if (!fixedLogos.has(v) && !/^asset:[a-f0-9-]{36}$/.test(v)) throw validation();
  if (v.startsWith("asset:")) uuid(v.slice(6));
  return v;
}
function amount(value: unknown, allowNull = true): number | null {
  if (value === null && allowNull) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > TRADE_CAP) throw validation();
  return value;
}
function day(value: unknown): string {
  const s = text(value, 10);
  if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s + "T12:00:00Z")) || new Date(s + "T12:00:00Z").toISOString().slice(0, 10) !== s)) throw validation();
  return s;
}
function minute(value: unknown): string {
  const s = text(value, 5);
  if (s && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) throw validation();
  return s;
}
export function tradeDraft(value: unknown): TradeDraft {
  const source = object(value, ["event", "lots"]);
  const e = object(source.event, ["version", "name", "eyebrow", "welcome", "venue", "cover", "coverAlt", "timing", "rules", "sponsorsEnabled", "sponsors"]);
  if (e.version !== undefined && e.version !== 2) throw validation();
  const t = object(e.timing, ["startDate", "start", "endDate", "end", "timezone"]);
  const timezone = text(t.timezone, 100);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw validation(); }
  const timing: TradeTiming = { startDate: day(t.startDate), start: minute(t.start), endDate: day(t.endDate), end: minute(t.end), timezone };
  if ([timing.startDate,timing.start,timing.endDate,timing.end].every(Boolean)) resolveWindow(timing);
  const r = object(e.rules, ["rulesetId", "denomination", "scale", "amountCapMinor", "tiers"]);
  if (r.rulesetId !== TRADE_RULESET || r.denomination !== TRADE_DENOMINATION || r.scale !== 100 || r.amountCapMinor !== TRADE_CAP || !Array.isArray(r.tiers) || r.tiers.length !== 4) throw validation();
  const tiers = r.tiers.map((v, i) => { const row = object(v, ["belowMinor", "raiseMinor"]); if (row.belowMinor !== TRADE_TIERS[i].belowMinor || row.raiseMinor !== TRADE_TIERS[i].raiseMinor) throw validation(); return { belowMinor: row.belowMinor as number | null, raiseMinor: row.raiseMinor as number }; });
  if (typeof e.sponsorsEnabled !== "boolean" || !Array.isArray(e.sponsors) || e.sponsors.length > 20) throw validation();
  const event: TradeEvent = { version: 2, name: text(e.name, 200), eyebrow: text(e.eyebrow, 200), welcome: text(e.welcome, 5000), venue: text(e.venue, 300), cover: photoRef(e.cover),
    ...(e.coverAlt === undefined ? {} : { coverAlt: text(e.coverAlt, 300) }), timing,
    rules: { rulesetId: TRADE_RULESET, denomination: TRADE_DENOMINATION, scale: 100, amountCapMinor: TRADE_CAP, tiers },
    sponsorsEnabled: e.sponsorsEnabled, sponsors: e.sponsors.map(v => { const s = object(v, ["name", "logo", "alt"]), logo=logoRef(s.logo);
      if (logo?.startsWith("asset:") && (typeof s.alt!=="string" || !s.alt.trim() || s.alt.length>300)) throw validation();
      return { name: text(s.name, 200), logo, ...(s.alt===undefined?{}:{alt:text(s.alt,300)}) }; }) };
  if (!Array.isArray(source.lots) || source.lots.length > 100) throw validation();
  const lots: TradeLot[] = source.lots.map(v => {
    const l = object(v, ["id", "title", "short", "description", "category", "image", "alt", "opening", "includes", "fine", "fixedRaiseMinor", "windowId"]);
    if (l.windowId !== undefined && l.windowId !== null && l.windowId !== "main") throw validation();
    if (!Array.isArray(l.includes) || l.includes.length > 30) throw validation();
    return { id: uuid(l.id), title: text(l.title, 200), short: text(l.short, 500), description: text(l.description, 10_000), category: text(l.category, 100), image: photoRef(l.image), alt: text(l.alt, 300), opening: amount(l.opening),
      includes: l.includes.map(x => text(x, 500)), fine: text(l.fine, 5000), fixedRaiseMinor: l.fixedRaiseMinor === undefined ? null : amount(l.fixedRaiseMinor, true) };
  });
  if (event.cover?.startsWith("asset:") && (!event.coverAlt || !event.coverAlt.trim())) throw validation();
  if (lots.some(l=>l.image?.startsWith("asset:")&&!l.alt.trim())) throw validation();
  if (new Set(lots.map(l => l.id)).size !== lots.length) throw validation();
  return { event, lots };
}

/** Reject nonexistent and ambiguous local minutes rather than guessing an offset. */
export function localInstant(date: string, time: string, timezone: string): Date {
  if (!date || !time) throw validation();
  const local = `${day(date)}T${minute(time)}:00.000Z`, nominal = Date.parse(local);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString() !== local) throw validation();
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); }
  catch { throw validation(); }
  const projected = (at: number) => { const p = Object.fromEntries(format.formatToParts(new Date(at)).map(part => [part.type, part.value])); return `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`; };
  const offsets = new Set<number>();
  for (let delta = -36 * 3_600_000; delta <= 36 * 3_600_000; delta += 1_800_000) { const sample = nominal + delta; offsets.add(Date.parse(projected(sample)) - sample); }
  const candidates = [...offsets].map(offset => nominal - offset).filter(at => projected(at) === local);
  if (candidates.length !== 1) throw validation();
  return new Date(candidates[0]);
}
export function resolveWindow(timing: TradeTiming): { opensAt: Date; closesAt: Date } {
  const opensAt = localInstant(timing.startDate, timing.start, timing.timezone);
  const closesAt = localInstant(timing.endDate, timing.end, timing.timezone);
  if (closesAt <= opensAt) throw validation();
  return { opensAt, closesAt };
}
export function raiseFor(current: number, fixedRaiseMinor: number | null): number {
  return fixedRaiseMinor ?? (current < 50_000 ? 2_500 : current < 100_000 ? 5_000 : current < 250_000 ? 10_000 : 25_000);
}
export function minimumFor(current: number | null, opening: number, fixedRaiseMinor: number | null): number | null {
  const next = current === null ? opening : current + raiseFor(current, fixedRaiseMinor);
  return next <= TRADE_CAP ? next : null;
}
