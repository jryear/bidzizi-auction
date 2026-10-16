# Checkpoint, 2026-10-16

An audit of the repository, its branches and the local machine, taken before more work goes onto staging or `main`. Read-only, except for two git changes: a fetch of all of origin's branches, and a fast-forward of the `real-v1-main` worktree to `origin/main` (`fd40d26` → `573f329`).

**Summary.** The product code is in good shape. `src/` is 13.8k lines, and the bid engine holds up under the red-team pass below. The bloat is around the code:
- 148 MB of screenshots tracked in `main`, out of 154 MB total;
- 479 files of pre–Real V1 evidence;
- a second staff UI that nothing needs;
- README and AGENTS.md describing a product that no longer exists;
- a git store that sits in iCloud, with 25 of its 29 branches existing nowhere else.

None of this needs a new process. It needs one cleanup branch and one move.

## Top actions

| # | Action | Why | Effort |
|---|---|---|---|
| 1 | **Fix the fetch refspec** in the shared repo: `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'` | It was narrowed to `staging-e2e` only, so `git fetch` never updated `origin/main`. It sat at `9aef1f7` while the real `main` was `573f329`. Every agent that compared against `origin/main` saw a stale `main`. | 1 min |
| 2 | **Push archive tags** for the 11 branches with unmerged work (list below) before anything else is removed | 25 of 29 local branches have no remote, and the only copy lives in `~/Documents` (iCloud) | 10 min |
| 3 | **Rescue the old clone** `~/code/bidzizi`: commit its uncommitted prototypes on an archive branch, then fetch its 7 unique branches into the canonical repo as tags | It is a separate object store. Its work is in no other repo and on no remote. | 20 min |
| 4 | **Re-home the repo** to `~/dev/bidzizi` with a fresh clone and only the active worktrees. Then retire the iCloud store and the `~/code/bidzizi*` clones. | The machine rules ban git stores under `~/Documents`. It also frees about 11 GB. | 30 min, while no agent session is running |
| 5 | **One cleanup PR on `main`** (`jryear/main-cleanup`): remove the legacy surfaces listed in "Code on main" | `main` goes from 1,199 files and 154 MB to roughly 300 files and about 5 MB, and the app is unchanged | half a day |
| 6 | **Retire `/host/[id]`**, the "Classic workspace" (841 LOC). Keep `/host/set-password` and the `/host` redirect. | It is a second staff UI over the same API, reached from a Studio menu item. Every new feature (Shop) would otherwise need a kind-leak pass there too. | 1 h, after a 10-minute parity check with Zack |
| 7 | **Rewrite README, `.env.example` and AGENTS.md** to describe Real V1 only | README documents a `/admin` route that doesn't exist, `DATABASE_URL` (the code reads `BIDZIZI_DATABASE_URL`) and "no test script". About 60 of AGENTS.md's 87 lines are staging-demo and kernel-contract rules that its own first section overrides. | 1 h |
| 8 | **Add `pnpm test` and CI** (GitHub Actions): typecheck, build and `pnpm compat`, then `tests/v1/journey.mjs` and `bid-sheet` against a Postgres service | There is no CI. The bid correctness suite exists and is good, but only runs when someone remembers to run it. | 2 h |
| 9 | **Codify the deploy**: add `.vercelignore` (it exists only on `hotfix/sheet-no-dialog`) and a `scripts/deploy.mjs` that does the documented `git archive` → exclude → `vercel deploy --prod --meta sourceCommit=…` | Each production release is currently rebuilt from prose in `REAL_V1_PRODUCTION_RELEASE.md` | 1 h |
| 10 | **Throttle staff login before scrypt** (red-team finding R1) | It is the only unauthenticated path that can burn memory on the instance that serves guests | 30 min |

Items 1–4 protect work and are machine housekeeping; they touch no product code. Items 5–9 are the "enterprise" pass. Item 10 is the one code fix that matters for Nov 19.

## Red team (Nov 19 scope)

Scope: the bid engine (`src/server/v1/engine.ts`), auth (`auth.ts`), staff operations (`host.ts`), the HTTP layer (`http.ts`, `env.ts`), the schema (`migrations/prod/001_core.sql`) and git history.

**R1 — Staff login can be burst past its limit, and each attempt costs 32 MB. Medium.**
- *Where:* `src/server/v1/auth.ts:46-63`.
- *The gap:*
  - The failed-attempt count is read in one transaction, and the attempt is recorded in a later one, after `scrypt` (N=32768, r=8, so 32 MB and about 100 ms each).
  - So *n* parallel requests all pass the "fewer than 5 failures" check.
  - On Fluid Compute, guest snapshot and bid requests share that instance.
- *Failure scenario:* 60 concurrent POSTs to `/api/v1/host/login` give 60 password guesses (not 5) and about 2 GB of scrypt working memory at once. That can OOM or stall the instance in the middle of bidding.
- *Fix:* in one transaction, take `pg_advisory_xact_lock` on the IP hash, count, and insert a pending attempt row *before* hashing. Then update `succeeded` afterwards. Also cap concurrent scrypt calls per instance (a semaphore of 4).

**R2 — A join retry re-issues the device credential to anyone holding the join request ID. Low.**
- *Where:* `engine.ts:177-182`.
- *The gap:* within 10 minutes, a POST `join` with the same `requestId` rotates `token_hash` for that participant and sets a cookie, without any proof of possession.
- *Why it's low:* request IDs are random v4 UUIDs created on the device and never shown to anyone.
- *Failure scenario:* only if a request ID leaks into telemetry, logs or a URL.
- *Action:* assert that in a test (grep the telemetry payloads), or bind the retry to a hash of the original display name and business name. No change is needed for Nov 19.

**R3 — No way to deactivate a staff member. Product gap.**
- *Where:* `auth.ts` and `host.ts` never set `staff.active = false`. `resetStaffPassword` (`auth.ts:113-121`) lets any staff member issue a setup link for any other staff member in the org, and receive it.
- *Failure scenario:* a staff member who leaves Saturn keeps a valid 12-hour session and cannot be locked out from the UI. Any colleague can also take over a colleague's account by resetting it.
- *Assessment:* acceptable for one trusted org on Nov 19. It needs owner/staff roles before a second org.

**Checked and sound** (no finding):
- **Bid idempotency.** An advisory lock on `(participant, requestId)` is taken, then the prior receipt is looked up. A different payload gets 409. `UNIQUE (participant_id, request_id)` on `bids` and `bid_receipts` backs it up.
- **Bid concurrency.** Lock order is event `FOR SHARE` → item `FOR SHARE` → standings `FOR UPDATE`. The participant is rechecked after the locks are acquired, and `clock_timestamp()` decides the time. Void and award take the same standings lock. `tests/v1/journey.mjs` covers duplicate taps, racing bidders, a bid racing a void, and a replayed reset.
- **Money.** Amounts are integers in minor units everywhere: `cents()` requires `Number.isSafeInteger` and ≥ 1, the columns are bigint, and caps are enforced on the server.
- **Cookies.**
  - Participant cookie: `HttpOnly; SameSite=Lax; Secure` (deployed). It is scoped to the event, stored as a hash, and expires at `access_ends_at`.
  - Staff cookie: 12 h, stored as a hash, revocable, and revoked when the password changes.
- **CSRF.** Every mutation goes through `readJson` → `sameOrigin`, which compares against the explicit `APP_ORIGIN`. `issueRejoin` and `uploadAsset` call it directly.
- **Error leakage.** `handle()` returns `UNAVAILABLE`, logs only the error class name, and queues an alert. Database config errors are generic. TLS uses `rejectUnauthorized: true`, and deployed databases must be the Neon `-pooler` endpoint.
- **CSV.** The export neutralises formula injection.
- **Secrets.** gitleaks was run over all 290 commits of the shared repo and 44 of the old clone. It reported 154 + 7 hits; every one is a 40/64-hex file hash or a UUID in evidence JSON (checked programmatically, without printing values). No real secret is in either history. Two worktrees hold a `.env.local` containing only a `VERCEL_OIDC_TOKEN`, which expires and is regenerated with `vercel env pull`.

**Worth watching** (not a finding): every guest snapshot (polled every 4 s) reads *all* bids for the event and filters them per item in JS (`engine.ts:85-86, 133`). That is fine at Saturn's scale and the measured load runs passed, but it is the first thing to index or cache if the guest count grows tenfold.

## Code on main (`573f329`)

| Area | Files | Size | Verdict |
|---|---:|---:|---|
| `src/` | 86 | 0.7 MB, 13.8k LOC | **Keep.** Lean. |
| `migrations/prod/` | 10 | — | **Keep.** The only migrations `scripts/prod-migrate.mjs` applies. |
| `migrations/00{1,2,3,9}…019_*.sql` | 8 | 1,313 LOC | **Delete.** The frozen staging demo; nothing references it. |
| `docs/plans/*` image folders (photos-review, design-pass-oct19, preview-attach-review, claude-shell, images) | 272 | **105 MB** | **Remove from the tree.** Keep the `.md`s and point them at the archive tag. Future screenshots go in artifacts or PR attachments, not git. |
| `docs/evidence/` pre–Real V1 (saturn-v1-frontend, saturn-v1-staff-refinement, hosted-manual, overnight-*, hosted-catalog, hosted-staff, staff-528-*) | 479 | **37 MB** | **Delete.** Archived under the tag. |
| `docs/evidence/` Real V1 (nov19, real-v1-*, photos-framing, items-add-row, preview-attach) | ~110 | 7 MB | **Keep the JSON and md; drop the PNGs.** |
| `docs/*.md|json|txt` at the root (STAGING_*, OVERNIGHT_*, SATURN_V1_DEMO_RUNBOOK, ADMIN/BIDDER handoffs, PRODUCT_SLICE_001) | 23 | — | **Delete.** All are the staging-demo era. |
| `docs/proposed/*.toml`, `tasks/*.toml`, `tests/contract/`, `CUMULATIVE_BINDING.json`, `.claims/`, `tools/.gitkeep` | 11 | 1.0k LOC | **Delete.** This is the kernel-contract machinery, and AGENTS.md says Real V1 doesn't use it. |
| `docs/plans/*.md` | 36 | — | **Keep about 8:** PRODUCT, SCHEMA, PRODUCTION_RELEASE, STAGING_RELEASE, NOV19_RUNBOOK, NOV19_PRODUCTION_ALERTS, COMPATIBILITY_STATUS, BID_SHOP_GIVE. Fold the rest into a one-page `docs/HISTORY.md` with links to the tag. |
| `prototypes/admin-studio`, `items-workspace` | 40 | 1.4 MB | **Delete,** plus the `dev:admin` / `check:admin*` scripts. Both are shipped as Studio. |
| `prototypes/lanyard` | 27 | 1.3 MB | **Move `assets/lots/*.jpg` to `tests/fixtures/photos/`** (four test scripts read them), then delete the prototype. Its tokens already live in `globals.css`. |
| `src/app/host/[id]/workspace.tsx`, `host/ui.tsx`, `ClassicHostHome` | 4 | 841 LOC | **Delete** (action 6). Remove the Studio menu link at `src/app/studio/[id]/studio.tsx:206`. |
| `tests/v1/*shots*`, `compare-*`, `*-review.mjs` | 11 | — | **Move to `tools/shots/`.** These are screenshot generators, not tests. |
| `tests/v1` (real suites), `tests/load`, `tests/alerts`, `tests/restore`, `tests/preflight`, `scripts/` | ~55 | — | **Keep.** Add a `pnpm test` that runs the v1 suites. |
| Dependencies | 9 + 14 | — | **All used.** `@babel/core` is the peer of `@babel/eslint-parser`. Nothing to remove. |

Leave history as it is: no filter-repo. The packed history is small, Codex and Orca hold clones, and rewriting buys nothing that removing from the tip doesn't.

## Inventory

**Shared repo:** `~/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release/.git`. It has 22 worktrees (one of them the checkpoint-audit worktree created by this audit), and about 9 GB on disk, mostly `node_modules` and `.next`.

`ahead` counts commits not on `origin/main`. `unique` counts the ones with no patch-equivalent there (`git cherry`).

| Branch | Worktree | Ahead / unique | Behind | Last | Remote | Dirty | Verdict |
|---|---|---:|---:|---|---|---|---|
| `main` | real-v1-main | 0 | 0 | 10-16 | same | — | **KEEP** |
| `jryear/real-v1-nov19-execution` | real-v1-nov19-execution | 0 | 0 | 10-16 | same | — | **KEEP** (Codex readiness) |
| `jryear/bid-shop-give` | bid-shop-give | 1 / 1 | 0 | 10-16 | same | — | **KEEP** |
| `jryear/checkpoint-audit` | checkpoint-audit | this doc | 0 | 10-16 | pushed | — | **KEEP** until merged |
| `jryear/real-v1-claude-shell` | real-v1-claude-shell | 0 | 14 | 10-15 | same | 3 temp `.bz-*.mjs` | **DELETE** (local and remote) when its session ends |
| `hotfix/sheet-no-dialog` | real-v1-deploy | 2 / 2 | 69 | 10-15 | none | `.env.local` (OIDC only) | **ARCHIVE.** The overlay is on main via `7d05423`; `.vercelignore` exists only here (action 9). |
| `hotfix/old-ios-dialog` | — | 0 | 72 | 10-13 | none | — | DELETE |
| `real-v1/photos` | real-v1-photos | 0 | 42 | 10-15 | none | — | DELETE |
| `real-v1/preview-attach` | ui-v1-skin | 0 | 53 | 10-14 | none | `.env.local` (OIDC only) | DELETE |
| `real-v1/fix-operations-ui` | — | 0 | 58 | 10-14 | none | — | DELETE |
| `real-v1/nov19-readiness` | — | 0 | 58 | 10-14 | none | — | DELETE |
| `jryear/real-v1-design-pass` | real-v1-design-pass | 0 | 97 | 10-13 | none | — | DELETE |
| `real-v1/t1-foundation` | real-v1-t1 | 0 | 100 | 10-12 | none | — | DELETE |
| `ui/v1-skin` | — | 0 | 111 | 10-12 | none | — | DELETE |
| `jryear/junior-saturn-v1-backend` | junior-saturn-v1-backend | 0 | 118 | 10-09 | none | — | DELETE |
| `jryear/saturn-v1-frontend-review-repairs` | junior-saturn-v1-frontend | 0 | 118 | 10-09 | none | — | DELETE |
| `jryear/saturn-v1-configured-claude-review` | saturn-v1-configured-claude-review | 0 | 128 | 10-08 | none | — | DELETE |
| `jryear/saturn-v1-recovery-inventory` | saturn-v1-recovery-inventory | 1 / **0** | 179 | 10-08 | none | — | DELETE (already on main as a patch) |
| `codex/release-connected-009-010-public` | *the iCloud main worktree* | 0 | 180 | 10-07 | none | — | DELETE with the store (action 4) |
| `staging-e2e` | — | 0 | 182 | 10-07 | same | — | **ARCHIVE**, then delete the remote branch (Zack's call) |
| `jryear/saturn-v1-configured-codex-refinement` | saturn-v1-configured-codex-refinement | 5 / 4 | 128 | 10-09 | none | — | **ARCHIVE** (docs only) |
| `jryear/junior-saturn-v1-frontend` | — | 10 / 10 | 180 | 10-09 | none | — | **ARCHIVE** (docs only) |
| `jryear/saturn-v1-authority-p2` | saturn-v1-authority-p2 | 1 / 1 | 179 | 10-08 | none | — | **ARCHIVE** |
| `jryear/saturn-v1-member-ui` | saturn-v1-member-ui | 47 / 33 | 180 | 10-08 | none | — | **ARCHIVE** (pre–Real V1 member UI) |
| `jryear/saturn-v1-staff-ui` | — | 50 / 33 | 180 | 10-08 | none | — | **ARCHIVE** |
| `codex/saturn-staff-delivery` | ~/Documents/…/task-18/integration | 21 / 17 | 180 | 10-15 | none | — | **ARCHIVE** |
| `codex/saturn-staff-entry` | ~/Documents/…/task-18/studio-candidate | 15 / 12 | 180 | 10-08 | none | — | **ARCHIVE** |
| `codex/saturn-entry-inherited-gate-candidate` | ~/Documents/…/task-18/entry-inherited-gate-candidate | 15 / 14 | 180 | 10-08 | none | — | **ARCHIVE** |
| `codex/saturn-entry-inherited-gate-base` | ~/Documents/…/task-18/entry-inherited-gate-base | 13 / 12 | 180 | 10-08 | none | — | **ARCHIVE** |
| `codex/saturn-studio-composition` | — | 8 / 7 | 180 | 10-08 | none | — | **ARCHIVE** |

The ARCHIVE rows are the pre–Real V1 kernel-contract and member/staff lineage, or carry one unmerged file. None of them is needed for the product, but none of it exists on GitHub. Tag it, push the tags, then remove it.

**The old clone, `~/code/bidzizi`** (a separate object store, 1.4 GB, plus 14 worktrees):

| Item | State | Verdict |
|---|---|---|
| `admin-event-studio-2` (checked out) | Not in the shared repo or on any remote. **Uncommitted:** AGENTS.md, README, `docs/PRODUCT_SLICE_001_DISCOVERY.md`, `prototypes/holiday-social` (7 MB), `prototypes/winter-exchange` (6 MB without `node_modules`/`.next`), and an older `prototypes/lanyard` variant | Commit to `archive/old-clone-wip`, then **ARCHIVE** |
| `codex/workspace-entry-evidence`, `-schema2-audit`, `-schema2-evidence`, `-schema2-v2-evidence`, `codex/workspace-studio-contract`, `prototype/event-studio-workspace` | Not in the shared repo or on any remote | **ARCHIVE** |
| `main`, `admin-event-studio-1`, `admin-journey`, `bidder-foundation-a`, `prototype_first_user_journey`, `staging-e2e` | Already ancestors of `origin/main` | DELETE |
| `~/code/bidzizi-admin-journey` | 3 modified files (AGENTS, README, package.json); its `prototypes/admin-studio` matches main except screenshots | Commit to the archive branch, then remove |
| `~/.codex/worktrees/bidzizi-delivery-audit/bidzizi` | Untracked `docs/reviews/` | Commit to the archive branch, then remove |
| `~/.gemini/antigravity/worktrees/bidzizi/prototype_first_user_journey` | 10 untracked or modified paths (an early Next prototype) | Commit to the archive branch, then remove |
| Other worktrees: `~/code/bidzizi-{bidder-foundation-a,event-studio-workspace,staging-e2e}`, 6 under `~/.codex/worktrees`, and one prunable worktree in `/var/folders` | Clean | Remove |
| `~/code/bidzizi-verifier-review-20261005`, `~/code/bidzizi-workspace-contract` | Symlinks (one dangling) | Remove |

## Target layout and migration

```
~/dev/bidzizi/                    main (canonical clone, outside iCloud)
~/dev/bidzizi-wt/nov19-execution  jryear/real-v1-nov19-execution
~/dev/bidzizi-wt/bid-shop-give    jryear/bid-shop-give
~/dev/bidzizi-wt/<next>           one worktree per active branch; delete it when the branch merges
```

If Orca must own worktree placement, keep its `~/orca/workspaces/integration/*` paths but re-point its repo to `~/dev/bidzizi`. Either way, nothing lives under `~/Documents`.

A fresh clone is safer than `git worktree move`. The iCloud directory *is* the main worktree, so it can't be moved with worktree commands. Cloning leaves the old store untouched until the new one is verified.

Run this only while no Claude or Codex session is working in these worktrees. **Not executed.**

```bash
OLD=~/Documents/Codex/2026-10-06/task-3/saturn-public-connected-release
TAG=archive/2026-10-16

# 1. Make origin fetch everything again.
git -C "$OLD" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git -C "$OLD" config --unset remote.origin.tagopt
git -C "$OLD" fetch origin

# 2. Archive tags for unmerged work in the shared repo, then push them.
for b in hotfix/sheet-no-dialog staging-e2e jryear/saturn-v1-configured-codex-refinement \
  jryear/junior-saturn-v1-frontend jryear/saturn-v1-authority-p2 jryear/saturn-v1-member-ui \
  jryear/saturn-v1-staff-ui codex/saturn-staff-delivery codex/saturn-staff-entry \
  codex/saturn-entry-inherited-gate-candidate codex/saturn-entry-inherited-gate-base \
  codex/saturn-studio-composition; do
  git -C "$OLD" tag "$TAG/${b//\//-}" "$b"
done
git -C "$OLD" tag "$TAG/main-before-cleanup" origin/main
gitleaks git --log-opts="--all" "$OLD"     # expect hash-only hits, as in this audit
git -C "$OLD" push origin "refs/tags/$TAG/*"

# 3. Rescue the old clone's uncommitted work, then import its unique branches as tags.
cd ~/code/bidzizi
git switch -c archive/old-clone-wip
git add -A                                 # the global gitignore keeps node_modules/.next/.env out
git commit -m "Archive uncommitted prototype work from ~/code/bidzizi"
(cd ~/code/bidzizi-admin-journey && git switch -c archive/admin-journey-wip && git add -A && git commit -m "Archive admin-journey WIP")
(cd ~/.codex/worktrees/bidzizi-delivery-audit/bidzizi && git switch -c archive/delivery-audit-wip && git add -A && git commit -m "Archive delivery-audit notes")
(cd ~/.gemini/antigravity/worktrees/bidzizi/prototype_first_user_journey && git switch -c archive/antigravity-wip && git add -A && git commit -m "Archive antigravity prototype WIP")
gitleaks git --log-opts="--all" ~/code/bidzizi
git -C "$OLD" fetch ~/code/bidzizi 'refs/heads/*:refs/old-clone/*'
for b in admin-event-studio-2 codex/workspace-entry-evidence codex/workspace-entry-schema2-audit \
  codex/workspace-entry-schema2-evidence codex/workspace-entry-schema2-v2-evidence \
  codex/workspace-studio-contract prototype/event-studio-workspace archive/old-clone-wip \
  archive/admin-journey-wip archive/delivery-audit-wip archive/antigravity-wip; do
  git -C "$OLD" tag "$TAG/old-clone/${b//\//-}" "refs/old-clone/$b"
done
git -C "$OLD" push origin "refs/tags/$TAG/old-clone/*"

# 4. Canonical clone outside iCloud, with only the active worktrees.
git clone https://github.com/jryear/bidzizi-auction.git ~/dev/bidzizi
cd ~/dev/bidzizi
git worktree add ../bidzizi-wt/nov19-execution jryear/real-v1-nov19-execution
git worktree add ../bidzizi-wt/bid-shop-give  jryear/bid-shop-give
git ls-remote --tags origin "$TAG/*" | wc -l      # expect 24

# 5. Only after step 4 is verified: retire the old stores (reversible until the trash is emptied).
mv "$OLD" ~/.Trash/bidzizi-icloud-store-20261016
mv ~/Documents/Codex/2026-10-07/task-18 ~/.Trash/bidzizi-task18-20261016
mv ~/orca/workspaces/integration/{real-v1-*,saturn-v1-*,junior-saturn-v1-*,ui-v1-skin} ~/.Trash/   # their .git files point at the trashed store
mv ~/code/bidzizi ~/code/bidzizi-* ~/.Trash/
git -C ~/.codex/worktrees/... worktree prune   # or remove those dirs; their store is gone
```

Step 5 also clears about 11 GB, most of it duplicated `node_modules` and `.next`. `bid-shop-give` and `checkpoint-audit` under `~/orca/…` stay until their branches are re-added in step 4.

## Not in scope here

Production, staging, Vercel and Neon were not touched, and nothing was merged. Remote branches were not deleted; deleting `staging-e2e` and `jryear/real-v1-claude-shell` on GitHub is Zack's call.
