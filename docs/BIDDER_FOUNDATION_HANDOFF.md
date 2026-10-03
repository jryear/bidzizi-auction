# Bidder foundation handoff

Status: prototype A promoted as the bidder design foundation (commit `04548fc`, unchanged), then extended by one simulated pass (section 3). Everything is still simulated. Nothing here is a frozen contract.

**Prototype B could not be inspected, again.** The docs connector returned `deny / access` for `https://claude.ai/artifact/YLUL2gHi2DJ3Uh8snfntL5` on 2026-10-03 (not shared with this session, or not a doc). The pill navigation, the watching interaction and the lot-detail BidZizi header were therefore built from the written request only and are labelled that way (A16, A23). They do not reproduce B. To compare against B, share it with the session or supply screenshots.

## 1. Where things are

| Item | Value |
| --- | --- |
| Branch / worktree | `bidder-foundation-a` at `/Users/jryear/code/bidzizi-bidder-foundation-a` (local only; not pushed, merged, or deployed) |
| Exact-source checkpoint | tag `bidder-foundation-a-checkpoint` = commit `04548fc`; tree of `prototypes/lanyard` is `3a3dd9b` |
| Branch history | `472b851` carries the main checkout's uncommitted README, AGENTS, and discovery draft verbatim; `04548fc` is the prototype, unchanged; later commits are documentation only |
| Source | `prototypes/lanyard/` (originally untracked in `/Users/jryear/code/bidzizi`) |
| Selection | By the user, in chat, 2026-10-02. Scope: design language, page layouts, onboarding, bidding interactions |
| Original preview | `127.0.0.1:4321`, `node serve.mjs` serving the untracked original directory (started from the user's shell) |
| Promoted copy | `cd prototypes/lanyard && PORT=4322 node serve.mjs` from the worktree |

## 2. Implementation of prototype A as promoted (verified, 2026-10-02)

This section describes the promoted source at `04548fc`. What pass 2 changed is in section 3.

Static HTML/CSS/ES modules, about 1,370 lines of JS and CSS, no build and no dependencies. Fraunces and Instrument Sans are vendored under `assets/fonts` (OFL).

- **Routes** (hash): `#/` entry, `#/lots`, `#/lot/:id`, `#/bids`, `#/event`. Sheets are history entries: `?sheet=bid|identity|account&lot=`. Back closes a sheet.
- **Onboarding**: browse as guest; the first Bid opens an identity sheet: phone, then any 6-digit code, then business and person (prefilled `Juniper Studio` / `Jamie Chen`, self-declared). Intent is kept, so the bid sheet opens afterwards. A pass bar then shows business first, person second.
- **Navigation**: three-tab bottom bar (Lots, My bids, Event) with an attention badge. Lot detail hides it and shows back plus a business chip.
- **Browsing**: category chips, sort, card or compact-row layout. These persist in localStorage. Scroll is remembered per tab, anchored to the first visible lot, and restored on Back, tab switch, and reload. There is no search.
- **Bid flow**: one sheet for every Bid button. Stepper, $25 steps, a live "What this does" list, then submit. States: sending, accepted, rival-first, closed-first, not sent, unconfirmed with Check status. "Accepted" shows only after the simulated server confirms; retries reuse a request key.
- **Status**: one function, `lotStatus()` in `src/store.js`, drives every screen.
- **Simulation**: `src/store.js` (client state plus fake server in localStorage, keys `lanyard.v1` and `lanyard.scroll`), `src/panel.js` (Review controls: force outcomes, rivals, offline, close, seed demo bidder). Time starts at 2:42 PM; closing is 6:00 PM.
- **Content**: six lots verbatim from the shared kit (`src/fixtures.shared.js`, copied from `prototypes/holiday-social`; image licensing not verified). Lot 07 was added to stress a long title, a missing image, and no bids. Sponsor marks are drawn and fictional.
- **Open rules** are marked A1–A12 inline and in `src/data.js`.

Not present: Member ID and any Saturn Barter context, pill navigation, watching or saved lots, a persistent BidZizi header on lot detail, sponsor welcome, additional users, appearance settings, donations, auto-bid, search.

### Verification of the promotion

| Check | Result |
| --- | --- |
| Source identity, original vs promoted (`diff -r`, per-file sha256) | 0 differences across 24 files |
| Served bytes, 4321 vs 4322 | 19 of 19 identical |
| `pnpm typecheck` in the worktree (Node 24.4.1, pnpm 12.4.2) | exit 0 |
| `evidence/walk.mjs` against the promoted copy (Node 24.4.1) | 42 of 42 passed. It covers entry, browsing, lot detail, identity, bid review, pending, accepted, outbid, stale, unconfirmed, offline, closed, reload, Back, tab restore, and 360px overflow |
| `evidence/webkit-smoke.mjs` (iPhone 13 emulation) | passed, no console errors |
| Screenshots, promoted run vs original run | 40 of 41 byte-identical. `05-event-how-it-works.png` differs at byte level; same dimensions and visually the same when inspected; not pixel-diffed (no image tool available), cause not determined |

Not tested: real iOS hardware, VoiceOver or TalkBack, touch drag-to-dismiss on the sheet, a full keyboard audit, reduced motion by eye, `pnpm build` (needs `DATABASE_URL`; the prototype is outside the Next build).

Known defects, left as they are: on short viewports (about 664px) the sheet's A4 caveat sits below the fold; the "Prototype" edge tab can touch right-aligned prices on narrow phones; `walk.mjs` always writes to `evidence/shots` (now gitignored).

## 3. Pass 2: what was done (simulated; same branch)

The request, in five parts, and what exists now. Scope held: no edits to `src/` or `package.json`, no services or credentials, no admin or staff UI, no real auto-bidding, `src/fixtures.shared.js` untouched.

1. **Preserve A.** Composition, onboarding steps, bid sheet, status vocabulary, and `lotStatus()` are unchanged. `evidence/walk.mjs` is unmodified and still passes 42 of 42. Changed on purpose: the bottom bar's look (pill), lot-detail header, and wording in the phone and code steps (below).
2. **Identity.** Phone, then verification, then business, name and an optional Member ID, under a "Saturn Barter" network band. Verification is labeled simulated on both steps and in the account sheet; the old "We sent a 6-digit code" claim was replaced because nothing is sent. A Member ID is never checked and never shown to other bidders. With a Member ID filled in and no business, the step refuses ("A Member ID alone isn't enough"). Business and name are always required (A3, A13, A14, A15).
3. **From B, from the written request only.** (a) A four-section pill bar: Lots, Watching, My bids, Event, in A's ink and paper, hidden on lot pages so the bid bar stays reachable. (b) Watching: a bookmark on cards, rows and lot pages, and a Watching screen. It is a list on this device, separate from My Bids, places no bid, notifies no one, and creates no attention badge (A16). (c) Lot pages carry a persistent BidZizi header (back, wordmark, business chip); Back is labelled for where you came from (A23). **None of this was compared with B.**
4. **Completed.** Sponsor welcome (sheet; from the entry page and again from Event). Event page: event facts, sponsors, giving, settings. Persistent bidder navigation (the pill bar). Additional users: a list only; added people can do nothing (A17). Appearance: text size, lot layout, reduced motion, all on this device (A18). Nonprofit donation: an access point and an explicit "Not decided yet" screen with no amount, payment or recipient (A19). Private maximum: a labeled simulation with a separate confirmation step and a tick-box, saved only after the simulated server confirms, with saving, not-saved, unconfirmed and check-status states. It places no bid and does not change who is leading (A20).
5. **Preserved.** Scroll anchoring now covers Watching too. Category, sort, layout and a new search query persist across opening a lot, Back, and reload (A22). Business and person attribution, bid confirmation, and pending, unconfirmed and check-status recovery are untouched. Maximums follow the same truth rule as bids and belong to the business and person that set them; they are not shown after another identity signs in.

Decisions I made without asking (each is reversible; challenge any): search was **added** because "search context" was requested and none existed; the sponsor welcome is a **sheet** with placeholder wording from fixtures; the confirmation checkbox sits in the pinned footer so it is never below the fold; the pill bar is hidden on lot pages; the maximum must be at least the next minimum bid, in $25 steps.

Files touched: `prototypes/lanyard/` `src/{data,store,views,sheets,app,panel,ui}.js`, `styles.css`, `DESIGN_NOTES.md`, new `evidence/walk-foundation.mjs` and `evidence/webkit-foundation.mjs`; plus this file, `README.md`, `AGENTS.md`.

## 4. Open decisions (do not invent; mark as A-numbered assumptions)

- Member ID: format, who issues it, what it proves, and what, besides it, authorizes acting for a business.
- Saturn Barter network context: how it appears, and whether it changes any bidding rule.
- Real phone verification: provider and failure handling.
- Watching: per person or per business, whether others can see it, and what it notifies.
- Additional users: roles, permissions, and whether standing is shared across a business.
- Appearance settings: which options, and where they persist.
- Nonprofit donation: what it is, who receives it, and any payment or receipt behavior. This must not be invented to complete a screen.
- Auto-bid: how the maximum is confirmed and stored, increments, tie order, and who can see it.
- Sponsor welcome and event information content; search scope; how a persistent BidZizi header relates to the pass bar.
- All existing A1–A12 items.

Still open after pass 2, each marked in the UI and listed in the Review controls panel (toggle "Show assumption markers", now A1–A23):

| ID | Open question |
| --- | --- |
| A13 | Member ID: format, issuer, what it proves, what else authorizes a business. Here: optional, typed, never checked, never shown |
| A14 | Saturn Barter network context: how it appears, whether it changes any rule. Here: a label only |
| A15 | Phone verification: provider, expiry, resend, failures. Here: simulated, any 6 digits |
| A16 | Watching: person or business, visibility, notifications. Here: this device, private, silent |
| A17 | Additional users: roles, permissions, shared standing. Here: a list, no abilities |
| A18 | Appearance: which options, where they persist. Here: text size, layout, motion, this device |
| A19 | Nonprofit donation: everything. Here: access point only |
| A20 | Auto-bid: confirmation, storage, increments, tie order, visibility. Here: saved maximum, never acts |
| A21 | Sponsor welcome and event information wording and ownership. Here: placeholder |
| A22 | Search scope. Here: lot number, title, short text, sponsor, category |
| A23 | Navigation and header: four sections, bar hidden on lot pages, BidZizi header vs pass bar; B not inspected |

Not decided and not inventable by a prototype: payment, donation and receipt behavior; business permissions; real auto-bidding; real phone verification.

## 5. Later work (separate, not this pass)

- **First real contract**: one identified and authorized bidder, one open lot, a manual bid, database-authoritative standing, and an outbid outcome. Follow the `tasks/` and `verify.py` workflow in `AGENTS.md`. Real auto-bidding is a later contract.
- **Desktop staff prototype** (separate): Saturn staff prepare an event and sponsors, enter and organize lots internally, preview the actual bidder components against draft data, and publish the catalog. It should reuse A's components and fixtures. Do not build admin now, and do not prebuild a general multi-organization platform.

## 6. Run and verify

```bash
cd /Users/jryear/code/bidzizi-bidder-foundation-a
export PATH="$HOME/.nvm/versions/node/v24.4.1/bin:$PATH"   # repo needs Node 24
pnpm install --frozen-lockfile && pnpm typecheck
cd prototypes/lanyard && PORT=4322 node serve.mjs &          # then:
URL=http://127.0.0.1:4322/ node evidence/walk.mjs               # expect 42/42 (prototype A regression, unmodified)
URL=http://127.0.0.1:4322/ node evidence/walk-foundation.mjs    # expect 80/80 (pass 2)
URL=http://127.0.0.1:4322/ node evidence/webkit-smoke.mjs       # expect PASS
URL=http://127.0.0.1:4322/ node evidence/webkit-foundation.mjs  # expect 14/14 (pass 2, WebKit)
```

Stop only the server you started (by PID). Do not run `pkill -f "node serve.mjs"`: other agents run servers like it.

### Pass 2 verification (2026-10-03, Node 24.4.1, Chromium and WebKit via Playwright)

| Check | Result |
| --- | --- |
| Baseline before any change: `walk.mjs`, `webkit-smoke.mjs` | 42 of 42, PASS |
| `pnpm typecheck` | no errors (the prototype is outside the Next build; this proves only that the app still type-checks) |
| `walk.mjs` after the changes, script unmodified | 42 of 42 |
| `walk-foundation.mjs` (identity and Member ID, watching, search and filter persistence, event screens, appearance, additional users, maximum flow incl. offline, discard, remove, sign-out; 360px overflow; desktop) | 80 of 80 |
| `webkit-smoke.mjs` (iPhone 13 emulation) | PASS, no console errors |
| `webkit-foundation.mjs` (iPhone 13 emulation; includes larger text with no horizontal overflow on five screens) | 14 of 14 |
| Screenshots | Inspected by eye: nav, watching, lot header, identity step, maximum confirm and saved states, appearance, 360px rows, larger-text sheet. Not pixel-compared with A |

Defects found by these checks and fixed in the same pass: a `data-lot` attribute on the watch button collided with the walker's selectors (renamed `data-watch`); an empty `data-keep` attribute is falsy in `dataset`, so toggles lost keyboard focus (fixed, covered by a keyboard test); a 40px watch button beside compact rows crushed price and badge at 360px (moved onto the thumbnail corner with a 44px hit area); the maximum's confirmation tick-box was below the fold at 844px (moved to the pinned footer).

**Not tested:** prototype B (inaccessible); real iOS hardware; VoiceOver or TalkBack; touch drag-to-dismiss on sheets; a full keyboard audit (only focus retention on toggles was tested); reduced motion by eye; larger text beyond five screens and the sheets seen; real Safari zoom behavior on larger text beyond WebKit emulation; the mobile browser keyboard with the search field; `pnpm build`. No one has judged the new screens visually: passing checks do not grant visual acceptance.

**Known defects, left as they are or new:** the sheet's A4 caveat and long confirmation lists scroll under the pinned footer on short viewports; the "Prototype" edge tab can touch right-aligned content on narrow phones, including the price in compact rows; at 360px a compact row's title clamps hard when a status badge is shown (already true in A, not made worse); `walk.mjs` always writes to `evidence/shots` (gitignored); larger text uses CSS `zoom`, which is a prototype shortcut, and production should scale type properly; the watch toggle on a row is a small chip on the thumbnail; failed or unconfirmed maximums do not add to the My bids attention badge.

## 7. Not touched by promotion or by pass 2

The main checkout still holds uncommitted `README.md`, `AGENTS.md`, `docs/PRODUCT_SLICE_001_DISCOVERY.md`, and untracked `prototypes/` (the original `lanyard` including 41 generated screenshots, 21 MB, excluded from git; plus other agents' `holiday-social` and `winter-exchange`). Before merging this branch, those three files must be stashed or discarded and the untracked `prototypes/lanyard` removed, or git will refuse. The branch holds the three files verbatim (`472b851`) plus these edits. None of that was done. The worktree `~/.gemini/antigravity/worktrees/bidzizi/prototype_first_user_journey` and port 43127 belong to other work and were not touched.
