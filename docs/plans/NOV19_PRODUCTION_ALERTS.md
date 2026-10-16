# Production alert activation

Zack approved starting production alert activation and the local main merge in chat after the three remaining gates were listed. Production activation includes the server-held DSN, two production-filtered email rules, deployment and a controlled isolated practice-event proof/cleanup. No additional tracing, client SDK, schema migration or business-data changes are included. The exact restore drill lifecycle will be prepared separately before branch creation.

Current baseline is READY production `dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT`, source `4d6028f10b30e5cd8f5c33db060cce753114db77`. Readiness merged its release record `80b5124` in d1c2326 and passed the full production-build suite. Application bytes remain unchanged; fresh scripts/evidence do not change that source manifest. The activation uses a separate production build only after staging is refreshed to the same tested application bytes. The previous production deployment remains the application rollback target; no rollback is performed as part of activation.

Rules `6176797` (Nov19 production server failure) and `6176804` (Nov19 production guest blocked) are enabled in `bidzizi-real-v1`, require all filters (Error category, exact application category tag, exact production environment), and notify member jryr through the existing Email preference to zackj13@gmail.com. Five-minute per-issue throttles remain. Existing staging rules are unchanged. Project email digest minimum/maximum were previously reduced to one minute; observed staging delivery was 46.5–51.1s, not a guarantee.

The production proof creates one random disposable org/staff identity and one API-created practice event. Direct read-only SQL binds it to the production database and proves its absence from staging. Only that event's standing row is locked for the eight-second server-failure test; its bid and receipt must remain absent. A real uncaught browser error and a real covered bid button exercise the existing telemetry path after commit. All requests are pinned to app.bidzizi.com; any platform challenge/block/429 stops the proof. No real staff login or event is used.

Cleanup discovers all practice events under the unique owned org, deletes through the app when possible, and uses scoped SQL only for that fixture if needed. It removes the owned staff/session/request/diagnostic/login records and org, then independently verifies absence through fresh read-only connections. Provider credentials, DSN, fixture password and connection strings never enter receipts or Git. A separate production-proof adapter is used; the normal provider still forbids production write clients.

Operational scripts passed syntax and authorization/origin/429 stop checks against a stub transport. The existing manifest proves the application still matches the passed next build/next start browser suite. Deployment and inbox proof are pending until execution receipts exist. The deployment script requires a clean committed tree and validates source hashes before any mutation.

## Executed proof

Staging refresh: READY `dpl_9E34vwRSHXbU5TfXE69Ggzxpucgh`, source `9f1d2582d938fdb2573bf3cca2b40acc35c6b806`; read-only Chromium/WebKit sign-in/join smoke passed. Production activation: READY `dpl_9kMq1rKxWtkEUVEJJ6SggrLK1Xkj`, source `a55dc11264584fd65650731d27943ecb1fce7e42`, same tested application bytes. Only the sensitive production DSN variable was added; existing variables retained their identities. No migration occurred.

The first proof attempt stopped before fixtures because the Neon access token expired (401); the existing CLI refreshed authentication and the repeat succeeded. The real standing timeout left zero bids/receipts, and browser error/health reports committed before forwarding. Cleanup succeeded and an independent fresh read-only query confirmed zero owned records across 12 tables in production and staging.

| Incident | Occurred UTC, Oct 16 | Gmail X-Received UTC | Seconds | ≤60s |
| --- | --- | --- | --- | --- |
| server-failure/api-request | 00:15:37.247 | 00:17:21.097 | 103.850 | No |
| guest-blocked/client-error | 00:15:39.469 | 00:16:06.428 | 26.959 | Yes |
| guest-blocked/bid-sheet | 00:15:42.245 | 00:17:21.097 | 98.852 | No |

Delivery is demonstrated, but the strict latency criterion missed for two incidents. Gmail's custom-rule messages contained the exact matching IDs/checks and rules 6176797/6176804; one individual email and one two-alert digest were received. Existing default high-priority notifications add duplicate emails for new issues. The supported project digest minimum/maximum are already one minute. Do not present this as a guaranteed subminute channel or erase the misses. User confirmation is requested separately; independent inbox evidence is recorded.

Receipts: [deployment](../evidence/nov19/alerts-production-deployment.json), [proof](../evidence/nov19/alerts-production-proof.json), [independent cleanup](../evidence/nov19/alerts-production-cleanup-proof.json). Runtime source attribution remains Vercel metadata because the Sentry release tag is unidentified-deployment. Application rollback target is `dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT`; that immutable deployment predates the DSN and would disarm alerts on rollback. It has not been rolled back.
