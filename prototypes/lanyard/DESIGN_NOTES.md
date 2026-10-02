# Lanyard: bidder journey prototype

Status: **prototype candidate, awaiting the user's visual decision.** Not accepted, not connected to the app. Simulated server, fictional content.

## Run it

```bash
cd prototypes/lanyard
node serve.mjs            # http://127.0.0.1:4321  (loopback only; PORT=... to change)
node evidence/walk.mjs    # drives the journey in Chromium: 42 assertions + ~40 screenshots in evidence/shots
node evidence/webkit-smoke.mjs   # core journey in WebKit (iPhone 13 emulation)
```

On a phone-width window it is the whole screen. On a wide window it is a 430px phone column with a **Review controls** rail (dark, monospace, on purpose unlike the product). On widths under 1100px the rail opens from the "Prototype" edge tab.

## Design choices (what to judge)

1. **A badge, not a login.** Your business is a persistent lanyard-style pass at the top of every main screen (ink bar, marigold monogram, business first, person second), repeated as a chip on lot pages, in the action bar ("Bidding for Juniper Studio"), and as the largest element in the bid sheet. Guests get the same pass in a dashed "Guest" form.
2. **Colour has jobs.** Cobalt means "an action you can take". Marigold means "yours". Green/vermilion/amber/dashed/grey are status only. Sponsors are rounded squares; bidding businesses are circles.
3. **One status vocabulary, one function.** `lotStatus()` produces *You're leading / Outbid / Sending / Unconfirmed / Not placed / closed variants*; cards, rows, lot page, My bids and the sheet all render from it, so a lot cannot say two things.
4. **One bid sheet.** Every Bid button (card→lot, My bids, a failed ticket, a rebid) opens the same sheet: business, amount stepper, and a live "What this does" list that states the amount, the business, the current top bid, and that you lead only once confirmed.
5. **Truth before reassurance.** The UI shows "accepted" only after the simulated server confirms. A timeout is *Unconfirmed* ("may or may not have been placed"), offers only **Check status**, and blocks a second bid. Offline, standings are labelled "as of 2:42 PM" and rival bids stay invisible until reconnect.
6. **Returning to your place.** Scroll is remembered per tab, anchored to the first visible lot (so it survives content changes); Back, tab switches and reload restore it; the lot you left pulses briefly. The sheet is a history entry, so Back closes it instead of leaving the page.
7. **Character.** Fraunces (soft serif) for titles and lot numerals, Instrument Sans for everything else, tabular figures for money. Catalogue "Lot 01" tabs; ticket-stub perforations on the current-bid panel and My bids rows.

## What is simulated (and must not be mistaken for product)

Server, identity (any phone/6 digits), the clock (starts 2:42 PM), rival bidders, connection state. All live in this browser's localStorage. The **Review controls** can force every state: succeeds / rival lands first / bidding closes first / fails to send / times out (landed or not), go offline, close bidding, seed a demo bidder.

## Assumptions (marked A1–A12 inline; toggle in the rail)

Public browsing · phone-code identity · business↔person relationship (no permissions invented) · what a bid commits you to (no payment/donation semantics) · USD, $25 steps, opening bids · single 6:00 PM close, no extension · race ordering · nothing designed after close · leader raising own bid · retry semantics · who sees names · returning-later recovery. Full text is in `src/data.js` and the rail.

## Content

Six lots come **verbatim** from the shared kit (`src/fixtures.shared.js`, copied from `prototypes/holiday-social`; images likewise: their licensing is not something I verified). **Lot 07 is this prototype's addition** (very long title, no image, no bids) to stress those cases. Sponsor marks are drawn here and fictional.

## Known defects and unverified areas

- On short viewports (e.g. 664px usable height in Safari) the sheet's "What this does" list scrolls under the pinned button; the A4 caveat is below the fold there. At 844px it fits.
- The "Prototype" edge tab can touch right-aligned content (e.g. a price in compact rows) on narrow phones.
- Not tested: real iOS Safari hardware, touch drag-to-dismiss on the sheet, VoiceOver/TalkBack, reduced-motion by eye. Keyboard: Escape closes the sheet and focus rings exist, but there is no full keyboard audit.
- Toasts are a courtesy and one-at-a-time; standing is always shown in place.
- Walker ran under Node 26.7 (machine default), not the repo's Node 24.

## Rejected / not done on purpose

Quick-bid buttons on cards (a single "open the lot" action per card keeps the interaction consistent); a countdown clock (closing rules undecided); watchlists, auto-bid, payment screens (not in the journey and not decided).
