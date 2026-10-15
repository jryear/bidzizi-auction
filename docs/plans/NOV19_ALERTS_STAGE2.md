# Nov 19 alerts: implementation and staging proof state

## Authority and current boundary

On 2026-10-14 Zack approved Option A: Sentry Developer ($0), project `bidzizi-real-v1`, email destination `zackj13@gmail.com`. Zack owns account/org/project creation and provides the DSN only in `~/.config/bidzizi/sentry-dsn`. His single approval covers local implementation/tests, the two email alert rules, sensitive **staging-only** DSN configuration, deployment of the tested commit to staging, and the controlled staging proof with isolated fixtures/cleanup. This supersedes the extra staging-activation approval in the original options proposal. **Do not ask for that approval again.** Production DSN configuration/deployment remains explicitly gated. Restore-branch creation still requires his separate go.

Local implementation and tests are complete. At the last filesystem check the DSN file was not present, and Sentry rule setup has not been confirmed. No alert environment variable, deployment or hosted proof has been executed. This is an external input/setup dependency, not a new permission request. Stage 2 is incomplete until Sentry detection and engineer inbox delivery are demonstrated. Stages 3–5 remain sequential.

The worktree merged the already-served `088e3b0` application revision in `8c954e9` before implementing alerts. This preserves current Studio/guest preview behavior instead of redeploying the older local-load baseline. Alert changes add only server modules/instrumentation and two server call sites; no new `src/app/**` edits, schema changes or dependencies.

## Implemented behavior

- `src/server/v1/http.ts` queues a server-failure event only after an unexpected request error has escaped its settled transaction. Existing safe 503 JSON stays the same; a generated `X-BidZizi-Alert-Id` header provides correlation when queued. Expected application/bid rejections do not alert.
- `src/server/v1/telemetry.ts` queues after its transaction commits: all `error` reports and only `app-not-started`, `error-boundary`, and `bid-sheet` blocking health checks. Device heartbeats and unknown health checks do not alert. Staff reports use the same privacy-preserving category. The 202 result is unchanged by notification failure.
- `src/instrumentation.ts` uses the installed Next.js `onRequestError` hook for uncaught Node server/framework errors, awaiting its bounded dispatch as required by the installed guide. It does not capture error, request or context. API/telemetry work uses Next `after`, so notification I/O starts after the response, outside bidding/database transactions.
- The transport constructs a fresh, fixed-schema Sentry envelope: static category/check, random 32-hex event/correlation ID, UTC timestamps, environment/release and allowlisted coarse browser family. It excludes raw error/message/SQL/stack/request data, names, emails, device/IP hashes, full URLs and the DSN. No browser SDK or credential is shipped.
- DSNs accept verified HTTPS only on pinned Sentry ingest hostname patterns. Origin/mode checks permit the dedicated staging deployment; production remains disarmed without its separately gated DSN. Local tests cannot contact Sentry: their receiver override requires explicit local mode, no Vercel and a loopback URL/port.
- Per-process deduplication: 60-second TTL, 256 entries, four pending jobs maximum. Each job runs once, with at most two attempts of 1.5 seconds each. Provider 429 triggers a 60-second process backoff. A failed delivery removes the local incident reservation so a later qualifying report may retry. Safe failure logging cannot recursively alert or alter an application response. These bounds do not provide global deduplication across Fluid instances; Sentry's per-issue rule throttle bounds repeat notifications separately.
- A successful HTTP ingest response is logged as **accepted**, never as inbox delivery or Sentry detection. Hard process termination, inaccessible telemetry, provider outages/free-quota exhaustion and mail delays remain coverage limits.

## Local verification

Node 24.4.1, pnpm 12.4.2. [Application source hashes and passed checks](../evidence/nov19/alerts-validation.json), [scenario receipt](../evidence/nov19/alerts-local.json), [production-build suite log](../evidence/nov19/alerts-validation.log), [fresh poor-network receipt](../evidence/nov19/alerts-resilience.json).

`tests/alerts/core.mjs` passed target/config rejection, strict allowlisting, deferred send, first delivery, deduplication/TTL/eviction/pending bounds, once-only job execution, bounded retry, provider backoff, timeout and disarmed-mode tests without network access.

The disposable production-build suite passed a genuine eight-second standing-lock timeout → sanitized 503 with no bid or receipt committed and null original-request receipt lookup; an actual uncaught browser error → committed telemetry → filtered deferred envelope; an actual overlay covering the bid button → existing blocking-health report → committed telemetry → envelope; and a receiver returning 503 twice while the application still returned 202 and retained its committed telemetry. Expected BELOW_MINIMUM decisions and unknown health reports did not alert. All owned practice fixtures/processes/disposable databases were cleaned up.

Typecheck, production build, compatibility, 55/55 journey checks, Chromium/WebKit bid-sheet and JavaScript-disabled simple mode, 8/8 telemetry checks, and Chromium/WebKit offline/throttled/flapping recovery passed. Browser bundles were scanned for server configuration/auth/transport markers with zero matches. The initial receiver assertion raced the after-response callback; the test now waits for the matching envelope. This was a harness timing error, not a failed send. Local receiver success is not hosted Sentry or inbox proof.

## Two-minute rule setup (user-owned UI fallback)

No Sentry management token was supplied; the DSN cannot manage alert rules. The following steps were supplied while implementation proceeded:

1. **Monitors → Alerts → Create Alert**. Project `bidzizi-real-v1`, source **Error issues**, environment **staging**, trigger **An event or issue activity is captured**.
2. Add **Tag → category → is → server-failure**. Action **Notify on preferred channel → Member → Zack's account**; its preferred channel must be email to `zackj13@gmail.com` with alert email enabled. No Slack/paid integration is needed.
3. Per-issue throttle **5 minutes**. Save **Nov19 server failure**. The first matching issue can notify immediately; the interval suppresses repetitions, not initial delivery.
4. Repeat with category **guest-blocked**, named **Nov19 guest blocked**.

If the fresh project does not yet offer the environment or uses a different builder, report its actual labels; do not claim rules enabled or substitute a daily digest. Confirm both rules enabled before the controlled proof. Current official references: [pricing](https://sentry.io/pricing/), [alert configuration](https://docs.sentry.io/product/alerts/create-alerts/), [envelope protocol](https://develop.sentry.dev/sdk/data-model/envelopes/).

## Authorized staging execution when inputs are ready

Use the real Node 24 installation. Do not print/cat the DSN, put it in shell arguments or copy it into the repo. The deployment script reads it in memory, checks sensitive staging scope, validates every tested application source hash, exports committed source to a private temporary directory and uses existing authenticated Vercel access.

```sh
export PATH=/Users/jryear/.nvm/versions/node/v24.4.1/bin:$PATH
# HEAD must be clean, committed, and contain the exact tested application source.
node scripts/deploy-nov19-alerts-staging.mjs --deploy-staging-approved <full-tested-commit>
# Only after the user's rule-setup confirmation:
node tests/alerts/staging-proof.mjs --staging-proof-approved --rules-confirmed
node tests/alerts/collect-staging.mjs
node tests/alerts/verify-staging-cleanup.mjs
```

Staging project is `prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9`. Its Vercel deployment target is named `production` **inside that isolated staging project**; this is how the existing staging custom domain is served, not production application activation. The only project variable written is sensitive `BIDZIZI_SENTRY_DSN`, scoped to that target. Production project `prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2` receives read-only alias/env checks and must retain no alert DSN. No production application-domain request or database mutation is made.

The deploy first uses `--skip-domain`, verifies READY/source/project, then assigns only `staging.bidzizi.com`. Save the new deployment identity and unchanged production identity in `alerts-deployment.json`. The prior staging deployment is `dpl_84j5YvYHCn18XZxycpMckLTf5ftf`; no production rollback/deployment action is authorized.

The proof creates one new random staging org/account and one practice event through the API, verifies it by direct staging SQL and absence from production read-only SQL, and triggers three notifications: a scoped standing-lock timeout/server failure; an uncaught browser error; and a real covered bid-button health check. API/browser requests stay on staging and stop on platform challenge/block/429. The server timeout must leave no bid or receipt; guest errors must already be committed before forwarding. Remove every owned event/account/session/request/login record in finally, rediscovering any lost create response only under the owned org. Independently verify cleanup and production absence through fresh read-only connections.

Save generated correlation IDs and occurrence/response timestamps. Extract only matching safe `BidZizi alert` runtime log records; do not dump raw logs. Ingest accepted time and provider HTTP Date are **not** Sentry detection or inbox receipt. Zack confirms inbox arrival timestamps (seconds and timezone, ideally the final Gmail Received timestamp) and Sentry event `received` timestamps for the matching IDs. Record observed values, calculate occurrence-to-inbox for server and guest paths, and require ≤60s. A missing timestamp, missing email or timing miss remains an explicit incomplete/failed criterion.

After proof, commit evidence and present the exact deployed/tested source commit for the remaining production-activation gate. Production activation is not authorized by this document or the staging approval. Continue stages 3–5 with their retained boundaries, including explicit go before creating the Neon restore branch.
