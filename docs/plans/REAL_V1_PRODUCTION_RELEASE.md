# Compatibility production release — 2026-10-13

**Live at https://app.bidzizi.com/studio.** After testing the previously failing phone on staging, Zack reported “works! Let's go”. The production release was announced and completed using the exact staging-tested source `3f6c3e2`.

- Production project: `bidzizi-production` / `prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2`.
- New deployment: `dpl_CqZBiNowAAHiXFE8kXtmue27nrRq`, READY; functions in `pdx1`, Node 24. Built from exported committed source `3f6c3e29d878af860ff25ff38cba63b68caeb868`, with source/staging metadata attached. No application edits were added during release.
- Prior production deployment retained: `dpl_FaFhGmY8fd3BtYXBYRfxvkf63jV9`.
- Production's existing three environment variables were retained. The app uses production's own database; no staging credentials, accounts, edits or test activity were promoted.
- Before migration, a no-compute restore branch was created: `before-compat-release-20261013` / `br-plain-poetry-ar3kh24n`, parent `br-cold-glitter-arx1msrh`, LSN `0/1E3FB58`.
- Migrations 001–008 matched their source hashes. Migration 009 was applied through the existing migration runner using a direct connection with verified TLS. It adds device/error reporting; no business tables were rewritten.
- The READY candidate was promoted only after migration. Provider readback and served HTML identify the new production deployment. Staging still serves `dpl_ACGwNLmUH8ptVipz18JQtNoe8VMb` against its isolated fork.

## Live verification

Studio, Join, the existing event and its no-JavaScript simple route return HTTP 200. Unauthenticated staff event access returns 401. The simple route keeps its script-disabled CSP. Chromium at 390px renders sign-in and guest join, with zero page errors, zero broken images and a successful 202 device report.

Hashes of production organizations, staff, events, items, bids, image assets, participants, pledges, awards and standings match the pre-release hashes. No synthetic production participants, bids or pledges were created for verification. [Evidence and receipt](../evidence/real-v1-production-20261013/receipt.json) record the precise checks.

The old-phone result is **user-reported staging evidence**; its OS version and exact completed steps were not supplied. It is not recorded as a native simulator matrix pass. The prior hosted staging Chromium/WebKit journeys remain the automated bid-sheet, Devices, simple-mode and staff-operation evidence.

## Rollback

The old production deployment remains available. To roll back the application, run `vercel rollback dpl_FaFhGmY8fd3BtYXBYRfxvkf63jV9 --scope saturn-ea53` from a checkout linked to the production project, and verify `app.bidzizi.com` afterward. Migration 009 is additive; leave its table and any diagnostic records intact during application rollback. Database restoration is a separate operation and must not discard bids accepted since the restore point.

No Git push or main merge was needed. The later release-documentation commit does not change the deployed source. The Add-row overflow screenshot received during release is a separate follow-up; it was not mixed into this validated production build.

## Approved item-entry presentation follow-up

After Zack approved the staged Add-row layout and full-card helper placement, he explicitly requested production release. **Current production:** `dpl_Fa7b2Zh9rYAiv5zqpRvnNeigFmgk`, source `84f09fb`. The workspace route and served Items CSS are verified; CSS matches staging byte for byte. No migration or environment change. The prior compatibility deployment `dpl_CqZBiNowAAHiXFE8kXtmue27nrRq` is retained for rollback. [Layout release details](ITEMS_ADD_ROW_FIX.md).

## Studio preview attach — 2026-10-14

Zack authorized merge, checks, staging and production for the Studio phone preview, which now renders the real guest app from a server-built snapshot (`GET /api/v1/host/events/:id/preview`), plus a test-only `operations-ui` stability fix. **Current production:** `dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie`, source `088e3b0`.

- Merges on `jryear/real-v1-claude-shell` (no push, no `main`): `8afde65` (`real-v1/preview-attach` @ `ca7d17c`), then `088e3b0` (`real-v1/fix-operations-ui` @ `84ba167`). No migration changes since `8246e7f`; no environment, domain or DNS changes.
- Deployed from a `git archive` export of `088e3b0` with the standard exclusions (docs, tests, prototypes, tools, .shots, *.png, .env*); source metadata attached. Node 24.x, pnpm 12.4.2, functions `pdx1`.
- Local checks (Node 24.4.1, disposable loopback Postgres 18 database, dropped afterward), all first-run passes: typecheck; Turbopack build; compat (0 blocking findings); display-logic 10/10, items-logic 10/10, compat-logic 10/10; journey 55/55; operations-ui PASS; items-ui 15/15; studio-saving 7/7; bid-sheet 2/2 engines; photos 8/8; simple-ui 2/2.
- **Staging** `dpl_84j5YvYHCn18XZxycpMckLTf5ftf` (previous `dpl_4CFSMuZVSnaa5ExaFJXHKJrw3G45`), aliased to staging.bidzizi.com. **Production** `dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie`, promoted after staging passed. Provider alias readback and served HTML identify each deployment.
- Hosted checks on both domains: `/studio`, `/join`, `/e/FZZGY3`, `/e/FZZGY3/simple` → 200; simple route keeps `script-src 'none'`; unauthenticated `/api/v1/host/events` and `/api/v1/host/events/<id>/preview` → 401 with no data; Chromium at 390px renders sign-in, guest event and join with zero page errors, zero broken images, no horizontal overflow. Production verification was read-only apart from the guest page's automatic device report (one telemetry 202).
- **Not run:** the signed-in Studio canvas preview on staging (no staging staff credentials without provisioning against the staging database). The preview's signed-in behaviour rests on the local suites and the prior kernel/canvas evidence on `ca7d17c`.

Rollback: `vercel rollback dpl_Fa7b2Zh9rYAiv5zqpRvnNeigFmgk --scope saturn-ea53` from a checkout linked to the production project, then verify `app.bidzizi.com`. No database step is needed. [Receipt](../evidence/preview-attach-release-20261014/receipt.json).
