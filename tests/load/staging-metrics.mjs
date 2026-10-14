#!/usr/bin/env node
// Read-only provider observability, pinned rehearsal path/deployment; no app requests.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { targets } from './staging-provider.mjs';

const input = JSON.parse(await readFile('docs/evidence/nov19/staging-rehearsal.json', 'utf8'));
assert.ok(input.finishedAt && input.cleanup.confirmed, 'Collect after rehearsal and cleanup.');
const output = { collectedAt: new Date().toISOString(), source: 'Vercel function_invocation.count grouped by functionStartType',
  scope: 'Guest API requests for each unique rehearsal event, including join/watch, excluded warm-up, measured burst, receipt recovery and close probe. Host setup/deletion is excluded.',
  attribution: 'Vercel rounds time windows to minutes. Unique event request-path filters prevent cross-ramp contamination. Cold counts cannot be assigned precisely to warm-up versus measurement within boundary minutes.',
  functionInstanceCounts: input.functionInstanceCounts, runs: [] };
for (const r of input.runs) {
  if (!r.apiPath) continue;
  assert.match(r.apiPath, /^\/api\/v1\/e\/[A-HJ-NP-Z2-9]{6}$/);
  // Wildcard MUST be outside quotes: quoted wildcard produces an empty exact match.
  const filter = `requestPath:${r.apiPath}*`;
  try {
    const raw = execFileSync('/Users/jryear/.local/bin/vercel', ['metrics', 'vercel.function_invocation.count',
      '--project', targets.staging.project, '--scope', 'saturn-ea53', '--group-by', 'functionStartType',
      '--since', r.setupStartedAt, '--until', input.finishedAt, '--filter', filter,
      '--filter', `deploymentId:"${targets.staging.deployment}"`, '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 25_000 });
    const data = JSON.parse(raw);
    const counts = Object.fromEntries(data.summary.map(x => [x.functionStartType, x.vercel_function_invocation_count_count]));
    const cold = counts.cold ?? 0;
    assert.ok(Object.values(counts).reduce((n, x) => n + x, 0) > 0, 'Empty metric result is not zero cold starts.');
    const totalInvocations = Object.values(counts).reduce((n, x) => n + x, 0);
    const expectedGuestRequests = r.phones * 3 + r.phones * 7.5 +
      Object.values(r.latencyMs ?? {}).reduce((n, x) => n + x.count, 0) + (r.lockProof ? 1 : 0);
    output.runs.push({ phones: r.phones, eventId: r.eventId, query: data.query, counts, coldStarts: cold,
      totalInvocations, expectedGuestRequests, ingestionMatchesHttpCount: totalInvocations === expectedGuestRequests,
      nullBuckets: data.data.filter(x => x.vercel_function_invocation_count_count === null).length,
      minuteBuckets: data.data,
      note: 'Counts are an ingestion-time provider readback. Retain a later independent readback if totals are still changing.' });
  } catch { output.runs.push({ phones: r.phones, unavailable: true, reason: 'Provider metric query failed or empty; raw response suppressed.' }); }
}
await writeFile('docs/evidence/nov19/staging-cold-starts.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ collectedAt: output.collectedAt, runs: output.runs.map(({ phones, counts, totalInvocations, unavailable, nullBuckets }) =>
  ({ phones, counts, totalInvocations, unavailable, nullBuckets })) }));
