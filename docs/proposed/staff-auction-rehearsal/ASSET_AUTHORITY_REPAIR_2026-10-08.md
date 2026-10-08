# Local asset authority repair

Consequential authorization/concurrency and SQL atomicity repair under Junior; local implementation and development evidence only, pending independent source-bound review and formal acceptance. Base: `b065b0cad177b50ea756f3d7e2925c05decbd038`. The predecessor handoff explicitly relinquished writing/runtime ownership; the stopped infrastructure lane remains stopped.

Staff Save/publication and asset put/recover/read acquire transaction `SHARE` advisory gate `hashtextextended('bz-asset-authority:v1',0)` **before** ordinary session/person `SHARE`, deterministic staff-grant/org `SHARE` (`name,id`) or VIEW `SHARE`, event, and existing request/quota/image locks. Original compatible row locks and fresh nonlocking after-wait authority/database-time decisions remain. Standalone asset validation stays lock-free; nested DENIED classification reads session validity without row/advisory locks and preserves 401 versus 403/404 transport. Legacy identity, Entry and USD bidding retain their authority and receipt semantics.

The migration's internal definer trigger acquires the same gate exclusively **BEFORE STATEMENT**, before tuple acquisition, for these ordinary raw UPDATE/DELETE paths:

- Sessions: token/person identity, revocation and expiry columns, or DELETE.
- People: identity, active/test authority columns, or DELETE.
- Staff grants and VIEW grants: identity/scope and active columns, or DELETE.
- Organizations: identity/name/initials columns, or DELETE.

No cooperative revoker pre-lock or runtime EXECUTE is added. The trigger has the migration owner, fixed `pg_catalog,pg_temp` search path and revoked PUBLIC EXECUTE. Statement enforcement covers old/new actor keys and multi-row statements. Existing FK constraints still govern whether key changes/deletes succeed. Gate order assumes the application's existing transaction entry points; deliberate trigger disablement or arbitrary privileged pre-lock transactions are not an asserted general deadlock guarantee.

The single gate keeps reader transactions concurrent across actors/events. A queued authority mutation temporarily blocks **all** new gated readers until its transaction ends; long privileged transactions can therefore stall unrelated staff work. This breadth is explicit: a row trigger cannot identify a raw revoker already waiting behind a legacy tuple holder before its trigger executes. Ordinary shared reader locks were retained after a repeatable-snapshot counterexample; PostgreSQL rejects concurrently changed authority with `40001` rather than authorizing stale state.

Late put denial raises private `PBA05` inside an insertion subtransaction, catches it and returns the unchanged `{error:'DENIED'}`. The provisional row is rolled back even when a direct runtime caller subsequently COMMITs. Exact replay, quotas, immutable assets, null-cover disclosure correction and published image rules remain unchanged.

Development command: `node --experimental-transform-types tests/development/asset-authority.mjs`, using Node `24.21.0` (resolved through `npx --yes --package=node@24`; the machine's nominal node@24 path actually runs Node 26). All **18 groups passed** on the final application/test bytes; `pnpm typecheck` with the actual Node 24 binary first in PATH and `git diff --check` also passed. Coverage includes actual Save/publication, strict raw queued logout/grant with older legacy holders, gate resource/stage witnesses, delayed revoker COMMIT after Save, six expiry wait tiers, late direct COMMIT/no row, nonlocking denial/status, concurrent unrelated Saves, old-cookie login, equal-name orgs, legacy Entry, an actual USD bid cycle with exact receipt/snapshot recovery, published VIEW revocation, permissions and repeatable-read revocation.

Source hashes before/after, actual Node/Postgres identity, raw waits and cleanup are in `/var/folders/5k/l4c971c10693qw4vwrvxb_s80000gn/T/bz-asset-repair-HmBfUu/RESULT.json`. Its owned PostgreSQL PID is absent, port closed and cluster removed; no app/browser service was started. The only linked dependency directory was an owned ignored symlink to existing dependencies.

Preserved unsuccessful observations: checkpoint's four real failures `bz-asset-repair-6pz1d1/RESULT.json`; BEFORE ROW/legacy-holder failure `bz-asset-repair-WsTPy3/RESULT.json`; nonlocking repeatable-snapshot failure `bz-asset-repair-Ce9aLl/RESULT.json` (all under the same temporary parent). Earlier import/fixture/cleanup setup mistakes were corrected and are not counted as behavioral RED. Each receipt keeps its actual source hashes; none is relabeled as a later candidate.

Next boundary: Junior reviews this exact commit and routes any required frozen-evidence successor and integration/candidate verification. The cumulative 40-check gate was not run. No Kernel SUPPORTED, independent acceptance, merge, push, connected migration/grant or deployment is claimed; connected release holds remain.
