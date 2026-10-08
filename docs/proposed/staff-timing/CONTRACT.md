# TIMING007 successor · fresh staff event timing

Status: **PROPOSED_UNFROZEN — executable contract preparation only**. This packet
does not select pending owner policy, freeze a task, change product source,
apply SQL/grants, run application checks, or claim a deployed feature.

Product inspection base: `375d301c345bc47298dd2945a29bf9583c96fbc9`.
Reviewed docs checkpoint: `7ecdcb5f6d4d52b052f40eadc369b98b9cffb333`.
The parent has resumed D1 and released its single app-test slot to the delivery
owner; upstream publication remains held. This author owns no runtime. The
unlanded MOBILE014 private revision is excluded from this preparation.

## First bounded checkpoint

Saturn staff create a fresh event, save its explicit start/end dates, times and
timezone, add complete items that automatically inherit those event hours,
create an optional named group, assign items together, save, reload, and inspect
the actual saved A welcome/list/detail. Categories remain an independent browse
axis. No manual assignment is required to make a default item complete.

After an explicitly selected saved subset is approved/published, current VIEW
attendees can browse that subset before bidding opens. Each item displays and
uses its own immutable effective schedule. DB time and current VIEW/BID/person,
business and organization-network authority decide bids. Publication creates
no admission or BID authority. Entry009, ASSETS and INCREMENTS remain separate
reviewed contracts; this packet consumes their accepted seams only.

There is no post-publication reschedule, new group, event-span extension,
replacement, cancellation, relisting, automatic publication, new provider,
real member data, payment, donation, results policy or public-TV authority.

## Selected meaning and two pending policy bindings

Already selected: independent event timeline; automatic event-default timing;
optional human-readable groups; bulk reassignment; categories separate; common
event timezone; cross-date local endpoints; pre-opening approved browsing;
immutable old snapshots, receipts and bid standing; current server authority.

| Binding | Parent recommendation, not yet owner-selected | Freeze consequence |
| --- | --- | --- |
| `CUSTOM_WINDOW_BOUNDS` | Every custom group lies wholly inside the explicit event timeline, inclusively: event opens ≤ group opens < group closes ≤ event closes. | Pending. Do not implement this branch, allow outside windows, or freeze its tests until the exact answer is bound. |
| `PUBLICATION_ELIGIBILITY` | Initial and additive publication occurs strictly before event close; every selected item's effective close is still strictly future at the final DB decision instant. Already-open items are eligible. | Pending. Do not revive selected-derived event spans, a before-first-open cutoff, or closed/past-item eligibility. |

TIMING007 owns the initial-publication half of that predicate; PUBLICATION008
owns the additive half. Both must bind the same accepted answer. If the owner
allows outside-event windows, the event banner/context must not disable an open
custom item or claim universal closure, and publication bounds need an explicit
revised binding before freeze. This is a policy dependency, not an invitation
to silently choose either branch.

Increment history is separately selected: configurable progressive event tiers
based on current highest bid, optional fixed per-item override, and any entered
amount at least the current minimum rather than exact multiples. Owner examples
25/50/100/250 around 500/1000/2500 are not exact boundary or lock policy. TIMING007
changes no amount calculation, currency, rule ID, override or rule lock. Its
finite timing witnesses may retain the current synthetic fixed-rule fixture;
the final fresh-event journey must bind the accepted INCREMENTS successor.

## Small versioned successor

Use explicit v2 preparation routes/DTOs in [INTERFACES.md](INTERFACES.md). Existing
v1 `windowId:null` remains unassigned; v1 `main` remains the legacy event window.
In v2, `windowId:null` means inherit the event, and a saved UUID selects one named
group. Never reinterpret a stored v1 null without an explicit version boundary.
No automatic legacy adoption/backfill or alteration of the existing Saturn demo
is in this D1 packet. New v2 events are created through native staff UI.

Root selected the existing JSON persistence seam after the narrow least-permission
assessment. New internal version/groups/initial-subset/target timing metadata
uses existing event/approval/lot JSON and existing physical keys. TIMING007
proposes **no migration, new relation, column, function or GRANT**. The earlier
unfrozen relational draft is superseded; it is not accepted permission or frozen
history. [SQL_AND_PERMISSIONS.md](SQL_AND_PERMISSIONS.md) gives the exact internal
representation and its server-transaction trust boundary. Independent review is
still required, and PUBLICATION008's eventual ledger/ACL delta remains separate.

Existing route aliases that can receive a v2 event must dispatch through its
version-aware resolver or reject fresh legacy writes with
`PREPARATION_VERSION_CONFLICT`. They cannot bypass published-content locks or
return v1 audience/bid semantics for a v2 event. A replay of a previously
committed v1 request remains exact under current authority and occurs before a
fresh-version write guard. Historical events and all old frozen contracts,
migrations, helpers, receipts and `_kernel` remain byte-preserved.

Before approval, event fields, groups and all unpublished item content save as
one existing event revision/operation. Adding an item uses default immediately;
copying creates a fresh UUID/number and resets the group to default, retaining
the accepted content allowlist/provider identity. Bulk group changes affect
only the selected items and never edit event hours or category. Invalid/foreign
groups reject atomically. Removing a referenced group is blocked until its
items are explicitly reassigned; no hidden reassignment on deletion.

After initial approval, event timeline, available group set, organization/event
snapshot and published item content are immutable. Staff may save/edit only the
private unpublished pool, assigning default or an already frozen group. Frozen
published `bz_lots` rows remain physically unchanged; the present delete/reinsert
Save behavior requires a declared successor for v2 private saves. Save/copy is
never publication. PUBLICATION008 later appends a selected immutable subset.

## Authority, serialization and ASSETS compatibility

Follow the existing authority-first order. Existing-event staff operations lock current
session/person, then current staff-grant/org rows, then the one event (SHARE read,
UPDATE mutation), then the operation request key. Group JSON is protected by the
event lock; lot reads or writes follow in deterministic UUID/position order.
Approval subsequently locks only its same-event immutable release/reference rows
and inserts its catalog/history rows, including immutable timing metadata.
No selector acquires new authority locks after event/request locks. Bid operations
retain current identity→VIEW→admission→business/network→owned request→standing
ordering; target timing is immutable and requires no event-wide UPDATE lock.

Create is the explicit exception because there is no event row yet: current
session/person and staff-grant/org authority → owned `create-event:v2` request
serialization → INSERT a newly server-generated UUID event. Exact owned create
replay returns its original response after fresh current-authority/expiry checks;
a fresh create rechecks after the request wait before insert and after any later
blocking database work. Create never acquires a different existing-event row
after its request lock. Preserve the shipped v1 create namespace/order/replay.

After every relevant wait, capture fresh `clock_timestamp()` and re-evaluate the
same session's active/test/not-revoked/expiry and required same-event authority
with a non-row-locking query. Recheck immediately before mutation or immutable
owned replay, and after later blocking database work before acknowledgement.
A queued revocation behind held authority locks linearizes later; elapsed expiry
can occur while those locks are held and must reject. Do not claim a revocation
committed during a wait when the lock order actually prevents that commit.

The ASSETS seam is proposed
`bz_staff_asset_validate(text sessionHash, uuid eventId, uuid[] assetIds)`.
Its query is lock-free and is a current predicate, not a reservation. Save and
approval must hold their own authority/event/request locks before invoking it;
they cannot re-enter a locking auth helper inside nested validation. Validate
all refs from the exact complete saved snapshot in the same transaction. After
validation and any later waits, the caller repeats the fresh authority/time
check. Approved ref/alt strings are immutable together. Published asset reads
follow the same VIEW-visible header/item predicate, including pre-opening v2
catalogs; this contract adds no anonymous image access or storage permission.

Each projection uses one captured post-wait DB instant for event phase and every
item phase. A client countdown is presentation only. Reads cannot initialize
standing or create targets. Context lists current eligible businesses and BID
admission independently of event phase; item standing decides whether that
specific item's bid action is enabled. The v1 context remains exact.

## Review and delivery gates

[EVIDENCE_PLAN.md](EVIDENCE_PLAN.md) defines independent API, SQL, native A/Studio,
held-lock and negative-control witnesses. It is a commissioning outline, not
executable evidence or an assertion count. Missing bounded behavior is finite
RED only when its request/render path is reached; setup/transport/timeout/cleanup
failure is 99. Keep terminal interruption and unreached IDs honest.

Before implementation: bind both policy answers and accepted consumer/ASSETS/
INCREMENTS seams; commission a fresh executable contract/evidence author and
independent reviewer; commit their trusted base; establish finite baseline RED,
passing retained regressions and broken negative controls with the external
kernel. Candidate evidence must independently verify complete durable content,
not compare a returned packet to itself. Only the delivery owner starts one
bounded app/PG/browser runtime at a time and tracks cleanup of owned PIDs.

Local GREEN and fresh source/render review mean ready for accepted integration.
The D1 owner then continues to the authorized staging domain after parent releases
publication, and records the exact deployed revision and actual fresh-event
journey screenshots. Neither this packet nor a static hash check establishes
implementation, owner visual approval, permission approval or hosted delivery.
