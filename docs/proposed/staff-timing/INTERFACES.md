# Proposed TIMING007 v2 interfaces

All names/DTOs here are concrete review proposals, not frozen interfaces. No
endpoint or migration is installed. Legacy v1 APIs/JSON remain exact.

## Draft and resolved timing

```ts
type LocalTiming = {
  startDate: string; // canonical YYYY-MM-DD
  start: string;     // canonical HH:mm, minute precision
  endDate: string;   // independent canonical YYYY-MM-DD
  end: string;       // canonical HH:mm
  timezone: string;  // validated IANA event timezone
};
type EventFieldsV2 = Omit<EventFieldsV1, "date" | "start" | "end" | "timezone">
  & { timing: LocalTiming };
type DraftGroup = {
  id: string; name: string; // lowercase UUID; trimmed nonempty human title
  startDate: string; start: string; endDate: string; end: string;
}; // timezone inherited from event; no per-group timezone field
type LotFieldsV2 = Omit<LotFieldsV1, "windowId"> & { windowId: string | null };
type StaffLotV2 = LotFieldsV2 & {
  number: string; provider: string; logo: "saturn";
  count: 0; current: 0; history: [];
}; // retained read-only staff preview fields, never actual bid standing
type PublishedSummary = {
  approvalId: string; catalogVersion: number; publishedLotIds: string[];
};
type DraftV2 = {
  version: 2; org: Organization;
  event: EventFieldsV2 & { id: string; orgId: string };
  groups: DraftGroup[]; lots: StaffLotV2[];
  revision: number; savedAt: string; release: null | PublishedSummary;
};
type SaveV2 = {
  expectedRevision: number; requestId: string;
  draft: { event: EventFieldsV2; groups: DraftGroup[]; lots: LotFieldsV2[] };
};
type EffectiveTiming = {
  source: "event" | "group"; windowId: string | null;
  name: string; // "Event hours" for default; frozen group title otherwise
  local: LocalTiming; opensAt: string; closesAt: string; // canonical UTC ISO
};
type ItemPhase = "scheduled" | "open" | "closed";
type HeaderFields = Pick<EventFieldsV2,
  "name" | "eyebrow" | "welcome" | "venue" | "cover" |
  "sponsorsEnabled" | "sponsors"> & { id: string };
```

`EventFieldsV1` and the complete accepted lot content allowlist are the current
375 definitions, modified only by independently accepted ASSETS/INCREMENTS
interfaces at a later freeze. V2 uses one nested explicit event timing field to
avoid retaining a misleading single-date alias. New create initializes empty
local endpoint strings and the existing event timezone default; that is incomplete
preparation, never a guessed schedule. Staff selects actual endpoints before
approval. Partial empty timing may save before approval; nonempty malformed or
ambiguous endpoint input rejects. Complete resolved event/group schedules require
exactly one UTC inverse per endpoint, opens < closes, and the accepted bounds
predicate. A DST gap or fold is rejected rather than guessed. The server is the
resolver; client validation cannot authorize publication or bidding.

Technical caps retain at most 100 total saved/published/private items; at most
100 groups; name 1–100 trimmed characters; unique group UUIDs within one event.
These are contract-review choices, not owner policy defaults. Different named
groups may overlap; this packet adds no non-overlap restriction. A group is one
schedule with a name, not another batch abstraction. Cross-event UUID references,
unknown keys and supplied per-group timezone reject without identifying foreign
resources. Deleting/reusing a saved group UUID or item UUID in another event
does not confer ownership. No global uniqueness precondition is added to old
catalog history, which can already contain duplicate lot UUIDs across releases.

Root selected existing JSON persistence: server-only `_timing`/`_origin` metadata
in existing event/approval/lot JSON, detailed in SQL_AND_PERMISSIONS. Public
event DTOs strip reserved metadata, and Save/approval input allowlists reject it.
Persisted `_timing.version:2`, never null-reference inference, selects the v2
resolver. There is no schema/ACL migration in TIMING007.

## Route seam and responses

| Route proposal | Semantics |
| --- | --- |
| `POST /api/v2/admin/events` | Existing `{organizationId,name,requestId}` create authority/recovery; explicitly creates preparation version2. No preconfigured target event. |
| `GET /api/v2/admin/events/:id` | Current staff/org; `draft:DraftV2`, saved only, never a fixture overlay. Reject a v1 target until a separately scoped adoption contract exists. |
| `PUT /api/v2/admin/events/:id` | Before approval, exact `SaveV2`; one expected revision and same-UUID/body recovery. No partial event/group/item commit. |
| `PUT /api/v2/admin/events/:id/draft-lots` | After approval, `{expectedRevision,requestId,lots:LotFieldsV2[]}` replaces only unpublished pool; event/groups are not inputs. Published IDs reject `APPROVED_CONTENT_LOCKED`; exact old approved physical rows survive. |
| `GET/POST /api/v2/admin/events/:id/catalog-approval` | GET immutable original receipt; POST existing `{expectedRevision,requestId,lotIds}` saved subset under bound initial predicate. No working edits, empty/duplicate selection or save-all inference. |
| `GET /api/v2/catalog/events/:id` | Current VIEW; v2 header, immutable event schedule, DB event phase/serverNow, visible approved subset in every phase. Current catalog version1 until008. |
| `GET /api/v2/catalog/events/:id/lots/:lotId` | Current VIEW; only explicitly published target; resolved immutable timing and own phase. Private/foreign/unknown IDs opaque404. |
| `GET /api/v2/bidder/events/:eventId/context` | Current identity+VIEW, current businesses/network/BID admission; `BidderContextV2`. Business eligibility is independent of event/item phase, not permission to submit a bid. |
| `GET /api/v2/bidder/events/:eventId/lots/:lotId/standing` | Current identity+VIEW+BID and eligible current business/network, immutable published target; `{standing:StandingV2}` in scheduled/open/closed phases without creating a standing row. |
| `POST /api/v2/bidder/events/:eventId/lots/:lotId/bids` | Current independent authority and exact `ManualBidInputV2`; durable accepted201 `{receipt,standing}`, durable rejected409 `{receipt}`; stable release/item and own resolved schedule. |
| `GET /api/v2/bidder/events/:eventId/lots/:lotId/bid-receipts/:requestId` | Current independent authority and receipt's current business/network; owned exact actor/event/release/item/request binding;200 `{receipt:BidReceiptV2}`, no fresh standing in this lookup response. |

V2 staff create/save/approval preserves its operation's status/body on exact replay;
changed same-key payload gives `IDEMPOTENCY_CONFLICT`; stale fresh save gives
`REVISION_CONFLICT`. Replays require current authority but do not rerun a fresh
publication cutoff against a successfully committed original operation. No new
request ID on uncertain acknowledgement. Receipt recovery retains exact operation
scope, actor, event and original response. `VALIDATION`, `CATALOG_INCOMPLETE`,
`PREPARATION_VERSION_CONFLICT`, `APPROVED_CONTENT_LOCKED` and
`PUBLICATION_NOT_ELIGIBLE` are proposed provider-neutral labels; session/authority
denial remains401/403, unavailable infrastructure503. They expose no SQL/provider
details. Exact status/label bindings need executable review before freeze.

Use distinct proposed operation namespaces `create-event:v2`, `save-v2:<eventId>`,
`save-private-v2:<eventId>` and `catalog-approval-v2:<eventId>` in the existing
actor/operation/request key. This prevents same-looking v1 create/approval input
from replaying a v1 result through a v2 route. Legacy namespace/body/response stays
exact; v1 owned replay remains current-authority-first, before a fresh write's
version guard. No new request ledger or permission is introduced.

## Exact bidder envelopes at the existing manual-bid seam

```ts
type Person = { id: string; name: string };
type BidderContextV2 = {
  testMode: true; person: Person;
  businesses: { id: string; name: string; canBid: boolean }[];
};
type ManualBidInputV2 = {
  requestId: string; businessId: string; amountMinor: number; rulesetId: string;
};
type StandingV2 = {
  releaseId: string; lotId: string; rulesetId: string; currency: "USD";
  incrementMinor: number; amountCapMinor: number;
  phase: "scheduled" | "open" | "closed";
  currentAmountMinor: number | null; minimumAmountMinor: number | null;
  acceptedBidCount: number; version: number;
  leadingBusiness: { id: string; name: string } | null;
  serverNow: string; updatedAt: string; canBid: boolean;
};
type BidReceiptV2 = {
  requestId: string; eventId: string; releaseId: string; lotId: string;
  actorId: string; businessId: string; amountMinor: number;
  rulesetId: string; currency: "USD";
  status: "accepted" | "rejected";
  reason: null | "NOT_OPEN" | "CLOSED" | "AMOUNT_LIMIT" |
    "UNSUPPORTED_SELF_RAISE" | "BELOW_MINIMUM";
  bidId: string | null; decidedAt: string;
};
type StandingResponseV2 = { standing: StandingV2 };
type AcceptedBidResponseV2 = { receipt: BidReceiptV2; standing: StandingV2 };
type RejectedBidResponseV2 = { receipt: BidReceiptV2 };
type OwnedBidReceiptResponseV2 = { receipt: BidReceiptV2 };
```

These retain the current375 manual-bid fields and immutable receipt semantics.
The isolated timing witness binds the existing synthetic fixture
`staging-usd-manual-v1`, USD, incrementMinor2500, amountCapMinor1000000000.
This is not a selected progressive-tier policy. Amounts remain safe integer minor
units; accepted INCREMENTS must explicitly rebind the rule envelope/minimum
calculation before claiming the final fresh-event journey. Caller-supplied rule
IDs cannot select arbitrary policy. V1 routes/DTOs/receipt bytes stay unchanged.

In context, each business `canBid` is only the conjunction of current person
membership's can_bid, active business/network, current event BID admission and
supported ruleset. It has **no event-phase or item-phase gate** and excludes no
business merely because it leads one item. Context still requires current VIEW;
it grants no BID authority and never overrides standing. In standing, `canBid`
requires that item's phase open, a non-null current minimum and at least one
currently eligible non-leading business; the submit path rechecks the selected
business and all current authority after waits. Do not create a row on GET.
Absent standing projects null current/leader, zero count/version and the approved
initial timestamp from immutable source. Scheduled/closed standing can be read
under the same current BID/business authority and has `canBid:false`; VIEW-only
does not gain numeric-standing permission through this successor.

Fresh POST rejection records its own DB decision time/reason once; malformed,
unauthorized, unsupported or unavailable requests preserve current provider-neutral
error envelopes and do not invent a durable receipt. Exact POST replay requires
current authority and the same canonical event/item/business/amount/rule payload
under the existing actor/request key. It returns the **unchanged original receipt
and original HTTP status**: accepted201 includes a fresh post-wait StandingV2
projection; rejected409 contains its original receipt only. Passing own close or
a later rival bid changes that fresh projection, never original acceptance,
reason, amount, decidedAt or bid ID. Owned GET lookup returns the immutable receipt
only; no request/replay increments standing or substitutes catalogVersion for
stable releaseId. Original accepted/rejected receipt payloads contain no dynamic
phase/timing/standing or server-only persistence metadata.

```ts
type ApprovalV2 = {
  id: string; eventId: string; organizationId: string; sourceRevision: number;
  approvedAt: string; opensAt: string; closesAt: string;
  local: LocalTiming;
  groups: (DraftGroup & { timezone: string; opensAt: string; closesAt: string })[];
  snapshot: { organization: Organization; event: EventFieldsV2; lots: ApprovedLotV2[] };
};
type ApprovedLotV2 = LotFieldsV2 & {
  number: string; provider: Organization; timing: EffectiveTiming;
};
type CatalogV2 = {
  version: 2;
  event: HeaderFields; organization: Organization;
  schedule: { local: LocalTiming; opensAt: string; closesAt: string };
  phase: ItemPhase; serverNow: string; biddingEnabled: false;
  catalog: {
    approvalId: string; catalogVersion: number; sourceRevision: number;
    lots: (ApprovedLotV2 & { phase: ItemPhase })[];
  };
  assetContext?: { version: 1; approvalId: string };
};
```

```ts
type CatalogLotResponseV2 = {
  version: 2; eventId: string; approvalId: string;
  lot: ApprovedLotV2; phase: ItemPhase; serverNow: string;
  biddingEnabled: false;
}; // detail phase is the item's own phase at this serverNow
```

`catalog` is present in a published v2 scheduled/open/closed response. The event
phase derives from the explicit immutable event schedule, not min/max selected
group endpoints, unused groups, latest append or browser clock. Every item's phase
is resolved from its immutable timing at that same `serverNow`. Phase is a fresh
projection and never inserted into an approval/publication/owned bid receipt.
`biddingEnabled:false` retains its catalog read-only meaning; item standing plus
current BID/business authority controls actual bid UI. It is not permission.

The initial approval ID stays the **stable releaseId** for all standing/bids/
owned receipts and later008 additions. `catalogVersion` only describes cumulative
visibility, never a bid identity. Original approval GET and request replay use
the frozen initial subset manifest, never a changing SELECT of all target rows.
Numbers/order are frozen from independently observed saved source positions;
no renumbering holes. Fresh v2 target timing is written with the original approval;
later008 targets use the same default/frozen-group resolver and close predicate.

The internal initial manifest records both saved sourcePosition and selected
catalogPosition, plus exact number, so it preserves saved numbering holes while
retaining existing contiguous catalog row positions. V2 staff packets derive
numbers from saved row positions, not row-array index. Effective timing comes
from the immutable selected `bz_catalog_lots.snapshot.timing`; no new target
registry is proposed. Missing/malformed v2 timing fails closed, with no legacy
main/event fallback.

Every public projection uses a strict explicit allowlist: draft event/lot,
ApprovalV2 snapshot event/lot, CatalogV2 event/lot and catalog detail lot. The
server extracts the permitted EventFieldsV2/LotFieldsV2 content plus declared
number/provider/timing/phase fields as appropriate; it strips `_timing` and
`_origin` from **all** public event and lot objects. It must not spread a stored
snapshot/row through the current read-all helpers. Public immutable approval
receipts may include declared groups and effective timing, but never the internal
manifest or origin metadata. Exact stored operation replay returns the originally
constructed public response; no new metadata is inserted into old response JSON.
Missing required v2 metadata, malformed/present version markers, initial manifest
or target timing are provider-neutral503 `UNAVAILABLE` with no partial public packet, legacy fallback,
placeholder schedule, ref/metadata disclosure or mutation. A genuine v1 row has
no marker and uses the unchanged v1 path; a malformed/present marker is not
treated as v1. An explicit v2 request to a genuine unadopted v1 target retains
PREPARATION_VERSION_CONFLICT; a root/target contradicting known persisted v2
state is unavailable rather than that ordinary version rejection.

## Native consumer changes requiring explicit successors

Studio event controls expose separate start/end dates and readable full timezone;
items begin in "Event hours". Groups show title plus both local dates/times and
timezone, with an actual add/edit dialog and bulk reassignment action. Category
controls/filter remain separate. Saved and working preview state remain distinct;
an unresolved save/approval blocks dependent mutation. Keyboard focus, Escape,
Back/Forward, dirty recovery and initiating-control return remain accepted
requirements. Published items/groups are visibly immutable; private pool is clear.

The staff A preview data adapter currently formats legacy event.date/start/end
and a single short timezone; its explicit v2 successor consumes LocalTiming and
group metadata, labels complete start/end dates and common event timezone, and
shows each item's default/group schedule. Working preview uses the actual working
DTO; saved preview uses only the confirmed saved DTO/revision. Both remain
read-only draft content; no browser fixture increment/time grants bidding or
published state. The actual A renderer/route composition remains the accepted
foundation, rather than another handcrafted phone substitute.

The concrete v2 A adapter seam retains the live exported `event` and `lots` and
adds a live exported `groups: DraftGroup[]` to `data.js`, replaced from each
actually consumed draft. Tests inspect that live module, not message-only group
metadata. On the selected grouped item, the actual rendered schedule container
uses `data-preview-group-id` with its owned group UUID and
`data-preview-lot-id` with the selected item UUID; visible `<time
data-schedule-start datetime="YYYY-MM-DDTHH:mm">` and corresponding
`data-schedule-end` expose those rendered complete local endpoints, and visible
`data-schedule-timezone` contains the full inherited IANA zone. Its readable text
includes the human group name and both complete dates/local times. These are
concrete data/render observation seams for the already required group schedule,
not a new source of time or bidding authority. Saved/working mode/revision may be
observed from the actual received packet; complete content/group consumption is
observed independently from the live adapter and rendered fields.

009 event-access wrapper still requires its actual session/entry admission. It
must consume the version-aware catalog/context seams and retain profile/ACK/session
isolation. A published scheduled v2 catalog is browseable, not "not yet available".
Entry enable/disable does not change existing server authority, but the parent's
new Continue-with-current-profile UI action is deferred. Timing proposes no such
action, ACK bypass or identity workaround and does not claim it is installed;
retain current009 ACK/session behavior and track the entry-recovery limit in
ADMISSION.

A audience adapter stops dropping items on event `scheduled`; detail/list/welcome
show own upcoming/open/closed labels and local endpoints. Ordinary server refresh
drives transitions; browser clock offsets do not change authority. Preserve
pending, accepted, uncertain, retry, old request UUID recovery and focus. Never
display a held/open request as accepted before its durable receipt.

010's `parseCatalog` currently requires scheduled `catalog:null`, `windowId:"main"`
and a fixed fixture image. Its successor discriminates v1/v2, validates effective
timing and own phases, keeps current VIEW/session-read isolation and stale/denied/
unsupported/unavailable truth, and preserves the accepted results privacy. A
standing row can be `scheduled` in v2; present "Not started" rather than treating
it as unavailable or inventing numeric standing. It may project zero only from
the authoritative read response; no local leader/winner inference. Opaque asset
refs must use the independently accepted ASSETS parser/context/URL contract.
