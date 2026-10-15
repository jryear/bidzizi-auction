#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = 'docs/evidence/nov19/';
const result = JSON.parse(await readFile(dir + 'staging-rehearsal.json', 'utf8'));
assert.ok(result.finishedAt, 'Rehearsal must finish before reporting.');
const cleanup = JSON.parse(await readFile(dir + 'staging-cleanup-proof.json', 'utf8'));
const cold = JSON.parse(await readFile(dir + 'staging-cold-starts.json', 'utf8'));
const runs = result.runs, f = n => Number(n).toFixed(2);
const hash = createHash('sha256').update(await readFile('tests/load/staging.mjs')).digest('hex');
const lat = key => runs.map(r => `| ${r.phones} | ${['p50','p95','p99'].map(p => r.latencyMs?.[key]?.[p] ?? 'unavailable').join(' / ')} |`).join('\n');
const throughput = runs.map(r => `| ${r.phones} | ${f(r.throughput?.snapshotPerSecond ?? 0)} | ${f(r.throughput?.bidHttpPerSecond ?? 0)} | ${r.latencyMs?.snapshot?.count ?? 0} | ${r.latencyMs?.bid?.count ?? 0} | ${r.scheduleLagMs?.p95 ?? 'unavailable'} / ${r.scheduleLagMs?.p99 ?? 'unavailable'} |`).join('\n');
const db = runs.map(r => `| ${r.phones} | ${r.database?.samples ?? 0} | ${r.database?.peakConnections ?? 'unavailable'} | ${r.database?.peaksByState.active ?? 0} | ${r.database?.peaksByState.idle ?? 0} | ${r.database?.peaksByState['idle in transaction'] ?? 0} | ${r.database?.peakLockWaiters ?? 0} |`).join('\n');
const checks = runs.map(r => `| ${r.phones} | ${r.correctness?.acceptedBids ?? 0} | ${r.correctness?.uniqueReceipts ?? 0} | ${r.correctness?.httpReceiptsCompared ?? 0} | ${r.duplicatePairs} | ${r.recoveredResponses} | ${r.correctness?.passed ? 'PASS' : 'FAIL'} | ${r.lockProof ? 'PASS' : 'FAIL'} | ${r.cleanup ? 'confirmed' : 'unconfirmed'} |`).join('\n');
const coldRows = cold.runs.map(r => `| ${r.phones} | ${r.coldStarts ?? 'unavailable'}${r.ingestionMatchesHttpCount ? '' : ' reported; incomplete'} | ${r.counts?.hot ?? 'unavailable'} | ${r.counts?.prewarmed ?? 0} | ${r.totalInvocations ?? 'unavailable'} / ${r.expectedGuestRequests ?? 'unavailable'} | ${r.ingestionMatchesHttpCount ? 'yes' : 'no'} |`).join('\n');
const rejections = runs.map(r => `| ${r.phones} | ${Object.entries(r.expectedRejections).map(([k,v]) => `${k}: ${v}`).join('; ')} |`).join('\n');
const windows = runs.map(r => `| ${r.phones} | ${r.warmupStartedAt} | ${r.measuredStartedAt} | ${r.measuredEndedAt} | ${f(r.measuredSeconds)} |`).join('\n');
const bindings = runs.map(r => `| ${r.phones} | \`${r.eventId}\` | ${r.binding?.stagingDirectRead?.is_practice === true ? 'confirmed' : 'unconfirmed'} | ${r.binding?.productionAbsence?.events === 0 ? 'absent' : 'unconfirmed'} |`).join('\n');
await writeFile('docs/plans/NOV19_STAGING_LOAD_RESULTS.md', `# Nov 19: approved staging rehearsal

**${result.passed ? 'PASS' : 'INCOMPLETE / FAIL'}** — as-is staging rehearsal completed ${result.finishedAt}. ${result.applicationRequests} application API requests, in 50 → 150 → 300 order. Stop condition: ${result.stopCondition ? JSON.stringify(result.stopCondition) : 'none; no challenge, block, 429 or unexpected request failure'}. Provider configuration and domain deployments unchanged: ${result.providerUnchanged}. Independent cleanup confirmed: ${cleanup.confirmed}.

## Scope and binding

Only https://staging.bidzizi.com received rehearsal traffic. Pinned Vercel project \`prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9\`, deployment \`dpl_84j5YvYHCn18XZxycpMckLTf5ftf\`, source \`088e3b0316cc42914a17d80ca4ef04cf3f3d3761\`. Direct verified-TLS staging connections used Neon project \`delicate-math-48681189\`, branch \`br-crimson-mountain-arsolcfe\`, endpoint \`ep-orange-cake-aryndhab\`. Production sessions on \`br-cold-glitter-arx1msrh\` defaulted to read-only and only inspected limits and the absence of random fixture IDs. No production application request was made by this rehearsal.

The user explicitly accepted fixed 0.25 CU staging as a conservative test of production's 0.25 CU autoscaling floor. Staging autosuspends after 300s; production scales to 8 CU and does not autosuspend. Both domains served the same source, Node 24, pdx1, Fluid/standard memory functions and 300s timeout. Live max_connections remained 112 staging / 901 production; documented 90% pool allocation implies approximately 101 / 811 backend slots per user/database, rather than a live PgBouncer configuration read. No provider alignment, scaling, firewall, deployment, schema, dependency or application change was made. Before/after provider GETs found no active custom firewall rules, attack-challenge mode or active anomaly.

The isolated test account was provisioned only in staging with an in-memory random password. Each practice event was created through the staging API, directly read from the pinned staging database and independently checked absent from production before joining:

| Phones | API-created event UUID | Direct staging proof | Production read-only proof |
| ---: | --- | --- | --- |
${bindings}

## Workload and timing

Sixty visible image-free items; three hot items; 9 / 25 / 50 active bidders for 50 / 150 / 300 separate cookie sessions. Up to 20 simultaneous joins, a watch per phone, four-second polling, one bid attempt per active bidder every two seconds, deterministic staggering and at most one outstanding request per action except deliberate duplicate submissions. Every tenth attempt is sent twice concurrently with the original request ID. Every seventh placement is discarded as an application-visible outcome and recovered through the receipt endpoint. Local Chromium/WebKit tests separately cover actual committed response loss, offline/throttled/flapping connections and simple mode.

Account/event/item creation, joins, initial snapshots, watches and the 30s warm-up are excluded from measured latency. The two-minute measured bid burst schedules bids through 122s and polls through 124s to cross close. Closing time is set from the staging database clock, scoped only to the practice fixture. A deliberate standing-lock close probe is separate and excluded from ordinary bid latency.

| Phones | Excluded warm-up began UTC | Measurement began UTC | Measurement ended UTC | Observed seconds |
| ---: | --- | --- | --- | ---: |
${windows}

Load generator: ${result.machine.cpu}, ${result.machine.logicalCpus} logical CPUs, ${result.machine.platform} ${result.machine.release} ${result.machine.arch}, Node ${result.machine.node}. Generator checkout base \`${result.sourceRevision}\`; final committed harness accompanies these results. Executed staging.mjs SHA-256: \`${hash}\`. The actual served application source is the deployment source above.

## Latency and throughput

Milliseconds, including HTTP response decoding. Targets: snapshot p95 <1,000ms and bid p95 <2,000ms. Setup and excluded warm-up are not included. Expected competition/closed decisions and deliberate duplicate HTTP requests remain in ordinary bid latency.

| Phones | Snapshot p50 / p95 / p99 ms |
| ---: | ---: |
${lat('snapshot')}

| Phones | Bid p50 / p95 / p99 ms |
| ---: | ---: |
${lat('bid')}

| Phones | Snapshots/s | Bid HTTP/s | Measured snapshots | Measured bid HTTP | Schedule lag p95 / p99 ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
${throughput}

![Staging measured p95 latency](../evidence/nov19/staging-latency.svg)

## Capacity and cold starts

Direct pg_stat_activity samples were scheduled every second, grouped by state for this database's client backends. Counts include the control and read-only observer connections and any other existing connections to that staging database. State peaks occur at different instants and must not be summed. One-second observations can miss subsecond peaks; sampled lock waiters do not exclude transient lock contention. The close probe runs after this sampling window. No instance-count inference is made from database connections.

| Phones | Samples | Peak total connections | Peak active | Peak idle | Peak idle in transaction | Peak lock waiters |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${db}

![Staging connection samples](../evidence/nov19/staging-connections.svg)

Vercel function invocation counts below are filtered by each unique event's guest API prefix and pinned deployment. They cover guest join/watch, warm-up, measured requests, receipt recovery and close probe; host provisioning/deletion is excluded. Provider time windows are rounded to minutes. Counts therefore cannot precisely attribute cold starts to the excluded warm-up versus measurement within boundary minutes. Totals are checked against the driver's known guest request schedule to detect incomplete ingestion. Metric collection: ${cold.collectedAt}.

| Phones | Cold starts | Hot starts | Prewarmed starts | Provider total / expected guest HTTP | Totals match |
| ---: | ---: | ---: | ---: | ---: | --- |
${coldRows}

**Open observability limitation:** at 300 phones the provider reports 18 fewer invocations than observed guest HTTP requests. Repeated reads plateaued at this total; a separate exact-path breakdown localizes the gap to 11 snapshots and 7 bids, with joins, watches and receipt lookups reconciled. Zero reported cold starts at 300 does not prove that all 16,201 guest requests were hot. The workload/SQL acceptance pass is separate from this incomplete metric reconciliation. The evidence checker deliberately exits nonzero for this gap; it is not relabeled as a complete observability pass. See [metric reconciliation receipt](../evidence/nov19/staging-metric-reconciliation.json). No provider configuration change or additional application load was made to investigate it.

Trustworthy function-instance counts were unavailable and are omitted as authorized. Invocation IDs and cold-start counts do not establish simultaneous VM counts. Hosted app/Postgres CPU was also unavailable; it is not inferred from latency. One-second connection states are the approved capacity signal.

## Durable correctness, rejection and cleanup

Every run independently checked: duplicate participant/request bids; missing or wrong accepted-bid receipts; orphan accepted receipts; leader/current amount/bid count/next sequence against raw bids; contiguous item sequences with strictly increasing accepted amounts and nondecreasing decision times; accepted bids within effective server-time windows; and every HTTP-observed receipt against durable JSON. All checks operate only on the practice event. The close probe observes the specific request waiting while open on the controlled standing lock, releases after close and requires a CLOSED receipt decided after release. Exact timestamps remain in the raw JSON.

| Phones | Accepted bids | Durable decisions | HTTP receipts compared | Duplicate pairs | Receipt recoveries | SQL checks | Lock/close proof | Event cleanup |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
${checks}

Expected HTTP rejections include duplicate replays and do not represent platform errors:

| Phones | Expected rejection counts |
| ---: | --- |
${rejections}

All practice events were deleted after their audits. Final cleanup removed the owned account, org, staff sessions, staff request records and hashed login attempt. Fresh read-only connections independently confirmed zero matching orgs, staff, events, items, participants, bids, standings, staff requests, sessions, password tokens, client reports and login attempts in both staging and production at ${cleanup.verifiedAt}. Foreign keys prevent retained bids/receipts/watches with deleted parents. No copied event, real account, production row or provider resource was deleted. See [independent cleanup receipt](../evidence/nov19/staging-cleanup-proof.json).

## Decision and limits

${result.passed ? 'All three ramps passed; no measurement justifies an application or provider change. Retain the current application and configuration.' : 'The ramp stopped with incomplete acceptance. Do not advance or propose provider alignment until the failure is reported and resolved.'}

This is evidence for the **warmed, image-free, short-duration workload at 0.25 CU**. It conservatively exercises production's compute floor but is not a full production-capacity guarantee. Only 50 of 300 phones actively bid in the highest ramp; the fixture accumulates ${runs.at(-1).correctness?.acceptedBids ?? 0} accepted bids, so full-day bid history, simultaneous joining, all-phone bidding, image delivery, venue wifi and long-running load remain unproven. Local browser/network evidence remains distinct from a physical phone or venue rehearsal. Alerts, restore drill, day-of runbook and preflight are subsequent stages with their existing approval boundaries.

Raw evidence: [rehearsal and one-second samples](../evidence/nov19/staging-rehearsal.json), [cold-start metric receipt](../evidence/nov19/staging-cold-starts.json), [cleanup proof](../evidence/nov19/staging-cleanup-proof.json). Reproduction and safety boundaries: [load README](../../tests/load/README.md). Separate authorized production bypass removal: [security receipt](NOV19_BYPASS_REMOVAL.md).
`);

const colors = ['#2447d8', '#a34d00', '#08785c'];
const header = (title, desc, height = 440) => `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="${height}" viewBox="0 0 850 ${height}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${desc}</desc><rect width="850" height="${height}" fill="white"/><g font-family="sans-serif" font-size="14" fill="#172033"><text x="65" y="30" font-size="22">${title}</text>`;
let svg = header('Staging p95 HTTP latency', 'Warm-up excluded. Snapshot target 1000ms, bid target 2000ms. Conservative fixed 0.25 CU staging test.');
const y = n => 355 - n / 2200 * 280, x = i => 150 + i * 230;
for (const tick of [0,500,1000,1500,2000]) svg += `<line x1="85" x2="780" y1="${y(tick)}" y2="${y(tick)}" stroke="#dce2eb"/><text x="20" y="${y(tick)+5}">${tick}</text>`;
svg += '<text x="65" y="55">Milliseconds; fixed 0.25 CU; excluded 30s warm-up per ramp</text>';
for (const [j,key] of ['snapshot','bid'].entries()) {
  svg += `<polyline fill="none" stroke="${colors[j]}" stroke-width="3" points="${runs.map((r,i) => `${x(i)},${y(r.latencyMs?.[key]?.p95 ?? 0)}`).join(' ')}"/>`;
  for (const [i,r] of runs.entries()) svg += `<circle cx="${x(i)}" cy="${y(r.latencyMs?.[key]?.p95 ?? 0)}" r="5" fill="${colors[j]}"/><text x="${x(i)+10}" y="${y(r.latencyMs?.[key]?.p95 ?? 0)+(j ? 22 : -12)}" fill="${colors[j]}">${r.latencyMs?.[key]?.p95 ?? 'N/A'}</text>`;
}
for (const [i,r] of runs.entries()) svg += `<text x="${x(i)-30}" y="388">${r.phones} phones</text>`;
svg += `<text x="85" y="420" fill="${colors[0]}">● Snapshot p95 (target 1000)</text><text x="390" y="420" fill="${colors[1]}">● Bid p95 (target 2000)</text></g></svg>`;
await writeFile(dir + 'staging-latency.svg', svg + '\n');
const peak = Math.max(20, ...runs.map(r => r.database?.peakConnections ?? 0));
const cy = n => 355 - n / peak * 280, cx = n => 85 + n / 125 * 695;
svg = header('Staging database connections', 'One-second pg_stat_activity samples. Solid lines show total; dashed lines active. Includes two direct rehearsal connections.');
svg += '<text x="65" y="55">Solid: total; dashed: active. Includes two direct rehearsal connections.</text>';
for (let tick=0; tick<=peak; tick+=5) svg += `<line x1="85" x2="780" y1="${cy(tick)}" y2="${cy(tick)}" stroke="#dce2eb"/><text x="40" y="${cy(tick)+5}">${tick}</text>`;
for (const tick of [0,30,60,90,120]) svg += `<text x="${cx(tick)-8}" y="385">${tick}s</text>`;
for (const [i,r] of runs.entries()) for (const active of [false,true]) svg += `<polyline fill="none" stroke="${colors[i]}" stroke-width="${active ? 1.5 : 2}" ${active ? 'stroke-dasharray="4 4"' : ''} points="${r.samples.map(s => `${cx(s.elapsedSeconds)},${cy(s.states.reduce((n,v) => n+(active ? (v.state==='active' ? v.n : 0) : v.n),0))}`).join(' ')}"/>`;
for (const [i,r] of runs.entries()) svg += `<text x="${85+i*230}" y="420" fill="${colors[i]}">● ${r.phones} phones</text>`;
svg += '</g></svg>';
await writeFile(dir + 'staging-connections.svg', svg + '\n');
console.log('Wrote staging report and standalone latency/connection charts from recorded evidence.');
