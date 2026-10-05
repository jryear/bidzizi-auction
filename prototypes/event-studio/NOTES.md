# Event Studio prototype: Session 1, checklist-led

Status: exploration. Browser-local simulation with fictional data. Not connected to the app, the database, staging, or deployment. Nothing here is a frozen contract, and **no one has judged it visually yet**: passing checks do not grant visual acceptance.

## Run it

```bash
export PATH="$HOME/.nvm/versions/node/v24.4.1/bin:$PATH"          # repo needs Node 24
cd prototypes/event-studio && PORT=4351 node serve.mjs             # http://127.0.0.1:4351 (loopback only)
URL=http://127.0.0.1:4351/ node evidence/walk.mjs                  # 142 checks, Chromium, writes evidence/shots (gitignored)
URL=http://127.0.0.1:4351/ node evidence/webkit-smoke.mjs          # 7 checks, WebKit
node evidence/qr-check.mjs                                         # 54 matrices vs the `qrcode` package (needs REF=… path to it)
```

Static HTML/CSS/ES modules, no build, no dependencies at runtime. The tests import `@playwright/test` from the repo's `node_modules`. Stop only the server you started (by PID); other agents run similar servers.

## Where this came from (verified 2026-10-05)

| Item | State |
| --- | --- |
| This branch | `admin-event-studio-1`, checked out in `/Users/jryear/code/bidzizi`, from `main` `b6beff9`. `main` does **not** contain A or the staging work |
| Prototype A (the design source) | `bidder-foundation-a` `99156cc`, `prototypes/lanyard`. `lanyard.css` here is a byte-identical copy (sha256 `8d28cd33…96b1`); fonts and the six photos are copied from A |
| Staging (`staging-e2e` `916eaa2`) | Read from its docs: one shared window per approved catalog, catalog hidden until it opens, no multiple windows, no rescheduling |
| `admin-journey` `99156cc` | Only its handoff document and `git status` were read (earlier single-window admin prototype, uncommitted). Its prototype code was not read |
| Competing prototype | Not inspected |
| Pre-existing uncommitted files in this checkout | `AGENTS.md`, `README.md`, `docs/PRODUCT_SLICE_001_DISCOVERY.md` and untracked `prototypes/{holiday-social,lanyard,winter-exchange}`. Left untouched; only `prototypes/event-studio/` was added |

## What it is

A desktop staff workspace in A's language (Fraunces + Instrument Sans, ink and paper, cobalt = an action, marigold = "yours", one status vocabulary, ticket-stub rows with perforations, dashed rules, A's pass bar and pill nav as the ink sidebar). The **mobile bidder preview** is an iframe that loads A's own stylesheet untouched and renders A's markup (entry, lot cards, category chips, lot detail with the stub, Event tab) from the draft.

**Checklist-led, not a wizard.** Every page shows a persistent top bar (segmented progress, `n of 6`, the next useful action) and a persistent sidebar with a status mark per section (done / needs attention with a count / not started). The Overview holds the checklist in three tiers (needed, recommended, optional). Each step has a plain reason, its issues with one-click fixes where one exists (assign all unassigned lots, confirm the increment), and an Open/Fix button. Order is a suggestion; nothing is locked.

**Red means broken, not unfinished.** A new event shows nothing red. Red is for things that are wrong (end before start, a window that closes before it opens, lots left outside every window once windows exist). Missing things are neutral; suggestions are amber.

| Brief | Where |
| --- | --- |
| Org owns events; select or create | `#/events`, event switcher, Create event sheet |
| Heading image, welcome, physical date/time (distinct from bidding) | Event page; timeline on Bidding windows shows both |
| Categories, duplication, windows, assignment | Lots (inline selects, bulk bar, Categories sheet, Duplicate with Undo); Bidding windows (Assign lots sheet) |
| Unassigned easy to find | Red filter chip, sidebar tag, alert band, first card on Windows, bidder-preview note |
| Increment example + next eligible bid | Bid increments: $200 + $25 → $175 style ladder you can edit |
| Progress and actionable readiness | Top bar, Overview, Readiness (needed vs suggestions, fixes inline) |
| Donations | Own page; link-out only, no money moves |
| Attendee access | One shared event-link QR (real, scannable), Print sign, Present on iPad; says it is not a ticket or credential |
| Displays | Draft settings, live 16:9 preview, Draft / On screens now, Apply (simulated, can be forced to fail) |
| Notifications | SMS readiness, simulated; wording preview; test messages logged as "Simulated · not sent" |
| Sponsors | Inside the Event page, optional |

## Provisional assumptions to review (marked `S1`–`S12` in the UI, listed in the Review notes rail)

- **S1 One bidding window per lot is provisional.** Staff assign a lot to exactly one window; picking it for another window moves it. Several windows per lot, relisting, and moving a lot after approval are **not designed and not simulated**.
- **S2 How later windows affect visibility is open.** Staging hides the catalog until bidding opens. The preview offers two labeled possibilities (catalog opens with the first window / each lot appears when its window opens). Neither is a rule.
- S3 There is no approval. "Mark as reviewed" is a local note that goes stale when you edit afterwards; what can change after approval is undecided.
- S4 Next eligible bid = current top bid + increment, or the opening bid when there are none. One fixed increment per event. Bidding above the minimum, tiers, per-lot increments: undecided.
- S5 USD whole dollars, integer cents inside. S6 Categories are per-event, one per lot. S7 Shared link format, rotation and revocation undecided; the domain is fictional (`bidzizi.example`). S8 What public screens show (bids, names) undecided; none shown. S9 SMS provider, registration, templates, opt-out and whether SMS is required to open: undecided. S10 Donations: whether the platform ever handles them is undecided. S11 Sponsor tiers and logos not designed. S12 No staff sign-in, roles, or concurrent editing.

## Decisions I made without asking (each reversible)

Fixed prototype clock Mon Oct 5, 2026 9:00 AM Pacific. Six required steps (date/time, welcome, lots, windows, assignment, increment); heading image, categories, preview, SMS are suggestions. Details autosave locally; sheets (lot, window, assign, categories) keep edits until Save and ask before discarding. Sheets are history entries, so Back and Escape close them. Undo is one level and in memory. Lot numbers are sequential; reordering is not offered. The preview shows Lots and Event only (no Watching or My bids). The phone's own navigation stays in memory so it never pollutes the studio's Back history.

## Verification (2026-10-05)

| Check | Result |
| --- | --- |
| `evidence/walk.mjs`, Chromium, 1440×900 and 1280×800 | **142 of 142** |
| `evidence/webkit-smoke.mjs`, WebKit | 7 of 7 |
| `evidence/qr-check.mjs` | 54 of 54 matrices identical to the `qrcode` package, including its automatic mask choice |
| Print stylesheet rendered to PDF (ad hoc, not in the walker; see `screenshots/23-print-output-as-pdf.png`) | 1 page, only the sign, no app chrome |

The walker covers: the primary journey (create → details/welcome → add, duplicate, categorize lots → two windows → assign → phone preview → increment → readiness → mark reviewed); validation on every form; reload persistence; sheets under Escape, Back, dirty Back, Keep editing, Discard, and reload with a sheet open; double-clicks on Create, Duplicate and Confirm; draft-versus-applied including a forced failed apply, retry, and reload mid-apply; switching between two events without mixing lots, windows, categories, preview, or checklist, and refusing a sheet that names another event's lot; corrupt storage; no page errors; **no network request to anything but localhost**; no horizontal overflow or content under the docked preview at 1440 and 1280 across all ten sections.

Defects found by these runs and fixed: lot rows slid under the docked preview; the preview drawer covered its own toggle; a dirty sheet lost typed text when it asked to discard; "Try again" after a failed apply did nothing; the SMS opt-out check did not update while typing; a new event showed red before anything was wrong; select-all sat inside `aria-hidden`.

**Not tested:** a real iPad or Safari on hardware; VoiceOver or any screen reader; touch; a physical printer (PDF only); viewports under 1100px; a full keyboard audit (only the switcher, sheets and focus return were checked); two tabs editing at once (a `storage` listener exists, unexercised); the rotation preview beyond toggling it; contrast measurement. Screenshots in `evidence/screenshots/` were inspected by eye; they are not pixel-compared with A.

## Known limitations

- Photos and lot copy come from A's fixtures; their licensing is unverified. Staff cannot upload.
- The preview cannot bid; its button says so. Bids, watching and My bids are prototype A's job.
- Data lives in `localStorage` key `eventstudio1.v1`; clearing site data loses it. Reset is in Review notes.
- At 1200–1500px with the preview docked, the top bar shortens labels; below 1200px the preview becomes an overlay drawer.
