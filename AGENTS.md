# Repository Operating Notes

## Product and context

BidZizi is a rebuild for company-hosted auctions. The current priority is a native-feeling mobile bidder experience. The staging application includes the original read-only Neon connectivity check and a gated synthetic staff-drafts slice: test sessions, server-held organization grants, durable event/lot draft saves, recovery, and an A bidder preview. A separate synthetic catalog slice adds immutable saved approval, explicit event VIEW grants and database-clock scheduled/open/closed catalog reads. Real phone/member admission, operational bidding, payments, and PWA behavior are not implemented. The complete bidder journey remains the isolated simulated prototype (`prototypes/lanyard`). See [the staff handoff](docs/STAGING_STAFF_HANDOFF.md) and [gate receipts](docs/STAGING_GATE_RECEIPTS.txt); deterministic frozen checks decide local completion; model reviews propose cases, and deployed release checks are separate.

- [README.md](README.md): current scaffold, run commands, bidder-first discovery, and contract workflow.
- [Staging connectivity](docs/STAGING_CONNECTIVITY.md): mutable provider identities, connection procedure, and operational evidence.
- [Existing discovery draft](docs/PRODUCT_SLICE_001_DISCOVERY.md): provisional staff-first draft-event proposal, not an accepted direction. Preserve inherited work and reconcile it with the current bidder-first priority before freezing a contract.
- [Bidder foundation handoff](docs/BIDDER_FOUNDATION_HANDOFF.md): the selected simulated prototype (`prototypes/lanyard`), what it does and does not contain, the requested next pass, and open decisions. Read it before bidder-interface work.

Public browsing, identity at first bid, phone versus invitation admission, and auction semantics remain proposals or open decisions. Do not infer bidding authority from successful sign-in or treat a prototype as a settled product rule.

## Durable guardrails

- Keep credentials server-side, outside Git, client bundles, URLs, logs, and public responses. Database errors must not disclose provider details or secrets.
- Preserve live request-time connectivity evidence and verified TLS. The existing database adapter requires a Neon pooled endpoint; do not silently weaken that production restriction to make tests run locally.
- Import no legacy code or database contents without explicit scope. Keep old resources separate.
- When bidding is implemented, derive identity, admission, lot state, and bid standing from server authority. Display acceptance only after durable server confirmation. Pending, stale, offline, or uncertain outcomes must not appear accepted.
- Represent monetary amounts as integers in the agreed minor unit. Currency, scale, increments, ordering, retry semantics, and close behavior must be settled before the contract is frozen; this file does not choose them.
- Honor the requested effect scope. Commits, pushes, provider configuration, migrations, data writes, and deployments are separate actions; a passing check does not authorize them.

## Bidder design foundation

The user selected `prototypes/lanyard` (prototype A) on 2026-10-02 as the canonical bidder foundation. Preserve its design language, page composition, onboarding, and bid interactions. A change to that language needs the user's decision; passing checks do not grant visual acceptance.

- It is simulated. Its server, identity, clock, rivals, and fixtures are browser-local and are never operational truth. Its rules (USD, $25 steps, a 6:00 PM close, retry behavior) are fixtures; the A1–A23 markers list what is undecided. Do not promote any of them into a contract by copying.
- Keep it isolated: no imports into or from `src/`, no production credentials or services, and no edits that bend it to fit the Next.js app. Production code reuses its design deliberately, under a frozen contract.
- Entering a Member ID, business name, or invitation text never authorizes acting for a business. Authority comes from server-held admission, whatever the prototype shows.
- Real auto-bidding is a later contract. Any auto-bid in the prototype is a labeled simulation.

## Admin design prototype

The user approved the first admin Event/Lots prototype and its simplified copy, then requested it on a separate worktree. It lives in `prototypes/admin-studio`; read [the handoff](docs/ADMIN_JOURNEY_HANDOFF.md) before changing it. It is isolated from `src/` and production services, like the A foundation.

BidZizi contains organizations; Saturn is the first example organization and Holiday Trade Show is its event. Staff enter items internally. The organization supplies items; optional event sponsors are separate. Staff select lots together and assign a shared opening/closing window. The audience catalog appears when bidding opens. Organization onboarding, staff authorization, multiple windows, replacement/rescheduling and operational bidding remain future work. The synthetic catalog opens from database time and visible audience pages refresh from server authority; no cron or browser clock grants access. Prototype rules are not a frozen contract.

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
