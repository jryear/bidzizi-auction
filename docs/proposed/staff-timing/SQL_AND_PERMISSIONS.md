# Selected JSON persistence and permission boundary

Status: **root-selected routine storage choice; independent review pending**.
This supersedes the earlier unfrozen relational proposal for TIMING007; no old
frozen evidence is changed. TIMING007 introduces **no schema migration, relation,
column, function, sequence or GRANT**. Existing001–003/009 migrations remain exact.
No migration number is reserved. All proposed connected installation/publication
still follows root/parent authority; no provider mutation is performed here.

## Exact internal JSON representation

Use existing tables/keys and bounded server-validated JSON. Inputs/public DTOs
are INTERFACES.md; reserved internal metadata is generated server-side and never
accepted from client event/group/lot objects.

```ts
// bz_events.draft for fresh v2 events only:
type StoredEventV2 = EventFieldsV2 & {
  _timing: { version: 2; groups: DraftGroup[] };
};
// bz_catalog_approvals.event_snapshot for fresh v2 roots only:
type StoredEventSnapshotV2 = EventFieldsV2 & {
  _timing: {
    version: 2;
    groups: FrozenGroup[];
    initialLots: {
      lotId: string; sourcePosition: number;
      catalogPosition: number; number: string;
    }[];
  };
};
type FrozenGroup = DraftGroup & {
  timezone: string; opensAt: string; closesAt: string;
};
// bz_catalog_lots.snapshot for fresh v2 selected rows only:
type StoredApprovedLotV2 = ApprovedLotV2 & {
  _origin: { version: 1; initialApprovalId: string; publicationId: null };
};
```

Persisted `_timing.version:2` selects the version-aware draft/root resolver.
Missing marker means genuine v1; malformed marker/payload is unavailable/invalid,
never a default v1 or event-window fallback. V1 JSON/null/main meanings and exact
request/response bytes stay unchanged. New v2 create stores empty explicit event
endpoints and empty groups, not a fixture. It uses the current event UUID/org/
revision and existing request ledger in the same transaction.

Before approval, one Save stores complete EventFieldsV2 plus the submitted group
set under `_timing`, and owned lots under existing `bz_lots` rows. Its canonical
request payload uses the accepted public SaveV2 shape, not silently generated
metadata. Server allowlists reject reserved `_timing`, `_origin`, provider,
position/number, resolved UTC, phase, standing or origin inputs. All group UUIDs,
references, trimmed names, dates/times/timezone, completeness and selected bounds
are validated in the same locked transaction. Partial empty draft endpoints may
save; malformed nonempty endpoints reject. No source JSON is a session/permission.

Initial approval writes existing root/content rows, frozen groups/resolved own
item timing, immutable initial manifest and owned response together in one
transaction. The existing root's opens_at/closes_at are the explicit independent
event UTC schedule. Required legacy local_date/local_start/local_end compatibility
columns receive event startDate/start/end; complete endDate and timezone remain
in event_snapshot.timing. V2 receipts decode full LocalTiming from that snapshot;
the legacy single local_date is never presented as both v2 dates. V1 receipts use
original columns/JSON exactly. No old root is updated/backfilled/adopted.

Every public event **and lot** projection uses an explicit validated field
allowlist. Strip reserved event `_timing` and lot `_origin` in draft packets,
initial ApprovalV2 snapshot receipts, catalog list packets and catalog detail
packets; extract declared groups/effective timing separately. Never spread raw
stored snapshots through current helpers. Stored operation responses are already
constructed public DTOs; exact replay returns those original bytes/values, never
newly injected persistence metadata. Bid receipt fields also remain their exact
public immutable schema, with no internal metadata. Missing required v2 metadata, malformed/present version,
initial manifest or effective target timing yields provider-neutral503
`UNAVAILABLE`, no partial packet, metadata/ref disclosure or mutation. Absent
marker on genuine v1 is distinct from a malformed/present v2 marker; no legacy
fallback or placeholder schedule repairs corruption. A genuine unadopted v1
target through a v2 route retains PREPARATION_VERSION_CONFLICT; inconsistent
root/target metadata for known persisted v2 state is unavailable.

The frozen initial manifest captures every selected lot ID, original saved
sourcePosition, contiguous selected catalogPosition, and independently derived
number. Source positions preserve holes; catalog positions preserve the existing
unique row/order key. Manifest order and size/unique IDs are validated against
exact saved rows before insert. Complete frozen groups include unused saved
ones. Effective item timing is immutable in its existing selected snapshot,
with source/default nullable UUID, local endpoints, name and UTC instants.

The internal `_origin` records initial version1 under the original approval ID.
Origin/phase/standing are distinct: fresh phase and changing standing are never
inserted into immutable metadata or operation/bid receipts. For007 only initial
origin is supported. 008 must separately bind concrete append origin/publication
metadata; it cannot alter this initial origin or assume its ledger permissions.

## Original receipt, source row and physical FK invariants

V2 original approval GET reads **only** catalog rows listed by the immutable
initial manifest, in catalogPosition order, and validates exact ID/position/number
agreement. It returns the complete original event/group/lot timing receipt shape.
It never uses the current read-all receipt helper after additions. Original
owned request replay still returns stored exact response under current authority,
before a fresh write's version/cutoff guard. Replays advance no event/catalog/
standing state. Legacy original GET/replay remains the v1 shape and exact values.

Later008 can insert additive immutable content+own timing in existing
bz_catalog_lots under the same root approval ID. The initial manifest, initial
snapshot rows, original sourceRevision, UTC/local root values and original
response stay exact. Existing PK `(approval_id,lot_id)` prevents repeated target
publication in the same release. Do not use latest catalogVersion/publicationId
as releaseId or reset old standing/bid/receipt data.

Standing/manual bids retain their current FK to bz_catalog_lots and root composite
FK, accepted-bid FK, uniqueness/count constraints and immutable rows. No separate
target registry/FK replacement is required: the stable existing content row holds
its effective timing. Audience and bid code use one strict version-aware resolver.
Malformed/missing v2 target timing rejects; it never silently resolves a custom
item through event timing. Reads do not initialize standing or write metadata.

After initial approval, v2 private Save determines the published set from current
catalog rows, preserves their physical bz_lots rows byte-exact (including position/
data) and edits only private rows. New positions begin after occupied published
positions; do not compact numbering. Provider comes from current org before
approval/root org snapshot for immutable publication. Event timeline/frozen group
set are not post-approval mutation inputs. Total published+private remains100.
Published source IDs never vacate/reuse; foreign existing source IDs and published
IDs in a private-save payload reject. This does not invent a global tombstone
rule for never-published deleted draft IDs or a uniqueness precondition across
historic releases.

## Permission truth and superseded proposal

Keep the existing provider/project, owner and nonowner runtime. No new secret,
role, database, schema-wide/default ACL, auth/admission/member/bid-history rights.
No TIMING007 GRANT is requested. Existing runtime direct rights on staff JSON
and catalog INSERT/SELECT remain the shipped server-mediated trust boundary;
read effective table/column ACLs and role membership before installation and
confirm no runtime catalog UPDATE/DELETE capability. Root's JSON selection does
not authorize writing connected data while publication is held.

Nested JSON shape, group membership, manifest completeness/ordering and exact
local-to-UTC conversion are **server transaction invariants**, not independently
SQL-enforced nested constraints. Existing SQL checks cover object/ID shape,
opens<closes root and composite physical identity. Evidence must independently
compare full stored JSON with known inputs and reject malformed/foreign data.
This packet makes no SECURITY DEFINER or DB-enforced HTTP identity claim.

Superseded unfrozen alternative: preparation version column plus new
bz_draft_timing_groups, bz_catalog_timing and bz_catalog_targets, with 8 proposed
runtime table privilege pairs. **Do not create these or apply their grants.**
They are unnecessary for bounded007 and are no longer this contract's interface.
The least-permission assessment retains why that draft changed; it is not frozen
product/evidence history. PUBLICATION008 may separately need an immutable
publication/request ledger and exact new ACLs, which must be reviewed/approved.
ASSETS and ADMISSION proposed EXECUTEs/storage scopes remain independent and
unapproved here; this choice neither approves nor removes those requirements.

## Clock and caller lock order

Existing-event order: current session/person→staff grant/org→event→own operation request key, then owned
source/reference/standing work in deterministic order. No authority selector or
SHARE→UPDATE event upgrade after entering event/request tier. New JSON requires
no group/quota/target table locks. After each relevant wait, capture fresh DB time
and nonlocking current predicates for same actor/event/org, active/test/not-revoked/
expiry/required grants. Recheck before mutation/replay and after later blocking
DB work before acknowledgement. Queued revocation behind held authority locks
linearizes later; elapsed expiry while held must still deny.

New create has no event row to lock: current session/person→staff grant/org→owned
create request key→new server-generated event UUID INSERT. Its current-authority
check follows the request wait before insert/replay and later blocking work.
It never locks an existing event after the request key; the shipped v1 create
order/namespace/recovery remains unchanged. This exception cannot be used to
invert the existing-event Save/approval order.

ASSETS nested validate takes no row/advisory locks and no new authority locks.
Caller already owns authority/event/request; validates the exact complete ref set
atomically, then repeats fresh authority/time after subsequent waits. Freeze
real held event/standing/ref-wait and compatible concurrent Save/approval/ASSETS
with queued logout/revocation witnesses. Deadlock/timeout is infrastructure99,
never behavioral acceptance1, automatic success or an excuse to weaken guards.
