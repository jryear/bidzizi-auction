# Photos that frame, the photo tray, and Items polish: visual review

Implementation of `real-v1-photos-001` on `real-v1/photos`, from frozen base `9d9f409`. Brief:
[PHOTOS_AND_ITEMS_POLISH_BRIEF.md](PHOTOS_AND_ITEMS_POLISH_BRIEF.md). Visual acceptance is Zack's; nothing here is pushed,
merged or deployed.

## What changed

### A. Framing: pan + zoom, everywhere

- **Model.** A photo use (event cover, item photo) now has a frame `{ x, y, zoom }`: `(x, y)` is the photo point at the
  centre of whatever box shows it, `zoom` is 1–4 on top of the cover fit. `PATCH items/:id { imageFrame }`,
  `PATCH events/:id { coverFrame }` and the batch `PATCH events/:id/items` accept it; anything else is a 400 and the
  revision does not move. Stale-write protection (`*ExpectedAssetId`) is unchanged. Guest snapshot, staff workspace,
  preview, stage and the events list all serve `imageFrame` / `coverFrame`; duplication copies them.
- **Migration** `migrations/prod/010_photo_frame.sql`: keeps the existing `cover_focal` / `image_focal` columns and their
  x/y, backfills `zoom: 1`, sets the default to `{x:.5, y:.5, zoom:1}` and replaces the check so zoom must be 1–4.
  Zoom stays *optional* in the check on purpose, so the currently deployed app (which writes `{x, y}`) keeps working
  during a release; readers treat a missing zoom as 1. Older Studio tabs that still send `imageFocal`/`coverFocal` are
  accepted: they move the centre and keep the zoom.
- **One renderer.** `src/lib/framed-photo.tsx` (`FramedPhoto`) is used by every surface that shows these photos: guest
  cards (large and compact), item hero, welcome/event hero, My bids tickets, bid sheet, moments, the join "fan", stage
  display (spotlight, background, finale), Studio lists, Live tiles, Results, events home, new-event duplicate card, the
  classic host workspace, and the Items table. The `<img>` is sized and offset in **percentages of its box** from its
  natural size (cover × zoom, frame point centred, clamped so the box is always filled). A single shared
  ResizeObserver redoes the layout if a box changes shape. No container units, no `object-view-box`: it works the same
  on iOS 15.4/16 Safari (`pnpm compat`: 0 findings). Every framed photo is `[data-photo-frame]` with its `<img>` inside.
- **Simple mode** (no-JS fallback) uses `object-position` from x/y; zoom isn't applied there.

### Framing in place on the Studio phone

- "Adjust photo" appears on the photo itself (hover chip, or click the photo) and in the inspector. The phone switches to
  the right screen and an editor (`src/app/studio/frame-editor.tsx`) covers the phone's screen: the **real guest photo
  slot is the frame window**, the rest of the photo extends beyond it, dimmed, so you see what you're cropping. A rule-of-
  thirds grid shows while you drag.
- Drag moves the photo under the pointer/finger. Pinch (two pointers), trackpad pinch (ctrl-wheel and Safari gesture
  events), mouse wheel, the Zoom slider, ±, and double-click (1× ↔ 2×) all zoom about the point under the cursor or
  fingers. Arrow keys move (Shift = larger steps), +/- zoom, Enter = Done, Escape = cancel (restores and saves the frame
  you started with). The photo can't be dragged past an edge: no gaps, ever.
- Strips under the frame show the same frame live on the other shapes it appears in (items: card 4:3, square, stage
  4:5, wide 16:9; cover: wide, banner, square).
- Autosave like every other edit, with the Studio's Unsaved/Saving/Saved indicator; replacing or removing the photo while
  framing cancels the edit without a false failure. Selecting something else finishes framing and keeps the frame.
- The old dot + sliders editor (`photo-tools.tsx`) is removed.

### B. Photo tray: upload ≠ assign

- "Add photos", dropping files anywhere on the Items workspace, or pasting uploads straight into a tray above the table
  (`src/app/studio/[id]/photo-tray.tsx`). Per-photo progress (XHR upload progress, then "Processing…"), three uploads at
  a time, `ASSET_BUSY` retried with backoff; failures stay in the tray with Retry. Nothing changes an item until a photo
  is placed.
- Place a photo by dragging it onto a row (or a card on the guest phone), with edge auto-scroll while dragging; or tap
  the photo, then tap a row; or pick from "Assign to…". File names that name an item (number or title words; camera names
  like `IMG_9921` are never guessed) show as suggestions ("→ 17" on the photo, a faint preview in the row) and
  "Place N matches" accepts them in one go. "Fill in order" is one click. Every placement shows an Undo.
- Rows without a photo are dashed drop targets. Placing onto a row that already has a photo asks first ("Replace the
  photo on …? You can undo it.").
- Placement reuses the batch `PATCH events/:id/items` with `imageExpectedAssetId`, so a row that changed meanwhile is
  skipped and its photo returns to the tray with the reason.
- The tray belongs to the event for the browser session: leaving the Items view keeps uploads going and the photos stay
  (the back link says "N photos in the tray stay here"); a reload restores ready photos; closing the tab with photos in
  the tray asks first.
- HEIC the browser can't decode stays in the tray as failed: "This browser can't read HEIC photos. Export it as JPEG
  (in Photos: File › Export › JPEG), or add it using Safari."

### C. Items polish

1. "Starting" and "Top bid" are separate columns; Top bid shows the amount and bid count, blank before bidding.
2. Comfortable / Compact density (compact ≈ 46px rows at 1440, single line beside the phone too), remembered per device.
3. The guest phone starts collapsed ("Show guest phone"), remembered per device.
4. Guests column shows only exceptions: hidden rows say "Hidden" (click to show); visible rows show a quiet eye on hover.
5. Missing photo = dashed drop target (above).
6. Phone: header actions stay on one line (Paste becomes an icon); the select mode's "Done" is gone, so there is one
   exit; the bulk bar is one line with Delete always visible and Category / Show / Hide in a ⋯ menu.
7. Canvas cards: the reserved tools row is 40px instead of 52px and the cards' own gap shrinks from 20px to 8px on the
   canvas, so cards sit much closer while tools still never cover guest UI.

Also: the welcome hero's dark scrim now sits behind the text block instead of over the whole cover, so a long title
stays legible and the photo above it stays clear (the welcome-cover pixel check needs the photo unobscured). The Event
tab's desktop hero keeps the full-height scrim.

## Design decisions and things to know

- **Existing photos.** Every photo with the default (centred) position renders exactly as before. A photo that was
  repositioned with the old dot editor keeps its x/y, but x/y now means "the point at the centre" (what the dot meant to
  the person placing it) rather than CSS `object-position`; such photos shift slightly toward the chosen point where the
  box allows. This is the contract's semantics; there's no single conversion that would reproduce the old look on every
  box shape.
- **Clamped storage.** Editing stores the frame the editing box actually shows, so dragging never has a dead zone; other
  shapes clamp independently and keep the same subject.
- **Sponsor logos are not framed.** Logos are marks shown contain-fit; cropping them would cut words. The brief listed
  them; the contract does not assert them. I'd keep them uncropped unless you want otherwise.

## Screenshots

Before = frozen base `9d9f409`; after = this branch. Same seeded event (24 items, a tall, a wide and a square photo,
12 items without photos, 24 tray files), 390×844 and 1440×1000, captured with `tests/v1/photos-review.mjs`.

| Screen | 390 before | 390 after | 1440 before | 1440 after |
| --- | --- | --- | --- | --- |
| Framing, item, tall photo | [frame-item-tall](photos-review/before/frame-item-tall-390.png) | [frame-item-tall-dragging (mid-drag)](photos-review/after/frame-item-tall-dragging-390.png) · [frame-item-tall](photos-review/after/frame-item-tall-390.png) · [framed-item-tall](photos-review/after/framed-item-tall-390.png) | [frame-item-tall](photos-review/before/frame-item-tall-1440.png) | [frame-item-tall-dragging (mid-drag)](photos-review/after/frame-item-tall-dragging-1440.png) · [frame-item-tall](photos-review/after/frame-item-tall-1440.png) · [framed-item-tall](photos-review/after/framed-item-tall-1440.png) |
| Framing, item, wide photo | [frame-item-wide](photos-review/before/frame-item-wide-390.png) | [frame-item-wide-dragging](photos-review/after/frame-item-wide-dragging-390.png) · [frame-item-wide](photos-review/after/frame-item-wide-390.png) · [framed-item-wide](photos-review/after/framed-item-wide-390.png) | [frame-item-wide](photos-review/before/frame-item-wide-1440.png) | [frame-item-wide-dragging](photos-review/after/frame-item-wide-dragging-1440.png) · [frame-item-wide](photos-review/after/frame-item-wide-1440.png) · [framed-item-wide](photos-review/after/framed-item-wide-1440.png) |
| Framing, item, square photo | [frame-item-square](photos-review/before/frame-item-square-390.png) | [frame-item-square-dragging](photos-review/after/frame-item-square-dragging-390.png) · [frame-item-square](photos-review/after/frame-item-square-390.png) · [framed-item-square](photos-review/after/framed-item-square-390.png) | [frame-item-square](photos-review/before/frame-item-square-1440.png) | [frame-item-square-dragging](photos-review/after/frame-item-square-dragging-1440.png) · [frame-item-square](photos-review/after/frame-item-square-1440.png) · [framed-item-square](photos-review/after/framed-item-square-1440.png) |
| Framing, cover (wide) | [frame-cover](photos-review/before/frame-cover-390.png) | [frame-cover](photos-review/after/frame-cover-390.png) | [frame-cover](photos-review/before/frame-cover-1440.png) | [frame-cover](photos-review/after/frame-cover-1440.png) |
| Tray mid-upload (24 photos) | [tray-uploading](photos-review/before/tray-uploading-390.png) | [tray-uploading](photos-review/after/tray-uploading-390.png) · [tray-ready](photos-review/after/tray-ready-390.png) | [tray-uploading](photos-review/before/tray-uploading-1440.png) | [tray-uploading](photos-review/after/tray-uploading-1440.png) · [tray-ready](photos-review/after/tray-ready-1440.png) |
| Tray mid-assignment | [tray-matching (old matching dialog)](photos-review/before/tray-matching-390.png) | [tray-assigning](photos-review/after/tray-assigning-390.png) · [tray-assigned](photos-review/after/tray-assigned-390.png) | [tray-matching (old matching dialog)](photos-review/before/tray-matching-1440.png) | [tray-assigning](photos-review/after/tray-assigning-1440.png) · [tray-assigned](photos-review/after/tray-assigned-1440.png) |
| Items table | [workspace](photos-review/before/workspace-390.png) | [workspace](photos-review/after/workspace-390.png) | [workspace](photos-review/before/workspace-1440.png) | [workspace](photos-review/after/workspace-1440.png) · [workspace-compact](photos-review/after/workspace-compact-1440.png) · [workspace-phone-open](photos-review/after/workspace-phone-open-1440.png) |
| Phone header and bulk bar | [workspace](photos-review/before/workspace-390.png) · [bulk bar](photos-review/before/bulk-390.png) | [workspace](photos-review/after/workspace-390.png) · [bulk bar](photos-review/after/bulk-390.png) | — | — |

The before tray captures show the old flow: a pre-upload matching dialog, then one-at-a-time uploads. Rows 'Phone header and bulk bar' are phone-only.

Reproduce (Node 24, a disposable loopback database and a dev server; the script seeds its own event):

```sh
BASE=http://127.0.0.1:<port> HOST_EMAIL=... HOST_PASSWORD=... PHASE=after node tests/v1/photos-review.mjs docs/plans/photos-review/after
```


## Evidence

Code head `090c8ba` (implementation `2c7b0ca`, suites `dfe415a`, column spacing `090c8ba`); the commit adding this review and the after captures changes only `docs/plans/`.

```sh
export BZ_CONTRACT_PG=postgres://bz@127.0.0.1:55433/postgres
python3 ~/code/_kernel/verify.py tasks/real-v1-photos-001.toml --repo . --base 9d9f409 \
  --claim "Photos frame with pan and zoom everywhere; tray upload; items polish" --implementer-model "Claude Opus 5.5 (subagent)"
```

**SUPPORTED** (`assurance=schema2-evidence-validity`), run at `090c8ba`:

- Acceptance, base: all 16 assertions fail. Candidate: all 16 pass (FRAME_API_VALIDATES, FRAME_DEFAULT, FRAME_DUPLICATES,
  FRAME_PIXELS_CARD_CHROMIUM / _WEBKIT red→yellow, FRAME_PIXELS_ITEM_PAGE green, FRAME_PIXELS_COVER blue, FRAME_FILLS_BOX,
  STUDIO_FRAME_IN_PLACE saved `{x:0.6403, y:0.5, zoom:1.3}`, TRAY_UPLOADS_WITHOUT_ASSIGNING, TRAY_DRAG_ASSIGNS,
  TRAY_HEIC_EXPLAINED, ITEMS_SPLIT_COLUMNS, ITEMS_COMPACT_ROWS 48px, ITEMS_PREVIEW_COLLAPSED, ITEMS_GUESTS_EXCEPTIONS).
- Regressions pass on base and candidate: preview parity (14), static gates (Next build with webpack, typecheck, compat,
  display/items/compat logic), connected suites (journey, operations-ui, studio-saving, bid-sheet, simple-ui).

Also run separately on this branch: `pnpm build` (Turbopack) green; `pnpm typecheck` green; `node scripts/compat.mjs`
0 blocking findings; against a loopback dev server: `journey` 55/55, `operations-ui` pass, `studio-saving` 7/7,
`bid-sheet` 2/2 engines, `simple-ui` 2/2, `items-ui` 16/16, `photos` 9/9, `photo-ui` (mocked) 11/11.

Hands-on (Playwright-driven, measured): wheel zoom keeps the photo point under the cursor fixed; double-click toggles
1×/2×; dragging 900px past either edge never exposes a gap; two-finger pinch (CDP touch) zooms; arrows/minus move and
zoom; autosave reaches "Saved"; Escape restores the starting frame on the server. Fixed during this pass: a focus ring
around the whole phone, a translucent editor panel, mouse-wheel zoom steps (28% → 20%), a tray class colliding with the
reorder style, drag needing auto-scroll to reach rows below the fold, a tall wrapping tray (now one strip), compact
rows staying two-line beside the phone, and the Top bid / Guests headers touching.


## Left open

- Simple mode ignores zoom (object-position only).
- A file chosen on the Studio's "preview unavailable" fallback surface is dropped if the real preview arrives mid-upload
  (pre-existing from the preview-attach tranche; the mocked suite now waits for the preview).
- The tray lives in the browser session (sessionStorage + memory). Photos in the tray on another device or after the
  session ends are not listed; their assets are uploaded and unreferenced.
- Not tested on real iOS hardware or simulator; Chromium and WebKit engines only.
