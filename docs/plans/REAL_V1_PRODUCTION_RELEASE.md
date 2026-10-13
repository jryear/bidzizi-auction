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
