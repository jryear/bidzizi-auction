# Nov 19 readiness (brief for a Codex thread, 2026-10-14)

Saturn's Holiday Trade Show runs on app.bidzizi.com on **Nov 19**: about 50 active bidders, more phones watching,
staff running it from the Studio. Code freeze **Nov 12**. Goal: nobody plays developer at the show.
Read `AGENTS.md` ("Real V1 operating mode") and `docs/plans/REAL_V1_DESIGN_PASS_BRIEF.md` §"Definition of done" first.

**Stay out of UI files.** Two other tracks are active: the Studio preview rebuild (`real-v1/preview-attach`) and
next the photo framing tranche. Touch `src/app/**` only where a readiness fix truly needs it, and say so.

## 1. Load and resilience (the main risk)

Today every guest phone polls `GET /api/v1/e/:code` every 4s (backoff to 30s on failure;
`src/app/e/[code]/participant.tsx:99-108`). Each snapshot is one transaction of ~8 queries
(`src/server/v1/engine.ts` `snapshot`). The pool is `max: 5` per function instance (`src/server/v1/db.ts`).
At 300 phones that is ~75 snapshots/s, plus bursts of bids in the final minutes.

- Write a load harness (`tests/load/`, Node or k6; no new runtime deps in the app) that simulates N phones joining,
  polling, watching and bidding with realistic end-of-auction bursts (many bids on few items in the last 2 minutes).
- Run it **locally first** against a disposable `bz_test_*` database. Report p50/p95/p99 for snapshot and bid,
  error rate, DB connections and CPU at 50, 150 and 300 phones.
- Correctness under load is non-negotiable: after every run, verify from the database that there are no duplicate
  bids, standings equal the max non-voided bid, every accepted bid has a receipt, and server time decided order.
- Then propose (with numbers) whatever is needed: e.g. a cheaper snapshot (fewer queries, a single-statement read,
  short-lived per-event cache for the shared part, ETag/304), adaptive polling (slower when idle or closed,
  faster near close), jitter. Implement the ones the numbers justify, with journey tests.
- **Staging load run** against staging.bidzizi.com (its own project and DB fork) only after Zack's explicit go:
  it costs provider usage. Never load-test production.
- Honest poor-connection experience: throttle a phone (offline, 3G, flapping) and confirm stale/offline states,
  the unconfirmed-bid receipt check and simple mode behave. Fix anything that implies a bid was accepted when it wasn't.

## 2. Error alerts to the engineer

Guest and staff errors already land in the telemetry table (migration 009, Studio Devices panel).
Zack needs to hear about server errors and guest-blocking problems **within a minute, without watching a screen**.
Propose 2 options with cost (e.g. Vercel log drain/alerts, Sentry, a tiny cron that emails/SMSes from telemetry
and function errors). Creating any provider resource or account needs Zack's go. Build the chosen one, then prove it
fires by triggering a real error on staging.

## 3. Backups and restore drill

Production DB: Neon `delicate-math-48681189` (pooled endpoint, verified TLS). Confirm the plan's point-in-time
restore window. Run a **restore drill** on a branch (Zack's go before creating it): restore to a timestamp, point a
local or staging build at it read-only, verify an event and its bids are intact, then delete the branch.
Write the exact steps and timings into the runbook. Never print connection strings.

## 4. Day-of runbook (one page, `docs/plans/NOV19_RUNBOOK.md`)

Plain language for Saturn staff, with an engineer appendix:
- timeline (T-7 days to after the show): event built, rehearsal, QR cards printed, freeze, morning-of checks;
- roles: who runs the Studio, who helps guests at the table, who the engineer is;
- "if this happens, do this" for: venue wifi down, a phone that can't load (simple mode link + QR),
  a guest who lost their pass (rejoin code), a mistaken bid (void), an item withdrawn, closing needs to move,
  the site is down (rollback: `vercel promote <previous deployment>` with the exact deployment to use),
  database trouble (the restore steps);
- printed materials: table QR cards and the full-page QR from the Studio print page; check they scan from 2m.

## 5. Morning-of check

A script (`scripts/preflight.mjs`) staff or the engineer runs on the day: production reachable over TLS, the event is
live with the right times, items visible, join works with a throwaway practice event, and alerts are armed. Read-only
against production except for the throwaway practice event, which it deletes.

## Rules

- Keep green: tsc, `next build`, `tests/v1/journey.mjs` and the other `tests/v1` suites you touch.
- Commit locally after each numbered stage. **No push, merge to main or production deploy.**
  Provider resources (staging load, alerting service, Neon branches) need Zack's explicit go each time.
- Never print secrets or connection strings; credentials stay server-side.
- Finish with `docs/plans/NOV19_READINESS_CHECKPOINT.md`: load numbers and charts, what changed and why,
  alert proof, restore drill timings, open risks ranked.
