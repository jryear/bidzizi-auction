# ADMISSION · Staff-controlled fresh-event entry and sharing

**Status: DRAFT_UNFROZEN. Execution paused for owner review.**

Readiness: `BLOCKED_EVIDENCE`. Deliverable: `D1`. Frozen base: **none for this draft**. Referenced014 first packet remains separate where stated.

## Bounded user-visible outcome

Authorized Saturn staff enable synthetic attendee entry for a newly created event and share its actual event link/QR; a new attendee follows it into the already shipped distinct private signup and bidding journey.

## Exclusions

- No reimplementation of009, production Member ID verification, SMS, real-business authority, shared bidder session, or broad bidder-management console.
- No silent grant/recovery changes when toggling enrollment availability.

## Dependencies and delivery seam

- Reuse released375 product bytes and accepted private evidence; the older application in this documentation checkout is not an implementation base.
- Parent sequences cross-deliverable/shared-file handoffs. A dependency means an accepted interface at freeze, not another owner’s unsupported local completion.

## Decisions and freeze blockers

- Review precise enable/disable behavior; disabled-default new entry, existing private session/recovery, and grant revocation are separate authority states.
- All new executable acceptance/adversarial evidence, exact baseline bindings and independent contract review remain future work. No product owner/implementer is started by this document.

## Implementation expectations after authorization

- Connect scoped staff control to existing operator-owned bz_demo_event_entries with explicit current staff/org authority and exact idempotency/revision semantics.
- Freeze enable/disable/new-enrollment and existing private recovery behavior using009 as authority. If desired behavior changes009 denial/acknowledge semantics, declare a reviewed successor rather than patching frozen evidence.
- Share link/QR identifies only the event; private bootstrap/session cookies and secrets never enter QR or URL. Setup checklist uses actual availability state, not a seed-only success.
- A fresh unseeded event must complete the staff→attendee transition without operator SQL intervention; configured hosted synthetic boundary remains enforced.

## Verification and evidence expectations

- Staff creates event, saves/approves under the accepted timing rules, enables entry, copies/scans event QR and signs up two distinct synthetic accounts.
- Same names/Member IDs cannot merge identities; forbidden/foreign staff, disable races, session expiry, retry/lost enable response and bootstrap recovery keep precise authority.
- Confirm browser/cookie/account isolation, refresh/logout and all009 behavior using actual server/SQL then required hosted checks later.
- Keep server authority, integer amount precision, immutable provenance/receipts, current post-wait authorization and recovery guarantees. Infrastructure/setup failures are99; finite behavioral RED is1. Never use shared staging for baseline fixtures.
- Bind contract/evidence to trusted committed base before implementation and exact candidate before final verification; independent review must inspect actual changed source, evidence and rendered journey. Do not run these steps during this checkpoint.

## Acceptance and promotion criteria

- Independent API/SQL/native evidence proves a truly new staff event reaches009 entry; owner reviews the simple enable/share/denied journey.
- Exact009 source remains reused or formally succeeded; no fixture provisioning alone can satisfy fresh-event admission acceptance.
- Local GREEN means ready to integrate. After independent and owner acceptance, the deliverable owner continues through public-safe integration, agreed synthetic staging and exact hosted journey evidence under the existing delivery requirement. The present owner pause must first be explicitly lifted; broader audience/credentials require specific authorization.

## Reviewed successor and historical preservation

- 009 is shipped. New control is a bounded successor only where operator-entry availability or frozen absence assumptions change. Retain distinct actor/business/session allocation and current-authority recovery; no broad identity redesign.

## Exact scoped reading for the future slice delegator

Read this contract and [DELIVERY.md](DELIVERY.md), then only the sources below. [SOURCES.json](SOURCES.json) gives exact paths/hashes; these source files are read-only. The map is an index, not mandatory implementer context. The delegator passes narrower role-specific files/sections to each implementer; dependency contracts are read at the seam, not an instruction to preload every slice.

- `AGENTS`: [AGENTS.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/AGENTS.md>) — Current navigation and durable guardrails; do not execute historical command examples.
- `RELEASE`: [FINAL_RELEASE_HANDOFF.json](</Users/jryear/Documents/Codex/2026-10-07/task-11/evidence/FINAL_RELEASE_HANDOFF.json>) — Release identity, acceptedSource and hosted evidence limits.
- `DELIVERY`: [CHECKPOINT_DELIVERY_REQUIREMENT.json](</Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/CHECKPOINT_DELIVERY_REQUIREMENT.json>) — CompletionRequirements and workflow only; current pause remains authoritative.
- `VISION`: [BIDZIZI_PRODUCT_VISION.md](</Users/jryear/Documents/Codex/2026-10-07/task-2/product-vision/BIDZIZI_PRODUCT_VISION.md>) — Attendee and bidding journey; staging/demo scope.
- `WORKSPACE`: [README.md](</Users/jryear/code/bidzizi-event-studio-workspace/prototypes/event-studio/README.md>) — Step9 shared-event QR presentation/printing only; loopback sharing is simulated and grants no identity or admission.
- `STAFF`: [staff.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/staff.ts>) — CreateEvent and existing staff org grant.
- `AUTH`: [auth.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/auth.ts>) — Staff and event VIEW/BID/business authority.
- `ENTRY`: [demo-entry.ts](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/server/demo-entry.ts>) — Availability/bootstrap/enroll/acknowledge.
- `ENTRY_SQL`: [009_demo_attendee_entry.sql](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/migrations/009_demo_attendee_entry.sql>) — Operator entry enable state, distinct identities and recovery.
- `ENTRY_VIEW`: [event-access.tsx](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/src/app/events/[id]/event-access.tsx>) — Shared-event/private wrapper behavior.
- `009`: [staging-demo-attendee-entry-009-v2.toml](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/tasks/staging-demo-attendee-entry-009-v2.toml>) — Entire bounded shipped contract.
- `INTEGRATED`: [CONTRACT.md](</Users/jryear/Documents/Codex/2026-10-06/task-3/saturn-connected-review/tests/acceptance/staging-connected-review-v2/CONTRACT.md>) — 009 shared-wrapper/runtime closure.
