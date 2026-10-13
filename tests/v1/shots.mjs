#!/usr/bin/env node
// Seeds a realistic event through the real API, then captures phone and desktop screenshots.
//   BASE=... HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/shots.mjs <out-dir>
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://127.0.0.1:3410", OUT = process.argv[2] ?? ".shots";
const ORIGIN = new URL(BASE).origin;
await mkdir(OUT, { recursive: true });
const iso = ms => new Date(Date.now() + ms).toISOString();
const assertNoHorizontalOverflow = async (page, label) => {
  const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert.ok(size.content <= size.viewport, `${label} has horizontal overflow: ${size.content}px > ${size.viewport}px`);
};

const browser = await chromium.launch();
const host = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const hp = await host.newPage();
const call = async (method, path, body, type = "application/json") => {
  const headers = { Origin: ORIGIN, Referer: `${ORIGIN}/host`, ...(body === undefined ? {} : { "Content-Type": type }) };
  const r = await host.request.fetch(BASE + path, { method, headers, data: body });
  const result = { status: r.status(), data: await r.json().catch(() => null) };
  if (!r.ok()) throw new Error(`${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);
  return result;
};
await call("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
const ev = await call("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Holiday Trade Show", startsAt: iso(-3600_000), endsAt: iso(3 * 3600_000), timezone: "America/Los_Angeles" });
const id = ev.data.id;
const items = [
  ["cabin", "Weekend cabin in Big Bear", "Two nights for four, hot tub included", 40_000, "Travel", "Pine Ridge Rentals"],
  ["dinner", "Chef's table dinner for six", "Seven courses with wine pairing", 30_000, "Dining", "Marrow & Vine"],
  ["coffee", "Coffee for a year", "One bag of single-origin beans every month", 15_000, "Food & drink", "Harbor Roasters"],
  ["bicycle", "Restored city bicycle", "Steel frame, new drivetrain, ready to ride", 25_000, "Lifestyle", "Spoke & Chain"],
  ["ceramics", "Hand-thrown dinnerware set", "Twelve pieces, glazed in sea green", 12_000, "Home", "Clay Studio"],
  ["flowers", "Fresh flowers monthly", "Six months of seasonal arrangements", 9_000, "Home", "Petal & Stem"],
];
const ids = [];
for (const [photo, title, short, opening, category, donor] of items) {
  const bytes = await readFile(`prototypes/lanyard/assets/lots/${photo}.jpg`);
  const asset = await call("POST", "/api/v1/host/assets", bytes, "image/jpeg");
  const it = await call("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title, short, openingMinor: opening, category, donor, imageAssetId: asset.data?.id ?? null,
    description: `${short}. Generously provided by ${donor}. Redeem within 12 months; some dates excluded.` });
  ids.push(it.data.id);
}
const longItem = await call("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title: "One-of-a-kind hand-built walnut telescope with a custom brass stand", short: "A small-run instrument made by Pasadena maker Ellis Workshop", openingMinor: 18_000, category: "Home", donor: "Ellis Workshop", description: "Hand-finished walnut body, brass stand and an illustrated guide to the night sky. Please arrange local pickup with the host." });
ids.push(longItem.data.id);
let w = (await call("GET", `/api/v1/host/events/${id}`)).data;
const cover = await call("POST", "/api/v1/host/assets", await readFile("prototypes/lanyard/assets/lots/dinner.jpg"), "image/jpeg");
await call("PATCH", `/api/v1/host/events/${id}`, { revision: w.event.revision, status: "live", venue: "Saturn Hall, Pasadena", coverAssetId: cover.data.id,
  welcome: "Welcome to the Holiday Trade Show! Browse the items and bid from your phone. Every bid supports our member community.",
  winnerInstructions: "Congratulations! Pick up your item at the Saturn desk before 8 PM, or we'll arrange delivery.", donationsEnabled: true });
await call("POST", `/api/v1/host/events/${id}/recipients`, { name: "Red Cross", description: "Disaster relief in our region" });
await call("POST", `/api/v1/host/events/${id}/recipients`, { name: "Pasadena Humane", description: "Animal shelter and adoption" });
w = (await call("GET", `/api/v1/host/events/${id}`)).data;
const code = w.event.code;

// Two phones: Bob bids, then Alice joins and gets outbid on one item.
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const bobCtx = await phone(), bob = await bobCtx.newPage();
await bob.goto(`${BASE}/e/${code}`);
await bob.getByLabel("Your name").fill("Bob Rivera"); await bob.getByLabel("Business name").fill("Harbor Logistics");
await bob.getByRole("button", { name: "Join", exact: true }).click(); await bob.waitForSelector(".pass");
const bobBid = (itemId, amount) => bob.evaluate(([c, i, a]) => fetch(`/api/v1/e/${c}/bid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), itemId: i, amountMinor: a }) }).then(r => r.status), [code, itemId, amount]);
await bobBid(ids[1], 30_000); await bobBid(ids[2], 15_000);

const aliceCtx = await phone(), a = await aliceCtx.newPage();
await a.goto(`${BASE}/e/${code}`); await a.waitForTimeout(400);
await a.screenshot({ path: `${OUT}/p1-join.png`, fullPage: true });
await a.getByLabel("Your name").fill("Alice Chen"); await a.getByLabel("Business name").fill("Juniper Design Studio");
await a.getByRole("button", { name: "Join", exact: true }).click(); await a.waitForSelector(".pass"); await a.waitForTimeout(600);
await a.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await a.screenshot({ path: `${OUT}/p2-items.png` });
await aliceCtx.setOffline(true); await a.waitForTimeout(4300);
await a.screenshot({ path: `${OUT}/participant-390-offline.png` });
await aliceCtx.setOffline(false); await a.waitForTimeout(4500);
await a.getByText("Weekend cabin in Big Bear").click(); await a.waitForTimeout(400);
await a.screenshot({ path: `${OUT}/p3-item.png` });
await a.getByRole("button", { name: "Bid", exact: true }).click(); await a.waitForTimeout(300);
await a.screenshot({ path: `${OUT}/p4-sheet.png` });
await a.getByRole("button", { name: /^Bid \$/ }).click(); await a.waitForTimeout(800);
await a.screenshot({ path: `${OUT}/p5-after-bid.png` });
await a.goBack(); await a.waitForTimeout(300);
// Alice bids on the coffee, Bob outbids her.
await a.evaluate(([c, i]) => fetch(`/api/v1/e/${c}/bid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), itemId: i, amountMinor: 17_500 }) }), [code, ids[2]]);
await bobBid(ids[2], 20_000);
await a.getByRole("button", { name: "My bids" }).click(); await a.waitForTimeout(4500);
await a.screenshot({ path: `${OUT}/p6-mybids.png` });
await a.route(`**/api/v1/e/${code}/bid`, route => route.abort());
await a.getByRole("button", { name: "Bid again" }).first().click(); await a.waitForTimeout(250);
await a.getByRole("button", { name: /^Bid \$/ }).click(); await a.waitForTimeout(250);
await a.screenshot({ path: `${OUT}/participant-390-unconfirmed.png` });
await a.unroute(`**/api/v1/e/${code}/bid`);
await a.getByRole("button", { name: "Close" }).click();
await a.getByRole("button", { name: "Donate" }).click(); await a.waitForTimeout(300);
await a.screenshot({ path: `${OUT}/p7-donate.png` });

// Matched participant design-pass captures. Reuse Alice's event session at desktop width.
const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await deskCtx.addCookies(await aliceCtx.cookies());
const desk = await deskCtx.newPage();
await desk.goto(`${BASE}/e/${code}`); await desk.waitForSelector(".pass"); await desk.waitForTimeout(500);
await desk.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await desk.screenshot({ path: `${OUT}/participant-1440-items.png` });
await assertNoHorizontalOverflow(desk, "1440px catalog");
await desk.getByRole("button", { name: "Dining", exact: true }).click();
assert.deepEqual(await desk.locator(".participant-item-title").allTextContents(), ["Chef's table dinner for six"], "Dining filter should show only dining items");
await desk.getByRole("button", { name: "All items", exact: true }).click();
await desk.getByLabel("Sort items").selectOption("price");
assert.equal((await desk.locator(".participant-item-title").first().textContent())?.trim(), "Fresh flowers monthly", "Lowest-price sort should put the $90 item first");
await desk.getByLabel("Sort items").selectOption("position");
await desk.getByRole("button", { name: "Compact list" }).click();
assert.equal(await desk.locator(".participant-items").getAttribute("class"), "participant-items is-compact");
await desk.getByRole("button", { name: "Large cards" }).click();
await desk.getByRole("button", { name: "Watch item 1: Weekend cabin in Big Bear" }).click();
await desk.getByRole("button", { name: "Watching", exact: true }).click();
assert.equal((await desk.locator(".participant-item-title").allTextContents())[0], "Weekend cabin in Big Bear", "Watching tab should contain the saved item");
await desk.getByRole("button", { name: "Items", exact: true }).click();
await desk.reload(); await desk.waitForSelector(".pass"); await desk.waitForTimeout(350);
assert.match(await desk.locator(".pass").innerText(), /Juniper Design Studio/, "participant identity should survive reload");
assert.equal(await desk.getByRole("button", { name: "Stop watching item 1: Weekend cabin in Big Bear" }).getAttribute("aria-pressed"), "true", "watch state should survive reload");
await desk.getByRole("button", { name: "Stop watching item 1: Weekend cabin in Big Bear" }).click();
await desk.waitForTimeout(250);
await assertNoHorizontalOverflow(desk, "1440px catalog after reload");
await desk.getByRole("button", { name: "Open item 1: Weekend cabin in Big Bear" }).click(); await desk.waitForTimeout(300);
await desk.screenshot({ path: `${OUT}/participant-1440-detail.png` });
await desk.goBack(); await desk.waitForTimeout(250);
assert.equal(await desk.locator(".participant-detail").count(), 0, "browser back should return from detail to the catalog");
await desk.reload(); await desk.waitForSelector(".pass"); await desk.waitForTimeout(250);
assert.equal(await desk.locator(".participant-detail").count(), 0, "reload should retain the participant session at the catalog");
await desk.getByRole("button", { name: "My bids" }).click(); await desk.waitForTimeout(500);
await desk.screenshot({ path: `${OUT}/participant-1440-my-bids.png` });
await desk.locator(".participant-history-fold summary").first().click(); await desk.waitForTimeout(200);
await desk.screenshot({ path: `${OUT}/participant-1440-my-bids-history.png` });
await desk.getByRole("button", { name: "Event" }).click(); await desk.waitForTimeout(300);
await desk.screenshot({ path: `${OUT}/participant-1440-event.png` });
await desk.getByRole("button", { name: "Items" }).click(); await desk.waitForTimeout(200);
await desk.getByLabel("Search items").fill("walnut telescope"); await desk.locator("h1").click().catch(() => {}); await desk.waitForTimeout(250);
await desk.screenshot({ path: `${OUT}/participant-1440-no-photo-long-title.png` });
await desk.getByRole("button", { name: "Open item 7: One-of-a-kind hand-built walnut telescope with a custom brass stand" }).click(); await desk.waitForTimeout(250);
await desk.screenshot({ path: `${OUT}/participant-1440-no-photo-long-title-detail.png` });

// A response fixture checks the terminal standing treatments without creating an award in the database.
let terminalFixture = "closed";
await desk.route(`${BASE}/api/v1/e/${code}`, async route => {
  const response = await route.fetch(), data = await response.json();
  if (terminalFixture === "empty") data.items = [];
  else {
    const item = data.items[0];
    item.phase = "closed"; item.minimumNextMinor = null;
    item.award = terminalFixture === "won" ? { status: "confirmed", winner: { name: "Alice Chen", business: "Juniper Design Studio" }, amountMinor: item.currentMinor ?? item.openingMinor, isMe: true } : null;
  }
  return route.fulfill({ response, body: JSON.stringify(data) });
});
await desk.goto(`${BASE}/e/${code}`); await desk.waitForSelector(".pass"); await desk.waitForTimeout(300);
await desk.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await desk.evaluate(() => document.querySelectorAll("nextjs-portal").forEach(node => node.remove()));
await desk.screenshot({ path: `${OUT}/participant-1440-closed-fixture.png` });
terminalFixture = "won";
await desk.reload(); await desk.waitForTimeout(350);
await desk.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await desk.evaluate(() => document.querySelectorAll("nextjs-portal").forEach(node => node.remove()));
await desk.screenshot({ path: `${OUT}/participant-1440-won-fixture.png` });
await desk.getByRole("button", { name: "Open item 1: Weekend cabin in Big Bear" }).click(); await desk.waitForTimeout(250);
await desk.screenshot({ path: `${OUT}/participant-1440-won-detail-fixture.png` });
terminalFixture = "empty";
await desk.goto(`${BASE}/e/${code}`); await desk.waitForSelector(".pass"); await desk.waitForTimeout(350);
await desk.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await desk.evaluate(() => document.querySelectorAll("nextjs-portal").forEach(node => node.remove()));
await desk.screenshot({ path: `${OUT}/participant-1440-empty-fixture.png` });
await desk.unroute(`${BASE}/api/v1/e/${code}`);

// Full-page phone captures match the accepted prior build's review images.
await aliceCtx.pages()[0].getByRole("button", { name: "Event" }).click(); await aliceCtx.pages()[0].waitForTimeout(300);
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-event.png` });
await aliceCtx.pages()[0].getByRole("button", { name: "Items" }).click(); await aliceCtx.pages()[0].waitForTimeout(300);
await aliceCtx.pages()[0].getByText("Weekend cabin in Big Bear").click(); await aliceCtx.pages()[0].waitForTimeout(300);
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-detail.png` });
await aliceCtx.pages()[0].goBack(); await aliceCtx.pages()[0].waitForTimeout(300);
await aliceCtx.pages()[0].getByRole("button", { name: "My bids" }).click(); await aliceCtx.pages()[0].waitForTimeout(300);
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-my-bids.png` });
await aliceCtx.pages()[0].getByRole("button", { name: "Items" }).click(); await aliceCtx.pages()[0].waitForTimeout(300);
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-items.png` });
await assertNoHorizontalOverflow(aliceCtx.pages()[0], "390px catalog");
await aliceCtx.pages()[0].getByLabel("Search items").fill("walnut telescope"); await aliceCtx.pages()[0].locator("h1").click().catch(() => {}); await aliceCtx.pages()[0].waitForTimeout(250);
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-no-photo-long-title.png` });
await aliceCtx.pages()[0].getByRole("button", { name: "Open item 7: One-of-a-kind hand-built walnut telescope with a custom brass stand" }).click(); await aliceCtx.pages()[0].waitForTimeout(250);
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-no-photo-long-title-detail.png` });
await aliceCtx.pages()[0].evaluate(key => localStorage.removeItem(key), `bz_pending_${code}`);
await aliceCtx.pages()[0].route(`${BASE}/api/v1/e/${code}`, async route => {
  const response = await route.fetch(), data = await response.json();
  data.items = [];
  return route.fulfill({ response, body: JSON.stringify(data) });
});
await aliceCtx.pages()[0].goto(`${BASE}/e/${code}`); await aliceCtx.pages()[0].waitForSelector(".pass"); await aliceCtx.pages()[0].waitForTimeout(350);
await aliceCtx.pages()[0].addStyleTag({ content: "nextjs-portal{display:none!important}" });
await aliceCtx.pages()[0].evaluate(() => document.querySelectorAll("nextjs-portal").forEach(node => node.remove()));
await aliceCtx.pages()[0].screenshot({ path: `${OUT}/participant-390-empty-fixture.png` });
await assertNoHorizontalOverflow(aliceCtx.pages()[0], "390px empty-state fixture");
await aliceCtx.pages()[0].unroute(`${BASE}/api/v1/e/${code}`);
await deskCtx.close();

// Host views.
await hp.goto(`${BASE}/host`); await hp.waitForTimeout(800); await hp.screenshot({ path: `${OUT}/h1-events.png` });
await hp.goto(`${BASE}/host/${id}`); await hp.waitForTimeout(1000); await hp.screenshot({ path: `${OUT}/h2-overview.png` });
await hp.goto(`${BASE}/host/${id}#items`); await hp.reload(); await hp.waitForTimeout(1000); await hp.screenshot({ path: `${OUT}/h3-items.png` });
await hp.goto(`${BASE}/host/${id}#share`); await hp.reload(); await hp.waitForTimeout(1000); await hp.screenshot({ path: `${OUT}/h4-share.png` });
console.log(JSON.stringify({ eventId: id, code }));
await browser.close();
