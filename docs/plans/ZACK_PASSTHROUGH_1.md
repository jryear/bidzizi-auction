# Zack's passthrough 1 (2026-10-13)

Zack's verdict on the Claude shell after the tightening pass: "that is fucking fire. Just some obvious quirks and much needed additions." This build is the chosen direction.

## Step 0: merge Codex's operations first

Branch `jryear/real-v1-design-pass` (commit `1477cae`, worktree `real-v1-design-pass`) contains the backend and no-developer operations. Read its checkpoint, `docs/plans/REAL_V1_DESIGN_PASS_OCT19_CHECKPOINT.md`. It covers:
- migration `003_operations.sql`;
- void bid, withdraw item, edit participant, change close;
- staff invite and password setup;
- practice reset, and draft delete/archive;
- 40 journey checks;
- `tests/v1/operations-ui.mjs`.

Merge it into this branch:
- **Keep this branch's experience.** Where both changed the same screens, this branch's design wins.
- **Keep Codex's server, migration and API work in full.**
- **Rebuild Codex's operation screens in this design language:** void and withdraw in Live, participant edit, Staff & access, practice reset and delete housekeeping.

All of `tests/v1/journey.mjs` (40), `operations-ui.mjs`, tsc and build must be green afterwards.

**From now on, backend changes are allowed where an item below needs them.** Add a new `migrations/prod/00N_*.sql` (never edit applied ones), and add journey tests for every new rule.

## Decisions (Zack may override; build these)

- **Readiness and live edits.** There's no separate publish step. When live, autosaved edits reach guests instantly.
  - Make it unmistakable with a status pill: "Draft · only you can see this" or "Live · changes appear to guests instantly".
  - Show a calm "Saved" / "Saving…" indicator in the top bar. Admin-facing copy only, no dev language.
  - "Go live" runs a readiness check first: items without photos, schedule not confirmed, no items, no cover. Warn, don't block.
- **Donations.** Remove the "Let guests donate" toggle. Donations appear when at least one nonprofit exists (the server-side enabled flag follows that) and the deadline hasn't passed.
- **Outbid display.** When outbid, lead with the **current top bid** and "Bid $X". The participant's own losing bid is not prominent; it lives in the expandable history. Leading shows your bid as the top bid. Saved items with no bids show the starting amount, otherwise the current top bid. Add a test that locks this logic down.
- **New rule: bidder visibility.** An event setting, "Show bidders as":
  - name and business (default);
  - business only;
  - anonymous ("Bidder 12", a stable per-event number).

  Enforce it **on the server** in the participant snapshot, feed and stage display, so hidden names never reach phones. Staff always see full identities. Put it with the bidding rules, and add journey tests.
- **Remote bidders.** Build a Share panel:
  - copy link;
  - native share (`navigator.share`) for text and email;
  - room code;
  - **print QR** as a table card and a full page;
  - a note that remote guests use the same link.

## Quirks to fix

1. **Compact view for items** (attendee), properly designed, not just smaller cards.
2. **Studio phone preview is slightly off-centre.** Centre the device frame precisely in its column.
3. **"Look" section:** the controls overlap each other. Rebuild the layout. Add **quick custom colours** (accent and background, with an automatic contrast check). Make the provided themes excellent, not just adequate.
4. **Bid increment panel:** its design language doesn't match the rest. Redesign it in the house style.
5. **Welcome editing has no visible save state.** Add the save indicator (see Readiness above).
6. **Sponsors:** add an optional hyperlink per sponsor, and fix the logo upload (it has the same problems as images below).

## Additions

1. **Images:**
   - Make adding them more intuitive: drag and drop, paste, and click, with a clear target.
   - Add **crop and focal point** for the cover/welcome image, item photos and sponsor logos. Store the crop or focal point on the server (asset or reference metadata).
   - **Every screen that shows that image honours it**, from phone cards to item hero, stage display, Studio canvas, desktop layouts and share cards. It must scale responsively everywhere.
2. **Sidebar sizing:** widen the inspector/sidebar, since the phone preview leaves room. Rebalance the three columns.
3. **Sidebar item list at scale:** with more than 8 items it gets long. Make it compact and searchable, with category groups or collapsing, and **quick drag to reorder** (plus keyboard and touch alternatives).
4. **Expanded Items manager:** a full-width screen in the BidZizi home design language, with the preview hidden, for building and editing a lot of items fast.
   - Table/grid toggle, inline editing, and bulk add (paste a list, or add several rows quickly).
   - Bulk photo drop (match by order or filename).
   - **Category management:** create, rename, merge, assign in bulk, and filter by category, status, missing photo or has bids.
   - Multi-select actions: category, hide/show, delete where allowed.
3. **Event home / event info page:** one designed guest page with event info, sponsors (linked) and donate. Make it editable on the canvas like the welcome page.
4. **Winner page preview:** the "You won" screen with the winner message should be previewable and editable on the canvas, not only as a text field in Details.
5. **Stage display configuration:**
   - which items to show (all, selected, closing soon, a category);
   - rotate every X seconds;
   - show or hide recent bids, the ticker, totals and the QR code;
   - pin an item;
   - "jump to new bid" on or off.

   Persist it per event and apply it to `/studio/[id]/stage`.
6. **Your own ideas for the space.** List them in the checkpoint and build the ones that clearly earn their place before Nov 19. Mark the rest as proposals.

## Process

- Same quality bar as before: capture at 390px and 1440px, critique twice, and show before/after pairs.
- Gates: tsc, `next build`, `tests/v1/journey.mjs` (all checks, plus new ones), `operations-ui.mjs`.
- Commit locally in sensible commits. **No push, merge to main, deploy or cloud resources.**
- Keep the dev server on `127.0.0.1:3420` (`bz_test_claude`, host@example.com / claude-shell-pass), so Zack can keep using it. Apply new migrations to `bz_test_claude`.
- Finish with a "Passthrough 1" section in `docs/plans/CLAUDE_SHELL_CHECKPOINT.md`. Say what was done, with screenshots, and list open questions for Zack.

## Scope update (Zack, 2026-10-13): this build is the smaller batch; larger adds come later

This build delivers only the following, **in this order. Commit after each numbered stage** so Zack can review as it lands:
1. Step 0: merge Codex's operations.
2. Readiness: the Draft/Live status pill, the "Saved" indicator and the Go-live readiness check.
3. Share panel with printable QR (table card and full page), copy link, native share and room code.
4. Bidder visibility setting, enforced on the server, with tests.
5. Outbid display rule (with a test), and donations appearing when a nonprofit exists (no toggle).
6. Quirks:
   - compact items view;
   - centred phone frame;
   - Look section layout, plus **one** custom accent colour with an automatic contrast check;
   - bid increment panel restyle;
   - save indicator on welcome editing;
   - sponsor hyperlink, and a fixed logo upload (simple, reliable upload; no crop yet).

**Deferred to a dedicated later build (do not start these now):**
- the full-screen Items manager, categories, bulk add and bulk photos;
- the sidebar item list at scale, with drag reorder;
- image crop and focal point everywhere;
- stage display configuration;
- the editable event info page;
- the winner page preview;
- a wider sidebar rebalance.

For "your own ideas", **write proposals only**, in the checkpoint.
