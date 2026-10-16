# Narrow JSON alternative assessment

Status: **root selected the JSON seam; independent review pending**. Root
requested this comparison and explicitly selected the least-permission existing
JSON seam. The main packet has been coherently rebound; its earlier unfrozen
relational draft and 8 proposed table privilege pairs are superseded. No old
frozen evidence is altered. This file is no installation or publication approval.

## Finding and recommendation

**Existing JSON storage can satisfy the bounded TIMING007 invariants without new
relations or runtime GRANT statements. Root selected it for fresh v2 events, subject to independent contract review.**
At the retained100-item/group scale, no TIMING007 query requires a new indexed
registry: existing event UPDATE serialization, unique approval/event, catalog
PK `(approval_id,lot_id)`, source lot ownership and current standing/bid FKs
already provide the physical keys. New table constraints make metadata easier
to query/validate, but are not a necessary authority boundary for this existing
server-mediated JSON design.

The JSON alternative deliberately keeps the same native routes/public DTOs,
default/custom schedule resolution, immutable receipt meaning and post-wait
authority/ASSETS caller order. It changes the **internal persistence seam only**.

## Concrete possible internal representation

```ts
// bz_events.draft, fresh v2 rows only:
type StoredEventV2 = EventFieldsV2 & {
  _timing: { version: 2; groups: DraftGroup[] };
};
// bz_catalog_approvals.event_snapshot, fresh v2 roots only:
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
// bz_catalog_lots.snapshot, fresh v2 selected rows only:
type StoredApprovedLotV2 = ApprovedLotV2 & {
  _origin: {
    version: 1; initialApprovalId: string; publicationId: null;
  };
};
```

Here `ApprovedLotV2.timing` is the immutable effective local/UTC timing already
proposed in the public interface. Reserved internal keys are generated only by
the server, never accepted as save/approval inputs or returned as draft event
fields. Version discovery reads the persisted `_timing.version` marker; no
version is inferred from `windowId:null` or missing fields. Old v1 JSON lacks
the marker and remains byte-exact. Existing event top-level content fields remain
available to current list/read wrappers; v2 wrappers explicitly extract nested
timing and remove reserved metadata. No default metadata is inserted into old
rows, requests or responses.

Fresh v2 approval uses existing required root columns for its explicit event
UTC opens/closes and the startDate/start/end local compatibility columns; full
cross-date local endpoints are in `event_snapshot.timing`. Its v2 GET/receipt
reads the complete canonical timing from that snapshot. Old v1 GET/receipt reads
the original columns exactly. The legacy single `local_date` is never presented
as both v2 dates. This avoids adding columns or granting newly named column
permissions while preserving old root constraints/values.

## Why immutable original receipts and old physical FKs still hold

The frozen `_timing.initialLots` manifest captures the exact chosen saved IDs,
source positions and numbers in initial approval's existing transaction. Initial
receipt GET reads only those catalog rows and orders them by that manifest,
not all current catalog rows. Existing request replay still returns the stored
original response. Later008 inserts additional immutable content+timing rows in
existing `bz_catalog_lots`; it never changes the root manifest or old snapshots.
Standing/manual bids continue to reference the existing catalog relation and
original approval ID. No FK replacement or historical backfill is required.

After approval, v2 private Save determines the published set from the root's
existing catalog rows, leaves their physical `bz_lots` source rows unchanged,
and edits only private rows. Published source IDs are therefore never vacated
or reused through Save; same-root catalog PK prevents repeated publication.
Reject foreign existing source IDs with current ownership queries, and reject
published IDs from private-save inputs. This is prospective published identity
protection; it does not invent a global tombstone policy for never-published
deleted draft UUIDs or impose uniqueness across historical releases. If such a
tombstone requirement is intended, it needs its own explicit bounded invariant
and storage review rather than being implied by "vacated".

No standalone target row is required to resolve timing: the stable existing
`(approval_id,lot_id)` content row contains `timing`. Both audience and bid paths
must call the same strict version-aware resolver, reject absent/malformed v2
timing, and never fall back to event timing for a malformed custom target. ASSETS
uses the exact published row refs and root event/header snapshot as before.

## Limits and permission truth

JSON shape, group membership, manifest completeness/ordering and exact unique
local→UTC conversion are application transaction invariants, as current event/
lot content validation already is. Existing SQL checks cover object/ID shape,
opens<closes root and composite physical identity; they do **not** independently
prove every nested timing/manifest field. Contract/evidence must say so and
verify independent complete SQL plus malformed input rejection. Do not market
this as a database-enforced SECURITY DEFINER authority boundary.

The existing nonowner runtime already has the relevant direct INSERT/UPDATE/
DELETE rights on staff draft JSON and INSERT/SELECT on catalog history; verify
effective ACLs against the exact then-current environment before deployment.
This alternative requests no new role/table/column/function GRANT, provider,
secret, schema-wide right or auth/admission data capability. Introducing versioned
timing metadata is still reviewed schema/product meaning, not permission to
write connected data before the parent releases installation/publication.

PUBLICATION008 may still require its own immutable publication/request ledger
or additional ACLs for recoverable append versions; that is a separate precise
permission delta. The JSON TIMING007 option cannot claim to remove008's eventual
permission need or encode a changing catalog version in the immutable initial
root. Its final accepted origin/version seam must be rebound before either task
freezes.
