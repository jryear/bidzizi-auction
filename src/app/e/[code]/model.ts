// The participant's view model. One status vocabulary: every card, row, page, ticket and sheet renders from `standing()`,
// so an item can never say two different things in two places.
import { fmtClock } from "../../../lib/api";

export type Phase = "scheduled" | "open" | "closed";
export type Item = {
  id: string; position: number; title: string; short: string; description: string; category: string; donor: string; imageUrl: string | null;
  openingMinor: number; opensAt: string; closesAt: string; phase: Phase;
  currentMinor: number | null; bidCount: number; leader: { name: string; business: string; isMe: boolean } | null;
  minimumNextMinor: number | null; incrementMinor: number; watching: boolean; myHighestMinor: number | null; myBidCount: number;
  award: { status: string; winner: { name: string; business: string } | null; amountMinor: number | null; isMe: boolean } | null;
};
export type Recipient = { id: string; name: string; description: string; logoUrl: string | null };
export type EventInfo = {
  id: string; code: string; name: string; welcome: string; venue: string; timezone: string; theme?: string; coverUrl: string | null;
  startsAt: string; endsAt: string; accessEndsAt?: string; entryOpen: boolean; phase: "upcoming" | "open" | "closed";
  sponsors: { name: string; logoUrl: string | null }[];
  donations: { enabled: boolean; open: boolean; deadline: string | null; capMinor: number; recipients: Recipient[] };
};
export type Pledge = { id: string; recipientName: string; amountMinor: number; recordedAt: string };
export type Me = { id: string; displayName: string; businessName: string; canBid: boolean; winnerInstructions: string; pledges: Pledge[] };
export type Snapshot = { serverNow: string; preview?: boolean; event: EventInfo; items: Item[]; me: Me | null };
export type Receipt = {
  requestId: string; itemId: string; amountMinor: number; accepted: boolean; reason: string | null; decidedAt?: string;
  currentMinor: number | null; minimumNextMinor: number | null; leading?: boolean;
};
export type PendingBid = { requestId: string; itemId: string; amountMinor: number };

export type Tone = "green" | "red" | "amber" | "hatch" | "marigold" | "dashed" | "grey" | "ink" | "none";
export type Standing = {
  key: "leading" | "outbid" | "won" | "awaiting" | "lost" | "sold" | "closed" | "scheduled" | "open" | "unconfirmed";
  label: string; tone: Tone; mine: boolean;
};

export const REASONS: Record<string, string> = {
  NOT_AVAILABLE: "This item isn't available for bidding.",
  NOT_OPEN: "Bidding on this item hasn't opened yet.",
  CLOSED: "Bidding on this item closed before your bid arrived.",
  BIDDING_PAUSED: "Your bidding is paused. Talk to the event staff.",
  ALREADY_LEADING: "You're already the highest bidder.",
  BELOW_MINIMUM: "Someone bid first, so the minimum went up.",
  AMOUNT_LIMIT: "This amount is above the limit.",
};

export function standing(item: Item, unconfirmed = false): Standing {
  if (unconfirmed) return { key: "unconfirmed", label: "Unconfirmed", tone: "dashed", mine: true };
  if (item.phase === "scheduled") return { key: "scheduled", label: `Opens ${fmtClock(item.opensAt)}`, tone: "grey", mine: false };
  if (item.phase === "open") {
    if (item.leader?.isMe) return { key: "leading", label: "You're leading", tone: "green", mine: true };
    if (item.myBidCount > 0) return { key: "outbid", label: "Outbid", tone: "red", mine: true };
    return { key: "open", label: "Bidding open", tone: "none", mine: false };
  }
  if (item.award?.isMe) return { key: "won", label: "You won", tone: "marigold", mine: true };
  if (!item.award && item.leader?.isMe) return { key: "awaiting", label: "Staff confirming", tone: "hatch", mine: true };
  if (item.myBidCount > 0) return { key: "lost", label: item.award && item.award.status !== "no_winner" ? "Won by another bidder" : "Bidding closed", tone: "grey", mine: true };
  if (item.award && item.award.status !== "no_winner") return { key: "sold", label: "Sold", tone: "grey", mine: false };
  return { key: "closed", label: "Bidding closed", tone: "grey", mine: false };
}

/** Closing soon: under ten minutes of an open item's time left (server time). */
export const SOON_MS = 10 * 60_000;
export function msLeft(item: Item, serverNow: number) { return new Date(item.closesAt).getTime() - serverNow; }
export function closingSoon(item: Item, serverNow: number) { const left = msLeft(item, serverNow); return item.phase === "open" && left > 0 && left <= SOON_MS; }

/** "2h 14m", "14m", or "04:59" inside the last ten minutes. */
export function countdown(targetIso: string, serverNow: number) {
  let s = Math.max(0, Math.round((new Date(targetIso).getTime() - serverNow) / 1000));
  if (s <= 600) return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export const lotNo = (item: Pick<Item, "position">) => String(item.position + 1).padStart(2, "0");
export const shown = (item: Item) => item.currentMinor ?? item.openingMinor;

export type Sort = "order" | "low" | "ending";
export function sortItems(items: Item[], sort: Sort, serverNow: number): Item[] {
  const list = [...items];
  if (sort === "low") list.sort((a, b) => shown(a) - shown(b) || a.position - b.position);
  if (sort === "ending") {
    const rank = (i: Item) => i.phase === "open" ? 0 : i.phase === "scheduled" ? 1 : 2;
    list.sort((a, b) => rank(a) - rank(b) || (msLeft(a, serverNow) - msLeft(b, serverNow)) * (rank(a) === 2 ? -1 : 1) || a.position - b.position);
  }
  return list;
}

// ---------------------------------------------------------------- the on-device activity log
// The API exposes the current top bid and the bid count, not each bid. This log keeps what this phone actually knows:
// your own receipts (server decision time) and changes in the top bid seen while polling (time first seen).
export type LogEntry = { amountMinor: number; at: string; kind: "mine" | "seen"; business?: string };
const logKey = (code: string) => `bz_log_${code}`;
function readLog(code: string): Record<string, LogEntry[]> {
  try { return JSON.parse(localStorage.getItem(logKey(code)) ?? "{}"); } catch { return {}; }
}
export function itemLog(code: string, itemId: string): LogEntry[] { return readLog(code)[itemId] ?? []; }
export function appendLog(code: string, itemId: string, entry: LogEntry) {
  try {
    const all = readLog(code), list = all[itemId] ?? [];
    if (list.some(e => e.amountMinor === entry.amountMinor && (e.kind === entry.kind || entry.kind === "seen"))) return;
    all[itemId] = [entry, ...list].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 40);
    localStorage.setItem(logKey(code), JSON.stringify(all));
  } catch { /* storage unavailable: the log is a courtesy */ }
}

// ---------------------------------------------------------------- once-only moments
export function seenOnce(key: string): boolean {
  try { if (localStorage.getItem(key)) return true; localStorage.setItem(key, "1"); } catch { /* ignore */ }
  return false;
}
export function wasSeen(key: string): boolean { try { return Boolean(localStorage.getItem(key)); } catch { return true; } }
