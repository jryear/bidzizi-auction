"use client";
// Studio data: the host workspace as the API returns it, and a view of it in the attendee's shape so the canvas can render
// the attendee's own components.
import { increment, PLEDGE_CAP, type Tier } from "../../lib/money";
import type { Item as PItem, Snapshot } from "../e/[code]/model";

export type Bid = { id: string; amountMinor: number; at: string; participantId: string; name: string; business: string };
export type Award = { status: "assigned" | "fulfilled" | "no_winner"; bidId: string | null; participantId: string | null; amountMinor: number | null; notes: string; revision: number; updatedAt: string };
export type Item = {
  id: string; position: number; title: string; short: string; description: string; category: string; donor: string; imageAssetId: string | null; imageUrl: string | null;
  openingMinor: number; incrementOverrideMinor: number | null; opensAt: string | null; closesAt: string | null; effectiveOpensAt: string; effectiveClosesAt: string;
  ready: boolean; revision: number; phase: "scheduled" | "open" | "closed"; currentMinor: number | null; bidCount: number; minimumNextMinor: number | null;
  leader: { id: string; name: string; business: string } | null; bids: Bid[]; award: Award | null;
};
export type Participant = { id: string; name: string; business: string; canBid: boolean; joinedAt: string; bidCount: number; leadingCount: number; pledgedMinor: number };
export type Pledge = { id: string; recipientName: string; amountMinor: number; recordedAt: string; processedAt: string | null; note: string; name: string; business: string };
export type EventData = {
  id: string; code: string; name: string; welcome: string; venue: string; winnerInstructions: string; coverAssetId: string | null; coverUrl: string | null; timezone: string;
  startsAt: string; endsAt: string; accessEndsAt: string; status: "draft" | "live"; entryOpen: boolean; theme: string; bidMode: "tiered" | "fixed"; tiers: Tier[];
  fixedIncrementMinor: number | null; donationsEnabled: boolean; donationDeadline: string | null; revision: number; phase: string; hasBids: boolean;
};
export type Data = {
  serverNow: string; event: EventData; items: Item[]; participants: Participant[];
  activity: { id: string; itemId: string; amountMinor: number; at: string; name: string; business: string }[];
  pledges: Pledge[];
  recipients: { id: string; name: string; description: string; logoAssetId: string | null; logoUrl: string | null }[];
  sponsors: { id: string; name: string; logoAssetId: string | null; logoUrl: string | null }[];
};
export type EventCard = {
  id: string; name: string; code: string; status: "draft" | "live"; stage: "draft" | "upcoming" | "running" | "ended";
  startsAt: string; endsAt: string; coverUrl: string | null; itemCount: number; participantCount: number; bidCount: number;
};

/** The workspace, seen through an attendee's phone. Hidden items are included so the host can see and edit them. */
export function toSnapshot(d: Data, me = { displayName: "A guest", businessName: "Your Business" }): Snapshot {
  const e = d.event, now = new Date(d.serverNow).getTime();
  const rules = { mode: e.bidMode, tiers: e.tiers, fixedIncrementMinor: e.fixedIncrementMinor };
  const deadline = e.donationDeadline ?? e.endsAt;
  return {
    serverNow: d.serverNow,
    event: {
      id: e.id, code: e.code, name: e.name, welcome: e.welcome, venue: e.venue, timezone: e.timezone, theme: e.theme, coverUrl: e.coverUrl,
      startsAt: e.startsAt, endsAt: e.endsAt, accessEndsAt: e.accessEndsAt, entryOpen: e.entryOpen,
      phase: e.phase === "open" || e.phase === "closed" ? e.phase : "upcoming",
      sponsors: d.sponsors.map(s => ({ name: s.name, logoUrl: s.logoUrl })),
      donations: { enabled: e.donationsEnabled, open: e.donationsEnabled && now < new Date(deadline).getTime(), deadline, capMinor: PLEDGE_CAP,
        recipients: d.recipients.map(r => ({ id: r.id, name: r.name, description: r.description, logoUrl: r.logoUrl })) },
    },
    items: d.items.map((i): PItem => {
      const winner = i.award?.bidId ? i.bids.find(b => b.id === i.award!.bidId) : undefined;
      return {
        id: i.id, position: i.position, title: i.title, short: i.short, description: i.description, category: i.category, donor: i.donor, imageUrl: i.imageUrl,
        openingMinor: i.openingMinor, opensAt: i.effectiveOpensAt, closesAt: i.effectiveClosesAt, phase: i.phase, currentMinor: i.currentMinor, bidCount: i.bidCount,
        leader: i.leader ? { name: i.leader.name, business: i.leader.business, isMe: false } : null, minimumNextMinor: i.minimumNextMinor,
        incrementMinor: increment(i.currentMinor ?? i.openingMinor, rules, i.incrementOverrideMinor), watching: false, myHighestMinor: null, myBidCount: 0,
        award: i.award ? { status: i.award.status, winner: winner ? { name: winner.name, business: winner.business } : null, amountMinor: i.award.amountMinor, isMe: false } : null,
      };
    }),
    me: { id: "preview", displayName: me.displayName, businessName: me.businessName, canBid: true, winnerInstructions: e.winnerInstructions, pledges: [] },
  };
}

/** Downscale in the browser so phone photos upload quickly and fit the server's limits. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("encode")), "image/jpeg", 0.86));
}
export async function uploadPhoto(file: File): Promise<{ id: string; url: string }> {
  let blob: Blob;
  try { blob = await shrink(file); } catch { throw new Error("That image couldn't be read. Try a JPEG or PNG."); }
  const r = await fetch("/api/v1/host/assets", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob, credentials: "same-origin" }).catch(() => null);
  if (!r) throw new Error("Connection lost. The photo wasn't uploaded.");
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error?.message ?? "Upload failed.");
  return data;
}

/** The one event the home page centres on: running now, then the next live one, then a draft being set up, then the latest. */
export function currentEvent(events: EventCard[], nowMs: number): EventCard | null {
  const t = (s: string) => new Date(s).getTime();
  const running = events.filter(e => e.stage === "running").sort((a, b) => t(a.endsAt) - t(b.endsAt))[0];
  if (running) return running;
  const upcoming = events.filter(e => e.stage === "upcoming").sort((a, b) => t(a.startsAt) - t(b.startsAt))[0];
  if (upcoming) return upcoming;
  const drafts = events.filter(e => e.stage === "draft");
  const nextDraft = drafts.filter(e => t(e.endsAt) > nowMs).sort((a, b) => t(a.startsAt) - t(b.startsAt))[0] ?? drafts.sort((a, b) => t(b.startsAt) - t(a.startsAt))[0];
  if (nextDraft) return nextDraft;
  return [...events].sort((a, b) => t(b.endsAt) - t(a.endsAt))[0] ?? null;
}

export const SUGGESTED_NAMES: Record<string, string> = { "trade-show": "Holiday Trade Show", gala: "Spring Charity Gala", quick: "Members' Mixer Auction", blank: "" };

// Local, per-device checklist confirmations (the API has no field for "I've checked the schedule").
export const confirmKey = (eventId: string, what: string) => `bz_confirm_${eventId}_${what}`;
export function isConfirmed(eventId: string, what: string) { try { return localStorage.getItem(confirmKey(eventId, what)) === "1"; } catch { return false; } }
export function confirm(eventId: string, what: string) { try { localStorage.setItem(confirmKey(eventId, what), "1"); } catch { /* ignore */ } }
