# Staff auction rehearsal — proposed contract seam

**Status: REVIEW BLOCKED.** This is an implementation contract draft, not a frozen
Kernel task or permission to edit product code. Source parent:
`591686a4ecb38f64e29fcdf81f99d170d25872f5`. The approved owner decisions
are in `docs/plans/STAFF_AUCTION_REHEARSAL_DECISIONS_2026-10-08.md`.
The concrete versioned API and DTO proposal is in `INTERFACE.md`.

## One initial-publication interface

The staff create/save path retains private draft revision and event/lot identities.
Initial publication takes the saved revision, a nonempty selected saved-lot roster,
and a stable request UUID. It creates exactly one immutable event publication and
an owned recoverable receipt in one transaction. The snapshot binds lot order and
numbers, opening amounts, immutable same-event image references, effective event
tiers and per-lot fixed overrides, denomination `SATURN_TRADE_DOLLAR_SYNTHETIC_V1`,
scale 100, inclusive cap 1,000,000,000 minor units, IANA timezone, and resolved UTC
opening/closing instants. Both instants are explicit; local ambiguous/nonexistent
times reject and the end must follow the start. No additive publish, reschedule,
roster edit or mutable published term exists in this tranche. Exact replay returns
the original receipt under current staff authority; changed payload conflicts.

The same publication identity is the source of truth for staff published preview,
admitted attendee pre-open browse, image read authorization, lot standing and bid
receipts. `scheduled` means published and browseable with bids disabled; `open`
means database time in `[opensAt, closesAt)`; `closed` retains readable standing.
Entry enabled/disabled controls new enrollment independently of phase. Existing
session, VIEW, BID and receipt authority remains scoped by its current rules.
Assets may be uploaded and referenced in saved drafts before publication. Immutable
asset bytes are event scoped; publication freezes references, while abandoned
successful uploads remain counted. This interface removes the Assets/Timing/
Increments initial-publication cycle without implementing future additive 008.

The bounded asset implementation decodes one-frame JPEG/PNG/WebP raw input of at
most 2 MiB, 4096 pixels per side and 8 million pixels total, strips metadata,
and stores only normalized WebP of at most 1600 pixels per side and 1 MiB.
The application allows one decoder per process, a ten-second body deadline and
five-second processing timeout. Quotas are 256 assets/event, 1024/organization
and 256 MiB normalized bytes/organization; exact successful retry adds no quota.
Images stay private, no-store and authorized by actor/event/context. Only the
six owner-approved Entry/Asset function EXECUTEs are proposed for the existing
staging runtime; no direct table grant, public bucket, anonymous read, new role
or credential is within scope. Connected installation remains a separate decision.

## Bid and presentation rules

All new amounts are integer minor units. No accepted bid: minimum is the saved
opening amount. With a current accepted bid, the event raise is 2,500 below
50,000, 5,000 from 50,000 to below 100,000, 10,000 from 100,000 to below
250,000, and 25,000 at or above 250,000 minor units. A positive fixed lot raise
overrides the event tier. Minimum is current highest plus raise; any submitted
amount from minimum through cap is eligible. An exact stale amount is rejected
with current standing, never raised by the server. Historical `staging-usd-manual-v1`
USD receipts and standing keep their original semantics and bytes. New responses
carry the distinct ruleset and synthetic denomination token and readable disclosure
that no payment or settlement occurs.

Each bid decision serializes by lot, checks current person/business/VIEW/BID/session
authority after waits, and uses database time after the last lock wait. A queued
request that reaches decision at/after close rejects; exact replay of an already
committed request retains its original receipt under current authority. Polling
updates current standing, phase and review safety controls in place while preserving
matching active edit nodes, focus, value and caret. Closed no-bid lots also remain
readable. Final standing does not imply an award.

## Required evidence before freeze

The eventual schema-2 task must execute against the actual Kernel 3.1.0 base and
candidate. It must use disposable synthetic PostgreSQL and one owned app runtime;
all assertions, helpers, migrations, fixtures, lock controls, setup, cleanup,
direct dependency versions and source bindings belong to the committed chain.
Infrastructure failure exits 99 without an ordinary finite RED receipt. Candidate
journey checks must select the actual new candidate, including inherited checks;
fixed historical `e0cef66` is insufficient.

Groups: fresh staff create/upload/save/native preview/publish/Entry share with
decoded QR; two private 390px attendee contexts browsing before opening and
bidding/outbid/rebid; all first-bid/tier boundary/override/cap/stale cases;
concurrent requests and lost responses across reload/cutoff; queued publish and
bid decisions across opening/closing; enable/disable/re-enable and 009 ACK;
JPEG/PNG/WebP decode, spoofing, dimensions, frame/byte/deadline limits, quota
replay, event/organization isolation and private reads; MOBILE014 native polling
while typing and changed authority/phase/structure; no-bid and bid closed standing;
historical USD receipt preservation. Evidence needs independent API, SQL, browser,
pixel/QR, current authority and negative-control observations rather than product
author assertions alone. Build/typecheck and independent source/render review are
additional gates.

**Freeze blocker:** initial publication must *commit* strictly before `opensAt`.
The ordinary transaction function and pre-commit clock checks cannot prove this.
See `COMMIT_BOUNDARY_REVIEW.md`. No implementation or BASELINE_READY is authorized
until independent review accepts a feasible mechanism satisfying the exact owner
requirement, or the owner explicitly changes that requirement.

Prepared but unfrozen Assets and Timing packets remain at
`/Users/jryear/Documents/Codex/2026-10-07/task-18/integration/` under
`docs/proposed/staff-assets`, `docs/proposed/staff-timing`, their matching
`tests/acceptance/staging-staff-*` directories and `tasks/staging-staff-assets.toml`
and `tasks/staging-staff-timing-007-successor.toml`. They were prepared against
older source/visibility semantics, apply 003/009 without Entry015, and cannot be
frozen unchanged. This draft does not copy or rewrite their historical evidence.
