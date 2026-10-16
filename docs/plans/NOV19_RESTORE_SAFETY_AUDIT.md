# Restore drill safety audit — 2026-10-16

This records Zack's latest constraints and an audit of the committed drill at `fd40d26`. It does not authorize another provider operation. No Neon resources were inspected or changed during this audit. Implementation belongs to the resident implementation owner; the changes below must land before the drill is run again.

## Required boundaries

- Preserve `br-blue-water-ar13j577` (`before-photos-release-20261015`, LSN `0/23C0810`). It is the retained migration rollback point, outside drill ownership. Preserve every other pre-existing branch as well.
- Create a new historical child of `br-cold-glitter-arx1msrh` with an explicit chosen `parent_lsn` or timestamp. Never execute `neon branches restore` against production or call an in-place restore/reset endpoint. No promotion, cutover or application credential changes belong to this drill.
- Delete only the drill ID returned by its successful create response and durably recorded before further work. Names are descriptive metadata, never deletion authority. If the create response is lost, stop and report the uncertain resource for explicit review; do not infer deletion authority from a name, prefix or parent. Retain the expiry as a bounded fallback, without calling expiry configured proof of cleanup.
- Select a point after existing durable activity. Require nonzero bids, receipts and standings before creating the child and when comparing it. An empty comparison does not pass.
- A queryable child needs a compute endpoint. The 0.25 CU fixed endpoint is a billed resource, with 300-second autosuspend and 30-minute branch expiry; deleting the drill child must also remove its endpoint. No dollar cost has been independently measured.
- Keep connection strings, credentials and raw row data out of all receipts, logs and errors. The minimal recovery receipt must allow only branch ID, selected LSN, and per-table row counts/SHA256 hashes. Keep operational timings and cleanup evidence in a separate secret-free execution record.

## What the completed evidence establishes

The successful drill created child `br-little-darkness-ar7iubzf` at parent LSN `0/2824DA0`, selected at `2026-10-16T16:22:32.394Z`. The baseline selected an existing ended event with 25 durable bids; two consecutive read-only manifests agreed. Recovered counts were one event, 20 items, 25 bids, 26 receipts, 20 standings and five participants, with all six full-row hashes matching. The code creates a child through `POST /branches`; it does not invoke an in-place restore operation.

The recorded cleanup at `2026-10-16T16:22:56.950Z` confirms the drill child and its endpoint absent and every pre-existing branch retained. The pre-existing set explicitly includes `br-blue-water-ar13j577`. These are historical receipt findings, not a new provider readback. The execution record contains no connection string or raw row data, but includes operational metadata beyond the newly requested minimal receipt schema. Preserve historical evidence without rewriting it as if the stricter contract were already implemented.

## Required implementation before another run

1. Replace the lost-response discovery/deletion fallback in `tests/restore/drill.mjs` with a fail-closed result. The current DELETE URL uses an ID, but an exact-name/parent lookup can supply that ID when the create response is lost. This is not a broad name-pattern deletion, yet it does not meet the new ID-only ownership rule.
2. Before any DELETE, reject production, staging, `br-blue-water-ar13j577`, and every ID captured in the pre-create branch inventory. Re-read only the recorded child ID and validate its parent and selected LSN. Never substitute another ID because of a matching name.
3. Add the nonempty baseline assertions at the drill entry point as well as preparation, and write the minimal receipt with an explicit field allowlist. Keep the existing historical execution evidence intact.
4. Validate locally with mocked provider calls: lost create response causes no DELETE; a pre-existing/protected ID causes no DELETE; only the returned, recorded child ID can be deleted; empty bid/receipt/standing counts fail before POST; no restore/reset operation is issued; URI and secret canaries never appear in saved evidence or output. No additional live drill is necessary to test these changes.

The real Nov 19 event preflight is deferred by Zack until the event is set up. Its code, times and item count are not an active input blocker now.
