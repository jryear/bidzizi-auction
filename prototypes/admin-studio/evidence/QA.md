# Worktree QA — 2026-10-04

Worktree `/Users/jryear/code/bidzizi-admin-journey`, branch `admin-journey`, base `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`. This checks the approved admin prototype in its new repository location, with simplified copy. Fixtures are fictional; browser state is disposable.

## Results

- `node evidence/model-check.mjs`: nine checks passed (amounts, time zones/DST, validation, schedule boundaries, audience visibility, and snapshot isolation).
- `node evidence/browser-check.mjs`: six journey checks passed in headless Chromium.
- Node 24 syntax checks: thirteen JavaScript files passed.
- TypeScript: passed with `tsc --noEmit --incremental false` from the worktree root.
- Imported UI: fourteen files match the source hashes in `IMPORT_RECEIPT.json`.
- `git diff --check`: passed.

The browser walkthrough loaded Event details and A's actual welcome renderer, edited/assigned lots, fixed the missing description, scheduled a local copy, checked hidden/open/closed audience states, verified that working edits do not alter scheduled content, exercised interrupted-save recovery and reload/search persistence, switched fictional organizations, and inspected the 1280×800 laptop layout. It recorded no JavaScript page errors or failed application assets. Desktop Event and Lots captures at 1440×1000 were visually inspected.

Fresh captures:

- [Event desktop](shots/event-desktop.png)
- [Lots desktop](shots/lots-desktop.png)
- [Scheduled catalog hidden](shots/scheduled-hidden.png)
- [Event laptop](shots/event-laptop.png)

The shots directory is ignored; running the browser check recreates the images. [Prior session QA](PRIOR_QA.md) is historical and refers to screenshots in the original session directory.

No operational authority, physical-device/browser matrix, full accessibility audit, actual image upload, real scheduler, database persistence, or real bidder lifecycle is established. These are prototype checks, not frozen-contract evidence or a kernel verdict.
