#!/usr/bin/env node
// Seeds a realistic event covering every participant state, then captures the attendee app at 390px and 1440px.
//   BASE=http://127.0.0.1:3420 HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/shell-shots.mjs <out-dir>
// States covered: leading, outbid (+ live alert), closing soon, closed awaiting staff, won (+ celebration), no photo,
// very long title, sponsors, donations, watching, unconfirmed is exercised by the journey test instead.
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3420", OUT = process.argv[2] ?? ".shots";
await mkdir(OUT, { recursive: true });
const iso = ms => new Date(Date.now() + ms).toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

function client() {
  const jar = new Map();
  return async function call(method, path, body, type = "application/json") {
    const headers = { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = type;
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body });
    for (const set of r.headers.getSetCookie()) { const [pair] = set.split(";"); const [k, ...v] = pair.split("="); jar.set(k, v.join("=")); }
    const ct = r.headers.get("content-type") ?? "";
    return { status: r.status, data: ct.includes("json") ? await r.json() : null };
  };
}
const staff = client(), bob = client(), carmen = client();
const ok = (r, what) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
ok(await staff("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD }), "login");
const photo = async name => ok(await staff("POST", "/api/v1/host/assets", await readFile(`prototypes/lanyard/assets/lots/${name}.jpg`), "image/jpeg"), "upload").id;

const ev = ok(await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), template: "trade-show", name: "Holiday Trade Show", startsAt: iso(-3600_000), endsAt: iso(3 * 3600_000), timezone: "America/Los_Angeles" }), "event");
const id = ev.id;
let w = ok(await staff("GET", `/api/v1/host/events/${id}`), "ws");
for (const it of w.items) ok(await staff("DELETE", `/api/v1/host/items/${it.id}`), "delete sample");

const items = [
  ["cabin", "Weekend cabin in Big Bear", "Two nights for four, hot tub included", 40_000, "Travel", "Pine Ridge Rentals"],
  ["dinner", "Chef's table dinner for six", "Seven courses with wine pairing", 30_000, "Dining", "Marrow & Vine"],
  ["coffee", "Coffee for a year", "One bag of single-origin beans every month", 15_000, "Food & drink", "Harbor Roasters"],
  ["bicycle", "Restored city bicycle", "Steel frame, new drivetrain, ready to ride", 25_000, "Lifestyle", "Spoke & Chain"],
  ["ceramics", "Hand-thrown dinnerware set", "Twelve pieces, glazed in sea green", 12_000, "Home", "Clay Studio"],
  ["flowers", "Fresh flowers monthly", "Six months of seasonal arrangements", 9_000, "Home", "Petal & Stem"],
  [null, "Full-day brand photography session with retouched images, location scouting and a printed lookbook for your team", "Studio or on location, anywhere in LA County", 60_000, "Services", "Lumen Collective"],
];
const ids = [];
for (const [p, title, short, opening, category, donor] of items) {
  const it = ok(await staff("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title, short, openingMinor: opening, category, donor, imageAssetId: p ? await photo(p) : null,
    description: `${short}. Generously provided by ${donor}.\n\nRedeem within 12 months; some dates excluded. The provider will contact the winner within a week of the show.` }), "item");
  ids.push(it.id);
}
// Two short items that close during the run (won / awaiting staff), and one closing in a few minutes.
const shortClose = Date.now() + 45_000;
const short1 = ok(await staff("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title: "Vintage espresso machine", short: "Fully serviced, chrome lever", openingMinor: 35_000, category: "Food & drink", donor: "Harbor Roasters", imageAssetId: await photo("coffee"), closesAt: iso(45_000) }), "short1").id;
const short2 = ok(await staff("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title: "Signed gallery print", short: "Limited edition, framed", openingMinor: 20_000, category: "Art", donor: "Clay Studio", imageAssetId: await photo("ceramics"), closesAt: iso(45_000) }), "short2").id;
w = ok(await staff("GET", `/api/v1/host/events/${id}`), "ws");
const flowers = w.items.find(i => i.title.startsWith("Fresh flowers"));
ok(await staff("PATCH", `/api/v1/host/items/${flowers.id}`, { revision: flowers.revision, closesAt: iso(7 * 60_000) }), "closing soon");
w = ok(await staff("GET", `/api/v1/host/events/${id}`), "ws");
const cover = await photo("dinner");
ok(await staff("PATCH", `/api/v1/host/events/${id}`, { revision: w.event.revision, status: "live", venue: "Saturn Hall, Pasadena", coverAssetId: cover,
  welcome: "Welcome to the Holiday Trade Show! Browse the items and bid from your phone. Every bid supports our member community, and every item was donated by a member business.",
  winnerInstructions: "Congratulations! Pick up your item at the Saturn desk before 8 PM, or we'll arrange delivery next week.", donationsEnabled: true }), "go live");
ok(await staff("POST", `/api/v1/host/events/${id}/recipients`, { name: "Pasadena Humane", description: "Animal shelter and adoption" }), "recipient");
ok(await staff("POST", `/api/v1/host/events/${id}/recipients`, { name: "Union Station Homeless Services", description: "Housing and meals in our city" }), "recipient");
ok(await staff("PUT", `/api/v1/host/events/${id}/sponsors`, { sponsors: [{ name: "Saturn Barter" }, { name: "Pasadena Chamber" }, { name: "Harbor Roasters" }, { name: "Lumen Collective" }] }), "sponsors");
w = ok(await staff("GET", `/api/v1/host/events/${id}`), "ws");
const code = w.event.code;

const join = async (c, name, biz) => ok(await c("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: name, businessName: biz }), "join");
const bid = (c, itemId, amount) => c("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId, amountMinor: amount });
await join(bob, "Bob Rivera", "Harbor Logistics"); await join(carmen, "Carmen Ortiz", "Orbit Coffee Co.");
await bid(bob, ids[1], 30_000); await bid(carmen, ids[1], 32_500); await bid(bob, ids[2], 15_000); await bid(carmen, ids[3], 25_000);
await bid(carmen, flowers.id, 9_000);

// ------------------------------------------------------------ Alice's phone
const browser = await chromium.launch();
// Playwright's mobile screenshots re-apply device metrics, which browsers treat as a resize and use to abort a running view
// transition; in dev that surfaces Next's overlay over the page. Hide the overlay so it can't swallow later taps.
const quiet = ctx => ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }));
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await quiet(phoneCtx);
const a = await phoneCtx.newPage();
a.on("pageerror", e => errors.push(`phone: ${e.message}`));
a.on("console", m => { if (m.type() === "error") { console.log("CONSOLE", m.text().slice(0, 400)); errors.push(m.text().slice(0, 200)); } });
// Full-page captures resize the viewport, which aborts any running view transition; let the page settle around them.
const shot = async (page, name, opts = {}) => { await page.waitForTimeout(opts.full ? 1200 : opts.wait ?? 700); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false }); if (opts.full) await page.waitForTimeout(800); console.log("shot", name); };
const abid = (itemId, amount) => a.evaluate(([c, i, m]) => fetch(`/api/v1/e/${c}/bid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), itemId: i, amountMinor: m }) }).then(r => r.status), [code, itemId, amount]);

await a.goto(`${BASE}/e/${code}`); await a.getByLabel("Your name").waitFor();
await shot(a, "p01-join-390", { wait: 1200 });
await a.getByLabel("Your name").fill("Alice Chen"); await a.getByLabel("Business name").fill("Juniper Design Studio");
await a.getByLabel("Business name").scrollIntoViewIfNeeded();
await shot(a, "p02-join-filled-390");
await a.getByRole("button", { name: "Join", exact: true }).click(); await a.waitForSelector(".pa-pass");
await abid(short1, 35_000); await abid(short2, 20_000); await abid(ids[2], 17_500); await abid(flowers.id, 10_000);
await a.reload(); await a.waitForSelector(".pa-pass");
await shot(a, "p03-items-390", { wait: 1200 });
await a.mouse.wheel(0, 900); await shot(a, "p04-items-scrolled-390");
await a.evaluate(() => window.scrollTo(0, 0));
await a.getByRole("button", { name: "Compact list" }).click(); await shot(a, "p05-items-rows-390");
await a.getByRole("button", { name: "Large cards" }).click();

// Item page, sheet, landing
await a.locator(".lc", { hasText: "Weekend cabin" }).locator(".lc-hit").click(); await a.waitForSelector(".ip");
await shot(a, "p06-item-390", { wait: 900 });
await a.getByRole("button", { name: "Place a bid" }).last().click(); await a.waitForSelector(".pa-sheet[open]");
await shot(a, "p07-sheet-390");
await a.getByRole("button", { name: /^Bid \$/ }).click();
await a.waitForSelector(".landed"); await shot(a, "p08-landed-390", { wait: 650 });
await a.waitForTimeout(2200); await shot(a, "p09-item-leading-390");

// Outbid, live, while looking at it
await a.goBack(); await a.waitForSelector(".cards");
await a.locator(".lc", { hasText: "Coffee for a year" }).locator(".lc-hit").click(); await a.waitForSelector(".ip");
await bid(bob, ids[2], 20_000);
await a.waitForSelector(".alert", { timeout: 15000 }); await shot(a, "p10-outbid-alert-390", { wait: 500 });
await a.waitForTimeout(1500); await shot(a, "p11-item-outbid-390");
await a.locator(".ip-body").evaluate(el => el.querySelector(".activity")?.scrollIntoView({ block: "center" }));
await shot(a, "p12-item-activity-390");
await a.evaluate(() => window.scrollTo(0, 0));

// Long title, no photo, no bids
await a.goBack(); await a.waitForSelector(".cards");
await a.locator(".lc", { hasText: "Full-day brand photography" }).locator(".lc-hit").click(); await a.waitForSelector(".ip");
await shot(a, "p13-item-nophoto-390");
await a.goBack(); await a.waitForSelector(".cards");
await a.locator(".lc", { hasText: "Full-day brand photography" }).scrollIntoViewIfNeeded(); await shot(a, "p14-card-nophoto-390");
await a.evaluate(() => window.scrollTo(0, 0));

// Tabs
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Watching/ }).click(); await shot(a, "p15-watching-empty-390");
await a.locator(".pa-nav.bottom").getByRole("button", { name: /My bids/ }).click(); await shot(a, "p16-mybids-390", { wait: 1000 });
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Event/ }).click(); await shot(a, "p17-event-390", { wait: 1000 });
await shot(a, "p17b-event-full-390", { full: true });
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Donate/ }).click(); await shot(a, "p18-donate-390");
await a.getByRole("radio", { name: /Pasadena Humane/ }).click(); await a.getByRole("button", { name: /^Review/ }).click(); await a.waitForTimeout(300);
await a.getByRole("button", { name: /^Confirm/ }).click(); await a.waitForSelector(".thanks"); await shot(a, "p19-thanks-390", { wait: 900 });

// Close the short items, award one: won celebration + awaiting staff
await sleep(Math.max(0, shortClose + 1500 - Date.now()));
w = ok(await staff("GET", `/api/v1/host/events/${id}`), "ws");
const s1 = w.items.find(i => i.id === short1);
ok(await staff("POST", `/api/v1/host/items/${short1}/award`, { action: "assign", revision: s1.award?.revision ?? 0 }), "award");
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Items/ }).click();
await a.waitForSelector(".celebrate", { timeout: 15000 }); await shot(a, "p20-won-390", { wait: 1400 });
await a.getByRole("button", { name: "See my wins" }).click(); await shot(a, "p21-mybids-won-390", { wait: 1000 });
await shot(a, "p21b-mybids-full-390", { full: true });

// Watch something, then the watching tab
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Items/ }).click(); await a.waitForSelector(".cards");
await a.locator(".lc", { hasText: "Restored city bicycle" }).getByRole("button", { name: "Watch this item" }).click();
await a.locator(".lc", { hasText: "Hand-thrown" }).getByRole("button", { name: "Watch this item" }).click();
await a.waitForTimeout(600);
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Watching/ }).click(); await shot(a, "p22-watching-390");

// ------------------------------------------------------------ the same participant on a desktop
const state = await phoneCtx.storageState();
const desk = await browser.newContext({ viewport: { width: 1440, height: 960 }, storageState: state });
await quiet(desk);
const d = await desk.newPage();
d.on("pageerror", e => errors.push(`desktop: ${e.message}`));
d.on("console", m => { if (m.type() === "error") { console.log("CONSOLE", m.text().slice(0, 400)); errors.push(m.text().slice(0, 200)); } });
await d.goto(`${BASE}/e/${code}`); await d.waitForSelector(".pa-pass");
await shot(d, "d01-items-1440", { wait: 1500 });
await d.goto(`${BASE}/e/${code}?s=items&i=${ids[2]}`); await d.waitForSelector(".ip"); await shot(d, "d02-item-outbid-1440", { wait: 1200 });
await d.getByRole("button", { name: /^Bid \$/ }).first().click(); await d.waitForSelector(".pa-sheet[open]"); await shot(d, "d03-sheet-1440");
await d.keyboard.press("Escape"); await d.waitForTimeout(400);
await d.goto(`${BASE}/e/${code}?s=mine`); await d.waitForSelector(".bids"); await shot(d, "d04-mybids-1440", { wait: 1000 });
await d.goto(`${BASE}/e/${code}?s=event`); await d.waitForSelector(".event-page"); await shot(d, "d05-event-1440", { wait: 1200 });
await d.goto(`${BASE}/e/${code}?s=give`); await shot(d, "d06-donate-1440", { wait: 1000 });
const fresh = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const f = await fresh.newPage(); await f.goto(`${BASE}/e/${code}`); await f.getByLabel("Your name").waitFor(); await shot(f, "d07-join-1440", { wait: 1400 });

// Offline: standings go stale and bidding is held.
await phoneCtx.setOffline(true);
await a.locator(".pa-nav.bottom").getByRole("button", { name: /Items/ }).click();
await a.waitForSelector(".pa-offline", { timeout: 20000 }); await shot(a, "p23-offline-390");
await phoneCtx.setOffline(false);

console.log(JSON.stringify({ eventId: id, code, errors }));
await browser.close();
