# Studio preview attachment: visual review

Implementation of `real-v1-preview-001` on `real-v1/preview-attach`, from frozen base `09923cf`.

The Studio canvas renders the same `GuestShell` used by `/e/:code`. A same-organization staff endpoint builds the preview through the guest snapshot projection, including the server's bidder-visibility rules. The stand-in guest has no activity or credential; hidden items remain editable and are explicitly marked. Guest join, rejoin, bid, watch and donation writes are off in the editor. Inline text, photos, reordering and visibility controls continue to use staff APIs.

The preview refreshes with acknowledged workspace saves and polling. Failed refreshes keep the last snapshot with a staff-only stale notice. If no snapshot is available, the phone offers an explicitly marked editing surface for the event name, welcome and photo; workspace data is never substituted for a guest snapshot.

The former browser-side workspace-to-guest projection has been removed. The guest shell's phone layout is retained in the desktop device. Studio home hero and Live-board classes are scoped separately to avoid changing guest photo and clock styles. Editor-only toolbars, selection outlines, photo buttons, add buttons and staff notices carry `data-edit-chrome`.

## Captures for Zack

Synthetic Holiday Trade Show fixture in a disposable loopback database. Same event, photos and anonymous rival standing on both sides; the real guest is “A guest / Your Business”. The join comparison uses a fresh device. Images are actual browser captures, not generated mockups.

Phone comparisons place the 390px-wide Studio canvas beside the real 390×844 guest app. Studio is captured at both 390×844 and 1440×1000. The phone canvas has less vertical space because Studio editing controls remain visible. Workspace comparisons additionally show both full applications at 1440×1000.

| Screen | Studio at 390px vs guest phone | Studio at 1440px vs guest phone | Both applications at 1440px |
| --- | --- | --- | --- |
| Join | [Compare](preview-attach-review/join-comparison-390.png) | [Compare](preview-attach-review/join-comparison-1440.png) | [Compare](preview-attach-review/join-workspaces-1440.png) |
| Items | [Compare](preview-attach-review/items-comparison-390.png) | [Compare](preview-attach-review/items-comparison-1440.png) | [Compare](preview-attach-review/items-workspaces-1440.png) |
| Item | [Compare](preview-attach-review/item-comparison-390.png) | [Compare](preview-attach-review/item-comparison-1440.png) | [Compare](preview-attach-review/item-workspaces-1440.png) |
| Event | [Compare](preview-attach-review/event-comparison-390.png) | [Compare](preview-attach-review/event-comparison-1440.png) | [Compare](preview-attach-review/event-workspaces-1440.png) |
| Donate | [Compare](preview-attach-review/give-comparison-390.png) | [Compare](preview-attach-review/give-comparison-1440.png) | [Compare](preview-attach-review/give-workspaces-1440.png) |
| My bids | [Compare](preview-attach-review/mine-comparison-390.png) | [Compare](preview-attach-review/mine-comparison-1440.png) | [Compare](preview-attach-review/mine-workspaces-1440.png) |

Individual Studio and guest screenshots are alongside the composites. [Capture receipt](preview-attach-review/capture.json) records viewports and the mutation rehearsal: zero guest write requests and zero page errors while exercising join, rejoin, watch, bid and donation entry points.

Reproduce with Node 24 and pnpm 12.4.2:

```sh
export BZ_CONTRACT_PG=postgres://bz@127.0.0.1:55433/postgres
node tests/v1/preview-review.mjs
```

The capture script creates and drops its own `bz_test_ct_*` database, starts and stops its own loopback server, and writes only these review captures. It is implementation-owned visual evidence; the untouched frozen contract and helper chain provide independent completion evidence.

## Required gate

Commit before running; keep the tree clean:

```sh
export BZ_CONTRACT_PG=postgres://bz@127.0.0.1:55433/postgres
python3 ~/code/_kernel/verify.py tasks/real-v1-preview-001.toml --repo . --base 09923cf \
  --claim "Studio preview renders the real guest app from a server preview snapshot" \
  --implementer-model "GPT-6 Codex"
pnpm build
```

Zack's visual acceptance remains separate from automated parity, regression suites and build checks. Nothing is pushed, merged or deployed by this tranche.

## Six pre-merge fixes — before and after

Requested after the initial attachment at `915ab5f`. All captures below use the same synthetic event content, hidden photographed item and 390×844 / 1440×1000 viewports. Each phase has its own disposable local database, so join codes and schedule times differ. The before phase is the actual `915ab5f` implementation; no historical screenshots were recreated with altered CSS.

1. Studio requests `/preview` only while in Set up, including a fresh request when returning from Live or Results. The mode is read at request time so queued saves also respect the current mode. During the browser rehearsal, Live entry and two polling intervals generated 5 preview requests before and 0 after; Results generated 2 before and 0 after. Returning to Set up generated a fresh request.
2. The preview's `me.bidderNumber` is always `0`. Real participant numbers are strictly positive. The staff-only identity caption is **Sample guest · Bidder 00**; no real participant number is used as the sample guest's own identity. The shared anonymous-visibility sentence now explains that names and businesses stay private, without claiming a sample ordinal belongs to a real guest. Server-projected leaders and winners keep their actual anonymous numbers. [Sample identity capture](preview-attach-review/fixes/after/sample-guest-1440.png).
3. The preview notice has 28px of layout space before the desktop phone frame, plus its own margin rather than touching the frame's halo.
4. Hidden tags and card tools occupy a reserved editor row above the guest card. They neither cover its bookmark nor extend into the pass header. Selection outlines still wrap the card content; inline editing, photo replacement, ordering and visibility use the same staff actions.
5. The welcome cover-photo chip is in the upper-left corner, opposite the upper-right photo stack.
6. On a 390px phone, the preview controls collapse to one disclosure row. A compact mode selector keeps Live and Results reachable; Steps / Phone / Edit remain available. The device grows from 584px to 684px and its bottom fits inside the 844px viewport. Expanded preview controls and the editing panel remain usable. The separate Items workspace retains its existing mode controls.

| Fix | 390px before / after | 1440px before / after |
| --- | --- | --- |
| 3 — notice spacing | [Compare](preview-attach-review/fixes/notice-390-before-after.png) | [Compare](preview-attach-review/fixes/notice-1440-before-after.png) |
| 4 — hidden tag and card tools | [Compare](preview-attach-review/fixes/hidden-tools-390-before-after.png) | [Compare](preview-attach-review/fixes/hidden-tools-1440-before-after.png) |
| 5 — welcome photo chip | [Compare](preview-attach-review/fixes/welcome-photo-390-before-after.png) | [Compare](preview-attach-review/fixes/welcome-photo-1440-before-after.png) |
| 6 — phone canvas height | [Compare](preview-attach-review/fixes/phone-space-390-before-after.png) | [Compare](preview-attach-review/fixes/phone-space-1440-before-after.png) |

Individual screenshots and measured geometry are retained in [before](preview-attach-review/fixes/before/capture.json) and [after](preview-attach-review/fixes/after/capture.json). The after rehearsal recorded zero browser page errors. It checked notice spacing, tag/bookmark separation, toolbar/header separation, photo-chip/stack separation, phone canvas bounds, disclosure controls, a saved phone edit and mode switching.

Reproduce the after rehearsal with Node 24:

```sh
export BZ_CONTRACT_PG=postgres://bz@127.0.0.1:55433/postgres
node tests/v1/preview-fixes.mjs
```

This remains implementation-owned regression and visual evidence. The frozen gate is run separately against `09923cf`; `tasks/`, `tests/contract/` and the frozen helper chain are untouched.
