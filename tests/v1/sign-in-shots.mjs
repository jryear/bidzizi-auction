#!/usr/bin/env node
// Captures the Studio sign-in: the live scene at its outbid and won beats, phone width, reduced motion, and a sign-in error.
// Uses a made-up email for the error, so no real account is paused.  BASE=... node tests/v1/sign-in-shots.mjs <out-dir>
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://127.0.0.1:3420", OUT = process.argv[2] ?? ".shots/sign-in";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(), errors = [];
async function at(name, { width = 1440, height = 900, wait = 3300, reduced = false, then } = {}) {
  const page = await (await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" })).newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${BASE}/studio`); await page.getByLabel("Email").waitFor();
  if (then) await then(page);
  await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` });
}
await at("hero-outbid-1440");
await at("hero-won-1440", { wait: 13_600 });
await at("hero-390", { width: 390, height: 844 });
await at("hero-reduced-1440", { reduced: true, wait: 1500 });
await at("error-1440", { wait: 1200, then: async p => { await p.getByLabel("Email").fill("nobody@example.com"); await p.getByLabel("Password", { exact: true }).fill("not-the-password"); await p.getByRole("button", { name: "Sign in" }).click(); await p.getByRole("alert").waitFor(); } });
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
