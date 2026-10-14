# Photos that behave, and Items polish (brief, 2026-10-14)

Zack: "Welcome page and item images are not moving around as we imagined; the interaction is weirdly not
user-friendly, no crop, no real change when moving it around." Also: "upload batching is weird, not intuitive."
This tranche fixes photos end to end (upload → assign → frame → render everywhere) and polishes the Items workspace.
It builds on the Studio preview that now renders the real guest app (`real-v1-preview-001`, released 2026-10-14).

Read first: `AGENTS.md` (Real V1 operating mode + guardrails, incl. old iOS Safari rules),
`docs/plans/REAL_V1_PREVIEW_ATTACH_REVIEW.md`, and `tasks/real-v1-photos-001.toml` (the frozen contract for this tranche).

## Why photos feel broken today (diagnosis, verified in code)

- Position is only a focal point fed to CSS `object-position` (`src/lib/photo.ts`). With `object-fit: cover`, that
  moves the photo only along the axis that overflows. A landscape photo in a landscape card or hero barely
  overflows, so dragging changes almost nothing. There is no zoom, so there is no real crop.
- The control is indirect: a dot on a thumbnail of the full photo, two small previews and two sliders
  (`src/app/studio/photo-tools.tsx`). You never move the photo inside the real card or hero.
- Bulk upload makes matching a pre-upload form (`PhotoDialog` in `src/app/studio/[id]/items-dialogs.tsx`):
  choose "file names" vs "in order", fix 40 dropdowns, then it uploads one at a time. Real files are `IMG_9921.jpg`.
- HEIC from a Mac fails in Chrome ("couldn't be read"): the browser shrink step can't decode it.
- The server decodes one image at a time (`ASSET_BUSY` + client retry), so batches must be gently concurrent.

## Part A: framing (pan + zoom), everywhere

**Model.** Replace the focal point with a frame `{ x, y, zoom }` per use (event cover, item photo, sponsor logo):
x/y = the photo point at the frame's centre (0–1), zoom ≥ 1 (1 = today's cover fit; cap ~4). New migration
`010_photo_frame.sql` (never edit applied ones): add the zoom, keep existing x/y, default zoom 1, so every
existing photo renders exactly as now. API accepts and validates the frame wherever focal is accepted today;
stale-write protection (`*ExpectedAssetId`) stays. Journey tests for validation, defaults, duplication and staleness.

**Rendering.** One shared `<Photo>` (or equivalent) used by every surface that shows these photos: guest cards
(large and compact), item hero, welcome/event hero, My bids tickets, sheet, moments, stage display, Studio lists,
results, print/share. Cover-fit × zoom, then translate so (x, y) sits at the frame centre, clamped so the frame is
always filled (no empty edges at any aspect). Use transforms, not `object-view-box`; must work on iOS 16 Safari
(see AGENTS.md). Same frame → the same subject on every aspect ratio.

**Interaction (the point of the tranche).** On the Studio phone preview, select a photo → it enters framing mode in place:
- drag moves the photo itself under the pointer/finger (direct manipulation, like iOS Photos crop);
- zoom by pinch, trackpad pinch/ctrl-wheel, wheel, and a visible slider; double-click/tap toggles 1× / 2×;
- the part of the photo outside the frame stays visible but dimmed, so you see what you're cropping;
- small live strips show the same frame on the other shapes it appears in (card, hero, square, stage);
- Done / Reset / Escape; arrow keys pan, +/- zoom; it autosaves like everything else, with the Saved indicator;
- works with mouse, touch and keyboard; no layout jumps; the preview stays the real guest component.
Remove the old dot + sliders editor.

## Part B: photo tray (upload ≠ assign)

- "Add photos" (button, drag-drop anywhere on the Items workspace, or paste) uploads immediately into a **tray**
  above the table: thumbnails with per-photo progress; 2–3 concurrent uploads with the existing busy retry; failures
  stay in the tray with Retry.
- Assign by **dragging a tray photo onto a row** (or onto a card in the phone preview); on touch, tap photo then tap row.
  Keyboard: select photo, then "Assign to…" picker.
- Filename matches (item number or title words) are **pre-applied as suggestions** the user can accept all / undo.
  "In order" is a one-click action, not a mode.
- Rows without a photo show a clear dashed drop target. Dropping onto a row that has a photo asks to replace (undoable).
- Assigned photos leave the tray; unassigned ones persist for the session and are listed if you leave (no silent loss).
  Server: the tray holds uploaded asset ids; nothing changes items until assignment (reuse batch `PATCH items`).
- HEIC: if the browser can't decode it, say exactly that and how to fix it ("Export as JPEG" / use Safari), per file.

## Part C: Items polish

1. Split "Starting bid" into **Starting** and **Top bid** columns (top bid shows bids count; blank before bidding).
2. **Compact density** toggle (~56px rows) for fast building; remember the choice per device.
3. The phone preview in the Items workspace starts **collapsed**, opens on demand, remembered per device.
4. "Guests" column shows only exceptions (Hidden, Withdrawn); visible rows stay quiet.
5. Missing photo = drop target (Part B).
6. Phone layout: header actions don't wrap; one exit, not "Event setup" + "Done"; the bulk bar never covers the list
   and keeps Delete on the same line (overflow menu if needed).
7. Canvas card spacing: the reserved tools row from the preview fixes leaves a big gap between cards; tighten it
   without letting tools cover guest UI again.

## Done means

- `tasks/real-v1-photos-001.toml` → SUPPORTED against its frozen base (don't edit `tasks/` or `tests/contract/`).
- `pnpm build` (Turbopack) green; all `tests/v1` suites green.
- Before/after screenshots at 390 and 1440: framing on cover and item (a tall, a wide and a square photo), the tray
  with 20+ photos mid-upload and mid-assignment, compact table, collapsed preview, phone header and bulk bar.
- Visual acceptance is Zack's. Commit locally; no push, merge or deploy.
