# Staff auction rehearsal decision package — October 8, 2026

**Status: APPROVED FOR LOCAL PREPARATION AND IMPLEMENTATION SUBJECT TO PRE-FREEZE REVIEW AND BASELINE_READY**

The owner approved this coherent rehearsal and the three scoped policy/capability groups below. The earlier policy holds are resolved within this scope. Resident Sol Medium is authorized to prepare and verify the contract/evidence, repair fixtures, integrate MOBILE014, and implement only after independent pre-freeze review and meaningful BASELINE_READY. This planning record is not a frozen executable contract or release receipt. Connected migration/grant installation and staging deployment require a separate release decision after exact changes and candidate evidence are ready.

## Verified baseline and preserved work

The current integration is `/Users/jryear/Documents/Codex/2026-10-08/task-3/integration`, on branch `codex/bidzizi-local-recovery`, at exact HEAD `591686a4ecb38f64e29fcdf81f99d170d25872f5`. Read-only checks found a clean working tree and no commits since that expected HEAD before this record was created. This new planning file is the only intended working-tree addition; no commit is authorized.

Application paths match accepted snapshot `e0cef66f650bbfbf55d60862b3abe90127e5382f`. All eight Entry product files match implementation `22f2071`. Accepted Studio checkpoint `d631d70c6a721b528907e43af060e5e2dc7ce054` and Entry checkpoint `c10783537340549158d32b2c9a0c88336d01b6c3` remain intact.

Retained bounded recovery evidence records 96 baseline passes, five finite baseline failures, and 101 candidate passes, with zero unverifiable assertions. The raw claim hash matches its handoff. Entry runs on the actual kernel base and candidate, but 32 inherited groups deliberately select fixed older `e0cef66` in both phases. Those results establish their recorded bounded history; they do not prove this proposed complete journey.

MOBILE014 remains unlanded and excluded from this integration. Its separate clean checkout is at `4782fdc70e92fe5fa12d7d3dff2279d5c23d6659`, with retained local acceptance of 38 candidate assertions and independent source review. Its four product changes affect `src/app/events/[id]/event-access.tsx`, `public/staging-catalog/app.js`, `public/staging-catalog/bidding.js`, and new `public/staging-catalog/reconcile.js`. Earlier publication attempts were rejected. The owner now explicitly approves local MOBILE014 inclusion; connected release remains separately held.

The last recorded hosted revision is older `375d301c345bc47298dd2945a29bf9583c96fbc9`, deployment `dpl_D2HLsiidFERFRnRFPAzwDWLyBeVU`. This is retained source/provider evidence, not a fresh remote readback or evidence of the new rehearsal.

The external read-only kernel at `/Users/jryear/code/_kernel` is version 3.1.0. VERSION and verifier source agree; all 12 manifest entries match. Its task template uses schema 2. No gate was run during this planning audit. Existing repository AGENTS references 3.0.0 and its older task template uses schema 1; prepare new contracts from the external schema 2 template without rewriting historical packets.

## Approved coherent tranche

Deliver one staff-created synthetic auction rehearsal combining item image uploads, configured increment rules, one event window, and one initial publication before opening. Reuse accepted Studio and Entry, and integrate the reviewed MOBILE014 changes onto the then-current source with fresh proof.

Staff create a new event through the product, upload synthetic item photos, configure the approved schedule and rules, save and inspect the saved bidder preview, publish the saved roster, enable Entry, and share the actual event link and decoded QR. Two distinct private attendees on phones browse, bid, become outbid, and rebid. Reload and uncertain-response recovery preserve the original request identities and durable outcomes. Updates preserve active input and interaction while still applying current standing, authority and closure. The server rejects a late bid and presents readable closed standing.

Preserve the selected Studio and Design A bidder visual direction, including the accepted native saved phone preview. Final standing is not award finalization.

Defer custom group windows, additive publication, rescheduling or replacement, proxy bidding, final awards and exports, payments or ledger posting, real SMS/member linkage, and donation/watch expansion. The accepted broader group-window and additive-publication direction remains on the roadmap; this narrower rehearsal does not choose their unresolved future bounds.

## Approved decision 1: increments, denomination and publication terms

The owner approved the following event-default tiers, selected from the current highest accepted bid, in displayed synthetic Saturn trade dollars:

| Current highest accepted bid | Minimum raise |
| --- | ---: |
| [0, 500) | 25 |
| [500, 1,000) | 50 |
| [1,000, 2,500) | 100 |
| [2,500, infinity) | 250 |

Allow an optional positive fixed per-lot override. With no accepted bid, the opening amount is the minimum. Otherwise, the minimum is the current highest amount plus the applicable raise. Accept any amount at or above that minimum within the cap; exact multiples are not required. A stale submission must never be silently increased to the new minimum.

Represent all amounts as exact integer minor units. The owner explicitly approved synthetic Saturn trade dollars, scale 100, and the existing inclusive cap of 1,000,000,000 minor units, equivalent to 10,000,000 displayed units. Use a distinct new policy/ruleset and denomination token, with a readable event disclosure that these are synthetic trade-dollar bids and no payment or settlement occurs.

The current implementation is `staging-usd-manual-v1`, currency `USD`, scale 100, with the same inclusive cap. Those are historical synthetic fixture semantics. Do not convert, relabel, or reinterpret historical USD bids or receipts. Earlier recorded trade-dollar approval concerned donations. The new owner approval below now resolves auction denomination, scale and cap for this synthetic rehearsal. The precise new machine-readable denomination token remains a routine contract interface to bind distinctly from historical USD.

Initial publication freezes the roster, opening amounts, effective rules and overrides, denomination, scale, cap, and exact schedule. Immutable image assets are bound to that published snapshot. Later draft or event-default edits cannot change published terms.

## Approved decision 2: one window and initial publication

The owner approved one shared event window with explicit start and end dates and an IANA timezone. Use America/Los_Angeles as the UI default and store the resolved instants in UTC. End must be strictly after start. Support cross-date schedules. Reject ambiguous or nonexistent local-time inputs unless an explicit, validated disambiguation resolves them; never guess an instant silently.

A fresh initial publication requires a final database-time authorization decision strictly before opening, after all relevant lock waits and current-authority checks. A transaction authorized before opening may finish committing or return its response after opening. Publication, its immutable snapshot and its receipt must commit atomically. A fresh decision at or after opening rejects; exact recovery of an already committed publication remains allowed under current authority.

**Amended pre-freeze transaction boundary:** Sol must prepare and Astra must independently review the final database-time decision after relevant waits and authority checks. Evidence must distinguish a fresh decision at/after opening, which rejects, from a decision strictly before opening whose atomic commit or response occurs later, which is allowed. Exercise both lock waits and commit-boundary delays; verify the publication, snapshot and receipt are atomic and exact committed recovery survives cutoff. The published roster becomes browseable before opening after authorized admission. Entry enablement is independent of whether bidding is open.

Bids use the interval [open, close) under the existing lot-locked database decision semantics. A request queued across the cutoff must be decided using the post-wait database time and reject when closed. Under current authorization, replay of an already committed receipt returns the original outcome even after the deadline.

After publication freezes the event, allow no fresh publication, roster additions, term changes, or schedule extension in this tranche. Closed presentation shows final recorded standing and its truthful state; it does not declare an award, winner finalization, payment, or settlement.

## Approved decision 3: bounded local capability, retention and mobile inclusion; separate connected release

The owner approved local preparation and verification of the bounded staging Entry/image capability and retention scope. The prepared connected delta is additive Entry migration 015 and proposed Assets migration 016 in existing `bz_staging_e2e`, through existing owner `staging_e2e_owner`, with these exact proposed EXECUTEs to existing runtime `staging_e2e_app`. Actual connected installation still requires a separate release decision:

```sql
public.bz_staff_event_entry_read(text,uuid)
public.bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)

public.bz_staff_asset_put(text,uuid,uuid,text,integer,text,bytea,integer,integer)
public.bz_staff_asset_recover(text,uuid,uuid)
public.bz_staff_asset_validate(text,uuid,uuid[])
public.bz_staff_asset_read(text,uuid,uuid,text,uuid)
```

The Entry functions return jsonb. The Assets put, recover and validate functions return jsonb; read returns the fixed table of MIME, dimensions, byte length, hash and bytes. No runtime EXECUTE on the asset immutability trigger function is proposed.

This scope adds no credentials, bucket, role, role membership, ownership, direct table/column permission, or anonymous public image read. Require current same-event organization staff authority for writes and private context-bound authorization for reads. Validate asset ownership, exact function ownership and search paths, PUBLIC revocation, effective table/column privileges, and current authority after waits. Preserve unchanged 009 enrollment semantics, including disabled-entry ACK recovery after staff re-enables Entry.

Allow JPEG, PNG and WebP raw uploads of at most 2 MiB, a single frame, no side above 4096 pixels, and no more than 8 million pixels. Normalize to one metadata-stripped WebP no larger than 1600 pixels per side or 1 MiB. Approved quotas are 256 assets per event, 1024 per organization, and 256 MiB per organization of normalized stored payload bytes. The byte quota excludes database metadata/index/storage overhead. Original uploads are not stored. Retained abandoned successful uploads count toward quotas; exact replay consumes no additional quota. No cleanup or deletion policy is implied.

Include the unlanded MOBILE014 product changes from `4782fdc70e92fe5fa12d7d3dff2279d5c23d6659`, reconciled with current Entry and new timing/rule consumers. Require fresh integration and actual-new-candidate evidence, rather than treating the prior mocked-network client acceptance as the complete server journey.

Local approval of this group does not publish anything now. Eventual staging promotion requires a separate explicit release decision, exact reviewed migration/grant bytes, candidate evidence, installation readback and rollback preparation. This remaining connected release hold is distinct from the earlier scoped policy and local capability holds, which the owner has now resolved.

## Resident Sol brief and proof boundary

The user remains execution manager. The parent owns consequential planning and independent audit. Resident Sol Medium owns implementation, fixtures, integration and authorized delivery follow-through. Do not create another implementation manager. The inspected local ownership record names resident Sol but does not explicitly record a verified resident Sol thread ID.

First resolve the initial-publication interface and the draft dependency cycle. Assets waits for accepted publication visibility; Timing expects accepted Assets/increment seams; Increments and Publication depend on Timing. Agree the shared initial-publication interface before freezing the coherent rehearsal. Additive publication need not be implemented to establish that seam.

Rebind prepared Assets and Timing assumptions to the actual trusted base and preserve all historical contracts and evidence. Prepared Assets currently enforces release-375 baseline hashes and applies 003/009 rather than Entry015; its scheduled-hidden catalog expectations need a reviewed successor for accepted pre-opening browsing. Timing's draft already-open initial-publication proposal also needs an explicit delta for the approved stricter commit-before-opening cutoff.

Use external Kernel 3.1.0 schema 2 evidence. Parent independently reviews the exact assertions, helpers, configuration chain, setup and cleanup boundaries, SQL authority, and counterexamples before freeze. Pin the reviewed evidence commit descended from `591686a`, and record that the verifier's actual merge-base equals the intended trusted commit. Obtain meaningful BASELINE_READY before product implementation.

Only reached missing-feature or behavioral mismatches establish finite RED. Setup, infrastructure and cleanup failures are 99. Do not claim unreachable checks were tested, fabricate failures for already-supported Entry or deadline behavior, or supply missing feature implementation in fixtures. A journey aggregate may stop at its first observed missing capability and record subsequent stages as unreached.

The scoped owner decisions are now approved. After independent freeze review and baseline readiness, Sol implements the coherent tranche, integrates mobile changes, and executes the complete journey and retained regressions on the actual new candidate. No fixed `e0cef66` redirection may supply new-candidate acceptance. Retained older results support bounded history only.

Coverage must include receipt idempotency and ownership, competing bids and stale amounts, queued deadline decisions, actual publication commit waiting across opening, upload authorization and quotas, active input/focus/caret preservation alongside real updates, and readable closed standing. Retain and rebind the original Entry `run-v2.mjs`, Studio runner, manual-bid acceptance/adversarial runner, 009 private-entry runner, 010 adapter, UI-refinement runner and MOBILE014 v2 runner through reviewed successors where intended behavior changes.

Exact-candidate SUPPORTED is followed by independent source, rendered journey and SQL review, physical-phone checking, owner-approved connected migrations and release, and the hosted two-attendee demonstration. Update the Product Map and CURRENT with the truthful landing level when that later work is authorized and completed. Preserve explicit runtime ownership and at most one application-test runtime.

The recording/audit task stops after updating this record and exporting it once to Library. This recorder does not implement product changes, activate Sol, create another implementation manager, edit contracts/evidence, run tests/services/gates, or perform migrations, grants, commits, pushes, merges or deployments. The separate owner instruction authorizes the existing resident Sol to continue local work through the stated review/readiness boundaries. Sol continues through routine technical repairs in scope and brings material product or authority changes to the user with a recommendation. Reports must state working behavior, remaining rehearsal work, and decisions requiring attention.

## Owner approval and execution boundaries

The parent supplied the following exact owner wording from User, `Sentinel_658f4c1e080c8191a413840a9d78af15`. It supersedes the earlier pending-policy status within this bounded rehearsal while preserving the explicit connected release decision.

> Approved, with the execution boundaries below. Proceed with the complete staff-created rehearsal.
>
> 1. Approve the proposed increment boundaries, optional fixed per-lot override, opening-amount minimum, and allowance for any amount at or above the applicable minimum. Stale submissions must return truthful results without silently increasing the submitted amount.
>
> Approve explicitly labeled synthetic Saturn trade dollars, 100 minor units per dollar, and the existing $10 million technical cap for this rehearsal. Preserve historical USD receipts. Freeze the published roster, opening amounts, effective rules, denomination, cap, and schedule. Settlement and ledger posting remain outside this tranche.
>
> 2. Approve one explicit event window, default timezone America/Los_Angeles, UTC storage, and cross-date support. Initial publication must commit strictly before opening, with authority and time rechecked after waits.
>
> Admitted attendees may browse published lots before opening. Bidding opens inclusively and closes exclusively. Previously committed requests retain their original recoverable receipts. Keep published terms immutable for this tranche; group windows and additive publication remain on the roadmap.
>
> 3. Approve the bounded staging Entry/image capability scope and retention policy described in the existing permission packet. Preserve all its validation limits, including single-frame decoding, pixel and dimension limits, normalization, private access, and quotas.
>
> Approve local inclusion of MOBILE014 from 4782fdc, preserving its provenance and reviewing its behavior against the actual integrated server candidate.
>
> Prepare and verify these changes locally. Connected migration/grant installation and staging deployment require a separate release decision after the exact changes and candidate evidence are ready.
>
> Sol Medium now owns contract/evidence preparation, implementation, fixture repairs, mobile integration, and delivery follow-through. Resolve the publication interface and circular draft dependencies within this coherent tranche.
>
> Astra independently reviews the prepared contract, executable evidence, dependency/setup chain, and counterexamples before freeze. Obtain meaningful BASELINE_READY on the pinned trusted evidence commit before product implementation. Then proceed through exact-candidate SUPPORTED and independent source/render review.
>
> The complete journey must exercise the actual new candidate. Preserve historical evidence for its existing bounded claims.
>
> Continue through routine technical repairs within this scope. Bring me material product or authority changes with a recommendation. Report working behavior, what remains to finish the rehearsal, and any decision requiring my attention.

## Verified references

### Superseding owner amendment — 2026-10-08 19:12 UTC

User message `Sentinel_83deee9dde748191b0a149e0e7bfc263` replaces only the earlier physical COMMIT-before-opening requirement quoted above. Its exact instruction is: “Use database time for the final publication authorization decision, after all relevant lock waits and current-authority checks. That decision must occur strictly before opening. A transaction authorized before opening may finish committing or return its response after opening. This is explicitly permitted. Publication, its immutable snapshot, and its receipt must still commit atomically. A fresh publication decision at or after opening must reject. Exact recovery of an already committed publication remains allowed under current authority.” No 60-second margin was approved. All other local scope and connected release boundaries remain.

- [Current integration checkpoint](../project-map/CURRENT.md) and [bounded recovery handoff](/Users/jryear/Documents/Codex/2026-10-08/task-3/evidence/FINAL_LOCAL_RECOVERY_HANDOFF.json).
- [External kernel instructions](/Users/jryear/code/_kernel/README.md) and [schema 2 template](/Users/jryear/code/_kernel/task.template.toml).
- [Pending connected permission packet](/Users/jryear/Documents/Codex/2026-10-07/task-18/evidence/OWNER_PERMISSION_PACKET.md) and [detailed Entry permission contract](../proposed/staff-event-entry/PERMISSION_AND_DECISIONS.md).
- [Prepared Assets contract](/Users/jryear/Documents/Codex/2026-10-07/task-18/integration/docs/proposed/staff-assets/CONTRACT.md), [permission/evidence detail](/Users/jryear/Documents/Codex/2026-10-07/task-18/integration/docs/proposed/staff-assets/PERMISSION_AND_EVIDENCE.md), and [actual prepared runner](/Users/jryear/Documents/Codex/2026-10-07/task-18/integration/tests/acceptance/staging-staff-assets/run.mjs).
- [Prepared Timing contract](/Users/jryear/Documents/Codex/2026-10-07/task-18/integration/docs/proposed/staff-timing/CONTRACT.md) and [selected JSON permission boundary](/Users/jryear/Documents/Codex/2026-10-07/task-18/integration/docs/proposed/staff-timing/SQL_AND_PERMISSIONS.md).
- [Increment draft](../project-map/contracts/increments.md), [publication roadmap](../project-map/contracts/publication008.md), and [authoritative event-timeline correction](/Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/OWNER_EVENT_TIMELINE_CORRECTION.json).
- [Existing money constants](../../src/server/manual-bids.ts:10), [accepted-bid SQL cap](../../migrations/003_staging_manual_bid.sql:35), [product direction](/Users/jryear/Documents/Codex/2026-10-07/task-2/product-vision/BIDZIZI_PRODUCT_VISION.md), and [recorded donation owner exchange](/Users/jryear/Documents/Codex/2026-10-06/task-3/coordination/OWNER_LIFECYCLE_DECISION.json).
- [MOBILE014 source and acceptance handoff](/Users/jryear/Documents/Codex/2026-10-07/task-12/evidence/FINAL_MOBILE014_HANDOFF_V2.json) and [last hosted release receipt](/Users/jryear/Documents/Codex/2026-10-07/task-11/evidence/FINAL_RELEASE_HANDOFF.json).
- [External reset and ownership recommendation](/Users/jryear/Documents/Codex/2026-10-08/extract-this-archive-read-master-read/work/BIDZIZI_FORWARD_DEVELOPMENT_DECISIONS_2026-10-08.json).
