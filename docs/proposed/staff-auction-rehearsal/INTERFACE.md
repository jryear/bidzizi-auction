# Proposed fresh-event v2 interface for the local rehearsal

**Review draft.** This binds executable evidence and implementation to one
interface; it grants no release permission. Older v1 event, approval, USD
standing and receipt routes remain byte-compatible for existing events.

## New event and saved draft

The accepted Studio creates a new rehearsal event with
`POST /api/v2/admin/events` and the existing authenticated body
`{organizationId,name,requestId}`. It returns a durable version-2 draft with
empty local endpoint fields and UI timezone default
`America/Los_Angeles`; a draft without complete timing cannot publish.
GET/PUT `/api/v2/admin/events/:id` read/save the version-2 draft with existing
`expectedRevision` and exact `requestId` recovery. The saved event uses
`timing:{startDate,start,endDate,end,timezone}` (canonical YYYY-MM-DD and
HH:mm), and `rules:{rulesetId:"saturn-trade-tiered-v1",
denomination:"SATURN_TRADE_DOLLAR_SYNTHETIC_V1",scale:100,
amountCapMinor:1000000000,tiers:[{belowMinor:50000,raiseMinor:2500},
{belowMinor:100000,raiseMinor:5000},{belowMinor:250000,raiseMinor:10000},
{belowMinor:null,raiseMinor:25000}]}`. Staff sees and confirms these exact
synthetic rules before publication. The tranche rejects a different event tier
schedule. A lot retains its accepted content fields, with `opening` in minor
units and `fixedRaiseMinor:null | positive integer`; it has no custom group
window. The event timing applies to every published lot.

The existing private opaque asset upload/recovery/content routes remain scoped
to the event ID. A version-2 draft may refer to its own uploaded asset IDs and
alt text; Save atomically validates every reference. The native saved preview
uses the saved version-2 packet, not unsaved editor state.

## Initial publication and audience

GET/POST `/api/v2/admin/events/:id/catalog-approval` uses the existing
`{expectedRevision,requestId,lotIds}` selection and returns one immutable
approval receipt. The physical commit-before-opening requirement is explicitly
blocked by `COMMIT_BOUNDARY_REVIEW.md`; no predicate in this document claims to
solve it. If that requirement is resolved, the snapshot binds exact selected
order/lot identity, opening and fixed raise, event rules, denomination, cap,
timing and image refs. No v2 post-publication save, additive publish or
reschedule is exposed. Exact replay returns the original receipt under current
staff authority.

Current authorized VIEW readers use `/api/v2/catalog/events/:id` and its
`/lots/:lotId` child. A published selected lot is browseable in `scheduled`
phase, including authorized image bytes and opening/rule disclosure; a private
unselected lot remains unavailable. `serverNow` and phase come from the DB.
The published image route remains
`/api/catalog/events/:id/assets/:assetId?approvalId=:approvalId` with a
server-selected published context; it cannot be used as a general asset API.

## Bidding and recovery

The version-2 bidder context, standing, bid and receipt routes use
`/api/v2/bidder/events/:eventId`. POST bid accepts exactly
`{requestId,businessId,amountMinor,rulesetId:"saturn-trade-tiered-v1"}`.
The server derives the effective raise from the *current highest accepted bid*
or the frozen positive lot override; the first minimum equals opening. It
accepts any exact amount at/above minimum through the inclusive cap, subject
to current authority and `[opensAt,closesAt)`. It never rounds or upgrades a
stale amount. Every accepted/rejected decision has a durable actor-owned
receipt carrying ruleset and synthetic denomination, with exact replay and
owned GET lookup after response loss. The standing projection reports current
amount, minimum, phase, version, leading business and whether the current
business can bid. Closed standing, including no-bid lots, remains readable.

The v1 `staging-usd-manual-v1` event and receipts retain `USD`, scale 100,
their fixed increment and original bytes. Neither v2 renderer nor migration
rewrites those rows. The UI disclosure says these are synthetic Saturn trade
dollars, with no payment or settlement. Standing is not an award.
