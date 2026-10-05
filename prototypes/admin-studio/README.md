# BidZizi — first admin journey prototype

An isolated, browser-local Event/Lots studio for organization staff. The first outcome is **prepare an event catalog and approve one shared timed release**. This is an interactive design study, not an operational auction or an accepted backend contract.

## Open and run

The current preview is at [127.0.0.1:4331](http://127.0.0.1:4331/#/event). From this directory, use Node 24:

```sh
node serve.mjs
```

The server binds only to `127.0.0.1`. It requires no install or build. `PORT=4332 node serve.mjs` uses a different port. `pnpm dev` and `pnpm check` also work with the repository's declared pnpm 12.4.2 runtime.

On this host, Node 24 is `/Users/jryear/.nvm/versions/node/v24.4.1/bin/node`.

## First journey

1. **Choose the organization and event.** Saturn Barter is one organization in BidZizi; Holiday Trade Show is one of its events. The organization and event pickers demonstrate separate local workspaces. Create another event to try an empty catalog.
2. **Shape the event.** Edit the name, welcome, location note, cover photo, and optional event sponsors. See the actual A welcome screen respond beside the editor.
3. **Prepare the lots.** Add or edit titles, descriptions, photos, categories, opening bids, details, and catalog order. The organization supplies the items; event sponsorship is separate.
4. **Select lots and assign a window.** Select all or individual lots and assign the event's common opening and closing times in an explicit time zone. This prototype supports one shared window. Changing it updates assigned working-draft lots together.
5. **Preview and fix.** Navigate Welcome, Catalog, and Selected lot in the collapsible phone preview. Review schedule finds missing content. The flower fixture deliberately starts without a description; use its Fix action to complete it.
6. **Approve the scheduled copy.** Review the lots and times, then choose Schedule catalog. This stores a separate local snapshot. Unassigned lots stay drafts; further working edits do not alter the approved copy.
7. **Inspect the audience state.** Switch the preview to Audience view. Before opening, the catalog is hidden. Change the explicitly simulated Preview clock to During bidding or After closing to inspect automatic state transitions.

Simulation tools can interrupt the next save to exercise recovery or reset the current example. Reset preserves other local events. Drafts persist in this browser on this origin; they are not synced to another device. A new browser origin starts with the six-lot example and the intentional missing description.

## Decisions preserved

- BidZizi is the platform, an organization owns events, and each event owns its catalog.
- The staff journey begins with an existing organization context; organization onboarding is deferred.
- Staff enter the items internally. Most items come from the organizing organization, rather than sponsors.
- Lots receive a shared schedule through bulk selection, then open and close automatically.
- The audience catalog appears when bidding opens; there is no earlier published catalog in this journey.
- Event/Lots is the first workspace. Activity, reporting, and settlement come later.
- A's visual language, layouts, and bidder interactions remain the starting point.

## Provenance and integration boundary

The embedded bidder was copied from the committed A checkpoint **99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc**, branch `bidder-foundation-a`, in `/Users/jryear/code/bidzizi-bidder-foundation-a`. `A_BASELINE.json` records the original file hashes. The original worktree was left clean and unchanged.

The studio uses A's Fraunces and Instrument Sans fonts, colors, photography, and actual vanilla JavaScript bidder renderers. It is not a separate phone mockup. Changes to the isolated copy add a same-origin parent/iframe draft adapter, dynamic organization/event/lot content, a hidden catalog guard, preview clock states, separate simulated bidder storage, and phase-aware controls. The original A fixture kit remains the common seed data.

The admin editor and bidder communicate only within this local origin. This worktree is based on that exact committed A revision, with the approved admin studio added under `prototypes/admin-studio`. A's `prototypes/lanyard` source remains unchanged. Real application integration still needs an explicit shared component/data boundary and operational contract. No Next.js application files were modified.

The separate Git worktree is `/Users/jryear/code/bidzizi-admin-journey`, branch `admin-journey`, based on `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`. The canonical main checkout and original A worktree were preserved. Changes in this worktree are uncommitted; no pushes, migrations, provider writes, merges, or deployments were performed. `IMPORT_RECEIPT.json` identifies the approved session source and its UI file hashes.

## Design references

The user-authenticated BiddingOwl dashboard, Default Auction Preferences, and Add Item form were inspected read-only. Their separation of setup/homepage/items, repeated item dates, and warning that changed defaults do not update existing items informed the integrated studio and shared-window interaction. No auction was edited or created there; no account data or access codes were imported into these fixtures.

[RallyUp's customization page](https://rallyup.com/custom-branding/) and [auction overview](https://rallyup.com/auctions/) informed the emphasis on event expression and creative control. This was public-product research, not inspection of its authenticated admin workflow. The prototype keeps A's design language.

## Deliberate limits

- Scheduling, saves, bidder identity, bid activity, and organization switching are simulations. There is no scheduler, server authority, authorization, persistence service, SMS, or payment flow.
- One shared window, on one date, is supported. Multiple groups with different windows, overnight windows, late catalog changes, cancellation, and extensions need further design and explicit rules.
- Currency is labeled example USD; amounts use integer cents. One event increment and opening-bid alignment are fixture assumptions, not settled Saturn monetary rules.
- Opening is inclusive and closing exclusive in this study. The catalog remains viewable after closing; post-close visibility and winning/settlement semantics remain provisional.
- Optional sponsors currently have names and fixture marks. A full brand toolkit, sponsor uploads, and richer event layouts are later exploration.
- Routes and local organization switching do not enforce tenant boundaries. They do not prove that signed-in staff have permission, or that a bidder's Member ID grants business access.
- The inherited A bid/onboarding/auto-bid screens remain simulated. They do not settle bidding authority, auto-bid tie rules, donation semantics, or payment rules.
- Local image upload is implemented for JPG/PNG/WebP up to 1 MB, but an actual upload was not exercised in browser QA. Fixture image selection was verified.

## Evidence

See [current QA record](evidence/QA.md), [historical session QA](evidence/PRIOR_QA.md), and [worktree handoff](../../docs/ADMIN_JOURNEY_HANDOFF.md). Historical screenshots remain in the original session directory; fresh worktree captures are written to the ignored `evidence/shots/` directory. Run the nine model boundary checks with:

```sh
node evidence/model-check.mjs
node evidence/browser-check.mjs   # requires repository Playwright dependencies and the running preview
```

These are local prototype checks. No frozen contract, trusted-base RED/GREEN run, kernel completion verdict, real-device acceptance, or release acceptance is claimed.
