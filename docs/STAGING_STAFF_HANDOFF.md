# Synthetic staff-drafts staging slice

Worktree: `/Users/jryear/code/bidzizi-staging-e2e`, branch `staging-e2e`. Original A foundation and canonical main are preserved. The standalone admin prototype remains on `admin-journey` at loopback4331.

`/admin` uses the approved Event/Lots workspace and A renderer copies. Synthetic staff select only server-granted organizations, create/edit incomplete event and lot drafts, save explicitly, reload in an independent session, and inspect the confirmed saved revision in the bidder preview. Working previews are labeled unsaved. Failed or lost acknowledgements remain unconfirmed; a stable request ID recovers the committed receipt. Stale revisions require explicit reload. Organization and session changes invalidate pending responses and clear private UI content.

Saturn is an organization in BidZizi; Holiday Trade Show is its synthetic example event. The organization supplies items, while event sponsors are separate. Staff can enter/order lots and bulk assign the draft shared opening/closing window. These are saved metadata: publication, automatic audience opening, and actual bidding are disabled in this slice. No real person/business authorization can be inferred from these fixed test accounts or typed Member IDs.

## Local gate

Use Node24, pnpm12.4.2 and external kernel3.0.0. Frozen base is `3983c89aaff31b7a4452d0657111bdada0455343`; contract is `tasks/staging-staff-drafts-001.toml`. The kernel independently starts disposable local PostgreSQL18/Next/browser infrastructure for each tree and cleans its own storage. It refuses runtime env files and strips deployment credentials. Existing Neon pooled/TLS adapter is unchanged.

```sh
python3 ~/code/_kernel/verify.py tasks/staging-staff-drafts-001.toml --repo . --base 3983c89aaff31b7a4452d0657111bdada0455343 --baseline
python3 ~/code/_kernel/verify.py tasks/staging-staff-drafts-001.toml --repo . --base 3983c89aaff31b7a4452d0657111bdada0455343 --claim "Synthetic authorized staff can create, durably save, reload and preview organization-owned event and lot drafts with tested tenant isolation and recovery." --implementer-model "GPT-6 Codex runtime"
```

Actual baseline exit0/BASELINE_READY and corrected candidate exit0/SUPPORTED are in [the receipts](STAGING_GATE_RECEIPTS.txt), with the prior exit1 retained. [Kernel result](STAGING_KERNEL_RESULT.json) includes finite base failure causes, candidate outputs and unchanged protected/scope checks. [Red-team binding](STAGING_RED_TEAM_BINDING.json) pins the independent revised race and negative mutant.

The bounded Claude review timed out without a review. Parent/Claude contract acceptance remains pending. Local checks do not prove deployment. The approved Neon isolated database and Vercel Preview-only bindings are recorded in [setup](STAGING_SETUP_RECEIPT.md); protected generated host, exact release revision, HTTPS cookie behavior and connected browser E2E must be inspected separately before a release pass. Proposed catalog/manual-bid contracts under `docs/proposed/` are not frozen or accepted.
