# Synthetic catalog handoff

The staff Event/Lots workspace can approve one immutable catalog from selected **saved** lots. The selected saved revision, organization provider, event details, lot order/numbers and shared local window are copied atomically in PostgreSQL. Later draft edits leave that copy unchanged.

The A audience viewer at `/events/[id]` requires a current synthetic person session and a separate event VIEW grant. Staff access, business membership and typed identifiers never grant VIEW access. Before opening it receives only the approved welcome and sponsors. At the inclusive database-clock opening it receives selected lots. At the exclusive closing boundary the catalog remains read-only. Bidding is disabled throughout this slice.

Visible audience pages refresh from the server every5seconds during scheduled/open phases, every30seconds after close, and when returning from the background. They never infer authority from the browser clock. Logout clears private content before its request; account epochs reject late responses. A failed read removes the current packet and reports that access could not be confirmed.

## Routes and storage

- `GET/POST /api/admin/events/[id]/catalog-approval`: current staff authority, saved selection, revision check and stable request receipt.
- `GET /api/catalog/events/[id]`: current VIEW authority, allowlisted event content and server-derived phase.
- `GET /api/catalog/events/[id]/lots/[lotId]`: selected lot only; no direct access before opening.
- `migrations/002_staging_catalog.sql`: immutable approval/lot snapshots, explicit VIEW grants and the database phase function.

One approval per event is deliberate synthetic scope. Replacement, cancellation, rescheduling, multiple windows, real onboarding/admission, bidding and settlement are deferred. Invalid dates, nonexistent/repeated local minutes and reversed windows reject rather than choosing an offset. Uncertain approval retries preserve the same request ID and selection; approval is shown only after a confirmed durable receipt.

## Verification boundary

The frozen catalog contract is `tasks/staging-catalog-002.toml`. Its latest feature-absent trusted base is `7eef3e74688604fdf1a9ffaf0fc7899d0a45290d`. The full baseline was READY with finite absent-API failures and all9 cumulative regressions passing. All4 acceptance and all7 adversarial groups passed during development; the clean committed candidate still requires the full external kernel claim and exact hosted E2E. These development results are not a release claim.

The app-clock probe corrections and original failures are preserved in protected history, with explicit bindings and diffs. Neither correction changes the behavioral contract. The probe preserves native Date semantics while skewing app time; PostgreSQL remains the phase authority.

The operator-only migration command is `scripts/migrate-catalog-staging.mjs`. It refuses targets outside the approved isolated branch, database and owner, enforces verified TLS and narrows runtime grants. It creates no VIEW grants or approvals. Provider migration and protected Preview deployment remain separately authorized actions; the executable contract uses disposable local storage.

Hosted screenshots, source/deployment bindings and test receipts are recorded separately in the journey map after an actual run. No production release, real member data, SMS, payments or live bids are claimed.
