# STAFF_RESULTS · Scoped staff standings and CSV export

**Status: DRAFT_UNFROZEN. Execution paused for owner review.**

Readiness: `BLOCKED_EVIDENCE`. Deliverable: `D4`. Frozen base: **none for this draft**. Referenced014 first packet remains separate where stated.

## Bounded user-visible outcome

Same-organization staff views actual current/closed event standings and exports an explicit server-authoritative CSV without creating a bidder identity.

## Exclusions

- No implicit staff BID/business authority, fake zero-result preview placeholders, all-person receipt disclosure or winner/settlement claims.
- No replacement of shipped010 private boards or public TV grant.

## Dependencies and delivery seam

- Reuse released375 product bytes and accepted private evidence; the older application in this documentation checkout is not an implementation base.
- Parent sequences cross-deliverable/shared-file handoffs. A dependency means an accepted interface at freeze, not another owner’s unsupported local completion.

## Decisions and freeze blockers

- Bind CSV columns and privacy projection; keep provisional standings distinct from final awards.
- All new executable acceptance/adversarial evidence, exact baseline bindings and independent contract review remain future work. No product owner/implementer is started by this document.

## Implementation expectations after authorization

- Add a purpose-scoped current staff/org results read/export authority path, projected from actual bid/standing data and immutable published lot identities.
- Freeze exact column/projection/as-of semantics and CSV formula escaping; no opening amount or draft current:0 placeholder may substitute for results.
- Show per-row freshness/denial/unavailable/no-accepted-bids; define whether export uses a consistent server snapshot rather than implying atomicity from sequential010 polling.
- Adapt to accepted default/custom timing, additive targets and increment policies when present; release375 can support a bounded provisional staff read/export without waiting for full finalization.

## Verification and evidence expectations

- Actual accepted bids and no-bid lots agree between staff API/SQL/table/CSV; foreign org/staff revoked/expired/no grant requests deny data.
- Changed standing/closure/retry/download and malicious text fields are challenged; numeric values never leak after denial or become silently stale/current.
- Desktop and phone tables show complete amounts and export state; independent reviewer checks column minimization and all data joins.
- Keep server authority, integer amount precision, immutable provenance/receipts, current post-wait authorization and recovery guarantees. Infrastructure/setup failures are99; finite behavioral RED is1. Never use shared staging for baseline fixtures.
- Bind contract/evidence to trusted committed base before implementation and exact candidate before final verification; independent review must inspect actual changed source, evidence and rendered journey. Do not run these steps during this checkpoint.

## Acceptance and promotion criteria

- Reviewed access/CSV contract and finite baseline RED precede implementation; owner reviews real staff read/export journey.
- Exact candidate evidence proves staff-only numeric access without bidder credentials, correct recorded rows and scoped safe CSV. Output remains provisional untilFINALIZATION is accepted.
- Local GREEN means ready to integrate. After independent and owner acceptance, the deliverable owner continues through public-safe integration, agreed synthetic staging and exact hosted journey evidence under the existing delivery requirement. The present owner pause must first be explicitly lifted; broader audience/credentials require specific authorization.

## Reviewed successor and historical preservation

- Shipped010 deliberately denies staff-only numeric standing under bidder API authority. A reviewed new staff-read successor adds purpose-specific access while preserving old bidder denials/VIEW isolation; old010 tests stay byte-stable.

## Exact scoped reading for the future slice delegator

Read this contract and [DELIVERY.md](DELIVERY.md), then only the sources below. [SOURCES.json](SOURCES.json) gives exact paths/hashes; these source files are read-only. The map is an index, not mandatory implementer context. The delegator passes narrower role-specific files/sections to each implementer; dependency contracts are read at the seam, not an instruction to preload every slice.

- `AGENTS`: [AGENTS.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/AGENTS.md>) — Current navigation and durable guardrails; do not execute historical command examples.
- `RELEASE`: [FINAL_RELEASE_HANDOFF.json](</Users/jryear/Documents/Codex/2026-10-07/task-11/evidence/FINAL_RELEASE_HANDOFF.json>) — Release identity, acceptedSource and hosted evidence limits.
- `DELIVERY`: [CHECKPOINT_DELIVERY_REQUIREMENT.json](</Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/CHECKPOINT_DELIVERY_REQUIREMENT.json>) — CompletionRequirements and workflow only; current pause remains authoritative.
- `VISION`: [BIDZIZI_PRODUCT_VISION.md](</Users/jryear/Documents/Codex/2026-10-07/task-2/product-vision/BIDZIZI_PRODUCT_VISION.md>) — Operations and displays/results.
- `010_HANDOFF`: [STAGING_DISPLAY_RESULTS_HANDOFF.md](</Users/jryear/Documents/Codex/2026-10-07/task-6/saturn-display-results/docs/STAGING_DISPLAY_RESULTS_HANDOFF.md>) — Numeric access limits, timestamps and no-result placeholders.
- `010`: [staging-display-results-010.toml](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/tasks/staging-display-results-010.toml>) — Historical bounded board authority.
- `BOARD`: [authorized-read-view.tsx](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/features/staging-display-results/authorized-read-view.tsx>) — Denial/stale/generation behavior to retain.
- `BOARD_MODEL`: [read-model.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/features/staging-display-results/read-model.ts>) — Standing projection and exact amounts.
- `AUTH`: [auth.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/auth.ts>) — Current staff/org grants versus BID authority.
- `BIDS`: [manual-bids.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/manual-bids.ts>) — Actual standings/receipts/keys.
- `STAFF`: [staff.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/staff.ts>) — Draft placeholder results must not be consumed.
