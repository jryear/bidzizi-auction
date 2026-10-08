# PUBLICATION008 · Explicit immutable additive catalog publication (008)

**Status: DRAFT_UNFROZEN. Execution paused for owner review.**

Readiness: `BLOCKED_OWNER_DECISION`. Deliverable: `D1`. Frozen base: **none for this draft**. Referenced014 first packet remains separate where stated.

## Bounded user-visible outcome

After initial approval, staff save new private items and explicitly publish a selected saved subset as a new catalog version; attendees see the additions while all earlier schedules, bids and receipts retain their meaning.

## Exclusions

- No save/copy auto-publication; no replacing/removing/renumbering/rescheduling published lots.
- No new post-approval windows or timeline extensions; no changes to old frozen contracts/migrations.

## Dependencies and delivery seam

- Required accepted predecessor: [TIMING007](timing007.md).
- Reuse released375 product bytes and accepted private evidence; the older application in this documentation checkout is not an implementation base.
- Parent sequences cross-deliverable/shared-file handoffs. A dependency means an accepted interface at freeze, not another owner’s unsupported local completion.

## Decisions and freeze blockers

- Exact initial approval cutoff and eligible active additions/default/custom window bounds; do not revive selected-derived cutoffs or invent closed/past-lot eligibility.
- All new executable acceptance/adversarial evidence, exact baseline bindings and independent contract review remain future work. No product owner/implementer is started by this document.

## Implementation expectations after authorization

- Rebind existing008 preparation to the accepted007 timing/target interface and resolved publication bounds; expectedRevision/catalogVersion/requestId and schema details remain proposals until freeze.
- Serialize event/revision and recheck current authority after waits. Atomically append selected saved private items, immutable origin/subset and recoverable response.
- Original approval GET/replay remains byte-stable; stable release+lot bid/standing/receipt keys survive appends. Preserve existing FK and physical approved rows; do not replace approval with latest version.
- Update staff private/published lists, A browsing and010 read consumers coherently; categories/windows provide simple views without new batch abstractions.

## Verification and evidence expectations

- Prove Save without publish remains invisible; explicit append adds only chosen items once; lost response replay/version conflicts preserve durable state.
- Independent before/after full SQL establishes unchanged original snapshot/order/numbers/schedules/bids/standing/receipts; duplicate/foreign/vacated IDs and unauthorized/stale/expired writes reject.
- Real competing bid and original receipt lookup still work after multiple appends; native private-pool/publish/recovery/browse paths are observed.
- Keep server authority, integer amount precision, immutable provenance/receipts, current post-wait authorization and recovery guarantees. Infrastructure/setup failures are99; finite behavioral RED is1. Never use shared staging for baseline fixtures.
- Bind contract/evidence to trusted committed base before implementation and exact candidate before final verification; independent review must inspect actual changed source, evidence and rendered journey. Do not run these steps during this checkpoint.

## Acceptance and promotion criteria

- Bounds and accepted007 seam are bound, contract independently reviewed and finite absent-feature baseline RED/negative controls established later.
- Demonstrate initial catalog→real bid→save addition privately→publish selected subset→new browse with original bid/receipt unchanged; independent exact candidate evidence and owner render acceptance.
- Local GREEN means ready to integrate. After independent and owner acceptance, the deliverable owner continues through public-safe integration, agreed synthetic staging and exact hosted journey evidence under the existing delivery requirement. The present owner pause must first be explicitly lifted; broader audience/credentials require specific authorization.

## Reviewed successor and historical preservation

- Reviewed008 successor must explicitly replace one-approval/no-additions absence expectations for the new version while retaining legacy root/subset GET and immutability. Earlier selected-derived cutoff is superseded preparation, never frozen authority.

## Exact scoped reading for the future slice delegator

Read this contract and [DELIVERY.md](DELIVERY.md), then only the sources below. [SOURCES.json](SOURCES.json) gives exact paths/hashes; these source files are read-only. The map is an index, not mandatory implementer context. The delegator passes narrower role-specific files/sections to each implementer; dependency contracts are read at the seam, not an instruction to preload every slice.

- `AGENTS`: [AGENTS.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/AGENTS.md>) — Current navigation and durable guardrails; do not execute historical command examples.
- `RELEASE`: [FINAL_RELEASE_HANDOFF.json](</Users/jryear/Documents/Codex/2026-10-07/task-11/evidence/FINAL_RELEASE_HANDOFF.json>) — Release identity, acceptedSource and hosted evidence limits.
- `DELIVERY`: [CHECKPOINT_DELIVERY_REQUIREMENT.json](</Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/CHECKPOINT_DELIVERY_REQUIREMENT.json>) — CompletionRequirements and workflow only; current pause remains authoritative.
- `TIMELINE`: [OWNER_EVENT_TIMELINE_CORRECTION.json](</Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/OWNER_EVENT_TIMELINE_CORRECTION.json>) — PendingOwnerChoices and independent event timeline.
- `008_PREP`: [CONTRACT_OUTLINE.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/publication-008-preparation/CONTRACT_OUTLINE.md>) — Additive identity, atomic publication and original-subset preservation.
- `008_DELTA`: [OWNER_EVENT_TIMELINE_DELTA.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/publication-008-preparation/OWNER_EVENT_TIMELINE_DELTA.md>) — Entire latest timing addendum.
- `007_DELTA`: [IMPACTED_CONTRACT_DELTA.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/windows-007-v3-preparation/IMPACTED_CONTRACT_DELTA.md>) — Actual intended default/custom target seam and preserved guarantees.
- `CATALOG`: [catalog.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/catalog.ts>) — Unique approval/read-all original receipt behavior.
- `STAFF`: [staff.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/staff.ts>) — Private saves and approved-row preservation.
- `BIDS`: [manual-bids.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/manual-bids.ts>) — Release/lot FK and replay identity.
- `BOARD`: [authorized-read-view.tsx](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/features/staging-display-results/authorized-read-view.tsx>) — Approved catalog and standing projections.
