# Items workspace: connected build (Claude, 2026-10-13)

## Why

Zack **rejected** the isolated Items prototype (`prototypes/items-workspace`, http://127.0.0.1:3423, `docs/plans/ITEMS_WORKSPACE_STUDY.md`). You can look at it for its edge cases, but don't copy its design or its two-flow framing. Build Claude's own version, **connected to the real backend, inside the Studio**.

**This is the last piece before a full walkthrough with Saturn staff.** Optimize for staff entering a real trade show's worth of items (dozens) quickly and confidently, without help.

## Zack's requirements (from his passthrough)

- **A full-width Items workspace** in the BidZizi home design language (the current Studio and Studio home), with the phone preview hideable, so people can "cook out a ton of items quickly".
- **Category management:** create, rename, merge and assign categories, and filter by category. The schema currently stores category as free text on each item. Add server support if needed, for example a bulk rename/merge endpoint, or a categories table if that's clearly better.
- **Filtering:** by category, status (shown/hidden, has bids, closed), missing photo, and search.
- **The sidebar item list must stay clean beyond 8 items:** compact, searchable, grouped or collapsible, with **quick drag to reorder** plus keyboard and touch alternatives.
- **Fast creation:** add many items quickly (rapid add rows and/or paste rows from a spreadsheet, with a review step), and bulk photo drop matched by order or filename. Every field autosaves.
- **Multi-select actions:** set category, show/hide, delete where allowed (only items with no bids; withdraw exists for items with bids).
- It works on a phone too, not squeezed.

## Decide, don't ask: unfinished items

Use the existing `items.ready` flag ("Visible to guests"):
- **Draft event:** new items are visible as soon as they have a title and a starting amount.
- **Published event:** a new item starts **not yet visible**, and staff explicitly show it to guests when it's ready.

Make it obvious which items guests can see. Keep autosave everywhere, with no extra publish step for edits to items guests can already see. Explain the choice in the checkpoint.

## Fit the architecture direction

Read `docs/plans/REAL_V1_NEXT_TRANCHE.md` and follow its principles where they apply:
- Navigator → Preview → Inspector;
- the preview uses the real guest components;
- human-first wording before technical detail;
- brand tokens separate from state tokens.

Don't implement the rest of that tranche now.

## Rules

- Backend changes are allowed: a new migration `migrations/prod/008_*.sql` (never edit applied ones), plus journey tests for every new endpoint and rule.
- Keep all of these green:
  - tsc;
  - `next build`;
  - `tests/v1/journey.mjs`;
  - `tests/v1/operations-ui.mjs`;
  - `tests/v1/display-logic.mjs`;
  - the image checks.
- Capture 390px and 1440px screenshots and critique them twice.
- Seed a realistic 40-item trade show and test the workspace with it.
- Commit locally after each meaningful stage. No push, merge, deploy or cloud resources.
- Keep the dev server on `127.0.0.1:3420` (`bz_test_claude`, host@example.com / claude-shell-pass) for Zack, and apply new migrations to `bz_test_claude`.
- Finish with an "Items workspace" section in `docs/plans/CLAUDE_SHELL_CHECKPOINT.md`. It should cover:
  - screenshots;
  - the unfinished-item decision;
  - a 10-minute script Saturn staff can follow in the walkthrough: create the event, add 20+ items fast, categorize, photo, reorder, go live, add one more item while live.
