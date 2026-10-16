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

## Production alerts — 2026-10-15 PDT / Oct 16 UTC

Zack approved production alert activation. Current production: `dpl_9kMq1rKxWtkEUVEJJ6SggrLK1Xkj`, source `a55dc11264584fd65650731d27943ecb1fce7e42`. Application bytes match the passed production-build suite and refreshed staging. Photos, thumbnail, paste-focus and Safari dialog fixes are retained. The only production configuration change is the sensitive server-held Sentry DSN; two production-filtered email rules are enabled. No database migration.

The isolated practice-event proof delivered all three notifications and independently confirmed complete cleanup. Latencies were 26.959s / 103.850s / 98.852s: delivery works, but the strict 60s requirement missed twice. [Full proof and limitations](NOV19_PRODUCTION_ALERTS.md). Production was not tested with a real staff login or real event mutation. The owned fixture alone was used.

Application rollback: `vercel rollback dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT --scope saturn-ea53`. That prior deployment retains the dialog fixes but predates the alert DSN, so it would disarm alerts. Rollback was not performed.

## Items dialog Safari 17 collapse — production, 2026-10-15

Zack: "prod". **Current production:** `dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT`, source `4d6028f` (`jryear/real-v1-claude-shell`, pushed). Previous: `dpl_2NhtVPqraU9Gv427PMGvNLxadnNE`.

- Emma's screenshot (MacBook Air) showed the Paste rows dialog body collapsed to a ~45px strip. Cause: `.iw-dlg-body { flex: 1 }` (basis 0%) inside a `<dialog>` with only a max-height collapses to its padding in Safari 17; current Safari/Chromium/WebKit size it from content, which is why neither Zack nor the test engines reproduced it. Reproduced with WebKit 17.4 (`playwright-core@1.40.1`): old rule → body 36px with 321px of content scrolling inside; `flex: 1 1 auto` → 321px. Same rule fixes every Items dialog (paste, categories).
- App diff against `c2b98e6`: `items-dialogs.tsx` (focus fix) and one line of `items.css`. No migration or environment change.
- Current Chromium/WebKit at 1440×1000, 1280×720, 735×420 and 640×860, empty and 18-row review: dialog sizes unchanged, short windows still scroll, footer on screen. items-ui 17/17 on a production build. Guest bid sheet already uses `flex: 1 1 auto`.
- Live: provider readback and served HTML identify the new deployment; core routes 200; signed-out host API 401; served CSS has `.iw-dlg-body{flex:auto;…}`.

Rollback: `vercel rollback dpl_2NhtVPqraU9Gv427PMGvNLxadnNE --scope saturn-ea53`.

## Paste-rows focus fix — production, 2026-10-15

Zack: "prod now". **Current production:** `dpl_2NhtVPqraU9Gv427PMGvNLxadnNE`, source `fad66b0` (`jryear/real-v1-claude-shell`, pushed) = production source `c2b98e6` merged with `73c2cbc`. Previous: `dpl_Ap9xYPp7CcbWUxr7TrBFvjC85MQ5`.

- Fix: opening "Paste rows" left focus on Close (`showModal()` overrides React's `autoFocus`), so Cmd+V did nothing until staff clicked the box. Reported from Emma's MacBook Air as "small window, field unreachable"; the focus bug reproduced, the small-window part did not (Chromium/WebKit, 1440×789 to 600×860 and 735×420, empty and 18-row review).
- App diff against `c2b98e6`: only `src/app/studio/[id]/items-dialogs.tsx`. No migration, no environment change, no restore branch needed.
- Merged tree, production build: typecheck, items-ui 17/17 (its paste check now asserts focus and pastes by keyboard; it failed before the fix). Both engines: focus in the paste box and a keyboard paste reaches the review.
- Live: provider readback and served HTML identify the new deployment; `/studio`, `/join`, `/e/FZZGY3`, `/e/FZZGY3/simple`, `/e/MYPLES` 200; signed-out host API 401. The live Studio chunk `16roqq_710la9.js` contains the fix.

Rollback: `vercel rollback dpl_Ap9xYPp7CcbWUxr7TrBFvjC85MQ5 --scope saturn-ea53`.

## Photos framing + tray thumbnails — production, 2026-10-15

Zack: "I'm ready to get this to prod" (old-iPhone pass waived: events are not created on phones for now). **Current production:** `dpl_Ap9xYPp7CcbWUxr7TrBFvjC85MQ5`, source `c2b98e6` (`jryear/real-v1-nov19-execution`, pushed to origin). Previous: `dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie`.

- Source is the production-build-validated merge, not `efc302b` alone: photos framing, the tray thumbnail fix (`213d477`, merged at `d51e087`), and the Sentry alert code. Alerts are **inert in production**: `alertConfig` returns null without `BIDZIZI_SENTRY_DSN`, and production still has only its three variables (unchanged). Validation: `docs/evidence/nov19/thumbnail-merge-validation.json` on that branch (`next build` + `next start`; journey 55/55, photos 9/9, photo-ui 11/11, items-ui 17/17, bid-sheet/simple/resilience in Chromium and WebKit).
- Restore point `before-photos-release-20261015` / `br-blue-water-ar13j577`, LSN `0/23C0810`, no compute, created immediately before migrating.
- Pre-check (read-only, direct endpoint, TLS 1.3 authorized): 001–009 match repository hashes; only 010 pending. `010_photo_frame.sql` applied. With `zoom` stripped, events and items hashed identical to before and every other table was unchanged; no row lacks `zoom`; both `*_frame_check` constraints exist; the old app kept serving 200.
- Deployed from a `git archive` export with the standard exclusions (`pnpm 12.4.2`, functions `pdx1`), promoted; provider readback and served HTML both identify the new deployment.
- Live: `/studio`, `/join`, `/e/FZZGY3`, `/e/MYPLES` and both simple routes 200; simple CSP `script-src 'none'`; signed-out host API 401 with no data. Chromium and WebKit at 390: 0 page errors, no horizontal overflow, no broken visible images.
- After release, only `schema_migrations` (+010), `client_reports` (5 passive device reports from the smoke's page loads, 1 staff) and `events` changed. The events change is a staff member saving draft `YYXTWE` on the new deployment at 18:43:15Z, not the release. No synthetic participants, bids, pledges or events. [Receipt](../evidence/photos-framing-release-20261015/production-receipt.json).
- Not covered: a real old-iPhone run of this build, a real HEIC upload into the tray, and production alert activation (needs a production DSN env var and production-filtered Sentry rules — Zack's go).

Rollback: `vercel rollback dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie --scope saturn-ea53`; leave 010 in place (the old app ignores `zoom`).

## Photos framing — staging, 2026-10-15

Zack visually approved photo framing (pan + zoom on every guest surface, in-place framing on the Studio phone), the photo tray and Items polish, and authorized merge, checks and **staging only**. Production was not authorized; it waits for Zack's old-iPhone testing on staging. **Current staging:** `dpl_AqVVa22iSSFxtQTL6n5JtBCuw4bC`, source `efc302b`. **Production is unchanged** at `dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie`.

- Merges on `jryear/real-v1-claude-shell` (no push, no `main`): `86e52e1` (`real-v1/photos` @ `62322e9`), then `efc302b` (`real-v1/photos` @ `a207b7a`). The only migration change since `68440b6` is the new `migrations/prod/010_photo_frame.sql`. No environment, domain or DNS changes.
- **First attempt stopped before staging.** On `86e52e1`, a production build (`next build` + `next start`) never opened the in-place framing editor, though `next dev` did: `photos` 8/9 twice, `photo-ui` 8/11. Fixed on the branch in `a207b7a` (stable `FramedPhoto` ref callback, editor mounts once placed). Browser suites for releases now run against a production build.
- Local checks on `efc302b` (Node 24.4.1, production build served by `next start`, disposable loopback Postgres 18 database migrated 001–010 and dropped afterward), all first-run passes: typecheck; Turbopack build; compat (0 blocking findings); display-logic 10/10, items-logic 10/10, compat-logic 10/10; journey 55/55; operations-ui PASS; items-ui 16/16; studio-saving 7/7; bid-sheet 2/2 engines; photos 9/9; photo-ui 11/11; simple-ui 2/2. Migration 010 also applied to the local review database `bz_test_claude`.
- **Staging migration.** Before migrating, the staging fork (`br-crimson-mountain-arsolcfe`) listed 001–009, each matching its repository hash. `010_photo_frame.sql` was applied with `scripts/prod-migrate.mjs` over a direct connection with a verified TLS 1.3 certificate. All 10 events and 27 items now carry `zoom: 1`, and the new check constraints replaced the old ones. The previous deployment kept serving 200 on the migrated schema.
- **Staging deploy.** Before deploying, staging served `dpl_84j5YvYHCn18XZxycpMckLTf5ftf`, with no newer or in-progress deployment. Deployed from a `git archive` export of `efc302b` with the standard exclusions and source metadata, using `--prod --skip-domain`. Then `staging.bidzizi.com` was aliased explicitly. Provider readback and served HTML identify `dpl_AqVVa22iSSFxtQTL6n5JtBCuw4bC`. Previous staging deployment (rollback target): `dpl_84j5YvYHCn18XZxycpMckLTf5ftf`.
- **Hosted checks.** `/studio`, `/join`, `/e/FZZGY3`, `/e/FZZGY3/simple` → 200. Simple mode keeps `script-src 'none'`. Unauthenticated `/api/v1/host/events` and `…/preview` → 401 with no data. Chromium and WebKit at 390×844 render sign-in, join, guest event and simple mode with zero page errors, zero broken images and no horizontal overflow.
- **Signed-in check.** A throwaway staff account was created in its own throwaway organization, following the earlier staging checks' separate-organization pattern. Its practice event had three photo items framed right at 2×, at the default and left at 1.5×. Guest cards at 390 in Chromium and WebKit show exactly those crops (checked by pixel colour). On the Studio Item page, "Adjust photo" opens the in-place editor in both engines at 1440, and Escape leaves the saved frame unchanged. The practice events were deleted through the API. The organization, staff, sessions, request records and uploaded assets were then removed, and the throwaway login now returns 401. Copied staging orgs, staff, bids, participants and pledges hash identical to the pre-test baseline. Events, items and assets changed only through concurrent Saturn staff editing on staging (Emma Johnson, 17:59–18:00Z), not the throwaway account.
- Not covered: real older iPhones and native iOS simulators (Zack is testing those next), and simple mode ignores zoom by design. [Receipt](../evidence/photos-framing-release-20261015/receipt.json), [smoke](../evidence/photos-framing-release-20261015/staging-smoke.json), [signed-in check](../evidence/photos-framing-release-20261015/staging-signed-in.json), screenshots beside them.

**Superseded on staging at 18:02Z:** the Nov 19 readiness thread (actor `codex`) then deployed `dpl_AZZH3S67gBuDQvff6rmapwAUGKjr` from `c50cad0` (`jryear/real-v1-nov19-execution`, which contains `efc302b` and migration 010) and aliased staging to it. A read-only HTTP check after that returned the same statuses. The browser and signed-in checks above were run against `dpl_AqVVa22iSSFxtQTL6n5JtBCuw4bC`, not that later build.

Staging rollback: `vercel alias set bidzizi-real-v1-staging-ric1lp9kn-saturn-ea53.vercel.app staging.bidzizi.com --scope saturn-ea53` (that is `dpl_84j5YvYHCn18XZxycpMckLTf5ftf`). Migration 010 stays, because the old app ignores `zoom`.

### Production runbook for this release (executed 2026-10-15 with source `c2b98e6` — see the production section above)

Release exactly the staging-tested source `efc302b`. Never alias production to a staging deployment: build a separate production deployment.

1. **Identity check.** Run `vercel inspect app.bidzizi.com --scope saturn-ea53` and expect `dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie`. If it differs, stop and record what is live.
2. **Restore point.** Create a no-compute Neon restore branch of production *immediately before* migrating: `neon branches create --project-id delicate-math-48681189 --parent br-cold-glitter-arx1msrh --name before-photos-release-YYYYMMDD --no-compute`. Record its id and LSN.
3. **Migrate.** Get production's **direct** (non-pooled) connection string for `br-cold-glitter-arx1msrh` into a 0600 file, never echoed. Confirm in a read-only transaction that `schema_migrations` lists 001–009 matching the repository hashes, and that the client TLS connection is authorized. Then, from a clean checkout at `efc302b`, run `BIDZIZI_DATABASE_URL="$(cat <file>)" node scripts/prod-migrate.mjs`. Expect `applied 010_photo_frame.sql`. Confirm every event/item carries `zoom` and the `*_frame_check` constraints exist. The live old app keeps working during this window, because `zoom` is optional in the check.
4. **Deploy.** `git archive efc302b` into a private directory outside iCloud. Remove docs, tests, prototypes, tools, .shots, *.png and .env*. Write `.vercel/project.json` for `prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2`. Run `vercel deploy --prod --skip-domain --yes --scope saturn-ea53 --meta sourceCommit=efc302b8960badcb8fb54c2d468cd86e34f6903a --meta sourceBranch=jryear/real-v1-claude-shell --meta changeScope=photos-framing --meta previousProduction=dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie`. Wait for READY and check `pdx1`, Node 24 and pnpm 12.4.2 in the build log. Keep production's existing environment variables untouched.
5. **Promote.** Run `vercel promote <new dpl> --scope saturn-ea53` (or `vercel alias set <new url> app.bidzizi.com`). Confirm `app.bidzizi.com` resolves to the new deployment by provider readback, and that the served HTML carries the new `dpl_` id.
6. **Verify, read-only.** `/studio`, `/join`, `/e/<live code>`, `/e/<live code>/simple` → 200. Simple CSP `script-src 'none'`. Logged-out host APIs → 401. Chromium and WebKit at 390 render sign-in, join and the guest event with 0 page errors and 0 broken images. Hash production orgs, staff, events, items, bids, participants, pledges and awards before and after to show only `zoom` was added. Create no synthetic production participants, bids or events.
7. **Record** a production section and receipt here.

**Rollback (application):** `vercel rollback dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie --scope saturn-ea53` from a checkout linked to the production project, then verify `app.bidzizi.com`. This is safe without a database step: migration 010 only adds an optional `zoom` key and widens nothing the old app writes. The old app reads `x`/`y` and ignores `zoom`, and its `{x, y}` writes still satisfy the new check. Leave 010 in place. Restoring the database from the restore branch is a separate, last-resort operation, and it must not discard bids accepted after the restore point.
