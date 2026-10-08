# Demo entry acceptance preparation

Fresh private synthetic account allocation was approved by the owner on 2026-10-07. Existing graders
and harnesses remain byte-identical. New native cases use the existing isolated
workspace harness: temporary app copy, PostgreSQL18, separate migrator/runtime roles,
synthetic manual-bid fixtures. No shared database or provider is used.

Run with Node24: `node tests/acceptance/staging-demo-entry-v2/run.mjs 0` (entry), `1`
(adversarial), or `2` (native browser). The final schema2 task will carry all59 existing
assertions as regression, plus these new assertions. Absence of a reached feature is
finite RED; setup/transport/timeouts/internal errors exit99 and emit no terminal result.

The suite records observed API responses, DB row counts, immutable snapshots and
native screenshots outside the repository. Private cookies and entered member claims
are never written into receipts. Lost response probes forward the actual request then
drop its response. Held probes use deterministic promises or SQL row locks, with no
deadline weakening. Source binding is in each START/RUN receipt.

Version2 preserves original68a7541 and its failed candidate observations in history/.
The correction is limited to reading begin.wrapper.cookie and checking the real
HTTP201/owned durable receipt/native accepted state rather than an unpromised word.
All assertion IDs, inherited graders, clocks, timeouts and product scope remain.
