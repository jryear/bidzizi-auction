# Nov 19 restore drill

Zack's go to start the remaining operational work covers the temporary production restore drill. This is verification, not authorization to recover or replace the production database during an incident. No application database-mode restrictions or connections change.

Project: `delicate-math-48681189`; parent: production `br-cold-glitter-arx1msrh`. Actual project history retention read back as 86,400 seconds (24 hours). The point is `2026-10-16T00:23:09.454Z`, LSN `0/2777BF0`, with a stable read-only baseline of one ended event, 20 items, 25 bids, 26 receipts, 20 standings and five participants. Consecutive repeatable-read manifests agreed around that point. Only counts/hashes are saved, with no raw personal data or credentials.

Create exactly `nov19-restore-drill-20261016T002309` from that parent/LSN, with 0.25 CU fixed, 300s autosuspend and a 30-minute expiry. Read using a direct connection with verified TLS and default_transaction_read_only=on; compare full-row SHA256 manifests for event, items, bids, receipts, standings and participants. Record provisioning and connection/verification durations. Delete only the recorded unique name/parent/id and confirm that it and its endpoint are absent while all pre-existing branches remain. If the create response is lost, discover the exact named child; never retry a non-idempotent create blindly.

The installed Neon CLI create option accepts a branch or an LSN but cannot express both the non-default parent and point together. The drill uses the documented Neon API fallback with explicit parent_id and parent_lsn. The application continues to use its normal pooled/TLS adapter; the drill uses a separate read-only admin connection. No production data writes, branch promotion/reset, DSN changes, application deploy or migration occur.

The SQL manifest helper is locally testable against a disposable database; provider creation/deletion are covered by explicit ownership/readback checks. Current primary references: [history window](https://neon.com/docs/postgres/backup-restore/history-window), [create branch API](https://api-docs.neon.tech/reference/createprojectbranch). The configured window controls how far back a point can be selected; an old release restore branch is not proof that a tested recovery has occurred.

Execution results belong in `docs/evidence/nov19/restore-drill.json`. A passed comparison is evidence for the selected event at the recorded LSN; it is not a whole-project application recovery or an RTO guarantee under show-day load.
