# Staging release preparation — 2026-10-04 Pacific

Target: deployed staging for demonstration and E2E with synthetic data by Monday October 5 morning. This is not a real member auction, live SMS, payment, or production-data release. Preserve A and plain admin wording.

## Current evidence

- Canonical and GitHub main: `b6beff9047161fd1fe44bb583f510636461d4c68`; no newer remote branches. GitHub has no Actions runs.
- A and admin branch base: `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`.
- Admin source remains uncommitted; its fourteen approved UI import hashes still match. No concurrent code changes were overwritten.
- `https://staging.bidzizi.com/api/health/database` returned HTTP 200, `ok:true`, `connected:1`, `Cache-Control:no-store`, checked at `2026-10-05T01:14:28.980Z`.
- The deployed Vercel revision is main `b6beff9`; the homepage is the connection check. The prototype directories are not Next routes or deployed application behavior.
- Vercel `bidzizi-clean-staging`, team `saturn-ea53`, is linked to this GitHub repo, production branch main, Node 24. The generated deployment is Ready. Vercel authentication is configured for all except custom domains; custom staging-domain access must not be treated as authentication.
- DATABASE_URL variables exist for Development and Production, not Preview. A preview deployment needs its own scoped configuration.
- Existing Neon `bidzizi-clean-db` in aws-us-west-2 is reachable through the authorized account; branches main and vercel-dev exist. The application implements only a verified pooled/TLS SELECT1 adapter. No event/lot/session/bid schema or API exists in code. Current DB contents were not inspected.
- Nine prototype model checks and TypeScript were rerun and pass. Prior browser checks cover only local simulations; there is no real app E2E acceptance.

## Isolated implementation preparation

Worktree `/Users/jryear/code/bidzizi-staging-e2e`, branch `staging-e2e`, based on A99156cc. It contains a checked snapshot of the uncommitted approved admin prototype and documentation. Admin/main/A checkouts are preserved. Dependencies are linked locally from the existing A install, with no new installation or provider changes.

## First bounded slice

**Pre-enrolled test staff signs in, edits an organization-owned draft event and its lots, receives a PostgreSQL-confirmed save, reloads it from another browser context, and previews the same saved draft through A.**

- Existing Saturn organization and explicit seeded staff grants; no organization onboarding.
- Server-derived person/session/staff authority on every read, write, and preview; client organization/role fields grant nothing.
- Event creation/listing, details, internally entered lots, ordering, validation, save/reload, and authenticated draft preview.
- Incomplete drafts remain drafts. Do not require complete publication readiness just to save edits.
- Revision-conflict handling prevents silent lost updates; duplicate create/retry produces one durable event.
- Saved status follows the durable transaction; outage/pending/uncertain writes must not display Saved.
- Draft preview uses a staff-authorized server response; draft content never appears in the audience API.

Freeze a narrow independent contract/evidence packet before implementation. Acceptance must exercise HTTP/browser and direct assertions against disposable per-tree PostgreSQL storage. Local Postgres18 tools are available, so protected test fixtures can allocate their own ephemeral clusters/schemas without touching the shared staging DB. Infrastructure failures are exit99. No kernel verdict is yet claimed.

## Ordered subsequent slices

1. Staff identity, org authorization, durable event/lot editing and saved-draft preview.
2. Approved immutable catalog snapshot, selected lots, UTC opening/closing schedule, and the same release read by A bidder screens. Unopened catalog rows are omitted by the server. Server/DB time controls visibility and bid eligibility; a browser clock or a cron trigger cannot decide acceptance.
3. Explicit staging test identity/verification, separate people/business memberships/event admission, browse/watch, and one manual durable bid with a receipt and authoritative standing. No typed Member ID grants authority; show sandbox/test verification honestly.
4. Two independent admitted test bidders, concurrent/retried/stale/late bids, outbid standing, close enforcement and recovery/reload. Freeze a versioned test monetary ruleset separately; no real auto-bid, donation, payment, or settlement behavior.
5. Protected branch preview, fresh synthetic seed state, independent security/concurrency review, deployed browser E2E, DB assertions, and exact revision/provider receipt.

## Deployment route proposal and dependencies

Use branch `staging-e2e` as Preview in the existing Vercel project, initially using its protected generated URL. Bind it to a dedicated isolated test Neon branch, not the current Production/default branch. Configure Preview variables for that branch. Do not move the custom staging alias until its authentication and route behavior are verified.

Zack/overview owner must confirm the concrete setup choices before external changes:

- Existing/managed IdP versus a bounded staging-only test-account session mechanism. Phone verification remains sandbox/test unless a real provider is explicitly selected; send no real SMS/email.
- Permission to allocate an isolated Neon staging/E2E branch and apply only the new application schema/synthetic fixtures there.
- Permission for branch-scoped Vercel Preview DB/auth configuration. No new session secrets, bypass credentials, provider users, or expanded access have been created.
- E2E access to the protected generated deployment using an existing authorized mechanism; creating an automation bypass credential requires explicit approval.

Fixture photography can carry the first slices. Uploaded item images require real bounded storage later; do not put production image uploads into browser-local data URLs.

## Feasibility

A deployed A-based demo is feasible. A durable two-user E2E slice is plausible overnight with prompt setup decisions, strict manual/test-only scope, and incremental checkpoints. The complete prototype feature set is not already implemented and cannot honestly be promised as production auction software by morning. Authentication/storage setup and evidence are on the critical path; a static shell deployment alone would not satisfy cross-user persistence or authoritative bids.
