# BidZizi

Fresh Next.js staging foundation connected to an empty Neon database. The homepage and `/api/health/database` each run a server-side `SELECT 1` at request time. The endpoint returns HTTP 200 and `connected: 1` on success, or a generic HTTP 503 on failure.

Use Node.js 24 and pnpm 12.4.2:

```bash
pnpm install --frozen-lockfile
vercel env pull .env.local --environment development --scope saturn-ea53
pnpm dev
```

The local directory must be linked to `bidzizi-clean-staging` before pulling variables. `DATABASE_URL` must be the pooled Neon URL with TLS configured. Never commit `.env.local` or `.vercel/`.

```bash
pnpm typecheck
pnpm build
```

See [staging connections](docs/STAGING_CONNECTIVITY.md) for service identities and verification boundaries. Auction workflows, Clerk, and Ably have not been implemented in this fresh app.
