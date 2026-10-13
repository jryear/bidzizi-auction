import "server-only";
import { randomInt } from "node:crypto";
import { normalizeAsset } from "./asset-codec";
import { now, tx, type Db } from "./db";
import { staffFrom, type Staff } from "./auth";
import { cents, conflict, id, invalid, json, notFound, readJson, sameOrigin, sha256, str, when } from "./http";
import { assetUrl, closesOf, eventPhase, opensOf, phaseOf, rulesOf, type EventRow, type ItemRow } from "./engine";
import { DEFAULT_TIERS, formatMoney, minimumNext, validTiers } from "../../lib/money";
import { TEMPLATES, THEMES } from "../../lib/templates";

const THEME_IDS: string[] = THEMES.map(t => t.id);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (length: number) => Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
const FIVE_MINUTES = 5 * 60_000;

async function staffTx<T>(request: Request, run: (db: Db, staff: Staff) => Promise<T>): Promise<T> {
  return tx(async db => run(db, await staffFrom(db, request)));
}
async function ownEvent(db: Db, staff: Staff, eventId: string, lock = ""): Promise<EventRow> {
  const row = (await db.query<EventRow>(`SELECT * FROM events WHERE id = $1 AND org_id = $2 ${lock}`, [id(eventId), staff.orgId])).rows[0];
  if (!row) throw notFound("This event");
  return row;
}
async function ownItem(db: Db, staff: Staff, itemId: string, lock = ""): Promise<{ item: ItemRow; event: EventRow }> {
  const item = (await db.query<ItemRow>(`SELECT i.* FROM items i WHERE i.id = $1 AND i.org_id = $2 ${lock}`, [id(itemId), staff.orgId])).rows[0];
  if (!item) throw notFound("This item");
  return { item, event: await ownEvent(db, staff, item.event_id) };
}
/** Replays a staff create action retried after a lost response. */
async function once<T>(db: Db, staff: Staff, requestId: string, operation: string, run: () => Promise<T>): Promise<T> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`staff:${staff.id}:${requestId}`]);
  const prior = (await db.query<{ response: T; operation: string }>("SELECT response, operation FROM staff_requests WHERE staff_id = $1 AND request_id = $2", [staff.id, requestId])).rows[0];
  if (prior) {
    if (prior.operation !== operation) throw conflict("This request ID was already used for another action.");
    return prior.response;
  }
  const response = await run();
  await db.query("INSERT INTO staff_requests (staff_id, request_id, operation, response) VALUES ($1, $2, $3, $4)", [staff.id, requestId, operation, JSON.stringify(response)]);
  return response;
}
const num = (v: string | null) => v === null ? null : Number(v);
const optionalCents = (v: unknown, max?: number) => v === null || v === undefined || v === "" ? null : cents(v, max);
const optionalWhen = (v: unknown) => v === null || v === "" ? null : when(v);

// ---------------------------------------------------------------- session

export async function me(request: Request): Promise<Response> {
  return json(await staffTx(request, async (_db, staff) => ({ staff })));
}

// ---------------------------------------------------------------- events

export async function listEvents(request: Request): Promise<Response> {
  return json(await staffTx(request, async (db, staff) => {
    const at = await now(db);
    const rows = (await db.query<EventRow & { item_count: number; participant_count: number; bid_count: number; is_practice: boolean; archived_at: Date | null }>(
      `SELECT e.*, (SELECT count(*)::int FROM items i WHERE i.event_id = e.id) AS item_count,
              (SELECT count(*)::int FROM participants p WHERE p.event_id = e.id) AS participant_count,
              (SELECT count(*)::int FROM bids b WHERE b.event_id = e.id AND b.voided_at IS NULL) AS bid_count
         FROM events e WHERE e.org_id = $1 ORDER BY e.starts_at DESC`, [staff.orgId])).rows;
    return { serverNow: at, events: rows.map(e => ({
      id: e.id, name: e.name, code: e.join_code, status: e.status, startsAt: e.starts_at, endsAt: e.ends_at,
      stage: e.status === "draft" ? "draft" : at < e.starts_at ? "upcoming" : at < e.ends_at ? "running" : "ended",
      coverUrl: assetUrl(e.cover_asset_id), itemCount: e.item_count, participantCount: e.participant_count, bidCount: e.bid_count,
      isPractice: e.is_practice, archivedAt: e.archived_at,
    })) };
  }));
}

async function newJoinCode(db: Db): Promise<string> {
  for (;;) {
    const candidate = code(6);
    if (!(await db.query("SELECT 1 FROM events WHERE join_code = $1", [candidate])).rows.length) return candidate;
  }
}

export async function createEvent(request: Request): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId), name = str(input.name, 200, { required: true });
  const isPractice = input.isPractice === true;
  const startsAt = when(input.startsAt), endsAt = when(input.endsAt);
  const timezone = str(input.timezone ?? "America/Los_Angeles", 100);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw invalid("Choose a valid time zone."); }
  if (endsAt <= startsAt) throw invalid("The end must be after the start.");
  const template = input.template === undefined ? TEMPLATES.find(t => t.id === "blank")! : TEMPLATES.find(t => t.id === input.template);
  if (!template) throw invalid();
  // One transaction: an event never appears half-built.
  return json(await staffTx(request, (db, staff) => once(db, staff, requestId, "create-event", async () => {
    const row = (await db.query<{ id: string }>(
      `INSERT INTO events (org_id, join_code, name, timezone, starts_at, ends_at, access_ends_at, tiers, created_by, theme, welcome, winner_instructions,
                           donations_enabled, donation_deadline, is_practice)
       VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + interval '7 days', $7, $8, $9, $10, $11, $12, CASE WHEN $12 THEN $6::timestamptz END, $13) RETURNING id`,
      [staff.orgId, await newJoinCode(db), name, timezone, startsAt, endsAt, JSON.stringify(DEFAULT_TIERS), staff.id, template.theme, template.welcome,
       template.winnerInstructions, template.donations, isPractice])).rows[0];
    for (const [position, item] of template.items.entries()) {
      const created = (await db.query<{ id: string }>(
        "INSERT INTO items (event_id, org_id, position, title, short, category, opening_minor, ready) VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id",
        [row.id, staff.orgId, position, item.title, item.short, item.category, item.openingMinor])).rows[0];
      await db.query("INSERT INTO standings (item_id, event_id) VALUES ($1, $2)", [created.id, row.id]);
    }
    for (const [position, recipient] of template.recipients.entries())
      await db.query("INSERT INTO recipients (event_id, org_id, position, name) VALUES ($1, $2, $3, $4)", [row.id, staff.orgId, position, recipient]);
    return { id: row.id };
  })), 201);
}

/** New draft from this event's setup and items. No participants, bids, pledges or awards are copied. */
export async function duplicateEvent(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId);
  return json(await staffTx(request, (db, staff) => once(db, staff, requestId, "duplicate-event", async () => {
    const source = await ownEvent(db, staff, eventId);
    const name = input.name === undefined ? `${source.name} (copy)` : str(input.name, 200, { required: true });
    const startsAt = input.startsAt === undefined ? source.starts_at : when(input.startsAt);
    const shift = startsAt.getTime() - source.starts_at.getTime();
    const moved = (d: Date | null) => d === null ? null : new Date(d.getTime() + shift);
    const copy = (await db.query<{ id: string }>(
      `INSERT INTO events (org_id, join_code, name, welcome, venue, winner_instructions, cover_asset_id, timezone, starts_at, ends_at, access_ends_at,
                           entry_open, bid_mode, tiers, fixed_increment_minor, donations_enabled, donation_deadline, created_by, theme)
       SELECT org_id, $2, $3, welcome, venue, winner_instructions, cover_asset_id, timezone, $4, $5, $6,
              true, bid_mode, tiers, fixed_increment_minor, donations_enabled, $7, $8, theme FROM events WHERE id = $1 RETURNING id`,
      [source.id, await newJoinCode(db), name, startsAt, moved(source.ends_at), moved(source.access_ends_at), moved(source.donation_deadline), staff.id])).rows[0];
    const items = (await db.query<ItemRow>("SELECT * FROM items WHERE event_id = $1 ORDER BY position", [source.id])).rows;
    for (const i of items) {
      const created = (await db.query<{ id: string }>(
        `INSERT INTO items (event_id, org_id, position, title, short, description, category, donor, image_asset_id, opening_minor,
                            increment_override_minor, opens_at, closes_at, ready)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [copy.id, staff.orgId, i.position, i.title, i.short, i.description, i.category, i.donor, i.image_asset_id, i.opening_minor,
         i.increment_override_minor, moved(i.opens_at), moved(i.closes_at), i.ready])).rows[0];
      await db.query("INSERT INTO standings (item_id, event_id) VALUES ($1, $2)", [created.id, copy.id]);
    }
    await db.query(`INSERT INTO sponsors (event_id, org_id, position, name, logo_asset_id) SELECT $2, org_id, position, name, logo_asset_id FROM sponsors WHERE event_id = $1`, [source.id, copy.id]);
    await db.query(`INSERT INTO recipients (event_id, org_id, position, name, description, logo_asset_id) SELECT $2, org_id, position, name, description, logo_asset_id FROM recipients WHERE event_id = $1 AND NOT removed`, [source.id, copy.id]);
    return { id: copy.id };
  })), 201);
}

async function eraseEventActivity(db: Db, eventId: string): Promise<void> {
  await db.query("DELETE FROM award_log WHERE item_id IN (SELECT id FROM items WHERE event_id = $1)", [eventId]);
  await db.query("DELETE FROM awards WHERE event_id = $1", [eventId]);
  await db.query("DELETE FROM bid_receipts WHERE item_id IN (SELECT id FROM items WHERE event_id = $1)", [eventId]);
  await db.query("DELETE FROM rejoin_codes WHERE participant_id IN (SELECT id FROM participants WHERE event_id = $1)", [eventId]);
  await db.query("DELETE FROM watches WHERE item_id IN (SELECT id FROM items WHERE event_id = $1)", [eventId]);
  await db.query("DELETE FROM pledges WHERE event_id = $1", [eventId]);
  await db.query("UPDATE standings SET current_minor=NULL, leader_id=NULL, leading_bid_id=NULL, bid_count=0, next_sequence=1, updated_at=now() WHERE event_id=$1", [eventId]);
  await db.query("DELETE FROM bids WHERE event_id = $1", [eventId]);
  await db.query("DELETE FROM participants WHERE event_id = $1", [eventId]);
}

/** A practice reset retains setup and items but gives the room a fresh code and empty activity. */
export async function resetPractice(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request), requestId = id(input.requestId);
  return json(await staffTx(request, (db, staff) => once(db, staff, requestId, `reset-practice:${id(eventId)}`, async () => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    if (!e.is_practice) throw conflict("Only practice events can be reset.");
    await eraseEventActivity(db, e.id);
    await db.query("UPDATE items SET withdrawn_at=NULL, withdrawal_message='', revision=revision+1, updated_at=now() WHERE event_id=$1 AND withdrawn_at IS NOT NULL", [e.id]);
    const nextCode = await newJoinCode(db);
    await db.query("UPDATE events SET status='draft', join_code=$2, archived_at=NULL, revision=revision+1, updated_at=now() WHERE id=$1", [e.id, nextCode]);
    return { ok: true, code: nextCode, revision: e.revision + 1 };
  })));
}

/** Staff may remove practice rooms, or unjoined drafts. */
export async function deleteEvent(request: Request, eventId: string): Promise<Response> {
  sameOrigin(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    const joined = (await db.query("SELECT 1 FROM participants WHERE event_id=$1 LIMIT 1", [e.id])).rows.length > 0;
    if (!e.is_practice && (e.status !== "draft" || joined)) throw conflict("Only a practice event or an unjoined draft can be deleted.");
    await eraseEventActivity(db, e.id);
    await db.query("DELETE FROM standings WHERE event_id=$1", [e.id]);
    await db.query("DELETE FROM items WHERE event_id=$1", [e.id]);
    await db.query("DELETE FROM sponsors WHERE event_id=$1", [e.id]);
    await db.query("DELETE FROM recipients WHERE event_id=$1", [e.id]);
    await db.query("DELETE FROM events WHERE id=$1", [e.id]);
    return { ok: true };
  }));
}

export async function archiveEvent(request: Request, eventId: string): Promise<Response> {
  await readJson(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    if (!e.is_practice && e.status !== "draft") throw conflict("Only draft and practice events can be archived.");
    if (e.archived_at) return { ok: true, replay: true };
    await db.query("UPDATE events SET archived_at=now(), revision=revision+1, updated_at=now() WHERE id=$1", [e.id]);
    return { ok: true, replay: false };
  }));
}

/** Restore an archived draft/practice room without losing its records. */
export async function restoreEvent(request: Request, eventId: string): Promise<Response> {
  await readJson(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    if (e.archived_at) await db.query("UPDATE events SET archived_at=NULL, revision=revision+1, updated_at=now() WHERE id=$1", [e.id]);
    return { ok: true };
  }));
}

type BidJoin = { id: string; item_id: string; amount_minor: string; decided_at: Date; participant_id: string; display_name: string; business_name: string; voided_at: Date | null; void_reason: string };

export async function workspace(request: Request, eventId: string): Promise<Response> {
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId), at = await now(db);
    const items = (await db.query<ItemRow & { current_minor: string | null; bid_count: number; leader_id: string | null }>(
      `SELECT i.*, s.current_minor, s.bid_count, s.leader_id FROM items i JOIN standings s ON s.item_id = i.id
        WHERE i.event_id = $1 ORDER BY i.position, i.created_at`, [e.id])).rows;
    const bids = (await db.query<BidJoin>(
      `SELECT b.id, b.item_id, b.amount_minor::text, b.decided_at, b.participant_id, p.display_name, p.business_name, b.voided_at, b.void_reason
         FROM bids b JOIN participants p ON p.id = b.participant_id WHERE b.event_id = $1 ORDER BY b.decided_at DESC`, [e.id])).rows;
    const awards = new Map((await db.query<{ item_id: string; status: string; bid_id: string | null; participant_id: string | null; amount_minor: string | null; notes: string; revision: number; updated_at: Date }>(
      "SELECT * FROM awards WHERE event_id = $1", [e.id])).rows.map(a => [a.item_id, a]));
    const participants = (await db.query<{ id: string; display_name: string; business_name: string; can_bid: boolean; created_at: Date }>(
      "SELECT id, display_name, business_name, can_bid, created_at FROM participants WHERE event_id = $1 ORDER BY created_at", [e.id])).rows;
    const pledges = (await db.query<{ id: string; participant_id: string; recipient_name: string; amount_minor: string; recorded_at: Date; processed_at: Date | null; note: string }>(
      "SELECT id, participant_id, recipient_name, amount_minor::text, recorded_at, processed_at, note FROM pledges WHERE event_id = $1 ORDER BY recorded_at DESC", [e.id])).rows;
    const recipients = (await db.query<{ id: string; name: string; description: string; logo_asset_id: string | null; position: number }>(
      "SELECT id, name, description, logo_asset_id, position FROM recipients WHERE event_id = $1 AND NOT removed ORDER BY position", [e.id])).rows;
    const sponsors = (await db.query<{ id: string; name: string; logo_asset_id: string | null }>("SELECT id, name, logo_asset_id FROM sponsors WHERE event_id = $1 ORDER BY position", [e.id])).rows;
    const byParticipant = new Map(participants.map(p => [p.id, p]));
    const rules = rulesOf(e);
    return {
      serverNow: at,
      event: {
        id: e.id, code: e.join_code, name: e.name, welcome: e.welcome, venue: e.venue, winnerInstructions: e.winner_instructions,
        coverAssetId: e.cover_asset_id, coverUrl: assetUrl(e.cover_asset_id), timezone: e.timezone,
        startsAt: e.starts_at, endsAt: e.ends_at, accessEndsAt: e.access_ends_at, status: e.status, entryOpen: e.entry_open,
        bidMode: e.bid_mode, tiers: e.tiers, fixedIncrementMinor: num(e.fixed_increment_minor),
        donationsEnabled: e.donations_enabled, donationDeadline: e.donation_deadline, revision: e.revision, theme: e.theme,
        phase: e.status === "draft" ? "draft" : eventPhase(e, items, at), hasBids: bids.length > 0,
        isPractice: e.is_practice, archivedAt: e.archived_at,
      },
      items: items.map(i => {
        const a = awards.get(i.id), leader = i.leader_id ? byParticipant.get(i.leader_id) : undefined;
        const current = num(i.current_minor), override = num(i.increment_override_minor);
        return {
          id: i.id, position: i.position, title: i.title, short: i.short, description: i.description, category: i.category, donor: i.donor,
          imageAssetId: i.image_asset_id, imageUrl: assetUrl(i.image_asset_id), openingMinor: Number(i.opening_minor),
          incrementOverrideMinor: override, opensAt: i.opens_at, closesAt: i.closes_at,
          effectiveOpensAt: opensOf(e, i), effectiveClosesAt: closesOf(e, i), ready: i.ready, revision: i.revision,
          withdrawn: i.withdrawn_at !== null, withdrawalMessage: i.withdrawal_message,
          phase: i.withdrawn_at ? "closed" : phaseOf(e, i, at), currentMinor: current, bidCount: i.bid_count,
          hasBids: bids.some(b => b.item_id === i.id),
          minimumNextMinor: i.withdrawn_at ? null : minimumNext(current, Number(i.opening_minor), rules, override),
          leader: leader ? { id: leader.id, name: leader.display_name, business: leader.business_name } : null,
          bids: bids.filter(b => b.item_id === i.id).map(b => ({ id: b.id, amountMinor: Number(b.amount_minor), at: b.decided_at,
            participantId: b.participant_id, name: b.display_name, business: b.business_name, voided: b.voided_at !== null, voidReason: b.void_reason })),
          award: a ? { status: a.status, bidId: a.bid_id, participantId: a.participant_id, amountMinor: num(a.amount_minor), notes: a.notes, revision: a.revision, updatedAt: a.updated_at } : null,
        };
      }),
      participants: participants.map(p => {
        const theirBids = bids.filter(b => b.participant_id === p.id);
        return { id: p.id, name: p.display_name, business: p.business_name, canBid: p.can_bid, joinedAt: p.created_at,
          bidCount: theirBids.filter(b => !b.voided_at).length, leadingCount: items.filter(i => i.leader_id === p.id).length,
          pledgedMinor: pledges.filter(x => x.participant_id === p.id).reduce((sum, x) => sum + Number(x.amount_minor), 0) };
      }),
      activity: bids.slice(0, 50).map(b => ({ id: b.id, itemId: b.item_id, amountMinor: Number(b.amount_minor), at: b.decided_at, name: b.display_name, business: b.business_name, voided: b.voided_at !== null })),
      pledges: pledges.map(p => { const who = byParticipant.get(p.participant_id); return {
        id: p.id, recipientName: p.recipient_name, amountMinor: Number(p.amount_minor), recordedAt: p.recorded_at,
        processedAt: p.processed_at, note: p.note, name: who?.display_name ?? "", business: who?.business_name ?? "" }; }),
      recipients: recipients.map(r => ({ id: r.id, name: r.name, description: r.description, logoAssetId: r.logo_asset_id, logoUrl: assetUrl(r.logo_asset_id) })),
      sponsors: sponsors.map(s => ({ id: s.id, name: s.name, logoAssetId: s.logo_asset_id, logoUrl: assetUrl(s.logo_asset_id) })),
    };
  }));
}

/** Edit any event field. Restrictions apply only where an edit would affect bids already placed. */
export async function updateEvent(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE"), at = await now(db);
    if (input.revision !== e.revision) throw conflict("Someone else changed this event. Reload to see the latest.");
    const hasBids = (await db.query("SELECT 1 FROM bids WHERE event_id = $1 LIMIT 1", [e.id])).rows.length > 0;
    const next = { ...e };
    if ("name" in input) next.name = str(input.name, 200, { required: true });
    if ("welcome" in input) next.welcome = str(input.welcome, 5000, { trim: false });
    if ("venue" in input) next.venue = str(input.venue, 300);
    if ("winnerInstructions" in input) next.winner_instructions = str(input.winnerInstructions, 5000, { trim: false });
    if ("coverAssetId" in input) next.cover_asset_id = input.coverAssetId === null ? null : id(input.coverAssetId);
    if ("timezone" in input) {
      next.timezone = str(input.timezone, 100);
      try { new Intl.DateTimeFormat("en-US", { timeZone: next.timezone }); } catch { throw invalid("Choose a valid time zone."); }
    }
    if ("startsAt" in input) {
      next.starts_at = when(input.startsAt);
      if (next.starts_at.getTime() !== e.starts_at.getTime() && hasBids) throw conflict("The start time can't change after bidding has begun.");
    }
    if ("endsAt" in input) {
      next.ends_at = when(input.endsAt);
      if (hasBids && next.ends_at < e.ends_at && next.ends_at.getTime() < at.getTime() + FIVE_MINUTES)
        throw conflict("With bids placed, the end can only move earlier to at least 5 minutes from now.");
    }
    if ("accessEndsAt" in input) next.access_ends_at = when(input.accessEndsAt);
    else if ("endsAt" in input && next.access_ends_at < next.ends_at) next.access_ends_at = new Date(next.ends_at.getTime() + 7 * 86_400_000);
    if (next.ends_at <= next.starts_at) throw invalid("The end must be after the start.");
    if (next.access_ends_at < next.ends_at) throw invalid("Participant access must last at least until the event ends.");
    if ("status" in input) {
      if (input.status !== "draft" && input.status !== "live") throw invalid();
      if (input.status === "draft" && e.status === "live" && (await db.query("SELECT 1 FROM participants WHERE event_id = $1 LIMIT 1", [e.id])).rows.length)
        throw conflict("People have already joined, so this event can't go back to draft.");
      next.status = input.status;
    }
    if ("entryOpen" in input) next.entry_open = input.entryOpen === true;
    if ("isPractice" in input) {
      if (typeof input.isPractice !== "boolean") throw invalid();
      if ((await db.query("SELECT 1 FROM participants WHERE event_id = $1 LIMIT 1", [e.id])).rows.length)
        throw conflict("Practice status can't change after people join.");
      next.is_practice = input.isPractice;
    }
    if ("theme" in input) { if (!THEME_IDS.includes(input.theme as string)) throw invalid(); next.theme = input.theme as string; }
    if ("bidMode" in input || "tiers" in input || "fixedIncrementMinor" in input) {
      if (hasBids) throw conflict("Bid increments can't change after bidding has begun.");
      if ("bidMode" in input) { if (input.bidMode !== "tiered" && input.bidMode !== "fixed") throw invalid(); next.bid_mode = input.bidMode; }
      if ("tiers" in input) { const t = validTiers(input.tiers); if (!t) throw invalid("Increment tiers must go up in order, with a final open-ended tier."); next.tiers = t; }
      if ("fixedIncrementMinor" in input) next.fixed_increment_minor = input.fixedIncrementMinor === null ? null : String(cents(input.fixedIncrementMinor, 100_000_000));
      if (next.bid_mode === "fixed" && !next.fixed_increment_minor) throw invalid("Set the fixed increment.");
    }
    if ("donationsEnabled" in input) next.donations_enabled = input.donationsEnabled === true;
    if ("donationDeadline" in input) next.donation_deadline = optionalWhen(input.donationDeadline);
    if (next.donations_enabled && !next.donation_deadline) next.donation_deadline = next.ends_at;
    await db.query(
      `UPDATE events SET name=$2, welcome=$3, venue=$4, winner_instructions=$5, cover_asset_id=$6, timezone=$7, starts_at=$8, ends_at=$9,
              access_ends_at=$10, status=$11, entry_open=$12, bid_mode=$13, tiers=$14, fixed_increment_minor=$15, donations_enabled=$16,
              donation_deadline=$17, theme=$18, is_practice=$19, revision = revision + 1, updated_at = now() WHERE id = $1`,
      [e.id, next.name, next.welcome, next.venue, next.winner_instructions, next.cover_asset_id, next.timezone, next.starts_at, next.ends_at,
       next.access_ends_at, next.status, next.entry_open, next.bid_mode, JSON.stringify(next.tiers), next.fixed_increment_minor,
       next.donations_enabled, next.donation_deadline, next.theme, next.is_practice]);
    return { ok: true, revision: e.revision + 1 };
  }));
}

// ---------------------------------------------------------------- items

function itemFields(input: Record<string, unknown>, base: Partial<ItemRow>) {
  const out = { ...base } as ItemRow;
  if ("title" in input) out.title = str(input.title, 200, { required: true });
  if ("short" in input) out.short = str(input.short, 500);
  if ("description" in input) out.description = str(input.description, 10_000, { trim: false });
  if ("category" in input) out.category = str(input.category, 100);
  if ("donor" in input) out.donor = str(input.donor, 200);
  if ("imageAssetId" in input) out.image_asset_id = input.imageAssetId === null ? null : id(input.imageAssetId);
  if ("openingMinor" in input) out.opening_minor = String(cents(input.openingMinor));
  if ("incrementOverrideMinor" in input) { const v = optionalCents(input.incrementOverrideMinor, 100_000_000); out.increment_override_minor = v === null ? null : String(v); }
  if ("opensAt" in input) out.opens_at = optionalWhen(input.opensAt);
  if ("closesAt" in input) out.closes_at = optionalWhen(input.closesAt);
  if ("ready" in input) out.ready = input.ready === true;
  return out;
}

export async function createItem(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId);
  delete input.requestId;
  return json(await staffTx(request, (db, staff) => once(db, staff, requestId, "create-item", async () => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    const i = itemFields(input, { short: "", description: "", category: "", donor: "", image_asset_id: null, increment_override_minor: null, opens_at: null, closes_at: null, ready: true });
    if (!i.title || !i.opening_minor) throw invalid("Add a title and a starting amount.");
    const position = (await db.query<{ next: number }>("SELECT coalesce(max(position) + 1, 0)::int AS next FROM items WHERE event_id = $1", [e.id])).rows[0].next;
    const row = (await db.query<{ id: string }>(
      `INSERT INTO items (event_id, org_id, position, title, short, description, category, donor, image_asset_id, opening_minor, increment_override_minor, opens_at, closes_at, ready)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [e.id, staff.orgId, position, i.title, i.short, i.description, i.category, i.donor, i.image_asset_id, i.opening_minor, i.increment_override_minor, i.opens_at, i.closes_at, i.ready])).rows[0];
    await db.query("INSERT INTO standings (item_id, event_id) VALUES ($1, $2)", [row.id, e.id]);
    return { id: row.id };
  })), 201);
}

export async function updateItem(request: Request, itemId: string): Promise<Response> {
  const input = await readJson(request);
  return json(await staffTx(request, async (db, staff) => {
    // Locking the item waits out any bid being decided on it, and blocks new ones until this commits.
    const { item, event } = await ownItem(db, staff, itemId, "FOR UPDATE");
    if (input.revision !== item.revision) throw conflict("This item changed. Reload to see the latest.");
    const at = await now(db);
    const hasBids = (await db.query("SELECT 1 FROM bids WHERE item_id = $1 LIMIT 1", [item.id])).rows.length > 0;
    const next = itemFields(input, item);
    if (hasBids) {
      if (next.opening_minor !== item.opening_minor) throw conflict("The starting amount is locked once bidding starts.");
      if (next.increment_override_minor !== item.increment_override_minor) throw conflict("The increment is locked once bidding starts.");
      if (!next.ready) throw conflict("An item with bids can't be hidden.");
      const oldOpens = opensOf(event, item), newOpens = next.opens_at ?? event.starts_at;
      if (newOpens.getTime() !== oldOpens.getTime()) throw conflict("The opening time is locked once bidding starts.");
      const oldCloses = closesOf(event, item), newCloses = next.closes_at ?? event.ends_at;
      if (newCloses.getTime() !== oldCloses.getTime()) {
        if (at >= oldCloses) throw conflict("This item has already closed.");
        if (newCloses < oldCloses && newCloses.getTime() < at.getTime() + FIVE_MINUTES) throw conflict("With bids placed, closing can only move earlier to at least 5 minutes from now.");
      }
    }
    const opens = next.opens_at ?? event.starts_at, closes = next.closes_at ?? event.ends_at;
    if (opens >= closes) throw invalid("Closing must be after opening.");
    await db.query(
      `UPDATE items SET title=$2, short=$3, description=$4, category=$5, donor=$6, image_asset_id=$7, opening_minor=$8, increment_override_minor=$9,
              opens_at=$10, closes_at=$11, ready=$12, revision = revision + 1, updated_at = now() WHERE id = $1`,
      [item.id, next.title, next.short, next.description, next.category, next.donor, next.image_asset_id, next.opening_minor,
       next.increment_override_minor, next.opens_at, next.closes_at, next.ready]);
    return { ok: true, revision: item.revision + 1 };
  }));
}

export async function deleteItem(request: Request, itemId: string): Promise<Response> {
  sameOrigin(request);
  return json(await staffTx(request, async (db, staff) => {
    const { item } = await ownItem(db, staff, itemId, "FOR UPDATE");
    if ((await db.query("SELECT 1 FROM bid_receipts WHERE item_id = $1 LIMIT 1", [item.id])).rows.length)
      throw conflict("People have bid on this item, so it can't be deleted.");
    await db.query("DELETE FROM watches WHERE item_id = $1", [item.id]);
    await db.query("DELETE FROM standings WHERE item_id = $1", [item.id]);
    await db.query("DELETE FROM items WHERE id = $1", [item.id]);
    return { ok: true };
  }));
}

/** A mistaken accepted bid remains in the audit trail, while standing is recomputed from active bids. */
export async function voidBid(request: Request, itemId: string): Promise<Response> {
  const input = await readJson(request);
  const bidId = id(input.bidId), reason = str(input.reason, 500, { required: true });
  return json(await staffTx(request, async (db, staff) => {
    const target = (await db.query<{ event_id: string }>("SELECT event_id FROM items WHERE id = $1 AND org_id = $2", [id(itemId), staff.orgId])).rows[0];
    if (!target) throw notFound("This item");
    await ownEvent(db, staff, target.event_id, "FOR SHARE");
    const item = (await db.query<ItemRow>("SELECT * FROM items WHERE id = $1 AND event_id = $2 FOR UPDATE", [itemId, target.event_id])).rows[0];
    if (!item) throw notFound("This item");
    await db.query("SELECT 1 FROM standings WHERE item_id = $1 FOR UPDATE", [item.id]);
    const bid = (await db.query<{ voided_at: Date | null }>("SELECT voided_at FROM bids WHERE id = $1 AND item_id = $2 FOR UPDATE", [bidId, item.id])).rows[0];
    if (!bid) throw notFound("This bid");
    if (bid.voided_at) return { ok: true, replay: true };
    const at = await now(db);
    await db.query("UPDATE bids SET voided_at = $2, voided_by = $3, void_reason = $4 WHERE id = $1", [bidId, at, staff.id, reason]);
    const active = (await db.query<{ id: string; amount_minor: string; participant_id: string; count: number }>(
      `SELECT b.id, b.amount_minor::text, b.participant_id,
              (SELECT count(*)::int FROM bids x WHERE x.item_id = $1 AND x.voided_at IS NULL) AS count
         FROM bids b WHERE b.item_id = $1 AND b.voided_at IS NULL ORDER BY b.sequence DESC LIMIT 1`, [item.id])).rows[0];
    await db.query(
      `UPDATE standings SET current_minor = $2, leader_id = $3, leading_bid_id = $4, bid_count = $5, updated_at = $6 WHERE item_id = $1`,
      [item.id, active?.amount_minor ?? null, active?.participant_id ?? null, active?.id ?? null, active?.count ?? 0, at]);
    const award = (await db.query<{ bid_id: string | null }>("SELECT bid_id FROM awards WHERE item_id = $1 FOR UPDATE", [item.id])).rows[0];
    if (award?.bid_id === bidId) {
      await db.query(`UPDATE awards SET status='no_winner', bid_id=NULL, participant_id=NULL, amount_minor=NULL,
        revision=revision+1, updated_by=$2, updated_at=$3 WHERE item_id=$1`, [item.id, staff.id, at]);
      await db.query("INSERT INTO award_log (item_id, action, detail, staff_id) VALUES ($1, 'void_bid', $2, $3)",
        [item.id, JSON.stringify({ bidId, reason, awardCleared: true }), staff.id]);
    } else {
      await db.query("INSERT INTO award_log (item_id, action, detail, staff_id) VALUES ($1, 'void_bid', $2, $3)",
        [item.id, JSON.stringify({ bidId, reason, awardCleared: false }), staff.id]);
    }
    return { ok: true, replay: false, currentMinor: active ? Number(active.amount_minor) : null,
      bidCount: active?.count ?? 0, leadingBidId: active?.id ?? null };
  }));
}

/** Withdrawn items stay visible, with a reason; no new bids or winner decisions are allowed. */
export async function withdrawItem(request: Request, itemId: string): Promise<Response> {
  const input = await readJson(request);
  const message = str(input.message, 1000, { required: true });
  return json(await staffTx(request, async (db, staff) => {
    const target = (await db.query<{ event_id: string }>("SELECT event_id FROM items WHERE id = $1 AND org_id = $2", [id(itemId), staff.orgId])).rows[0];
    if (!target) throw notFound("This item");
    await ownEvent(db, staff, target.event_id, "FOR SHARE");
    const item = (await db.query<ItemRow>("SELECT * FROM items WHERE id = $1 AND event_id = $2 FOR UPDATE", [itemId, target.event_id])).rows[0];
    await db.query("SELECT 1 FROM standings WHERE item_id = $1 FOR UPDATE", [item.id]);
    if (item.withdrawn_at) {
      if (item.withdrawal_message !== message) throw conflict("This item was already withdrawn. Reload to see the message.");
      return { ok: true, replay: true };
    }
    const at = await now(db);
    await db.query("UPDATE items SET withdrawn_at=$2, withdrawal_message=$3, revision=revision+1, updated_at=$2 WHERE id=$1", [item.id, at, message]);
    await db.query(`UPDATE awards SET status='no_winner', bid_id=NULL, participant_id=NULL, amount_minor=NULL,
      revision=revision+1, updated_by=$2, updated_at=$3 WHERE item_id=$1 AND status <> 'no_winner'`, [item.id, staff.id, at]);
    await db.query("INSERT INTO award_log (item_id, action, detail, staff_id) VALUES ($1, 'withdraw', $2, $3)",
      [item.id, JSON.stringify({ message }), staff.id]);
    return { ok: true, replay: false, revision: item.revision + 1 };
  }));
}

export async function reorderItems(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request);
  if (!Array.isArray(input.order) || input.order.length > 500) throw invalid();
  const order = input.order.map(id);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    const existing = (await db.query<{ id: string }>("SELECT id FROM items WHERE event_id = $1", [e.id])).rows.map(r => r.id).sort();
    if (existing.join() !== [...order].sort().join()) throw conflict("The item list changed. Reload and try again.");
    for (let p = 0; p < order.length; p++) await db.query("UPDATE items SET position = $2 WHERE id = $1", [order[p], p]);
    return { ok: true };
  }));
}

// ---------------------------------------------------------------- sponsors and recipients

export async function saveSponsors(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request);
  if (!Array.isArray(input.sponsors) || input.sponsors.length > 30) throw invalid();
  const sponsors = input.sponsors.map(s => { const v = s as Record<string, unknown>; return { name: str(v.name, 200, { required: true }), logo: v.logoAssetId ? id(v.logoAssetId) : null }; });
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    await db.query("DELETE FROM sponsors WHERE event_id = $1", [e.id]);
    for (const [p, s] of sponsors.entries()) await db.query("INSERT INTO sponsors (event_id, org_id, position, name, logo_asset_id) VALUES ($1, $2, $3, $4, $5)", [e.id, staff.orgId, p, s.name, s.logo]);
    return { ok: true };
  }));
}

export async function saveRecipient(request: Request, eventId: string): Promise<Response> {
  const input = await readJson(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    const name = str(input.name, 200, { required: true }), description = str(input.description ?? "", 2000), logo = input.logoAssetId ? id(input.logoAssetId) : null;
    if (input.id) {
      // Pledges keep the name they were made under; a rename affects new pledges only.
      const updated = await db.query("UPDATE recipients SET name = $3, description = $4, logo_asset_id = $5 WHERE id = $1 AND event_id = $2 AND NOT removed", [id(input.id), e.id, name, description, logo]);
      if (!updated.rowCount) throw notFound("This recipient");
      return { id: input.id };
    }
    const position = (await db.query<{ next: number }>("SELECT coalesce(max(position) + 1, 0)::int AS next FROM recipients WHERE event_id = $1", [e.id])).rows[0].next;
    return (await db.query<{ id: string }>("INSERT INTO recipients (event_id, org_id, position, name, description, logo_asset_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [e.id, staff.orgId, position, name, description, logo])).rows[0];
  }));
}

export async function removeRecipient(request: Request, eventId: string, recipientId: string): Promise<Response> {
  sameOrigin(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId, "FOR UPDATE");
    await db.query("UPDATE recipients SET removed = true WHERE id = $1 AND event_id = $2", [id(recipientId), e.id]);
    return { ok: true };
  }));
}

// ---------------------------------------------------------------- participants

export async function updateParticipant(request: Request, eventId: string, participantId: string): Promise<Response> {
  const input = await readJson(request);
  if (!("canBid" in input || "name" in input || "business" in input)) throw invalid();
  if ("canBid" in input && typeof input.canBid !== "boolean") throw invalid();
  const name = "name" in input ? str(input.name, 60, { required: true }) : null;
  const business = "business" in input ? str(input.business, 120, { required: true }) : null;
  if (/\p{Cc}/u.test((name ?? "") + (business ?? ""))) throw invalid();
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId);
    const updated = await db.query(
      `UPDATE participants SET can_bid = coalesce($3, can_bid), display_name = coalesce($4, display_name), business_name = coalesce($5, business_name)
        WHERE id = $1 AND event_id = $2`, [id(participantId), e.id, input.canBid ?? null, name, business]);
    if (!updated.rowCount) throw notFound("This participant");
    return { ok: true };
  }));
}

/** One-time code that moves a participant to a new device (lost phone, cleared browser). */
export async function issueRejoin(request: Request, eventId: string, participantId: string): Promise<Response> {
  sameOrigin(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId);
    const p = (await db.query("SELECT 1 FROM participants WHERE id = $1 AND event_id = $2", [id(participantId), e.id])).rows[0];
    if (!p) throw notFound("This participant");
    const rejoinCode = code(8);
    await db.query("UPDATE rejoin_codes SET used_at = now() WHERE participant_id = $1 AND used_at IS NULL", [participantId]);
    await db.query("INSERT INTO rejoin_codes (code_hash, participant_id, issued_by, expires_at) VALUES ($1, $2, $3, now() + interval '30 minutes')",
      [sha256(`rejoin:${rejoinCode}`), participantId, staff.id]);
    return { code: rejoinCode, expiresInMinutes: 30 };
  }));
}

// ---------------------------------------------------------------- winners

type AwardRow = { status: string; bid_id: string | null; participant_id: string | null; amount_minor: string | null; notes: string; revision: number };

/** assign (defaults to the leading bid) | no_winner | fulfilled | unfulfilled | notes. */
export async function decideAward(request: Request, itemId: string): Promise<Response> {
  const input = await readJson(request);
  const action = str(input.action, 20);
  if (!["assign", "no_winner", "fulfilled", "unfulfilled", "notes"].includes(action)) throw invalid();
  return json(await staffTx(request, async (db, staff) => {
    const { item, event } = await ownItem(db, staff, itemId);
    // Standing lock: waits for any in-flight bid, and serializes winner decisions on this item.
    const standing = (await db.query<{ leading_bid_id: string | null }>("SELECT leading_bid_id FROM standings WHERE item_id = $1 FOR UPDATE", [item.id])).rows[0];
    const at = await now(db);
    if (item.withdrawn_at) throw conflict("This item was withdrawn and can't have a winner.");
    if (phaseOf(event, item, at) !== "closed") throw conflict("Winners can be assigned after this item closes.");
    const current = (await db.query<AwardRow>("SELECT status, bid_id, participant_id, amount_minor, notes, revision FROM awards WHERE item_id = $1 FOR UPDATE", [item.id])).rows[0];
    const expected = typeof input.revision === "number" ? input.revision : 0;
    const notes = input.notes === undefined ? current?.notes ?? "" : str(input.notes, 5000, { trim: false });
    let next: { status: string; bidId: string | null } | null = null;
    if (action === "assign") {
      const bidId = input.bidId ? id(input.bidId) : standing.leading_bid_id;
      if (!bidId) throw conflict("This item has no bids. Mark it as no winner instead.");
      // Retrying an assignment that already happened is a success, not a conflict.
      if (current && current.bid_id === bidId && current.status !== "no_winner" && input.notes === undefined) return { ok: true, revision: current.revision };
      next = { status: current?.status === "fulfilled" && current.bid_id === bidId ? "fulfilled" : "assigned", bidId };
    } else if (action === "no_winner") {
      if (current?.status === "no_winner" && input.notes === undefined) return { ok: true, revision: current.revision };
      next = { status: "no_winner", bidId: null };
    } else if (action === "fulfilled" || action === "unfulfilled") {
      if (!current || current.status === "no_winner") throw conflict("Assign a winner first.");
      const status = action === "fulfilled" ? "fulfilled" : "assigned";
      if (current.status === status && input.notes === undefined) return { ok: true, revision: current.revision };
      next = { status, bidId: current.bid_id };
    } else {
      if (!current) throw conflict("Assign a winner first.");
      next = { status: current.status, bidId: current.bid_id };
    }
    if ((current?.revision ?? 0) !== expected) throw conflict("Someone else updated this winner. Reload to see the latest.");
    let participant: string | null = null, amount: string | null = null;
    if (next.bidId) {
      const bid = (await db.query<{ participant_id: string; amount_minor: string }>("SELECT participant_id, amount_minor::text FROM bids WHERE id = $1 AND item_id = $2 AND voided_at IS NULL", [next.bidId, item.id])).rows[0];
      if (!bid) throw notFound("That bid");
      participant = bid.participant_id; amount = bid.amount_minor;
    }
    await db.query(
      `INSERT INTO awards (item_id, event_id, status, bid_id, participant_id, amount_minor, notes, revision, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, now())
       ON CONFLICT (item_id) DO UPDATE SET status = $3, bid_id = $4, participant_id = $5, amount_minor = $6, notes = $7,
         revision = awards.revision + 1, updated_by = $8, updated_at = now()`,
      [item.id, event.id, next.status, next.bidId, participant, amount, notes, staff.id]);
    await db.query("INSERT INTO award_log (item_id, action, detail, staff_id) VALUES ($1, $2, $3, $4)",
      [item.id, action, JSON.stringify({ bidId: next.bidId, status: next.status, notes }), staff.id]);
    return { ok: true, revision: (current?.revision ?? 0) + 1 };
  }));
}

export async function processPledge(request: Request, eventId: string, pledgeId: string): Promise<Response> {
  const input = await readJson(request);
  return json(await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId);
    const processed = input.processed === true, note = input.note === undefined ? null : str(input.note, 2000, { trim: false });
    const updated = await db.query(
      `UPDATE pledges SET processed_at = CASE WHEN $3 THEN coalesce(processed_at, now()) ELSE NULL END,
              processed_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END, note = coalesce($5, note)
        WHERE id = $1 AND event_id = $2`, [id(pledgeId), e.id, processed, staff.id, note]);
    if (!updated.rowCount) throw notFound("This donation");
    return { ok: true };
  }));
}

// ---------------------------------------------------------------- export

const csv = (rows: (string | number | null)[][]) =>
  rows.map(r => r.map(v => { const s = v === null ? "" : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; }).join(",")).join("\r\n") + "\r\n";

export async function exportCsv(request: Request, eventId: string, kind: string): Promise<Response> {
  const data = await staffTx(request, async (db, staff) => {
    const e = await ownEvent(db, staff, eventId);
    if (kind === "results") {
      const rows = (await db.query<{ position: number; title: string; opening_minor: string; bid_count: number; current_minor: string | null; leader: string | null; leader_business: string | null; status: string | null; winner: string | null; winner_business: string | null; amount_minor: string | null; notes: string | null }>(
        `SELECT i.position, i.title, i.opening_minor::text, s.bid_count, s.current_minor::text, lp.display_name AS leader, lp.business_name AS leader_business,
                a.status, wp.display_name AS winner, wp.business_name AS winner_business, a.amount_minor::text, a.notes
           FROM items i JOIN standings s ON s.item_id = i.id LEFT JOIN participants lp ON lp.id = s.leader_id
           LEFT JOIN awards a ON a.item_id = i.id LEFT JOIN participants wp ON wp.id = a.participant_id
          WHERE i.event_id = $1 ORDER BY i.position`, [e.id])).rows;
      return { name: `${e.join_code}-results.csv`, body: csv([["#", "Item", "Starting", "Bids", "High bid", "High bidder", "High bidder business", "Winner status", "Winner", "Winner business", "Winning amount", "Notes"],
        ...rows.map(r => [r.position + 1, r.title, formatMoney(Number(r.opening_minor)), r.bid_count, r.current_minor ? formatMoney(Number(r.current_minor)) : "", r.leader, r.leader_business,
          r.status ?? "pending", r.winner, r.winner_business, r.amount_minor ? formatMoney(Number(r.amount_minor)) : "", r.notes])]) };
    }
    if (kind === "donations") {
      const rows = (await db.query<{ recorded_at: Date; display_name: string; business_name: string; recipient_name: string; amount_minor: string; processed_at: Date | null; note: string }>(
        `SELECT d.recorded_at, p.display_name, p.business_name, d.recipient_name, d.amount_minor::text, d.processed_at, d.note
           FROM pledges d JOIN participants p ON p.id = d.participant_id WHERE d.event_id = $1 ORDER BY d.recorded_at`, [e.id])).rows;
      return { name: `${e.join_code}-donations.csv`, body: csv([["Recorded", "Name", "Business", "Recipient", "Amount", "Processed", "Note"],
        ...rows.map(r => [r.recorded_at.toISOString(), r.display_name, r.business_name, r.recipient_name, formatMoney(Number(r.amount_minor)), r.processed_at?.toISOString() ?? "", r.note])]) };
    }
    if (kind === "participants") {
      const rows = (await db.query<{ display_name: string; business_name: string; created_at: Date; bids: number; pledged: string }>(
        `SELECT p.display_name, p.business_name, p.created_at, (SELECT count(*)::int FROM bids b WHERE b.participant_id = p.id) AS bids,
                (SELECT coalesce(sum(amount_minor), 0)::text FROM pledges d WHERE d.participant_id = p.id) AS pledged
           FROM participants p WHERE p.event_id = $1 ORDER BY p.created_at`, [e.id])).rows;
      return { name: `${e.join_code}-participants.csv`, body: csv([["Name", "Business", "Joined", "Bids", "Donated"],
        ...rows.map(r => [r.display_name, r.business_name, r.created_at.toISOString(), r.bids, formatMoney(Number(r.pledged))])]) };
    }
    throw notFound("This export");
  });
  return new Response(data.body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${data.name}"`, "Cache-Control": "private, no-store" } });
}

// ---------------------------------------------------------------- images

export async function uploadAsset(request: Request): Promise<Response> {
  sameOrigin(request);
  const staff = await tx(async db => staffFrom(db, request));
  const asset = await normalizeAsset(request);
  const row = await tx(async db => (await db.query<{ id: string }>(
    "INSERT INTO assets (org_id, mime, bytes, width, height, sha256, created_by) VALUES ($1, 'image/webp', $2, $3, $4, $5, $6) RETURNING id",
    [staff.orgId, asset.bytes, asset.width, asset.height, asset.sourceSha256, staff.id])).rows[0]);
  return json({ id: row.id, url: assetUrl(row.id) }, 201);
}

/** Images are addressed by unguessable id and are not sensitive. */
export async function readAsset(assetId: string): Promise<Response> {
  const row = await tx(async db => (await db.query<{ bytes: Buffer }>("SELECT bytes FROM assets WHERE id = $1", [id(assetId)])).rows[0]);
  if (!row) throw notFound("This image");
  return new Response(new Uint8Array(row.bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}

