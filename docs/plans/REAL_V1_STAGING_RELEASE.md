# Real V1 staging release — 2026-10-13

**Live at https://staging.bidzizi.com/studio.** Zack authorized deploying the compatibility branch to staging and forking the live production baseline. Production remains at https://app.bidzizi.com.

## Source and environment

- Deployed source: `3f6c3e29d878af860ff25ff38cba63b68caeb868`, branch `jryear/real-v1-claude-shell`. Exported committed files into a private deployment directory; no application edits during release. Deployment exclusions omit docs, tests, prototypes, tools and local env files. Source metadata is recorded on the deployment.
- New dedicated Vercel project: `bidzizi-real-v1-staging` / `prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9`.
- Deployment: `dpl_ACGwNLmUH8ptVipz18JQtNoe8VMb`, READY; hosted HTML identifies this deployment. Node 24, pnpm 12.4.2, functions configured for `pdx1`.
- `APP_ORIGIN=https://staging.bidzizi.com`; Real V1's deployed `production` application mode means verified TLS and secure cookies, not the production database or production domain. The project has only the three necessary application variables; no legacy synthetic test-auth flags or messaging credentials were copied.
- `staging.bidzizi.com` was moved from `bidzizi-clean-staging` into this project and explicitly aliased to the READY deployment. No DNS record change was needed.

## Production baseline fork

Neon project `delicate-math-48681189`: new branch `staging-compat-20261013` / `br-crimson-mountain-arsolcfe`, parent `br-cold-glitter-arx1msrh`, fork LSN `0/1E3AEF8`. Compute is bounded to 0.25 CU and suspends after five idle minutes. The branch persists for ongoing staging use.

Before migration, hashes of the copied schema history, organizations, staff, events, items, bids and image assets matched production exactly. This includes the existing organization, two staff accounts, one event, six items and fifteen bids. Existing passwords and event images carry over. Cookies remain host-scoped: sign in again on staging.

Migration `009_client_reports.sql` was applied **only to staging**. Staging writes diverge from the fork; edits and bids do not synchronize back to production. Production reads used read-only transactions. Its checked records remain unchanged, migration 009 is absent there, and `app.bidzizi.com` still resolves to `dpl_FaFhGmY8fd3BtYXBYRfxvkf63jV9`.

The production deployment reports commit `ece2890` with `gitDirty=1`. Its immutable deployment is the authoritative application baseline; the commit alone is not claimed to reconstruct those uncommitted inputs. Nothing redeployed or reassigned the production app.

## Hosted verification

Checks ran on **https://staging.bidzizi.com**, in a separate `staging-compat-smoke` organization:

- Chromium and WebKit: sheet visibility/hit target at phone, short viewport and desktop sizes; focus isolation/restoration; in-flight dismissal protection; lost accepted-response receipt recovery with exactly one bid.
- Devices: real registration, controlled error appears in Live, successful receipt creates no false missing-button alert.
- Chromium and WebKit with JavaScript disabled: join, browse/detail, bid and pledge replay, current outbid standing, owned receipt isolation, uncertain original-request recovery, rejoin and CSRF rejection.
- Staff browser journey: sign-in, void, withdraw, edit participant, practice reset, delete, invitation/password setup and password reset/session revocation; no page errors.
- Final Studio HTTP 200 on both staging and production; provider alias readback confirms distinct deployment IDs.

The first simple-mode Chromium run timed out waiting for Join to be stable. A fresh diagnostic run joined successfully; the unchanged full simple-mode suite then passed in both engines. Both initial and rerun logs are retained. This is not reported as a clean first run.

Screenshots were inspected: [WebKit sheet, phone](../evidence/real-v1-staging-20261013/webkit-sheet-390.png), [Devices, desktop](../evidence/real-v1-staging-20261013/devices-1440.png), [simple mode, phone](../evidence/real-v1-staging-20261013/webkit-simple-390.png). [Machine-readable receipt](../evidence/real-v1-staging-20261013/receipt.json) and checks/hashes are beside them.

After testing, the copied Saturn records still match the pre-test baseline. The separate smoke organization retains its diagnostic records; its staff are disabled, sessions revoked and room entry closed. No automated checks ran under the copied Saturn staff accounts, so those accounts were not rate-limited by the suite.

**Still untested:** actual older iPhones, native iOS simulator runtimes and VoiceOver. The public staging link now makes physical-device rehearsal possible. See [the phone rehearsal](COMPAT_CROWD_REHEARSAL.md).

## Preservation and rollback

The prior synthetic staging project, settings, database and deployment were retained. Only its staging custom domain moved. To restore that earlier demo, move `staging.bidzizi.com` back to `prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP` with Vercel's project-domain move endpoint, then alias it to `bidzizi-clean-staging-ns0mwvdvs-saturn-ea53.vercel.app`. Keep the Real V1 database fork for subsequent testing. This rollback was documented, not executed.

Do not alias staging to the live production deployment as a shortcut: that deployment carries production's origin/database configuration. A baseline-code rehearsal must be a separate deployment against the staging fork.

No Git push or main merge was needed for this CLI deployment. The deployed code remains pinned to `3f6c3e2`; the later documentation commit records release evidence only.
