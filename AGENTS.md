# Repository Operating Notes

## Product and context

BidZizi is a rebuild for company-hosted auctions. The current priority is a native-feeling mobile bidder experience; the repository currently implements only a Next.js staging page and a live, read-only Neon connectivity check. Authentication, auction data, bidding, and PWA behavior do not exist yet.

- [README.md](README.md): current scaffold, run commands, bidder-first discovery, and contract workflow.
- [Staging connectivity](docs/STAGING_CONNECTIVITY.md): mutable provider identities, connection procedure, and operational evidence.
- [Existing discovery draft](docs/PRODUCT_SLICE_001_DISCOVERY.md): provisional staff-first draft-event proposal, not an accepted direction. Preserve inherited work and reconcile it with the current bidder-first priority before freezing a contract.

Public browsing, identity at first bid, phone versus invitation admission, and auction semantics remain proposals or open decisions. Do not infer bidding authority from successful sign-in or treat a prototype as a settled product rule.

## Durable guardrails

- Keep credentials server-side, outside Git, client bundles, URLs, logs, and public responses. Database errors must not disclose provider details or secrets.
- Preserve live request-time connectivity evidence and verified TLS. The existing database adapter requires a Neon pooled endpoint; do not silently weaken that production restriction to make tests run locally.
- Import no legacy code or database contents without explicit scope. Keep old resources separate.
- When bidding is implemented, derive identity, admission, lot state, and bid standing from server authority. Display acceptance only after durable server confirmation. Pending, stale, offline, or uncertain outcomes must not appear accepted.
- Represent monetary amounts as integers in the agreed minor unit. Currency, scale, increments, ordering, retry semantics, and close behavior must be settled before the contract is frozen; this file does not choose them.
- Honor the requested effect scope. Commits, pushes, provider configuration, migrations, data writes, and deployments are separate actions; a passing check does not authorize them.

## Work style and inspection

Prefer one owner for a complete user outcome through interface, authority, persistence, and recovery. Resolve reversible implementation choices autonomously; surface decisions that change product meaning, security boundaries, durable data contracts, or external commitments.

Inspect the actual repository and rendered product within the authorized scope. For substantial interface work, explore an isolated interactive prototype with clearly labeled fixtures before freezing the operational contract. Inspect phone and desktop behavior, including back/reload, keyboard/focus, pending and failed operations, stale standing, interruption, and terminal states. Tests alone do not settle visual or interaction quality.

Use Node 24 and pnpm 12.4.2. Existing commands are `pnpm dev`, `pnpm typecheck`, `pnpm build`, and `pnpm start`; there is no test script yet. Read context relevant to the task instead of preloading unrelated history.

## Contracted work and evidence

Frozen contracts live in `tasks/`. Commit the contract and its executable acceptance/adversarial evidence, including relied-on helpers and fixtures, to the trusted base before implementation. Preserve the task spec, declared evidence, and protected paths on the candidate. Implementer-owned tests may help development but are not independent completion evidence.

Use the external `~/code/_kernel/verify.py` trust anchor, version 3.0.0, with `python3`. Supply the base through trusted CLI/environment selection, not TOML. With `FROZEN_BASE_SHA` set to the committed contract-and-evidence revision:

```bash
python3 ~/code/_kernel/verify.py tasks/<task>.toml --repo . --base "$FROZEN_BASE_SHA" --baseline
python3 ~/code/_kernel/verify.py tasks/<task>.toml --repo . --base "$FROZEN_BASE_SHA" --claim "<completion claim>" --implementer-model "<actual model/runtime>"
```

Acceptance must be RED on base and GREEN on candidate; regressions pass on both, adversarial checks on candidate. Use independent evidence to challenge the complete outcome; review metadata alone does not prove a review happened.

`VERIFY_TREE` and `VERIFY_ROOT` identify trees, not isolated storage or credentials. Explicitly allocate disposable per-tree test databases/schemas and scoped credentials; never reset or seed shared staging for acceptance. Keep any test adapter bounded while preserving the production Neon/TLS checks. Infrastructure, dependency, setup, and timeout failures must exit 99 rather than masquerade as ordinary RED.

A supported kernel result is evidence for the frozen contract. Keep UI judgment, local checks, connected-provider verification, and release acceptance distinct. Verify the intended deployment revision and real domain/provider behavior before claiming release success; connectivity alone does not prove the bidder journey.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
