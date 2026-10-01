# Fresh staging connections

The user authorized a fresh Vercel project and empty Neon project connected to `jryear/bidzizi-auction`. This supersedes the earlier plan to reuse the old staging resources. No legacy application code, schema, or rows were imported.

## Resources

- Repository: `https://github.com/jryear/bidzizi-auction`, production branch `main`.
- Vercel: `bidzizi-clean-staging`, project ID `prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP`, team `saturn-ea53` (`team_fOkqe9T0PRKMmdczUvnoMXct`).
- Neon: `bidzizi-clean-db`, project ID `autumn-salad-86564853`, organization `jryr` (`org-tiny-heart-99464078`), region `aws-us-west-2`, Postgres 18.
- Neon default branch: `main` (`br-proud-dust-arfhct59`). The integration created a separate Development endpoint. Verified TLS queries against Production and Development both returned `1` and zero application tables; the Production endpoint was independently matched to the new project’s main branch.
- Existing Neon-managed Vercel integration configuration: `icfg_dA1Tjqj1AGnBJqC26NjlVNYA`. The new project was connected through the Neon console using the existing authorization; Neon account and billing ownership were retained.
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are integration-managed variables for Production and Development. The application uses the pooled URL; no schema changes are performed.
- Local prior connection metadata snapshot: `/Users/jryear/.local/state/bidzizi/clean-reset-20261001T203222Z`, outside Git with restrictive permissions.

The old Vercel project `bidzizi-staging` was disconnected from the new Git repository so fresh commits do not deploy to both projects. Its old deployments and database remain separate. DNS records, Clerk, and Ably were not changed.

## Observable checks

The fresh homepage performs `SELECT 1 AS connected` on the server for every request. `/api/health/database` runs the same query with caching disabled, returning HTTP 200 and a JSON result with `ok: true`, `connected: 1`, and `checkedAt`. A failed check returns HTTP 503 and only `ok: false` and `checkedAt`; provider errors and credentials are not exposed.

Verification completed locally:

- TypeScript and a production Next.js build pass.
- Two endpoint requests returned actual successful queries with different timestamps and `Cache-Control: no-store`.
- The homepage displayed the successful query result.
- Running with an empty `DATABASE_URL` produced a generic HTTP 503.
- Database URL and password were absent from browser JavaScript assets.
- An authenticated Postgres probe using verified TLS returned `1` and zero application tables.

Deployed acceptance requires a successful check through the generated URL before moving the staging domain, followed by successful requests through `staging.bidzizi.com`. Deployment receipts, source revisions, HTTP responses, and screenshots are retained outside Git in `/Users/jryear/.local/state/bidzizi/clean-reset-20261001T203222Z`. Do not treat a build or this document as deployed acceptance.

## Operation

Use Node.js 24. `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm build` operate the fresh app. Vercel detects Next.js and uses its default build settings. Application functions run in `pdx1`.

For a connection refresh, confirm the local link references `bidzizi-clean-staging`, then run:

```bash
vercel env pull .env.local --environment development --scope saturn-ea53
```

Do not copy environment files from the old checkout. Keep secrets and `.vercel/` ignored by Git. A database reset, resource deletion, Clerk or Ably wiring, and auction features require their own scope.

No frozen implementation contract exists for this setup; no kernel-supported verdict is claimed. Contracted future work follows AGENTS.md and `~/code/_kernel/verify.py`.
