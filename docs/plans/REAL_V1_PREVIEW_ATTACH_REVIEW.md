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
