import "server-only";
import { object, text, uuid, validation } from "./http";

const images = new Set(["cabin", "coffee", "dinner", "ceramics", "bicycle", "flowers"].map(s => `assets/lots/${s}.jpg`));
const logos = new Set(["cedar", "coffee", "table", "earth", "spoke", "floral", "harbor", "saturn"]);
export type EventFields = {
  name: string; eyebrow: string; welcome: string; venue: string; cover: string | null;
  coverAlt?: string;
  date: string; start: string; end: string; timezone: string; increment: number | null;
  sponsorsEnabled: boolean; sponsors: { name: string; logo: string; alt?: string }[];
};
export type LotFields = {
  id: string; title: string; short: string; description: string; category: string;
  image: string | null; alt: string; opening: number | null; includes: string[];
  fine: string; windowId: "main" | null;
};
export type DraftFields = { event: EventFields; lots: LotFields[] };
const eventKeys = ["name","eyebrow","welcome","venue","cover","coverAlt","date","start","end","timezone","increment","sponsorsEnabled","sponsors"];
const lotKeys = ["id","title","short","description","category","image","alt","opening","includes","fine","windowId"];
function image(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || (!images.has(value) && !/^asset:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value))) throw validation();
  return value;
}
function amount(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) throw validation();
  return value;
}
function time(value: unknown): string {
  const s = text(value,5);
  if (s && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) throw validation();
  return s;
}
function date(value: unknown): string {
  const s = text(value,10);
  if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T12:00:00Z`)) || new Date(`${s}T12:00:00Z`).toISOString().slice(0,10) !== s)) throw validation();
  return s;
}
export function emptyEvent(name: string): EventFields {
  return { name, eyebrow: "Member auction", welcome: "", venue: "", cover: null,
    date: "", start: "", end: "", timezone: "America/Los_Angeles", increment: null,
    sponsorsEnabled: false, sponsors: [] };
}
export function draft(value: unknown): DraftFields {
  const input = object(value,["event","lots"]), e = object(input.event,eventKeys);
  const timezone = text(e.timezone,100);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw validation(); }
  if (typeof e.sponsorsEnabled !== "boolean" || !Array.isArray(e.sponsors) || e.sponsors.length > 20) throw validation();
  const event: EventFields = {
    name: text(e.name,200), eyebrow: text(e.eyebrow,200), welcome: text(e.welcome,5000),
    venue: text(e.venue,300), cover: image(e.cover),
    ...(e.coverAlt===undefined?{}:{coverAlt:text(e.coverAlt,300)}),
    date: date(e.date), start: time(e.start), end: time(e.end),
    timezone, increment: amount(e.increment), sponsorsEnabled: e.sponsorsEnabled,
    sponsors: e.sponsors.map(value => {
      const s = object(value,["name","logo","alt"]), logo = text(s.logo,100);
      if (!logos.has(logo) && !/^asset:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(logo)) throw validation();
      if (logo.startsWith("asset:") && (typeof s.alt!=="string" || !s.alt.trim() || s.alt.length>300)) throw validation();
      return { name: text(s.name,200), logo,...(s.alt===undefined?{}:{alt:text(s.alt,300)}) };
    }),
  };
  if (!Array.isArray(input.lots) || input.lots.length > 100) throw validation();
  const lots: LotFields[] = input.lots.map(value => {
    const l = object(value,lotKeys);
    if (!Array.isArray(l.includes) || l.includes.length > 30 || (l.windowId !== null && l.windowId !== "main")) throw validation();
    return { id: uuid(l.id), title: text(l.title,200), short: text(l.short,500), description: text(l.description,10000),
      category: text(l.category,100), image: image(l.image), alt: text(l.alt,300), opening: amount(l.opening),
      includes: l.includes.map(v => text(v,500)), fine: text(l.fine,5000), windowId: l.windowId };
  });
  if (event.cover?.startsWith("asset:") && (!event.coverAlt || !event.coverAlt.trim())) throw validation();
  if (lots.some(l=>l.image?.startsWith("asset:")&&!l.alt.trim())) throw validation();
  if (new Set(lots.map(l => l.id)).size !== lots.length) throw validation();
  return { event, lots };
}
