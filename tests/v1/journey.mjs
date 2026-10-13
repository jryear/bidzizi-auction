#!/usr/bin/env node
// End-to-end host/join journey against a running app on a disposable database.
//   BASE=http://127.0.0.1:3410 HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/journey.mjs
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";

const BASE = process.env.BASE ?? "http://127.0.0.1:3410";
const localTestDb = /^postgres(?:ql)?:\/\/[^@]*@?127\.0\.0\.1:\d+\/bz_test_[a-z0-9_]+$/.test(process.env.BIDZIZI_DATABASE_URL ?? "")
  ? process.env.BIDZIZI_DATABASE_URL : null;
const results = [];
async function check(name, run) {
  try { await run(); results.push(["ok", name]); console.log(`ok   ${name}`); }
  catch (error) { results.push(["FAIL", name]); console.log(`FAIL ${name}\n     ${error.message}`); }
}

/** A browser-like client with its own cookie jar. */
function client() {
  const jar = new Map();
  return async function call(method, path, body) {
    const headers = { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(";"); const [k, ...v] = pair.split("=");
      if (/Max-Age=0/.test(set)) jar.delete(k); else jar.set(k, v.join("="));
    }
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, data: type.includes("json") ? await response.json() : await response.text() };
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();

const staff = client(), alice = client(), bob = client(), stranger = client();
let eventId, code, itemA, itemB, revision;

await check("staff login rejects a wrong password with a generic error", async () => {
  const r = await staff("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: "wrong-password" });
  assert.equal(r.status, 401); assert.equal(r.data.error.code, "LOGIN_FAILED");
});
await check("staff login succeeds", async () => {
  const r = await staff("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
await check("mutations from another origin are refused", async () => {
  const r = await fetch(BASE + "/api/v1/host/events", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
});
await check("create event (retry returns the same event)", async () => {
  const requestId = randomUUID(), body = { requestId, name: "Holiday Trade Show", startsAt: iso(-60_000), endsAt: iso(3_600_000) };
  const r1 = await staff("POST", "/api/v1/host/events", body), r2 = await staff("POST", "/api/v1/host/events", body);
  assert.equal(r1.status, 201); assert.equal(r1.data.id, r2.data.id);
  eventId = r1.data.id;
});
await check("add items (default tiers apply)", async () => {
  const a = await staff("POST", `/api/v1/host/events/${eventId}/items`, { requestId: randomUUID(), title: "Cabin weekend", openingMinor: 10_000 });
  const b = await staff("POST", `/api/v1/host/events/${eventId}/items`, { requestId: randomUUID(), title: "Coffee for a year", openingMinor: 5_000, closesAt: iso(12_000) });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  itemA = a.data.id; itemB = b.data.id;
});
await check("draft event is invisible to participants", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  code = w.data.event.code; revision = w.data.event.revision;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await stranger("GET", `/api/v1/e/${code}`)).status, 404);
});
await check("go live", async () => {
  const r = await staff("PATCH", `/api/v1/host/events/${eventId}`, { revision, status: "live" });
  assert.equal(r.status, 200, JSON.stringify(r.data)); revision = r.data.revision;
});
await check("stale event edit is refused", async () => {
  const r = await staff("PATCH", `/api/v1/host/events/${eventId}`, { revision: revision - 1, name: "x" });
  assert.equal(r.status, 409);
});
await check("participants join with a name and business", async () => {
  const a = await alice("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "Alice", businessName: "Juniper Co" });
  const b = await bob("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "Bob", businessName: "Harbor LLC" });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  const snap = await alice("GET", `/api/v1/e/${code}`);
  assert.equal(snap.data.me.displayName, "Alice"); assert.equal(snap.data.items.length, 2);
});
await check("lost join response: retry returns the same participant", async () => {
  const requestId = randomUUID(), c = client();
  const r1 = await c("POST", `/api/v1/e/${code}/join`, { requestId, displayName: "Cara", businessName: "Cedar" });
  const r2 = await c("POST", `/api/v1/e/${code}/join`, { requestId, displayName: "Cara", businessName: "Cedar" });
  assert.equal(r1.data.participantId, r2.data.participantId);
});
await check("bidding requires joining", async () => {
  const r = await stranger("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemA, amountMinor: 10_000 });
  assert.equal(r.status, 401);
});
await check("first bid at the opening amount is accepted", async () => {
  const r = await alice("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemA, amountMinor: 10_000 });
  assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.receipt.accepted, true);
  assert.equal(r.data.receipt.minimumNextMinor, 12_500);
});
await check("leader can't outbid themselves", async () => {
  const r = await alice("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemA, amountMinor: 20_000 });
  assert.equal(r.status, 409); assert.equal(r.data.receipt.reason, "ALREADY_LEADING");
});
await check("below the minimum is rejected with the minimum", async () => {
  const r = await bob("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemA, amountMinor: 12_000 });
  assert.equal(r.data.receipt.reason, "BELOW_MINIMUM"); assert.equal(r.data.receipt.minimumNextMinor, 12_500);
});
await check("duplicate taps record one bid; replay returns the original receipt", async () => {
  const requestId = randomUUID(), body = { requestId, itemId: itemA, amountMinor: 12_500 };
  const all = await Promise.all([bob("POST", `/api/v1/e/${code}/bid`, body), bob("POST", `/api/v1/e/${code}/bid`, body), bob("POST", `/api/v1/e/${code}/bid`, body)]);
  const ids = new Set(all.map(r => r.data.receipt.bidId));
  assert.equal(ids.size, 1); assert.ok([...ids][0]);
  assert.equal(all.filter(r => r.data.replay === false).length, 1);
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  assert.equal(w.data.items.find(i => i.id === itemA).bidCount, 2);
});
await check("reusing a request id for a different bid is refused", async () => {
  const requestId = randomUUID();
  await bob("POST", `/api/v1/e/${code}/bid`, { requestId, itemId: itemB, amountMinor: 5_000 });
  const r = await bob("POST", `/api/v1/e/${code}/bid`, { requestId, itemId: itemB, amountMinor: 9_000 });
  assert.equal(r.status, 409); assert.equal(r.data.error.code, "CONFLICT");
});
await check("simultaneous bids at the same amount: exactly one wins", async () => {
  const body = () => ({ requestId: randomUUID(), itemId: itemA, amountMinor: 15_000 });
  const c = client(); await c("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "Dee", businessName: "Delta" });
  const [r1, r2] = await Promise.all([alice("POST", `/api/v1/e/${code}/bid`, body()), c("POST", `/api/v1/e/${code}/bid`, body())]);
  assert.equal([r1, r2].filter(r => r.data.receipt?.accepted).length, 1, JSON.stringify([r1.data, r2.data]));
  const loser = [r1, r2].find(r => !r.data.receipt.accepted);
  assert.equal(loser.data.receipt.reason, "BELOW_MINIMUM");
});
await check("lost bid response: the receipt endpoint answers 'did it go through?'", async () => {
  const requestId = randomUUID();
  const placed = await bob("POST", `/api/v1/e/${code}/bid`, { requestId, itemId: itemA, amountMinor: 50_000 });
  const asked = await bob("GET", `/api/v1/e/${code}/receipt/${requestId}`);
  assert.deepEqual(asked.data.receipt, placed.data.receipt);
  const unknown = await bob("GET", `/api/v1/e/${code}/receipt/${randomUUID()}`);
  assert.equal(unknown.data.receipt, null);
});
await check("tier increments step up with the amount ($500 → $50 raise)", async () => {
  const snap = await alice("GET", `/api/v1/e/${code}`);
  const item = snap.data.items.find(i => i.id === itemA);
  assert.equal(item.currentMinor, 50_000); assert.equal(item.minimumNextMinor, 55_000); assert.equal(item.leader.name, "Bob");
});
await check("paused participant can't bid but still sees their receipts", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  const aliceId = w.data.participants.find(p => p.name === "Alice").id;
  await staff("PATCH", `/api/v1/host/events/${eventId}/participants/${aliceId}`, { canBid: false });
  const r = await alice("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemA, amountMinor: 55_000 });
  assert.equal(r.data.receipt.reason, "BIDDING_PAUSED");
  const snap = await alice("GET", `/api/v1/e/${code}`);
  assert.ok(snap.data.items.find(i => i.id === itemA).myBidCount >= 1);
  await staff("PATCH", `/api/v1/host/events/${eventId}/participants/${aliceId}`, { canBid: true });
});
await check("starting amount locks once bidding starts", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  const item = w.data.items.find(i => i.id === itemA);
  const r = await staff("PATCH", `/api/v1/host/items/${itemA}`, { revision: item.revision, openingMinor: 1 });
  assert.equal(r.status, 409);
  const ok = await staff("PATCH", `/api/v1/host/items/${itemA}`, { revision: item.revision, title: "Cabin weekend for four" });
  assert.equal(ok.status, 200);
});
await check("staff can shorten or extend a bid item's close with the five-minute safeguard", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  const item = w.data.items.find(i => i.id === itemA);
  const tooSoon = await staff("PATCH", `/api/v1/host/items/${itemA}`, { revision: item.revision, closesAt: iso(4 * 60_000) });
  assert.equal(tooSoon.status, 409);
  const shorter = await staff("PATCH", `/api/v1/host/items/${itemA}`, { revision: item.revision, closesAt: iso(8 * 60_000) });
  assert.equal(shorter.status, 200, JSON.stringify(shorter.data));
  const longer = await staff("PATCH", `/api/v1/host/items/${itemA}`, { revision: shorter.data.revision, closesAt: iso(55 * 60_000) });
  assert.equal(longer.status, 200, JSON.stringify(longer.data));
});
await check("donations: pledge once, retry is idempotent, over $10,000 refused", async () => {
  const rec = await staff("POST", `/api/v1/host/events/${eventId}/recipients`, { name: "Red Cross" });
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  await staff("PATCH", `/api/v1/host/events/${eventId}`, { revision: w.data.event.revision, donationsEnabled: true });
  const body = { requestId: randomUUID(), recipientId: rec.data.id, amountMinor: 5_000 };
  const [p1, p2] = await Promise.all([alice("POST", `/api/v1/e/${code}/pledge`, body), alice("POST", `/api/v1/e/${code}/pledge`, body)]);
  assert.equal(p1.data.pledge.id, p2.data.pledge.id);
  const big = await alice("POST", `/api/v1/e/${code}/pledge`, { requestId: randomUUID(), recipientId: rec.data.id, amountMinor: 1_000_001 });
  assert.equal(big.status, 400);
  const after = await staff("GET", `/api/v1/host/events/${eventId}`);
  assert.equal(after.data.pledges.length, 1);
});
await check("winner can't be assigned before the item closes", async () => {
  const r = await staff("POST", `/api/v1/host/items/${itemA}/award`, { action: "assign" });
  assert.equal(r.status, 409);
});
await check("after close: bids refused, winner assigned, retry is safe, winner sees it", async () => {
  // Item B closes ~12s after creation; Bob bid on it earlier.
  const w0 = await staff("GET", `/api/v1/host/events/${eventId}`);
  const wait = new Date(w0.data.items.find(i => i.id === itemB).effectiveClosesAt).getTime() - Date.now() + 500;
  if (wait > 0) await sleep(wait);
  const late = await alice("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemB, amountMinor: 9_000 });
  assert.equal(late.data.receipt.reason, "CLOSED");
  const assign = await staff("POST", `/api/v1/host/items/${itemB}/award`, { action: "assign", revision: 0 });
  assert.equal(assign.status, 200, JSON.stringify(assign.data));
  const retry = await staff("POST", `/api/v1/host/items/${itemB}/award`, { action: "assign", revision: 0 });
  assert.equal(retry.status, 200);
  await staff("PATCH", `/api/v1/host/events/${eventId}`, { revision: (await staff("GET", `/api/v1/host/events/${eventId}`)).data.event.revision, winnerInstructions: "Pick up at the front desk." });
  const snap = await bob("GET", `/api/v1/e/${code}`);
  const item = snap.data.items.find(i => i.id === itemB);
  assert.equal(item.award.isMe, true); assert.equal(snap.data.me.winnerInstructions, "Pick up at the front desk.");
  const notWinner = await alice("GET", `/api/v1/e/${code}`);
  assert.equal(notWinner.data.items.find(i => i.id === itemB).award.isMe, false); assert.equal(notWinner.data.me.winnerInstructions, "");
});
await check("fulfil with follow-up notes; stale revision refused", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  const award = w.data.items.find(i => i.id === itemB).award;
  const ok = await staff("POST", `/api/v1/host/items/${itemB}/award`, { action: "fulfilled", notes: "Picked up by Bob", revision: award.revision });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const stale = await staff("POST", `/api/v1/host/items/${itemB}/award`, { action: "notes", notes: "overwrite", revision: award.revision });
  assert.equal(stale.status, 409);
});
await check("lost phone: staff rejoin code moves Alice to a new device", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  const aliceId = w.data.participants.find(p => p.name === "Alice").id;
  const issued = await staff("POST", `/api/v1/host/events/${eventId}/participants/${aliceId}/rejoin`);
  const phone = client();
  const r = await phone("POST", `/api/v1/e/${code}/rejoin`, { code: issued.data.code });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await phone("GET", `/api/v1/e/${code}`)).data.me.displayName, "Alice");
  assert.equal((await alice("GET", `/api/v1/e/${code}`)).data.me, null, "old device signed out");
  assert.equal((await phone("POST", `/api/v1/e/${code}/rejoin`, { code: issued.data.code })).status, 400, "single use");
});
await check("exports download as CSV", async () => {
  for (const kind of ["results", "donations", "participants"]) {
    const r = await staff("GET", `/api/v1/host/events/${eventId}/export/${kind}`);
    assert.equal(r.status, 200); assert.match(r.data, /\r\n/);
  }
});
await check("duplicate event copies setup and items, not activity", async () => {
  const r = await staff("POST", `/api/v1/host/events/${eventId}/duplicate`, { requestId: randomUUID() });
  const w = await staff("GET", `/api/v1/host/events/${r.data.id}`);
  assert.equal(w.data.event.status, "draft"); assert.equal(w.data.items.length, 2);
  assert.equal(w.data.participants.length, 0); assert.equal(w.data.items.every(i => i.bidCount === 0), true);
  assert.equal(w.data.recipients.length, 1); assert.notEqual(w.data.event.code, code);
});
await check("editing a participant changes the event identity shown on their phone", async () => {
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  const bobId = w.data.participants.find(p => p.name === "Bob").id;
  const r = await staff("PATCH", `/api/v1/host/events/${eventId}/participants/${bobId}`, { name: "Robert", business: "Harbor Studio" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const snap = await bob("GET", `/api/v1/e/${code}`);
  assert.equal(snap.data.me.displayName, "Robert"); assert.equal(snap.data.me.businessName, "Harbor Studio");
});
await check("voiding an awarded bid clears the award, preserves receipt and reveals a no-winner state", async () => {
  const before = await staff("GET", `/api/v1/host/events/${eventId}`);
  const bidId = before.data.items.find(i => i.id === itemB).award.bidId;
  const first = await staff("POST", `/api/v1/host/items/${itemB}/void-bid`, { bidId, reason: "Mistaken amount" });
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.currentMinor, null);
  const again = await staff("POST", `/api/v1/host/items/${itemB}/void-bid`, { bidId, reason: "Mistaken amount" });
  assert.equal(again.data.replay, true);
  const w = await staff("GET", `/api/v1/host/events/${eventId}`);
  assert.equal(w.data.items.find(i => i.id === itemB).award.status, "no_winner");
  assert.equal(w.data.items.find(i => i.id === itemB).bids.find(b => b.id === bidId).voided, true);
  const snap = await bob("GET", `/api/v1/e/${code}`);
  assert.equal(snap.data.items.find(i => i.id === itemB).myBidCount, 0);
  assert.equal(snap.data.me.winnerInstructions, "");
});
let practiceId, practiceCode, practiceItem, practiceAliceBid, practiceBobBid, practiceNewBid;
const practiceAlice = client(), practiceBob = client();
await check("practice event can be created and run by staff", async () => {
  assert.equal((await staff("POST", `/api/v1/host/events/${eventId}/reset`, { requestId: randomUUID() })).status, 409, "real event cannot be reset");
  assert.equal((await staff("DELETE", `/api/v1/host/events/${eventId}`)).status, 409, "joined real event cannot be deleted");
  const create = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Rehearsal", isPractice: true, startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  assert.equal(create.status, 201); practiceId = create.data.id;
  practiceItem = (await staff("POST", `/api/v1/host/events/${practiceId}/items`, { requestId: randomUUID(), title: "Practice item", openingMinor: 10_000 })).data.id;
  const w = await staff("GET", `/api/v1/host/events/${practiceId}`);
  practiceCode = w.data.event.code; assert.equal(w.data.event.isPractice, true);
  assert.equal((await staff("PATCH", `/api/v1/host/events/${practiceId}`, { revision: w.data.event.revision, status: "live" })).status, 200);
  assert.equal((await practiceAlice("POST", `/api/v1/e/${practiceCode}/join`, { requestId: randomUUID(), displayName: "Pat", businessName: "One" })).status, 201);
  assert.equal((await practiceBob("POST", `/api/v1/e/${practiceCode}/join`, { requestId: randomUUID(), displayName: "Lee", businessName: "Two" })).status, 201);
});
await check("void of current leader recalculates exact standing and sequence stays monotonic", async () => {
  practiceAliceBid = (await practiceAlice("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 10_000 })).data.receipt.bidId;
  practiceBobBid = (await practiceBob("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 12_500 })).data.receipt.bidId;
  const third = await practiceAlice("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 15_000 });
  assert.equal(third.status, 201); practiceNewBid = third.data.receipt.bidId;
  const v = await staff("POST", `/api/v1/host/items/${practiceItem}/void-bid`, { bidId: practiceNewBid, reason: "Test mistake" });
  assert.equal(v.status, 200, JSON.stringify(v.data)); assert.equal(v.data.currentMinor, 12_500); assert.equal(v.data.leadingBidId, practiceBobBid); assert.equal(v.data.bidCount, 2);
  const again = await staff("POST", `/api/v1/host/items/${practiceItem}/void-bid`, { bidId: practiceNewBid, reason: "Test mistake" });
  assert.equal(again.data.replay, true); assert.equal((await practiceBob("GET", `/api/v1/e/${practiceCode}`)).data.items[0].leader.isMe, true);
  const next = await practiceAlice("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 15_000 });
  assert.equal(next.status, 201, JSON.stringify(next.data));
  const w = await staff("GET", `/api/v1/host/events/${practiceId}`);
  assert.equal(w.data.items[0].bidCount, 3); assert.equal(w.data.items[0].bids.filter(b => b.voided).length, 1);
  const history = (await practiceBob("GET", `/api/v1/e/${practiceCode}`)).data.items[0].bidHistory;
  assert.equal(history.length, 4); assert.equal(history.some(h => h.id === practiceNewBid && h.voided), true);
  assert.equal(Object.hasOwn(history[0], "name"), false, "public bid history does not reveal bidder names");
});
await check("voiding a nonleader preserves standing; concurrent bid and void serialize correctly", async () => {
  const first = await staff("POST", `/api/v1/host/items/${practiceItem}/void-bid`, { bidId: practiceAliceBid, reason: "Practice correction" });
  assert.equal(first.status, 200); assert.equal(first.data.currentMinor, 15_000); assert.equal(first.data.bidCount, 2);
  const charlie = client();
  await charlie("POST", `/api/v1/e/${practiceCode}/join`, { requestId: randomUUID(), displayName: "Sam", businessName: "Three" });
  const leader = (await staff("GET", `/api/v1/host/events/${practiceId}`)).data.items[0].bids.find(b => !b.voided && b.amountMinor === 15_000).id;
  const [bid, voided] = await Promise.all([
    charlie("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 17_500 }),
    staff("POST", `/api/v1/host/items/${practiceItem}/void-bid`, { bidId: leader, reason: "Concurrent correction" }),
  ]);
  assert.equal(bid.status, 201, JSON.stringify(bid.data)); assert.equal(voided.status, 200, JSON.stringify(voided.data));
  const w = await staff("GET", `/api/v1/host/events/${practiceId}`);
  const active = w.data.items[0].bids.filter(b => !b.voided);
  assert.equal(w.data.items[0].currentMinor, 17_500);
  assert.equal(w.data.items[0].bidCount, active.length);
  assert.equal(w.data.items[0].leader.name, "Sam");
  for (const old of active) {
    assert.equal((await staff("POST", `/api/v1/host/items/${practiceItem}/void-bid`, { bidId: old.id, reason: "Clear practice bids" })).status, 200);
  }
  const empty = await staff("GET", `/api/v1/host/events/${practiceId}`);
  assert.equal(empty.data.items[0].currentMinor, null); assert.equal(empty.data.items[0].bidCount, 0);
  assert.equal(empty.data.items[0].hasBids, true, "history remains after every bid is void");
  const itemRevision = empty.data.items[0].revision;
  for (const edit of [{ openingMinor: 1 }, { incrementOverrideMinor: 100 }, { opensAt: iso(-120_000) }, { ready: false }]) {
    const changed = await staff("PATCH", `/api/v1/host/items/${practiceItem}`, { revision: itemRevision, ...edit });
    assert.equal(changed.status, 409, `historical bid must lock ${Object.keys(edit)[0]}`);
  }
  const fresh = await practiceBob("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 10_000 });
  assert.equal(fresh.status, 201, JSON.stringify(fresh.data));
});
await check("withdrawing a bid-holding item keeps a clear bidder message and blocks new bids", async () => {
  const r = await staff("POST", `/api/v1/host/items/${practiceItem}/withdraw`, { message: "This item is unavailable. Staff will follow up." });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const snap = await practiceBob("GET", `/api/v1/e/${practiceCode}`);
  assert.equal(snap.data.items[0].withdrawn, true); assert.match(snap.data.items[0].withdrawalMessage, /unavailable/);
  const bid = await practiceBob("POST", `/api/v1/e/${practiceCode}/bid`, { requestId: randomUUID(), itemId: practiceItem, amountMinor: 17_500 });
  assert.equal(bid.data.receipt.reason, "NOT_AVAILABLE");
});
await check("reset practice removes all people and bids, restores withdrawn item, and rotates join code", async () => {
  const requestId = randomUUID();
  const r = await staff("POST", `/api/v1/host/events/${practiceId}/reset`, { requestId });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.notEqual(r.data.code, practiceCode);
  assert.equal((await practiceBob("GET", `/api/v1/e/${practiceCode}`)).status, 404);
  const w = await staff("GET", `/api/v1/host/events/${practiceId}`);
  assert.equal(w.data.event.status, "draft"); assert.equal(w.data.participants.length, 0);
  assert.equal(w.data.items[0].bidCount, 0); assert.equal(w.data.items[0].withdrawn, false);
  assert.equal(w.data.items[0].hasBids, false);
  const live = await staff("PATCH", `/api/v1/host/events/${practiceId}`, { revision: w.data.event.revision, status: "live" });
  assert.equal(live.status, 200);
  const newPhone = client();
  assert.equal((await newPhone("POST", `/api/v1/e/${r.data.code}/join`, { requestId: randomUUID(), displayName: "New run", businessName: "Test" })).status, 201);
  const replay = await staff("POST", `/api/v1/host/events/${practiceId}/reset`, { requestId });
  assert.deepEqual(replay.data, r.data, "lost-response retry returns the original reset decision");
  const afterReplay = await staff("GET", `/api/v1/host/events/${practiceId}`);
  assert.equal(afterReplay.data.participants.length, 1, "retry does not erase the new run");
  assert.equal(afterReplay.data.event.code, r.data.code, "retry does not rotate again");
});
await check("staff can delete practice and unjoined draft events; archived drafts vanish from join", async () => {
  assert.equal((await staff("DELETE", `/api/v1/host/events/${practiceId}`)).status, 200);
  assert.equal((await staff("GET", `/api/v1/host/events/${practiceId}`)).status, 404);
  const joinedPractice = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Disposable rehearsal", isPractice: true, startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  const jp = await staff("GET", `/api/v1/host/events/${joinedPractice.data.id}`);
  await staff("PATCH", `/api/v1/host/events/${joinedPractice.data.id}`, { revision: jp.data.event.revision, status: "live" });
  const guest = client();
  assert.equal((await guest("POST", `/api/v1/e/${jp.data.event.code}/join`, { requestId: randomUUID(), displayName: "Guest", businessName: "Guest" })).status, 201);
  assert.equal((await staff("DELETE", `/api/v1/host/events/${joinedPractice.data.id}`)).status, 200, "joined practice is disposable");
  assert.equal((await guest("GET", `/api/v1/e/${jp.data.event.code}`)).status, 404);
  const a = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Unused draft", startsAt: iso(60_000), endsAt: iso(3_600_000) });
  const d = await staff("POST", `/api/v1/host/events/${a.data.id}/archive`, {});
  assert.equal(d.status, 200);
  assert.ok((await staff("GET", "/api/v1/host/events")).data.events.find(e => e.id === a.data.id).archivedAt);
  assert.equal((await staff("POST", `/api/v1/host/events/${a.data.id}/restore`, {})).status, 200);
  assert.equal((await staff("GET", `/api/v1/host/events/${a.data.id}`)).data.event.archivedAt, null);
  assert.equal((await staff("DELETE", `/api/v1/host/events/${a.data.id}`)).status, 200);
});
if (localTestDb) await check("another organization cannot manage this event or its staff", async () => {
  const otherEmail = `other-${randomUUID()}@example.com`, otherPassword = `safe-${randomUUID()}`;
  execFileSync(process.execPath, ["scripts/provision-staff.mjs", "--org", `other-${randomUUID().slice(0, 8)}`, "--org-name", "Other Org", "--email", otherEmail, "--name", "Other Host"],
    { env: { ...process.env, BIDZIZI_DATABASE_URL: localTestDb, BIDZIZI_STAFF_PASSWORD: otherPassword }, stdio: "pipe" });
  const other = client();
  assert.equal((await other("POST", "/api/v1/host/login", { email: otherEmail, password: otherPassword })).status, 200);
  assert.equal((await other("GET", `/api/v1/host/events/${eventId}`)).status, 404);
  assert.equal((await other("POST", `/api/v1/host/items/${itemA}/void-bid`, { bidId: randomUUID(), reason: "No access" })).status, 404);
  assert.equal((await other("POST", `/api/v1/host/items/${itemA}/withdraw`, { message: "No access" })).status, 404);
  const me = await staff("GET", "/api/v1/host/staff");
  const hostId = me.data.staff.find(s => s.email === process.env.HOST_EMAIL).id;
  assert.equal((await other("POST", `/api/v1/host/staff/${hostId}/password-reset`, {})).status, 404);
});
await check("staff invitation and reset use one-time password setup and revoke old sessions", async () => {
  const helperEmail = `helper-${randomUUID()}@example.com`;
  const invite = await staff("POST", "/api/v1/host/staff/invites", { email: helperEmail, name: "Helper" });
  assert.equal(invite.status, 201, JSON.stringify(invite.data));
  const token = new URL(invite.data.setupUrl).hash.slice("#token=".length);
  const reissued = await staff("POST", `/api/v1/host/staff/${invite.data.id}/password-reset`, {});
  assert.equal(reissued.status, 200, JSON.stringify(reissued.data));
  let reissuedToken = new URL(reissued.data.setupUrl).hash.slice("#token=".length);
  const helper = client();
  assert.equal((await helper("POST", "/api/v1/host/login", { email: helperEmail, password: "test-password-123" })).status, 401);
  assert.equal((await helper("POST", "/api/v1/host/password/set", { token, password: "test-password-123" })).status, 400, "superseded invite is invalid");
  if (localTestDb) {
    const database = new pg.Client({ connectionString: localTestDb });
    await database.connect();
    try {
      const hash = createHash("sha256").update(`staff-password:${reissuedToken}`).digest("hex");
      await database.query("UPDATE staff_password_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [hash]);
    } finally { await database.end(); }
    assert.equal((await helper("POST", "/api/v1/host/password/set", { token: reissuedToken, password: "test-password-123" })).status, 400, "expired invite is invalid");
    const fresh = await staff("POST", `/api/v1/host/staff/${invite.data.id}/password-reset`, {});
    assert.equal(fresh.status, 200); reissuedToken = new URL(fresh.data.setupUrl).hash.slice("#token=".length);
  }
  assert.equal((await helper("POST", "/api/v1/host/password/set", { token: reissuedToken, password: "test-password-123" })).status, 200);
  assert.equal((await helper("POST", "/api/v1/host/password/set", { token: reissuedToken, password: "test-password-123" })).status, 400);
  assert.equal((await helper("POST", "/api/v1/host/login", { email: helperEmail, password: "test-password-123" })).status, 200);
  const listed = await staff("GET", "/api/v1/host/staff");
  assert.equal(listed.data.staff.find(s => s.email === helperEmail).active, true);
  const reset = await staff("POST", `/api/v1/host/staff/${invite.data.id}/password-reset`, {});
  assert.equal(reset.status, 200);
  const resetToken = new URL(reset.data.setupUrl).hash.slice("#token=".length);
  assert.equal((await helper("POST", "/api/v1/host/password/set", { token: resetToken, password: "a-new-password-123" })).status, 200);
  assert.equal((await helper("GET", "/api/v1/host/events")).status, 401, "old helper session revoked");
  assert.equal((await helper("POST", "/api/v1/host/login", { email: helperEmail, password: "test-password-123" })).status, 401);
  assert.equal((await helper("POST", "/api/v1/host/login", { email: helperEmail, password: "a-new-password-123" })).status, 200);
});
await check("donations appear only while the event has a nonprofit, and close at the deadline (no switch)", async () => {
  const ev = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Donation rule " + randomUUID().slice(0, 6), startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  await staff("POST", `/api/v1/host/events/${ev.data.id}/items`, { requestId: randomUUID(), title: "Any prize", openingMinor: 10_000 });
  let w = await staff("GET", `/api/v1/host/events/${ev.data.id}`);
  await staff("PATCH", `/api/v1/host/events/${ev.data.id}`, { revision: w.data.event.revision, status: "live", donationsEnabled: true });
  w = await staff("GET", `/api/v1/host/events/${ev.data.id}`);
  const ecode = w.data.event.code, guest = client();
  await guest("POST", `/api/v1/e/${ecode}/join`, { requestId: randomUUID(), displayName: "Gia Giver", businessName: "Kind Co" });
  const donations = async () => (await guest("GET", `/api/v1/e/${ecode}`)).data.event.donations;
  assert.equal((await donations()).enabled, false, "the old switch alone no longer turns donations on");
  const rec = await staff("POST", `/api/v1/host/events/${ev.data.id}/recipients`, { name: "Food Bank" });
  let d = await donations();
  assert.equal(d.enabled, true); assert.equal(d.open, true); assert.equal(d.recipients.length, 1);
  assert.ok([200, 201].includes((await guest("POST", `/api/v1/e/${ecode}/pledge`, { requestId: randomUUID(), recipientId: rec.data.id, amountMinor: 2_500 })).status));
  w = await staff("GET", `/api/v1/host/events/${ev.data.id}`);
  await staff("PATCH", `/api/v1/host/events/${ev.data.id}`, { revision: w.data.event.revision, donationDeadline: iso(-1_000) });
  d = await donations();
  assert.equal(d.enabled, true); assert.equal(d.open, false, "closed after the deadline");
  assert.equal((await guest("POST", `/api/v1/e/${ecode}/pledge`, { requestId: randomUUID(), recipientId: rec.data.id, amountMinor: 2_500 })).status, 403);
  await staff("DELETE", `/api/v1/host/events/${ev.data.id}/recipients/${rec.data.id}`);
  d = await donations();
  assert.equal(d.enabled, false, "removing the last nonprofit turns donations off"); assert.equal(d.recipients.length, 0);
  assert.equal((await staff("GET", `/api/v1/host/events/${ev.data.id}`)).data.pledges.length, 1, "recorded pledges are kept");
});

// ---------------------------------------------------------------- bidder visibility (passthrough 1)
let vis;
async function visibilityEvent() {
  const ev = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Visibility check " + randomUUID().slice(0, 6), startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  const item = await staff("POST", `/api/v1/host/events/${ev.data.id}/items`, { requestId: randomUUID(), title: "Visible prize", openingMinor: 10_000 });
  const item2 = await staff("POST", `/api/v1/host/events/${ev.data.id}/items`, { requestId: randomUUID(), title: "Second prize", openingMinor: 10_000, closesAt: iso(9_000) });
  let w = await staff("GET", `/api/v1/host/events/${ev.data.id}`);
  await staff("PATCH", `/api/v1/host/events/${ev.data.id}`, { revision: w.data.event.revision, status: "live" });
  w = await staff("GET", `/api/v1/host/events/${ev.data.id}`);
  const p1 = client(), p2 = client(), p3 = client();
  const join = (c, n, b) => c("POST", `/api/v1/e/${w.data.event.code}/join`, { requestId: randomUUID(), displayName: n, businessName: b });
  await join(p1, "Vera Secret", "Hidden Holdings"); await join(p2, "Walt Watcher", "Open Books"); await join(p3, "Xena Third", "Third Co");
  const bid = (c, itemId, amountMinor) => c("POST", `/api/v1/e/${w.data.event.code}/bid`, { requestId: randomUUID(), itemId, amountMinor });
  assert.equal((await bid(p1, item.data.id, 10_000)).data.receipt.accepted, true);
  assert.equal((await bid(p1, item2.data.id, 10_000)).data.receipt.accepted, true);
  return { id: ev.data.id, code: w.data.event.code, itemId: item.data.id, item2Id: item2.data.id, p1, p2, p3 };
}
const setDisplay = async (mode) => {
  const w = await staff("GET", `/api/v1/host/events/${vis.id}`);
  return staff("PATCH", `/api/v1/host/events/${vis.id}`, { revision: w.data.event.revision, bidderDisplay: mode });
};
const leaderSeenBy = async (c) => (await c("GET", `/api/v1/e/${vis.code}`)).data.items.find(i => i.id === vis.itemId).leader;

await check("bidder visibility defaults to name and business for other guests", async () => {
  vis = await visibilityEvent();
  const w = await staff("GET", `/api/v1/host/events/${vis.id}`);
  assert.equal(w.data.event.bidderDisplay, "name_business");
  assert.deepEqual(await leaderSeenBy(vis.p2), { name: "Vera Secret", business: "Hidden Holdings", isMe: false });
  assert.equal((await leaderSeenBy(vis.p1)).isMe, true, "the leader sees themselves");
  assert.equal((await setDisplay("everyone")).status, 400, "unknown modes are rejected");
});
await check("business only: other guests and the stage never receive the bidder's name", async () => {
  assert.equal((await setDisplay("business")).status, 200);
  const raw = JSON.stringify((await vis.p2("GET", `/api/v1/e/${vis.code}`)).data);
  assert.ok(!raw.includes("Vera Secret"), "name absent from the whole participant snapshot");
  assert.deepEqual(await leaderSeenBy(vis.p2), { name: "", business: "Hidden Holdings", isMe: false });
  const stage = await staff("GET", `/api/v1/host/events/${vis.id}/stage`);
  assert.equal(stage.status, 200);
  assert.ok(!JSON.stringify(stage.data).includes("Vera Secret"), "name absent from the stage view");
  const leader = await leaderSeenBy(vis.p1);
  assert.equal(leader.name, "Vera Secret", "a bidder still sees their own name");
});
await check("anonymous: stable per-event bidder numbers; names and businesses never reach phones or the stage", async () => {
  assert.equal((await setDisplay("anonymous")).status, 200);
  const seen = await leaderSeenBy(vis.p2);
  assert.deepEqual(seen, { name: "", business: "Bidder 1", isMe: false });
  // The number is stable across items, reloads and leadership changes.
  assert.equal((await vis.p3("GET", `/api/v1/e/${vis.code}`)).data.items.find(i => i.id === vis.item2Id).leader.business, "Bidder 1");
  const minOf = async (c) => (await c("GET", `/api/v1/e/${vis.code}`)).data.items.find(i => i.id === vis.itemId).minimumNextMinor;
  assert.equal((await vis.p2("POST", `/api/v1/e/${vis.code}/bid`, { requestId: randomUUID(), itemId: vis.itemId, amountMinor: await minOf(vis.p2) })).data.receipt.accepted, true);
  assert.equal((await leaderSeenBy(vis.p3)).business, "Bidder 2");
  assert.equal((await vis.p1("POST", `/api/v1/e/${vis.code}/bid`, { requestId: randomUUID(), itemId: vis.itemId, amountMinor: await minOf(vis.p1) })).data.receipt.accepted, true);
  assert.equal((await leaderSeenBy(vis.p3)).business, "Bidder 1", "same bidder, same number");
  for (const c of [vis.p2, vis.p3]) {
    const raw = JSON.stringify((await c("GET", `/api/v1/e/${vis.code}`)).data);
    assert.ok(!raw.includes("Vera Secret") && !raw.includes("Hidden Holdings"), "no real identity in another guest's snapshot");
  }
  const stage = JSON.stringify((await staff("GET", `/api/v1/host/events/${vis.id}/stage`)).data);
  assert.ok(!stage.includes("Vera Secret") && !stage.includes("Hidden Holdings") && !stage.includes("Walt Watcher"), "no real identity on the stage");
  assert.ok(stage.includes("Bidder 1") && stage.includes("Bidder 2"));
  assert.equal((await vis.p1("GET", `/api/v1/e/${vis.code}`)).data.me.bidderNumber, 1);
});
await check("anonymous: winners are masked for other guests; staff always see full identities", async () => {
  await sleep(Math.max(0, 9_500));
  let w = await staff("GET", `/api/v1/host/events/${vis.id}`);
  const second = w.data.items.find(i => i.id === vis.item2Id);
  assert.equal(second.phase, "closed");
  assert.equal((await staff("POST", `/api/v1/host/items/${vis.item2Id}/award`, { action: "assign", revision: 0 })).status, 200);
  const other = (await vis.p2("GET", `/api/v1/e/${vis.code}`)).data.items.find(i => i.id === vis.item2Id);
  assert.deepEqual(other.award.winner, { name: "", business: "Bidder 1" });
  const mine = (await vis.p1("GET", `/api/v1/e/${vis.code}`)).data.items.find(i => i.id === vis.item2Id);
  assert.equal(mine.award.isMe, true); assert.equal(mine.award.winner.name, "Vera Secret");
  w = await staff("GET", `/api/v1/host/events/${vis.id}`);
  const first = w.data.items.find(i => i.id === vis.itemId);
  assert.equal(first.leader.name, "Vera Secret"); assert.equal(first.leader.business, "Hidden Holdings");
  assert.ok(w.data.activity.some(a => a.name === "Walt Watcher"), "staff feed keeps full names");
  const csv = await staff("GET", `/api/v1/host/events/${vis.id}/export/participants`);
  assert.ok(String(csv.data).includes("Vera Secret"), "exports keep full names");
});
await check("bidder numbers are unique under concurrent joins", async () => {
  const many = Array.from({ length: 8 }, () => client());
  await Promise.all(many.map((c, n) => c("POST", `/api/v1/e/${vis.code}/join`, { requestId: randomUUID(), displayName: `Guest ${n}`, businessName: `Biz ${n}` })));
  const numbers = await Promise.all(many.map(async c => (await c("GET", `/api/v1/e/${vis.code}`)).data.me.bidderNumber));
  assert.equal(new Set(numbers).size, numbers.length, `duplicates in ${numbers}`);
  assert.deepEqual([...numbers].sort((a, b) => a - b), [4, 5, 6, 7, 8, 9, 10, 11]);
});

await check("staff logout ends the session", async () => {
  await staff("POST", "/api/v1/host/logout", {});
  assert.equal((await staff("GET", "/api/v1/host/events")).status, 401);
});

const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
