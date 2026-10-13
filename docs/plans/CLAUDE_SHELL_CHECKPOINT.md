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
