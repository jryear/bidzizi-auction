# Real V1: advanced design pass (brief for a fresh agent)

Written 2026-10-12 at the end of the session that built Real V1. Read this, then `AGENTS.md` (its "Real V1 operating mode" section overrides the older process rules) and `docs/plans/REAL_V1_PRODUCT.md`.

## Where things stand

The worktree is `~/orca/workspaces/integration/real-v1-t1`, on branch `real-v1/t1-foundation`. It works end to end locally and is **not deployed**.

| Layer | State | Where |
|---|---|---|
| Database | Fresh production schema | `migrations/prod/001_core.sql`, `002_theme.sql`, applied by `scripts/prod-migrate.mjs` |
| Backend | Done and tested. Treat as stable; change only if the design truly needs it. | `src/server/v1/*` behind one router, `src/app/api/v1/[...path]/route.ts` |
| Bid engine guarantees | Request-id idempotency, standing row lock, server clock, receipts, increments (item override, then fixed, then tiers) | `src/server/v1/engine.ts` |
| Tests | 29 HTTP journey checks: duplicate taps, simultaneous bids, lost responses, close, winners, rejoin, exports, duplicate | `tests/v1/journey.mjs` |
| Participant app | Works, but **too stripped down** (see feedback) | `src/app/join`, `src/app/e/[code]/participant.tsx` |
| Host Studio | Template gallery, edit-on-canvas, Set up/Live/Results modes. Works, but rough. | `src/app/studio/*`. The classic workspace at `src/app/host/[id]/workspace.tsx` is a fallback and holds reusable panels. |
| Styles | One stylesheet | `src/app/globals.css` |
| Screenshot scripts | Seed a realistic event and capture phone and desktop shots | `tests/v1/shots.mjs`, `tests/v1/studio-shots.mjs` |

### Run it locally
1. Start Postgres 18 (`/opt/homebrew/opt/postgresql@18/bin`). Use any loopback port other than 5432, and a database named `bz_test_*`.
2. Point at it: `export BIDZIZI_DATABASE_URL=postgres://bz@127.0.0.1:55433/bz_test_v1`.
3. Migrate: `pnpm db:migrate`.
4. Create a local host account: `BIDZIZI_STAFF_PASSWORD=... pnpm staff:provision --org saturn --org-name Saturn --email host@example.com --name "Test Host"`.
5. Start the app: `BIDZIZI_APP_MODE=local BIDZIZI_DATABASE_URL=... npx next dev -p 3410 -H 127.0.0.1`.
6. Run the tests: `HOST_EMAIL=... HOST_PASSWORD=... node tests/v1/journey.mjs`.

At handoff, a dev server (port 3410) and a test Postgres (port 55433, data dir in `.bzpg-dir`) may still be running. Check, and either reuse them or stop them.

## Product model (decided by Zack; don't relitigate)

- **Kahoot / jackbox.tv.** Staff host an event; attendees join by QR or code with a display name and a business name. The business name is just a label: no verification or approval.
- **Attendees:** join → browse → bid → see leading/outbid → donate (if enabled) → see results and winner instructions.
- **Host:** create (from a template or a past event) → add items → set the schedule → preview → share the code → run it live → confirm winners, fulfil, take notes, export.
- **Settled rules:**
  - plain `$` (amounts are trade, but don't label them "T$");
  - "items", not "lots";
  - default tiers: $25 below $500, $50 below $1,000, $100 below $2,500, then $250;
  - donations: $25/$50/$100 or any amount, $10,000 cap;
  - staff confirm winners.

## Zack's feedback on the first pass (the reason for this pass)

1. **The participant app went too simple.** "Hardly any controls, no navigation, stripped some of the sex-appeal — My bids, event page, etc." The previous build (screenshots below) had more richness, and that richness was good. Bring it back without the old clutter. Specifically restore:
   - **Item cards:** full-bleed photo cards with an item number tab, a bookmark/watch button and a sponsor or provider chip.
   - **Browsing controls:** category eyebrow; search; category chips; sort (item order, lowest price, ending soon); a large/compact view toggle.
   - **Tab bar:** icons on every tab.
   - **My bids:** ticket-style cards with a perforated stub, grouped Outbid / Leading / Won / Closed, a color edge per state, "Bid again", and expandable history.
   - **Event page:** a real page with the photo hero, a big serif title, when and where, the welcome, sponsors, donations and how winning works.
   - **Item page:** a richer layout. Show the bid history the participant can see (amounts and times, with the bidder name or business only where appropriate), time left, and watch.

   Also add a clear way back, a way to switch between sections, and a header that doesn't feel empty.
2. **The host home is built for dozens of events.** A real host runs about one a quarter. The home should centre on **the current or next event**: big, with its status and a primary action. Past events become a small archive that doubles as "start from this". Templates belong in the "new event" flow, not as the main stage.
3. **Rough edges to fix:**
   - Template names get " auction" stripped awkwardly.
   - The checklist step "Check the schedule" is always ticked.
   - The empty cover and photo placeholders look unfinished.
   - The top bar is crowded on phones, and "Duplicate" sits in prime space.
   - Tiles with no photo look bare.
   - Draft preview only works when staff are signed in on that device. Say so, or show a QR for a preview link.
   - Test events pile up in the list. Add delete/archive for draft events with no participants.
4. **What Zack liked:** "much more user-friendly". Keep the template → canvas → checklist → Set up/Live/Results structure, edit-on-the-phone, autosave, the "Advanced" folding, themes and plain copy.

## Reference: the previous build's look (quality bar)

Screenshots are in `~/.hermes/projects/bidzizi-20261008/ui-v1-skin-handoff/screenshots/`; start with `after-copy-9794ffd/` and `candidate-refinement-*/`. The previous source is in git at tag `staging-demo-final`:
- `public/staging-bidder-preview/styles.css` and `src/views.js` (the bidder UI);
- `public/staging-catalog/*` (the connected catalog, bidding, donations);
- `public/staging-admin/studio.css` (the Studio look).

The selected design language is Design A, `prototypes/lanyard/DESIGN_NOTES.md`:
- the pass/badge header;
- cobalt means an action, marigold means "yours";
- one status vocabulary;
- one bid sheet;
- "truth before reassurance";
- Fraunces + Instrument Sans with tabular money.

Port and adapt the real markup and CSS from these. Don't approximate it from tokens; that was this session's mistake.

## How to work

- Follow `~/.codex/skills/frontend-design/SKILL.md` for the visual work. Build in the real app on a new branch off `real-v1/t1-foundation`. A clickable connected build is the prototype. Keep the backend contract unless a screen genuinely needs more data; if so, extend the API and add journey tests.
- After each major screen, capture 390 px phone and 1440 px desktop screenshots and compare them **side by side** with the previous build's equivalents. Don't show Zack anything that looks worse than before.
- Include the hard states: outbid, closed, won, unconfirmed bid, offline, empty event, long titles, no photos.
- Keep `node tests/v1/journey.mjs` green, plus `npx tsc --noEmit` and `next build`.
- Visual acceptance is Zack's. Tests don't grant it.
- **Needs Zack's explicit go:** pushing, merging to `main`, deploying, creating Neon/Vercel resources, and creating the real staff account. Local commits on your branch are fine.
