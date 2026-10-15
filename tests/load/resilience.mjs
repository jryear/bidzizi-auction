#!/usr/bin/env node
// Repeatable poor-network API emulation in both engines, with durable HTTP/database evidence.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, webkit, expect } from '@playwright/test';
import pg from 'pg';
import { localConfig, sleep, verifyDatabaseTarget } from './support.mjs';

const { base, database } = localConfig(), evidence = [];
const db = new pg.Client({ connectionString: database }); await db.connect();
await mkdir('.shots/nov19', { recursive: true });
try {
  await verifyDatabaseTarget(db, base);
  const beforeGuard = (await db.query('SELECT count(*)::int n FROM events')).rows[0].n, methods = [];
  const wrongApp = createServer((req, res) => { methods.push(req.method); res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); });
  await new Promise(resolve => wrongApp.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(() => verifyDatabaseTarget(db, `http://127.0.0.1:${wrongApp.address().port}`), /does not serve the specified disposable database/);
    assert.deepEqual(methods, ['GET'], 'A mismatched loopback app must receive no mutation');
    assert.equal((await db.query('SELECT count(*)::int n FROM events')).rows[0].n, beforeGuard, 'Failed handshake must remove its local fixture');
  } finally { await new Promise(resolve => wrongApp.close(resolve)); }
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(); let eventId, staff;
    const scenarios = [], started = Date.now();
    try {
      staff = await browser.newContext();
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      async function api(method, path, data) {
        const r = await staff.request.fetch(base + path, { method, headers: { Origin: base }, data });
        assert.ok(r.ok(), `Fixture API ${method} status ${r.status()}`); return r.json();
      }
      await api('POST', '/api/v1/host/login', { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
      eventId = (await api('POST', '/api/v1/host/events', { requestId: randomUUID(), name: 'Network rehearsal ' + engine.name(),
        isPractice: true, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() })).id;
      const items = [];
      for (const title of ['Slow bid', 'Lost response', 'Simple recovery']) items.push((await api('POST', `/api/v1/host/events/${eventId}/items`, { requestId: randomUUID(), title, openingMinor: 10_000 })).id);
      let workspace = await api('GET', `/api/v1/host/events/${eventId}`);
      await api('PATCH', `/api/v1/host/events/${eventId}`, { revision: workspace.event.revision, status: 'live' });
      const code = workspace.event.code, url = base + '/e/' + code, path = `/api/v1/e/${code}`;
      await page.goto(url); await page.getByLabel('Your name').fill('Network guest'); await page.getByLabel('Business name').fill('Disposable test');
      await page.getByRole('button', { name: 'Join', exact: true }).click(); await expect(page.locator('.pa-main')).toBeVisible();

      await ctx.setOffline(true);
      await expect(page.locator('.pa-offline')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.pa-offline')).toContainText('Standings as of');
      await page.locator('.lc-hit').first().click();
      await page.locator('.pa-actionbar').getByRole('button', { name: /^Bid/ }).click();
      await expect(page.getByRole('button', { name: 'Offline — reconnecting', exact: true })).toBeDisabled();
      await expect(page.getByRole('heading', { name: 'Bid placed', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `.shots/nov19/${engine.name()}-offline.png` });
      await page.keyboard.press('Escape'); await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.locator('.pa-offline')).toHaveCount(0, { timeout: 15_000 });
      scenarios.push('Offline snapshot shows stale timestamp; bid disabled; online recovery');

      // Cross-engine API approximation: 400ms each way, 128 kbit/s download, 64 kbit/s upload.
      // This does not claim whole-device radio throttling or old-iOS coverage.
      const slowRoute = '**/api/v1/e/' + code + '{,/**}';
      const slowRequests = [];
      const slow = async route => {
        const begin = performance.now();
        await sleep(400 + Buffer.byteLength(route.request().postData() ?? '') / 8000 * 1000);
        const response = await route.fetch(), body = await response.body();
        await sleep(400 + body.length / 16000 * 1000); await route.fulfill({ response, body });
        slowRequests.push({ method: route.request().method(), isBid: route.request().url().endsWith('/bid'), bodyBytes: body.length, milliseconds: performance.now() - begin });
      };
      await page.route(slowRoute, slow);
      await page.locator('.pa-actionbar').getByRole('button', { name: /^Bid/ }).click();
      let sheet = page.getByRole('dialog');
      await sheet.getByRole('button', { name: 'Bid $100', exact: true }).click();
      await expect(sheet.getByText('Sending…', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Bid placed', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Bid placed', exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.unrouteAll({ behavior: 'wait' });
      assert.ok(slowRequests.some(r => r.isBid && r.milliseconds >= 800), 'Throttled bid must actually pass through the 3G approximation');
      scenarios.push('API 3G approximation keeps Sending until durable receipt, then confirms');

      await page.goto(url + '?s=items&i=' + items[1]); await expect(page.locator('.pa-actionbar:not(.inline)')).toBeVisible();
      let lostId;
      const lose = async route => { lostId = route.request().postDataJSON().requestId; await route.fetch(); await route.abort(); };
      await page.route('**' + path + '/bid', lose);
      await page.locator('.pa-actionbar').getByRole('button', { name: /^Bid/ }).click();
      sheet = page.getByRole('dialog'); await sheet.getByRole('button', { name: 'Bid $100', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Did it go through?', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Bid placed', exact: true })).toHaveCount(0);
      const pending = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'bz_pending_' + code);
      assert.equal(pending.requestId, lostId);
      // Receipt path fails during reload, so the original pending request must remain intact.
      await page.route('**' + path + '/receipt/*', route => route.abort());
      await page.reload(); await expect(page.locator('.pa-actionbar').getByRole('button', { name: 'Check bid status', exact: true })).toBeVisible();
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'bz_pending_' + code), pending);
      await expect(page.locator('.standing')).toContainText('couldn’t confirm');

      // Three explicit down/up cycles: each failure becomes stale, each fresh snapshot clears stale.
      for (let i = 0; i < 3; i++) {
        await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(page.locator('.pa-offline')).toBeVisible({ timeout: 15_000 });
        await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(page.locator('.pa-offline')).toHaveCount(0, { timeout: 15_000 });
        assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'bz_pending_' + code), pending);
      }
      await page.screenshot({ path: `.shots/nov19/${engine.name()}-pending.png` });
      await page.unroute('**' + path + '/receipt/*'); await page.unroute('**' + path + '/bid', lose);
      await page.locator('.pa-actionbar').getByRole('button', { name: 'Check bid status', exact: true }).click();
      await page.getByRole('button', { name: 'Check status', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Bid placed', exact: true })).toBeVisible();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), 'bz_pending_' + code), null);
      workspace = await api('GET', `/api/v1/host/events/${eventId}`);
      assert.equal(workspace.items.find(i => i.id === items[1]).bidCount, 1);
      scenarios.push('Lost response, failed receipt on reload and three flaps preserve original request; receipt recovery records one bid');

      const simple = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      const simplePage = await simple.newPage(), simpleUrl = url + '/simple';
      await simplePage.goto(simpleUrl); await simplePage.getByLabel('Your name').fill('Simple guest'); await simplePage.getByLabel('Business name').fill('Disposable test');
      await simplePage.getByRole('button', { name: 'Join', exact: true }).click();
      await simplePage.getByRole('link', { name: 'Simple recovery', exact: true }).click();
      const requestId = await simplePage.locator('article form input[name=requestId]').inputValue();
      let committed;
      const committedPromise = new Promise(resolve => { committed = resolve; });
      await simplePage.route('**/simple', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        const response = await route.fetch({ maxRedirects: 0 }); assert.equal(response.status(), 303);
        committed(); await route.abort();
      });
      await simplePage.getByRole('button', { name: 'Bid $100', exact: true }).click().catch(() => {}); await committedPromise;
      await simplePage.unroute('**/simple');
      await simplePage.goto(simpleUrl + `?receipt=${requestId}&item=${items[2]}&amount=10000`);
      await expect(simplePage.getByRole('heading', { name: 'Bid recorded', exact: true })).toBeVisible();
      const unknown = randomUUID();
      await simplePage.goto(simpleUrl + `?receipt=${unknown}&item=${items[2]}&amount=12500`);
      await expect(simplePage.getByRole('heading', { name: 'Bid not confirmed', exact: true })).toBeVisible();
      await expect(simplePage.getByRole('button', { name: 'Retry same bid', exact: true })).toBeVisible();
      assert.equal(await simplePage.locator('input[name=requestId]').inputValue(), unknown);
      assert.equal(await simplePage.getByRole('button', { name: /^Bid \$/ }).count(), 0);
      workspace = await api('GET', `/api/v1/host/events/${eventId}`); assert.equal(workspace.items.find(i => i.id === items[2]).bidCount, 1);
      scenarios.push('JavaScript disabled: lost form response recovers durable receipt; unknown receipt offers only original request retry');
      evidence.push({ engine: engine.name(), scenarios, slowRequests, elapsedSeconds: (Date.now() - started) / 1000, passed: true });
      console.log(`PASS ${engine.name()}: ${scenarios.length} poor-network scenarios`);
    } finally {
      try {
        if (eventId && staff) {
          const removed = await staff.request.delete(base + `/api/v1/host/events/${eventId}`, { headers: { Origin: base } }); assert.equal(removed.status(), 200);
          assert.equal((await db.query('SELECT count(*)::int n FROM events WHERE id=$1', [eventId])).rows[0].n, 0);
        }
      } finally { await browser.close(); }
    }
  }
  await mkdir('docs/evidence/nov19', { recursive: true });
  const receiptPath = process.env.NOV19_ALERT_CHECKS === '1' ? 'docs/evidence/nov19/alerts-resilience.json' : 'docs/evidence/nov19/resilience.json';
  await writeFile(receiptPath, JSON.stringify({ databaseMismatchGuard: 'passed: read-only HTTP rejection and local fixture cleanup', profile: 'API-only 400ms each way; 128kbit/s download; 64kbit/s upload; offline and three flaps', evidence }, null, 2) + '\n');
} finally { await db.end(); }
