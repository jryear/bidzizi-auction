#!/usr/bin/env node
// Races on staff and guest money paths, against a running local app and its disposable database.
//   BASE=http://127.0.0.1:3481 BIDZIZI_DATABASE_URL=postgres://bz@127.0.0.1:PORT/bz_test_x \
//   HOST_EMAIL=... HOST_PASSWORD=... node tests/db/races.mjs
// The host account must be an owner (scripts/provision-staff.mjs creates owners).
import assert from "node:assert/strict";
import { randomBytes, randomUUID, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import { appDbUrl, check, client, done, sleep } from "./lib.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3481";
const db = new pg.Client({ connectionString: appDbUrl() }); await db.connect();
const scrypt = promisify(scryptCb);
const iso = ms => new Date(Date.now() + ms).toISOString();
const ip = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

async function hash(password) {
  const salt = randomBytes(16), key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}
async function owner() {
  const c = client(BASE, { "x-forwarded-for": ip() });
  const r = await c("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return c;
}
/** A staff account in the owner's org, created directly with a known password. */
async function colleague(password, role = "staff") {
  const email = `rae-${randomBytes(4).toString("hex")}@example.test`;
  const row = (await db.query(
    `INSERT INTO staff (org_id, email, name, password_hash, role) SELECT org_id, $2, 'Rae Colleague', $3, $4 FROM staff WHERE email = $1 RETURNING id`,
    [process.env.HOST_EMAIL, email, await hash(password), role])).rows[0];
  return { id: row.id, email };
}
async function liveEvent(staff, items) {
  const e = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Race test", startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  assert.equal(e.status, 201, JSON.stringify(e.data));
  const ids = [];
  for (const it of items) {
    const r = await staff("POST", `/api/v1/host/events/${e.data.id}/items`, { requestId: randomUUID(), title: "Race item", openingMinor: 10_000, ...it });
    assert.equal(r.status, 201, JSON.stringify(r.data)); ids.push(r.data.id);
  }
  const w = await staff("GET", `/api/v1/host/events/${e.data.id}`);
  const live = await staff("PATCH", `/api/v1/host/events/${e.data.id}`, { revision: w.data.event.revision, status: "live" });
  assert.equal(live.status, 200, JSON.stringify(live.data));
  return { eventId: e.data.id, code: w.data.event.code, items: ids };
}

await check("staff login: a parallel burst against one email gets at most 5 password checks", async () => {
  const { email } = await colleague("correct-horse-battery");
  const all = await Promise.all(Array.from({ length: 30 }, () =>
    client(BASE, { "x-forwarded-for": ip() })("POST", "/api/v1/host/login", { email, password: "wrong-password-x" })));
  const counted = all.filter(r => r.status === 401).length, limited = all.filter(r => r.status === 429).length;
  assert.equal(counted + limited, 30, JSON.stringify(all.map(r => r.status)));
  assert.ok(counted <= 5, `${counted} password checks ran`);
});

await check("staff login: a parallel burst from one IP gets at most 20 password checks", async () => {
  const from = ip();
  const all = await Promise.all(Array.from({ length: 40 }, (_, i) =>
    client(BASE, { "x-forwarded-for": from })("POST", "/api/v1/host/login", { email: `nobody-${i}-${randomBytes(3).toString("hex")}@example.test`, password: "wrong-password-x" })));
  assert.ok(all.filter(r => r.status === 401).length <= 20, JSON.stringify(all.map(r => r.status)));
});

await check("staff login: a correct password still signs in, and success doesn't count toward the limit", async () => {
  const pw = "correct-horse-battery", { email } = await colleague(pw);
  const from = ip();
  for (let i = 0; i < 6; i++) assert.equal((await client(BASE, { "x-forwarded-for": from })("POST", "/api/v1/host/login", { email, password: pw })).status, 200);
});

await check("staff login: a password reset that lands mid-login leaves no session for the old password", async () => {
  const pw = "old-password-123", { id, email } = await colleague(pw);
  const reset = new pg.Client({ connectionString: appDbUrl() }); await reset.connect();
  try {
    await reset.query("BEGIN");
    await reset.query("SELECT 1 FROM staff WHERE id = $1 FOR UPDATE", [id]); // a reset in progress
    const c = client(BASE, { "x-forwarded-for": ip() });
    const pending = c("POST", "/api/v1/host/login", { email, password: pw });
    await sleep(1500); // the login has verified the old password by now and is waiting for the row
    await reset.query("UPDATE staff SET password_hash = $2 WHERE id = $1", [id, await hash("new-password-456")]);
    await reset.query("UPDATE staff_sessions SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL", [id]);
    await reset.query("COMMIT");
    const r = await pending;
    assert.equal(r.status, 401, JSON.stringify(r.data));
    const live = (await db.query("SELECT count(*)::int AS n FROM staff_sessions WHERE staff_id = $1 AND revoked_at IS NULL", [id])).rows[0].n;
    assert.equal(live, 0);
  } finally { await reset.end(); }
});

await check("owners only: a staff member can't reset a colleague's password or remove access, but can reset their own", async () => {
  const pw = "staff-password-1", me = await colleague(pw), other = await colleague("other-password-1");
  const c = client(BASE, { "x-forwarded-for": ip() });
  assert.equal((await c("POST", "/api/v1/host/login", { email: me.email, password: pw })).status, 200);
  const list = await c("GET", "/api/v1/host/staff");
  assert.equal(list.data.you.role, "staff");
  assert.equal((await c("POST", `/api/v1/host/staff/${other.id}/password-reset`, {})).status, 403);
  assert.equal((await c("POST", `/api/v1/host/staff/${other.id}/deactivate`, {})).status, 403);
  const self = await c("POST", `/api/v1/host/staff/${me.id}/password-reset`, {});
  assert.equal(self.status, 200); assert.match(self.data.setupUrl, /#token=/);
});

await check("remove access: signs the colleague out now, voids their links, blocks login; an owner can restore it", async () => {
  const pw = "staff-password-2", them = await colleague(pw), o = await owner();
  const c = client(BASE, { "x-forwarded-for": ip() });
  assert.equal((await c("POST", "/api/v1/host/login", { email: them.email, password: pw })).status, 200);
  const link = await o("POST", `/api/v1/host/staff/${them.id}/password-reset`, {});
  const token = link.data.setupUrl.split("#token=")[1];
  const r = await o("POST", `/api/v1/host/staff/${them.id}/deactivate`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await o("POST", `/api/v1/host/staff/${them.id}/deactivate`, {})).data.replay, true);
  assert.equal((await c("GET", "/api/v1/host/events")).status, 401, "existing session must end");
  assert.equal((await client(BASE, { "x-forwarded-for": ip() })("POST", "/api/v1/host/login", { email: them.email, password: pw })).status, 401);
  assert.equal((await client(BASE)("POST", "/api/v1/host/password/set", { token, password: "a-new-password-99" })).status, 400, "old link must be void");
  const listed = (await o("GET", "/api/v1/host/staff")).data.staff.find(s => s.id === them.id);
  assert.equal(listed.status, "deactivated");
  const restore = await o("POST", `/api/v1/host/staff/${them.id}/password-reset`, {});
  const token2 = restore.data.setupUrl.split("#token=")[1];
  assert.equal((await client(BASE)("POST", "/api/v1/host/password/set", { token: token2, password: "restored-password-7" })).status, 200);
  assert.equal((await client(BASE, { "x-forwarded-for": ip() })("POST", "/api/v1/host/login", { email: them.email, password: "restored-password-7" })).status, 200);
  assert.equal((await o("GET", "/api/v1/host/staff")).data.staff.find(s => s.id === them.id).status, "active");
});

await check("owners can't remove their own access", async () => {
  const o = await owner(), me = (await o("GET", "/api/v1/host/staff")).data.you;
  assert.equal(me.role, "owner");
  assert.equal((await o("POST", `/api/v1/host/staff/${me.id}/deactivate`, {})).status, 409);
});

await check("join: racing retries of one join create one participant, and every reply is usable", async () => {
  const o = await owner(), { code } = await liveEvent(o, [{}]);
  const requestId = randomUUID(), clients = Array.from({ length: 6 }, () => client(BASE));
  const all = await Promise.all(clients.map(c => c("POST", `/api/v1/e/${code}/join`, { requestId, displayName: "Racer", businessName: "Race Co" })));
  assert.deepEqual(all.map(r => r.status), Array(6).fill(201), JSON.stringify(all.map(r => r.data)));
  assert.equal(new Set(all.map(r => r.data.participantId)).size, 1);
  const n = (await db.query("SELECT count(*)::int AS n FROM participants WHERE join_request_id = $1", [requestId])).rows[0].n;
  assert.equal(n, 1);
});

await check("winners: a withdrawal that commits while a winner is being chosen wins; no award on a withdrawn item", async () => {
  const o = await owner(), { code, items: [itemId] } = await liveEvent(o, [{ closesAt: iso(4_000) }]);
  const guest = client(BASE);
  await guest("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "Win", businessName: "Win Co" });
  assert.equal((await guest("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId, amountMinor: 10_000 })).status, 201);
  await sleep(4_500);
  const w = new pg.Client({ connectionString: appDbUrl() }); await w.connect();
  try {
    await w.query("BEGIN"); // a withdrawal holding the item and its standing, as withdrawItem does
    await w.query("SELECT 1 FROM items WHERE id = $1 FOR UPDATE", [itemId]);
    await w.query("SELECT 1 FROM standings WHERE item_id = $1 FOR UPDATE", [itemId]);
    const pending = o("POST", `/api/v1/host/items/${itemId}/award`, { action: "assign", revision: 0 });
    await sleep(800);
    await w.query("UPDATE items SET withdrawn_at = now(), withdrawal_message = 'Donor pulled it', revision = revision + 1 WHERE id = $1", [itemId]);
    await w.query("COMMIT");
    const r = await pending;
    assert.equal(r.status, 409, JSON.stringify(r.data));
    const award = (await db.query("SELECT status FROM awards WHERE item_id = $1", [itemId])).rows[0];
    assert.ok(!award || award.status === "no_winner", JSON.stringify(award));
  } finally { await w.end(); }
});

await check("winners: still assignable normally after the fix", async () => {
  const o = await owner(), { code, items: [itemId] } = await liveEvent(o, [{ closesAt: iso(4_000) }]);
  const guest = client(BASE);
  await guest("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "Win", businessName: "Win Co" });
  await guest("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId, amountMinor: 10_000 });
  await sleep(4_500);
  const r = await o("POST", `/api/v1/host/items/${itemId}/award`, { action: "assign", revision: 0 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

await db.end();
done();
