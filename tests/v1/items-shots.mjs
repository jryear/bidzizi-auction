#!/usr/bin/env node
// Captures the Items workspace on a seeded event (tests/v1/seed-trade-show.mjs) at 1440px and 390px.
//   BASE=... HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/items-shots.mjs <out-dir> <event-id>
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3420", [OUT = ".shots/items", EVENT] = process.argv.slice(2);
if (!EVENT) { console.error("Pass the seeded event id."); process.exit(2); }
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(), errors = [];
async function page(width, height, preview) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.request.post(`${BASE}/api/v1/host/login`, { headers: { origin: BASE, "content-type": "application/json" }, data: { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD } });
  await context.addInitScript(p => { try { localStorage.setItem("bz_items_preview", p ? "1" : "0"); } catch { /* ignore */ } }, preview);
  const p = await context.newPage();
  p.on("pageerror", e => errors.push(e.message));
  return p;
}
const items = async p => { await p.goto(`${BASE}/studio/${EVENT}?mode=setup&view=items`); await p.locator(".iw-title h1").waitFor(); await p.waitForTimeout(600); };
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });

const d = await page(1440, 1000, true);
await items(d); await shot(d, "workspace-1440");
await d.locator(".iw-sheet [data-reorder-id]").nth(4).getByLabel(/^Title of item/).focus(); await d.waitForTimeout(500); await shot(d, "workspace-focus-1440");
for (const n of [6, 7, 8, 9]) await d.locator(".iw-sheet [data-reorder-id]").nth(n).locator(".c-sel input").check();
await d.mouse.move(700, 900); await d.waitForTimeout(300); await shot(d, "bulk-1440");
await d.locator(".iw-bulk").getByRole("button", { name: "Set category" }).click(); await d.waitForTimeout(200); await shot(d, "bulk-category-1440");
await d.keyboard.press("Escape"); await d.getByRole("button", { name: "Clear selection" }).click();
await d.getByRole("button", { name: "Paste rows" }).click();
await d.getByLabel("Paste spreadsheet rows here").fill("Item\tStarting bid\tCategory\tDonated by\nAfternoon tea for six\t$140\tDining\tRose & Crown\nSurfboard and two lessons\t$300\tExperiences\tSwell Surf Co\nE-bike for a month\tnine hundred\tWellness\tSpoke & Chain\nOffice plant makeover\t180\tHome & design\tGreenspace");
await d.waitForTimeout(300); await shot(d, "paste-1440"); await d.getByRole("button", { name: "Close" }).click();
await d.locator(".cchip.manage").click(); await d.waitForTimeout(300); await shot(d, "categories-1440"); await d.getByRole("button", { name: "Close" }).click();

const full = await page(1440, 1000, false);
await items(full); await shot(full, "workspace-full-1440");
await full.locator(".fchip", { hasText: "Hidden" }).click(); await full.waitForTimeout(300); await shot(full, "filter-hidden-1440");
await full.goto(`${BASE}/studio/${EVENT}?mode=setup`); await full.locator(".inav").waitFor(); await full.waitForTimeout(600); await shot(full, "sidebar-1440");
await full.locator(".inav-row.is-hidden").first().click(); await full.waitForTimeout(600); await shot(full, "item-editor-1440");

const m = await page(390, 844, false);
await items(m); await shot(m, "workspace-390");
await m.getByRole("button", { name: "Select" }).click();
for (const n of [1, 2]) await m.locator(".iw-sheet [data-reorder-id]").nth(n).locator(".c-sel input").check();
await m.waitForTimeout(300); await shot(m, "bulk-390");
await m.getByRole("button", { name: "Clear selection" }).click();
await m.locator(".iw-add").scrollIntoViewIfNeeded(); await m.waitForTimeout(300); await shot(m, "add-row-390");
await m.getByRole("tab", { name: "Guest phone" }).click(); await m.waitForTimeout(500); await shot(m, "phone-preview-390");
await m.getByRole("tab", { name: "List" }).click();
await m.locator(".t-open").nth(3).click(); await m.waitForTimeout(600); await shot(m, "item-editor-390");
console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
