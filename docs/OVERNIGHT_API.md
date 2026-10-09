# Original V1 integration API seams

Implementation packet, October 8. All routes are same-origin, private/no-store, and use the existing `bz_session` cookie. Mutation bodies use JSON and the existing Origin checks. Identifiers are UUIDs; money is an exact integer minor-unit amount. Current server authority controls every read, mutation and recovery. A receipt is visible only after a durable commit. These interfaces are being implemented on recovered base `b07c535`; this file does not claim deployed availability.

## Staff operations

`GET /api/admin/events/:id/results` requires current organization staff authority, never attendee BID authority. It returns:

```ts
{
  schemaVersion: 1, testMode: true, published: boolean,
  eventId: string, releaseId: string | null,
  event: { id: string, name: string, ...frozenEventFields },
  organization: { id: string, name: string, initials: string },
  schedule: { opensAt: string, closesAt: string, timezone: string } | null,
  phase: 'draft' | 'scheduled' | 'open' | 'closed', serverNow: string,
  currency: 'USD' | 'SATURN_TRADE_DOLLAR_SYNTHETIC_V1',
  rulesetId: string, scale: 100, finalized: false,
  assetContext?: { version: 1, approvalId: string },
  lots: Array<{
    lot: { id: string, number: string, title: string, ...frozenLotFields },
    standing: {
      currentAmountMinor: number | null,
      leadingBusiness: { id: string, name: string } | null,
      acceptedBidCount: number, version: number, updatedAt: string
    },
    recordedState: 'no-bids' | 'recorded-standing'
  }>
}
```

An unpublished event has `published:false`, null release/schedule and no result rows. A closed phase reports current recorded standing; `finalized:false` always. No winner, award, payment or settlement is inferred. Uploaded image bytes use the existing staff-approved image route `/api/admin/events/:id/catalog-approval/:releaseId/assets/:assetId`; neither public assets nor attendee credentials grant staff display access. The existing `/events/:id/display` and `/results` clients consume this staff seam.

`GET /api/admin/events/:id/results/export` returns a formula-safe CSV attachment under the same staff authority, containing immutable event/release/lot/denomination/rules/schedule fields and current recorded amounts/business/count/status. Export is read-only.

`GET /api/admin/events/:id/bidders` returns `{eventId,serverNow,bidders:[{person:{id,name},businesses:[{id,name,canBid}],claimedMemberId:string|null,access:'VIEW'|'BID',active:boolean,revision:number}]}`. These are existing synthetic event attendees; labels are claims, not identity or spending authority. `active` is effective event VIEW plus admission state. `revision` begins at zero and changes only through this management seam.

`POST /api/admin/events/:id/bidders` body is `{requestId,personId,expectedRevision,access:'VIEW'|'BID',active:boolean}`. It controls an existing synthetic attendee's event access only, never a global person/business/network grant. Response is `{operation:{requestId,personId,access,active,revision,appliedAt},replayed:boolean,serverNow}`. Recovery is `GET /api/admin/events/:id/bidders/requests/:requestId`, returning the owned original operation under current staff authority. Changed request payload is `409 IDEMPOTENCY_CONFLICT`; stale revision is `409 BIDDER_REVISION_CONFLICT`. An attendee's business authority remains independently server-derived.

## Personal collections

`GET /api/bidder/events/:eventId/watching` returns `{eventId,releaseId,person:{id,name},lotIds:string[],serverNow}`. Watching is personal and requires current session and VIEW, without requiring BID. `POST` to the same route accepts `{actorId,requestId,lotId,watching:boolean}` and returns `{watch:{eventId,releaseId,lotId,watching,updatedAt},operation:{requestId},replayed:boolean,serverNow}`. The server rejects an actor change, invalid/foreign lot and changed-key payload. Recovery is `GET /watching/requests/:requestId`, returning the owned original watch operation. Do not infer a saved watch from a click.

`GET /api/bidder/events/:eventId/my-bids` returns `{eventId,releaseId,person:{id,name},currency,rulesetId,scale:100,phase,serverNow,bids:[{receipt,lot:{id,number,title},standing:{currentAmountMinor,leadingBusiness,acceptedBidCount,version,updatedAt},recordedState:'leading'|'outbid'|'rejected'|'closed-leading'|'closed-outbid'}]}`. Receipt is the actor's immutable accepted/rejected bid receipt; standing is current business-level standing. A coworker's receipts are excluded. Closed-leading is recorded standing, never a final award. Current session and VIEW authorize history; fresh spending authority is a separate decision.

## Manual donations

Use the recovered task7 reserved paths and shapes, not an alternate `/donations` bidder API. `GET /api/bidder/events/:eventId/donation-pledges/context` returns `{event:{id,name},organization:{id,name},person:{id,name},enabled,businesses:[{id,name,canPledge}],nonprofits:[{id,name,description,version}],unit:'trade-dollar',scale:100,amountCapMinor:number|null,minimumMinor:number|null,policyReady:boolean}`. Curated recipients belong to this event; no fictional runtime defaults. Availability is independent of bidding hours and defaults disabled. True eligibility/minimum/cap choices are pending Junior's existing question; do not advertise readiness until returned policy resolves them.

`POST /api/bidder/events/:eventId/donation-pledges` accepts `{actorId,requestId,businessId,nonprofitId,nonprofitVersion,amountMinor}`. After durable commit, `201 {receipt}` contains `{id,requestId,eventId,organizationId,actorId,businessId,actorName,businessName,nonprofit:{id,name,description,version},amountMinor,unit:'trade-dollar',scale:100,status:'pending_staff_settlement',recordedAt}`. The UI says **Donation recorded** and **Saturn staff will process your donation**, with ordinary dollar amounts and one explanation of Saturn trade dollars. Selection/review makes no write. Preserve the original uncertain payload/key for receipt checks and exact retry.

`GET /api/bidder/events/:eventId/donation-pledges/:requestId` reads only the current private actor's owned event receipt. Exact POST replay returns the original receipt after disable or recipient edits, but still requires current session/VIEW. Changed payload returns `409 IDEMPOTENCY_CONFLICT`; actor change `409 ACTOR_CHANGED`; new disabled commitment `409 DONATIONS_DISABLED`; stale recipient version `409 NONPROFIT_CHANGED`. No automatic ledger, financial posting or settlement endpoint exists.

Staff `GET /api/admin/events/:id/donations` returns `{event:{id,name},enabled,policyReady,minimumMinor,amountCapMinor:number|null,availability,nonprofits:[{id,name,description,version,active}],pledges:[receipt],serverNow}` under current staff authority. `availability` is `null`, `{mode:'any-time'}`, or `{mode:'window',opensAt,closesAt}` using explicit UTC instants. `PUT` body `{enabled,amountCapMinor?,availability?}` saves desired settings and returns `{enabled,policyReady,minimumMinor,amountCapMinor,availability}`. Omitted optional fields preserve stored configuration; explicit `null` clears it. Defaults are disabled with cap/availability unconfigured, so enabled alone must not be displayed as pledge-ready. The donor context also returns `availability`. A synthetic demonstration fixture may select explicit configuration for its bounded tests; this does not establish an owner-approved universal cap or availability rule.

`POST /donations/nonprofits` accepts `{requestId,name,description}` and returns `201 {nonprofit:{id,name,description,version}}`; exact retries return the same resource and current projection, without overwriting edits. `PUT /donations/nonprofits/:nonprofitId` accepts `{expectedVersion,name,description,active}` and returns `{nonprofit:{id,name,description,version,active}}`. `GET /donations/export` is a private formula-safe CSV of recorded immutable donation snapshots. Pledges remain read-only for manual processing.

## Recovered version-2 compatibility

V2 sponsor logo may be `null` until staff uploads a real mark; do not substitute unrelated fixture brands. Validated `asset:UUID` references still require alt text. V2 audience `schedule` and per-lot `timing` include the frozen approval timezone. Existing historical USD routes/receipts retain their original denomination and immutable snapshots.
