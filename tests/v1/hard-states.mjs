#!/usr/bin/env node
// Captures the hard states at 390px (and the staff sign-in error at 1440px) on a fresh seed:
// staff sign-in error, wrong event code, join with a missing field, wrong rejoin code, joining closed,
// an event with no items, closing soon, closed (someone else won), and an unconfirmed bid (receipt check blocked).
//   BASE=... HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/hard-states.mjs <out-dir>
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3420", OUT = process.argv[2] ?? ".shots/hard";
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
const ok = (r, what) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const staff = client(), bob = client();
ok(await staff("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD }), "login");
const photo = async name => ok(await staff("POST", "/api/v1/host/assets", await readFile(`prototypes/lanyard/assets/lots/${name}.jpg`), "image/jpeg"), "upload").id;

async function makeEvent(name, items, patch = {}) {
  const ev = ok(await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), template: "trade-show", name, startsAt: iso(-3600_000), endsAt: iso(3 * 3600_000), timezone: "America/Los_Angeles" }), "event");
  let w = ok(await staff("GET", `/api/v1/host/events/${ev.id}`), "ws");
  for (const it of w.items) ok(await staff("DELETE", `/api/v1/host/items/${it.id}`), "delete sample");
  const ids = [];
  for (const it of items) ids.push(ok(await staff("POST", `/api/v1/host/events/${ev.id}/items`, { requestId: randomUUID(), ...it }), "item").id);
  w = ok(await staff("GET", `/api/v1/host/events/${ev.id}`), "ws");
  ok(await staff("PATCH", `/api/v1/host/events/${ev.id}`, { revision: w.event.revision, status: "live", venue: "Saturn Hall, Pasadena", ...patch }), "live");
  w = ok(await staff("GET", `/api/v1/host/events/${ev.id}`), "ws");
  return { id: ev.id, code: w.event.code, ids };
}

const closesSoon = Date.now() + 25_000;
const main = await makeEvent("Holiday Trade Show", [
  { title: "Fresh flowers monthly", short: "Six months of seasonal arrangements", openingMinor: 9_000, category: "Home", donor: "Petal & Stem", imageAssetId: await photo("flowers"), closesAt: iso(6 * 60_000) },
  { title: "Restored city bicycle", short: "Steel frame, new drivetrain", openingMinor: 25_000, category: "Lifestyle", donor: "Spoke & Chain", imageAssetId: await photo("bicycle"), closesAt: iso(25_000) },
  { title: "Weekend cabin in Big Bear", short: "Two nights for four", openingMinor: 40_000, category: "Travel", donor: "Pine Ridge Rentals", imageAssetId: await photo("cabin") },
]);
const empty = await makeEvent("Spring Mixer", []);
const closed = await makeEvent("Members Gala", [{ title: "Chef's table dinner for six", short: "Seven courses", openingMinor: 30_000, category: "Dining", imageAssetId: await photo("dinner") }], { entryOpen: false });

const browser = await chromium.launch();
const quiet = ctx => ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }));
const phone = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await quiet(c); const p = await c.newPage(); p.on("pageerror", e => errors.push(e.message)); return [c, p]; };
const shot = async (page, name, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };

// Staff sign-in error, desktop and phone. A made-up email, so the real host account never hits the 5-failure pause.
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 }); await quiet(c);
  const p = await c.newPage();
  await p.goto(`${BASE}/studio`); await p.getByLabel("Email").fill("nobody@example.com"); await p.getByLabel("Password", { exact: true }).fill("not-the-password");
  await p.getByRole("button", { name: "Sign in" }).click(); await p.locator(".login-err, .sx-error").first().waitFor(); await shot(p, `h01-login-error-${tag}`);
  await c.close();
}

let [ctx, a] = await phone();
// Wrong event code
await a.goto(`${BASE}/join`); await a.getByLabel("Event code").fill("ZZZZZ9"); await a.locator(".notice-err").waitFor(); await shot(a, "h02-join-badcode-390");
// Missing business name
await a.goto(`${BASE}/e/${main.code}`); await a.getByLabel("Your name").fill("Alice Chen");
await a.getByRole("button", { name: "Join", exact: true }).click(); await a.locator(".notice-err").waitFor();
await a.getByLabel("Business name").scrollIntoViewIfNeeded(); await shot(a, "h03-join-missing-390");
// Wrong rejoin code
await a.getByRole("button", { name: /another phone/ }).click(); await a.getByLabel("Rejoin code").fill("NOPE1234");
await a.getByRole("button", { name: "Continue" }).click(); await a.locator(".notice-err").waitFor(); await shot(a, "h04-rejoin-error-390");
// Joining closed
await a.goto(`${BASE}/e/${closed.code}`); await a.locator(".join-card").waitFor(); await a.locator(".join-card").scrollIntoViewIfNeeded(); await shot(a, "h05-entry-closed-390");
// Empty event
await a.goto(`${BASE}/e/${empty.code}`); await a.getByLabel("Your name").fill("Alice Chen"); await a.getByLabel("Business name").fill("Juniper Design Studio");
await a.getByRole("button", { name: "Join", exact: true }).click(); await a.waitForSelector(".pa-pass"); await shot(a, "h06-empty-event-390", 1200);

// Main event: join, bid on the soon-closing bicycle, get outbid there so it closes lost
await a.goto(`${BASE}/e/${main.code}`); await a.getByLabel("Your name").fill("Alice Chen"); await a.getByLabel("Business name").fill("Juniper Design Studio");
await a.getByRole("button", { name: "Join", exact: true }).click(); await a.waitForSelector(".pa-pass");
const abid = (itemId, amount) => a.evaluate(([c, i, m]) => fetch(`/api/v1/e/${c}/bid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), itemId: i, amountMinor: m }) }).then(r => r.status), [main.code, itemId, amount]);
ok(await bob("POST", `/api/v1/e/${main.code}/join`, { requestId: randomUUID(), displayName: "Bob Rivera", businessName: "Harbor Logistics" }), "bob join");
await abid(main.ids[1], 25_000);
await bob("POST", `/api/v1/e/${main.code}/bid`, { requestId: randomUUID(), itemId: main.ids[1], amountMinor: 27_500 });
await bob("POST", `/api/v1/e/${main.code}/bid`, { requestId: randomUUID(), itemId: main.ids[0], amountMinor: 9_000 });
// Closing soon
await a.goto(`${BASE}/e/${main.code}?s=items&i=${main.ids[0]}`); await a.waitForSelector(".ip"); await shot(a, "h07-closing-soon-390", 1200);
// Unconfirmed: the bid request is aborted before it reaches the server, so the sheet can't know the outcome.
await a.route("**/bid", r => r.abort("internetdisconnected"));
await a.getByRole("button", { name: /^(Bid \$|Place a bid)/ }).last().click(); await a.waitForSelector(".pa-sheet[open]");
await a.locator(".pa-sheet").getByRole("button", { name: /^Bid \$/ }).click(); await a.waitForTimeout(1500); await shot(a, "h08-unconfirmed-sheet-390");
await a.unroute("**/bid");
// Reload with the receipt check blocked: the item page holds the bid as unconfirmed.
await a.route("**/receipt/**", r => r.abort("internetdisconnected"));
await a.reload(); await a.waitForSelector(".ip"); await shot(a, "h09-unconfirmed-item-390", 1200);
await a.unroute("**/receipt/**");
// Closed, someone else won
await sleep(Math.max(0, closesSoon + 2500 - Date.now()));
await a.goto(`${BASE}/e/${main.code}?s=items&i=${main.ids[1]}`); await a.waitForSelector(".ip"); await shot(a, "h10-closed-lost-390", 1200);
await a.goto(`${BASE}/e/${main.code}?s=mine`); await shot(a, "h11-mybids-mixed-390", 1200);

await browser.close();
console.log(JSON.stringify({ main: main.code, errors }));
