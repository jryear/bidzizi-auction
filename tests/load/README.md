# Local readiness workload

Use Node **24** and pnpm **12.4.2**, with dependencies already installed by `pnpm install --frozen-lockfile`. No new runtime dependency is required. Postgres 18 with `pg_stat_statements` and installed Playwright Chromium/WebKit are prerequisites.

```sh
# This machine's Homebrew node@24 alias currently resolves to Node 26.
# Use the real Node 24 installation explicitly; verify node -v first.
export PATH=/Users/jryear/.nvm/versions/node/v24.4.1/bin:$PATH
node tests/load/guards.mjs
node tests/load/run-local.mjs
node tests/load/report.mjs
```

The runner creates a uniquely named temporary Postgres data directory, listens on `127.0.0.1:55469`, creates only `bz_test_nov19`, applies `migrations/prod`, provisions one local test host with a randomly generated password held in the child-process environment, builds the production app and starts it on `127.0.0.1:3469`. It runs 50, 150 and 300 sessions sequentially, then compatibility, journey, bid-sheet, simple-mode, telemetry API and poor-network checks. The app and disposable cluster stop in `finally`; only the owned temporary directory is removed. Port conflicts fail before startup. It never opens `.env` files or copies deployment credentials into fixtures.

Override `LOAD_PG_BIN`, `LOAD_APP_PORT` and `LOAD_PG_PORT` for another installation/free ports. `--checks-only` runs the browser/regression checks without the load series. Do not run another build or CPU-heavy test concurrently with load measurements. Existing background machine activity remains a limitation of this local experiment.

For an already-owned local production server, `local.mjs` requires explicit `BASE`, `BIDZIZI_APP_MODE=local`, `BIDZIZI_DATABASE_URL` pointing to a loopback `bz_test_*` database on a dedicated port, `HOST_EMAIL`, `HOST_PASSWORD`, `LOAD_APP_PID`, `LOAD_PG_PID`, and `PHONES` (50/150/300). Set credentials privately in the environment; do not put them in command arguments or committed files. The app must serve the same disposable database: a random database fixture is checked by read-only HTTP before any API mutation. `LOAD_LABEL` defaults to `baseline`; alternate labels retain separate JSON files.

Each run has 60 ready items, 3 hot items, 30 seconds of polling before a two-minute bid burst, 4s polls, 2s bid attempts per active bidder (9/25/50), and up to 20 concurrent joins. Starts are deterministically spaced. Schedules retain lag instead of hiding delayed requests; each action permits only one request in flight per phone, except deliberate duplicate submissions. All request latency includes response body decoding. Expected BELOW_MINIMUM, ALREADY_LEADING and CLOSED receipts are not infrastructure failures. An intentionally blocked close probe is a separate metric.

Raw results include latency, throughput, expected/unexpected outcomes, process-tree CPU, sampled connections/lock waits, top SQL call counts/rows/execution time, snapshot size, scheduling lag, settings, machine/runtime versions, source revision, independent invariants, lock-release decision proof and cleanup status. `report.mjs` requires all three passing results and both passing browser engines before producing the report/chart.

The harness refuses hosted origins, hosted databases, non-test database names, URL overrides and Vercel mode. It contains **no staging execution mode**. Hosted testing requires the user's separate approval and a separately guarded driver bound to the verified staging deployment and database fork. No production load test is permitted.

Poor-network checks use real browser offline mode and API-level throttling in Chromium/WebKit. They do not simulate all page resources, a cellular radio, older iOS or physical venue wifi. Existing `tests/v1/bid-sheet.mjs` and `simple-ui.mjs` retain focus, pending-state and idempotency coverage alongside the new reboot/flapping checks.

`provider-readback.mjs` is a separate, **read-only** provider/configuration receipt tool. It requires explicit authorization for inspecting both staging and production settings and existing authenticated local Neon/Vercel sessions. It uses fixed provider project/branch/endpoint IDs, checks custom-domain bindings via the provider API without requesting either application domain, and performs only read-only `pg_settings`/`pg_roles` queries through pinned pooled endpoints with verified TLS. Tokens and connection URIs stay in memory; saved output uses explicit safe fields. It creates no fixtures or provider resources, performs no configuration/deployment changes, and never starts a load. A configuration query can wake an idle compute. See [the readback disposition](../../docs/plans/NOV19_STAGING_READBACK.md) for the representativeness gate and remaining measurement gaps.
