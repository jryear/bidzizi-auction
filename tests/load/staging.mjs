#!/usr/bin/env node
// Explicitly authorized, fixed-target staging rehearsal. No provider/config/deployment changes.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { stagingTransport, STAGING_ORIGIN } from './staging-transport.mjs';
import { providers } from './staging-provider.mjs';
import { audit } from './staging-audit.mjs';
import { sleep, summary } from './support.mjs';

assert.deepEqual(process.argv.slice(2), ['--run-staging-approved'], 'Explicit staging authorization flag required; no other target or override allowed.');
assert.match(process.version, /^v24\./, 'Use Node 24.');
const root = 'docs/evidence/nov19', orgId = randomUUID(), staffId = randomUUID();
const nonce = randomBytes(6).toString('hex'), slug = 'nov19-load-' + nonce, email = `nov19-${nonce}@example.test`;
const password = randomBytes(32).toString('base64url'), salt = randomBytes(16);
const hash = 'scrypt$32768$8$1$' + salt.toString('base64url') + '$' + scryptSync(password, salt, 64,
  { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url');
const result = { startedAt: new Date().toISOString(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  machine: { node: process.version, platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length },
  authority: 'User approved as-is conservative staging floor test, isolated account/events, production read-only absence checks; stop on challenge/block/429.',
  origin: STAGING_ORIGIN, orgId, staffId, fixtureSlug: slug, runs: [], cleanup: { confirmed: false },
  functionInstanceCounts: { measured: false, reason: 'No trustworthy VM instance identifier/count source; omitted as explicitly allowed. Invocation IDs are not instance IDs.' },
  cpu: { measured: false, reason: 'No trustworthy per-run hosted CPU source. One-second pg_stat_activity is the approved capacity signal.' } };
const connections = [];
let control, observer, production, host, measured = null, seeded = false;
const transport = stagingTransport({ origin: STAGING_ORIGIN, observe(kind, ms, response, bytes) {
  const receipt = response.data.receipt;
  const expected = response.status === 409 && receipt?.accepted === false && ['BELOW_MINIMUM', 'ALREADY_LEADING', 'CLOSED'].includes(receipt.reason);
  if (!(response.status >= 200 && response.status < 300) && !expected) {
    transport.stop({ kind, status: response.status, reason: 'Unexpected application failure', code: response.data.error?.code ?? 'unknown' });
  }
  if (!measured) return;
  (measured.metrics[kind] ??= []).push(ms);
  if (kind === 'snapshot') measured.maxSnapshotBytes = Math.max(measured.maxSnapshotBytes, bytes);
  if (kind === 'bid' && expected) measured.expectedRejections[receipt.reason] = (measured.expectedRejections[receipt.reason] ?? 0) + 1;
} });
async function api(method, path, body, call = host, kind = 'setup') {
  const r = await call(method, path, body, kind);
  assert.ok(r.status >= 200 && r.status < 300, `API ${kind} failed (${r.status}).`);
  return r.data;
}
const save = () => writeFile(`${root}/staging-rehearsal.json`, JSON.stringify(result, null, 2) + '\n');
const log = (phase, fields = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), phase, ...fields }));

async function absentProduction(eventIds = []) {
  const row = (await production.query(`SELECT
    (SELECT count(*)::int FROM orgs WHERE id=$1 OR slug=$2) orgs,
    (SELECT count(*)::int FROM staff WHERE id=$3 OR email=$4 OR org_id=$1) staff,
    (SELECT count(*)::int FROM events WHERE org_id=$1 OR id=ANY($5::uuid[])) events`, [orgId, slug, staffId, email, eventIds])).rows[0];
  assert.deepEqual(row, { orgs: 0, staff: 0, events: 0 }, 'Production fixture absence');
  return { at: new Date().toISOString(), ...row, readOnly: true };
}

// Last-resort cleanup after a platform stop uses only the uniquely owned staging org.
// No further HTTP request is made after a stop; no challenge bypass is attempted.
async function eraseOwnedEvent(eventId) {
  await control.query('BEGIN');
  try {
    const owned = await control.query(`SELECT e.id FROM events e JOIN orgs o ON o.id=e.org_id
      WHERE e.id=$1 AND e.org_id=$2 AND o.slug=$3 AND e.is_practice FOR UPDATE OF e`, [eventId, orgId, slug]);
    assert.equal(owned.rowCount, 1, 'Cleanup must be an owned practice event');
    for (const sql of [
      'DELETE FROM award_log WHERE item_id IN (SELECT id FROM items WHERE event_id=$1)',
      'DELETE FROM awards WHERE event_id=$1',
      'DELETE FROM bid_receipts WHERE item_id IN (SELECT id FROM items WHERE event_id=$1)',
      'DELETE FROM rejoin_codes WHERE participant_id IN (SELECT id FROM participants WHERE event_id=$1)',
      'DELETE FROM watches WHERE item_id IN (SELECT id FROM items WHERE event_id=$1)',
      'DELETE FROM pledges WHERE event_id=$1',
      'UPDATE standings SET current_minor=NULL,leader_id=NULL,leading_bid_id=NULL,bid_count=0,next_sequence=1 WHERE event_id=$1',
      'DELETE FROM bids WHERE event_id=$1', 'DELETE FROM participants WHERE event_id=$1',
      'DELETE FROM standings WHERE event_id=$1', 'DELETE FROM items WHERE event_id=$1',
      'DELETE FROM sponsors WHERE event_id=$1', 'DELETE FROM recipients WHERE event_id=$1', 'DELETE FROM events WHERE id=$1',
    ]) await control.query(sql, [eventId]);
    await control.query('COMMIT');
  } catch (error) { await control.query('ROLLBACK'); throw error; }
}

async function run(phones) {
  const r = { phones, setupStartedAt: new Date().toISOString(), settings: { itemCount: 60, hotItems: 3,
    activeBidders: Math.min(50, Math.ceil(phones / 6)), joinConcurrency: 20, pollMs: 4000, bidMs: 2000,
    excludedWarmupSeconds: 30, measuredBurstSeconds: 120, measuredPostcloseSeconds: 4 }, samples: [], expectedRejections: {},
    metrics: {}, maxSnapshotBytes: 0, duplicatePairs: 0, recoveredResponses: 0, uniqueAttempts: 0, correctness: null, cleanup: false };
  result.runs.push(r); await save();
  const expectedReceipts = new Map();
  let eventId, monitor, sampleStop = false;
  try {
    const name = `Nov19 rehearsal ${nonce} ${phones}`;
    eventId = (await api('POST', '/api/v1/host/events', { requestId: randomUUID(), name, isPractice: true,
      startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 600_000).toISOString() })).id;
    r.eventId = eventId;
    const binding = (await observer.query('SELECT id,org_id,name,is_practice,join_code FROM events WHERE id=$1 AND org_id=$2', [eventId, orgId])).rows[0];
    assert.equal(binding?.name, name); assert.equal(binding.is_practice, true);
    r.binding = { apiCreatedEventId: eventId, stagingDirectRead: binding, productionAbsence: await absentProduction([eventId]) };
    log('binding-confirmed', { phones, eventId, productionAbsent: true }); await save();
    const items = [];
    // Match the local workload's individual create calls, with ready items.
    for (let i = 0; i < 60; i++) items.push((await api('POST', `/api/v1/host/events/${eventId}/items`,
      { requestId: randomUUID(), title: `Readiness item ${i + 1}`, openingMinor: 10_000, ready: true })).id);
    const workspace = await api('GET', `/api/v1/host/events/${eventId}`);
    await api('PATCH', `/api/v1/host/events/${eventId}`, { revision: workspace.event.revision, status: 'live' });
    const path = '/api/v1/e/' + workspace.event.code;
    r.apiPath = path;
    const sessions = Array.from({ length: phones }, () => ({ call: transport.client(), snap: null, id: null }));
    let next = 0;
    const setupLatencies = { join: [], watch: [], snapshot: [] };
    const setup = async (phone, method, suffix, body, kind) => {
      const start = performance.now(), data = await api(method, path + suffix, body, phone.call, kind);
      setupLatencies[kind].push(performance.now() - start); return data;
    };
    const joined = await Promise.allSettled(Array.from({ length: 20 }, async () => {
      for (let index; (index = next++) < phones && !transport.stopped;) {
        const phone = sessions[index];
        phone.id = (await setup(phone, 'POST', '/join', { requestId: randomUUID(), displayName: `Phone ${index}`, businessName: 'Disposable load fixture' }, 'join')).participantId;
        phone.snap = await setup(phone, 'GET', '', undefined, 'snapshot');
        assert.equal(phone.snap.me.id, phone.id, 'Participant isolation');
        assert.equal(phone.snap.items.length, 60, 'All fixture items visible');
        await setup(phone, 'POST', '/watch', { itemId: items[index % items.length], on: true }, 'watch');
      }
    }));
    assert.ok(joined.every(x => x.status === 'fulfilled') && !transport.stopped, 'Join/watch setup failed');
    r.setupLatencyMs = Object.fromEntries(Object.entries(setupLatencies).map(([k, v]) => [k, summary(v)]));
    r.warmupStartedAt = new Date().toISOString(); log('warmup-excluded', { phones, seconds: 30 });
    const warm = performance.now();
    await Promise.all(sessions.map(async (phone, i) => {
      for (let due = warm + i * 4000 / phones; due < warm + 30_000 && !transport.stopped; due += 4000) {
        await sleep(due - performance.now());
        if (transport.stopped) break;
        phone.snap = await api('GET', path, undefined, phone.call, 'warmup');
        assert.equal(phone.snap.me.id, phone.id);
      }
    }));
    assert.ok(!transport.stopped, 'Warm-up stopped');
    // Only our fixture clock is adjusted. No schema, provider or other event changes.
    const timing = await control.query(`UPDATE events SET ends_at=clock_timestamp()+interval '120 seconds'
      WHERE id=$1 AND org_id=$2 AND is_practice RETURNING ends_at`, [eventId, orgId]);
    assert.equal(timing.rowCount, 1); r.eventEndsAt = timing.rows[0].ends_at;
    r.measuredStartedAt = new Date().toISOString(); const started = performance.now(), lag = [];
    measured = r; log('measured-burst-start', { phones, seconds: 124 });
    monitor = (async () => {
      for (let due = started; !sampleStop; due += 1000) {
        await sleep(due - performance.now()); if (sampleStop) break;
        const at = new Date().toISOString(), elapsedSeconds = (performance.now() - started) / 1000;
        const states = (await observer.query(`SELECT coalesce(state,'unknown') state,count(*)::int n,
          count(*) FILTER (WHERE wait_event_type='Lock')::int lock_waiters,
          count(*) FILTER (WHERE application_name LIKE 'nov19-%')::int rehearsal_direct
          FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' GROUP BY state ORDER BY state`)).rows;
        r.samples.push({ at, elapsedSeconds, scheduleLagMs: Math.max(0, performance.now() - due), states });
      }
    })();
    // Attach early rejection handling to prevent an observer failure becoming unhandled.
    monitor.catch(() => transport.stop({ reason: 'Database sampler failed', status: 0 }));
    async function schedule(offset, every, until, work) {
      try {
        for (let due = started + offset; due < started + until && !transport.stopped; due += every) {
          await sleep(due - performance.now()); if (transport.stopped) break;
          lag.push(Math.max(0, performance.now() - due)); await work();
        }
      } catch { transport.stop({ reason: 'Workload/receipt/isolation assertion failed', status: 0 }); }
    }
    const tasks = sessions.map((phone, i) => schedule(i * 4000 / phones, 4000, 124_000, async () => {
      const response = await phone.call('GET', path, undefined, 'snapshot');
      assert.equal(response.status, 200); assert.equal(response.data.me.id, phone.id); phone.snap = response.data;
    }));
    for (let i = 0; i < r.settings.activeBidders; i++) {
      const phone = sessions[i]; let turn = 0;
      tasks.push(schedule(i * 2000 / r.settings.activeBidders, 2000, 122_000, async () => {
        const item = phone.snap.items.find(x => x.id === items[turn % 3]);
        const body = { requestId: randomUUID(), itemId: item.id, amountMinor: item.minimumNextMinor ?? 1_000_000 };
        turn++; r.uniqueAttempts++;
        const placed = turn % 10 === 0
          ? await Promise.all([phone.call('POST', path + '/bid', body, 'bid'), phone.call('POST', path + '/bid', body, 'bid')]).then(all => {
            assert.deepEqual(all[0].data.receipt, all[1].data.receipt); r.duplicatePairs++; return all[0]; })
          : await phone.call('POST', path + '/bid', body, 'bid');
        assert.ok(placed.data.receipt, 'Durable receipt required');
        expectedReceipts.set(phone.id + ':' + body.requestId, placed.data.receipt);
        if (turn % 7 === 0) {
          const recovered = await phone.call('GET', path + '/receipt/' + body.requestId, undefined, 'receipt');
          assert.deepEqual(recovered.data.receipt, placed.data.receipt); r.recoveredResponses++;
        }
        if (placed.data.receipt.minimumNextMinor) item.minimumNextMinor = placed.data.receipt.minimumNextMinor;
      }));
    }
    await Promise.allSettled(tasks);
    sampleStop = true; await monitor; monitor = null;
    measured = null; r.measuredEndedAt = new Date().toISOString(); r.measuredSeconds = (performance.now() - started) / 1000;
    r.latencyMs = Object.fromEntries(Object.entries(r.metrics).map(([k, v]) => [k, summary(v)])); delete r.metrics;
    r.scheduleLagMs = summary(lag);
    r.throughput = { snapshotPerSecond: (r.latencyMs.snapshot?.count ?? 0) / r.measuredSeconds,
      bidHttpPerSecond: (r.latencyMs.bid?.count ?? 0) / r.measuredSeconds };
    r.database = { sampledEverySeconds: 1, samples: r.samples.length, includesTwoDirectRehearsalConnections: true,
      peakConnections: Math.max(0, ...r.samples.map(s => s.states.reduce((n, x) => n + x.n, 0))),
      peaksByState: Object.fromEntries([...new Set(r.samples.flatMap(s => s.states.map(x => x.state)))].map(state =>
        [state, Math.max(...r.samples.map(s => s.states.find(x => x.state === state)?.n ?? 0))])),
      peakLockWaiters: Math.max(0, ...r.samples.map(s => s.states.reduce((n, x) => n + x.lock_waiters, 0))) };
    if (!transport.stopped) {
      // Deliberately blocked request: separate from ordinary latency, scoped unused item.
      const probeItem = items.at(-1), requestId = randomUUID();
      const updated = await control.query(`UPDATE items SET closes_at=clock_timestamp()+interval '2 seconds'
        WHERE id=$1 AND event_id=$2 AND org_id=$3 RETURNING closes_at`, [probeItem, eventId, orgId]);
      assert.equal(updated.rowCount, 1);
      await control.query('BEGIN');
      let pending;
      try {
        const pid = (await control.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        await control.query('SELECT 1 FROM standings WHERE item_id=$1 FOR UPDATE', [probeItem]);
        pending = sessions[0].call('POST', path + '/bid', { requestId, itemId: probeItem, amountMinor: 10_000 }, 'closeProbe');
        pending.catch(() => {});
        let waiting = false, observedAt;
        for (let n = 0; n < 50; n++) {
          const w = (await observer.query(`SELECT clock_timestamp() at,EXISTS(SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))
            AND query LIKE 'SELECT current_minor%') waiting`, [pid])).rows[0];
          if (w.waiting) { waiting = true; observedAt = w.at; break; } await sleep(20);
        }
        assert.ok(waiting, 'Observe specific standing lock wait');
        assert.ok(observedAt < updated.rows[0].closes_at, 'Request waiting while still open');
        await sleep(2100);
        const releasedAt = (await control.query('SELECT clock_timestamp() at')).rows[0].at;
        await control.query('COMMIT');
        const response = await pending;
        assert.equal(response.data.receipt.reason, 'CLOSED');
        assert.ok(new Date(response.data.receipt.decidedAt) >= releasedAt);
        expectedReceipts.set(sessions[0].id + ':' + requestId, response.data.receipt);
        r.lockProof = { observedLockWait: waiting, observedAt, itemClosesAt: updated.rows[0].closes_at, releasedAt, decidedAt: response.data.receipt.decidedAt, reason: 'CLOSED' };
      } finally { await control.query('ROLLBACK'); if (pending) await pending.catch(() => {}); }
    }
  } catch (error) {
    r.failure = { type: error.name, code: /^[A-Z0-9_]+$/.test(String(error.code)) ? error.code : null,
      reason: 'Run/setup/probe failed; raw error suppressed to protect provider credentials.' };
    transport.stop({ reason: 'Run/setup/probe failure', status: 0 });
  } finally {
    measured = null; sampleStop = true;
    if (monitor) await monitor.catch(() => {});
    // Aborted requests may have reached the server; wait past the app statement timeout.
    if (transport.stopped) await sleep(9000);
    if (eventId) {
      r.correctness = await audit(observer, eventId, expectedReceipts);
      r.productionAbsenceAfter = await absentProduction([eventId]);
      r.acceptance = { correctness: r.correctness.passed && r.correctness.acceptedBids > 0,
        unexpectedFailures: !transport.stopped && !r.failure,
        snapshotP95: r.latencyMs?.snapshot?.p95 != null && r.latencyMs.snapshot.p95 < 1000,
        bidP95: r.latencyMs?.bid?.p95 != null && r.latencyMs.bid.p95 < 2000,
        lockCloseProof: Boolean(r.lockProof) };
      if (!transport.stopped) {
        await api('DELETE', `/api/v1/host/events/${eventId}`); r.cleanupMethod = 'staging API';
      } else { await eraseOwnedEvent(eventId); r.cleanupMethod = 'owned staging SQL after stop'; }
      r.cleanup = (await observer.query('SELECT count(*)::int n FROM events WHERE id=$1', [eventId])).rows[0].n === 0;
    }
    await save(); log('run-finished', { phones, latencyMs: r.latencyMs, database: r.database, correctness: r.correctness, acceptance: r.acceptance, cleanup: r.cleanup });
  }
  return Boolean(r.cleanup && r.acceptance && Object.values(r.acceptance).every(Boolean));
}

try {
  const provider = await providers();
  result.providerBefore = await provider.readback();
  assert.equal(result.providerBefore.targets.staging.minCu, .25); assert.equal(result.providerBefore.targets.staging.maxCu, .25);
  assert.equal(result.providerBefore.targets.production.minCu, .25);
  assert.deepEqual(result.providerBefore.targets.staging.function, result.providerBefore.targets.production.function);
  assert.equal(result.providerBefore.targets.staging.sourceCommit, result.providerBefore.targets.production.sourceCommit);
  log('provider-readback', { staging: result.providerBefore.targets.staging, production: result.providerBefore.targets.production }); await save();
  control = await provider.database('staging', 'fixture-control', false); connections.push(control);
  observer = await provider.database('staging', 'readonly-observer', true); connections.push(observer);
  production = await provider.database('production', 'production-absence-readonly', true); connections.push(production);
  result.liveDatabaseLimits = {};
  for (const [label, db] of [['staging', observer], ['production', production]]) {
    const limits = (await db.query("SELECT name,setting FROM pg_settings WHERE name IN ('max_connections','superuser_reserved_connections','reserved_connections') ORDER BY name")).rows;
    result.liveDatabaseLimits[label] = Object.fromEntries(limits.map(x => [x.name, Number(x.setting)]));
  }
  assert.equal(result.liveDatabaseLimits.staging.max_connections, 112);
  assert.equal(result.liveDatabaseLimits.production.max_connections, 901);
  result.productionAbsenceBefore = await absentProduction();
  await control.query('BEGIN');
  try {
    await control.query('INSERT INTO orgs(id,slug,name) VALUES($1,$2,$3)', [orgId, slug, 'Disposable Nov19 load rehearsal']);
    await control.query('INSERT INTO staff(id,org_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)', [staffId, orgId, email, 'Disposable rehearsal host', hash]);
    await control.query('COMMIT'); seeded = true;
  } catch (error) { await control.query('ROLLBACK'); throw error; }
  await save(); host = transport.client();
  await api('POST', '/api/v1/host/login', { email, password });
  for (const phones of [50, 150, 300]) {
    if (!await run(phones)) { result.stoppedBeforeNextRamp = true; break; }
  }
  result.providerAfter = await provider.readback();
  result.providerUnchanged = JSON.stringify(result.providerBefore.targets) === JSON.stringify(result.providerAfter.targets);
} catch (error) {
  result.failure = { type: error.name, code: /^[A-Z0-9_]+$/.test(String(error.code)) ? error.code : null,
    reason: 'Rehearsal failed; raw provider/SQL error suppressed.' };
  transport.stop({ reason: 'Top-level rehearsal failure', status: 0 });
} finally {
  result.stopCondition = transport.stopped; result.applicationRequests = transport.requests;
  try {
    if (seeded) {
      if (transport.stopped) await sleep(9000);
      // Rediscover through the owned org: also catches a lost create response.
      const remaining = (await control.query('SELECT id,is_practice FROM events WHERE org_id=$1', [orgId])).rows;
      for (const event of remaining) { assert.equal(event.is_practice, true); await eraseOwnedEvent(event.id); }
      await control.query('BEGIN');
      try {
        const owned = await control.query('SELECT id FROM orgs WHERE id=$1 AND slug=$2 FOR UPDATE', [orgId, slug]);
        assert.equal(owned.rowCount, 1);
        await control.query('DELETE FROM client_reports WHERE org_id=$1', [orgId]);
        await control.query('DELETE FROM staff_requests WHERE staff_id=$1', [staffId]);
        await control.query('DELETE FROM staff_sessions WHERE staff_id=$1', [staffId]);
        await control.query('DELETE FROM staff_password_tokens WHERE staff_id=$1 OR issued_by=$1', [staffId]);
        await control.query('DELETE FROM login_attempts WHERE email_hash=$1', [createHash('sha256').update('email:' + email).digest('hex')]);
        await control.query('DELETE FROM staff WHERE id=$1 AND org_id=$2', [staffId, orgId]);
        await control.query('DELETE FROM orgs WHERE id=$1 AND slug=$2', [orgId, slug]);
        await control.query('COMMIT');
      } catch (error) { await control.query('ROLLBACK'); throw error; }
      const row = (await observer.query(`SELECT (SELECT count(*)::int FROM orgs WHERE id=$1) orgs,
        (SELECT count(*)::int FROM staff WHERE id=$2 OR org_id=$1) staff,
        (SELECT count(*)::int FROM events WHERE org_id=$1) events,
        (SELECT count(*)::int FROM staff_requests WHERE staff_id=$2) requests,
        (SELECT count(*)::int FROM staff_sessions WHERE staff_id=$2) sessions`, [orgId, staffId])).rows[0];
      assert.ok(Object.values(row).every(n => n === 0));
      result.cleanup = { confirmed: true, at: new Date().toISOString(), stagingRemaining: row,
        productionAbsence: await absentProduction(result.runs.map(r => r.eventId).filter(Boolean)) };
    } else result.cleanup = { confirmed: true, reason: 'No account transaction committed; no API fixture writes occurred.' };
  } catch { result.cleanup = { confirmed: false, reason: 'Cleanup failed; inspect owned fixture IDs. Raw error suppressed.' }; }
  for (const db of connections.reverse()) await db.end().catch(() => {});
  result.finishedAt = new Date().toISOString();
  result.passed = result.runs.length === 3 && result.runs.every(r => r.cleanup && Object.values(r.acceptance ?? {}).length === 5 && Object.values(r.acceptance).every(Boolean)) &&
    result.cleanup.confirmed && result.providerUnchanged && !result.stopCondition && !result.failure;
  await save(); log('rehearsal-finished', { passed: result.passed, stopCondition: result.stopCondition, cleanup: result.cleanup });
}
if (!result.passed) process.exitCode = 1;
