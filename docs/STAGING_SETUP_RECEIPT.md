# Isolated staging setup — 2026-10-04 Pacific

Authorized by Zack: isolated Neon test branch, branch-scoped Vercel Preview database configuration, protected staging deployment and synthetic E2E. No production data, live SMS, main merge or live auction operation is included.

- Neon project: `autumn-salad-86564853` (`bidzizi-clean-db`).
- New schema-only branch: `br-autumn-surf-arrxv906` / `staging-e2e-20261005`, ready, `parent-schema`; row data was not copied.
- Dedicated empty database: `bz_staging_e2e`.
- Separate migration owner: `staging_e2e_owner`; runtime role `staging_e2e_app` has no superuser, create-database, create-role, replication or RLS-bypass privileges. Runtime gets only connection, schema usage and application table DML. Owner credentials are not a deployment variable.
- Compute: 0.25 CU minimum/maximum, suspend after 300 seconds of inactivity. No subscription or compute-tier change was requested.
- Credentials captured privately outside the repository, never copied into a tracked environment file or client assets. No token or connection value is included in this receipt.
- Neon role creation unexpectedly emitted a password despite `--no-secrets`. The unused role was deleted and replaced before database wiring, invalidating that disclosed password. Subsequent credential-producing commands were captured privately with output withheld.
- Vercel target is existing `bidzizi-clean-staging` / `saturn-ea53`. Branch-specific environment configuration requires `staging-e2e` to exist on GitHub; the first attempt was rejected with `branch_not_found` and made no confirmed configuration change.
- Planned Preview-only variables on that branch: secret `DATABASE_URL` for the runtime role; config `BIDZIZI_APP_MODE=staging`, `BIDZIZI_STAGING_TEST_AUTH=true`. Local-test database bypass is never enabled externally.
- Session tokens are opaque, random and stored only as hashes in PostgreSQL. No separate signing secret is needed.

No migration, seed, app deployment, provider release acceptance or live bid has been performed at this setup checkpoint. The local frozen contract and its disposable database checks remain separate from connected-provider evidence.
