#!/usr/bin/env node
// Seeds a realistic event through the real API, then captures phone and desktop screenshots.
//   BASE=... HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/shots.mjs <out-dir>
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3410", OUT = process.argv[2] ?? ".shots";
await mkdir(OUT, { recursive: true });
const iso = ms => new Date(Date.now() + ms).toISOString();

const browser = await chromium.launch();
const host = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const hp = await host.newPage();
await hp.goto(BASE + "/host");
const call = (method, path, body, type = "application/json") => hp.evaluate(async ([m, p, b, t]) => {
  const r = await fetch(p, { method: m, headers: b === null ? {} : { "Content-Type": t }, body: b === null ? undefined : (t === "application/json" ? JSON.stringify(b) : new Uint8Array(b)) });
  return { status: r.status, data: await r.json().catch(() => null) };
}, [method, path, body ?? null, type]);
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
  const bytes = [...await readFile(`prototypes/lanyard/assets/lots/${photo}.jpg`)];
  const asset = await call("POST", "/api/v1/host/assets", bytes, "image/jpeg");
  const it = await call("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title, short, openingMinor: opening, category, donor, imageAssetId: asset.data?.id ?? null,
    description: `${short}. Generously provided by ${donor}. Redeem within 12 months; some dates excluded.` });
  ids.push(it.data.id);
}
let w = (await call("GET", `/api/v1/host/events/${id}`)).data;
const cover = await call("POST", "/api/v1/host/assets", [...await readFile("prototypes/lanyard/assets/lots/dinner.jpg")], "image/jpeg");
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
await a.screenshot({ path: `${OUT}/p2-items.png` });
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
await a.getByRole("button", { name: "Donate" }).click(); await a.waitForTimeout(300);
await a.screenshot({ path: `${OUT}/p7-donate.png` });

// Host views.
await hp.goto(`${BASE}/host`); await hp.waitForTimeout(800); await hp.screenshot({ path: `${OUT}/h1-events.png` });
await hp.goto(`${BASE}/host/${id}`); await hp.waitForTimeout(1000); await hp.screenshot({ path: `${OUT}/h2-overview.png` });
await hp.goto(`${BASE}/host/${id}#items`); await hp.reload(); await hp.waitForTimeout(1000); await hp.screenshot({ path: `${OUT}/h3-items.png` });
await hp.goto(`${BASE}/host/${id}#share`); await hp.reload(); await hp.waitForTimeout(1000); await hp.screenshot({ path: `${OUT}/h4-share.png` });
console.log(JSON.stringify({ eventId: id, code }));
await browser.close();
