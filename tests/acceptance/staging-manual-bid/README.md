# Manual bidding003 — concrete proposal

All28 groups now have concrete evidence code (7 acceptance,21 adversarial).
This packet is in /tmp only. It is not frozen, implemented or a GREEN verdict.
No application/provider/commit/push/deployment changes were made here.

Read CONTRACT.md for the proposed staging-usd-manual-v1 money/authority/time rules,
SQL_SCHEMA.md for direct storage observations, and ASSERTIONS.md for each group.
The standalone harness clones only credential-free app inputs, allocates its own
PG18 database/roles and real Next/Chromium resources, and removes them afterward.
It carries every predecessor002 check as an unchanged cumulative regression,
including both original staff versions and001a. CUMULATIVE_BINDING.json pins bytes.
Install this packet under tests/acceptance/staging-manual-bid, with only its TOML
placed under tasks. Keep the predecessor root CUMULATIVE_BINDING.json unchanged;
this packet's own cumulative pin belongs inside its evidence directory.

Use Node24. From the eventual frozen repository evidence path:

```bash
node tests/acceptance/staging-manual-bid/run.mjs list
node tests/acceptance/staging-manual-bid/run.mjs acceptance
node tests/acceptance/staging-manual-bid/run.mjs adversarial
```

The temporary packet may use an infrastructure-only node_modules symlink for
syntax/import/case-list inspection. No expected API answers come from app helpers.

Infrastructure/setup/missing dependencies99; finite feature absence1; reached
candidate app failures1 and baseline-unverifiable99 remain separate. Every declared
mode/group must execute for exit0; an unknown or empty mode cannot pass.

Remaining freeze work: parent/independent review of current synthetic rules and
exact interface/storage; transparent clock preload correction bound to a trusted
base and real Next/PG proof; driver smoke and deliberate weak-candidate challenges;
ordinary trusted-base RED and all candidate/cumulative checks. Full28 candidate
execution has not occurred. PREPARATION_RECEIPT.json records only actually run
preparation checks, with older draft receipts/history kept separately.

Run python3 preparation-checks.py for the reproducible syntax/inventory, unknown
mode/short-suite/missing-driver99 mutations, sealed protocol controls, immutable
replay timestamp control and exact browser/actual Next Date compatibility checks.
These start no app, network, database or browser process. The first browser Date
control exposed missing explicit callback strictness; its exact failed source/log
is preserved in history/verifier-v2, then corrected and rerun. Earlier zero-case
and private DTO counterexamples remain in history/verifier-v1. These are fixes to
evidence authoring, with no product changes or product PASS implied.

Real admission/identity/SMS, money/close/self-raise rules, auto-bid, donations,
payments, production, onboarding and deployment remain outside this test slice.

The X14 browser-ownership correction is preserved in history/verifier-v3 with
prior source, preparation/independent receipts and an explicit diff. The original
X14 submitted its own bid outside the browser and incorrectly required personal
outbid history after empty browser login. Revised X14 places the first bid through
actual A and observes reload recovery of its durable actor-owned UUID. This is a
pre-freeze evidence correction; no original product execution outcome is invented.
