# Staff event entry: precise permission and decision packet

Status: **DRAFT_UNFROZEN / not installed / no runtime execution**. Prepared from
parent-accepted Studio prerequisite `d631d70c6a721b528907e43af060e5e2dc7ce054`,
with released ancestor `375d301c345bc47298dd2945a29bf9583c96fbc9`, for the
authorized staff-created synthetic journey. Independent local preparation/gates
use this accepted prerequisite plus parent trusted evidence commit. Upstream promotion is held; MOBILE014 is denied/unlanded and is
not a dependency. Rebind only if parent supplies a different released revision.
This packet proposes only ADMISSION; it does not choose timing, increments,
publication bounds, real membership assurance, storage or production permissions.

## Requested bounded decisions

1. Approve staff-controlled synthetic entry for a currently authorized same-org
   event, disabled by default. This replaces 009's operator-only enablement seam.
   It creates no new staff/account authority, real member assurance or SMS.
2. Approve installing reviewed additive `migrations/015_staff_event_entry.sql`
   on the existing staging database, granting the existing runtime exactly two
   additional function EXECUTE permissions below. Approve no direct new table
   SELECT/INSERT/UPDATE/DELETE, role membership, credentials or provider expansion.
The broader user approval to implement and stage is already recorded by the
parent. Local disposable draft/baseline execution is authorized separately and
does not authorize installing these staging permissions. No silence or successful
check approves installation. New current-profile continuation is deferred from D1.

## Preserved 009 disabled-ACK limit

`event-access.tsx` chooses recovery when an authenticated `/api/session` and
`pendingDemoEntry(eventId)` coexist. `demo-entry-form.tsx` calls acknowledge
before `onReady`. `bz_demo_acknowledge` first locks the entry and returns MISSING
when disabled. Therefore staff disabling after committed enrollment but before
ACK (including a lost ACK response) can strand the wrapper in recovery after
every refresh. The private session, VIEW/BID/context and owned receipts can still
be valid: disabling is not revocation. This is observable UI conflict, not a
reason to change 009's begin/enroll/ACK rules. Initial D1 preserves the existing
wrapper byte-for-byte. Its Check entry recovery stays truthful while disabled;
staff may need to re-enable entry to complete the original same-session ACK.
The approved fresh-event journey uses enable → enroll → ACK while enabled.

Retain pending ACK UUID/bootstrap cookie, do not reissue a session, do not clear
or consume ACK, and do not claim ACK success while disabled. No new continuation
action or automatic bypass is within this task. Re-enable allows unchanged ACK
and existing recovery to settle. Private server session/current VIEW/BID/context
and owned receipt APIs remain valid according to current authority; a scheduled
published catalog truthfully reports canBid=false until its bidding window.

## API / DTO seam

`GET /api/admin/events/:eventId/entry` returns current
`{entry:{eventId,enabled,entryRevision,updatedAt,shareUrl},serverNow}`.
Absent entry row means disabled, revision 0, updatedAt null. Existing legacy
operator rows retain IDs/org/enabled and start entryRevision 1, with no invented
staff author. `shareUrl` is configured origin + `/events/:eventId`; no credentials,
bootstrap ID, claims or private grants occur in it.

`POST` to the same endpoint accepts exactly
`{expectedEntryRevision,enabled,requestId}` (safe nonnegative int32, boolean,
UUID). A new accepted request advances the separate entry revision exactly once,
even if enabled equals current state. Draft revision/approval/bids are unchanged.
Response includes current `entry`, `serverNow`, `replayed` and immutable
`operation:{requestId,appliedRevision,enabled,appliedAt}`. Reuse of the same actor,
event and request UUID with either changed expected revision or enabled is
409 `ENTRY_REQUEST_CONFLICT`; a new request with stale revision is
409 `ENTRY_REVISION_CONFLICT` plus top-level `currentEntryRevision`, without mutation.
An exact replay must recheck current staff authority; it returns the original
operation tuple and a newly read current entry DTO. Later disable must never be
presented as currently enabled because an old response was replayed.
Successful GET roots contain exactly `entry,serverNow`; POST roots exactly
`entry,serverNow,replayed,operation`. No root credential/private person/business/
claim fields are permitted. Stale revision409 roots contain exactly
`error,currentEntryRevision`, bound to current durable entry revision.

Configured test-mode guard, exact Origin/JSON, field allowlist and private no-store
responses stay mandatory. Proposed stable errors:401 UNAUTHENTICATED,
403 FORBIDDEN,404 NOT_FOUND,400 VALIDATION,409 errors above,503 UNAVAILABLE.
Foreign-org existence is not returned as entry state. Error details contain no
session hash, SQL or provider information. Unauthorized401/403/404 envelopes are
exactly `{error:{code,message}}`, with no entry/operation/current DTO, private
identity or claims. SQL definer refusals are exactly `{error:"UNAUTHENTICATED"}`
or `{error:"FORBIDDEN"}` without ledger/entry disclosure; missing authorized
target uses `{error:"NOT_FOUND"}`. No client-supplied person/org is used.

Native route is `/admin` → Saturn test staff sign-in → Events home → select
persisted event card by exact name → existing `[data-tab=event]` labeled
**Event & entry** / `#/event`. The accepted saved setup region is
`#studio-setup [data-studio-checklist][data-basis="saved"]`; entry controls belong
to this event route and report actual entry state independently of draft/approval.
Suggested accessible controls: **Enable event entry**, **Disable event entry**,
**Copy event link**, and QR image **Event entry QR code**. Pending/uncertain writes
cannot claim enabled, show a new share-ready state, or create another request
identity; exact retry/reload must settle the original operation. QR must really
encode the exact saved event URL using local vendored code with provenance/license.
The evidence decoder reads rendered QR pixels, not a matching data attribute.

## Exact database changes / function privilege request

Reserved additive migration: `migrations/015_staff_event_entry.sql`.
Preserve byte-identical migrations001–003/009. The proposed schema is in
`SCHEMA_PROPOSAL.sql` as review material only; no function body is installed here.

Add `entry_revision integer NOT NULL DEFAULT 1 CHECK(entry_revision>0)`,
`updated_at timestamptz NOT NULL DEFAULT clock_timestamp()`, and nullable
`updated_by uuid REFERENCES public.bz_people(id)` to `bz_demo_event_entries`.
Existing enabled/org/event values and all 009 slot/session identities survive.
Legacy updated_at records migration/backfill observation, not original enable time.
The API must not invent original publication or staff provenance from this value.

Add `public.bz_staff_event_entry_requests` with actor/event/request UUID primary
key and exact normalized request (`expected_revision`,`requested_enabled`),
immutable applied revision/enabled/time. Runtime has no table rights. Do not
reuse `bz_requests`: runtime already has INSERT there and could forge a privileged
control receipt. New ledger rows are append-only via the setter, never UPDATE or
DELETE; entry mutation and receipt insertion are one transaction.

Exactly two proposed function signatures, both returning jsonb:

```sql
public.bz_staff_event_entry_read(p_session_hash text, p_event uuid)
public.bz_staff_event_entry_set(p_session_hash text, p_event uuid,
  p_expected_revision integer, p_enabled boolean, p_request uuid)
```

Functions are owned by the existing trusted migration owner, not runtime. Both
are `SECURITY DEFINER SET search_path=pg_catalog`, use only fully qualified
`public.` objects and fixed SQL (no caller-chosen identifiers), and revoke PUBLIC
execution. The server derives session hash from the current HttpOnly session
cookie using the existing `sessionHash`; no raw cookie or hash is returned/logged.

```sql
REVOKE ALL ON FUNCTION public.bz_staff_event_entry_read(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bz_staff_event_entry_set(text,uuid,integer,boolean,uuid) FROM PUBLIC;
-- Existing staging runtime identifier must be read back and quoted by installer.
REVOKE ALL ON TABLE public.bz_staff_event_entry_requests FROM PUBLIC, <existing_runtime>;
-- Also revoke any explicit column privileges on every ledger column from both;
-- table REVOKE alone does not remove independent column grants.
GRANT EXECUTE ON FUNCTION public.bz_staff_event_entry_read(text,uuid) TO <existing_runtime>;
GRANT EXECUTE ON FUNCTION public.bz_staff_event_entry_set(text,uuid,integer,boolean,uuid) TO <existing_runtime>;
```

No PUBLIC/create-schema rights, no runtime role membership or ownership, no new
direct authority/entry/ledger rights. Existing SELECT on entry and 009 EXECUTEs
stay as they are. No function creates/grants people, businesses, membership,
VIEW/BID, sessions, slots, publication or bids. Only unchanged 009 enroll does that.
Default privileges of the migration owner may otherwise grant a new table to
runtime at creation. Explicitly revoke new-ledger PUBLIC/runtime table **and
column** privileges, read effective `has_table_privilege` / `has_column_privilege`
for SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER as applicable, and
require all ledger rights false before adding the two EXECUTEs. Inspect runtime
role memberships and owner too; do not mistake a direct ACL revoke for removal
of inherited or ownership rights. If effective rights remain, fail installation
and return that concrete permission gap rather than silently changing roles.

## SQL authorization and linearization requirements

1. Validate null/types/bounds/hash shape. Any unlocked preflight (including
   target org discovery) grants nothing. The complete order must match existing
   staff/catalog: **current session + person → current staff grants + orgs →
   event → entry → request advisory lock/ledger**. Use the existing session/person
   joined lock and staff-grant/org query order (all active staff organizations,
   `ORDER BY o.name`, `FOR SHARE OF g,o`) rather than introducing an opposing
   subset order. For a setter, the exact request lock key is
   `bz:staff-event-entry:v1:<derived-person>:<event>:<request>` using
   `pg_advisory_xact_lock(hashtextextended(key,0))`; collisions only serialize.
2. Lock current session/person then staff grants/orgs `FOR SHARE` from durable
   rows; initially require current active synthetic actor, live session and a
   same-org staff grant. Then lock event (`FOR UPDATE` setter, `FOR SHARE` reader)
   and existing entry in the same mode. Recheck event org against the already
   locked grant set; ownership change cannot acquire a new authority lock after
   event/entry or borrow cached authorization. Absent entry is logical disabled
   revision0; no placeholder may survive a denied operation. The setter then
   acquires its request advisory lock and reads its protected ledger.
3. **After all authority/event/entry/request waits**, capture
   `clock_timestamp()` and perform a fresh SQL read/recheck of the already locked
   authority rows. Do not reacquire authority locks in a different order after
   an event/entry wait. The final query must use `s.token_hash=p_session_hash`,
   `s.person_id=p.id`, `g.person_id=p.id`, `g.org_id=e.org_id`, `o.id=e.org_id` and
   require session not revoked, expiry strictly after that final DB time, person
   active/is_test and same durable-org grant active. No cached JS
   `Identity.organizations`, earlier DB clock or caller actor/org substitutes.
4. Held authority row locks remain through commit/replay and prevent a queued
   logout/person/grant revocation from committing first. Such revocation
   linearizes after the admitted operation, then later reads/replays must deny.
   A revocation already committed before authority locking denies immediately;
   expiry can cross while locks are held and must still deny after every wait.
   Current-authority read uses the same complete order/final recheck. Missing or
   denied authority produces no writes or prior operation disclosure. Compatible
   order matters even for shared locks: a queued authority UPDATE between Save
   and a setter can deadlock a late authority lock behind an event lock.
5. Setter checks protected ledger after authorization. Exact body replay returns
   immutable applied tuple plus current state; changed body409. For a new UUID,
   compare expected revision to current, refuse int32 overflow, then write entry
   and append receipt atomically. After any further wait before committing a
   write (including conflict insertion), recheck current authority/clock again.
   Any later authority check reads already held rows without inverting the lock
   order. Any denial after a provisional write must roll the entire mutation back;
   returning an error JSON after writing without rollback is forbidden.
6. Disable serializes on the existing 009 entry row, the row 009 begin/enroll/ACK
   lock `FOR SHARE`. It rejects future allocation/ACK according to 009; it never
   revokes or changes existing grants, sessions, bids or receipts. Current read
   returns only entry/control state, no attendee claims or private identity.

Locking/recheck/rollback are behavioral obligations, not an instruction to copy
the preflight-only `staff.ts` helper into a privileged SQL function. Independent
tests hold real request/event/entry rows and cross DB expiry before release,
including exact replay/read. A separate concurrency case queues Save and an
independent scoped SQL revoker (session revoked_at matching the durable logout
transition, or staff-grant active=false) behind a held setter, releases entry,
then requires both
authorized writes to settle without deadlock before revocation takes effect and
requires subsequent read/replay denial. A denial-only test cannot replace this
complete lock-order control. The independent revoker avoids demanding three
connections from the shipped app pool of two; actual HTTP logout remains covered
separately. Direct runtime calls test revoked/expired sessions, inactive/non-test
people, absent/inactive staff grants, guessed credentials and foreign staff;
HTTP preflight cannot mask an omitted SECURITY DEFINER check. Independent SQL
binds exact actor/org/revisions/applied timestamps and entry updated_at to DTOs;
app-clock skew plus SQL-before/after bounds verifies serverNow authority.

## Installation, readback and rollback receipt required later

Before staging, independently review exact migration/function bytes and owner
approval; pin accepted integrated source and exact runtime role/function owner.
Install only at staging.bidzizi.com's existing DB, then read back schema,
function definitions, SECURITY DEFINER/search_path/PUBLIC revocation, **effective
table/column** runtime privileges, defaults/memberships and owner. Confirm unchanged
009 definitions and legacy enabled rows.
Run isolated synthetic fresh-event hosted journey and decoded QR, two separate
attendee browser sessions, disable/new-entry denial and preserved ACK recovery
through re-enable if staff disable between enrollment and acknowledgement.
No owner's existing demo or real member/bid/payment data is modified.

Rollback deployment to preceding accepted staging revision and revoke only the
two new EXECUTEs; retain additive schema/ledger and all historical IDs/receipts.
New synthetic event may be disabled through reviewed control before rollback.
Do not drop/erase 009 data, rewrite approvals/bids, delete ledgers or grant table
writes as a workaround. Source revert does not establish a database rollback;
read back exact provider state and record both revisions/privileges.

## Remaining delivery gates

Fresh independent contract/evidence review, accepted Studio d631 (or parent-supplied
accepted successor) source binding and a trusted commit of the bounded runnable
9-group/36-ID contract/evidence permit local freeze, disposable baseline and
implementation. Parent authorizes this local disposable work; exact two-EXECUTE
owner confirmation is required before staging installation.

Before acceptance, integration or promotion, complete the full shipped009v2 and
accepted009+010 closure through reviewed successors where obsolete operator-only
entry absence assumptions change, plus the appended integrated Studio candidate
closure. Preserve every original assertion, clock, deadline and historical receipt;
bounded local freeze waives none. Finite baseline RED, candidate GREEN, fresh
independent candidate review and native owner acceptance remain required. Staging
installation/readback and hosted evidence require the permissions stated above.
Static checks are not application GREEN. No app/DB/browser/runtime/merge/push/deploy
ran for this draft.
