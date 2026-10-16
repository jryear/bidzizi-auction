# Nov 19 readiness checkpoint — Oct 16, 2026

Operational implementation is complete through stages 1–5. Production alerts are active and their delivery is demonstrated; the restore drill passed and cleaned up; the staff runbook and preflight are implemented. **Show acceptance remains open:** two production emails missed the strict 60-second target, and physical-phone/venue/QR rehearsals plus the real event's code/times and staff assignments remain outstanding. No simulated or browser-engine result is presented as physical acceptance.

## Source and delivery

- Baseline: `1ee003bc978692b3525ad47d0ab2b18646dea53d` (8246e7f plus readiness brief). Worktree `real-v1-nov19-execution`, branch `jryear/real-v1-nov19-execution`.
- Production: READY `dpl_9kMq1rKxWtkEUVEJJ6SggrLK1Xkj`, source `a55dc11264584fd65650731d27943ecb1fce7e42`. Sensitive production Sentry DSN configured; two production rules enabled. Photos, thumbnails, paste focus and Safari dialog sizing are retained.
- Staging: READY `dpl_9E34vwRSHXbU5TfXE69Ggzxpucgh`, source `9f1d2582d938fdb2573bf3cca2b40acc35c6b806`. Refreshed to the same tested application bytes as production; Chromium/WebKit read-only hosted smoke passed.
- Local `main` has its own Orca checkout at `/Users/jryear/orca/workspaces/integration/real-v1-main`. It is fast-forwarded to the readiness work after checkpoint completion. No Git push is authorized/performed by this execution; remote main remains separately tracked.
- Subsequent operational scripts/docs do not change the deployed application bytes. [Source hashes and final checks](../evidence/nov19/alerts-validation.json), [production deployment receipt](../evidence/nov19/alerts-production-deployment.json).

## Local load evidence

Production Next.js build with disposable loopback Postgres 18.6; Apple M4 Max, 16 logical CPUs, 48 GiB, darwin/arm64, Node 24.4.1 and pnpm 12.4.2. Dedicated app 3469 / database 55469. Fifty/150/300 separate phone cookie sessions, joins/watches/four-second polling, three hot items and a final full two-minute burst; duplicate IDs, response loss/receipt lookup and close-crossing requests are included. [Reproducible settings, CPU/query details and SQL proof](NOV19_LOCAL_LOAD_RESULTS.md).

| Phones | Snapshot p50 / p95 / p99 ms | Bid p50 / p95 / p99 ms | Poll snapshots/s | Bid HTTP/s | DB peak | App / PG CPU |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 50 | 6.42 / 12.61 / 22.60 | 5.85 / 10.63 / 16.73 | 12.45 | 3.90 | 6 | 6.88% / 2.91% |
| 150 | 5.97 / 11.04 / 17.16 | 5.74 / 10.96 / 17.08 | 37.39 | 10.84 | 6 | 15.72% / 7.73% |
| 300 | 3.91 / 7.07 / 14.16 | 3.76 / 6.06 / 8.75 | 74.60 | 21.64 | 6 | 18.75% / 10.87% |

![Local p95 latency and targets](../evidence/nov19/latency.svg)

All runs had zero unexpected request failures and zero SQL correctness failures: duplicate bids, accepted receipt coverage, standings/counts/next sequences and per-item sequence/time consistency. The observed standing-lock probe proved the close decision was made from server time after lock acquisition. All fixtures were deleted and independently checked. These are local measurements, not hosted capacity claims.

## Approved hosted load evidence

As-is staging fixed at 0.25 CU, warmed first with warm-up excluded. Production autoscaling floor was also 0.25 CU (maximum 8 CU); staging autosuspended at 300s, production did not. Both used Node 24, pdx1, Fluid/standard functions, 300s timeout. No scaling/firewall/config alignment was performed. Staging max_connections was 112, production 901; the approximately 101 pooled-backend allocation is a documented allocation estimate, not a live pooler configuration read. [Full hosted settings, receipts and binding](NOV19_STAGING_LOAD_RESULTS.md).

| Phones | Snapshot p50 / p95 / p99 ms | Bid p50 / p95 / p99 ms | Snapshots/s | Bid HTTP/s | Peak connections | Cold starts |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 50 | 76.33 / 152.38 / 175.40 | 73.30 / 147.47 / 177.26 | 12.50 | 4.86 | 14 | 20 |
| 150 | 77.57 / 156.67 / 187.73 | 73.57 / 153.59 / 176.42 | 37.20 | 13.40 | 14 | 0 |
| 300 | 80.19 / 158.69 / 188.95 | 75.09 / 153.15 / 185.03 | 74.40 | 26.80 | 14 | 0 reported; incomplete |

![Hosted measured p95 latency](../evidence/nov19/staging-latency.svg)
![Hosted one-second connection samples](../evidence/nov19/staging-connections.svg)

All ramps stopped on no platform condition: no challenge/block/429, no unexpected request failures, no SQL correctness failures. API-created practice events were directly proved in staging and absent from production by read-only SQL; account/events were removed and cleanup independently confirmed. pg_stat_activity was sampled every second by state (124/125/125 samples). Trustworthy function-instance counts and hosted CPU were unavailable and are omitted. At 300 phones, Vercel reports 18 fewer invocations than the 16,201 guest HTTP requests (11 snapshots, seven bids); the metric reconciliation check intentionally remains nonzero for that gap. Local/hosted workload acceptance and incomplete provider accounting are separate conclusions. The load source predates the later photos/Sentry/UI releases; current regression checks pass, but no new full ramp was performed on the final deployed candidate.

## Changes and rationale

No measured load result justified a cache, snapshot rewrite, polling change or pool change. Existing response shape, participant isolation, server timing and durable receipt semantics were retained. The full-event history query remains a growth risk for materially larger/longer events.

The selected official Sentry Next.js SDK integration is server-only, strictly allowlisted, bounded and dispatched after bid/telemetry transactions. Client SDK, automatic request/error enrichment, tracing, replay, logs/metrics and source upload are disabled. Current application code includes the release owner's photo/dialog fixes via exact merges; this readiness work introduces no additional guest feature tranche. Operational additions are restore verification, staff instructions and preflight scripts.

## Alert delivery proof

Sentry Developer ($0 selected by Zack), project bidzizi-real-v1, destination zackj13@gmail.com. Two staging and two production-filtered email rules are enabled. Local actual-SDK/transport/privacy/failure tests passed. [Implementation and staging proof](NOV19_ALERTS_STAGE2.md), [production proof](NOV19_PRODUCTION_ALERTS.md), [fresh configuration/rule receipt](../evidence/nov19/alert-readiness.json).

| Environment / cycle | Server failure | Client error | Bid-sheet health | Result |
| --- | ---: | ---: | ---: | --- |
| Staging initial digest | 229.630s | 228.703s | 228.130s | Failed 60s; retained |
| Staging repeat, digest 1/1 min | 51.112s | 49.318s | 46.465s | Passed observed target |
| Production, digest 1/1 min | 103.850s | 26.959s | 98.852s | All delivered; target missed twice |

Occurrence-to-inbox uses Gmail's exact Received/X-Received metadata, not HTTP ingest acceptance. Zack confirmed all three production incidents arrived; authenticated Gmail UI independently verified the custom-rule messages and timestamps. Both production practice cycles created no real-event activity; the first stopped before fixture creation on expired auth, the successful cycle fully removed the isolated account/org/event and owned records, confirmed across 12 tables by fresh read-only SQL.

Production delivery is demonstrated, not merely configured. The free email digest has limited timing margin and does not guarantee subminute notification. Keep direct staff-to-engineer escalation; accepting the target miss or selecting another channel remains a user decision. Sentry release displays unidentified-deployment; exact source binding relies on Vercel metadata and incident IDs. Existing default high-priority rules can add duplicate emails for new issues.

## Restore proof

Actual Neon project history retention: 86,400s (24 hours). Production parent br-cold-glitter-arx1msrh; successful point `2026-10-16T16:22:32.394Z` / LSN `0/2824DA0`. The temporary branch recovered one ended event, 20 items, 25 bids, 26 receipts, 20 standings and five participants with exact full-row hashes. Verified TLS and read-only SQL were used. Create 0.419s; connection and comparison 0.826s. Branch br-little-darkness-ar7iubzf and its endpoint were deleted; all pre-existing branches remained. First timed-out attempt, expired/stale baseline and cleanup follow-up are preserved separately. [Procedure and evidence](NOV19_RESTORE_DRILL.md).

This is a selected-event restore proof, not production cutover, full-project recovery or an RTO guarantee. No production application credentials/mode restrictions were changed for the drill. Live database recovery still needs separate incident authority and explicit reconciliation of later accepted bids/pledges.

## Runbook, preflight and validation

[Staff sheet and engineer appendix](NOV19_RUNBOOK.md) cover timeline/freeze, roles, Wi-Fi, simple mode, rejoin, mistaken bids, withdrawals, closing changes, escalation and verified rollback. The retained rollback deployment was read back READY; no rollback was executed. Named contacts and physical scan checks are outstanding.

[Preflight instructions](NOV19_PREFLIGHT.md): explicit origin/code/expected times, read-only by default, fresh alert receipt, positive visible-item minimum, and explicit unique practice-event create/publish/join/delete/logout. Stage 5 practice mode ran only locally. Failure tests include unreachable and real untrusted TLS, wrong times, hidden items, disarmed/stale alerts, platform stop, join/cleanup failure and response-loss discovery. The initial missing-body logout failure was fixed and the full suite rerun; its failed log is retained.

Final production-build run (Node 24 / pnpm 12.4.2): typecheck, next build + next start, compatibility, alert core and actual SDK privacy/delivery, 55/55 journey, 8/8 telemetry, photos 9/9, photo UI 11/11, Items UI 17/17, Chromium/WebKit bid-sheet and JavaScript-disabled simple mode, four poor-network scenarios per engine, client-bundle isolation, real local preflight and restore manifest checks all passed. The owned server and disposable database stopped and the cluster was removed. [Full final log](../evidence/nov19/preflight-validation.log), [real preflight receipt](../evidence/nov19/preflight-local.json).

## Stage commits and local preservation

| Stage | Commit identities |
| --- | --- |
| 1 local / hosted | 824f6fa / 1ddbb58 |
| 2 SDK / staging proof / production delivery | b1f549c / 8ba8226 / 8ec7493; user inbox confirmation d6675b0 |
| 3 restore completion | 5816399 |
| 4 staff runbook | 259a895 |
| 5 preflight / final validation | 7de4075 |
| Final checkpoint | Commit containing this document; exact final revision reported after clean-tree audit |

Zack requested no dirty/uncommitted trees. Inherited untracked proposals/fixtures in the old task-18 integration checkout were preserved without content changes in local commit e6e9e01 (explicitly unvalidated); the old deployment checkout's existing .vercelignore was preserved in 3acc189. Neither branch was merged into the release/main nor pushed. Final working-tree status is independently audited after committing this checkpoint and fast-forwarding local main.

## Ranked open risks and remaining human work

1. **Email latency:** two production notifications exceeded 60s. Delivery works, but strict acceptance is open. Direct escalation contact and a decision on accepting this limit or another channel are needed.
2. **Physical acceptance:** older iPhones/in-app browsers, actual HEIC upload, the staff crowd rehearsal and venue Wi-Fi/cellular recovery remain unperformed here. Current engine tests and simulated load do not replace them. Emma's actual production paste confirmation is not recorded in this thread.
3. **Real show configuration:** production Nov 19 room code, confirmed opening/closing instants, visible-item count and named operator/helper/on-call contact are not supplied. Kent's real-event setup and physical two-metre QR scans must be completed before Nov 12 freeze.
4. **Hosted observability:** the 18-invocation accounting gap makes the 300-phone cold-start count incomplete; instance counts/hosted CPU unavailable. This does not invalidate the independent HTTP/SQL/connection sampling results.
5. **Growth/recovery scope:** snapshot history/payload scale with accumulated bids/items; load fixtures were image-free. Restore history is 24h and the drill covers one event, with no live cutover. Rehearse staff response promptly and keep accepted-bid reconciliation central during any real recovery.
6. **Repository publication:** local main is current; GitHub main is not updated by this execution because no push was authorized. Later hosted changes require fresh identity/guard readback and tests appropriate to their application diff.
