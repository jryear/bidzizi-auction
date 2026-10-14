#!/usr/bin/env node
// Real HTTP workload against a production build, NEVER a hosted target.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import pg from 'pg';
import { client, localConfig, sleep, summary, verifyDatabaseTarget } from './support.mjs';
import { cpuTracker } from './cpu.mjs';

const { base, database } = localConfig();
const phones = Number(process.env.PHONES);
assert.ok([50, 150, 300].includes(phones), 'PHONES must be 50, 150 or 300.');
const warmupSeconds = 30, burstSeconds = 120, pollMs = 4000, bidMs = 2000, itemCount = 60;
const activeBidders = Math.min(50, Math.ceil(phones / 6));
const label = process.env.LOAD_LABEL ?? 'baseline';
assert.match(label, /^[a-z0-9_-]+$/);
const db = new pg.Client({ connectionString: database, application_name: 'readiness-observer' });
await db.connect();
const metrics = {}, rejections = {}, failures = [], scheduleLag = [], samples = [];
let maxBytes = 0, eventId, started, stopped = false;
function observe(kind, ms, status, data, bytes) {
  (metrics[kind] ??= []).push(ms);
  if (kind === 'snapshot') maxBytes = Math.max(maxBytes, bytes);
  if (kind === 'closeProbe' && status === 409 && data.receipt?.reason === 'CLOSED') return;
  if (kind === 'bid' && status === 409 && data.receipt?.accepted === false &&
    ['BELOW_MINIMUM', 'ALREADY_LEADING', 'CLOSED'].includes(data.receipt.reason)) {
    rejections[data.receipt.reason] = (rejections[data.receipt.reason] ?? 0) + 1;
  } else if (status < 200 || status >= 300) failures.push({ kind, status, code: data.error?.code ?? 'unknown' });
}
const host = client(base);
async function api(method, path, body) {
  const r = await host(method, path, body);
  assert.ok(r.status >= 200 && r.status < 300, `Setup/cleanup failed: ${method} status ${r.status}`);
  return r.data;
}

const cpu = cpuTracker([Number(process.env.LOAD_APP_PID), Number(process.env.LOAD_PG_PID)]);

async function audit() {
  const checks = {
    duplicateBids: `SELECT count(*)::int AS n FROM (SELECT participant_id,request_id FROM bids WHERE event_id=$1 GROUP BY 1,2 HAVING count(*)>1) x`,
    missingOrWrongReceipts: `SELECT count(*)::int AS n FROM bids b LEFT JOIN bid_receipts r ON r.participant_id=b.participant_id AND r.request_id=b.request_id
      WHERE b.event_id=$1 AND (r.request_id IS NULL OR NOT r.accepted OR r.item_id<>b.item_id OR r.receipt->>'bidId'<>b.id::text
      OR (r.receipt->>'amountMinor')::bigint<>b.amount_minor OR (r.receipt->>'decidedAt')::timestamptz<>b.decided_at)`,
    orphanAcceptedReceipts: `SELECT count(*)::int AS n FROM bid_receipts r JOIN items i ON i.id=r.item_id LEFT JOIN bids b ON b.id::text=r.receipt->>'bidId'
      WHERE i.event_id=$1 AND r.accepted AND (b.id IS NULL OR b.participant_id<>r.participant_id OR b.request_id<>r.request_id)`,
    wrongStanding: `SELECT count(*)::int AS n FROM standings s LEFT JOIN LATERAL
      (SELECT id,participant_id,amount_minor FROM bids WHERE item_id=s.item_id AND voided_at IS NULL ORDER BY amount_minor DESC,sequence DESC LIMIT 1) b ON true
      WHERE s.event_id=$1 AND (s.leading_bid_id IS DISTINCT FROM b.id OR s.leader_id IS DISTINCT FROM b.participant_id OR s.current_minor IS DISTINCT FROM b.amount_minor
      OR s.bid_count<>(SELECT count(*) FROM bids WHERE item_id=s.item_id AND voided_at IS NULL)
      OR s.next_sequence<>(SELECT coalesce(max(sequence),0)+1 FROM bids WHERE item_id=s.item_id))`,
    wrongOrder: `SELECT count(*)::int AS n FROM (SELECT sequence,amount_minor,decided_at,
      row_number() OVER w AS expected,lag(amount_minor) OVER w AS prev_amount,lag(decided_at) OVER w AS prev_time
      FROM bids WHERE event_id=$1 WINDOW w AS (PARTITION BY item_id ORDER BY sequence)) b
      WHERE sequence<>expected OR amount_minor<=prev_amount OR decided_at<prev_time`,
    outsideServerWindow: `SELECT count(*)::int AS n FROM bids b JOIN items i ON i.id=b.item_id JOIN events e ON e.id=b.event_id
      WHERE b.event_id=$1 AND (b.decided_at<coalesce(i.opens_at,e.starts_at) OR b.decided_at>=coalesce(i.closes_at,e.ends_at))`,
  };
  const results = {};
  for (const [key, query] of Object.entries(checks)) results[key] = (await db.query(query, [eventId])).rows[0].n;
  results.acceptedBids = (await db.query('SELECT count(*)::int n FROM bids WHERE event_id=$1', [eventId])).rows[0].n;
  results.uniqueReceipts = (await db.query('SELECT count(*)::int n FROM bid_receipts r JOIN items i ON i.id=r.item_id WHERE i.event_id=$1', [eventId])).rows[0].n;
  for (const key of Object.keys(checks)) assert.equal(results[key], 0, key);
  assert.ok(results.acceptedBids > 0);
  return results;
}

let result;
try {
  await verifyDatabaseTarget(db, base);
  await api('POST', '/api/v1/host/login', { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  eventId = (await api('POST', '/api/v1/host/events', { requestId: randomUUID(), name: `Readiness ${label} ${phones}`, isPractice: true,
    startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 600_000).toISOString() })).id;
  const items = [];
  for (let i = 0; i < itemCount; i++) items.push((await api('POST', `/api/v1/host/events/${eventId}/items`,
    { requestId: randomUUID(), title: `Readiness item ${i + 1}`, openingMinor: 10_000 })).id);
  let workspace = await api('GET', `/api/v1/host/events/${eventId}`);
  await api('PATCH', `/api/v1/host/events/${eventId}`, { revision: workspace.event.revision, status: 'live' });
  const code = workspace.event.code, path = `/api/v1/e/${code}`;
  const sessions = Array.from({ length: phones }, () => ({ call: client(base, observe), snap: null, id: null }));
  // Bounded initial join ramp (20 in flight); joins and watch writes are included in latency/error evidence.
  let next = 0;
  await Promise.all(Array.from({ length: 20 }, async () => {
    for (let index; (index = next++) < phones;) {
      const phone = sessions[index];
      const joined = await phone.call('POST', path + '/join', { requestId: randomUUID(), displayName: `Phone ${index}`, businessName: 'Disposable load fixture' }, 'join');
      assert.equal(joined.status, 201); phone.id = joined.data.participantId;
      phone.snap = (await phone.call('GET', path, undefined, 'snapshot')).data;
      assert.equal(phone.snap.me.id, phone.id, 'Participant isolation');
      const watch = await phone.call('POST', path + '/watch', { itemId: items[index % items.length], on: true }, 'watch');
      assert.equal(watch.status, 200);
    }
  }));
  // Close from the DB clock, not the harness clock. All phones continue polling through close.
  const initialSnapshots = metrics.snapshot.length;
  const timing = (await db.query(`UPDATE events SET ends_at=clock_timestamp()+interval '150 seconds' WHERE id=$1 RETURNING ends_at`, [eventId])).rows[0];
  started = performance.now();
  const firstCpu = cpu();
  await db.query('SELECT pg_stat_statements_reset()');
  const monitor = (async () => {
    while (!stopped) {
      const row = (await db.query(`SELECT count(*)::int connections,count(*) FILTER (WHERE state='active')::int active,
        count(*) FILTER (WHERE wait_event_type='Lock')::int lock_waiters FROM pg_stat_activity WHERE datname=current_database()`)).rows[0];
      samples.push({ elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)), ...row, cpuSeconds: cpu() });
      await sleep(1000);
    }
  })();
  async function schedule(offset, every, until, run) {
    for (let due = started + offset; due < started + until; due += every) {
      await sleep(due - performance.now());
      scheduleLag.push(Math.max(0, performance.now() - due));
      await run(); // One outstanding request per phone/action; lag records overload rather than hiding it.
    }
  }
  let attempts = 0, duplicatePairs = 0, recoveredResponses = 0;
  const tasks = sessions.map((phone, index) => schedule(index * pollMs / phones, pollMs, 154_000, async () => {
    const r = await phone.call('GET', path, undefined, 'snapshot');
    if (r.status === 200) { assert.equal(r.data.me?.id, phone.id); phone.snap = r.data; }
  }));
  for (let index = 0; index < activeBidders; index++) {
    const phone = sessions[index]; let turn = 0;
    tasks.push(schedule(warmupSeconds * 1000 + index * bidMs / activeBidders, bidMs, 152_000, async () => {
      const item = phone.snap.items.find(i => i.id === items[turn % 3]);
      const body = { requestId: randomUUID(), itemId: item.id, amountMinor: item.minimumNextMinor ?? 1_000_000 };
      attempts++; turn++;
      const placed = turn % 10 === 0
        ? await Promise.all([phone.call('POST', path + '/bid', body, 'bid'), phone.call('POST', path + '/bid', body, 'bid')]).then(all => {
          assert.deepEqual(all[0].data.receipt, all[1].data.receipt); duplicatePairs++; return all[0]; })
        : await phone.call('POST', path + '/bid', body, 'bid');
      assert.ok(placed.data.receipt, 'Every decision must return a durable receipt');
      if (turn % 7 === 0) {
        // Discard placement as an application-visible result; resolve only via receipt endpoint.
        const recovered = await phone.call('GET', path + '/receipt/' + body.requestId, undefined, 'receipt');
        assert.deepEqual(recovered.data.receipt, placed.data.receipt); recoveredResponses++;
      }
      const receipt = placed.data.receipt;
      if (receipt.minimumNextMinor) { item.minimumNextMinor = receipt.minimumNextMinor; item.currentMinor = receipt.currentMinor; }
    }));
  }
  let taskResults;
  try { taskResults = await Promise.allSettled(tasks); } finally { stopped = true; await monitor; }
  for (const failed of taskResults.filter(r => r.status === 'rejected')) failures.push({ kind: 'workload', status: 0, code: failed.reason.message });
  const seconds = (performance.now() - started) / 1000, lastCpu = cpu();
  const queryStats = (await db.query(`SELECT calls::int,rows::int,round(total_exec_time::numeric,2)::float8 AS execution_ms,
    left(query,180) AS query FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY calls DESC LIMIT 18`)).rows;
  // A separate item proves that a request arriving while open waits on the standing lock and is decided AFTER close.
  const probeItem = items.at(-1), locker = new pg.Client({ connectionString: database, application_name: 'readiness-close-lock' });
  await locker.connect();
  let lockProof;
  try {
    await db.query(`UPDATE items SET closes_at=clock_timestamp()+interval '2 seconds' WHERE id=$1`, [probeItem]);
    await locker.query('BEGIN'); await locker.query('SELECT 1 FROM standings WHERE item_id=$1 FOR UPDATE', [probeItem]);
    const requestId = randomUUID(), pending = sessions[0].call('POST', path + '/bid', { requestId, itemId: probeItem, amountMinor: 10_000 }, 'closeProbe');
    let waiting = false;
    for (let i = 0; i < 50; i++) {
      waiting = (await db.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT current_minor%') waiting`)).rows[0].waiting;
      if (waiting) break; await sleep(20);
    }
    assert.ok(waiting, 'Must observe bid blocked on standing lock before close');
    await sleep(2100);
    const releasedAt = (await locker.query('SELECT clock_timestamp() at')).rows[0].at;
    await locker.query('COMMIT');
    const response = await pending;
    assert.equal(response.data.receipt.reason, 'CLOSED');
    assert.ok(new Date(response.data.receipt.decidedAt) >= releasedAt, 'Decision clock must follow lock release');
    lockProof = { observedLockWait: waiting, releasedAt, decidedAt: response.data.receipt.decidedAt, reason: response.data.receipt.reason };
  } finally { await locker.query('ROLLBACK'); await locker.end(); }
  const correctness = await audit();
  const latency = Object.fromEntries(Object.entries(metrics).map(([kind, values]) => [kind, summary(values)]));
  result = { label, phones, machine: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length, memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)), node: process.version,
    postgres: (await db.query('SELECT version() v')).rows[0].v, pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim() },
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    settings: { warmupSeconds, burstSeconds, pollMs, bidMs, itemCount, hotItems: 3, activeBidders, joinConcurrency: 20 },
    eventEndsAt: timing.ends_at, measuredSeconds: seconds, latencyMs: latency, scheduleLagMs: summary(scheduleLag),
    throughput: { snapshotsPerSecond: (metrics.snapshot.length - initialSnapshots) / seconds, bidHttpPerSecond: metrics.bid.length / seconds, uniqueAttempts: attempts, initialSnapshots },
    unexpectedFailures: failures, expectedRejections: rejections, duplicatePairs, recoveredResponses, maxSnapshotBytes: maxBytes,
    database: { maxConnectionsIncludingObserver: Math.max(...samples.map(s => s.connections)), maxActive: Math.max(...samples.map(s => s.active)),
      maxLockWaiters: Math.max(...samples.map(s => s.lock_waiters)), queryStats },
    cpuPercentOfOneCore: { app: 100 * (lastCpu[0] - firstCpu[0]) / seconds, postgres: 100 * (lastCpu[1] - firstCpu[1]) / seconds },
    correctness, lockProof, samples,
    acceptance: { correctness: true, unexpectedFailures: failures.length === 0, snapshotP95: latency.snapshot.p95 < 1000, bidP95: latency.bid.p95 < 2000 }, cleanup: false };
  assert.equal(failures.length, 0, 'Unexpected request failures');
} finally {
  stopped = true;
  try {
    if (eventId) {
      await api('DELETE', `/api/v1/host/events/${eventId}`);
      assert.equal((await db.query('SELECT count(*)::int n FROM events WHERE id=$1', [eventId])).rows[0].n, 0, 'Fixture cleanup');
      if (result) result.cleanup = true;
    }
  } finally {
    if (result) {
      await mkdir('docs/evidence/nov19', { recursive: true });
      await writeFile(`docs/evidence/nov19/${label}-${phones}.json`, JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify({ label, phones, latencyMs: result.latencyMs, acceptance: result.acceptance, correctness: result.correctness, cleanup: result.cleanup }));
    }
    await db.end();
  }
}
if (!Object.values(result.acceptance).every(Boolean)) process.exitCode = 1;
