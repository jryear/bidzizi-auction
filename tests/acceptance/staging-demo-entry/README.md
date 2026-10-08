# Demo entry acceptance preparation

Contract is provisional until fresh-account allocation is answered. Existing graders
and harnesses remain byte-identical. New native cases use the existing isolated
workspace harness: temporary app copy, PostgreSQL18, separate migrator/runtime roles,
synthetic manual-bid fixtures. No shared database or provider is used.

Run with Node24: `node tests/acceptance/staging-demo-entry/run.mjs 0` (entry), `1`
(adversarial), or `2` (native browser). The final schema2 task will carry all59 existing
assertions as regression, plus these new assertions. Absence of a reached feature is
finite RED; setup/transport/timeouts/internal errors exit99 and emit no terminal result.

The suite records observed API responses, DB row counts, immutable snapshots and
native screenshots outside the repository. Private cookies and entered member claims
are never written into receipts. Lost response probes forward the actual request then
drop its response. Held probes use deterministic promises or SQL row locks, with no
deadline weakening. Source binding is in each START/RUN receipt.
