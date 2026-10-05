# Hosted manual-bid003 evidence

Prepared external evidence; actual runs are retained in the receipt directories
and described below. The current complete release result is still pending. Syntax
and preparation checks are separate from application, kernel or hosted results.
The release owner executes this only after clean local003/cumulative verification,
approved isolated migration/runtime grants and an exact READY protected Preview.

Files in this task directory:

- `remote-manual-bid-e2e.mjs`:14 declared browser/HTTP/SQL groups.
- `launch-remote-manual-bid.py`:read-only scoped release/connection checks and
  memory-only stdin transfer of the existing protection credential and DB URLs.
- `evidence/remote-manual-bid/<runId>/`:actual receipt and screenshots upon execution.

Use Node24. The release owner runs the launcher with the exact verified commit:

```bash
python3 /Users/jryear/Documents/Codex/2026-10-02/task-3/launch-remote-manual-bid.py <40-character-verified-source-SHA>
```

The launcher reads only the known Vercel project/team, last12 deployments and exact
selected deployment, known dedicated env record `r7FT8Q5Aci6NNNKz`, existing project
protection metadata and approved local0600 URL files. It creates/rotates no token.
It verifies target Preview/READY/GitSHA/ref/repository, compares dedicated runtime
in private memory and passes six stdin fields:origin,commit,deployment,bypass,
runtimeURL,ownerURL. `deployment` is redacted exact metadata with id,state,target,
and only four Git source fields. No credential values enter argv, logs or artifacts.

The runner refuses another host, database or role. Connections require verified
TLS to the approved isolated branch pooled host and `bz_staging_e2e`, using separate
`staging_e2e_app`/`staging_e2e_owner` credentials. Runtime is NOINHERIT, nonowner,
nonsuperuser with no schema creation or createDB/createRole/replication/bypassRLS.
The approved managed operator is nonsuperuser; its managed createDB/createRole/
replication/bypassRLS/inherit flags may be true and are recorded, without treating
operator and runtime capabilities as equal. This runner does not exercise those
operator capabilities; operator writes remain limited to its own VIEW/BID inserts. Static A bytes, clean local source/tree,
implementation/protocol hashes and exact supplied provider metadata bind the run.

## Required fixed synthetic globals

The runner reads these rows and refuses missing, changed, extra or ambiguous
fixed-person business/network/staff authority with exit99. The operator reconciles
and seeds missing fixed rows once under the separate approved staging scope;
the runner never seeds or modifies these global rows.

The fixed people are exactly the names/aliases from frozen003 seed-people.sql:

| ID suffix (`20000000-0000-4000-8000-0000000000xx`) | Alias | Name |
| --- | --- | --- |
| 01 | staff-saturn | Test Saturn Staff |
| 02 | staff-pine | Test Pine Staff |
| 03 | bidder-juniper | Test Juniper Bidder |
| 04 | bidder-harbor | Test Harbor Bidder |
| 05 | bidder-juniper-coworker | Test Juniper Coworker |
| 06 | bidder-member | Test Member Only |
| 07 | bidder-viewer | Test View Only |
| 08 | bidder-unlisted | Test Unlisted Person |
| 09 | bidder-pine | Test Pine Bidder |
| 10 | bidder-bid-only | Test Bid Only |

All are active/is_test. Saturn and Pine organization IDs/names are inherited001.
Three active businesses use fixed IDs `30000000-0000-4000-8000-000000000001`/002/003:
Juniper Studio, Harbor Company and Pine Company. Active can_bid memberships are
Juniper/Coworker/Member/Viewer/Bid-only→Juniper, Harbor→Harbor, Pine bidder→Pine.
Active organizer memberships are Saturn→Juniper+Harbor and Pine→Pine. Exactly the
two inherited staff grants exist for these fixed people:Saturn staff→Saturn and
Pine staff→Pine. Typing Member ID/name or using a staff login confers no BID.

## Scope and actual checks

The runner creates one unique synthetic event through staff create/save APIs,
sets three complete lots, approves only01+03 through the real catalog API and
verifies the immutable full snapshot/SQL. It picks the real DB opening75–135seconds
in the future and closing four minutes later; both local metadata and UTC times
use the existing catalog conversion, without clock seams or release timestamp
updates. Only this newly owned event receives operator VIEW/BID inserts:

- VIEW:Juniper,Harbor,Coworker,Viewer.
- BID:Juniper,Harbor,Coworker,Bid-only; Viewer has only explicit admission VIEW.

No preexisting event/grant/bid is reset/deleted. The runner leaves its synthetic
fixture and immutable receipts for review, revokes its own sessions on success,
and records all scoped operator inserts. Re-execution creates a fresh event.
There are no migrations, triggers, clock helpers, global seeds or provider mutations.

Fourteen groups must all execute before exit0/receipt passed:

1. Exact clean source/static hashes, protected generated Preview and no-store auth.
2. Read-only fixed-global/runtime authority/TLS preflight and zero-row privilege denials.
3. One API-created/saved/approved shared-window event, complete01+03 snapshot/SQL,
   then scoped operator VIEW/BID grants; no global authority changes.
4. Scheduled catalog hides every lot; durable NOT_OPEN retry. Staff/member/VIEW-only/
   BID-without-VIEW/unlisted/other-tenant protected transports deny without mutation.
5. Retained390px A opens on real SQL time; exact current person/business, manual
   minimum10000, no auto-bid and immutable earlier NOT_OPEN outcome.
6. Actual A review and held sending with zero writes; then real201/ownedUUID and
   complete durable bid/receipt/standing before visible accepted state.
7. Timestamped offline snapshot/disabled sending; actual Harbor A competing12751;
   original Juniper browser reload GETs exact own receipt and shows current outbid.
   Independent empty browser sees current standing without fabricated owned history.
8. Actual201 commits before acknowledgement drops; unconfirmed UI. Check status
   GETs original UUID and restores exact receipt with no bid/standing mutation.
9. Abort-before/noSQL stays unconfirmed. Original-UUID Check status404 shows
   “Bid not recorded” with enabled Try again and no green/owned success; SQL remains
   unchanged. Try again keeps identical intent.
   Juniper coworker commits independently; stale reviewed Juniper request receives
   actual durable SELF_RAISE409 and remains visibly rejected, with no green result.
10. Other actor's receipt, typed identity/role/member claims, other business and
    unselected/unknown lot accesses deny; full scoped SQL and globals unchanged.
11. Juniper-vs-Harbor equal race on empty lot03:one201/one durable BELOW_MINIMUM;
    exact immutable retries. Eligible nonleader's concurrent duplicate actor/UUID
    submissions both201 but commit only one additional bid/receipt/version.
12. Genuinely formerly authorized receipt/context held across logout and a different
    person's login cannot repopulate current identity or accepted operation ownership.
13. Actual delivered bid begins before close and waits on the independently observed
    runtime FOR UPDATE lot lock; release after real DB close, below five-second
    statement timeout. Durable CLOSED decidedAt follows close, no accepted bid.
    Retained A auto-closes; send disables; earlier accepted replay/receipt unchanged.
14. No page script errors; immutable approval and globals remain exact; every own
    test session is revoked in SQL, denied afterward and auction history preserved.

Root's explicit bounded implementation order for new valid requests is:phase
NOT_OPEN/CLOSED, next-minimum beyondcap AMOUNT_LIMIT, current leading business
UNSUPPORTED_SELF_RAISE, then BELOW_MINIMUM, after current auth/identical receipt
replay. Invalid input/unsupported rulesets precede receipt creation. This is recorded
here as implementation behavior; no frozen003 evidence or contract is edited.
Group9 overlaps same-leading-business and below-next-minimum, so its exact expected
reason is UNSUPPORTED_SELF_RAISE. Single-condition frozen tests remain independent.

The hosted close observer requires a current SQL statement containing FOR UPDATE,
blocking on this runner's holder PID, with xact_start no earlier than the actual
POST delivery bracket. Background standing polls do not satisfy the barrier.
The observer uses the existing runtime connection to read its own role's
pg_stat_activity sessions, so no cross-role query visibility or monitoring grant
is needed. The separate operator connection holds the own lot lock. Inability to
observe the actual barrier is reported, not silently skipped; no additional role
grant is performed by this runner.

## Receipts and limits

Screenshots are actual390×844 Chromium pages:scheduled, review, pending, accepted,
offline, Harbor-leading, outbid, empty-browser standing, committed-unconfirmed,
recovered, rejected, switched-person and closed. Each receipt binds exact source,
event/release and image SHA256. They are not physical-device claims or a simulated
mockup. Publish images only through the approved separately bound evidence commit,
with the application source SHA visible; never deliver only Mac-local paths.

Missing/ambiguous globals, required dependencies/schema, DB identity/TLS or release
setup yield99; reached finite application/assertion failures yield1. Interrupted
execution is not passed. Raw failure receipts remain alongside later fresh runs;
fix runner defects with explicit history/diff and rerun every affected group.
The runner's total deadline is480seconds; launcher510seconds. Capture actual
process exit/duration outside the candidate source tree.

App-process Date skew, real server503 atomic rollback faults, session-expiry while
queued, global revocation and app restart are separately covered by frozen local003
fixtures. This hosted runner does not change schema or global authority to recreate
those cases. No real membership, phone/SMS/email, auto-bid, donations, payments,
production settings or live currency/close policy is established by this evidence.

Preparation v2 fixes response-header decoding for both Playwright page Response
and route.fetch APIResponse, whose installed API has headers() rather than
allHeaders(). Original prepared v1/source/receipt remain in runner-history; this
was found by installed-source inspection before any hosted call, with no claimed
product failure. Pure response-shape controls cover both paths.

Preparation v3 adds each captured Set-Cookie/session value to in-memory failure
redaction before checking cookie security attributes, plus a generic bz_session
redaction fallback. Failed cookie assertions cannot publish test session tokens.
Prepared v2 and its helper-control outcomes remain in additive runner-history.

Preparation v4 corrects the operator-role preflight using the release owner's
verified managed-role evidence:strict runtime flags remain false/NOINHERIT, while
the approved operator needs exact identity/database and nonsuperuser. Its managed
capabilities may be true; no extra grants/role edits occur. All14 hosted groups and
scoped writes remain intact. The incorrect unexecuted v3 and receipts are preserved
with an explicit role-only diff; pure role controls cover allowed and denied cases.


Preparation v5 preserves actual hosted failures `2d799952` (default privileges,
before any event creation) and `2506c6c8` (8 completed groups, then an external
assertion mismatch). The latter runner incorrectly required `unconfirmed` after
an authorized original-UUID receipt404. Frozen BID-X12 requires visible absence
and same-intent Try again at that point; actual A exposes `rejected` plus “Bid not
recorded”. The replacement external helper checks that observable state, explicit
absence text, enabled retry, no green result and no owned request. The transport
abort assertion remains strict `unconfirmed`; all14 groups and SQL assertions
remain, with an added no-mutation comparison and `phone-not-recorded` capture.

The original `phone-outbid` capture remains. An additional
`phone-outbid-standing` capture scrolls the actual standing into view at the same
SQL/owned-receipt checkpoint. Recovery and visual changes have separate retained
diffs in `evidence/remote-manual-bid-runner-history/`. The v4 source and failed
receipt/screenshot hashes remain additive history. No v5 hosted pass is claimed by
these preparation controls; the release owner must rerun every group.
