# Historical commit-boundary finding and amended cutoff

The original physical COMMIT-before-opening requirement was found infeasible
with ordinary PostgreSQL pre-commit predicates. The original analysis below is
retained as historical review context; it no longer defines the acceptance
cutoff. Owner amendment `Sentinel_83deee9dde748191b0a149e0e7bfc263` at
2026-10-08 19:12 UTC supersedes that one requirement.

**Current acceptance rule:** After all relevant lock waits and current staff
authority checks, use database time for the final publication authorization
decision. It must be strictly before opening. A transaction authorized then may
finish committing or respond after opening; approval, immutable snapshot and
receipt must commit atomically. A fresh decision at/after opening rejects. Exact
recovery of an already committed approval remains allowed under current
authority. There is no safety-margin substitution. Evidence must deliberately
cross opening both before the final decision (reject) and during a later commit
(allow the previously authorized atomic result), then recover the original
receipt after cutoff.

---

## Historical analysis of superseded physical COMMIT rule

# Pre-freeze publication commit boundary

**Material blocker for Astra and the parent.** The owner requires a newly
published event to **commit strictly before** its opening instant, including a
transaction delayed after all application/SQL checks. This is stronger than a
pre-opening decision timestamp or an API response returned before opening.

At the pinned source, `src/server/catalog.ts:103-123` samples
`clock_timestamp()` before inserting the approval, lots and receipt.
`src/server/db.ts:36-50` commits only after the callback returns. An adversary can
pause the callback, deferred constraint, WAL/commit processing or network after
the clock check, let opening pass, and then release COMMIT. The row becomes newly
visible after opening. A final `SELECT clock_timestamp()` immediately before
`COMMIT` narrows but does not eliminate this gap. A deferred trigger executes in
the transaction before its commit is complete. The disposable PostgreSQL witness
in `tests/acceptance/staff-auction-rehearsal/commit-boundary-counterexample.sh`
shows the simpler held-transaction instance with an actual committed row.

PostgreSQL exposes commit timestamps only for past commits when the cluster has
`track_commit_timestamp` enabled; that information may later be removed. A
post-commit check can detect or suppress a late row but cannot make the late
commit never have happened. An application deadline/timeout, transaction timeout,
pre-opening safety margin or `approved_at` field also cannot guarantee the exact
commit boundary. This is an inference from the transaction ordering and the
documented APIs; it should be independently challenged before any freeze.

**Recommendation:** Keep product implementation held. Ask the owner to approve a
precise alternative such as “a publication is eligible only if a reliably recorded
database commit timestamp precedes opening; any later committed attempt is inert
and cannot authorize catalog, assets or bids,” conditional on demonstrated Neon
support and permanent retention of the required evidence. That is a change from
the stated physical commit invariant and needs explicit owner consent. If the
physical commit invariant is non-negotiable, require a provider-supported commit
deadline primitive with independently testable semantics; none has been identified
in the current PostgreSQL/Neon interface. Do not present a clock check or an
application timeout as that primitive.

Executable successor evidence must hold a real transaction after its last time
check but before COMMIT until after `opensAt`, assert no *newly committed*
publication row/receipt and no browse/asset/bid authority, then challenge a wait
inside COMMIT (for example a deferred constraint/commit blocker). It must also
prove an ordinary pre-opening publication, exact replay after opening, and current
staff authority after waits. Missing a controllable commit-boundary mechanism is
an infrastructure/specification blocker, not a finite feature RED.

Primary PostgreSQL references: [deferred constraints](https://www.postgresql.org/docs/current/sql-set-constraints.html),
[constraint triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html),
[past commit timestamps](https://www.postgresql.org/docs/current/functions-info.html).
