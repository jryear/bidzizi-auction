# Proposed staging manual-bid003

This is a concrete evidence proposal, not a frozen contract or a completion claim.
No application, provider, commit, push or deployment work is authorized by this
packet. Parent review and independent challenges precede freezing.

An enrolled **Test account** enters the **Staging test** event in A, opens an
approved lot, reviews the amount and server-held business/person attribution,
confirms a manual bid, and sees acceptance only after its durable accepted
receipt. Another admitted business can compete. Reload, a second empty browser,
and independent SQL agree on the current business standing; an earlier person's
receipt stays immutable. Preserve A composition, amount controls, plain copy,
persistent navigation and browsing state. Visual/device judgment is separate.

## Versioned synthetic rules

`staging-usd-manual-v1` is a TEST fixture: USD integer cents, increment2500,
amount cap1000000000. It is supported only when the immutable approved event
snapshot's increment equals2500. A saved approved increment5000 produces
409/UNSUPPORTED_RULESET from standing and new POST, with the exact sealed error
DTO and no privileged receipt/bid/standing mutation; context canBid=false.
Catalog002 continues to show its approved display metadata read-only. This does
not choose a live event's currency, increments or limits.

First minimum is the immutable selected lot's approved opening. Later minimum is
accepted current amount+2500. Any integer at or above minimum within the cap is
valid, including12751 after10000; no grid rule. Fractions, strings/null, negative,
unsafe integers and values above cap are400/VALIDATION. Zero/below-minimum valid
integer amounts receive durable409/BELOW_MINIMUM. If current+2500 exceeds cap,
minimumAmountMinor=null and canBid=false; valid bounded new amounts receive
stable409/AMOUNT_LIMIT. Exactly cap-INCREMENT still permits another business to
bid cap. cap-INCREMENT+1 leaves no permitted next amount.

Leading business has no self-raise action in this test version. A valid direct
new request from that business, including another authorized person, receives a
durable409/UNSUPPORTED_SELF_RAISE and leaves bid/standing unchanged. This names a
version limitation, not a live security prohibition. Existing identical receipt
replay is resolved before new-request domain rules, after current authorization.
Two people per business can separately bid on different lots.

Opening is inclusive, closing exclusive. Lot serialization precedes an actual
DB clock_timestamp() read. Acceptance is defined at post-lock decidedAt while
open; the transaction can finish later. HTTP arrival, transaction start, now()
(which remains transaction-start time), client clock and COMMIT wall time do not
choose that acceptance instant. Bid, accepted receipt and standing update commit
atomically. Typed terminal rejections are also durable, stable and actor-owned.
Unconfirmed rollback/transport failure creates no fabricated terminal receipt.

## Independent authority and time of authorization

Every protected bid POST, standing read, receipt read and replay requires all:

1. Current active synthetic person and unrevoked, unexpired server session.
2. Active business and active business-person membership with can_bid=true.
3. Active organizer-business membership.
4. Current catalog002 VIEW grant.
5. Separate current003 BID admission.

VIEW and BID are separately necessary; neither creates the other. Staff grant,
business membership, a typed Member ID/name/phone/business or claim header grants
no bidding permission. VIEW-only, BID-without-VIEW, member-only, unlisted and
staff-only fixtures deny bid/standing. Multiple people can share a business.

Authorization is current at the post-lock decision/read instant, including
clock_timestamp()-based session expiry after waiting. Authority records are held
with share locks through the decision/read, using only lock_marker privilege for
row locking. Clock expiry can still occur while those locks are held. Queued
expired POST/read/lookup denies401 with no privileged receipt or changes.
Revocation and expiry deny later protected reads/replays; accepted SQL history
stays exact. This is a bounded staging default, not real audience/onboarding policy.

## Catalog002 integration

Bind to the exact immutable approval and selected-lot schema/API from the corrected
catalog002 trusted base recorded in CUMULATIVE_BINDING.json. Do not alter001/002
migrations, predecessor graders, src/server/config.ts, src/server/db.ts or the
read-only connectivity adapter. Migration003 adds its own authority/operational
records and lock_marker fields. Original predecessor suites remain additive.

Catalog002's API projection remains biddingEnabled:false and its VIEW-only
fixtures keep disabled controls.003 controls use separately authorized context
and fresh standing.canBid; catalog metadata/VIEW does not turn on bidding.
Operational lots read bz_catalog_lots.snapshot, never mutable bz_lots.data. The
fixture deliberately stores opening10000 in approval and111 in the working draft,
uses selected saved numbers'01'/'03', and keeps an unselected private draft.

Near-clock SECOND-precision approval timestamps are seeded directly by this
independent privileged disposable fixture, with truncated HH:MM local metadata.
They are test-only DB release states for lock/expiry/time-boundary probes, not
claims about catalog002 staff UI timezone conversion or valid live approvals.
Catalog002's own unchanged suites establish its actual conversion behavior.

## HTTP protocol

GET /api/bidder/events/:eventId/context returns exactly
{testMode:true,person:{id,name},businesses:[{id,name,canBid}]}. No grant/other-person
records. POST /api/test-auth/login remains a clearly labeled, gated test-account
allowlist; aliases are explicit independent synthetic seed entries, not SMS or
mock verification. No real person/member rows are imported.

GET /api/bidder/events/:eventId/lots/:lotId/standing returns exactly {standing}.
Its exact fields are releaseId,lotId,rulesetId,currency,incrementMinor,
amountCapMinor,phase,currentAmountMinor,minimumAmountMinor,acceptedBidCount,
version,leadingBusiness(null or{id,name}),serverNow,updatedAt,canBid.
serverNow is independently bracketed DB time; phase agrees with the immutable
window. Public standing is business-first, with no other actor/private receipt.
Before opening this endpoint returns409/CATALOG_NOT_OPEN with sealed error,
without selected lot content. Closed standing remains authorized and read-only.

POST /api/bidder/events/:eventId/lots/:lotId/bids accepts only
{requestId:UUID,businessId:UUID,amountMinor:integer,rulesetId:'staging-usd-manual-v1'}.
Identity, release, currency, opening/minimum, increment, history, authority,
acceptance and time are server-owned. Extra ownership/history/max/donation fields
reject. Accepted POST201 returns exactly{receipt,standing}. Typed terminal POST409
returns exactly{receipt}; live standing is a separate fresh read. Invalid input
400/VALIDATION; inactive/expired identity401; denied authority403 or opaque404;
changed payload409/IDEMPOTENCY_CONFLICT; rollback503/UNAVAILABLE, no receipt.
All error responses are exactly{error:{code,message}} with generic copy; authority
errors cannot disclose request/person/event/business/amount identities. Every
private response is no-store and contains no provider, credential, SQL or hash data.

Receipt has exactly requestId,eventId,releaseId,lotId,actorId,businessId,
amountMinor,rulesetId,currency,status,reason,bidId,decidedAt. Accepted has status
accepted, reason=null and committed bidId. Terminal rejection has status rejected,
typed reason and bidId=null. Receipt content is immutable; standing may change.

GET /api/bidder/events/:eventId/lots/:lotId/bid-receipts/:requestId returns exactly
{receipt} for that currently authorized actor and exact route context. Key scope
is(personId,requestId), binding original event/lot/business/amount/ruleset. Two
people may use the same UUID independently. Concurrent identical same-actor/key
submissions recover one receipt and one bid/version. Changed payload conflicts;
invalid ruleset ID400 never rewrites the original. A wrong event/lot lookup cannot
return a different route's receipt. Stable accepted replay after close and stable
NOT_OPEN replay after actual opening keep their original outcome/time.

## Actual A browser boundary

Reuse outer /events/:id Test account/Sign in/Sign out/Refresh event controls and
iframe title="BidZizi event". Actual A uses welcome Browse the lots, #/lot/:id,
main[data-lot], dialog#sheet, #amt and data-action=place. Review shows the amount,
business and acting person before any write. Data attributes expose observable
semantics, not a separate mock: dialog data-bid-state review/pending/unconfirmed/
accepted/rejected; accepted owner element data-owned-request=UUID; outer
[data-bidder-person]=currentperson; confirmed standing [data-standing-as-of]=its
last confirmed serverNow. Attribute checks are paired with visible A behavior,
real transport and independent SQL, never accepted alone as authority evidence.

Pending and aborted/lost acknowledgement remain unconfirmed. Check status uses
the original UUID, with current authority. No-receipt recovery then Try again uses
the same payload/key. Received409 rejected receipt and503 rollback must not become
accepted merely because HTTP resolved. A shared business lead cannot fabricate a
coworker's individual accepted request. Captured old authorized context/receipt
cannot repopulate the new person after logout/sign-in. Offline standing keeps its
confirmed DB-bracketed as-of timestamp, stale label and disabled sending; refresh
recovers current SQL standing. No simulated rival/max/donation/payment writes.

## Evidence and freeze

All28 groups now have concrete driver/SQL/HTTP/browser code:7 acceptance and21
adversarial. They are still proposed and not candidate-validated. run.mjs pins
IDs/count/modes and executed counts. No unbound callback, skip or author vote can
yield GREEN. Every case owns a new PG18 cluster/DB, distinct migration/runtime
roles, source copy/Next process and empty Chromium contexts. Runtime role cannot
modify authority or immutable catalog/bid/receipt history. The harness never
loads runtime .env, shared staging, inherited provider credentials or live records.
Generated Next files and test writes stay in owned /tmp copies, then are removed.

Finite absent context404 after healthy inherited session is ordinary feature RED.
Missing module/tool/browser/owned setup is99. Reached app500/deadline candidate1,
baseline99; this is not ordinary missing-feature RED. Timeout, syntax and review
metadata are not substitutes for completing asserted outcomes.

The app-clock instrumentation is versioned separately in CLOCK_PROBE_BINDING.json.
The original end-only marker defect and subsequent Date-descriptor defect remain
additive history. Do not freeze or use a faulty preload as product evidence; bind
its transparent Date/real Next+PG proof and replacement trusted base first.

Parent/independent red-team review, exact rule/surface inspection, working driver
smoke, ordinary baseline and deliberate weak-candidate challenges precede freeze.
Commit every relied-on file to the trusted base. A model review is a probe, not a
vote. Kernel evidence covers this synthetic contract only; visual/device review
and exact hosted revision/HTTPS cookies/provider/storage E2E remain separate.
Real identity, auction money/close rules, self-raise, auto-bidding, maxima/ties,
donations/payments/settlement and organization onboarding require later contracts.
