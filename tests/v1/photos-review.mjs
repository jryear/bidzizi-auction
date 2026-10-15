#!/usr/bin/env node
// Visual review captures for real-v1-photos-001: photo framing (tall, wide and square photos on the cover and items),
// the photo tray with 20+ photos mid-upload and mid-assignment, the compact table, the collapsed preview, and the
// Items workspace's phone header and bulk bar. PHASE=before drives the pre-tranche UI (old focal editor, matching
// dialog); PHASE=after drives the new one. Seeds its own draft event through the staff API.
//   BASE=http://127.0.0.1:3461 HOST_EMAIL=... HOST_PASSWORD=... PHASE=after node tests/v1/photos-review.mjs <out-dir>
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://127.0.0.1:3461", PHASE = process.env.PHASE ?? "after", OUT = process.argv[2] ?? `docs/plans/photos-review/${PHASE}`;
await mkdir(OUT, { recursive: true });
const iso = ms => new Date(Date.now() + ms).toISOString();
function client() {
  const jar = new Map();
  return async (method, path, body, type = "application/json") => {
    const headers = { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = type;
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body });
    for (const set of r.headers.getSetCookie()) { const [pair] = set.split(";"); const [k, ...v] = pair.split("="); jar.set(k, v.join("=")); }
    const data = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : null;
    if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
    return data;
  };
}
const staff = client();
await staff("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });

// ---------------------------------------------------------------- photos of three shapes, plus a pile for the tray
const lots = "prototypes/lanyard/assets/lots";
const crop = async (name, left, top, width, height, hue = 0) => sharp(await readFile(`${lots}/${name}.jpg`)).extract({ left, top, width, height }).modulate({ hue }).jpeg({ quality: 86 }).toBuffer();
const SHAPES = {
  tall: await crop("flowers", 300, 0, 400, 667),
  wide: await crop("cabin", 0, 140, 1000, 400),
  square: await crop("ceramics", 200, 0, 599, 599),
};
const upload = async buf => (await staff("POST", "/api/v1/host/assets", buf, "image/jpeg")).id;

const ROWS = [
  ["Weekend cabin in Big Bear", 400, "Travel", "Pine Ridge Rentals", "wide"],
  ["Flower subscription, 6 months", 180, "Home", "Bloom & Stem", "tall"],
  ["Hand-thrown dinnerware set", 260, "Home", "Clay Studio", "square"],
  ["Coffee for a year", 200, "Food & drink", "Harbor Roasters", "coffee"],
  ["Chef's table for six", 600, "Dining", "Juniper Kitchen", "dinner"],
  ["Restored city bicycle", 350, "Wellness", "Spoke & Chain", "bicycle"],
  ["Ojai farmhouse retreat", 650, "Travel", "Topa Farm Stays", "cabin"],
  ["Pottery class for two", 120, "Experiences", "Clay Studio", "ceramics"],
  ["Wine tasting for eight", 300, "Food & drink", "Cellar Door", "dinner"],
  ["Spring bouquet delivery", 90, "Home", "Bloom & Stem", "flowers"],
  ["Espresso machine", 450, "Food & drink", "Harbor Roasters", "coffee"],
  ["E-bike for a month", 280, "Wellness", "Spoke & Chain", "bicycle"],
  ["Team lunch for 15", 220, "Dining", "Sunny Side Catering", null],
  ["Office plant makeover", 180, "Home", "Greenspace", null],
  ["Brand photo shoot", 500, "Services", "Northlight Studio", null],
  ["Website audit", 400, "Services", "Northpoint IT", null],
  ["Golf foursome", 320, "Experiences", "Oak Hills Club", null],
  ["Spa day for two", 380, "Wellness", "Stillwater Spa", null],
  ["Concert box seats", 600, "Experiences", "The Rialto", null],
  ["Sailing afternoon", 420, "Experiences", "Harbor Sail Co", null],
  ["Cooking class", 150, "Experiences", "Juniper Kitchen", null],
  ["Wine club, 3 months", 240, "Food & drink", "Cellar Door", null],
  ["Desk chair", 300, "Home", "Seat Co", null],
  ["Holiday party catering", 900, "Dining", "Sunny Side Catering", null],
];
const ev = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), template: "blank", name: "Holiday Trade Show", startsAt: iso(2 * 86_400_000), endsAt: iso(2 * 86_400_000 + 4 * 3600_000), timezone: "America/Los_Angeles" });
let w = await staff("GET", `/api/v1/host/events/${ev.id}`);
for (const it of w.items) await staff("DELETE", `/api/v1/host/items/${it.id}`);
const created = await staff("POST", `/api/v1/host/events/${ev.id}/items/batch`, { requestId: randomUUID(), items: ROWS.map(([title, dollars, category, donor]) => ({ title, openingMinor: dollars * 100, category, donor, short: `Provided by ${donor}` })) });
const changes = [];
for (const [n, [, , , , src]] of ROWS.entries()) {
  if (!src) continue;
  const buf = SHAPES[src] ?? await crop(src, 0, 0, 1000, src === "ceramics" ? 599 : 667, (n * 23) % 40 - 20);
  changes.push({ id: created.ids[n], imageAssetId: await upload(buf) });
}
await staff("PATCH", `/api/v1/host/events/${ev.id}/items`, { changes });
w = await staff("GET", `/api/v1/host/events/${ev.id}`);
await staff("PATCH", `/api/v1/host/events/${ev.id}`, { revision: w.event.revision, coverAssetId: await upload(SHAPES.wide), venue: "Saturn Hall, Pasadena", welcome: "Every item was donated by a Saturn member business." });
w = await staff("GET", `/api/v1/host/events/${ev.id}`);
const byTitle = t => w.items.find(i => i.title === t);
const shapeItem = { wide: byTitle(ROWS[0][0]), tall: byTitle(ROWS[1][0]), square: byTitle(ROWS[2][0]) };

// 24 camera-named files for the tray, a few named after items so suggestions have something to find.
const trayFiles = [];
for (let n = 0; n < 24; n++) {
  const src = ["cabin", "coffee", "bicycle", "dinner", "flowers", "ceramics"][n % 6];
  const name = n === 3 ? "team-lunch.jpg" : n === 7 ? "golf-foursome.jpg" : n === 11 ? "spa-day.jpg" : `IMG_${9921 + n}.jpg`;
  trayFiles.push({ name, mimeType: "image/jpeg", buffer: await crop(src, (n * 37) % 300, 0, 700, src === "ceramics" ? 599 : 667, (n * 29) % 60 - 30) });
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch(), errors = [];
async function page(width, height, prefs = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.request.post(`${BASE}/api/v1/host/login`, { headers: { origin: BASE, "content-type": "application/json" }, data: { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD } });
  await context.addInitScript(p => { try { for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v); } catch { /* ignore */ } }, prefs);
  const p = await context.newPage();
  p.on("pageerror", e => errors.push(e.message));
  return p;
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const items = async p => { await p.goto(`${BASE}/studio/${ev.id}?mode=setup&view=items`); await p.locator(".iw-title h1").waitFor(); await p.waitForTimeout(800); };
const settle = p => p.waitForTimeout(900);

async function frameShots(p, width) {
  for (const [shape, item] of Object.entries(shapeItem)) {
    await p.goto(`${BASE}/studio/${ev.id}?mode=setup&screen=item&item=${item.id}`);
    await p.locator("[data-preview-device] .device-screen").waitFor(); await settle(p);
    if (PHASE === "before") {
      if (width < 800) await p.getByRole("tab", { name: "Edit", exact: true }).click();
      await p.getByRole("button", { name: "Adjust photo", exact: true }).click(); await settle(p);
      await p.locator(".focal-editor").scrollIntoViewIfNeeded();
    } else {
      await p.getByRole("button", { name: "Adjust photo", exact: true }).first().click(); await settle(p);
      const ed = p.locator("[data-frame-editor]").first(); await ed.waitFor();
      const zoom = p.getByRole("slider", { name: "Zoom" }).first();
      await zoom.focus(); for (let n = 0; n < 8; n++) await p.keyboard.press("ArrowRight");
      const win = await p.locator("[data-frame-window]").first().boundingBox();
      if (win) { await p.mouse.move(win.x + win.width / 2, win.y + win.height / 2); await p.mouse.down(); await p.mouse.move(win.x + win.width / 2 - 40, win.y + win.height / 2 + 20, { steps: 6 }); }
      await settle(p);
      await shot(p, `frame-item-${shape}-dragging-${width}`);
      await p.mouse.up();
    }
    await settle(p); await shot(p, `frame-item-${shape}-${width}`);
    if (PHASE === "after") { await p.getByRole("button", { name: "Done", exact: true }).first().click(); await settle(p); await shot(p, `framed-item-${shape}-${width}`); }
  }
  await p.goto(`${BASE}/studio/${ev.id}?mode=setup&screen=welcome`);
  await p.locator("[data-preview-device] .device-screen").waitFor(); await settle(p);
  if (PHASE === "before") {
    if (width < 800) await p.getByRole("tab", { name: "Edit", exact: true }).click();
    await p.getByRole("button", { name: "Adjust photo", exact: true }).click(); await settle(p);
  } else {
    await p.getByRole("button", { name: "Adjust photo", exact: true }).first().click(); await settle(p);
    const zoom = p.getByRole("slider", { name: "Zoom" }).first();
    await zoom.focus(); for (let n = 0; n < 5; n++) await p.keyboard.press("ArrowRight");
    await settle(p);
  }
  await shot(p, `frame-cover-${width}`);
  if (PHASE === "after") { await p.keyboard.press("Escape"); }
}

async function trayShots(p, width) {
  await items(p);
  const input = PHASE === "before" ? p.locator(".iw-head input[type=file]") : p.locator("input[type=file][data-tray-input]");
  // Slow every upload a little, so the capture shows the tray mid-upload rather than finished.
  await p.route("**/api/v1/host/assets", async route => { await new Promise(r => setTimeout(r, 700)); await route.continue(); });
  await input.setInputFiles(trayFiles);
  if (PHASE === "before") {
    await p.locator("dialog.photo-dlg").waitFor(); await settle(p); await shot(p, `tray-matching-${width}`);
    await p.locator("dialog.photo-dlg .iw-dlg-foot .sx-btn.primary").click(); await p.waitForTimeout(2500); await shot(p, `tray-uploading-${width}`);
    await p.locator("dialog.photo-dlg").waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
  } else {
    await p.locator("[data-tray-photo]").first().waitFor(); await p.waitForTimeout(2200); await shot(p, `tray-uploading-${width}`);
    await p.locator('[data-tray-photo][data-state="uploading"]').first().waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
    await settle(p); await shot(p, `tray-ready-${width}`);
    const ready = p.locator('[data-tray-photo][data-state="ready"]');
    await p.locator(".fchip", { hasText: "No photo" }).click(); await settle(p);
    const target = p.locator(".iw-row.no-photo").first();
    if (width >= 800) {
      const a = await ready.nth(1).boundingBox(), b = await target.boundingBox();
      await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await settle(p);
      await shot(p, `tray-assigning-${width}`); await p.mouse.up(); await settle(p);
    } else {
      await ready.nth(1).click(); await settle(p); await shot(p, `tray-assigning-${width}`);
      await target.locator(".iw-place").click(); await settle(p);
    }
    await shot(p, `tray-assigned-${width}`);
  }
  await p.unroute("**/api/v1/host/assets");
}

// 1440
const d = await page(1440, 1000);
await items(d); await shot(d, "workspace-1440");
if (PHASE === "after") {
  await d.getByRole("radio", { name: "Compact", exact: true }).click(); await settle(d); await shot(d, "workspace-compact-1440");
  await d.getByRole("button", { name: "Show guest phone", exact: true }).click(); await settle(d); await shot(d, "workspace-phone-open-1440");
  await d.getByRole("button", { name: "Hide guest phone", exact: true }).click(); await d.getByRole("radio", { name: "Comfortable", exact: true }).click();
}
await frameShots(d, 1440);
await trayShots(await page(1440, 1000), 1440);

// 390
const m = await page(390, 844);
await items(m); await shot(m, "workspace-390");
if (!await m.locator(".iw-sheet [data-reorder-id] .c-sel input").first().isVisible()) await m.getByRole("button", { name: "Select", exact: true }).click();
await m.locator(".iw-sheet [data-reorder-id]").nth(1).locator(".c-sel input").check();
await m.locator(".iw-sheet [data-reorder-id]").nth(2).locator(".c-sel input").check();
await m.locator(".iw-sheet [data-reorder-id]").nth(3).locator(".c-sel input").check();
await settle(m); await shot(m, "bulk-390");
await frameShots(await page(390, 844), 390);
await trayShots(await page(390, 844), 390);

await browser.close();
console.log(JSON.stringify({ phase: PHASE, eventId: ev.id, out: OUT, errors }));
