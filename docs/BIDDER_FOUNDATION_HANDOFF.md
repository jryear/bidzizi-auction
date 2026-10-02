# Bidder foundation handoff

Status: prototype A promoted unchanged as the bidder design foundation. The next pass is requested, not started. Nothing here is a frozen contract.

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

## 2. Observed implementation (verified, 2026-10-02)

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

## 3. Requested next pass (not implemented; keep it simulated)

1. **Preserve** A's design language, page composition, onboarding, and bid interactions.
2. **Identity**: keep phone, then verification. Then add name, business, and Member ID under a Saturn Barter network context. Verification may stay simulated and must say so. A Member ID alone must not authorize access to a business.
3. **From B**: adapt the cleaner pill navigation, a watching or saved-lot interaction separate from My Bids, and a persistent BidZizi header on lot detail into A's language. B is `https://claude.ai/artifact/YLUL2gHi2DJ3Uh8snfntL5`. **It could not be inspected** during promotion: the docs connector denied access (not shared with that session, or not a doc), and no other tool could open it. Inspect B, or get it shared or screenshotted, before claiming to reproduce its behavior.
4. **Complete**: sponsor welcome and return access through Event, persistent bidder navigation, event information, additional-user and appearance settings, nonprofit donation access, and an explicitly confirmed private-maximum auto-bid prototype flow.
5. **Preserve**: browsing position and filter and search context, clear business and person attribution, bid confirmation, and pending and check-status recovery.

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

## 5. Later work (separate, not this pass)

- **First real contract**: one identified and authorized bidder, one open lot, a manual bid, database-authoritative standing, and an outbid outcome. Follow the `tasks/` and `verify.py` workflow in `AGENTS.md`. Real auto-bidding is a later contract.
- **Desktop staff prototype** (separate): Saturn staff prepare an event and sponsors, enter and organize lots internally, preview the actual bidder components against draft data, and publish the catalog. It should reuse A's components and fixtures. Do not build admin now, and do not prebuild a general multi-organization platform.

## 6. Run and verify

```bash
cd /Users/jryear/code/bidzizi-bidder-foundation-a
export PATH="$HOME/.nvm/versions/node/v24.4.1/bin:$PATH"   # repo needs Node 24
pnpm install --frozen-lockfile && pnpm typecheck
cd prototypes/lanyard && PORT=4322 node serve.mjs &          # then:
URL=http://127.0.0.1:4322/ node evidence/walk.mjs            # expect 42/42
URL=http://127.0.0.1:4322/ node evidence/webkit-smoke.mjs    # expect PASS
```

Stop only the server you started (by PID). Do not run `pkill -f "node serve.mjs"`: other agents run servers like it.

## 7. Not touched by promotion

The main checkout still holds uncommitted `README.md`, `AGENTS.md`, `docs/PRODUCT_SLICE_001_DISCOVERY.md`, and untracked `prototypes/` (the original `lanyard` including 41 generated screenshots, 21 MB, excluded from git; plus other agents' `holiday-social` and `winter-exchange`). Before merging this branch, those three files must be stashed or discarded and the untracked `prototypes/lanyard` removed, or git will refuse. The branch holds the three files verbatim (`472b851`) plus these edits. None of that was done. The worktree `~/.gemini/antigravity/worktrees/bidzizi/prototype_first_user_journey` and port 43127 belong to other work and were not touched.
