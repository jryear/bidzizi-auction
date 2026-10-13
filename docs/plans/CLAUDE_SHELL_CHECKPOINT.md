# Claude shell: Real V1 design pass checkpoint

Branch `jryear/real-v1-claude-shell`, based on `real-v1/t1-foundation` (015e27e). Written 2026-10-12. Local commits only: nothing is pushed, merged or deployed, and no cloud resources were created.

**Scope:** experience only. Everything is frontend, against the existing v1 API. No backend, schema, engine or API changes.
**Status:** `tsc` is clean, `next build` succeeds, and `tests/v1/journey.mjs` passes 29/29. Visual acceptance is Zack's call. Passing checks don't grant it.

---

## The five screens I'm proudest of

### 1. Outbid, with one-tap rebid
The moment someone takes the lead from you, a red alert drops in on whatever screen you're on. It names who did it and offers **Bid $225** in one tap. The phone vibrates where supported. On the item page, the standing card turns red and the action bar switches to "Outbid · next bid $225". There's one obvious button, and the same sheet opens from every Bid button.

![Outbid](claude-shell/proud-1-outbid.jpg)

### 2. A bid lands
One bid sheet: your business as a marigold pass, a big stepper, quick picks (minimum, +1 step, +3 steps), and a plain "What this does" box. The green check and burst play only after the server's receipt arrives: truth before reassurance. If the response is lost, the sheet shows "Did it go through?" with **Check status**, which replays the same request id and can never place a second bid.

![A bid lands](claude-shell/proud-2-bid-lands.jpg)

### 3. You won
When staff confirm a winner, that phone gets the whole screen once: confetti, a polaroid of the item, the winning bid, and the host's winner instructions. My bids then becomes tickets with perforated stubs, grouped as Needs your attention / You won / Leading / Waiting for staff / Closed, with your donations at the end.

![You won](claude-shell/proud-3-won.jpg)

### 4. Edit on the guest's phone
The Studio canvas is not a mock-up of the guest app. **It renders the guest app's own components** with an edit context switched on. Click a title on the card and type; drop a photo onto the phone; drag items by their handle. The checklist on the left knows the event (it ticks as you go), and the inspector on the right follows your selection. What you edit is literally what guests see.

![Edit on the phone](claude-shell/proud-4-canvas.jpg)

### 5. The stage display
`/studio/[id]/stage` is for a projector or TV. It shows a rotating spotlight that **jumps to an item the moment it gets a bid** ("New bid"), a gold top-bid amount readable from the back of a hall, a big QR code and join code, live totals, a ticker of the latest bids, and closing-soon urgency. After close it switches to a thank-you screen with totals and top items. It updates by itself, has a full-screen button, and hides the cursor when idle.

![Stage display](claude-shell/proud-5-stage.jpg)

---

## What I chose, and why

### Direction: "Lanyard, evening edition"
I kept every Design A rule and ported the real markup and CSS from `staging-demo-final` and `prototypes/lanyard`, rather than approximating from tokens:
- the ink pass header with the marigold business mark;
- cobalt means an action, marigold means yours;
- Fraunces with Instrument Sans, and tabular money;
- catalogue item tabs and ticket-stub perforations;
- one status vocabulary.

I then pushed it toward a consumer app: full-bleed photography, motion that carries meaning, and a real desktop layout rather than a stretched phone.

### Attendee app (`src/app/e/[code]/*`)
- **One status function** (`model.ts` `standing()`) drives every card, row, page, ticket, band and pill, so an item can't say two things.
- **Item cards:** full-bleed 4:3 photo, item number tab, watch bookmark, provider chip, serif title, dashed numbers rail, leader line. A status band appears only when you need it (leading / outbid with a rebid button / closing soon / won / staff confirming).
- **Browsing:** event eyebrow, live event clock, a "where you stand" strip, search, category chips with counts, sort (item order / lowest price / ending soon), and a large/compact toggle that's remembered.
- **Navigation:** icon tab bar (Items, Watching, My bids, Event, Donate) with badges. Sections and items live in the URL (`?s=mine`, `?i=<id>`), so Back, reload and sharing a link all work. React `<ViewTransition>` morphs the card photo into the item hero, slides forward and back, and crossfades between tabs. The header stays anchored.
- **Live updates animate:** amounts roll when they change, status bands wipe in, tiles pulse, and feed rows slide in.
- **Closing soon:** under 10 minutes, the countdown turns into mm:ss with an amber band. In the last minute it blinks red.
- **Honest states:**
  - Offline shows "Reconnecting. Standings as of 10:13 PM", dotted stale amounts, and a held Bid button.
  - Unconfirmed bids block a second bid.
  - Polling backs off from 4s to 30s while the connection is failing.
- **Desktop (1024px and up):**
  - nav moves into the pass bar;
  - Items gets a rail (your pass, amount at stake, ending soonest, donate);
  - the item page is two columns with an inline action box;
  - join is a split landing;
  - My bids gets a "Your night" summary rail.
- **No photo:** a designed catalogue plate (a tinted gradient with a large serif number), never an empty box.
- **Join:** full-bleed hero, a lanyard pass that fills in as you type, and the rejoin path. `/join` has six code cells driven by one real input, so paste, autofill and screen readers still work.

### Studio (`src/app/studio/*`)
- **Home centres on the one current event.** Priority: running now, then the next live event, then a draft being set up, then the latest. It gets a big hero with status, countdown, stats and the single primary action for that stage: Continue setting up / Open live control / Wrap up results. Everything else is a compact archive, and each row doubles as **Start from this**.
- **Templates live in the New event flow.** The gallery previews are the guest app's real `ItemCard` in each template's theme. "Start from a past event" sits beside them. The details step has a name (a suggested full name, no more awkward " auction" stripping), a date, a start time and duration chips.
- **Set up:**
  - a checklist with a progress ring;
  - an outline (details, schedule, look, increments, donations, sponsors, item list with missing-photo dots);
  - the phone canvas with Welcome / Items / Item page screens;
  - an inspector for the selection.
  - Every field autosaves on blur, and the top bar shows Saving / Saved / Not saved / Offline.
  - "Advanced" folding is kept.
  - Duplicate moved to the ⋯ menu.
  - On phones, Set up becomes three panes: Steps / Phone / Edit.
- **Live:** stat cards (a big countdown that turns red in the last 10 minutes, raised, joined, bids), attention cards (closing within 15 minutes; no bids yet), item tiles sorted by what closes next that pulse when bid on, a latest-bids feed, and people (pause bidding, rejoin code). One click opens the stage display.
- **Results is a wrap-up checklist:** a progress ring counting only what's actionable now, then **Confirm winners → Hand over (with follow-up notes) → Done**, plus "Still open", donations with checkboxes, exports, and a finished state with confetti.
- **Share:** a theme-coloured QR card that prints as a 4×6 table card.

### Fixes for the brief's rough edges
| Rough edge | Now |
|---|---|
| " auction" stripped from template names | Suggested full names ("Holiday Trade Show"), selected so you can overwrite |
| "Check the schedule" always ticked | "Confirm the date and time" ticks only after **These times are right** (or once live) |
| Empty cover and photo placeholders look unfinished | Designed plates on the phone; drop zones in the inspector |
| Crowded top bar on phones; Duplicate in prime space | Compact top bar, mode switch on its own row, Duplicate in ⋯ |
| Bare tiles with no photo | Catalogue plates |
| Draft preview only works for signed-in staff | The Share dialog says so plainly and shows the QR, with "sign in at …/studio on your phone first" |
| Test events pile up | The current event takes the stage and the rest are a compact archive. **There's no delete endpoint**, so real delete/archive belongs to the backend owner |

---

## Side by side with the previous build and the first pass

All captures are from the connected app, seeded through the real API (`tests/v1/shell-shots.mjs`), at 390px (2x) and 1440px.

![](claude-shell/cmp-items-390.jpg)
![](claude-shell/cmp-item-390.jpg)
![](claude-shell/cmp-sheet-390.jpg)
![](claude-shell/cmp-mybids-390.jpg)
![](claude-shell/cmp-event-390.jpg)
![](claude-shell/cmp-donate-390.jpg)
![](claude-shell/cmp-closed-390.jpg)
![](claude-shell/cmp-items-1440.jpg)
![](claude-shell/cmp-guest-desktop-1440.jpg)
![](claude-shell/cmp-studio-home-1440.jpg)
![](claude-shell/cmp-studio-new-1440.jpg)
![](claude-shell/cmp-studio-editor-1440.jpg)
![](claude-shell/cmp-studio-live-1440.jpg)
![](claude-shell/cmp-studio-results-1440.jpg)
![](claude-shell/cmp-studio-phone-390.jpg)

### How I iterated
I did three capture-and-critique rounds per app. Each round I named the weakest things and fixed them. Notable catches:
- the hero photo wasn't full-bleed;
- a horizontal overflow on Donate (a real phone bug);
- the "rising amount" flash turned next-bid amounts green, which falsely suggested leading;
- a translucent action bar let content ghost through it;
- a class collision made "1 won / 1 leading" invisible;
- a CSS reset silently stripped every Studio button's border;
- Results claimed "10 things left" while 7 items were still open.

---

## Honest limits (what's not real, or not done)

- **Bid activity on the item page is partly device-local.** The API returns the current top bid and the bid count, not each bid. So the page shows the server's current top and total, plus *your* receipts (server decision time) and top-bid changes *seen on this phone*, labelled exactly that way. A full history needs an API addition (backend owner).
- **Schedule confirmation and "previewed" ticks are stored per device** (localStorage). The API has no field for them.
- **Delete or archive of draft events** needs a backend endpoint (the Codex agent's no-developer operations).
- **Template previews use catalogue plates**, not photos. I didn't want to ship the prototype's stock photos, whose licensing isn't verified, as product imagery.
- **Date and time pickers** are native inputs, styled to match. The picker popovers themselves are the browser's.
- **Drag-to-reorder on the canvas** is mouse-based. Touch and keyboard users get the up/down buttons on each card.
- **View transitions** animate in Chromium and recent Safari. Elsewhere navigation is instant.
- **Not yet tested:** real iOS or Android hardware, VoiceOver/TalkBack, and 300 concurrent phones. Reduced motion is honoured in CSS but hasn't been checked by eye on a device.
- **The classic workspace** (`/host/[id]`) is untouched and reachable from ⋯ → Classic workspace.
- `next.config.ts` turns off `devIndicators`, because the dev badge sat over the guest tab bar and intercepted taps during local review. It's dev-only.

---

## How to run it

```bash
# Postgres 18 on 127.0.0.1:55433 (user bz). This worktree uses its own database:
export BIDZIZI_DATABASE_URL=postgres://bz@127.0.0.1:55433/bz_test_claude
pnpm install
pnpm db:migrate
BIDZIZI_STAFF_PASSWORD=claude-shell-pass pnpm staff:provision --org saturn --org-name Saturn --email host@example.com --name "Test Host"
BIDZIZI_APP_MODE=local npx next dev -p 3420 -H 127.0.0.1
```

Open `http://127.0.0.1:3420/studio` (host@example.com / claude-shell-pass) or `/join`.

**Seed a realistic event and capture everything:**
```bash
export BASE=http://127.0.0.1:3420 HOST_EMAIL=host@example.com HOST_PASSWORD=claude-shell-pass
node tests/v1/shell-shots.mjs .shots/guest            # prints {"eventId": ...}
node tests/v1/studio-shell-shots.mjs .shots/studio <eventId>
node tests/v1/journey.mjs                             # 29/29
node tests/v1/hard-states.mjs .shots/hard            # sign-in error, bad code, rejoin, entry closed, empty, closing soon, unconfirmed, closed
```

The seed covers leading, outbid (with a live alert), closing soon, won (with the celebration), staff confirming, no photo, a very long title, sponsors, donations, watching and offline. `tests/v1/compose-compare.mjs` builds the side-by-side images. The old `shots.mjs` and `studio-shots.mjs` now forward to the new scripts.

## Where things are

| Area | Files |
|---|---|
| Guest shell, routing, polling, moments | `src/app/e/[code]/participant.tsx` |
| Status vocabulary, countdown, device log | `src/app/e/[code]/model.ts` |
| Shared and editable components | `src/app/e/[code]/ui.tsx` (`Ed`, `Tap`, `Photo`, `ItemCard`, `Amount`, `EventHero`…) |
| Screens | `catalog.tsx`, `item.tsx`, `sheet.tsx`, `mine.tsx`, `event.tsx`, `give.tsx`, `join.tsx`, `moments.tsx` |
| Guest styles | `src/app/e/[code]/participant.css` (desktop rules scoped `:not(.is-canvas)` so the canvas always shows the phone) |
| Studio | `src/app/studio/page.tsx` (home), `new-event.tsx`, `kit.tsx`, `data.ts`, `[id]/studio.tsx`, `setup.tsx`, `live.tsx`, `results.tsx`, `share.tsx`, `[id]/stage/*`, `studio.css` |
| Icons | `src/lib/icons.tsx` |

## Decision for Zack
Accept, redirect or reject the direction: the attendee app and the Studio are separate decisions. If accepted, the natural next steps:
1. a real device pass (iOS Safari, Android Chrome) and VoiceOver;
2. folding the Codex agent's no-developer operations (void bid, withdraw item, staff invite, practice reset/delete) into the Studio's Live and Results surfaces;
3. a per-item bid history endpoint, to replace the device-local activity log.

## Tightening pass (2026-10-13)

Zack asked for subtraction and precision, not features. Same constraints as before: frontend only against the existing v1 API, local commits, no push or deploy.

**Process.**
1. I captured the full set at 390px and 1440px before changing anything: 33 attendee shots, 23 Studio shots, and 12 new hard-state shots (`tests/v1/hard-states.mjs`).
2. I worked through the screens, then captured and critiqued two full rounds.
3. A final round produced the "after" set.

Things the rounds caught:
- Round 1:
  - the action bar's red label;
  - a clipped "Next step";
  - "1 bids";
  - phone Studio stats wrapping;
  - squeezed archive rows.
- Round 2:
  - the amount shown twice on the Bid button row;
  - "leading $0" in My bids;
  - a 6 PM–midnight event reading as two days;
  - long titles still huge on desktop.
- Final round:
  - a double space in "Bid $225";
  - "You're leading" said three times;
  - a redundant card around the desktop button.

Gates: `tsc` is clean, `next build` succeeds, and `tests/v1/journey.mjs` passes 29/29.

### Sign-in

I found a likely cause for Zack's sign-in trouble: **five wrong passwords pause that email for up to 15 minutes**. The old screen only said "Too many attempts. Wait a few minutes", in the same red line as every other error.

The staff sign-in screen now gives each failure its own title and next step:

| What happened | What the screen says |
|---|---|
| Wrong email or password | "Email or password is wrong". Your password stays in the field, selected, so typing replaces it. |
| The pause | "Sign-in is paused for up to 15 minutes" |
| Offline | "Can't reach BidZizi" |
| An out-of-date page, which the server rejects as 403 | "This page is out of date", with a **Reload** button |

Other sign-in changes:
- The button reads "Try again" after an error.
- There is a show-password toggle.
- The page explains how to get a password reset.
- The heading is now "Staff sign in" instead of "Host sign in".

The attendee code screen names the code that failed ("No event uses ZZZZZ9") and selects it for retyping. The join form now marks the field that's missing, and the rejoin form shows "Try again" after a bad code.

**Test hygiene:** the hard-states script uses a made-up email for its wrong-password shot, so captures never pause the real host account. My earlier runs had paused it once; I cleared those failed attempts in `bz_test_claude`.

![](claude-shell/tight-10-login-1440.jpg)
![](claude-shell/tight-11-login-390.jpg)

### Before and after

![](claude-shell/tight-01-item-outbid-390.jpg)
![](claude-shell/tight-02-outbid-alert-390.jpg)
![](claude-shell/tight-03-item-leading-390.jpg)
![](claude-shell/tight-04-sheet-390.jpg)
![](claude-shell/tight-05-items-390.jpg)
![](claude-shell/tight-06-mybids-390.jpg)
![](claude-shell/tight-07-event-390.jpg)
![](claude-shell/tight-08-item-1440.jpg)
![](claude-shell/tight-09-items-1440.jpg)
![](claude-shell/tight-12-closed-390.jpg)
![](claude-shell/tight-13-unconfirmed-390.jpg)
![](claude-shell/tight-14-empty-390.jpg)
![](claude-shell/tight-15-home-1440.jpg)
![](claude-shell/tight-16-home-390.jpg)
![](claude-shell/tight-17-setup-1440.jpg)
![](claude-shell/tight-18-live-1440.jpg)
![](claude-shell/tight-19-results-1440.jpg)

### What I removed or changed

**Duplicated messages (attendee)**
- **Outbid alert:** it no longer appears on that item's page or on My bids, where the page already says it. The phone still vibrates.
- **Outbid card:** it says only what's new ("Your $175 is no longer the top bid"). The ticket below already shows who leads and at what.
- **Item page action bar:**
  - The red "OUTBID · NEXT BID" label, the red border and "Bidding as…" are gone.
  - It is now one full-width **Bid $X** button, with a countdown above it only when the item is closing.
  - Leading, closed, and the amber "Closing soon" card no longer get a bar; the standing card and ticket already say it.
  - An unconfirmed bid gets just **Check bid status**.
- **Item card:** it no longer says "You're leading" twice (leader line and band), and the green band no longer repeats the price. "Ends in 2h 59m", which was identical on every card, now appears only when an item differs. The category eyebrow is gone (the chips cover it), and the bid count joins the price label.
- **Bid sheet:**
  - The large "Bidding for" card is now a line under the item.
  - The four-line "What this does" box is now one sentence: "Top bid $200 by Harbor Logistics. You're leading once it's confirmed."
  - The landed moment is shorter.
- **Resume-pending toast:** it appeared twice and used a check mark for bad news. It now shows once with an info icon and names the amount: "Your $115 bid didn't reach us. Nothing was placed."

**Redundant labels and badges (attendee)**
- The event-name eyebrow is gone from Items, Watching, My bids and Donate; the header already shows it.
- The "9 items" pill is gone. The count sits on a quiet toolbar line with a borderless sort that sizes to its text.
- The "That's everything. Good luck!" end note is gone.
- The desktop rail no longer has an identity card repeating the header.
- **My bids:**
  - Section subtitles are gone, and "Needs your attention" is now "Outbid".
  - Tickets lose the status pill (the heading says it), the lot label and the "1 bid from you" expander.
  - The action row appears only when there's something to do.
  - It no longer says "leading $0".
- **Event page:** the second date list, "Hottest right now", the extra My bids button, the "All items" link and the "Welcome" heading are gone. "How winning works" is now three short lines, and the "joined as" card is calmer.

**Copy (attendee)**
- "Unconfirmed" is now "We couldn't confirm your last bid".
- The activity footnote is one sentence.
- "How bidding works" is plainer.
- "Items are on their way" is now "No items yet".
- Join and rejoin hints are shorter.

**Hard-state fixes (attendee)**
- An event ending at midnight shows as one day.
- The Facts row no longer wraps the bidding times.
- Long item titles have their own smaller size on phone and desktop.

**Studio home**
- The greeting, the "Happening now" eyebrow, the Items stat box and the third button are gone.
- The stats are a calm divided row with only the countdown in marigold.
- The extra "Start a new event" card is gone (New event is in the top bar).
- "Start from this" appears on row hover, and as an icon on phones.
- Plurals are fixed.
- On phones, the stats no longer wrap and archive rows no longer get crushed.

**Set up**
- The checklist folds to one **Next step** row with the ring; all eight steps are a tap away, and the phone's Steps tab opens them expanded.
- The inspector shows only what the phone can't: venue, winner message, starting bid, category, provider, visibility and advanced settings. Everything else is labelled "Edit on the phone". I kept a **Remove photo** button, since only the inspector could do that.
- "Exactly what guests see" is gone and the tips are shorter.
- New items open on the phone, where their title is edited.
- The "Autosaves" label is hidden on phones, where it hit the Share button.

**Live**
- The second "Open stage display" button is gone; Stage is in the top bar.
- The attention cards are one line each ("Closing soon", "No bids yet"), clamped to two lines.
- Tiles show a status only when it isn't "open", and a countdown only inside the last 10 minutes.
- The rejoin instructions quote the current link text, "Joined on another phone?". I also updated that string in the classic workspace.

**Results**
- The eyebrow is gone, and the paragraph only appears when it adds something.
- The lot labels are gone.
- "Someone else" is now "Pick another bid".
- The note placeholder is "Add a note (optional)".
- The exports description is gone.
- A section count shows only when there's more than one.

**Accessibility**
- The show-password button had sat inside the field's label, which muddled the field's accessible name; it now sits outside.
- Archive buttons keep their visible text in their accessible names.

### Not done in this pass

- **No strict spacing-scale refactor.** I tightened rhythm where the screenshots showed problems (stats, toolbar, cards, joined card, checklist) rather than rewriting every value, to avoid regressions without a visual-diff harness.
- **Studio top bar unchanged.** It is still four controls on desktop.
- **Template gallery and stage display unchanged.**
- **Still no real-device or screen-reader testing.**

## Passthrough 1 (2026-10-13), scoped batch

This follows the scope update in `ZACK_PASSTHROUGH_1.md` (commit `67cb2a9`, kept in history). Each stage below was committed separately. Nothing is pushed or deployed.

| Stage | Commit | What landed |
|---|---|---|
| 0 Merge | `b15ef78` | Codex's `jryear/real-v1-design-pass` is merged. I used the branch tip `66853de`, which has the same code as the `1477cae` named in the brief, re-committed a minute later with docs. Its server code, migration 003, API and tests are kept in full. Its UI files are superseded by this branch's design. |
| 1 Operations UI | `a287ca7` | Codex's operations rebuilt in this design: **Live** item panel (void bid with a reason, withdraw with a guest message, change close time), edit participant, **Event housekeeping** (practice reset, archive/restore, delete with the typed name), **Staff & access** dialog (invite, reset link), a Practice option in New event, and a restyled password-setup page. The item page's bid activity now comes from the server's bid history; the per-device log is gone. |
| 2 Readiness | `4f9d6f0` | A "Draft · only you can see this" / "Live · changes appear to guests instantly" pill. A save indicator (Unsaved changes → Saving… → Saved). Saves run one at a time. Text edited on the canvas autosaves after a pause. Go live runs a readiness check that warns with Fix links and never blocks. |
| 3 Share | `815808d` | Room code, copy link, native share, email and text links. Printable QR as a 4×6 in table card and a full Letter page, each verified to print as exactly one PDF page. A note that remote guests use the same link. |
| 4 Bidder visibility | `a20eaa2` | Migration 004. "Show bidders as": name and business / business only / anonymous ("Bidder N", stable per event). The server masks names in the participant snapshot and a new stage endpoint, so hidden names never reach phones or the projector. Staff views and exports keep full names. 5 journey checks. |
| 5 Display and donations | `16f74b2` | **Outbid rule:** when you're outbid, cards, rows, the item page and tickets lead with the current top bid and "Bid $X"; your own bids sit in an expandable history. The rule lives in `src/lib/display.ts` and is locked by `tests/v1/display-logic.mjs` (10/10). **Donations:** migration 005; donations are on exactly when the event has a nonprofit, with no toggle. Journey check added. |
| 6 Quirks | `82dfa8a` | Compact items view redesigned as a catalogue index. Studio phone frame centred exactly (a leftover 10px border was offsetting it). **Look** rebuilt: 5 themes, adding Slate, plus one custom accent colour with an automatic contrast check and a "Fix contrast" button (migration 006). Bid increments panel restyled with a live example. Sponsor links, checked on the server. Logo upload rebuilt (click, drop or paste; transparency kept). |

**Gates at the end:**
- tsc: clean
- `next build`: succeeds
- `tests/v1/journey.mjs`: 47/47 (Codex's 40 plus 7 new)
- `tests/v1/operations-ui.mjs`: passes, adapted to the rebuilt screens
- `tests/v1/display-logic.mjs`: 10/10

Migrations 004–006 are applied to `bz_test_claude`.

**Deferred, as instructed:** Items manager, sidebar list at scale, crop and focal point, stage display configuration, event info page, winner page preview, sidebar rebalance.

**Proposals only (not built):**
- per-item "pin to stage" from Live;
- an end-of-night summary email/export pack;
- a "rehearsal mode" banner on guest phones for practice events;
- a phone-sized Live view for staff walking the floor.

**Open questions for Zack:**
1. Should anonymous mode also hide your bidder number from you? It's shown now ("Other guests see you as Bidder 4").
2. The readiness check's "date and time confirmed" tick is still per-device. Should it move to the server?
3. Should accent contrast be checked only against the ink colour, or also against the paper?
4. This batch has no new before/after composite images, only working screenshots. If you want composites for review, I can produce them next.

## Review fixes (Codex, 2026-10-13)

Zack assigned the four findings from the independent review of `07b4642` to Codex for implementation in this worktree. All four are fixed locally:

- **Save sequencing:** event and item PATCH acknowledgements update the current data/revision reference synchronously before the next queued edit. A failed refresh cannot make the queue reuse the previous revision. Responses from polls started before a write are ignored.
- **Truthful save state:** the indicator accounts for queued saves and individually dirty canvas fields. An older save completing does not mark newer text Saved. Failed canvas drafts survive refresh and retry on blur. The top-bar event title also preserves newer typing across acknowledgements instead of remounting on every revision.
- **Duplicate settings:** a new draft retains the source event's bidder visibility and custom accent. The connected duplication case also confirms that participants, bids, awards and pledges are not carried over.
- **Sponsor upload:** upload completion merges its asset into the latest sponsor row by its local stable key. Newer name/link edits survive, and deleting a sponsor during upload does not resurrect it.

### Verification

Node 24 was used throughout. Connected checks ran against the separate loopback database `bz_test_save_fixes_20261013`, with existing migrations 001–006 and a disposable local staff account. The review database `bz_test_claude` was not seeded or reset. No new migration, production resource, push, or deployment was needed.

- `tests/v1/studio-saving.mjs`: **7/7**, using intercepted APIs and controlled waits. The initial six cases all failed against `07b4642` before the fixes; the seventh protects newer top-bar title text. Covers queued revisions, failed refresh, newer unsaved text, failed draft retry, sponsor rename during upload, and deletion during upload.
- `tests/v1/journey.mjs`: **47/47** against the compiled application on port 3421, including the expanded anonymous-event duplication regression.
- `tests/v1/operations-ui.mjs`: **PASS**; void, withdrawal, participant edit, practice reset/delete, staff invitation, password setup/reset and session revocation; no browser page errors.
- `tests/v1/display-logic.mjs`: **10/10**.
- TypeScript (`tsc --noEmit --incremental false`), production `next build`, and `git diff --check`: **PASS**.
- Connected Studio captures inspected at **1440×1000** and **390×844**, with no browser page errors: `.shots/save-fixes/studio-1440.png` and `.shots/save-fixes/studio-390.png` (local ignored artifacts).

The existing preview remains on port 3420. These changes address the four review findings without changing the selected host/join experience or starting the deferred feature batch.

## Image handling landing (Codex, 2026-10-13)

Approved from the next-landing plan in this conversation. Baseline: `63580aa`, the separate checkpoint of all four save/duplication/upload review fixes. This landing preserves the selected Claude shell and its autosave behavior.

### Delivered

- **Adjust photo** for the welcome cover and item photo: tap or drag the important part, use arrow keys or the horizontal/vertical sliders, inspect wide/square previews, and reset to center. Position edits autosave and use the same Saved/Saving/Not saved indicator as other edits.
- Every existing cover/item photo rendering path honors the reference's position: guest welcome/join, fan, catalog cards and compact rows, item hero, bid sheet, tickets, winner moments, Studio outline/canvas/Live/Results, home/duplicate thumbnails and projector. Sponsor/nonprofit logo marks use contain, preserving their complete shape; logo uploads retain transparency.
- Single-image selection supports click, drop and paste. Cover upload is now a reachable control above the welcome text. Failed upload/save retains the confirmed photo and offers **Try again**. Newer picks, removal, source changes and leaving the editor invalidate unfinished uploads.
- Sponsor uploads retain the confirmed logo until save succeeds, preserve newer name/link edits, and cannot resurrect removed rows. Failed logo saves can retry.
- Removing/replacing a photo cancels pending focal edits as well as obsolete uploads. A delayed queued write also checks the expected previous asset, so it cannot restore an image removed in the meantime.

### Storage and interfaces

New additive migration `migrations/prod/007_photo_position.sql` stores `events.cover_focal` and `items.image_focal`, each `{x,y}` within `[0,1]`, default center `{x:0.5,y:0.5}`. Coordinates belong to event/item references; asset bytes remain immutable. Duplicates copy positioning independently. Replacement/removal resets it unless the replacement supplies its position atomically.

Staff PATCH accepts `coverFocal` / `imageFocal`; guest, staff, stage and home models return the corresponding metadata. Optional `coverExpectedAssetId` / `imageExpectedAssetId` refuses a photo write if its source has changed. Existing optimistic revisions and bid protections remain in force. No applied migration was edited.

### Evidence

Final build and tests used verified **Node v24.4.1** at `~/.nvm/versions/node/v24.4.1/bin/node`. The Homebrew path named `node@24` unexpectedly runs v26.7.0 here; after discovering that, the build and final checks were repeated with the verified runtime.

- `tests/v1/photos.mjs`: **8/8**, connected persistence, validation, snapshot propagation, duplicate independence, obsolete writes, replacement defaults, transparency, staff access and actual Studio upload/keyboard positioning at desktop and phone sizes.
- `tests/v1/photo-ui.mjs`: **11/11**, controlled browser upload/save races, retry, paste, keyboard positioning and pending focal cancellation; APIs intercepted.
- `tests/v1/studio-saving.mjs`: **7/7**.
- `tests/v1/journey.mjs`: **47/47**.
- `tests/v1/operations-ui.mjs`: **PASS**, no page errors.
- `tests/v1/display-logic.mjs`: **10/10**.
- TypeScript, production Next build, `git diff --check`: **PASS**.

Connected acceptance used the separate loopback database `bz_test_save_fixes_20261013`, compiled app on temporary port 3421, and disposable staff credentials. Migration 007 was also applied to the existing local review database `bz_test_claude` without seeding/resetting it. The preview at **http://127.0.0.1:3420/studio** now serves this build using Node 24. Temporary candidate and baseline servers on 3421/3422 were stopped. No provider, staging or production database was touched; nothing was pushed or deployed.

Matching captures use controlled synthetic content; the baseline was separately compiled from `63580aa`. Two visual inspections covered 390px and 1440px. The first found an obscured cover retry control, fixed and covered by the browser suite; the final captures show reachable controls and intact layouts. Connected phone positioning was also inspected.

| Review | Evidence |
|---|---|
| Welcome desktop, before/after | [Pair](images/image-handling/welcome-desktop-pair.png) |
| New positioning controls, before/after | [Pair](images/image-handling/adjust-desktop-pair.png), [full-size controls](images/image-handling/adjust-1440.png) |
| Welcome phone, before/after | [Pair](images/image-handling/welcome-phone-pair.png) |
| Item desktop, before/after | [Pair](images/image-handling/item-desktop-pair.png) |
| Connected phone editor | [Capture](images/image-handling/connected-edit-390.png) |

Focal positioning is implemented. Freeform crop/zoom and bulk uploads remain later work. The separate Items interaction study does not change application routes or data.

## Separate Items interaction study (Codex, 2026-10-13)

The image pass is checkpointed in `96af781`. The isolated Items prototype is ready at **http://127.0.0.1:3423**, with 30 synthetic items and a comparison switch for **Automatic + optional draft** versus **Visible Drafts group**. Both autosave, recover unfinished work across reload, keep draft items out of guest preview, and support search, category/missing-photo filters and single-photo selection. Add several is an optional spreadsheet-paste demonstration with a review step.

The connected application has no new Items workflow from this study. All effects are browser-local, with separate examples per flow. The verified browser rehearsal passes for **2/2 flows**, at 1440px and 390px, including creation, recovery, guest visibility, filtering, return navigation and bulk-row validation; no page errors or horizontal overflow. Two visual inspections were completed, including a fix to oversized missing-photo placeholders.

[Study and five-minute trial](ITEMS_WORKSPACE_STUDY.md) · [desktop comparison](images/items-study/flows-desktop-pair.png) · [phone comparison](images/items-study/flows-phone-pair.png).

The retained prototype server is owned by this session, runs `prototypes/items-workspace/serve.mjs` on loopback 3423, and can be restarted with `node prototypes/items-workspace/serve.mjs`. The final interaction decision belongs to Zack's trial; this is a reviewable prototype, not an accepted connected Items manager. Stage controls, event-info editing and winner-page editing remain later landings.

## Next tranche saved (Zack, 2026-10-13)

[Studio information architecture and event operations](REAL_V1_NEXT_TRANCHE.md) records Zack's next tranche: Published versus Live language, a scalable event index, Live operations by phase, Navigator/Preview/Inspector, brand versus semantic tokens, human-first configuration, actual guest components in preview, sticky bidding actions, neutral results language and aligned domain responsibilities.

This is queued direction. Zack will review the current build and Items interaction study next; no implementation of the new tranche has begun. The record distinguishes desired capabilities from existing backend support, preserves current auction guarantees and autosave, and does not introduce another publishing workflow for ordinary edits.

## Items workspace (Claude, 2026-10-13)

Delivered from [ITEMS_BUILD_BRIEF.md](ITEMS_BUILD_BRIEF.md), with Claude's own design rather than the rejected isolated prototype, connected to the real backend inside the Studio. Commits: `95620a0` (server), `0b57aa7` (workspace), `94f4cec` (browser suite and critique fixes), plus this checkpoint. Local only: nothing pushed, merged or deployed, and no cloud resources were created.

### What staff get

- **Set up → All items** opens a full-width sheet (`?mode=setup&view=items`, so Back and reload return to it). The guest phone sits beside it and renders the guests' own components; **Hide phone** gives the sheet the whole width. On narrow screens it becomes a **List / Guest phone** switch.
- **Type straight into rows.** Title, category, provider and starting bid are inline cells. Each saves when you leave it and feeds the Studio's Saved / Saving / Not saved indicator. Enter and ↑/↓ move between rows like a spreadsheet; Escape restores. Starting bids lock once someone bids.
- **The last row is always ready.** Enter adds the item and starts a fresh row, keeping the category for a run of similar items. Adding is retry-safe, shows a pending row, and offers **Retry** if it fails. Unfinished typing survives a reload on that device.
- **Paste from a spreadsheet** (button, or paste several rows into the add row). It handles Excel, Google Sheets or Numbers tab-separated text, quoted multi-line cells, and CSV. The header row is detected, and *Retail value* is never taken for the starting bid. A review step lets staff remap columns, fix rows in place or leave them out. All rows are added in one atomic, retry-safe batch, and the new items arrive selected.
- **Photos:** click, drop or paste one onto a row. **Add photos** (or drop a pile onto the sheet) matches many at once, either by item number or title words in the file name, or in order. Camera names like `IMG_4821` are never guessed, and every pair is reviewed before anything uploads.
- **Filters:** search; All / Visible / Hidden / Has bids / Closed / No photo, each with counts; and category chips in staff order.
- **Multi-select** with checkbox and Shift-range selection. A dark dock offers **Category** (existing or new), **Show to guests**, **Hide** and **Delete**. Items people have bid on are kept and the dock says so; Withdraw stays in Live. Results are reported as plain sentences, e.g. "Hid 4 items. 1 item with bids stays visible".
- **Categories:** create (empty ones persist), rename, merge (rename onto an existing name, after a confirm), remove, and drag to set the order guests' chips follow. Names are tidied and matched without case, so "travel " becomes "Travel".
- **Arrange** (⋯ menu): group by category, title A to Z, or lowest starting bid, each with **Undo**.
- **Reorder:** drag the handle (mouse, pen or finger, with edge auto-scroll), or use the keyboard (Space to pick up, arrows to move, Space to drop, Escape to cancel), or Alt+↑/↓. The item editor also has Move earlier/later buttons. Reordering pauses while a filter would hide where things land, and the sheet says so.
- **The sidebar list stays calm beyond 8 items:** one compact line per item, search once there are more than eight, the same reordering, and an **All items** row that summarises what needs attention.
- **The item editor** gains All items and position controls, plus Title, Short line and Description fields, so it is complete on a phone. Hidden items get a clear **Show to guests** prompt.
- **Go live check** now warns when items are hidden, and its photo fix opens the workspace filtered to *No photo*.

### Decision: unfinished items

I used the existing `items.ready` flag ("Visible to guests") and set the default on the server, so every path agrees: the add row, paste, the API and templates.

- **Draft event:** a new item is visible as soon as it exists. It already needs a title and a starting amount to exist; the add row refuses to save without both ("Add a starting bid to save this item").
- **Published event:** a new item starts **hidden**. Its row shows a cobalt **Show** button, the editor shows a **Show to guests** prompt, and the summary reads "40 visible to guests · 2 hidden". Pasted items arrive hidden and selected, so one click shows them together.
- Editing an item guests can already see autosaves straight to guests. There is no second publish step.
- An explicit `ready` from the API still wins, and must be a real yes/no.

**Why:** during a live show, a half-entered item should never flash onto 300 phones. Before going live, an extra step for every item would only slow staff down. Draft and published therefore get different defaults, but the same toggle. Items with bids can never be hidden, and both bulk and single edits enforce that.

### Server and schema

`migrations/prod/008_item_categories.sql` (additive; applied to `bz_test_claude` and the disposable test database):
- tidies category whitespace;
- adds a CHECK that category text stays tidy;
- adds `events.categories jsonb` (the ordered list, up to 100), backfilled from existing items;
- indexes `(event_id, lower(category))`.

`items.category` remains the single source of each item's assignment. The list adds order and empty categories, and the server unions the two on every read, so they can't drift.

New endpoints:

| Endpoint | What it does |
|---|---|
| `POST /host/events/:id/items/batch` | Paste: up to 200 rows, atomic, retry-safe |
| `PATCH /host/events/:id/items` | Bulk category, visibility and photo. Each change follows the single-item rules; one that can't apply is skipped and reported |
| `POST /host/events/:id/items/delete` | Keeps items with bid attempts; a repeated delete is a no-op |
| `POST /host/events/:id/categories` | add / rename (merges) / remove / order |

`updateItem` now returns the stored category, and takes the event lock *before* the item lock when it adds a new category, so lock order stays event-before-item everywhere. Item numbers close up after a delete while the event is a draft, and stay put once it's published. Duplicating an event copies its category list. Guest snapshots carry the staff category order.

### Evidence

Node v24.4.1. The final run used the **compiled** build (`next start` on temporary port 3422) against the disposable loopback database `bz_test_items_20261013`, with its own staff account.

| Check | Result |
|---|---|
| `tests/v1/journey.mjs` | **55/55** (47 earlier + 8 new: visibility default, category tidying, category list actions, batch atomicity and replay, bulk update rules, bulk delete, concurrency without deadlock, duplicate) |
| `tests/v1/items-ui.mjs` (new, connected) | **15/15**: typed rows, reload recovery, paste review, bulk category/hide, filters, inline cells, keyboard and pointer reorder, row and matched photos, category merge, published-event hidden default and Show, bulk delete keeps bid items, sidebar search, phone layout with no sideways scroll, no page errors |
| `tests/v1/items-logic.mjs` (new, pure) | **10/10**: category rules, paste parsing and column guessing, photo matching |
| `tests/v1/operations-ui.mjs` | **PASS** |
| `tests/v1/display-logic.mjs` | **10/10** |
| Image checks: `photos.mjs` / `photo-ui.mjs` / `studio-saving.mjs` | **8/8**, **11/11**, **7/7** |
| tsc, `next build`, `git diff --check` | **PASS** |

One existing selector changed: `photo-ui.mjs` now clicks `.inav-row`, the new sidebar row, instead of the removed `.ol-item`; the behaviour under test is unchanged.

The 40-item seed, `tests/v1/seed-trade-show.mjs`, enters items through the batch and bulk-photo endpoints. With `LIVE=1` it publishes, adds four bidders, bids on 14 items, and adds two late items that start hidden.

**Two critique rounds** of 390px and 1440px captures (plus an earlier first look). What they caught and fixed:
- truncated titles at mid width;
- *Provided by* disappearing when the phone preview narrowed the sheet (rows now go two-line instead);
- a validation hint hidden by layout;
- the new-category field buried below a long popover;
- unlabelled stacked amounts;
- long sidebar titles widening the rail;
- phone titles squeezed by the visibility pill.

The browser suite also caught the photo dialog uploading three at a time while the server deliberately decodes one at a time. Uploads now go in sequence, and `uploadPhoto` waits and retries on `ASSET_BUSY`, which also covers two staff uploading at once.

| View | 1440 | 390 |
|---|---|---|
| Workspace with guest phone | [workspace](images/items-workspace/workspace-1440.png), [row focused](images/items-workspace/workspace-focus-1440.png) | [list](images/items-workspace/workspace-390.png), [guest phone](images/items-workspace/phone-preview-390.png) |
| Full width, phone hidden | [all columns](images/items-workspace/workspace-full-1440.png), [Hidden filter](images/items-workspace/filter-hidden-1440.png) | [add row](images/items-workspace/add-row-390.png) |
| Multi-select | [dock](images/items-workspace/bulk-1440.png), [set category](images/items-workspace/bulk-category-1440.png) | [dock](images/items-workspace/bulk-390.png) |
| Paste review, categories | [paste](images/items-workspace/paste-1440.png), [categories](images/items-workspace/categories-1440.png) | |
| Sidebar list, item editor | [sidebar](images/items-workspace/sidebar-1440.png), [editor](images/items-workspace/item-editor-1440.png) | [editor](images/items-workspace/item-editor-390.png) |

**Not yet covered:**
- real iOS and Android hardware;
- VoiceOver;
- two staff editing the same row at the same moment (the existing revision check refuses the stale write, and the row shows Not saved);
- more than about 60 items (the sheet doesn't virtualise).

### Running services

- **http://127.0.0.1:3420/studio** (host@example.com / claude-shell-pass) now runs this build via `next start` on `bz_test_claude`. I replaced the earlier Codex-started server on the same port.
- Seeded walkthrough event: **Holiday Trade Show 2026**, a draft with 40 items and 10 categories, 19 with photos, dated two days out. ID `813ad94c-e4de-4b20-bcd9-e1d0205a181c`, code `VMFPQC`.
- The rejected prototype server on 3423 (Codex's) is still running; stop it with `kill $(lsof -tiTCP:3423 -sTCP:LISTEN)` when it's no longer needed.
- Temporary servers on 3421 and 3422 are stopped. Other worktrees' servers on 3410 and 3412 were left alone.

### 10-minute walkthrough script for Saturn staff

*Before:* open `127.0.0.1:3420/studio` and sign in. Have a spreadsheet with about 15 items open (columns: Item, Starting bid, Category, Donated by), and a folder of item photos named by item number (`01.jpg`, `02.jpg` …) or by a word from the title.

1. **Create the event (1 min).** **New event**, then **Trade show auction**. Name it, pick the date and how long bidding runs, then **Create and open the editor**. In Set up, click **All items** in the sidebar. The template adds three sample items: tick them and **Delete**, or just overwrite their titles.
2. **Type the first five fast (2 min).** In the highlighted bottom row, type a title, then Tab to category ("Travel"), provider and starting bid, then Enter. The cursor is already in a fresh row and the category is kept, so for the next few just type a title, Tab, Tab, an amount, Enter. Notice the green tick and *Saved* in the header; there is no Save button.
3. **Paste the rest (2 min).** Copy the 15 spreadsheet rows, click **Paste rows**, and paste. Check that the columns read Title / Starting bid / Category / Provided by. Fix any red row in place (a price written as words, say), then **Add 15 items**. You now have 20+.
4. **Categorise (1 min).** In the bulk dock (the pasted items are still selected), **Category**, then pick one or type a new name. Click **Manage** beside the category chips: rename "Dining" to "Food & drink" and confirm the merge, then drag the categories into the order guests should see. Click a category chip to filter by it.
5. **Photos (1.5 min).** Drag the whole photo folder onto the sheet. Check the pairs (change any with the dropdown) and click **Add N photos**. Then click **No photo** to see what's left, and drop a single photo onto one of those rows.
6. **Reorder (1 min).** Drag a row by its ⠿ handle to the top. On a laptop, focus a handle and press Space, ↑, ↑, Space. Or use ⋯ → **Group by category**, then **Undo** to see it's safe.
7. **Go live (0.5 min).** **Go live**. The check lists anything missing (photos, hidden items). **Go live anyway** or fix first; then share the code.
8. **Add one more item while live (1 min).** Back in **All items**, type "Late donation: …" with a price, then Enter. It starts **Hidden**: the guest phone beside the sheet doesn't show it, and the header reads "· 1 hidden". Finish its details, then click **Show** on its row. It appears on guests' phones immediately; open **Preview** on a phone to confirm.

**What to watch for:** any moment someone looks for a Save button; whether "Hidden" versus "Visible" is understood without explanation; whether the paste review feels trustworthy; and how photo matching copes with Saturn's real file names.
