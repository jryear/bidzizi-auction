#!/usr/bin/env node
// End-to-end host/join journey against a running app on a disposable database.
//   BASE=http://127.0.0.1:3410 HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/journey.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:3410";
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
await check("staff logout ends the session", async () => {
  await staff("POST", "/api/v1/host/logout", {});
  assert.equal((await staff("GET", "/api/v1/host/events")).status, 401);
});

const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
