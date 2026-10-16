# Checkpoint plan, 2026-10-16

This plan merges two independent audits of `main` at `573f329`:
- Claude's audit, in [CHECKPOINT_2026-10-16.md](CHECKPOINT_2026-10-16.md).
- A read-only Codex audit. Its report was pasted into the Claude session and is summarised here by its finding IDs.

Where the two agree, the item is in the plan. Where they disagree, the plan records the choice made and the reason.

The goal is a clean, trustworthy base for Shop (phase B of [BID_SHOP_GIVE.md](BID_SHOP_GIVE.md)). This is not a rewrite. The bid engine's database rules (locks, receipts, unique constraints, close timing) held up under both audits.

## Order

| # | Phase | Why this order | Needs Zack |
|---|---|---|---|
| 0 | Preserve | Cheap, and nothing else is safe until it's done | Go to push archive tags |
| 1 | Correctness fixes | Real defects on Nov 19 money paths; they must land before Shop adds a third money path | Go to deploy to production |
| 2 | Cleanup PR on main | Shop should land on a lean, honest base | Merge to main |
| 3 | Move out of iCloud | Doesn't block code work; needs quiet worktrees and a confirmed Orca procedure | Go to run it |
| — | Shop phase B | Starts on the cleaned main | Visual choice first |

## 0. Preserve

Codex's procedure is adopted because it is more complete:
- it tags branch heads, the stash, and the unreachable reflog tips (10) in both repositories;
- it pushes them to `refs/tags/archive/20261016/{icloud,older}/…` and checks them against `ls-remote`;
- it takes a private snapshot of every dirty or ignored-material directory, with tarball, index and worktree patches, status and a manifest;
- it makes `git bundle --all` of both object stores.

All of this goes under `~/dev/bidzizi-preservation-20261016` (mode 700). The snapshots can contain local Vercel tokens, so they never go into Git.

Before tagging, fix the fetch refspec. It is set to `staging-e2e` only, which is why every agent saw a stale `origin/main`:

```
git config --replace-all remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
```

The old repository is not one clone. It has 15 worktrees (Codex's inventory). Treat `~/code/bidzizi`, `bidzizi-admin-journey` and the Antigravity worktree as KEEP until their snapshots are verified.

## 1. Correctness fixes

Both audits found the server engine sound. Codex found the defects one layer up, in guest-side recovery and staff transactions; Claude's audit missed them.

The four items marked **(verified)** were re-read in source at `573f329` while merging. The rest are taken from the audits' line references.

All tests run against a disposable local database (`tests/load/local.mjs` style), with separate connections for the races.

| ID | Defect | Fix | Proof |
|---|---|---|---|
| CORRECT-01 (verified) | `sheet.tsx:233` `ResumePending`: a receipt lookup that succeeds with `null` deletes the pending bid and says "Nothing was placed". The original request may still commit afterwards. | On `null`, keep the pending record and re-check or replay that same request ID. Never announce "nothing placed" while the request could still land. | A delayed commit after a null lookup: one bid, correct message |
| CORRECT-02 (verified) | One pending slot per event (`bz_pending_${code}`). An uncertain bid on item A is overwritten by a bid on item B. | Key pending records by item or request; resume them all. | Two unresolved items, reload: both recovered |
| CORRECT-03 (verified) | `give.tsx`: "Change" clears the request ID, and navigation or reload loses the ref. A lost response then a re-confirm records two pledges, although the UI promises it never will. | Persist the request ID and payload before sending; resolve or replay before allowing a new pledge. | Lost response, then Change, navigation, reload: exactly one pledge |
| CORRECT-04 (verified) | `decideAward` reads the item without a lock (`ownItem` with no lock), then checks a stale `withdrawn_at` after taking the standing lock. A withdrawal or schedule change can slip in between. | Lock in the established order (event, item `FOR SHARE`/`UPDATE`, standing), then evaluate phase and withdrawal. | Coordinated connections: no active award on a withdrawn item |
| ARCH-01 (verified) | `prod-migrate.mjs`: the DDL and the `schema_migrations` insert are separate, with no runner lock. A crash between them reruns non-idempotent DDL. | Advisory lock; run the body and the ledger insert in one transaction; hash the unchanged file bytes. | Fault injection after DDL; two concurrent runners |
| R1 / CORRECT-07 | Staff login counts attempts before an expensive hash and records them after. A parallel burst gets far more than 5 guesses and about 2 GB of memory. | Reserve the attempt under a lock before hashing. | Parallel burst respects the cap |
| CORRECT-06 | A login that started before a password reset can still create a session after the reset. | Recheck the password version under the staff row lock when the session is inserted. | Reset between verification and insert: no session survives |
| CORRECT-05 | Two first joins racing with the same request ID: the second gets a 503 instead of a replay. | Take the request lock before the lookup. | Racing retries: one participant, both usable |
| R2 | A join retried within 10 minutes reissues the login cookie. | Low; fold into the CORRECT-05 change. | — |

R3 is a product gap, not a bug: staff can't be deactivated, and any staff member can reset a colleague's password. It needs Zack's call on the rule. Suggested: only an owner role resets others; add deactivate.

**Deferred**, recorded and not blocking:
- ARCH-06: staff `once()` binds the operation, not the payload. Fix it when Shop touches staff create, and don't copy it into purchases as is.
- ARCH-07: snapshot consistency and growth.
- ARCH-08: the restore drill's ID-only delete, with mocked tests.

## 2. Cleanup PR on main

One PR, so the app's behaviour doesn't change except for the `/host/[id]` redirect.

- **Remove after the archive tags exist:**
  - `migrations/001–019` (the runner reads only `migrations/prod/`);
  - `prototypes/admin-studio` and `prototypes/items-workspace`, plus the dev scripts that point at them;
  - `tasks/*.toml`;
  - the kernel `VERIFY_*` wrappers.
- **Port before removing.** `tests/contract/` holds real assertions (photo framing, preview isolation). Turn them into ordinary disposable-database tests. Codex's point: remove the ceremony, keep the proof.
- **Evidence and plans binaries** (about 146 MB): remove superseded groups (`photos-review/`, `preview-attach-review/` and similar). Keep the current product, release, compatibility, Nov 19 runbook and preflight docs, and the evidence they cite.
- **Keep** `prototypes/lanyard` (the selected foundation) and `prototypes/bid-shop-give` (pending choice).
- **Retire** `/host/[id]` (841 lines): redirect to Studio, and keep the password-setup alias.
- **Restore `.vercelignore`** from `3acc189`, as a single file, not a merge of that branch.
- **Rewrite** README, `.env.example` (`BIDZIZI_DATABASE_URL`, mode, origin) and AGENTS.md around Real V1:
  - keep the guardrails: host/join, server authority, TLS, integer cents, secrets, old iOS, the external-effect boundaries, and the generated Next.js block;
  - drop "bidding unimplemented", "contracts mandatory" and "no test script".
- **Add** `pnpm test`, plus CI on pull requests: typecheck, build, unit, disposable Postgres for the money-path tests, and the Chromium/WebKit bid-sheet suite.
- **Script** the production deploy.
- **Sanitise** top-level errors in `prod-migrate.mjs` and `provision-staff.mjs`.
- **No history rewrite.** Clone size isn't worth it.

## 3. Move out of iCloud

Move the shared git directory to `~/dev/bidzizi` (`mv` followed by `git worktree repair`), then switch that root to `main`. The active Orca worktrees keep their paths.

This is chosen over a fresh clone because it keeps the active worktrees linked. Codex's caveat stands: confirm how Orca rebinds a moved repository root before the move.

Then retire the archived worktrees with `git worktree remove` (no `--force`), through Orca where Orca owns them. Remove the old repository last, after its snapshots are verified. Codex's audit has the exact commands.

Keep: `main`, `bid-shop-give`, `real-v1-nov19-execution`, `checkpoint-audit` (until this plan lands). `real-v1-claude-shell` is merged; its three untracked `.bz-*.mjs` files are Claude's throwaway Playwright scripts and were deleted. Remote branches `staging-e2e` and `jryear/real-v1-claude-shell` can be deleted after their tags are verified.

## Before Shop

ARCH-04: make the item kind explicit in server types, and reject the wrong kind before anything reads a standing. Shop's kind-leak audit in BID_SHOP_GIVE.md already lists the consumers. No generic commerce layer.

## Decisions for Zack

1. Push archive tags (phase 0).
2. Ship the phase 1 guest and award fixes to production before Nov 19. Recommended: yes. They are money integrity, and the change is small.
3. The R3 staff rule.
4. Merge the cleanup PR.
5. Run the move (phase 3).
6. The Bid · Shop · Give visual choice.
