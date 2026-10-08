# Entry logout synchronization successor for independent review

The complete external Kernel 3.1.0 baseline on clean trusted source
`8dfd160102d58eb3e574b43e78827ca9b8b5f01b` returned
`BASELINE_NOT_READY`. Its preserved schema-2 record is
`evidence/staff-auction-rehearsal/BASELINE_8DFD160.jsonl` (SHA-256
`5b3b8fb2cdb27252cd95b8923a67a55cc6d7d20ec2ffb4be1456689111715a15`).
All 40 checks completed with **25 PASS and 15 finite RED, zero infrastructure
99** in 707.72 accumulated check seconds. The only baseline-declaration
mismatch was retained Entry assertion `NATIVE_TWO_BROWSER_PRIVATE`, declared
PASS but observed fail at `/tmp/task-root/staff-entry-successor-base-vwOgD4/NATIVE_TWO_BROWSER_PRIVATE.json`.

The exact assertion site is `native-v2.mjs:105`, column 137: the left attendee's
independent `/api/session` GET was required to show `authenticated:false`
immediately after the browser click on **Sign out**. Accepted
`src/app/events/[id]/event-access.tsx` starts an asynchronous
`POST /api/session/logout` in that click handler. The click can complete before
the server revokes the session. The observation therefore sampled a still-valid
session, while the three other Entry assertions in that same check passed.
This is a sequencing flaw in the inherited browser fixture, not a new product
permission or a declaration of a missing feature.

`native-v3.mjs` copies all original cases and inserts one response barrier at
that site. It starts observing the exact left browser's logout POST before the
click, requires its 200 response, then runs the original left-unauthenticated
and right-still-authenticated independent session assertions. It does not
weaken either assertion or change any other case body. `run-v3.mjs` imports
this copy only for Entry group 2 and hashes both successor files before/after.
The isolated disposable diagnostic passed all four original group assertions
with normal owned cleanup at
`/tmp/task-root/staff-entry-successor-direct-VCZFuM/RUN_RECEIPT.json`.

`tasks/staff-auction-rehearsal-baseline2.toml` changes only that check's
runner. Its other 39 selected runners, all assertion IDs, expected baseline
outcomes, scope and timeouts remain the same. Every check binds 234 existing
chain files, including both original and successor evidence. Astra should
review this exact delta and affected Entry execution path before the next full
baseline. The previous unsuccessful run, predecessor task and accepted product
bytes remain unchanged. No product implementation or connected release action
has started.
