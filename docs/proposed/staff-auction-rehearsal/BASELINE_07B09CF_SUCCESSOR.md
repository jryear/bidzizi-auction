# Baseline infrastructure successor for independent review

The first full external Kernel 3.1.0 baseline ran against clean trusted freeze
`07b09cf4cab37480546ed15112735e47f5353a1d` using the original
`tasks/staff-auction-rehearsal.toml`. Its preserved raw schema-2 record is
`evidence/staff-auction-rehearsal/BASELINE_07B09CF.jsonl` (SHA-256 `b7a67ff8ce62733cb5d2a526819b16de4fde22a8251850e218659c3d5e8342d6`). The complete result was
`BASELINE_NOT_READY`: 25 PASS, 13 reached finite feature RED, and two 99s.
There was no candidate run or product edit. The 99s cannot be relabeled RED.

| Frozen check | Exact failure | Narrow successor |
| --- | --- | --- |
| Native one-window creation, rules and saved phone preview | `run.mjs` required an owned browser exit even though the missing v2 creation route caused a reached mismatch before any browser was allocated. `/tmp/bz-timing-evidence/base-rkFA0h/FAILED.json` records 99 and no terminal assertion. | `staging-staff-timing/run-successor.mjs` requires browser `allExited` when the group completed or a browser was allocated. It retains the requirement whenever a browser actually exists. All other code and asserted product behavior are copied byte-for-byte. The direct diagnostic exited 1 with the declared `REHEARSAL_NATIVE_ONE_WINDOW` failure and owned service cleanup at `/tmp/bz-timing-evidence/direct-PkJWsB/RUN_RECEIPT.json`. |
| Actual staff name validation, edited lot and saved-preview explanation | The historical UI check selects a link labeled `Lots`; the accepted Studio renders the same `data-tab="lots"` route as `Items`. `/tmp/task-root/ui006c-base-36FZXI/FAILED.json` records locator timeout 99. | `staging-ui-refinement/cases-successor.mjs` changes just that link-label selector. `run-successor.mjs` imports the successor cases; all four original staff assertions, SQL observations and cleanup remain. The direct diagnostic passed all four at `/tmp/task-root/ui006c-direct-ANCOas/RUN_RECEIPT.json`. |

`tasks/staff-auction-rehearsal-successor.toml` selects the new runner only for
those two checks. Its other 38 declarations retain their previous runners,
assertion IDs, expected baseline outcomes and source scope. Every check binds
all 229 chain files, including both original and successor evidence. The
successor runners add their own bytes to runtime helper hashes. The original
frozen task and test files remain available for exact comparison. The new task
must be independently reviewed and committed as a trusted evidence base before
another full Kernel baseline. No implementation, connected migration, grant or
staging release is authorized by these diagnostics.
