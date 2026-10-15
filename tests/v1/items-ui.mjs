#!/usr/bin/env node
// Connected browser checks for the Items workspace: real server, real database, the browser driving the actual Studio.
// Every check confirms the outcome through the API, not just the screen. Creates its own events.
//   BASE=http://127.0.0.1:3421 HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/items-ui.mjs [shots-dir]
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://127.0.0.1:3421", SHOTS = process.argv[2];
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const iso = ms => new Date(Date.now() + ms).toISOString();
const browser = await chromium.launch();
const results = [];
const errors = [];

async function session(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const r = await context.request.post(`${BASE}/api/v1/host/login`, { headers: { origin: BASE, "content-type": "application/json" }, data: { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD } });
  assert.equal(r.status(), 200, "staff login");
  const call = async (method, path, body) => {
    const res = await context.request.fetch(BASE + path, { method, headers: { origin: BASE, ...(body ? { "content-type": "application/json" } : {}) }, data: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    if (res.status() >= 300) throw new Error(`${method} ${path}: ${res.status()} ${JSON.stringify(data)}`);
    return data;
  };
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  return { context, page, call };
}
async function check(name, run) {
  try { await run(); results.push(true); console.log(`ok   ${name}`); }
  catch (e) { results.push(false); console.log(`FAIL ${name}\n     ${e.message.split("\n").slice(0, 6).join("\n     ")}`); }
}
const until = async (what, test, ms = 8000) => {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await test(); if (last) return last; } catch (e) { last = e; } await new Promise(r => setTimeout(r, 150)); }
  throw new Error(`timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}`);
};

const files = await mkdtemp(join(tmpdir(), "bz-items-ui-"));
const image = async (name, hue) => { const p = join(files, name); await writeFile(p, await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 40 + hue, g: 90, b: 160 - hue / 2 } } }).jpeg().toBuffer()); return p; };

const desk = await session(1440, 1000);
const { page, call } = desk;
const ws = id => call("GET", `/api/v1/host/events/${id}`);
const draft = await call("POST", "/api/v1/host/events", { requestId: randomUUID(), name: `Items UI ${randomUUID().slice(0, 5)}`, startsAt: iso(86_400_000), endsAt: iso(90_000_000) });
const open = async (id, extra = "") => { await page.goto(`${BASE}/studio/${id}?mode=setup&view=items${extra}`); await page.locator(".iw-title h1").waitFor(); };
const rows = () => page.locator(".iw-sheet [data-reorder-id]");

await check("type rows: Enter adds an item and starts the next, keeping the category", async () => {
  await open(draft.id);
  const title = page.getByLabel("New item title");
  await title.fill("Weekend cabin in Big Bear");
  await page.getByLabel("New item category").fill("Travel");
  await page.getByLabel("New item provided by").fill("Pine Ridge");
  await page.getByLabel("New item starting bid").fill("400");
  await page.getByLabel("New item starting bid").press("Enter");
  await until("focus returns to a fresh title", () => title.evaluate(el => el === document.activeElement));
  for (const [t, price] of [["Ojai farmhouse retreat", "650"], ["Catalina day trip", "220"]]) {
    await title.fill(t); await page.getByLabel("New item starting bid").fill(price); await page.getByLabel("New item starting bid").press("Enter");
  }
  const w = await until("three items", async () => { const w = await ws(draft.id); return w.items.length === 3 && w; });
  assert.deepEqual(w.items.map(i => [i.title, i.category, i.openingMinor, i.ready]), [["Weekend cabin in Big Bear", "Travel", 40_000, true], ["Ojai farmhouse retreat", "Travel", 65_000, true], ["Catalina day trip", "Travel", 22_000, true]]);
  await until("rows on screen", async () => (await rows().count()) === 3);
});

await check("an unfinished add row survives a reload, and asks for the missing starting bid", async () => {
  await page.getByLabel("New item title").fill("Half-typed item");
  await page.reload(); await page.locator(".iw-title h1").waitFor();
  assert.equal(await page.getByLabel("New item title").inputValue(), "Half-typed item");
  await page.getByLabel("New item title").press("Enter");
  await page.getByText("Add a starting bid to save this item").waitFor();
  assert.equal((await ws(draft.id)).items.length, 3, "nothing saved without a starting bid");
  await page.getByLabel("New item title").press("Escape");
  assert.equal(await page.getByLabel("New item title").inputValue(), "");
});

await check("paste rows: review, fix a row, add them all; they arrive selected", async () => {
  await page.getByRole("button", { name: "Paste rows" }).click();
  // Opening the dialog must put the cursor in the paste box, so Cmd+V works straight away (staff never click into it).
  await until("paste box focused", () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Paste spreadsheet rows here"), 3000);
  await page.keyboard.insertText("Item\tStarting bid\tCategory\tDonated by\nOmakase for two\t$260\tDining\tKaito Sushi\nCoffee for a year\t150\tFood & drink\tHarbor Roasters\nMystery box\tfree\tGift cards\tSaturn\nYoga pass\t150\tWellness\tBlue Lotus\nGolf for four\t420\tExperiences\tBrookside");
  await page.getByText("1 row to fix or leave out").waitFor();
  await page.getByLabel("Row 3 starting bid").fill("100");
  await page.getByText("5 items ready").waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/paste-review-1440.png` });
  await page.getByRole("button", { name: "Add 5 items" }).click();
  await page.locator(".iw-bulk").getByText("selected").waitFor();
  const w = await ws(draft.id);
  assert.equal(w.items.length, 8);
  assert.deepEqual(w.items.slice(3).map(i => [i.title, i.openingMinor, i.category]), [["Omakase for two", 26_000, "Dining"], ["Coffee for a year", 15_000, "Food & drink"], ["Mystery box", 10_000, "Gift cards"], ["Yoga pass", 15_000, "Wellness"], ["Golf for four", 42_000, "Experiences"]]);
  assert.equal(await page.locator(".bk-n b").textContent(), "5");
});

await check("bulk: set a new category on the selection, then hide it from guests", async () => {
  await page.locator(".iw-bulk").getByRole("button", { name: "Set category" }).click();
  await page.getByLabel("New category name").fill("Member picks");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await until("category set", async () => (await ws(draft.id)).items.slice(3).every(i => i.category === "Member picks"));
  await page.locator(".iw-bulk").getByRole("button", { name: "Hide" }).click();
  const w = await until("hidden", async () => { const w = await ws(draft.id); return w.items.slice(3).every(i => !i.ready) && w; });
  assert.ok(w.items.slice(0, 3).every(i => i.ready));
  assert.ok(w.event.categories.includes("Member picks"));
  await page.getByRole("button", { name: "Clear selection" }).click();
});

await check("filters: hidden, category and search narrow the sheet; clearing restores it", async () => {
  await page.locator(".fchip", { hasText: "Hidden" }).click();
  await until("5 hidden rows", async () => (await rows().count()) === 5);
  await page.locator(".fchip", { hasText: "All" }).click();
  await page.locator(".cchip", { hasText: "Travel" }).click();
  await until("3 travel rows", async () => (await rows().count()) === 3);
  await page.locator(".cchip", { hasText: /^All$/ }).click();
  await page.getByLabel("Search items").fill("cabin");
  await until("1 search row", async () => (await rows().count()) === 1);
  assert.ok(await page.locator(".grip").first().isDisabled(), "reordering pauses while filtered");
  await page.getByLabel("Search items").fill("");
  await until("all rows", async () => (await rows().count()) === 8);
});

await check("inline cells save on leaving them: title, starting bid, category with an existing spelling", async () => {
  const first = rows().first();
  await first.getByLabel(/^Title of item 01/).fill("Weekend cabin, Big Bear");
  await first.getByLabel(/^Title of item 01/).press("Enter");
  const bid = rows().nth(1).getByLabel(/^Starting bid of/);
  await bid.click(); await bid.fill("700"); await bid.press("Enter");
  const cat = rows().nth(2).getByLabel(/^Category of/);
  await cat.click(); await cat.fill("member PICKS"); await cat.press("Tab");
  const w = await until("saved", async () => { const w = await ws(draft.id); return w.items[0].title === "Weekend cabin, Big Bear" && w.items[1].openingMinor === 70_000 && w.items[2].category === "Member picks" && w; });
  assert.ok(w);
  await page.locator(".save.s-saved").waitFor();
});

await check("keyboard reorder: Space picks up, arrows move, Space drops; the order is saved", async () => {
  const before = (await ws(draft.id)).items.map(i => i.id);
  const grip = rows().nth(2).locator(".grip");
  await grip.focus(); await page.keyboard.press("Space"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("Space");
  const after = await until("moved", async () => { const ids = (await ws(draft.id)).items.map(i => i.id); return ids[0] === before[2] && ids; });
  assert.deepEqual(after, [before[2], before[0], before[1], ...before.slice(3)]);
  await rows().nth(0).locator(".grip").focus(); await page.keyboard.press("Alt+ArrowDown");
  await until("nudged", async () => (await ws(draft.id)).items[1].id === before[2]);
});

await check("drag reorder with the pointer saves the new order", async () => {
  const before = (await ws(draft.id)).items.map(i => i.id);
  const from = await rows().nth(4).locator(".grip").boundingBox(), to = await rows().nth(1).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(from.x + from.width / 2, from.y + (to.y + 8 - from.y) * k / 12);
  await page.mouse.up();
  await until("dragged", async () => (await ws(draft.id)).items[1].id === before[4]);
});

await check("photo tray: upload never assigns; suggestions, undo, drag, tap-to-place and replace all go through the batch", async () => {
  const w0 = await ws(draft.id);
  await rows().nth(0).locator('.ph-cell input[type="file"]').setInputFiles(await image("anything.jpg", 10));
  await until("row photo", async () => (await ws(draft.id)).items[0].imageAssetId);
  const second = w0.items[1], third = w0.items[2], fourth = w0.items[3], fifth = w0.items[4];
  await page.locator("input[type=file][data-tray-input]").setInputFiles([await image(`${String(second.position + 1).padStart(2, "0")}.jpg`, 40), await image(`${third.title.split(" ")[0].toLowerCase()}-photo.jpg`, 80), await image("IMG_9921.jpg", 120), await image("IMG_9922.jpg", 150)]);
  const ready = page.locator('[data-photo-tray] [data-tray-photo][data-state="ready"]');
  await until("4 ready", async () => (await ready.count()) === 4, 30000);
  let w = await ws(draft.id);
  assert.ok([second, third, fourth, fifth].every(x => !w.items.find(i => i.id === x.id).imageAssetId), "uploading changes no item");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/photo-tray-1440.png` });
  assert.equal(await page.locator("[data-tray-photo]", { hasText: "IMG_9921.jpg" }).locator(".tt-no").count(), 0, "camera names aren't guessed");
  await page.getByRole("button", { name: "Place 2 matches" }).click();
  await until("matches placed", async () => { const w = await ws(draft.id); return w.items.find(i => i.id === second.id).imageAssetId && w.items.find(i => i.id === third.id).imageAssetId; });
  await until("tray has 2", async () => (await page.locator("[data-tray-photo]").count()) === 2);
  // Undo puts both photos back in the tray and the items back as they were.
  await page.locator(".iw-notice").getByRole("button", { name: "Undo" }).click();
  await until("undone", async () => { const w = await ws(draft.id); return !w.items.find(i => i.id === second.id).imageAssetId && !w.items.find(i => i.id === third.id).imageAssetId; });
  await until("tray has 4 again", async () => (await page.locator("[data-tray-photo]").count()) === 4);
  await page.getByRole("button", { name: "Place 2 matches" }).click();
  await until("placed again", async () => (await ws(draft.id)).items.find(i => i.id === third.id).imageAssetId);
  // Drag a camera-named photo onto a row without a photo.
  await page.locator('[data-tray-photo][data-state="ready"]', { hasText: "IMG_9921.jpg" }).locator(".tt-hit").dragTo(page.locator(`[data-item-row="${fourth.id}"]`));
  await until("dragged photo placed", async () => (await ws(draft.id)).items.find(i => i.id === fourth.id).imageAssetId);
  // Tap a photo, then a row that already has one: it asks first, then replaces.
  const before = (await ws(draft.id)).items.find(i => i.id === second.id).imageAssetId;
  await page.locator('[data-tray-photo]', { hasText: "IMG_9922.jpg" }).locator(".tt-hit").click();
  await page.getByRole("button", { name: `Place the photo on ${second.title}` }).click();
  await page.getByRole("alertdialog", { name: "Replace photo" }).getByRole("button", { name: "Replace", exact: true }).click();
  await until("replaced", async () => { const a = (await ws(draft.id)).items.find(i => i.id === second.id).imageAssetId; return a && a !== before; });
  await until("tray empty", async () => (await page.locator("[data-tray-photo]").count()) === 0);
  w = await ws(draft.id);
  assert.deepEqual(w.items.find(i => i.id === second.id).imageFrame, { x: 0.5, y: 0.5, zoom: 1 }, "a placed photo starts centred");
});

await check("photo tray: an undecodable HEIC stays in the tray and says to use JPEG", async () => {
  await page.locator("input[type=file][data-tray-input]").setInputFiles([{ name: "IMG_4242.HEIC", mimeType: "image/heic", buffer: Buffer.from("not decodable here") }]);
  const failed = page.locator('[data-tray-photo][data-state="failed"]');
  await failed.waitFor();
  assert.match(await failed.textContent(), /JPEG/);
  await failed.getByRole("button", { name: /^Remove IMG_4242/ }).click();
  await until("removed", async () => (await page.locator("[data-tray-photo]").count()) === 0);
});

await check("photo tray: every uploaded photo shows a thumbnail, even one without a local preview (HEIC in Safari)", async () => {
  // A HEIC name gets no local preview; Safari still uploads it. Real JPEG bytes stand in for what Safari can decode.
  const bytes = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
  await page.locator("input[type=file][data-tray-input]").setInputFiles([{ name: "IMG_5555.HEIC", mimeType: "image/jpeg", buffer: bytes }]);
  const tile = page.locator('[data-tray-photo][data-state="ready"]', { hasText: "IMG_5555" });
  await tile.waitFor({ timeout: 60_000 });
  await until("thumbnail drawn", async () => tile.locator("img").evaluate(img => img.complete && img.naturalWidth > 0).catch(() => false));
  await tile.getByRole("button", { name: /^Remove IMG_5555/ }).click();
  await until("removed", async () => (await page.locator("[data-tray-photo]").count()) === 0);
});
await check("categories: rename merges into an existing name after confirming; guest order follows", async () => {
  await page.locator(".cchip.manage").click();
  await page.getByRole("heading", { name: "Categories" }).waitFor();
  const rename = page.getByLabel("Rename Wellness");
  await rename.fill("Member Picks"); await rename.press("Enter");
  await page.getByText(/Merge Wellness into Member picks/).waitFor();
  await page.getByRole("button", { name: "Merge" }).click();
  await until("merged", async () => !(await ws(draft.id)).event.categories.includes("Wellness"));
  await page.getByLabel("New category").fill("Saved for later"); await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await until("added", async () => (await ws(draft.id)).event.categories.includes("Saved for later"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/categories-1440.png` });
  await page.getByRole("button", { name: "Close" }).click();
});

await check("published event: a new item starts hidden; Show makes it visible to guests", async () => {
  let w = await ws(draft.id);
  await call("PATCH", `/api/v1/host/events/${draft.id}`, { revision: w.event.revision, status: "live", startsAt: iso(-60_000) });
  await open(draft.id);
  await page.getByLabel("New item title").fill("Late donation: team lunch");
  await page.getByLabel("New item starting bid").fill("220"); await page.getByLabel("New item starting bid").press("Enter");
  const late = await until("late item", async () => (await ws(draft.id)).items.find(i => i.title === "Late donation: team lunch"));
  assert.equal(late.ready, false, "hidden until staff show it");
  const row = page.locator(".iw-sheet [data-reorder-id]", { has: page.locator('input[value="Late donation: team lunch"]') });
  await until("a hidden row says so", async () => (await row.getByText("Hidden", { exact: true }).count()) === 1);
  await row.getByRole("button", { name: "Show Late donation: team lunch to guests" }).click();
  await until("shown", async () => (await ws(draft.id)).items.find(i => i.id === late.id).ready);
});

await check("bulk delete keeps items people have bid on", async () => {
  let w = await ws(draft.id);
  const guest = await browser.newContext(), g = guest.request;
  await g.post(`${BASE}/api/v1/e/${w.event.code}/join`, { headers: { origin: BASE, "content-type": "application/json" }, data: { requestId: randomUUID(), displayName: "Gia", businessName: "Guest Co" } });
  const target = w.items.find(i => i.ready);
  const bid = await g.post(`${BASE}/api/v1/e/${w.event.code}/bid`, { headers: { origin: BASE, "content-type": "application/json" }, data: { requestId: randomUUID(), itemId: target.id, amountMinor: target.openingMinor } });
  assert.equal(bid.status(), 201);
  await page.reload(); await page.locator(".iw-title h1").waitFor();
  const other = w.items.find(i => i.title === "Mystery box");
  for (const id of [target.id, other.id]) await page.locator(`.iw-sheet [data-reorder-id="${id}"] .c-sel input`).check();
  await page.locator(".iw-bulk").getByRole("button", { name: "Delete" }).click();
  await page.getByText("1 item with bids will be kept.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Delete 1" }).click();
  w = await until("deleted", async () => { const w = await ws(draft.id); return !w.items.some(i => i.id === other.id) && w; });
  assert.ok(w.items.some(i => i.id === target.id));
  await guest.close();
});

await check("sidebar list: compact past eight items, searchable, opens the workspace", async () => {
  while ((await ws(draft.id)).items.length < 9) await call("POST", `/api/v1/host/events/${draft.id}/items`, { requestId: randomUUID(), title: "Extra raffle basket", openingMinor: 5_000, ready: true });
  await page.goto(`${BASE}/studio/${draft.id}?mode=setup`);
  await page.getByLabel("Find an item").waitFor();
  await page.getByLabel("Find an item").fill("golf");
  await until("one match", async () => (await page.locator(".inav-list > li").count()) === 1);
  await page.getByRole("button", { name: /All items/ }).click();
  await page.locator(".iw-title h1").waitFor();
  assert.match(page.url(), /view=items/);
  await page.goBack();
  await page.getByLabel("Find an item").waitFor();
});

const phone = await session(390, 844);
await check("phone: no sideways scrolling; tapping a title opens the item editor; add row works", async () => {
  const p = phone.page;
  await p.goto(`${BASE}/studio/${draft.id}?mode=setup&view=items`);
  await p.locator(".iw-title h1").waitFor();
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal overflow");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/workspace-390.png` });
  await p.getByLabel("New item title").fill("Phone-added item");
  await p.getByLabel("New item starting bid").fill("75");
  await p.getByRole("button", { name: "Add", exact: true }).click();
  await until("phone item", async () => (await phone.call("GET", `/api/v1/host/events/${draft.id}`)).items.some(i => i.title === "Phone-added item"));
  await p.locator(".t-open").first().click();
  await until("item editor", async () => /item=/.test(p.url()));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "editor has no horizontal overflow");
});

await check("no browser page errors", async () => { assert.deepEqual(errors, []); });
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
