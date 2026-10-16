#!/usr/bin/env node
// Guest recovery after lost responses and reloads: bids and donations are never lost and never doubled.
// Chromium and WebKit, against a running local app and its disposable database.
//   BASE=http://127.0.0.1:3481 BIDZIZI_DATABASE_URL=postgres://bz@127.0.0.1:PORT/bz_test_x HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/recovery.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, webkit, expect } from "@playwright/test";
import pg from "pg";
import { appDbUrl } from "../db/lib.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3481";
const db = new pg.Client({ connectionString: appDbUrl() }); await db.connect();
const results = [];
const iso = ms => new Date(Date.now() + ms).toISOString();

async function setup(browser, label) {
  const staff = await browser.newContext();
  const call = async (method, path, data) => {
    const r = await staff.request.fetch(BASE + path, { method, headers: { Origin: BASE }, data });
    const b = await r.json(); assert.ok(r.ok(), JSON.stringify(b)); return b;
  };
  await call("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  const e = await call("POST", "/api/v1/host/events", { requestId: randomUUID(), name: `Recovery ${label}`, startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  const a = await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), title: "Cabin weekend", openingMinor: 10_000 });
  const b = await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), title: "Coffee for a year", openingMinor: 5_000 });
  await call("POST", `/api/v1/host/events/${e.id}/recipients`, { name: "Food Bank" });
  let w = await call("GET", `/api/v1/host/events/${e.id}`);
  await call("PATCH", `/api/v1/host/events/${e.id}`, { revision: w.event.revision, status: "live", donationsEnabled: true });
  w = await call("GET", `/api/v1/host/events/${e.id}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage(), errors = [];
  // WebKit reports a fetch that page.goto cancels mid-poll as "… due to access control checks"; the app catches it.
  page.on("pageerror", err => { if (!/due to access control checks/.test(err.message)) errors.push(err.message); });
  const code = w.event.code;
  await page.goto(`${BASE}/e/${code}`);
  await page.getByLabel("Your name").fill("Robin Recover"); await page.getByLabel("Business name").fill("Recover Co");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.locator(".pa-main").waitFor();
  const bids = async () => Object.fromEntries((await call("GET", `/api/v1/host/events/${e.id}`)).items.map(i => [i.id, i.bidCount]));
  return { page, ctx, errors, code, itemA: a.id, itemB: b.id, bids, eventId: e.id, close: () => Promise.all([staff.close(), ctx.close()]) };
}
const pendingIds = page => page.evaluate(k => { const v = JSON.parse(localStorage.getItem(k) ?? "[]"); return (Array.isArray(v) ? v : [v]).map(p => p.requestId); }, `bz_pending_${pageCode(page)}`);
const pageCode = page => new URL(page.url()).pathname.split("/")[2];


for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  const check = async (name, run) => {
    try { await run(); results.push(true); console.log(`ok   ${engine.name()}: ${name}`); }
    catch (error) { results.push(false); console.log(`FAIL ${engine.name()}: ${name}\n     ${error.message.split("\n").slice(0, 16).join("\n     ")}`); }
  };
  try {
    await check("a reload whose receipt check finds nothing keeps the bid pending; Check status then lands it exactly once", async () => {
      const t = await setup(browser, `${engine.name()} null`);
      try {
        const requestId = randomUUID();
        // The bid was sent but hadn't committed when the page reloaded.
        await t.page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [`bz_pending_${t.code}`, { requestId, itemId: t.itemA, amountMinor: 10_000 }]);
        await t.page.reload(); await t.page.locator(".pa-main").waitFor();
        await expect(t.page.getByText(/isn.t confirmed yet/)).toBeVisible();
        await expect(t.page.getByText(/Nothing was placed/)).toHaveCount(0);
        assert.deepEqual(await pendingIds(t.page), [requestId], "the pending bid must survive a null lookup");
        // The original request commits late.
        const late = await t.page.evaluate(async ([code, body]) => (await fetch(`/api/v1/e/${code}/bid`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status,
          [t.code, { requestId, itemId: t.itemA, amountMinor: 10_000 }]);
        assert.equal(late, 201);
        // In-app (no reload, which would itself resolve it now): the item still says to check.
        await t.page.getByLabel(/^Cabin weekend/).first().click();
        await t.page.getByRole("button", { name: "Check bid status" }).click();
        await t.page.getByRole("dialog").getByRole("button", { name: "Check status", exact: true }).click();
        await expect(t.page.getByRole("heading", { name: "Bid placed", exact: true })).toBeVisible();
        assert.equal((await t.bids())[t.itemA], 1);
        assert.deepEqual(await pendingIds(t.page), []);
        assert.deepEqual(t.errors, []);
      } finally { await t.close(); }
    });

    await check("lost bids on two items both survive a reload and both resolve", async () => {
      const t = await setup(browser, `${engine.name()} two`);
      try {
        await t.page.route("**/api/v1/e/*/bid", async route => { await route.fetch(); await route.abort(); }); // committed, answer lost
        for (const [n, title] of [[0, "Cabin weekend"], [1, "Coffee for a year"]]) {
          // In-app navigation: a page load here would itself resolve the first bid.
          if (n > 0) await t.page.getByRole("button", { name: "Items" }).first().click();
          await t.page.getByLabel(new RegExp(`^${title}`)).first().click();
          await t.page.getByRole("button", { name: /^Bid \$/ }).click();
          const sheet = t.page.getByRole("dialog");
          await sheet.getByRole("button", { name: /^Bid \$/ }).click();
          await expect(sheet.getByRole("button", { name: "Check status", exact: true })).toBeVisible();
          await sheet.getByRole("button", { name: "Close", exact: true }).click();
        }
        assert.equal((await pendingIds(t.page)).length, 2, "the second lost bid must not overwrite the first");
        await t.page.unroute("**/api/v1/e/*/bid");
        await t.page.reload(); await t.page.locator(".pa-main").waitFor();
        await expect(t.page.getByText(/bid went through/)).toHaveCount(2);
        assert.deepEqual(await pendingIds(t.page), []);
        const b = await t.bids(); assert.equal(b[t.itemA], 1); assert.equal(b[t.itemB], 1);
      } finally { await t.close(); }
    });

    await check("a lost donation survives reload and navigation; it can't be changed, and confirming records it once", async () => {
      const t = await setup(browser, `${engine.name()} give`);
      try {
        await t.page.goto(`${BASE}/e/${t.code}?s=give`);
        await t.page.getByRole("radio", { name: /\$50/ }).click();
        await t.page.getByRole("button", { name: /^Review \$50/ }).click();
        await t.page.route("**/api/v1/e/*/pledge", async route => { await route.fetch(); await route.abort(); });
        await t.page.getByRole("button", { name: /^Confirm \$50/ }).click();
        await expect(t.page.getByText(/recorded twice/).first()).toBeVisible();
        await t.page.unroute("**/api/v1/e/*/pledge");
        await t.page.goto(`${BASE}/e/${t.code}?s=items`); // navigate away
        await t.page.reload(); await t.page.locator(".pa-main").waitFor();
        await t.page.goto(`${BASE}/e/${t.code}?s=give`);
        await expect(t.page.getByRole("button", { name: /^Confirm \$50/ })).toBeVisible();
        await expect(t.page.getByRole("button", { name: "Change" })).toHaveCount(0);
        await t.page.getByRole("button", { name: /^Confirm \$50/ }).click();
        await expect(t.page.getByRole("heading", { name: /^Thank you/ })).toBeVisible();
        const n = (await db.query("SELECT count(*)::int AS n FROM pledges WHERE event_id = $1", [t.eventId])).rows[0].n;
        assert.equal(n, 1);
        assert.deepEqual(t.errors, []);
      } finally { await t.close(); }
    });
  } finally { await browser.close(); }
}
await db.end();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
