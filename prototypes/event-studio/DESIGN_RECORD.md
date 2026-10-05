# Workspace Event Studio design record

Phase: isolated interactive exploration, ready for user comparison. Visual acceptance of this staff workflow is pending. Delivery is this local worktree and preview; connected implementation, integration, publication, and deployment are outside this exploration.

## Inspected references and preserved state

- `/Users/jryear/code/bidzizi`: branch `admin-event-studio-2`, `b6beff9`, with inherited modified README/AGENTS and untracked discovery/prototypes. Read README and AGENTS. No files changed there.
- Design A: `/Users/jryear/code/bidzizi-bidder-foundation-a`, branch `bidder-foundation-a`, clean at `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`. Inspected design notes, CSS, source renderers, fixtures, persistence, README, AGENTS, and bidder handoff. Rendered its entry and catalog from the identical source in this isolated checkout. Retained captures: `evidence/design-a-entry.png` and `evidence/design-a-lots.png`.
- `/Users/jryear/code/bidzizi-admin-journey`: `admin-journey`, `99156cc`, inherited modified AGENTS/README/package and untracked admin prototype/handoff. Inspected Git metadata only, respecting the instruction not to inspect the competing prototype.
- `/Users/jryear/code/bidzizi-staging-e2e`: `staging-e2e`, clean at `916eaa2`. Read README/AGENTS to reconcile current product state: synthetic staff drafts, immutable catalog approval, explicit VIEW/BID boundaries, and catalog hidden until bidding opens are ahead of the current checkout. Did not run it, read credentials, access its database, or change any staging state.
- No repository-local `.agents/skills` exists in the current checkout or inspected A/staging trees. The available frontend-design and outcome-delivery skills were applied. The skills under the user's `.agents/skills` cover Orca and payments and are not needed for this plain Git/static prototype task.

Own branch: `prototype/event-studio-workspace`; worktree `/Users/jryear/code/bidzizi-event-studio-workspace`, based on A's exact source revision. The original A source and all connected `src/`, task contracts, package metadata, lockfile, provider configuration, and deployment files are unchanged. No push or merge.

## Staff moment and composition

Returning organization staff need to manage many items while keeping the current event unmistakable. The first viewport emphasizes the catalog workspace: lot rows, search/filters, selection, bulk category/window assignment, and fast tab movement. Readiness is continuously accessible from the header and sidebar footer, without turning the work into a step-by-step wizard.

The organization owns the event collection. A persistent event selector changes every destination's context. Overview is a useful return point; Auction workspace groups Lots, Categories, and Bidding windows. Presentation, attendee/access, displays, SMS readiness, and donations have distinct destinations.

Lot editing is a right-hand drawer using a native dialog. It retains context, supports draft recovery, shows a concrete increment example, and contains duplication. Incomplete drafts remain valid staff work and generate visible, actionable setup checks. Bulk operations commit immediately to local event data, with explicit target validation and a persistent single-window reference.

## Reproducible visual decisions

- Direct A font files: Fraunces variable serif for wordmark/headings and Instrument Sans for UI/body. A's `SOFT 60` heading setting and restrained serif weight are preserved.
- Exact A palette: paper `#F5F0E6`, secondary paper `#ECE5D6`, card `#FFFCF5`, ink `#1A1814`, muted ink `#5A5448`, line `#D9D0BE`, cobalt `#2338C7`, marigold `#F2B632`, status green `#12724A`.
- Color jobs are retained: cobalt actions; ink navigation; marigold organization identity; green for checks; amber for missing setup. Sponsor initials use rounded squares. Organization identity uses a circle.
- Desktop sidebar 232px, header 76px, workspace padding 30px/32px, primary heading 36px, section headings 25px. Lot rows use 50px thumbnails with a two-line title and 12px vertical padding. Buttons are 42px, bulk controls 36px, fields 40px. Rounded borders stay between 10 and 18px; the grouped workspace navigation follows A's ink pill with paper selection.
- At laptop widths the contextual right rail recedes while the workspace tabs remain available. The 1280×800 and 1024×768 compositions preserve the main work and avoid page overflow. Below 600px the sidebar becomes a horizontal nav and the table can scroll, but the admin product is designed for desktop/laptop; this is not a phone-admin acceptance claim.
- The mobile bidder preview is 390px wide. A's actual `lotsView()` and `lotView()` renderers are reused with a bounded in-memory draft adapter. The adapter does not call A's persistence or bid simulation. Guest identity, watching/maximum controls, and bid actions are removed from this staff preview. Physical welcome content is adapted to the event draft. All catalog visibility is explicitly a staff simulation.

## Evidence and self-review

The executable walkthrough starts with the two fixture events and creates a third from scratch. It exercises creation, welcome/details, incomplete and complete lots, duplication, category assignment, two windows, bulk assignment, unassigned recovery, actual A bidder rendering/navigation, completion of setup, readiness review, reload, switching, displays, SMS states, donation wording, shared QR presentation/printing, stale review, keyboard close/focus, storage failure, and a 60-lot catalog. Viewports: Chromium 1440×1000, 1280×800, 1024×768; WebKit 1280×800.

The final browser run passed 58 of 58 checks on Node 24.4.1; scaffold typecheck also passed. No browser console/page errors or external application requests were observed. Representative captured states are committed in `evidence/shots/`; exact test counts/results and runtime are in `evidence/results.json`. The typecheck covers the unchanged scaffold, while browser checks cover this static prototype.

Meaningful defects corrected during the rendered walk: embedded preview navigation consumed parent Back; failed local persistence needed to restore the current event reference as well as the saved state; completed readiness Inspect links initially opened an empty issues view; the notes rail squeezed the table at 1280px. Repeated duplicate/apply/review actions, targetless bulk assignment, and whitespace/precision/interval/duplicate-name validation were also exercised. Screenshot capture waits for rendered dialog state and fonts, and evidence controls target the current dialog rather than background controls.

Limitations: no real provider/authority/storage evidence, no hosted device sharing, no real TV/iPad hardware, no assistive-technology audit, no multiple-tab conflict resolution, no file-upload pipeline (heading/lot images are selectable fixtures), and no operational approval/relisting/rescheduling policy. Storage corruption or cleared browser data is not a cross-device recovery flow. The display preview applies presentation configuration only; its lot data remains the current local catalog.

## Decision still to be made

The user comparison is the workspace-led staff workflow within Design A's established visual language. No visual acceptance of this exploration is inferred from passing checks. One window per lot, later-window catalog visibility, scheduling/overlap, real money/admission/auction rules, and external-service boundaries remain provisional as listed in README.
