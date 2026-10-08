# Proposed v2 persistence, dispatch and authority binding

**Review draft; no product implementation.** This binds the interface to the
accepted 001/002/003/009/015 schema and proposed Assets016. The owner has amended the publication cutoff to the final database-time
authorization decision after waits and current-authority checks. This document
is still unfrozen and requires independent executable review.

## Version dispatch and immutable rows

New rehearsal creation uses `/api/v2/admin/events` and persists a version-2
marker in the event draft. v2 admin Save/approval and bidder/catalog routes
require that marker and the new ruleset; v1 admin mutation and bid routes reject
a v2 target with a neutral `UNSUPPORTED_RULESET`/`UNSUPPORTED_EVENT_VERSION`
conflict before writes. v2 routes reject v1 targets. A legacy v1 event and its
approval, USD standing, bids and receipts retain original bytes and policy.
Shared Entry and image routes select current event identity/context server-side
and cannot choose a version by a browser parameter. No alias may update a v2
event after publication or bypass scoped asset reads.

For v2, the existing `bz_events` draft and `bz_lots` rows store the saved event
timing/rules and each lot's positive optional `fixedRaiseMinor`. The initial
`bz_catalog_approvals.event_snapshot` contains the immutable version marker,
complete local timing, resolved UTC instants, exact tier array, denomination,
scale and inclusive cap. Its existing UTC `opens_at/closes_at` columns are the
indexed phase source. `local_date/local_start` retain the start endpoint and
`local_end` the end time; the distinct end date remains in the immutable JSON.
The selected `bz_catalog_lots.snapshot` rows bind lot content/order, opening,
effective fixed override and immutable photo refs. The approval ID remains the
stable release ID. Existing FK and historical v1 rows are preserved. No timing
schema migration is needed by this proposal; Assets016 supplies only its scoped
immutable asset storage/functions.

The v2 request ledger uses separate operation namespaces
`save-draft-v2:<eventId>` and `catalog-approval-v2:<eventId>` with actor,
request UUID and a canonical payload hash over the exact allowed fields.
Canonicalization sorts object keys, preserves array order and integer minor
units, and excludes no term affecting the result. Same actor/key/body returns
the original status and immutable body under current authority. Changed body
with the same key is `IDEMPOTENCY_CONFLICT`; a new stale expected revision is
`REVISION_CONFLICT`. Publication writes one header, selected lot rows and one
owned receipt atomically. A rolled-back attempt leaves none. A missing or
uncertain response triggers owned GET/retry of the original request, never a
fabricated success or a new request UUID.

The new standing row uses existing 003 columns: `ruleset_id` is
`saturn-trade-tiered-v1`, `currency` is the distinct synthetic denomination
token, `amount_cap_minor` is 1,000,000,000, and `increment_minor` stores the
effective **next raise** under the frozen policy after the current highest bid
(or the initial applicable tier/override before a bid). It is not a claim that
one fixed raise governs the event. Each accepted bid atomically updates that
next raise and current standing while adding its immutable bid and receipt.
No read initializes standing; a no-bid projection derives opening and phase
from the immutable publication. Historical v1 `increment_minor=2500` retains
its original fixed-step meaning. Any future schema refinement requires a
separate reviewed additive migration and grant delta.

## Authority and lock order

Staff Create/Save/approval: authenticate current test session/person, current
same-org staff grant, then take the event UPDATE lock. Recheck the event/org,
session expiry, person and staff grant after blocking waits and before returning
an old receipt. Validate saved asset ownership via the nonlocking predicate
while holding the caller's authority/event locks; never reacquire an earlier
authority lock after an asset/event lock. Save/approval request serialization
follows event locking. Publication validates all selected saved rows and
snapshot content before writes; current authority and database time are
checked again after all waits. The final publication authorization predicate uses `clock_timestamp()` after
all relevant waits and current-authority checks and requires time strictly
before `opensAt`. The existing `bz_catalog_approvals.approved_at` stores that
same final database clock sample, explicitly supplied rather than a later
default; it is evidence of the decision, not of physical COMMIT time. A fresh
decision at/after opening rejects. The approval,
selected immutable snapshots and receipt commit atomically; a pre-opening
authorized transaction may commit or respond later. An exact committed receipt
is recoverable after opening under current authority. No margin is implied.

Attendee: a current same-event VIEW grant authorizes only the published roster
and its referenced assets, even before opening. Entry enablement controls new
009 begin/enroll/ACK; it does not revoke already held session, VIEW, BID or
receipt authority. BID additionally requires current independent business,
network membership, BID admission and an eligible published lot. The actor
request advisory lock precedes the lot standing lock; current session/authority
and `clock_timestamp()` are rechecked after the final lock wait. An exact
already committed actor-owned receipt is returned under current authority
even after close. A fresh decision at/after `closesAt` durably rejects; a
pre-close queued request does not inherit its earlier time. For an open lot,
the highest accepted amount selects the tier (or frozen lot override), then
the server compares the exact submitted integer to the computed minimum and
cap. A previously entered amount **below** the new minimum rejects without
adjustment; one still at or above the new minimum remains eligible.

Responses and asset bytes remain private/no-store with neutral denial; no
provider error, session hash, original upload or secret appears in public
JSON, URLs, images or logs. Only existing staging identities and the six
owner-approved proposed EXECUTEs are in the connected delta. Local disposable
tests can prepare additional application code, but connected installation and
staging deployment need Zack's separate release decision.
