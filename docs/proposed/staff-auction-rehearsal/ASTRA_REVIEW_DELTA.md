# Independent Astra review received — freeze remains held

The independent reviewer examined exact commit `4d1faa01c97ea27b1ce6ada97784e77e016341a2`
and returned **NO_GO**. The complete report is
`/Users/jryear/Documents/Codex/2026-10-08/task-11/BIDZIZI_INDEPENDENT_PREFREEZE_REVIEW.md`
with result binding in that task's `REVIEW_HANDOFF.json`. Later commits in this
checkout were not reviewed by that report.

The initial shell witness proves an early clock check is insufficient, but a
final deferred constraint check defeats that simple held-before-COMMIT case.
Astra's stronger private PostgreSQL probe shows the final deferred check pass
before opening, then a delay *inside COMMIT*; a separate observer sees the row
absent after opening and present later. PostgreSQL's recorded commit timestamp
is also before opening, so it cannot prove completed durability/visibility by
the owner deadline. No ordinary pre-COMMIT check, timestamp, finite margin or
timeout is now claimed as satisfying the literal physical invariant.

The parent has requested an owner decision to replace the physical invariant
with a final current-authority/database decision check strictly before
`opensAt - 60 seconds`, followed by atomic commit and success only after durable
confirmation. An exceptional late commit/visibility after opening would remain
possible. **That change is only a proposal. It is not approved.** Until an
explicit owner decision arrives, the literal commit rule and freeze hold stay
in force, and no product implementation or BASELINE_READY claim is permitted.

Astra also requested binding the versioned request/response, dispatch,
denomination, persistence, authority/lock order and recovery semantics; exact
threshold minor-unit controls; both insufficient and still-sufficient stale
amounts; cutoff/COMMIT waits; legacy write-alias immutability; current authority
after waits; and actual-candidate phone, image and regression evidence.
`INTERFACE.md` and the new Timing/Increments executable successor begin that
work. Their current code has not been executed or independently reviewed.

The original shell counterexample remains a teaching witness, not a schema-2
oracle. Its setup and cleanup failure classification needs repair before any
future incorporation into a frozen evidence chain. The independent probe and
cleanup receipts belong to Astra's separate review task and were not copied or
altered here.

## Superseding owner decision, 19:12 UTC

`Sentinel_83deee9dde748191b0a149e0e7bfc263` approves the final database-time
authorization decision strictly before opening after relevant waits and current
authority checks, with an earlier authorized transaction permitted to commit or
respond after opening. Publication, snapshot and receipt commit atomically; fresh
post-opening decisions reject; exact committed recovery remains available under
current authority. This supersedes the prior physical-COMMIT blocker and the
proposed 60-second margin. The initial Astra NO_GO remains historically accurate
for commit `4d1faa0`; the amended complete executable packet still needs new
independent GO.
