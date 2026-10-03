# BidZizi

BidZizi is being rebuilt for company-hosted auction events. The current product priority is a mobile bidder experience that feels native, reputable, and remarkable. PWA/SPA behavior is an intended direction; it is not implemented by this scaffold.

## What exists now

This repository, [`jryear/bidzizi-auction`](https://github.com/jryear/bidzizi-auction), contains a fresh Next.js App Router foundation using React, TypeScript, and `pg`.

- `/` displays a server-side database connectivity check.
- `/api/health/database` performs `SELECT 1` at request time with caching disabled. Success returns HTTP 200 with `ok: true`, `connected: 1`, and `checkedAt`; failure returns a generic HTTP 503 without provider errors or credentials.
- Auction records, migrations, authentication, bidder sessions, bidding, Clerk, and Ably are not implemented. There is no test suite or CI configuration. Playwright is installed but has no configured checks.
- The Next.js app has no PWA manifest, icon set, service worker, installation flow, or bidder navigation yet; the bidder experience exists only as the simulated prototype in `prototypes/lanyard` ([below](#bidder-design-foundation-prototype-a-lanyard)). No legacy application code or database contents were imported.

| Location | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Current connectivity page |
| `src/app/api/health/database/route.ts` | Live connectivity endpoint |
| `src/lib/database.ts` | Server-only Neon pool and verified TLS checks |
| `src/app/globals.css` | Current page styling |
| `prototypes/lanyard/` | Prototype A: the selected bidder design foundation. Static, simulated, not part of the Next.js app |
| `docs/BIDDER_FOUNDATION_HANDOFF.md` | Observed state, requested next pass, open decisions, and verification for the bidder foundation |
| `docs/STAGING_CONNECTIVITY.md` | Provider identities, connection procedure, and deployment evidence boundaries |
| `tasks/` | Generic contract and review templates; no frozen product contract yet |

A read-only browser inspection on 2026-10-02 observed “Database connected” at `staging.bidzizi.com`. The deployed Git revision, current Neon branch/schema, and Git deployment wiring were not independently verified during that inspection. Service metadata and retained operational evidence belong in [staging connectivity](docs/STAGING_CONNECTIVITY.md); homepage health alone is not deployment provenance or auction acceptance.

## Bidder-first discovery

Explore this proposed journey in a small interactive mobile prototype:

**QR/event entry → open-lot browsing → lot detail → identity at the bid boundary → review and submit → authoritative bid standing.**

Public browsing and asking for identity at the first bid are proposals, not established access rules. Phone-based identity versus invitation-based admission remains undecided. Currency, opening amounts, increments, competing-bid ordering, retries, and lot closing also need agreement before a bidding contract is frozen.

Use labeled fixtures to discover the experience. Inspect it on phone and desktop, including browser back, reload, keyboard/focus behavior, pending submission, outbid/stale standing, interruption, connection loss, and closed lots. Agree on the visual and interaction direction before binding the interface to durable state. A cached or offline view must never imply that a new bid was accepted.

The proposed first operational slice is two identified, admitted test bidders on one seeded open lot: a valid bid persists in PostgreSQL, reload restores correct standing, and competing, stale, retried, and closed-lot requests have agreed, truthful outcomes. This is a candidate scope, not an existing feature or frozen contract. Prepare runtime and isolated test-storage preflight, then freeze independent evidence before implementation. Keep release acceptance separate from local completion.

[The existing discovery draft](docs/PRODUCT_SLICE_001_DISCOVERY.md) proposes a different, staff-first draft-event outcome. It remains a provisional draft, not an accepted decision or authority for the current bidder-first direction. Reconcile it before freezing a product contract.

## Bidder design foundation (prototype A, Lanyard)

On 2026-10-02 the user selected prototype A as the canonical bidder foundation, valuing its design language, page layouts, onboarding, and bidding interactions. It lives in [`prototypes/lanyard`](prototypes/lanyard) and was promoted unchanged. This records a visual and interaction decision, not a product contract or an accepted set of rules. See [the handoff](docs/BIDDER_FOUNDATION_HANDOFF.md) and [design notes](prototypes/lanyard/DESIGN_NOTES.md).

It is static HTML, CSS, and ES modules with no build step or dependencies, independent of the Next.js app. **Everything behind it is simulated**: the server, identity (any phone number, any six digits), the clock, rival bidders, and connection state live in the browser's localStorage. None of it is operational truth, and its open rules are marked A1–A23 rather than decided.

```bash
cd prototypes/lanyard
PORT=4321 node serve.mjs            # http://127.0.0.1:4321 (loopback only)
node evidence/walk.mjs              # journey checks; writes ~40 screenshots to evidence/shots (gitignored)
node evidence/webkit-smoke.mjs      # core journey in WebKit
node evidence/walk-foundation.mjs   # second-pass checks (Member ID, watching, search, event screens, maximum)
node evidence/webkit-foundation.mjs # second-pass checks in WebKit
```

Run the evidence scripts after `pnpm install --frozen-lockfile` on Node 24; they import Playwright from the repository's `node_modules` and take `URL=` to target another port. These are prototype regression checks, not contract evidence for `verify.py`.

Provenance: branch `bidder-foundation-a`, exact-source checkpoint tag `bidder-foundation-a-checkpoint` (commit `04548fc`), promoted from the untracked `prototypes/lanyard` in the main checkout at `/Users/jryear/code/bidzizi`, where a preview was served on port 4321. The branch is local: not pushed, not merged, not deployed.

## Local development

Use **Node.js 24** (`.nvmrc`) and **pnpm 12.4.2** (`package.json`). Select Node 24 in your shell before running commands; do not assume the default `node` matches `.nvmrc`.

Configure `.env.local` with authorized development credentials using the connection procedure in [staging connectivity](docs/STAGING_CONNECTIVITY.md). The app requires `DATABASE_URL`: a pooled Neon PostgreSQL URL with a supported TLS mode. The server validates the Neon pooled endpoint and enforces certificate verification. Never commit environment files or `.vercel/`, expose credentials to the client, or reuse a shared staging database for destructive test setup.

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

The actual scripts are:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Next.js development server |
| `pnpm typecheck` | Run TypeScript without emitting application code |
| `pnpm build` | Create a production Next.js build |
| `pnpm start` | Serve an existing production build |

There is no `test` script yet. Build and type checks do not establish bidder behavior, provider identity, or release acceptance.

## Contracted implementation

Discovery precedes a frozen contract. Commit the task TOML and all declared executable evidence to a trusted base before implementation; generic template examples are not BidZizi acceptance criteria. See [AGENTS.md](AGENTS.md) for repository guardrails.

The external trust anchor is `~/code/_kernel/verify.py`, currently version 3.0.0. Use `python3` (Python 3.11 or later). Supply the trusted base through the CLI or trusted execution environment, never through candidate-controlled TOML. Set `FROZEN_BASE_SHA` to the committed contract-and-evidence revision and replace `<task>` with the actual frozen task name:

```bash
python3 ~/code/_kernel/verify.py --version
python3 ~/code/_kernel/verify.py tasks/<task>.toml --repo . --base "$FROZEN_BASE_SHA" --baseline
python3 ~/code/_kernel/verify.py tasks/<task>.toml --repo . --base "$FROZEN_BASE_SHA" --claim "<completion claim>" --implementer-model "<actual model/runtime>"
```

Acceptance must be RED on base and GREEN on candidate; regressions must pass on both, and adversarial checks on candidate. Each tree needs explicitly isolated disposable test storage: `VERIFY_TREE` and `VERIFY_ROOT` do not isolate databases or environment variables. Harness/infrastructure failures must exit 99, not count as ordinary RED. A supported verdict proves the frozen evidence, while UI judgment, connected-service checks, and release evidence remain separate requirements for their respective claims.
