# Staging Preview database boundary 001a

This is a narrow correction to the staff adapter. Integration-managed
`DATABASE_URL` changed after the staging source push. A private branch Preview
variable must supply this adapter independently of the connectivity adapter.

`run.mjs selector` executes 14 fixed cases against the actual exported
`databaseConnectionURL()` in `src/server/config.ts`. `run.mjs adapter` executes
19 fixed cases against the actual `src/server/db.ts` transaction entry point.
Each case receives a fresh process with only declared fake values and a minimal
environment. The custom loader replaces `pg` and `@vercel/functions`; it also
resolves the existing extensionless config import for Node24 TypeScript loading.
The fake Pool records construction and throws its sentinel at connect. It never
opens a socket. Worker network entry points are blocked and every case asserts
zero network attempts. No provider or database is contacted.

## Assertions

| Invariant | Fixed assertion |
| --- | --- |
| Dedicated Preview target wins over conflicting managed default | Selector equals the private fixture; actual Pool connectionString equals its normalized URL. |
| No deployed fallback | Missing or empty private value throws; no Pool exists despite a valid managed fixture. |
| No production or other deployed mode | Production, Development, missing marker/environment and non-staging mode throw before Pool. |
| Local adapter remains explicitly disposable | Local-test plus opt-in loopback nonstandard-port bz_test_* URL selects DATABASE_URL even with conflicting private value. Missing opt-in, shared name, port5432 and nonloopback reject. |
| Existing Neon pooled TLS is retained | Unpooled/non-Neon/missing-TLS/disabled-TLS values fail before Pool. Valid Preview Pool has ssl={rejectUnauthorized:true}; certificate URL keys are stripped. Only explicit disposable local Pool has ssl:false. |
| Deployed selection is actually wired | Assertions inspect Pool options produced by the real adapter, rather than accepting an unused selector. |
| Errors remain generic | Refusals cannot include fake target, role or credential values. |

The function is absent on source checkpoint5285648, which produces finite ordinary
RED. The actual old Pool path also produces finite RED because it receives the
managed fixture. Missing runtime/dependency exits99. Worker timeout is functional1
on candidate and baseline-unverifiable99. Assertions, rather than printed labels
or author/reviewer opinions, determine exit0; every declared case must complete.

The correction contract keeps all three original v2 staff suites, both versioned
v1 suites, the prototype model and TypeScript as regressions. Original v1 files
are preserved byte-for-byte under `staff-drafts-v1`; original protocol's seed path
still refers to `staff-drafts/seed.sql`, whose frozen bytes are identical. Both
versions exercise their original fixtures; v2's two-lot starting state does not
replace v1's empty-event cases.

This local verdict does not prove the private Preview variable is configured,
the deployed revision uses the intended target, Secure cookie behavior or hosted
staff E2E. Those require separate exact-release evidence. The existing
`src/lib/database.ts` connectivity adapter and original packets stay protected.
