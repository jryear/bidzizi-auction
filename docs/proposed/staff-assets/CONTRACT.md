# ASSETS successor proposal · durable staff uploads

Status: **PROPOSED_UNFROZEN**, October 8, 2026. Parent authorized executable contract/evidence authoring in `tasks/staging-staff-assets.toml` and `tests/acceptance/staging-staff-assets/`; no product/migration, dependency install, shared grant, runtime or gate has been performed by this author. Parent separately permits gated disposable-synthetic implementation/evidence preparation before shared-staging storage permission. Fresh independent review of this executable packet precedes freeze; one explicit owner decision covers the material shared storage authority/four exact EXECUTE grants and retention boundary in [PERMISSION_AND_EVIDENCE.md](PERMISSION_AND_EVIDENCE.md). Review selects routine caps/normalization/dependency details without separate owner questions. Product source descends from release `375d301c345bc47298dd2945a29bf9583c96fbc9`; actual inspection HEAD/hashes are in [SOURCES.json](SOURCES.json). Parent authorizes independent375 source/gates and one task18 app runtime. MOBILE014 is unlanded after its denied push; do not include it indirectly or require an accepted-mobile rebind. Bind the parent's exact selected375-based source/evidence revision before freeze; upstream publication remains held separately.

The outcome is Saturn staff choosing an actual local event photo, item photo, or sponsor raster logo, uploading it, saving/reloading the event, and seeing those same normalized bytes in saved A and the immutable approved catalog. Upload success and draft-save success are separate confirmations. Photos remain optional; the prototype's image-required publication rule, 8 MB limit, SVG acceptance and browser-local storage are not adopted.

## Storage, scope and format

Use one insert-only `public.bz_staff_assets` table in the existing staging database `bz_staging_e2e`. Reuse `staging_e2e_owner` for migration/function ownership and `staging_e2e_app` for application traffic. No new account, credential, extension, bucket, service, CDN, origin or anonymous audience. This bounded bytea approach keeps the image and its durable request receipt together in the current backup/transaction boundary. A bucket would need its own provisioning, credentials, access and retention approval. This proposal does not select storage for future scale.

Each asset belongs to the server-resolved event and its organization. No asset listing or cross-event asset library is exposed. Reusing a file in another event means another upload. Replacing/removing a draft photo changes a reference; it never overwrites/deletes bytes. All successful uploads, including abandoned ones, are retained during this bounded staging checkpoint. Quotas include abandoned uploads. Cleanup or retention changes need a separately reviewed successor; there is no runtime delete grant or job.

Proposed technical limits for independent contract review to select:

| Boundary | Proposed maximum |
| --- | --- |
| Raw request/file | 2,097,152 bytes; one JPEG, PNG or WebP |
| Decoded input | One frame; each side 1–4096 px; total ≤8,000,000 pixels |
| Stored output | One WebP, each side ≤1600 px, ≤1,048,576 bytes |
| Successful stored rows | 256 per event; 1024 per organization |
| Organization stored payloads | 268,435,456 bytes, including unreferenced uploads |
| Upload work | One active decoder per app process; no queued decoding; 10 s body-read deadline; decoder processing timeout 5 s |

Declare **`sharp: "0.35.5"` as a direct production dependency**, matching the existing lock's transitive version; preserve all other dependency resolutions. A transitive Next dependency is not the decoder contract. Validate declared MIME against signature and decoded `format`, reject animation/APNG/animated WebP rather than silently taking frame 1, and reject corrupt/truncated data. Configure `failOn: "warning"`, `limitInputPixels: 8_000_000`; inspect dimensions and bounded structural frame/container markers before full decode (PNG chunks, WebP RIFF length/features, JPEG end marker). Reject extra payload beyond the valid container, rather than searching arbitrary pixel bytes for marker text. Metadata alone is not content validation. Fully decode, apply EXIF orientation, fit inside 1600×1600 without enlargement, convert to sRGB and encode WebP (`quality: 85`, `alphaQuality: 100`, `effort: 4`). Strip EXIF/GPS/XMP/ICC and other metadata. Preserve alpha. Verify output dimensions, single frame, size and decodability. Reject rather than store an output over the cap. No `keepMetadata`/`withMetadata`, remote fetch, SVG, GIF, HEIC, PDF, data-URL acceptance, original filename, original bytes or client-chosen path is stored. The same **stored normalized** bytes are used everywhere; equality with the original encoded file is not claimed.

The server is the trusted decoder boundary. SQL can verify limits, WebP envelope and byte hash; it cannot prove complete raster decoding or that application-supplied dimensions describe the pixels. SQL/runtime negative controls must preserve this distinction. Decoder semaphore acquisition is nonblocking; overload yields a retryable error. Sharp's timeout starts at processing and excludes time waiting for a libuv thread: it is not a wall-clock cancellation proof. A timed-out response must not release the semaphore until the decoder actually settles; no unbounded background work or `Promise.race` claim of cancellation.

## Prospective schema and immutable request receipt

This is the exact prospective table shape, not an executable migration file:

```sql
CREATE TABLE public.bz_staff_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  org_id uuid NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES public.bz_people(id),
  request_id uuid NOT NULL,
  source_mime text NOT NULL CHECK (source_mime IN ('image/jpeg','image/png','image/webp')),
  source_size integer NOT NULL CHECK (source_size BETWEEN 1 AND 2097152),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  normalization_version text NOT NULL CHECK (normalization_version='raster-webp-v1'),
  mime text NOT NULL DEFAULT 'image/webp' CHECK (mime='image/webp'),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 1600),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 1600),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 12 AND 1048576),
  byte_length integer GENERATED ALWAYS AS (octet_length(bytes)) STORED,
  sha256 text GENERATED ALWAYS AS (encode(sha256(bytes),'hex')) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (event_id,org_id) REFERENCES public.bz_events(id,org_id),
  UNIQUE (uploaded_by,event_id,request_id),
  UNIQUE (id,event_id,org_id),
  CHECK (substring(bytes FROM 1 FOR 4)=decode('52494646','hex')
     AND substring(bytes FROM 9 FOR 4)=decode('57454250','hex')
     AND get_byte(bytes,4)::bigint + get_byte(bytes,5)::bigint*256
       + get_byte(bytes,6)::bigint*65536 + get_byte(bytes,7)::bigint*16777216
       = octet_length(bytes)-8)
);
CREATE INDEX bz_staff_assets_event_idx ON public.bz_staff_assets(event_id);
CREATE INDEX bz_staff_assets_org_idx ON public.bz_staff_assets(org_id);
```

The migration explicitly revokes all effective table/column privileges from PUBLIC and every non-owner recipient inherited from default ACLs; no change to those roles' default ACLs or historic relations is permitted. The trigger function also has PUBLIC/runtime EXECUTE revoked: trigger invocation requires no direct runtime grant. Existing SQL function definitions, owners and ACLs stay exact.

An owner-created `bz_staff_asset_immutable()` trigger function raises on every UPDATE or DELETE, with a BEFORE UPDATE OR DELETE trigger on this table. Functions never update a row. There is no backfill/rewrite of existing event JSON, lot JSON, approvals, requests, bids or receipts. No cross-org deduplication/hash lookup exposes whether someone else uploaded the same file.

## Prospective function contracts

All four functions: `LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp`, fully qualified relations, owner `staging_e2e_owner`, no dynamic SQL, exact argument validation, PUBLIC EXECUTE revoked in the same migration transaction. Session hash is supplied only by `sessionHash(request)`, never a browser parameter. Put/recover/read use the lock order below; validate is the deliberately non-row-locking predicate specified below. Recheck session expiry with `clock_timestamp()` **after the last blocking wait**; use no browser time or pre-wait authority result. Revoked/expired/inactive access fails on recovery and replay as well as new operations.

| Exact signature | Required behavior |
| --- | --- |
| `bz_staff_asset_put(text,uuid,uuid,text,integer,text,bytea,integer,integer) RETURNS jsonb` | Arguments: session hash, event ID, request UUID, source MIME, source size, source SHA256, normalized bytes, width, height. Lock current same-org staff authority; serialize request and org quota with transaction advisory locks in a fixed order. After waits recheck authority/time, then lookup actor/event/request receipt. Same source MIME/size/hash returns that original metadata without inserting or changing quotas; different binding gives CONFLICT even if normalized output looks equal. For new rows enforce format/length/dimensions and count/byte quotas atomically, generate opaque ID/created time/hash in DB, insert exactly one row. Never trusts a client actor/org/asset ID. |
| `bz_staff_asset_recover(text,uuid,uuid) RETURNS jsonb` | Session hash, event ID, request UUID. Current same-org staff; exact current actor/event/request only. Return metadata or MISSING; no filename/source hash/bytes, listing, other actor receipt or side effect. |
| `bz_staff_asset_validate(text,uuid,uuid[]) RETURNS jsonb` | Session hash, event ID, distinct asset IDs (0–121). A read-only current-authority/ownership predicate: no `FOR SHARE`, `FOR UPDATE`, advisory locks, row writes or nested locking auth helper. All IDs must exist in that event/org; return only `{valid:true}` or a JSON error. Save/publish already holds authority and event locks in the order below, calls it after its waits in that same transaction, and performs the final fresh authority/time check before mutation or old receipt replay. SQL checks ownership/existence of immutable assets; `draft.ts` checks syntax/per-use alt text. Standalone EXECUTE neither reserves authority/revision nor grants later save/read rights. No enumeration or bytes. |
| `bz_staff_asset_read(text,uuid,uuid,text,uuid) RETURNS TABLE(mime text,width integer,height integer,byte_length integer,sha256 text,bytes bytea)` | Session hash, event ID, asset ID, context, binding. Exact contexts: `upload` (binding=request UUID, own receipt plus current staff); `saved` (binding=NULL, current staff and reference in current saved event/lots); `staff-approved` (binding=approval UUID, current staff and reference in that exact approved snapshot); `published` (binding=approval UUID, current VIEW and reference exposed by that exact authorized catalog). Never returns unreferenced bytes through saved/published paths. Asset event/org must match context. |

The three JSON functions return exactly `{error: "INVALID" | "DENIED" | "MISSING" | "CONFLICT" | "QUOTA"}` on finite failure; they never return an asset on failure. Put success is internally `{asset: AssetMeta, replayed: boolean}`: false on its serialized insert, true on exact prior receipt. The route strips `replayed` and selects201/200 atomically, avoiding a racing recovery preflight. Recover success is `{asset: AssetMeta}` and validate success `{valid:true}`. **Read does not return JSON/error rows:** success is exactly one complete TABLE row, failure raises a reserved SQLSTATE with fixed provider-neutral text and no DETAIL/HINT: `PBA01` null required/invalid typed argument or illegal saved binding, `PBA02` no current authenticated active test session/person, `PBA03` unavailable scope/reference/context (including inactive/missing staff/VIEW grant, wrong event/org/approval/request, unknown non-null context, missing asset). A malformed textual UUID is rejected by the route before SQL; PostgreSQL's typed argument conversion precedes a function body and is not claimed to raise PBA01. Zero/multiple result rows are an unexpected failure, never a successful empty image. The route maps only those exact SQLSTATEs to 400 `VALIDATION`, 401 `UNAUTHENTICATED`, 404 `ASSET_UNAVAILABLE`; other database/timeout/deadlock/commit errors map to 503 `UNAVAILABLE`. It never forwards SQL messages/details. Build/send the binary response only **after the complete transaction succeeds**, so denial or failed commit emits no image bytes or partial image stream.

Every input is mandatory except the read binding for `saved`; reject null/malformed hashes, UUID bindings, arrays with null/duplicate IDs, unknown contexts and invalid integer ranges. Reads evaluate the accepted server catalog visibility predicate: event/sponsor assets only where their DTO is exposed, item assets only where that approval's item DTO is exposed. ASSETS does not broaden browsing, grant VIEW/BID or choose pre-opening publication policy. Rebind the exact visibility predicate to accepted PUBLICATION008 when that seam lands. Missing/foreign/unreferenced image resources are uniformly unavailable.

## Cross-function and caller lock order

The existing Save/publish path acquires authority through `staff()` (`identity()`'s session/person SHARE selector, then its staff-grant/org SHARE selector), then the event UPDATE lock. Preserve that direction. No ASSETS route may start with an event, asset or advisory lock and then acquire authority. An unlocked event→org lookup may supply a candidate key before locking; it confers no authority, and the locked event must still match it or the transaction denies without acquiring a different org out of order.

| Order | Locks and ordering rule |
| --- | --- |
| 1 · authority | Existing session/person SHARE selector first; then existing active staff-grant/org SHARE selector for staff contexts. Published reads use current identity selectors, target org existence SHARE and exact event VIEW SHARE within this authority tier. Multiple staff/org rows follow the existing organization ordering, with UUID tie-breaker for new selectors; all these locks are SHARE. Do not call these locking selectors again after entering a later tier. |
| 2 · event | Exactly one event: SHARE for put/recover/read, UPDATE already held by Save/publish. No SHARE→UPDATE upgrade in an asset function and no second event acquisition. Validate takes no event lock. |
| 3 · request | Optional transaction advisory lock: `hashtextextended('bz-asset-request:' || actor_uuid || ':' || event_uuid || ':' || request_uuid, 0)`. Put, recovery and `upload` content read use the identical key; other content reads do not. Save keeps its existing operation request advisory lock after event acquisition; publication keeps its existing event serialization. Asset functions never take a Save/publication request key. |
| 4 · quota | Put only: transaction advisory lock `hashtextextended('bz-asset-quota:' || org_uuid, 0)`. Acquire after the request lock, never before event/authority. Counts and byte sum are checked while held through insert/commit. No other asset/caller operation acquires this key or later seeks another event. |
| 5 · references | Saved read: current saved lot rows, ordered by position/id, SHARE; event draft is protected by tier 2. Approved read: exact approval header SHARE, then exact approved lot rows ordered by position/lot UUID, SHARE. Upload/recovery have no catalog reference locks. No predicate may lock a foreign event's rows while probing rejection. |
| 6 · asset/receipt | Put replay, recover and read lock only the exact eligible immutable asset rows SHARE, sorted by asset UUID if plural. New put inserts its one row after quota check; FK keys refer only to already-held person/event/org. Validate reads immutable asset ownership without row/advisory locks. No later authority/event/request/quota lock is acquired. |

After the last acquired/waited lock, perform a **non-row-locking fresh statement** that joins the same session/person/event/org and required staff/VIEW authority, with a new DB `clock_timestamp()`, confirming all required active/test/not-revoked/expiry/scope predicates and the same actor/org/event binding. Recheck after any later blocking insert/read before returning success, and before returning an existing receipt; no new locks are acquired by this check. A serialized queued revocation cannot change the held authority rows until this transaction releases them; elapsed session time can still expire and must deny. Lock/statement timeout or deadlock is infrastructure `UNAVAILABLE`, not behavioral acceptance or automatic success.

Nested validation is intentionally the exception to lock acquisition, not to authorization. Its current-authority query and immutable asset SELECTs use no explicit row/advisory locks. The enclosing Save/publish must already hold the session/person/required grant/org and event locks before calling it, plus its request serialization where applicable. It cannot invoke a locking auth helper from inside validate after holding event. After caller waits and validate's current predicate, caller checks time/current authority immediately before mutation or original receipt replay, and again after any subsequent blocking database work before commit/acknowledgement. A standalone validate result is only a predicate at its decision statement; it is no reservation and never substitutes for those caller locks/checks. This keeps a queued logout/revocation from becoming an authority-after-event wait inside Save.

## API, fields and recovery

```ts
type UploadedRef = `asset:${string}`; // runtime: lowercase UUID only
type PhotoRef = LegacyFixedPhotoPath | UploadedRef;
type SponsorLogoRef = LegacyFixedLogoToken | UploadedRef;
type AssetMeta = {
  ref: UploadedRef; eventId: string; requestId: string;
  mime: "image/webp"; width: number; height: number;
  byteLength: number; sha256: string; createdAt: string;
};
// POST success 201; identical replay 200; owned recovery 200.
type AssetResponse = { asset: AssetMeta };
// Optional addition to a fresh catalog projection, not to old approval receipts.
// Needed for header images when the old scheduled DTO has catalog:null.
type CatalogAssetContext = { version: 1; approvalId: string };
// top-level catalogResponse.assetContext?: CatalogAssetContext
```

`POST /api/admin/events/[eventId]/assets` accepts a raw single raster body with exact allowed image Content-Type and `X-Bidzizi-Request-Id: <UUID>`. Authenticate event staff before reading/decoding; require exact configured mutation Origin/host/test boundary again. Do not loosen the existing JSON `mutationMode` or 64 KiB draft body limit. Stream-count actual bytes even with missing/false Content-Length; cancel on overflow/deadline. After normalization, the SQL function reauthorizes current authority before commit. `GET /api/admin/events/[eventId]/asset-uploads/[requestId]` recovers metadata; no GET creates or attaches an asset.

Content routes select the function context server-side: `/api/admin/events/[eventId]/asset-uploads/[requestId]/content` (own upload); `/api/admin/events/[eventId]/assets/[assetId]` (saved); `/api/admin/events/[eventId]/catalog-approval/[approvalId]/assets/[assetId]` (staff-approved); `/api/catalog/events/[eventId]/assets/[assetId]?approvalId=<UUID>` (published VIEW). Browser-controlled mode cannot substitute for these predicates. Binary success is `image/webp`, fixed inline filename `image.webp`, `private, no-store`, `nosniff`, same-origin resource policy, no CORS allow header, no public caching/redirect/presigned URL/304 shortcut. Denial never returns bytes/provider diagnostics. Normal JSON contains refs/metadata, never image blobs.

The own-upload content URL carries no asset ID. Resolve its current actor/event/request metadata through recover in a completed transaction, then invoke read with that opaque ID and exact upload/request context in a **new** transaction. Read independently reauthorizes and checks the receipt after its waits; metadata recovery is no reservation or byte authority. Do not nest recover→read locking helpers inside an already event-locked transaction. Use existing actual `[id]` event route directories; do not introduce a conflicting Next dynamic segment name at the same level. Candidate additive migration path is `migrations/016_staging_staff_assets.sql`; no such file is authored by this packet.

Fresh catalog projections with exposed opaque refs include `assetContext` from the authoritative approval. Consumers validate its version/UUID and agreement with any non-null `catalog.approvalId`; a missing/mismatched context on an opaque-ref packet is unavailable. Old fixed-only payloads need no new context; do not rewrite old approval/request receipts to add it. Staff derives event/revision from the confirmed saved packet, staff-approved context from its existing approval receipt, and working context from owned upload metadata. No supplied URL is accepted.

API errors: malformed request=400 `VALIDATION`; type/content/frame=415 `ASSET_INVALID`; byte/pixel/output limit=413 `ASSET_TOO_LARGE`; changed request binding=409 `IDEMPOTENCY_CONFLICT`; storage quota=409 `ASSET_QUOTA`; decoder busy=503 `ASSET_BUSY`; body deadline=408 `UPLOAD_TIMEOUT`; uncertain infrastructure=503 `UNAVAILABLE`. Owned missing recovery=404 `ASSET_UPLOAD_NOT_FOUND`. Preflight unauthenticated metadata/upload requests use401 `UNAUTHENTICATED`; their internal SQL DENIED after waits maps to403 `FORBIDDEN`, with no asset. Unauthenticated reads remain401; authenticated missing/foreign/unreferenced/context-invalid image reads uniformly return404 `ASSET_UNAVAILABLE`, with no existence detail. Save/publication reference checks fail atomically without revealing which foreign ID exists.

`event.cover` and `lot.image` deliberately accept fixed paths or uploaded refs; `sponsor.logo` accepts fixed tokens or uploaded refs. Existing lot `alt` remains per-use; add optional `event.coverAlt` and `sponsor.alt`. New opaque attachments require trimmed 1–300-character alt text on save; historical fixed references retain historical behavior and absent optional fields. Sponsor description may repeat its name when the mark stands alone; when the adjacent name already names it, the renderer may hide that redundant logo from accessibility. Escape all alt/name text. This requirement does not make an image mandatory. Alt changes are draft data; published text and refs remain fixed together.

Studio uses actual file inputs with these honest limits, confirmed metadata, and current event/actor/target generation checks. Persist only a small pending attempt descriptor scoped to actor/event/request; never local file bytes or cookies. Uploading/uncertain blocks replacing that target and save/publication until resolved. Lost acknowledgement triggers owned recovery with the same request UUID. If absent, retry the same file/request; if file is unavailable after reload, keep the last saved image and invite re-selection. Recovery never silently assigns to a changed item/sponsor slot/event/account; explicitly select a current target for recovered metadata after reload. A completed upload may attach locally as unsaved; saved A changes only after durable draft acknowledgement. Failed/conflicting save retains last confirmed preview and recoverable upload; logout/authority denial clears private data/object URLs and ignores late responses. Unavailable image shows a truthful placeholder, never a fixture replacement.

## Source seams and historical successor

- `src/server/draft.ts`: replace only fixed-reference validation with the explicit union; preserve all legacy tokens/paths, add optional per-use alt fields without inserting them into historical JSON/receipts.
- `src/server/staff.ts`: validate opaque event/org ownership atomically with save; packet remains lightweight. Current save deletes/reinserts lots, so immutable assets cannot depend on a lot FK.
- `src/server/catalog.ts`: approval validates refs before snapshot insertion; snapshots retain exact ref/alt strings. Replays return original receipt; no replacing approved JSON. Consume additive publication through that independently accepted seam.
- `public/staging-admin/studio.js`: fixed picker and `img()` become upload/legacy resolvers; field extraction, sponsor controls and upload recovery change deliberately. Working, saved and approved renderers use their correct content routes.
- `public/staging-bidder-preview/src/{data,ui,views}.js` and `public/staging-catalog/{data,ui,views}.js`: resolve typed refs to generated same-origin context URLs, never interpolate a supplied arbitrary URL; sponsor marks branch between existing fixed vectors and actual raster images.
- **010** `src/features/staging-display-results/read-model.ts` rejects non-fixed images today and `asset()` blindly prefixes the fixture path. Successor must validate only legacy paths/opaque refs, derive the published URL from validated event/approval context, and preserve strict unknown/foreign/malformed behavior. No 010 authority or result semantics change.

Freeze a new ASSETS requirement/evidence successor; keep historic tasks, helpers, `_kernel`, fixed-image tests and receipts byte-exact. Explicitly version only old feature-absence/allowlist assertions whose expectation changes. The trusted base must contain reviewed contract and independent executable evidence before implementation. Local GREEN is readiness for independent review and accepted integration; staged completion still requires exact hosted synthetic upload/save/preview/publish/VIEW evidence.
