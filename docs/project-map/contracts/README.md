# Finite Saturn contract inventory

These 13 contracts are draft/unfrozen and execution is paused for owner review.
They package the four existing demonstrable deliverables, a stopped mobile repair
and the connected delivery checkpoint. Existing numeric reservations are reused;
descriptive IDs here create no new migration/task namespace or framework.

[CURRENT](../CURRENT.md) is the coordinator handoff; [the map](../index.html) is a
product index. Future delegators start with their own contract and
[DELIVERY](DELIVERY.md), then only that contract's exact source sections.
[SOURCES](SOURCES.json) records paths/hashes and stale-source limits.
[INVENTORY](INVENTORY.json) is the structured dependency/readiness counterpart.
The [schema](SCHEMA.json) and [static validator](validate.py) check documentation
only; neither is an application gate.

| Slice | Deliverable | Readiness / freeze status | Accepted dependency |
| --- | --- | --- | --- |
| [STUDIO · Coherent Studio composition and saved phone preview](studio.md) | D1 | blocked review; draft/unfrozen | Released foundation |
| [ASSETS · Real item images and integral sponsor assets](assets.md) | D1 | blocked evidence; draft/unfrozen | Released foundation |
| [TIMING007 · Default event timing and named custom groups (007 successor)](timing007.md) | D1 | blocked owner decision; draft/unfrozen | Released foundation |
| [INCREMENTS · Configurable current-highest-bid increment tiers](increments.md) | D1 | blocked owner decision; draft/unfrozen | TIMING007 |
| [PUBLICATION008 · Explicit immutable additive catalog publication (008)](publication008.md) | D1 | blocked owner decision; draft/unfrozen | TIMING007 |
| [ADMISSION · Staff-controlled fresh-event entry and sharing](admission.md) | D1 | blocked evidence; draft/unfrozen | Released foundation |
| [WATCH012 · Personal Watching and durable actor-owned My Bids (012)](watch012.md) | D2 | blocked successor evidence; draft/unfrozen | Released foundation |
| [DONATIONS011 · Record donations and provide staff list/export (011)](donations011.md) | D3 | blocked owner decision; draft/unfrozen | Released foundation |
| [STAFF_RESULTS · Scoped staff standings and CSV export](staff_results.md) | D4 | blocked evidence; draft/unfrozen | Released foundation |
| [DISPLAY_ACCESS · Authorized TV/projector display access](display_access.md) | D4 | blocked owner decision; draft/unfrozen | STAFF_RESULTS |
| [FINALIZATION · Agreed ended outcome and finalization semantics](finalization.md) | D4 | blocked owner decision; draft/unfrozen | STAFF_RESULTS |
| [MOBILE014 · Stable mobile polling and open bid task (014 successor review)](mobile014.md) | CROSS | blocked successor review; draft/unfrozen | Released foundation |
| [CONNECTED_RELEASE · Demonstrable connected Saturn checkpoint and hosted delivery](connected_release.md) | RELEASE | blocked dependencies; draft/unfrozen | STUDIO, ASSETS, TIMING007, INCREMENTS, PUBLICATION008, ADMISSION, WATCH012, DONATIONS011, STAFF_RESULTS, DISPLAY_ACCESS, FINALIZATION, MOBILE014 |

D1: Studio + real assets + default/custom timing007 + increment rules + additive
publication008 + staff-controlled entry. D2: personal watches/owned history012.
D3: recorded donation/staff list-export011. D4: scoped staff results/export,
authorized display access and selected finalization. Mobile014 remains frozen-first
packet with successor review pending; no implementation. Connected delivery is
the complete milestone, while each accepted bounded outcome can land separately.

Semantic dependencies are explicit in the table. Shared A/wrapper edits also need
owned hunk sequencing with 014; WATCH012 is not blocked by007/008 on release 375.
All dependencies refer to accepted interfaces at freeze, not unchecked worker
reports. Every gate, independent candidate review and owner render acceptance
remains future work. Do not change old frozen evidence to make a new feature pass.

The full inventory excludes later universal onboarding/member admission/SMS,
billing/payments/ledger posting, auto-bidding, raffles, alternate increment modes,
modular editor, whole-event duplication/archive and device fleets. Existing private
signup009, boards010 and released013 are reused foundations, not new commissions.
