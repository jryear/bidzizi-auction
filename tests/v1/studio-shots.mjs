#!/usr/bin/env node
// Screenshots of the Studio against a running app. Usage: node tests/v1/studio-shots.mjs <out-dir>
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3410", OUT = process.argv[2] ?? ".shots";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(BASE + "/studio");
await page.getByLabel("Email").fill(process.env.HOST_EMAIL); await page.getByLabel("Password").fill(process.env.HOST_PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByText("Start something new").waitFor(); await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/s1-gallery.png` });

// New event from the trade-show template, all through the UI.
await page.getByRole("button", { name: /Trade show auction/ }).click();
await page.getByRole("button", { name: "Create & edit" }).click();
await page.waitForURL(/\/studio\/[0-9a-f-]{36}/); await page.getByText("Get ready").waitFor(); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/s2-new-canvas.png` });
await page.getByRole("button", { name: /Weekend getaway/ }).click(); await page.waitForTimeout(300);
await page.getByLabel("Title").fill("Weekend in Big Bear"); await page.getByLabel("Starting bid").click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/s3-item-selected.png` });
await page.getByRole("radio", { name: "Midnight" }).click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/s4-theme.png` });

// The seeded live event with bids.
await page.goto(BASE + "/studio"); await page.getByText("Holiday Trade Show").first().waitFor();
await page.getByRole("link", { name: "Holiday Trade Show" }).first().click();
await page.getByRole("tab", { name: "Live" }).waitFor(); await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/s5-live.png` });
await page.getByRole("tab", { name: /Results/ }).click(); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/s6-results.png` });

const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage();
await phone.goto(BASE + "/studio");
await phone.getByLabel("Email").fill(process.env.HOST_EMAIL); await phone.getByLabel("Password").fill(process.env.HOST_PASSWORD);
await phone.getByRole("button", { name: "Sign in" }).click(); await phone.getByText("Start something new").waitFor();
await phone.getByRole("link", { name: "Holiday Trade Show" }).first().click(); await phone.getByRole("tab", { name: "Live" }).waitFor(); await phone.waitForTimeout(800);
await phone.screenshot({ path: `${OUT}/s7-phone-live.png` });
console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
await browser.close();
