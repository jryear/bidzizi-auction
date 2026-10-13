#!/usr/bin/env node
// Browser regressions for save ordering, truthful save status and uploads. All APIs are intercepted: no database writes.
// BASE=http://127.0.0.1:3420 node tests/v1/studio-saving.mjs
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3420';
const EVENT = '11111111-1111-4111-8111-111111111111';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const iso = offset => new Date(Date.now() + offset).toISOString();
const fixture = () => ({
  serverNow: iso(0),
  event: { id: EVENT, code: 'REVIEW', name: 'Original event', welcome: 'Welcome to the event', venue: 'Main hall', winnerInstructions: 'See staff',
    coverAssetId: null, coverUrl: null, timezone: 'America/Los_Angeles', startsAt: iso(3600000), endsAt: iso(7200000), accessEndsAt: iso(86400000),
    status: 'draft', entryOpen: true, theme: 'classic', bidMode: 'fixed', tiers: [], fixedIncrementMinor: 2500,
    donationsEnabled: false, donationDeadline: null, revision: 1, phase: 'upcoming', hasBids: false, isPractice: true, archivedAt: null,
    bidderDisplay: 'anonymous', accentColor: null },
  items: [], participants: [], activity: [], pledges: [], recipients: [],
  sponsors: [{ id: 'sponsor-1', name: 'Original sponsor', url: '', logoAssetId: null, logoUrl: null }],
});
const browser = await chromium.launch();
let failed = 0, total = 0;
async function check(name, run) {
  total++;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), data = fixture(), writes = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const controls = { patch: async () => {}, upload: async () => {}, rejectNext: false, failReload: false };
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/telemetry')) return route.fulfill({ status: 202, json: { ok: true } });
    if (req.method() === 'GET') {
      if (controls.failReload) return route.abort();
      return route.fulfill({ json: structuredClone(data) });
    }
    if (path.endsWith('/assets')) {
      await controls.upload();
      return route.fulfill({ json: { id: 'asset-new', url: '/review-logo.png' } });
    }
    const body = req.postDataJSON(); writes.push(body);
    if (req.method() === 'PATCH') {
      await controls.patch(body);
      if (controls.rejectNext) { controls.rejectNext = false; return route.fulfill({ status: 503, json: { error: { message: 'Please retry' } } }); }
      if (body.revision !== data.event.revision) return route.fulfill({ status: 409, json: { error: { message: 'Revision conflict' } } });
      Object.assign(data.event, body, { revision: data.event.revision + 1 });
      return route.fulfill({ json: { ok: true, revision: data.event.revision } });
    }
    if (body.sponsors) data.sponsors = body.sponsors.map((s, i) => ({ ...s, id: `sponsor-${i}`, logoUrl: s.logoAssetId ? '/review-logo.png' : null }));
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/review-logo.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(logo) }));
  try {
    await page.goto(`${BASE}/studio/${EVENT}`);
    await page.locator('.device-screen').waitFor();
    await run({ page, data, writes, controls });
    assert.deepEqual(errors, []);
    console.log(`ok   ${name}`);
  } catch (e) { failed++; console.error(`FAIL ${name}\n     ${e.message}`); }
  finally { await context.close(); }
}
const logo = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#ff0000' } }).png().toBuffer();
const editName = async (page, name) => { await page.locator('[contenteditable][aria-label="Event name"]').fill(name); await page.locator('[contenteditable][aria-label="Event name"]').press('Tab'); };
try {
  await check('queued edits use the acknowledged revision and retain the final value', async ({ page, writes, data, controls }) => {
    const first = deferred(); controls.patch = async () => { if (writes.length === 1) await first.promise; };
    await page.locator('input.sx-title').fill('First edit'); await page.locator('input.sx-title').press('Tab');
    await expect.poll(() => writes.length).toBe(1);
    await editName(page, 'Second edit'); first.resolve();
    await expect.poll(() => writes.length).toBe(2);
    assert.deepEqual(writes.map(w => w.revision), [1, 2]);
    await expect(page.locator('.save')).toHaveText('Saved'); assert.equal(data.event.name, 'Second edit');
  });
  await check('queued edits retain revision even when the post-save refresh fails', async ({ page, writes, controls, data }) => {
    const first = deferred(); controls.patch = async () => { if (writes.length === 1) await first.promise; };
    await editName(page, 'First edit'); await expect.poll(() => writes.length).toBe(1);
    await page.locator('[contenteditable][aria-label="Event name"]').fill('Second edit');
    await page.locator('[contenteditable][aria-label="Event name"]').press('Tab');
    controls.failReload = true; first.resolve();
    await expect.poll(() => writes.length).toBe(2);
    assert.deepEqual(writes.map(w => w.revision), [1, 2]);
    await expect.poll(() => data.event.name).toBe('Second edit');
  });
  await check('finishing an older save does not mark newer canvas text Saved', async ({ page, writes, controls }) => {
    const first = deferred(); controls.patch = async () => { if (writes.length === 1) await first.promise; };
    await editName(page, 'First edit'); await expect.poll(() => writes.length).toBe(1);
    const field = page.locator('[contenteditable][aria-label="Event name"]'); await field.fill('Still typing');
    first.resolve(); await expect(page.locator('input.sx-title')).toHaveValue('First edit');
    assert.notEqual(await page.locator('.save').innerText(), 'Saved');
    assert.equal(await field.innerText(), 'Still typing');
    await expect(page.locator('.save')).toHaveText('Saved');
    await expect(page.locator('input.sx-title')).toHaveValue('Still typing');
  });
  await check('failed canvas save retains the draft and retries on blur', async ({ page, controls, data }) => {
    controls.rejectNext = true; await editName(page, 'Keep this draft');
    await expect(page.locator('.save')).toHaveText('Not saved');
    const field = page.locator('[contenteditable][aria-label="Event name"]');
    assert.equal(await field.innerText(), 'Keep this draft');
    await field.focus(); await field.press('Tab');
    await expect(page.locator('.save')).toHaveText('Saved'); assert.equal(data.event.name, 'Keep this draft');
  });
  await check('a save acknowledgement does not replace newer text in the top-bar title', async ({ page, writes, controls, data }) => {
    const first = deferred(); controls.patch = async () => { if (writes.length === 1) await first.promise; };
    const field = page.locator('input.sx-title');
    await field.fill('First title'); await field.press('Tab'); await expect.poll(() => writes.length).toBe(1);
    await field.fill('Newer title'); first.resolve(); await expect.poll(() => data.event.name).toBe('First title');
    await expect(field).toHaveValue('Newer title');
    assert.notEqual(await page.locator('.save').innerText(), 'Saved');
    await field.press('Tab'); await expect(page.locator('.save')).toHaveText('Saved');
    assert.equal(data.event.name, 'Newer title');
  });
  await check('logo completion preserves sponsor edits made during upload', async ({ page, controls, data }) => {
    const gate = deferred(), started = deferred(); controls.upload = async () => { started.resolve(); await gate.promise; };
    await page.locator('.ol-row').filter({ hasText: 'Sponsors' }).click();
    await page.locator('.logo-tile input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
    await started.promise;
    await page.getByLabel('Sponsor name', { exact: true }).fill('Updated sponsor'); await page.getByLabel('Sponsor name', { exact: true }).press('Tab');
    await expect.poll(() => data.sponsors[0].name).toBe('Updated sponsor'); gate.resolve();
    await expect.poll(() => data.sponsors[0].logoAssetId).toBe('asset-new');
    assert.equal(data.sponsors[0].name, 'Updated sponsor');
    await expect(page.getByLabel('Sponsor name', { exact: true })).toHaveValue('Updated sponsor');
  });
  await check('logo completion does not resurrect a removed sponsor', async ({ page, controls, data }) => {
    const gate = deferred(), started = deferred(); controls.upload = async () => { started.resolve(); await gate.promise; };
    await page.locator('.ol-row').filter({ hasText: 'Sponsors' }).click();
    await page.locator('.logo-tile input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo }); await started.promise;
    await page.getByLabel('Remove Original sponsor', { exact: true }).click(); await expect.poll(() => data.sponsors.length).toBe(0);
    gate.resolve(); await expect(page.locator('.logo-tile')).toHaveCount(0);
    // Wait for the request handler to finish so resurrection cannot pass between callbacks.
    await page.waitForTimeout(200); assert.equal(data.sponsors.length, 0);
  });
} finally { await browser.close(); }
console.log(`\n${total - failed}/${total} passed`);
process.exitCode = failed ? 1 : 0;
