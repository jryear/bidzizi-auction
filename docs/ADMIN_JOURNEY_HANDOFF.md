# Admin journey worktree handoff

## Receipt

- Repository: `/Users/jryear/code/bidzizi`, origin `https://github.com/jryear/bidzizi-auction`.
- New worktree: `/Users/jryear/code/bidzizi-admin-journey`.
- Branch: `admin-journey`.
- Base and current HEAD: `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`, the committed A foundation with its simulated second pass.
- Implementation: `prototypes/admin-studio/`, imported from the approved session prototype in `/Users/jryear/Documents/Codex/2026-10-02/task-3/admin-prototype` with the user's requested wording cleanup.
- Current preview: `http://127.0.0.1:4331/#/event`, served from this worktree, loopback only.
- Effect scope: local branch/worktree and uncommitted implementation. No commits, push, merge, deployment, database access, SMS, or real bids.

The approved UI was transferred without a redesign. `IMPORT_RECEIPT.json` records hashes for 14 imported UI files; all match. The server's default port changes from 4330 to 4331 so the original session preview remains separate. Documentation and an executable browser journey check were added for this checkout.

## Implemented journey

Organization staff choose an event, edit its welcome/details/sponsors, enter and organize lots, select lots together, assign one shared opening/closing window, use the actual adapted A bidder renderers in a collapsible preview, fix missing content, and approve a scheduled catalog snapshot. Audience view hides the catalog before bidding opens. The preview clock demonstrates opening and closing.

BidZizi contains organizations. Saturn and Holiday Trade Show are example organization/event data. The organization supplies the items; optional event sponsors are separate. The first staff workspace remains Event/Lots. All persistence, scheduling, identity, organization switching, and bid behavior are browser-local simulations. One shared same-date window and example USD cents are prototype assumptions, not operational contracts.

Simplified labels include Event details, Welcome page, Bidding schedule, Event sponsors, Lots, Review schedule, Assign auction window, and Create event. Existing editable content is preserved; new default welcome content is also plain.

## Changed paths

- New `prototypes/admin-studio/`: editor, model, adapted A bidder preview, static server, provenance, documentation, and prototype evidence.
- `package.json`: adds `dev:admin`, `check:admin`, and `check:admin:browser`; no dependency changes.
- `README.md`: admin prototype location, commands, and simulation boundary.
- `AGENTS.md`: accepted admin discovery decisions and pointer to this handoff.
- This handoff.

`src/`, `prototypes/lanyard/`, `pnpm-lock.yaml`, and the kernel/task files are unchanged. The canonical main checkout's inherited dirty files and original A worktree were preserved.

## Run

Use Node 24 and pnpm 12.4.2 from the worktree root:

```sh
pnpm dev:admin
pnpm check:admin
pnpm check:admin:browser
pnpm typecheck
```

The static preview and model check need no dependencies. The browser check and TypeScript use repository tooling. This machine's ignored `node_modules` directory contains local links to the A worktree's already installed dependencies; it was not committed or installed again. On a fresh checkout use `pnpm install --frozen-lockfile`. No environment credentials are needed for the prototype.

The running server was started with `/Users/jryear/.nvm/versions/node/v24.4.1/bin/node prototypes/admin-studio/serve.mjs`. `PORT=` can select another local port. The browser check takes `URL=` and creates a disposable browser context; it does not change the user's browser drafts. A new port/origin starts with fresh example drafts.

## Verification — 2026-10-04

- Nine model boundary checks passed.
- Six headless Chromium journey checks passed: rendered Event/A welcome, bulk schedule and missing-content fix, hidden/open/closed audience states and approved-copy isolation, save interruption/retry/reload/search recovery, separate fictional organization drafts, and laptop bounds/resource/JavaScript checks.
- TypeScript passed with `tsc --noEmit --incremental false` on Node 24.
- Thirteen JavaScript files passed syntax checks.
- Fourteen imported UI files matched the approved source hashes.
- `git diff --check` passed; Next source, A source, and lockfile match the base.
- Fresh desktop screenshots were visually inspected. Browser captures are under `prototypes/admin-studio/evidence/shots/` and ignored by Git.

The initial browser check used a nonexistent closed-state selector. It was corrected to A's actual closed-state element and the full journey rerun successfully; no UI behavior was changed to make the check pass.

No Next production build was run because this work is outside the Next application/build. No frozen contract, trusted-base kernel verdict, physical-device acceptance, secure tenant/staff authorization, server scheduler, or production release is claimed. A production implementation requires a separate agreed contract; this worktree carries the approved simulated journey forward.
