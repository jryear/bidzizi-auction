import type { FocalPoint } from "../../lib/photo";
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { now, tx, type Db } from "./db";
import { ApiError, cents, conflict, id, invalid, json, notFound, readJson, sha256, str } from "./http";
import { participantCookieHeader, participantFrom, requireParticipant, staffFrom, type Participant } from "./auth";
import { BID_CAP, increment, minimumNext, PLEDGE_CAP, type Rules, type Tier } from "../../lib/money";
import { orderedCategories } from "../../lib/categories";

export type EventRow = {
  id: string; org_id: string; join_code: string; name: string; welcome: string; venue: string; winner_instructions: string;
  cover_asset_id: string | null; cover_focal: FocalPoint; timezone: string; starts_at: Date; ends_at: Date; access_ends_at: Date;
  status: "draft" | "live"; entry_open: boolean; bid_mode: "tiered" | "fixed"; tiers: Tier[]; fixed_increment_minor: string | null;
  donations_enabled: boolean; donation_deadline: Date | null; revision: number; theme: string; is_practice: boolean; archived_at: Date | null;
  bidder_display: BidderDisplay; accent_color: string | null; categories: string[];
};
export type BidderDisplay = "name_business" | "business" | "anonymous";

/** How one bidder appears to other participants and on the stage. Staff views never go through this. */
export function shownBidder(mode: BidderDisplay, p: { name: string; business: string; number: number }): { name: string; business: string } {
  if (mode === "anonymous") return { name: "", business: `Bidder ${p.number}` };
  if (mode === "business") return { name: "", business: p.business };
  return { name: p.name, business: p.business };
}
export type ItemRow = {
  id: string; event_id: string; position: number; title: string; short: string; description: string; category: string; donor: string;
  image_asset_id: string | null; image_focal: FocalPoint; opening_minor: string; increment_override_minor: string | null;
  opens_at: Date | null; closes_at: Date | null; ready: boolean; revision: number; withdrawn_at: Date | null; withdrawal_message: string;
};
export type Phase = "scheduled" | "open" | "closed";

export const rulesOf = (e: EventRow): Rules => ({ mode: e.bid_mode, tiers: e.tiers, fixedIncrementMinor: e.fixed_increment_minor === null ? null : Number(e.fixed_increment_minor) });
export const opensOf = (e: EventRow, i: ItemRow) => i.opens_at ?? e.starts_at;
export const closesOf = (e: EventRow, i: ItemRow) => i.closes_at ?? e.ends_at;
export function phaseOf(e: EventRow, i: ItemRow, at: Date): Phase {
  return at < opensOf(e, i) ? "scheduled" : at < closesOf(e, i) ? "open" : "closed";
}
export const assetUrl = (assetId: string | null) => assetId ? `/api/v1/assets/${assetId}` : null;

export async function eventByCode(db: Db, code: string, lock = ""): Promise<EventRow> {
  const normalized = code.toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) throw notFound("This event");
  const row = (await db.query<EventRow>(`SELECT * FROM events WHERE join_code = $1 ${lock}`, [normalized])).rows[0];
  if (!row || row.status !== "live" || row.archived_at) throw notFound("This event");
  return row;
}

/** Live events for everyone; drafts only for signed-in staff of the same organization (read-only preview). */
async function viewableEvent(db: Db, request: Request, code: string): Promise<{ e: EventRow; preview: boolean }> {
  const normalized = code.toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)) throw notFound("This event");
  const e = (await db.query<EventRow>("SELECT * FROM events WHERE join_code = $1", [normalized])).rows[0];
  if (!e || e.archived_at) throw notFound("This event");
  if (e.status === "live") return { e, preview: false };
  try { const staff = await staffFrom(db, request); if (staff.orgId === e.org_id) return { e, preview: true }; } catch { /* not staff */ }
  throw notFound("This event");
}

/** Display-only rollup. Each item's own phase is what decides bidding. */
export function eventPhase(e: EventRow, items: ItemRow[], at: Date): "upcoming" | "open" | "closed" {
  const live = items.filter(i => i.ready && !i.withdrawn_at);
  if (!live.length) return at < e.ends_at ? "upcoming" : "closed";
  const phases = live.map(i => phaseOf(e, i, at));
  return phases.includes("open") ? "open" : phases.includes("scheduled") ? "upcoming" : "closed";
}

// ---------------------------------------------------------------- snapshot

type StandingJoin = { item_id: string; current_minor: string | null; bid_count: number; leader_id: string | null; leader_name: string; leader_business: string; leader_number: number };
type AwardJoin = { item_id: string; status: string; participant_id: string | null; amount_minor: string | null; winner_name: string; winner_business: string; winner_number: number };

export async function snapshot(request: Request, code: string): Promise<Response> {
  return json(await tx(async db => {
    const { e, preview } = await viewableEvent(db, request, code), at = await now(db);
    const me = preview ? null : await participantFrom(db, request, e.id);
    return buildSnapshot(db, e, at, me, preview);
  }));
}

/** One projection for guests and staff previews; privacy and standing rules stay on the server. */
async function buildSnapshot(db: Db, e: EventRow, at: Date, me: Participant | null, preview: boolean, includeHidden = false) {
  const allItems = (await db.query<ItemRow>("SELECT * FROM items WHERE event_id = $1 ORDER BY position, created_at", [e.id])).rows;
  const visibleItems = allItems.filter(i => i.ready);
  const items = includeHidden ? allItems : visibleItems;
  const history = (await db.query<{ id: string; item_id: string; amount_minor: string; decided_at: Date; participant_id: string; voided_at: Date | null }>(
    `SELECT id, item_id, amount_minor::text, decided_at, participant_id, voided_at FROM bids WHERE event_id = $1 ORDER BY sequence DESC`, [e.id])).rows;
  const standings = new Map((await db.query<StandingJoin>(
    `SELECT s.item_id, s.current_minor, s.bid_count, s.leader_id, p.display_name AS leader_name, p.business_name AS leader_business, p.bidder_number AS leader_number
       FROM standings s LEFT JOIN participants p ON p.id = s.leader_id WHERE s.event_id = $1`, [e.id])).rows.map(r => [r.item_id, r]));
  const awards = new Map((await db.query<AwardJoin>(
    `SELECT a.item_id, a.status, a.participant_id, a.amount_minor, p.display_name AS winner_name, p.business_name AS winner_business, p.bidder_number AS winner_number
       FROM awards a LEFT JOIN participants p ON p.id = a.participant_id WHERE a.event_id = $1`, [e.id])).rows.map(r => [r.item_id, r]));
  const sponsors = (await db.query<{ name: string; logo_asset_id: string | null; url: string }>("SELECT name, logo_asset_id, url FROM sponsors WHERE event_id = $1 ORDER BY position", [e.id])).rows;
  const recipients = e.donations_enabled ? (await db.query<{ id: string; name: string; description: string; logo_asset_id: string | null }>(
    "SELECT id, name, description, logo_asset_id FROM recipients WHERE event_id = $1 AND NOT removed ORDER BY position", [e.id])).rows : [];
  let mine: { bids: Map<string, { highest: number; count: number }>; watching: Set<string>; pledges: unknown[] } | null = null;
  if (me) {
    const bids = (await db.query<{ item_id: string; highest: string; count: number }>(
      "SELECT item_id, max(amount_minor)::text AS highest, count(*)::int AS count FROM bids WHERE participant_id = $1 AND voided_at IS NULL GROUP BY item_id", [me.id])).rows;
    const watching = (await db.query<{ item_id: string }>("SELECT item_id FROM watches WHERE participant_id = $1", [me.id])).rows;
    const pledges = (await db.query<{ id: string; recipient_name: string; amount_minor: string; recorded_at: Date }>(
      "SELECT id, recipient_name, amount_minor::text, recorded_at FROM pledges WHERE participant_id = $1 ORDER BY recorded_at DESC", [me.id])).rows;
    mine = {
      bids: new Map(bids.map(b => [b.item_id, { highest: Number(b.highest), count: b.count }])),
      watching: new Set(watching.map(w => w.item_id)),
      pledges: pledges.map(p => ({ id: p.id, recipientName: p.recipient_name, amountMinor: Number(p.amount_minor), recordedAt: p.recorded_at })),
    };
  }
  const rules = rulesOf(e);
  const donationsOpen = e.donations_enabled && e.donation_deadline !== null && at < e.donation_deadline;
  return {
    serverNow: at, preview,
    event: {
      id: e.id, code: e.join_code, name: e.name, welcome: e.welcome, venue: e.venue, timezone: e.timezone, theme: e.theme, bidderDisplay: e.bidder_display,
      coverUrl: assetUrl(e.cover_asset_id), coverFocal: e.cover_focal, startsAt: e.starts_at, endsAt: e.ends_at, accessEndsAt: e.access_ends_at,
      entryOpen: e.entry_open && at < e.ends_at, phase: eventPhase(e, visibleItems, at),
      // Staff's category order, limited to categories guests can actually filter by.
      categories: orderedCategories(e.categories, visibleItems).filter(c => visibleItems.some(i => i.category === c)),
      sponsors: sponsors.map(s => ({ name: s.name, logoUrl: assetUrl(s.logo_asset_id), url: s.url })), accentColor: e.accent_color,
      donations: { enabled: e.donations_enabled, open: donationsOpen, deadline: e.donation_deadline, capMinor: PLEDGE_CAP,
        recipients: recipients.map(r => ({ id: r.id, name: r.name, description: r.description, logoUrl: assetUrl(r.logo_asset_id) })) },
    },
    items: items.map(i => {
      const s = standings.get(i.id), a = awards.get(i.id), phase = i.withdrawn_at ? "closed" : phaseOf(e, i, at);
      const current = s?.current_minor == null ? null : Number(s.current_minor);
      const override = i.increment_override_minor === null ? null : Number(i.increment_override_minor);
      const mineHere = mine?.bids.get(i.id);
      const won = Boolean(me && a && a.status !== "no_winner" && a.participant_id === me.id);
      return {
        ...(includeHidden && !i.ready ? { hidden: true } : {}),
        id: i.id, position: i.position, title: i.title, short: i.short, description: i.description, category: i.category, donor: i.donor,
        withdrawn: i.withdrawn_at !== null, withdrawalMessage: i.withdrawal_message,
        bidHistory: history.filter(b => b.item_id === i.id).map(b => ({ id: b.id, amountMinor: Number(b.amount_minor), decidedAt: b.decided_at,
          isMe: b.participant_id === me?.id, voided: b.voided_at !== null })),
        imageUrl: assetUrl(i.image_asset_id), imageFocal: i.image_focal, openingMinor: Number(i.opening_minor),
        opensAt: opensOf(e, i), closesAt: closesOf(e, i), phase,
        currentMinor: current, bidCount: s?.bid_count ?? 0,
        leader: s?.leader_id ? (s.leader_id === me?.id ? { name: s.leader_name, business: s.leader_business, isMe: true }
          : { ...shownBidder(e.bidder_display, { name: s.leader_name, business: s.leader_business, number: s.leader_number }), isMe: false }) : null,
        minimumNextMinor: i.withdrawn_at ? null : minimumNext(current, Number(i.opening_minor), rules, override),
        incrementMinor: increment(current ?? Number(i.opening_minor), rules, override),
        watching: mine?.watching.has(i.id) ?? false,
        myHighestMinor: mineHere?.highest ?? null, myBidCount: mineHere?.count ?? 0,
        award: a ? { status: a.status, winner: a.status === "no_winner" ? null : won ? { name: a.winner_name, business: a.winner_business }
          : shownBidder(e.bidder_display, { name: a.winner_name, business: a.winner_business, number: a.winner_number }),
          amountMinor: a.amount_minor === null ? null : Number(a.amount_minor), isMe: won } : null,
      };
    }),
    me: me ? { id: me.id, displayName: me.displayName, businessName: me.businessName, canBid: me.canBid, pledges: mine!.pledges, bidderNumber: me.bidderNumber,
      winnerInstructions: [...awards.values()].some(a => a.participant_id === me.id && a.status !== "no_winner") ? e.winner_instructions : "" } : null,
  };
}

/** A stand-in guest has no credential, activity or write authority. */
export async function previewSnapshot(request: Request, eventId: string): Promise<Response> {
  return json(await tx(async db => {
    const staff = await staffFrom(db, request);
    const e = (await db.query<EventRow>("SELECT * FROM events WHERE id = $1 AND org_id = $2 AND archived_at IS NULL", [id(eventId), staff.orgId])).rows[0];
    if (!e) throw notFound("This event");
    const snap = await buildSnapshot(db, e, await now(db), null, true, true);
    // Use the current sample ordinal for anonymous attribution; this is never a participant identity.
    const number = (await db.query<{ n: number }>("SELECT greatest(coalesce(max(bidder_number), 1), 1)::int AS n FROM participants WHERE event_id = $1", [e.id])).rows[0].n;
    return { ...snap, me: { id: "preview", displayName: "A guest", businessName: "Your Business", canBid: true, pledges: [], bidderNumber: number, winnerInstructions: "" } };
  }));
}

// ---------------------------------------------------------------- join

export async function join(request: Request, code: string): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId);
  const displayName = str(input.displayName, 60, { required: true }), businessName = str(input.businessName, 120, { required: true });
  if (/[\u0000-\u001f\u007f]/.test(displayName + businessName)) throw invalid();
  const token = randomBytes(32).toString("base64url");
  const result = await tx(async db => {
    const e = await eventByCode(db, code, "FOR SHARE"), at = await now(db);
    // A retry of the same join (lost response) re-issues the device credential for the same participant.
    const prior = (await db.query<{ id: string; created_at: Date }>(
      "SELECT id, created_at FROM participants WHERE event_id = $1 AND join_request_id = $2 FOR UPDATE", [e.id, requestId])).rows[0];
    if (prior) {
      if (at.getTime() - prior.created_at.getTime() > 10 * 60_000) throw conflict("This join link expired. Start again.");
      await db.query("UPDATE participants SET token_hash = $2 WHERE id = $1", [prior.id, sha256(token)]);
      return { e, at, participantId: prior.id };
    }
    if (!e.entry_open || at >= e.ends_at) throw new ApiError(403, "ENTRY_CLOSED", "Joining is closed for this event.");
    // A stable per-event bidder number, in join order. The advisory lock serializes concurrent joins to this event only.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`bidders:${e.id}`]);
    const participantId = (await db.query<{ id: string }>(
      `INSERT INTO participants (event_id, display_name, business_name, token_hash, join_request_id, bidder_number)
       VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(bidder_number), 0) + 1 FROM participants WHERE event_id = $1)) RETURNING id`,
      [e.id, displayName, businessName, sha256(token), requestId])).rows[0].id;
    return { e, at, participantId };
  });
  return json({ ok: true, participantId: result.participantId }, 201, { "Set-Cookie": participantCookieHeader(result.e.id, token, result.e.access_ends_at, result.at) });
}

/** A staff-issued one-time code moves an existing participant to this device. */
export async function rejoin(request: Request, code: string): Promise<Response> {
  const input = await readJson(request);
  const rejoinCode = str(input.code, 20, { required: true }).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const token = randomBytes(32).toString("base64url");
  const result = await tx(async db => {
    const e = await eventByCode(db, code), at = await now(db);
    if (at >= e.access_ends_at) throw new ApiError(403, "ACCESS_ENDED", "This event is no longer available.");
    const row = (await db.query<{ participant_id: string }>(
      `SELECT r.participant_id FROM rejoin_codes r JOIN participants p ON p.id = r.participant_id
        WHERE r.code_hash = $1 AND p.event_id = $2 AND r.used_at IS NULL AND r.expires_at > $3 FOR UPDATE OF r`,
      [sha256(`rejoin:${rejoinCode}`), e.id, at])).rows[0];
    if (!row) throw new ApiError(400, "CODE_INVALID", "That code didn't work. Ask staff for a new one.");
    await db.query("UPDATE rejoin_codes SET used_at = $2 WHERE code_hash = $1", [sha256(`rejoin:${rejoinCode}`), at]);
    await db.query("UPDATE participants SET token_hash = $2 WHERE id = $1", [row.participant_id, sha256(token)]);
    return { e, at };
  });
  return json({ ok: true }, 200, { "Set-Cookie": participantCookieHeader(result.e.id, token, result.e.access_ends_at, result.at) });
}

// ---------------------------------------------------------------- bidding

export type BidReason = "NOT_AVAILABLE" | "NOT_OPEN" | "CLOSED" | "BIDDING_PAUSED" | "ALREADY_LEADING" | "BELOW_MINIMUM" | "AMOUNT_LIMIT";
export type BidReceipt = {
  requestId: string; itemId: string; amountMinor: number; accepted: boolean; reason: BidReason | null;
  bidId: string | null; decidedAt: string; currentMinor: number | null; minimumNextMinor: number | null; leading: boolean;
};

const bidHash = (itemId: string, amount: number) => sha256(JSON.stringify(["bid", itemId, amount]));

export async function placeBid(request: Request, code: string): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId), itemId = id(input.itemId), amount = cents(input.amountMinor, BID_CAP);
  const outcome = await tx(async db => {
    const e0 = await eventByCode(db, code);
    const me = await requireParticipant(db, request, e0.id);
    // Serialize retries of this exact request before looking for a prior decision.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`bid:${me.id}:${requestId}`]);
    const prior = (await db.query<{ payload_hash: string; receipt: BidReceipt }>(
      "SELECT payload_hash, receipt FROM bid_receipts WHERE participant_id = $1 AND request_id = $2", [me.id, requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== bidHash(itemId, amount)) throw conflict("This request was already used for a different bid.");
      return { receipt: prior.receipt, replay: true };
    }
    // Lock order: event, item (timing can't move mid-decision), standing (one decision at a time per item).
    const e = (await db.query<EventRow>("SELECT * FROM events WHERE id = $1 FOR SHARE", [e0.id])).rows[0];
    const item = (await db.query<ItemRow>("SELECT * FROM items WHERE id = $1 AND event_id = $2 FOR SHARE", [itemId, e.id])).rows[0];
    if (!item) throw notFound("This item");
    const standing = (await db.query<{ current_minor: string | null; leader_id: string | null; bid_count: number; next_sequence: number }>(
      "SELECT current_minor, leader_id, bid_count, next_sequence FROM standings WHERE item_id = $1 FOR UPDATE", [itemId])).rows[0];
    // Recheck the participant after waiting on locks: staff may have paused them meanwhile.
    const fresh = await requireParticipant(db, request, e.id);
    const at = await now(db);
    const current = standing.current_minor === null ? null : Number(standing.current_minor);
    const override = item.increment_override_minor === null ? null : Number(item.increment_override_minor);
    const minimum = minimumNext(current, Number(item.opening_minor), rulesOf(e), override);
    const phase = phaseOf(e, item, at);
    const reason: BidReason | null =
      !item.ready || item.withdrawn_at || e.status !== "live" ? "NOT_AVAILABLE" :
      phase === "scheduled" ? "NOT_OPEN" : phase === "closed" ? "CLOSED" :
      !fresh.canBid ? "BIDDING_PAUSED" :
      standing.leader_id === fresh.id ? "ALREADY_LEADING" :
      minimum === null ? "AMOUNT_LIMIT" : amount < minimum ? "BELOW_MINIMUM" : null;
    const bidId = reason ? null : randomUUID();
    if (bidId) {
      await db.query(
        `INSERT INTO bids (id, item_id, event_id, participant_id, request_id, amount_minor, sequence, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [bidId, itemId, e.id, fresh.id, requestId, amount, standing.next_sequence, at]);
      await db.query(
        "UPDATE standings SET current_minor = $2, leader_id = $3, leading_bid_id = $4, bid_count = bid_count + 1, next_sequence = next_sequence + 1, updated_at = $5 WHERE item_id = $1",
        [itemId, amount, fresh.id, bidId, at]);
    }
    const newCurrent = bidId ? amount : current;
    const receipt: BidReceipt = {
      requestId, itemId, amountMinor: amount, accepted: !reason, reason, bidId, decidedAt: at.toISOString(),
      currentMinor: newCurrent, minimumNextMinor: minimumNext(newCurrent, Number(item.opening_minor), rulesOf(e), override),
      leading: Boolean(bidId) || standing.leader_id === fresh.id,
    };
    await db.query("INSERT INTO bid_receipts (participant_id, request_id, item_id, payload_hash, accepted, receipt) VALUES ($1, $2, $3, $4, $5, $6)",
      [fresh.id, requestId, itemId, bidHash(itemId, amount), !reason, JSON.stringify(receipt)]);
    return { receipt, replay: false };
  });
  return json(outcome, outcome.receipt.accepted ? 201 : 409);
}

/** "Did my bid go through?" Returns the original decision; never creates one. */
export async function bidReceipt(request: Request, code: string, requestId: string): Promise<Response> {
  const key = id(requestId);
  return json(await tx(async db => {
    const e = await eventByCode(db, code), me = await requireParticipant(db, request, e.id);
    const row = (await db.query<{ receipt: BidReceipt }>("SELECT receipt FROM bid_receipts WHERE participant_id = $1 AND request_id = $2", [me.id, key])).rows[0];
    return { receipt: row?.receipt ?? null };
  }));
}

export async function watch(request: Request, code: string): Promise<Response> {
  const input = await readJson(request);
  const itemId = id(input.itemId), on = input.on === true;
  await tx(async db => {
    const e = await eventByCode(db, code), me = await requireParticipant(db, request, e.id);
    const exists = (await db.query("SELECT 1 FROM items WHERE id = $1 AND event_id = $2 AND ready", [itemId, e.id])).rows.length;
    if (!exists) throw notFound("This item");
    if (on) await db.query("INSERT INTO watches (participant_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [me.id, itemId]);
    else await db.query("DELETE FROM watches WHERE participant_id = $1 AND item_id = $2", [me.id, itemId]);
  });
  return json({ ok: true, watching: on });
}

// ---------------------------------------------------------------- donations

export async function pledge(request: Request, code: string): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId), recipientId = id(input.recipientId), amount = cents(input.amountMinor, PLEDGE_CAP);
  const hash = sha256(JSON.stringify(["pledge", recipientId, amount]));
  const result = await tx(async db => {
    const e0 = await eventByCode(db, code), me = await requireParticipant(db, request, e0.id);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`pledge:${me.id}:${requestId}`]);
    const prior = (await db.query<{ id: string; payload_hash: string; recipient_name: string; amount_minor: string; recorded_at: Date }>(
      "SELECT id, payload_hash, recipient_name, amount_minor::text, recorded_at FROM pledges WHERE participant_id = $1 AND request_id = $2", [me.id, requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== hash) throw conflict("This request was already used for a different donation.");
      return { id: prior.id, recipientName: prior.recipient_name, amountMinor: Number(prior.amount_minor), recordedAt: prior.recorded_at, replay: true };
    }
    const e = (await db.query<EventRow>("SELECT * FROM events WHERE id = $1 FOR SHARE", [e0.id])).rows[0];
    const recipient = (await db.query<{ name: string }>(
      "SELECT name FROM recipients WHERE id = $1 AND event_id = $2 AND NOT removed FOR SHARE", [recipientId, e.id])).rows[0];
    if (!recipient) throw notFound("This recipient");
    const at = await now(db);
    if (!e.donations_enabled || !e.donation_deadline || at >= e.donation_deadline) throw new ApiError(403, "DONATIONS_CLOSED", "Donations are closed.");
    const pledgeId = randomUUID();
    await db.query(
      `INSERT INTO pledges (id, event_id, participant_id, request_id, recipient_id, recipient_name, amount_minor, payload_hash, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [pledgeId, e.id, me.id, requestId, recipientId, recipient.name, amount, hash, at]);
    return { id: pledgeId, recipientName: recipient.name, amountMinor: amount, recordedAt: at, replay: false };
  });
  return json({ pledge: result }, result.replay ? 200 : 201);
}

export type { Participant };
