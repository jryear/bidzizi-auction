"use client";
import type { FocalPoint } from "../../lib/photo";

// Studio data: the host workspace as the API returns it, and a view of it in the attendee's shape so the canvas can render
// the attendee's own components.
import { increment, PLEDGE_CAP, type Tier } from "../../lib/money";
import type { Item as PItem, Snapshot } from "../e/[code]/model";

export type Bid = { id: string; amountMinor: number; at: string; participantId: string; name: string; business: string; voided: boolean; voidReason: string };
export type Award = { status: "assigned" | "fulfilled" | "no_winner"; bidId: string | null; participantId: string | null; amountMinor: number | null; notes: string; revision: number; updatedAt: string };
export type Item = {
  id: string; position: number; title: string; short: string; description: string; category: string; donor: string; imageAssetId: string | null; imageUrl: string | null; imageFocal?: FocalPoint;
  openingMinor: number; incrementOverrideMinor: number | null; opensAt: string | null; closesAt: string | null; effectiveOpensAt: string; effectiveClosesAt: string;
  ready: boolean; revision: number; phase: "scheduled" | "open" | "closed"; currentMinor: number | null; bidCount: number; minimumNextMinor: number | null;
  leader: { id: string; name: string; business: string; number: number } | null; bids: Bid[]; award: Award | null;
  withdrawn: boolean; withdrawalMessage: string; hasBids: boolean;
};
export type Participant = { id: string; name: string; business: string; number: number; canBid: boolean; joinedAt: string; bidCount: number; leadingCount: number; pledgedMinor: number };
export type Pledge = { id: string; recipientName: string; amountMinor: number; recordedAt: string; processedAt: string | null; note: string; name: string; business: string };
export type EventData = {
  id: string; code: string; name: string; welcome: string; venue: string; winnerInstructions: string; coverAssetId: string | null; coverUrl: string | null; coverFocal?: FocalPoint; timezone: string;
  startsAt: string; endsAt: string; accessEndsAt: string; status: "draft" | "live"; entryOpen: boolean; theme: string; bidMode: "tiered" | "fixed"; tiers: Tier[];
  fixedIncrementMinor: number | null; donationsEnabled: boolean; donationDeadline: string | null; revision: number; phase: string; hasBids: boolean;
  isPractice: boolean; archivedAt: string | null; bidderDisplay: BidderDisplay; accentColor: string | null;
};
export type BidderDisplay = "name_business" | "business" | "anonymous";
/** The same rule the server applies to guests' phones, so the canvas previews exactly what guests will see. */
export function shownBidder(mode: BidderDisplay, p: { name: string; business: string; number: number }) {
  return mode === "anonymous" ? { name: "", business: `Bidder ${p.number}` } : mode === "business" ? { name: "", business: p.business } : { name: p.name, business: p.business };
}
export type Data = {
  serverNow: string; event: EventData; items: Item[]; participants: Participant[];
  activity: { id: string; itemId: string; amountMinor: number; at: string; name: string; business: string; voided: boolean }[];
  pledges: Pledge[];
  recipients: { id: string; name: string; description: string; logoAssetId: string | null; logoUrl: string | null }[];
  sponsors: { id: string; name: string; logoAssetId: string | null; logoUrl: string | null; url: string }[];
};
export type EventCard = {
  id: string; name: string; code: string; status: "draft" | "live"; stage: "draft" | "upcoming" | "running" | "ended";
  startsAt: string; endsAt: string; coverUrl: string | null; coverFocal?: FocalPoint; itemCount: number; participantCount: number; bidCount: number;
  isPractice: boolean; archivedAt: string | null;
};

/** The workspace, seen through an attendee's phone. Hidden items are included so the host can see and edit them. */
export function toSnapshot(d: Data, me = { displayName: "A guest", businessName: "Your Business" }): Snapshot {
  const e = d.event, now = new Date(d.serverNow).getTime();
  const rules = { mode: e.bidMode, tiers: e.tiers, fixedIncrementMinor: e.fixedIncrementMinor };
  const deadline = e.donationDeadline ?? e.endsAt;
  return {
    serverNow: d.serverNow,
    event: {
      id: e.id, code: e.code, name: e.name, welcome: e.welcome, venue: e.venue, timezone: e.timezone, theme: e.theme, coverUrl: e.coverUrl, coverFocal: e.coverFocal,
      startsAt: e.startsAt, endsAt: e.endsAt, accessEndsAt: e.accessEndsAt, entryOpen: e.entryOpen,
      phase: e.phase === "open" || e.phase === "closed" ? e.phase : "upcoming",
      sponsors: d.sponsors.map(s => ({ name: s.name, logoUrl: s.logoUrl, url: s.url })), accentColor: e.accentColor, bidderDisplay: e.bidderDisplay,
      donations: { enabled: e.donationsEnabled, open: e.donationsEnabled && now < new Date(deadline).getTime(), deadline, capMinor: PLEDGE_CAP,
        recipients: d.recipients.map(r => ({ id: r.id, name: r.name, description: r.description, logoUrl: r.logoUrl })) },
    },
    items: d.items.map((i): PItem => {
      const winner = i.award?.bidId ? i.bids.find(b => b.id === i.award!.bidId) : undefined;
      return {
        id: i.id, position: i.position, title: i.title, short: i.short, description: i.description, category: i.category, donor: i.donor, imageUrl: i.imageUrl, imageFocal: i.imageFocal,
        openingMinor: i.openingMinor, opensAt: i.effectiveOpensAt, closesAt: i.effectiveClosesAt, phase: i.phase, currentMinor: i.currentMinor, bidCount: i.bidCount,
        leader: i.leader ? { ...shownBidder(e.bidderDisplay, i.leader), isMe: false } : null, minimumNextMinor: i.minimumNextMinor,
        incrementMinor: increment(i.currentMinor ?? i.openingMinor, rules, i.incrementOverrideMinor), watching: false, myHighestMinor: null, myBidCount: 0,
        award: i.award ? { status: i.award.status, winner: winner ? { name: winner.name, business: winner.business } : null, amountMinor: i.award.amountMinor, isMe: false } : null,
      };
    }),
    me: { id: "preview", displayName: me.displayName, businessName: me.businessName, canBid: true, winnerInstructions: e.winnerInstructions, pledges: [] },
  };
}

/** Downscale in the browser so phone photos upload quickly and fit the server's limits. Logos keep their transparency
 *  (PNG); photos become JPEG. */
async function shrink(file: File, kind: "photo" | "logo"): Promise<{ blob: Blob; type: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, (kind === "logo" ? 800 : 1600) / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = kind === "logo" ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve({ blob: b, type }) : reject(new Error("encode")), type, 0.86));
}
export async function uploadPhoto(file: File, kind: "photo" | "logo" = "photo"): Promise<{ id: string; url: string }> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image. Use a JPEG, PNG or WebP.");
  let out: { blob: Blob; type: string };
  try { out = await shrink(file, kind); } catch { throw new Error("That image couldn't be read. Try a JPEG or PNG."); }
  const r = await fetch("/api/v1/host/assets", { method: "POST", headers: { "Content-Type": out.type }, body: out.blob, credentials: "same-origin" }).catch(() => null);
  if (!r) throw new Error("Connection lost. The photo wasn't uploaded.");
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message ?? "Upload failed.");
  return data;
}

/** The one event the home page centres on: running now, then the next live one, then a draft being set up, then the latest.
 *  Archived events never take the spot, and a real event always beats a practice one at the same tier. */
export function currentEvent(all: EventCard[], nowMs: number): EventCard | null {
  const t = (s: string) => new Date(s).getTime();
  const pool = all.filter(e => !e.archivedAt);
  const pick = (list: EventCard[], by: (a: EventCard, b: EventCard) => number) => [...list].sort((a, b) => Number(a.isPractice) - Number(b.isPractice) || by(a, b))[0];
  const running = pick(pool.filter(e => e.stage === "running"), (a, b) => t(a.endsAt) - t(b.endsAt));
  if (running) return running;
  const upcoming = pick(pool.filter(e => e.stage === "upcoming"), (a, b) => t(a.startsAt) - t(b.startsAt));
  if (upcoming) return upcoming;
  const drafts = pool.filter(e => e.stage === "draft");
  const nextDraft = pick(drafts.filter(e => t(e.endsAt) > nowMs), (a, b) => t(a.startsAt) - t(b.startsAt)) ?? pick(drafts, (a, b) => t(b.startsAt) - t(a.startsAt));
  if (nextDraft) return nextDraft;
  return pick(pool, (a, b) => t(b.endsAt) - t(a.endsAt)) ?? null;
}

export const SUGGESTED_NAMES: Record<string, string> = { "trade-show": "Holiday Trade Show", gala: "Spring Charity Gala", quick: "Members' Mixer Auction", blank: "" };

// Local, per-device checklist confirmations (the API has no field for "I've checked the schedule").
export const confirmKey = (eventId: string, what: string) => `bz_confirm_${eventId}_${what}`;
export function isConfirmed(eventId: string, what: string) { try { return localStorage.getItem(confirmKey(eventId, what)) === "1"; } catch { return false; } }
export function confirm(eventId: string, what: string) { try { localStorage.setItem(confirmKey(eventId, what), "1"); } catch { /* ignore */ } }
