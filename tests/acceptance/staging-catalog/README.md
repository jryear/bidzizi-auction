# Proposed catalog002 fixed evidence

This packet is authored in /tmp/task-root only. It is not frozen or implemented.
The inspected foundation is staff5285648 plus the dedicated database correction
91d3de0. CUMULATIVE_BINDING.json binds original v1 from9748ee5, unchanged v2 from
3983c89, and001a evidence frome1abd3a. The old tests remain additive regressions,
including original empty-event cases and v2 populated rows/controlled race. Their
original hardcoded seed path resolves to identical protected seed bytes.

Only deterministic frozen graders decide results. Author/reviewer comments are
probes, never acceptance votes. Integration owner must inspect the exact packet,
commit a feature-absent trusted base, invoke actual baseline and all candidate
checks. Syntax checks and documented historical passes do not transfer a verdict.

## Bounded staging defaults

An approval is one immutable saved selection and one shared window per event.
Staff POST only expectedRevision/requestId/lotIds; IDs are a nonempty unique set.
The server copies selected SQL lots in SAVED order, preserving saved numbers
(01 and03 remain01 and03). Selected rows must already be assigned windowId=main.
The approval does not edit drafts or assign windows. Unknown/cross-event IDs fail.
No client snapshot, role, owner, local schedule or UTC field is accepted.

Readiness means saved nonblank event name/welcome, complete valid unambiguous
date/start/end/timezone, positive integer fixture increment; each SELECTED lot has
nonblank title/description/category, positive integer fixture opening and main
window assignment. Image/short/includes/fine/cover/venue and optional sponsors
can be absent. Incomplete unselected rows do not block and never enter a release.
These integer fields are staging display metadata; currency/bid rules are not
settled here. Missing fields400 CATALOG_INCOMPLETE; impossible/ambiguous/reversed
or equal local window400 VALIDATION. No midnight wrap is inferred.

First approval is allowed before/during the valid window. A first approval after
close409 WINDOW_CLOSED. An existing identical receipt can replay after close and
after draft edits, but must recheck current operator/session/org grant. A new key
after approval409 CATALOG_APPROVAL_EXISTS. Same key plus changed selection/revision
409 IDEMPOTENCY_CONFLICT; stale pre-approval revision409 REVISION_CONFLICT. Set
order is canonicalized: a reordered identical set recovers the original receipt.

Separately pre-enrolled event VIEW grants allow approved welcome/sponsors/schedule
before opening. They imply no organization, business, staff or BID authority.
No approved release404 NOT_FOUND; anonymous401; missing/revoked event grant403.
Before opening catalog=null, with no lotCount, identities, order, rows, payloads
or hidden draft/debug data. Direct selected lot409 CATALOG_NOT_OPEN with a sealed
error DTO. At opensAt inclusive selected catalog becomes available; at closesAt
exclusive it remains available read-only with phase=closed. No bids are implemented.
Unselected/other-event lot404. Sponsors are separate from providing organization.
No future close display, history or UI clock grants monetary authority.

## API and storage protocol

Staff GET/POST /api/admin/events/:id/catalog-approval. GET returns approval:null
before approval, then the immutable POST receipt. POST201 returns approval with
exact id/eventId/organizationId/sourceRevision/approvedAt/opensAt/closesAt/local/
snapshot fields, with no dynamic phase. snapshot contains organization(id/name/
initials), all saved event fields, and selected compact lots plus saved number
and provider organization object. JSON field equality is independently checked.

Viewer GET /api/catalog/events/:id has exact event/organization/schedule/serverNow/
phase/biddingEnabled/catalog keys. Event is allowlisted id/name/eyebrow/welcome/
venue/cover/sponsorsEnabled/sponsors. schedule has exact opensAt/closesAt.
Open/closed catalog has exact approvalId/sourceRevision/lots keys. Direct lot
GET /api/catalog/events/:id/lots/:lotId has exact eventId/approvalId/lot/phase/
serverNow/biddingEnabled keys. All private responses no-store; errors have only
error(code/message), with optional numeric top-level revision only for revision
conflict. Sealed errors contain no stored lot sentinels.

Migration002_staging_catalog.sql supplies:
- bz_catalog_approvals: id UUID, event_id/org_id, source_revision, approved_by,
  approved_at timestamptz, local_date/local_start/local_end/timezone TEXT,
  opens_at/closes_at timestamptz, organization_snapshot/event_snapshot JSONB.
  Unique event_id, positive revision, opens_at<closes_at and composite event/org FK.
- bz_catalog_lots: approval_id/event_id/org_id/lot_id UUID, position integer,
  snapshot JSONB. Contiguous selected order; unique approval/lot and approval/
  position; composite parent FK. Do NOT FK to mutable bz_lots: later draft
  delete/reorder/replacement cannot change or obstruct the immutable catalog.
- bz_event_view_grants: person_id/event_id, active, lock_marker; composite PK,
  person/event FKs; explicit fixture enrollment only.
- public.bz_catalog_phase(opens_at,closes_at,at_time TIMESTAMPTZ) returns scheduled
  for at_time<opens_at, open for opens_at<=at_time<closes_at, otherwise closed.
  Pure immutable strict function. API uses it with one captured clock_timestamp
  from the DB for both phase and serverNow. It is not a public clock seam.
- harmless boolean lock_marker on bz_orgs/bz_people/bz_staff_grants and VIEW grants,
  permitting SELECT FOR SHARE using UPDATE(lock_marker) only. No authority field
  changes. Existing001 migration is immutable.

## Runtime privilege boundary

Each new run owns a new local PG18 cluster and bz_test_* DB. The migration/seed
role owns schema/tables; the app role is distinct, nonowner, NOINHERIT, nonsuperuser,
cannot create DB/roles/schema/temp objects and has no owner membership.
The fixture applies CANDIDATE migrations through migration credentials and seeds
synthetic data independently. It never supplies missing product tables/markers.
Existing authority tables and event VIEW grants: SELECT+UPDATE(lock_marker) only.
Sessions: SELECT/INSERT and UPDATE(revoked_at). Draft events/lots: the exact CRUD
needed by existing code. Receipts/approval headers/approved lots: SELECT/INSERT
only. Runtime cannot UPDATE/DELETE approved data or grant/identity/provider fields.
The protected fixture explicitly denies those direct SQL attempts, while actual
authenticated routes prove permitted row-lock behavior works. Remote roles and
grants need independent deployment proof; these local privileges are no claim
about current Neon users. No credentials or provider identities are printed.

## Executable cases and counterexamples

Acceptance has4 completed groups: full selected SQL snapshot/welcome omission;
immutable later edits/replay/restart; real staff dirty/precommit/lost-ack recovery
and A phone welcome; real minute-boundary scheduled/open/closed A/API journey,
retained read-only details and closed-window current-authority retry.

Adversarial has7 completed groups: compact selection/staff/CSRF matrix; stale/
concurrent and independent incomplete/window assignment; PST/PDT/half-hour UTC
oracles, gaps/folds at BOTH endpoints, equal/reversed and controlled invalid
stored metadata, closed first-approval rejection; SECOND-child SQL fault/rollback
and runtime privilege denials; operator/viewer revocation/expiry/event scope;
genuinely wired phase function plus app-only Date skew, unselected raw omission,
Pine provider in A; authorized audience response captured before account switch.

Exact phase probes use fixed microsecond boundary instants. A controlled DB
function canary proves API and direct-lot routes consume the function. Separately,
a protected --require app process probe skews JS Date365days so tomorrow's window
would appear closed if application time were used. A private HTTP worker header
proves the preload ran; DB serverNow bracket and catalog omission must remain
correct. No application route/env chooses a clock. Browser Date is also forged.

The second selected child insert is rejected after the first succeeds. Complete
parent/child/request rows must be unchanged; same-key retry then commits once.
Dirty browser review is blocked; first POST is aborted before send, second loses
a201 response AFTER commit, third exact retry recovers one immutable receipt.
Approved is never displayed for either unconfirmed operation.

Real wall times are minute precision. Opening has at least30s setup lead, closing
one minute later; polling has a175s bound, whole grader300s. Database timestamps
bracket every audience read. These are actual database clock transitions without
an application clock injection/cron. Exact equality comes from the fixed predicate
plus wiring/skew challenges, not a claim that HTTP polling hit one microsecond.

Infrastructure/dependency failures99. Reached app500/timeouts candidate1/base99.
A first anonymous request to the catalog approval route deliberately produces
finite missing-API404 on the absent base before staff login/marker permissions.
Other baseline causes cannot substitute. Kernel overall timeout never counts as
the required readiness proof. Every fixed group must finish to produce exit0.

## Explicit limits

This is synthetic fixture VIEW, not real admission, person/business membership,
bids, payments or production. New approvals after close and before-open welcome
are reversible staging defaults endorsed by root, awaiting final parent packet
inspection. Replacement/cancel/reschedule, multi-window and real audience policy
need later contracts. Catalog cannot grant BID. Provider mutations/deployment are
outside this proposal. A composition/visual quality and physical devices remain
independent inspection; browser assertions only substantiate named behaviors.
