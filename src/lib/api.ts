"use client";

export type ApiResult<T = any> = { ok: boolean; status: number; data: T };
export class Offline extends Error { constructor() { super("You're offline or the connection dropped."); } }

/** JSON request. Throws Offline when no response arrived (the request may or may not have landed). */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new Offline(); }
  let data: any = null;
  try { data = await response.json(); } catch { /* empty body */ }
  return { ok: response.ok, status: response.status, data };
}
export const errorText = (r: ApiResult) => r.data?.error?.message ?? "Something went wrong. Try again.";
export const newId = () => crypto.randomUUID();

/** Parse "$1,250.50" / "1250" into cents, or null. */
export function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [d, c = ""] = clean.split(".");
  const cents = Number(d) * 100 + Number(c.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export const dollarsInput = (minor: number) => (minor % 100 ? (minor / 100).toFixed(2) : String(minor / 100));

export function fmtTime(iso: string | Date, timeZone?: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function fmtClock(iso: string | Date, timeZone?: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}
/** "in 12m", "in 3h 5m", "2d" — relative to server time. */
export function untilText(targetIso: string | Date, nowMs: number) {
  let s = Math.max(0, Math.round((new Date(targetIso).getTime() - nowMs) / 1000));
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** Convert between an instant and a datetime-local value in a given time zone. */
function tzOffsetMs(at: number, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(at)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at / 1000) * 1000;
}
export function toLocalInput(iso: string | Date | null, timeZone: string) {
  if (!iso) return "";
  const at = new Date(iso).getTime();
  return new Date(at + tzOffsetMs(at, timeZone)).toISOString().slice(0, 16);
}
export function fromLocalInput(value: string, timeZone: string): string | null {
  if (!value) return null;
  const nominal = Date.parse(value + ":00Z");
  if (Number.isNaN(nominal)) return null;
  let guess = nominal - tzOffsetMs(nominal, timeZone);
  guess = nominal - tzOffsetMs(guess, timeZone);
  return new Date(guess).toISOString();
}
export const initials = (text: string) => text.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";
