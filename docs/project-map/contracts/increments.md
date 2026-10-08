# INCREMENTS · Configurable current-highest-bid increment tiers

**Status: DRAFT_UNFROZEN. Execution paused for owner review.**

Readiness: `BLOCKED_OWNER_DECISION`. Deliverable: `D1`. Frozen base: **none for this draft**. Referenced014 first packet remains separate where stated.

## Bounded user-visible outcome

Staff configure the agreed event tier rules; bidders see the actual next minimum and can review/submit an amount under the same authoritative saved rule.

## Exclusions

- No universal$25 rule, auto-bidding, fixed/percentage mode picker, payment conversion or speculative threshold defaults.
- No editing a locked published rule unless separately selected.

## Dependencies and delivery seam

- Required accepted predecessor: [TIMING007](timing007.md).
- Reuse released375 product bytes and accepted private evidence; the older application in this documentation checkout is not an implementation base.
- Parent sequences cross-deliverable/shared-file handoffs. A dependency means an accepted interface at freeze, not another owner’s unsupported local completion.

## Decisions and freeze blockers

- Exact tier thresholds/inclusive boundaries, amount constraints, any fixed lot override and publication/rule lock.
- All new executable acceptance/adversarial evidence, exact baseline bindings and independent contract review remain future work. No product owner/implementer is started by this document.

## Implementation expectations after authorization

- Bind exact minor-unit scale, amount range, thresholds/inclusive boundaries, optional lot override and lock point with owner source. Use current highest bid to select tier.
- Version/freeze the rule snapshot and expose an allowlisted rule/next-minimum DTO; event increment input alone cannot claim bidding configurability.
- Preserve old synthetic USD ruleset/receipts and stable bid targets; display Saturn trade dollars for the newly agreed product policy with one event disclosure, without silently relabeling historical USD data.
- Rebind A and010 numeric validators deliberately; same backend rules determine review and acceptance after waits/concurrency.

## Verification and evidence expectations

- Boundary tests around every tier and amount range use server standing, including no-bid opening, concurrent competing bids, stale reviewed amount, overflow and unauthorized updates.
- Exact old receipts/rules stay recoverable; new tier rule displays match API/SQL and next minimum; rule lock and changed-body retries have independent negative controls.
- Keep server authority, integer amount precision, immutable provenance/receipts, current post-wait authorization and recovery guarantees. Infrastructure/setup failures are99; finite behavioral RED is1. Never use shared staging for baseline fixtures.
- Bind contract/evidence to trusted committed base before implementation and exact candidate before final verification; independent review must inspect actual changed source, evidence and rendered journey. Do not run these steps during this checkpoint.

## Acceptance and promotion criteria

- Owner approves exact rule table/overrides/lock and reviews setup/review copy; independent contract and source evidence support every boundary.
- Real two-actor bid→tier transition→next minimum→review→durable receipt demonstrates the configured policy, with truthful stale/recovery states.
- Local GREEN means ready to integrate. After independent and owner acceptance, the deliverable owner continues through public-safe integration, agreed synthetic staging and exact hosted journey evidence under the existing delivery requirement. The present owner pause must first be explicitly lifted; broader audience/credentials require specific authorization.

## Reviewed successor and historical preservation

- Freeze reviewed ruleset and board/parser successors; preserve003/010 historical fixed2500/USD packet. Existing old-fixture tests are not evidence for the new rule.

## Exact scoped reading for the future slice delegator

Read this contract and [DELIVERY.md](DELIVERY.md), then only the sources below. [SOURCES.json](SOURCES.json) gives exact paths/hashes; these source files are read-only. The map is an index, not mandatory implementer context. The delegator passes narrower role-specific files/sections to each implementer; dependency contracts are read at the seam, not an instruction to preload every slice.

- `AGENTS`: [AGENTS.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/AGENTS.md>) — Current navigation and durable guardrails; do not execute historical command examples.
- `RELEASE`: [FINAL_RELEASE_HANDOFF.json](</Users/jryear/Documents/Codex/2026-10-07/task-11/evidence/FINAL_RELEASE_HANDOFF.json>) — Release identity, acceptedSource and hosted evidence limits.
- `DELIVERY`: [CHECKPOINT_DELIVERY_REQUIREMENT.json](</Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/CHECKPOINT_DELIVERY_REQUIREMENT.json>) — CompletionRequirements and workflow only; current pause remains authoritative.
- `VISION`: [BIDZIZI_PRODUCT_VISION.md](</Users/jryear/Documents/Codex/2026-10-07/task-2/product-vision/BIDZIZI_PRODUCT_VISION.md>) — Auction preparation: increment direction; dollar explanation.
- `DRAFT`: [draft.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/draft.ts>) — Current increment metadata.
- `BIDS`: [manual-bids.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/manual-bids.ts>) — RULESET/INCREMENT/supported/standing/bid/replay behavior.
- `A_BIDDING`: [bidding.js](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/public/staging-catalog/bidding.js>) — Context, minimum, review and recovery.
- `BOARD_MODEL`: [read-model.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/features/staging-display-results/read-model.ts>) — Ruleset/currency validation.
- `006C_MAP`: [ASSERTION_REQUIREMENT_MAP.json](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/tests/acceptance/staging-ui-refinement/ASSERTION_REQUIREMENT_MAP.json>) — Native amount/review/focus/recovery guarantees.
