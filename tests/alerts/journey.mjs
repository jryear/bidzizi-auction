#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { chromium } from '@playwright/test';
import { client, localConfig, sleep } from '../load/support.mjs';

const { base, database } = localConfig();
const receiver = new URL(process.env.ALERT_RECEIVER);
assert.ok(receiver.protocol === 'http:' && receiver.hostname === '127.0.0.1' && Number(receiver.port) > 1024 && receiver.pathname === '/');
const db = new pg.Client({ connectionString: database }), locker = new pg.Client({ connectionString: database });
await db.connect(); await locker.connect();
const host = client(base), guest = client(base), evidence = { localOnly: true, startedAt: new Date().toISOString(), scenarios: {} };
let eventId, browser;
async function api(method, path, body, call = host) {
  const r = await call(method, path, body); assert.ok(r.status >= 200 && r.status < 300, `Setup ${method} failed (${r.status})`); return r.data;
}
async function received(id, category) {
  for (let i = 0; i < 40; i++) {
    const events = await fetch(receiver.origin + '/events').then(r => r.json());
    const found = events.find(x => id ? x.event.event_id === id : x.event.tags.category === category); if (found) return found;
    await sleep(50);
  }
  throw new Error('Local envelope not received');
}
try {
  await api('POST', '/api/v1/host/login', { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  eventId = (await api('POST', '/api/v1/host/events', { requestId: randomUUID(), name: 'Disposable alert proof', isPractice: true,
    startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 600_000).toISOString() })).id;
  const itemId = (await api('POST', `/api/v1/host/events/${eventId}/items`, { requestId: randomUUID(), title: 'Scoped timeout proof', openingMinor: 10_000 })).id;
  const workspace = await api('GET', `/api/v1/host/events/${eventId}`);
  await api('PATCH', `/api/v1/host/events/${eventId}`, { revision: workspace.event.revision, status: 'live' });
  const path = '/api/v1/e/' + workspace.event.code;
  await api('POST', path + '/join', { requestId: randomUUID(), displayName: 'Alert proof', businessName: 'Disposable fixture' }, guest);
  const rejected = await guest('POST', path + '/bid', { requestId: randomUUID(), itemId, amountMinor: 1 });
  assert.equal(rejected.status, 409); assert.equal(rejected.data.receipt.reason, 'BELOW_MINIMUM');
  const before = await fetch(receiver.origin + '/events').then(r => r.json()); assert.equal(before.length, 0, 'Expected bid rejection must not alert');
  const requestId = randomUUID();
  await locker.query('BEGIN'); await locker.query('SELECT 1 FROM standings WHERE item_id=$1 FOR UPDATE', [itemId]);
  const requestStartedAt = new Date().toISOString();
  const pending = guest('POST', path + '/bid', { requestId, itemId, amountMinor: 10_000 });
  let waiting = false;
  for (let i = 0; i < 50; i++) {
    waiting = (await db.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT current_minor%') waiting")).rows[0].waiting;
    if (waiting) break; await sleep(20);
  }
  assert.ok(waiting);
  const response = await pending; assert.equal(response.status, 503);
  await locker.query('ROLLBACK');
  assert.deepEqual(response.data, { error: { code: 'UNAVAILABLE', message: 'Something went wrong. Try again.' } });
  assert.equal((await db.query('SELECT count(*)::int n FROM bids WHERE event_id=$1 AND request_id=$2', [eventId, requestId])).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM bid_receipts WHERE request_id=$1', [requestId])).rows[0].n, 0);
  assert.equal((await guest('GET', path + '/receipt/' + requestId)).data.receipt, null, 'Original failed request has no false acceptance');
  const serverEvent = await received(null, 'server-failure');
  evidence.scenarios.serverTimeout = { requestStartedAt, observedLockWait: waiting, responseStatus: 503,
    eventId: serverEvent.event.event_id, occurredAt: serverEvent.event.extra.occurredAt, receiverAt: serverEvent.receivedAt,
    noBidOrReceiptCommitted: true };
  assert.ok(Date.parse(serverEvent.event.extra.occurredAt) - Date.parse(requestStartedAt) >= 7900);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const registered = page.waitForResponse(r => r.url().endsWith(path + '/telemetry') && r.request().postDataJSON()?.kind === 'device');
  await page.goto(base + '/e/' + workspace.event.code);
  await registered;
  const telemetry = page.waitForResponse(r => r.url().endsWith(path + '/telemetry') && r.request().postDataJSON()?.kind === 'error');
  await page.evaluate(() => { setTimeout(() => { throw new Error('Local proof password=must-not-leave person@example.test'); }, 0); });
  const emitted = await telemetry; assert.equal(emitted.status(), 202);
  const alertId = emitted.headers()['x-bidzizi-alert-id']; assert.match(alertId, /^[a-f0-9]{32}$/);
  const errorEvent = await received(alertId);
  assert.equal(errorEvent.event.tags.check, 'client-error');
  const raw = JSON.stringify(errorEvent); assert.ok(!raw.includes('password=') && !raw.includes('person@example.test'));
  const stored = (await db.query("SELECT count(*)::int n FROM client_reports WHERE event_id=$1 AND kind='error'", [eventId])).rows[0].n;
  assert.equal(stored, 1, 'Telemetry durably committed');
  await page.getByLabel('Your name').fill('Covered-button proof'); await page.getByLabel('Business name').fill('Disposable fixture');
  await page.getByRole('button',{name:'Join',exact:true}).click(); await page.locator('.pa-main').waitFor(); await page.locator('.lc-hit').first().click();
  const healthReport=page.waitForResponse(r=>r.url().endsWith(path+'/telemetry')&&r.request().postDataJSON()?.check==='bid-sheet');
  await page.locator('.pa-actionbar').getByRole('button',{name:/^Bid/}).click();
  await page.evaluate(()=>{const cover=document.createElement('div');cover.id='alert-proof-cover';cover.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:auto';document.body.appendChild(cover);});
  const failedHealth=await healthReport;
  await page.evaluate(()=>document.getElementById('alert-proof-cover')?.remove());
  assert.equal(failedHealth.status(), 202);
  const healthId = failedHealth.headers()['x-bidzizi-alert-id']; const health = await received(healthId);
  assert.equal(health.event.tags.check, 'bid-sheet');
  evidence.scenarios.browserError = { eventId: alertId, occurredAt: errorEvent.event.extra.occurredAt, receiverAt: errorEvent.receivedAt, committedRows: stored, strictFiltering: true };
  evidence.scenarios.blockingHealth = { eventId: healthId, occurredAt: health.event.extra.occurredAt, receiverAt: health.receivedAt, realCoveredButtonCheck:true };
  // Delivery is allowed only after the mutation's commit and after-response callback.
  assert.equal((await db.query("SELECT count(*)::int n FROM client_reports WHERE event_id=$1 AND kind='health' AND check_code='bid-sheet'", [eventId])).rows[0].n, 1);
  const unknownHealth = await page.request.post(base + path + '/telemetry', { headers: { Origin: base }, data: {
    deviceId: randomUUID(), kind: 'health', check: 'unknown-check', message: 'Ignored for alerts' } });
  assert.equal(unknownHealth.status(), 202); assert.ok(!unknownHealth.headers()['x-bidzizi-alert-id']);
  await fetch(receiver.origin + '/mode/fail', { method: 'POST' });
  const providerFailure = await page.request.post(base + path + '/telemetry', { headers: { Origin: base }, data: {
    deviceId: randomUUID(), kind: 'health', check: 'app-not-started', message: 'Receiver failure proof' } });
  assert.equal(providerFailure.status(), 202, 'Notification failure must not change durable response');
  const failureId = providerFailure.headers()['x-bidzizi-alert-id']; assert.match(failureId, /^[a-f0-9]{32}$/);
  let failedAttempts = [];
  for (let i=0; i<40; i++) {
    failedAttempts = (await fetch(receiver.origin + '/events').then(r=>r.json())).filter(x=>x.event.event_id===failureId);
    if (failedAttempts.length===2) break; await sleep(50);
  }
  assert.equal(failedAttempts.length,2); assert.ok(failedAttempts.every(x=>x.simulatedStatus===503));
  assert.equal((await db.query("SELECT count(*)::int n FROM client_reports WHERE event_id=$1 AND check_code='app-not-started'",[eventId])).rows[0].n,1);
  await fetch(receiver.origin + '/mode/ok', { method: 'POST' });
  evidence.scenarios.providerFailure = { responseStatus:202, committedRows:1, boundedAttempts:2, unchangedApplicationOutcome:true };
  evidence.passed = true;
} finally {
  await locker.query('ROLLBACK').catch(() => {}); await browser?.close();
  if (eventId) { await api('DELETE', `/api/v1/host/events/${eventId}`); assert.equal((await db.query('SELECT count(*)::int n FROM events WHERE id=$1', [eventId])).rows[0].n, 0); }
  await locker.end(); await db.end(); evidence.cleanup = true;
  await writeFile('docs/evidence/nov19/alerts-local.json', JSON.stringify(evidence, null, 2) + '\n');
}
console.log('PASS local alert integration: genuine 8s bid timeout → sanitized 503 with no bid/receipt; real uncaught browser error and blocking health → committed telemetry → filtered envelope after response; expected bid rejection/unknown health suppressed; fixture cleanup.');
