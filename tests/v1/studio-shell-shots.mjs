#!/usr/bin/env node
// Studio screenshots through the real UI. Run tests/v1/shell-shots.mjs first; pass its eventId for Live/Results/Stage.
//   BASE=... HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/studio-shell-shots.mjs <out-dir> <seeded-event-id>
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3420", OUT = process.argv[2] ?? ".shots", SEEDED = process.argv[3];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const quiet = ctx => ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }));
const watch = (page, tag) => { page.on("pageerror", e => errors.push(`${tag}: ${e.message}`)); page.on("console", m => { if (m.type() === "error" && !/409|Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text().slice(0, 200)}`); }); };
const shot = async (page, name, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };
async function signIn(page) {
  await page.goto(BASE + "/studio");
  await page.getByLabel("Email").fill(process.env.HOST_EMAIL); await page.getByLabel("Password", { exact: true }).fill(process.env.HOST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click(); await page.locator(".home-wrap").waitFor();
}

// ------------------------------------------------------------ desktop
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await quiet(desk);
const p = await desk.newPage(); watch(p, "desk");
await p.goto(BASE + "/studio"); await p.getByLabel("Email").waitFor(); await shot(p, "s01-login-1440", 900);
await signIn(p); await shot(p, "s02-home-1440", 1200);
await p.getByRole("button", { name: "Staff & access" }).click(); await p.locator(".staff-dlg").waitFor(); await shot(p, "s02b-staff-1440", 900);
await p.keyboard.press("Escape");
await p.getByRole("button", { name: "New event", exact: true }).click(); await p.locator(".tpl-grid").waitFor(); await shot(p, "s03-gallery-1440", 900);
await p.getByRole("button", { name: /Use the Trade show auction template/ }).click(); await shot(p, "s04-details-1440");
await p.getByRole("button", { name: /Create and open the editor/ }).click();
await p.waitForURL(/\/studio\/[0-9a-f-]{36}/); await p.locator(".device-screen").waitFor(); await shot(p, "s05-editor-welcome-1440", 1400);
await p.locator(".top-acts").getByRole("button", { name: /Go live/ }).click(); await p.locator(".golive-dlg").waitFor(); await shot(p, "s05b-golive-check-1440", 700);
await p.getByRole("button", { name: "Not yet" }).click(); await p.waitForTimeout(300);
await p.locator(".cv-bar").getByRole("tab", { name: "Items" }).click(); await shot(p, "s06-editor-items-1440", 900);
await p.locator(".cv-card").first().hover(); await shot(p, "s06b-editor-item-hover-1440", 400);
// Inline edit on the phone: click the title text and type.
const title = p.locator(".cv-card").first().locator(".lc-title");
await title.click(); await p.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A"); await p.keyboard.type("Weekend in Big Bear");
await shot(p, "s07-inline-edit-1440", 300);
await p.keyboard.press("Enter"); await p.waitForTimeout(1200);
await p.locator(".cv-card").nth(1).locator(".cv-tools").getByRole("button", { name: "Open item page" }).click({ force: true });
await shot(p, "s08-editor-itempage-1440", 1200);
await p.locator(".ol").getByRole("button", { name: /Look/ }).click(); await p.getByRole("button", { name: /Midnight/ }).click(); await shot(p, "s09-theme-1440", 1500);
await p.locator(".ol").getByRole("button", { name: /Schedule/ }).click(); await shot(p, "s09b-schedule-1440", 700);
await p.locator(".top-acts").getByRole("button", { name: /Share/ }).click(); await p.locator(".share").waitFor(); await shot(p, "s10-share-draft-1440", 900);
await p.keyboard.press("Escape");

if (SEEDED) {
  await p.goto(`${BASE}/studio/${SEEDED}?mode=live`); await p.locator(".live").waitFor(); await shot(p, "s11-live-1440", 1500);
  await p.locator(".tile", { hasText: "Coffee for a year" }).click(); await p.locator(".ops").waitFor(); await shot(p, "s11b-live-item-ops-1440", 900);
  await p.locator(".ops .f-void").first().click({ force: true }); await p.locator(".ops-confirm").waitFor(); await shot(p, "s11c-live-void-1440", 600);
  await p.goto(`${BASE}/studio/${SEEDED}?mode=results`); await p.locator(".results").waitFor(); await shot(p, "s12-results-1440", 1200);
  await p.goto(`${BASE}/studio/${SEEDED}?mode=setup`); await p.locator(".device-screen").waitFor(); await shot(p, "s13-editor-live-event-1440", 1400);
  await p.locator("details.housekeeping").evaluate(d => { d.open = true; d.scrollIntoView(); }); await shot(p, "s13b-housekeeping-1440", 600);
  await p.locator(".top-acts").getByRole("button", { name: /Share/ }).click(); await p.locator(".share").waitFor(); await shot(p, "s14-share-live-1440", 900);
  const stage = await desk.newPage(); watch(stage, "stage");
  await stage.goto(`${BASE}/studio/${SEEDED}/stage`); await stage.locator(".st-main, .finale").first().waitFor(); await shot(stage, "s15-stage-1440", 2200);
  await stage.setViewportSize({ width: 1920, height: 1080 }); await shot(stage, "s16-stage-1920", 1500);
}

// ------------------------------------------------------------ phone
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await quiet(phone);
const m = await phone.newPage(); watch(m, "phone");
await signIn(m); await shot(m, "s20-home-390", 1200);
if (SEEDED) {
  await m.goto(`${BASE}/studio/${SEEDED}?mode=live`); await m.locator(".live").waitFor(); await shot(m, "s21-live-390", 1200);
  await m.goto(`${BASE}/studio/${SEEDED}?mode=results`); await m.locator(".results").waitFor(); await shot(m, "s22-results-390", 1000);
  await m.goto(`${BASE}/studio/${SEEDED}?mode=setup`); await m.locator(".setup").waitFor(); await shot(m, "s23-editor-390", 1400);
  await m.locator(".pane-tabs").getByRole("tab", { name: /Steps/ }).click(); await shot(m, "s24-steps-390", 600);
}
console.log(JSON.stringify({ errors }));
await browser.close();
