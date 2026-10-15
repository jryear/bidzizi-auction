import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const r = JSON.parse(await readFile('docs/evidence/nov19/staging-rehearsal.json', 'utf8'));
const cold = JSON.parse(await readFile('docs/evidence/nov19/staging-cold-starts.json', 'utf8'));
const cleanup = JSON.parse(await readFile('docs/evidence/nov19/staging-cleanup-proof.json', 'utf8'));
assert.ok(r.passed && r.cleanup.confirmed && cleanup.confirmed && r.providerUnchanged && !r.stopCondition);
assert.deepEqual(r.runs.map(x => x.phones), [50,150,300]);
let guestRequests = 0;
const metricGaps = [];
for (const run of r.runs) {
  assert.ok(Object.values(run.acceptance).every(Boolean));
  assert.equal(run.latencyMs.snapshot.count, run.phones * 31);
  assert.equal(run.latencyMs.bid.count, run.settings.activeBidders * 67);
  assert.equal(run.latencyMs.receipt.count, run.settings.activeBidders * 8);
  assert.equal(run.correctness.httpReceiptsCompared, run.settings.activeBidders * 61 + 1);
  assert.equal(run.correctness.uniqueReceipts, run.correctness.httpReceiptsCompared);
  for (const key of ['duplicateBids','missingOrWrongReceipts','orphanAcceptedReceipts','wrongStanding','wrongOrder','outsideServerWindow','httpReceiptMismatches'])
    assert.equal(run.correctness[key], 0);
  assert.ok(run.samples.length >= 124);
  for (let i = 1; i < run.samples.length; i++) {
    const gap = run.samples[i].elapsedSeconds - run.samples[i-1].elapsedSeconds;
    assert.ok(gap > .9 && gap < 1.1, 'One-second sampling cadence');
  }
  assert.equal(run.database.peakConnections, Math.max(...run.samples.map(s => s.states.reduce((n,x) => n+x.n,0))));
  assert.equal(run.binding.apiCreatedEventId, run.binding.stagingDirectRead.id);
  assert.equal(run.binding.stagingDirectRead.org_id, r.orgId);
  assert.equal(run.binding.stagingDirectRead.is_practice, true);
  assert.equal(run.binding.productionAbsence.events, 0);
  assert.ok(Date.parse(run.lockProof.observedAt) < Date.parse(run.lockProof.itemClosesAt));
  assert.ok(Date.parse(run.lockProof.releasedAt) > Date.parse(run.lockProof.itemClosesAt));
  assert.ok(Date.parse(run.lockProof.decidedAt) >= Date.parse(run.lockProof.releasedAt));
  const metric = cold.runs.find(x => x.phones === run.phones);
  assert.ok(!metric.unavailable && metric.totalInvocations > 0, 'Provider metric must be available');
  const expected = run.phones * 10.5 + Object.values(run.latencyMs).reduce((n,x) => n+x.count,0) + 1;
  assert.equal(metric.expectedGuestRequests, expected);
  if (metric.totalInvocations !== expected) metricGaps.push({ phones: run.phones, expected, reported: metric.totalInvocations, difference: expected - metric.totalInvocations });
  guestRequests += expected;
}
assert.equal(r.applicationRequests, guestRequests + 193, 'All guest requests + login and 64 host requests/event');
for (const label of ['staging','production']) assert.ok(Object.values(cleanup.targets[label]).every(n => n === 0));
console.log('PASS staging workload evidence: all ramps, scheduled HTTP request totals, SQL invariants/receipt coverage, server-clock lock proof, one-second cadence, unchanged providers, independent cleanup and production absence.');
if (metricGaps.length) {
  console.error('INCOMPLETE provider metric reconciliation: ' + JSON.stringify(metricGaps));
  process.exitCode = 1;
} else console.log('PASS provider invocation counts reconcile exactly with all guest HTTP requests.');
