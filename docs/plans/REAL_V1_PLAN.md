# BidZizi Real V1: plan to onboard Saturn staff on a real event

## Context

BidZizi today is a connected, durable **synthetic** Saturn demo. The code shows it cannot be used for real work:

- Every sign-in path requires `bz_people.is_test = true` and a hard-coded alias list (`src/server/auth.ts` `login()`).
- The whole app returns "unauthenticated" unless `BIDZIZI_STAGING_TEST_AUTH` and staging host/env checks pass (`src/server/config.ts` `testMode()`). There is no production mode; `databaseConnectionURL()` refuses non-staging production.
- Staff and orgs can only come from seed SQL. There is no award step (`finalized: false` is hard-coded in `staff-operations.ts`). Pledges are locked to `pending_staff_settlement` by a CHECK in migration 018.
- The Studio (`public/staging-admin/studio.js`, about 719 lines of plain JS) is the bottleneck Zack named. Its one-window, one-immutable-roster model can't run a real event.

**Goal (what "landed" means):** one real Saturn staff member signs in with their own account on a production deployment. They create a real event, add items, manage multiple bidding windows, publish and later add items, and open QR entry. Real attendees join by scanning and bid on their phones, and can donate to Saturn's nonprofits. After close, staff confirm awards and mark items fulfilled and donations processed. This is all done without an engineer. It is then rehearsed end-to-end on production before the first real event.

## Decisions recorded from Zack (2026-10-12)

| Topic | Decision |
|---|---|
| First user | Saturn staff only, first. Bidders are whoever attends the real event. |
| Staff auth | One real Saturn staff account, email + password (scrypt hash), created by a provisioning script. No invite UI in V1. |
| Bidder admission | Anyone who scans the event QR or link may join and bid. Self-entered name and business; no verification in V1. |
| After close | Staff confirm awards per item (confirm leader, choose another bidder, or no award, with a reason). Winners see "You won" only after confirmation. Staff mark items fulfilled. |
| Money display | Drop "T$". Show plain `$`; everyone knows it's trade. Keep integer minor units internally. Model the settlement method per org (`manual_trade` now) so a payment processor can be connected later without rewriting. Do not build a processor now. |
| Bidding rules | Per-event, editable. Default is tiered: $25 below $500, $50 below $1,000, $100 below $2,500, then $250. Staff can edit the tiers or pick another mode (fixed increment). The per-item fixed override is kept. |
| Donations | Saturn's nonprofits (e.g. Red Cross), curated by staff. Manual amount entry, quick picks $25/$50/$100, $10,000 cap per pledge. Staff mark each pledge processed. The page must become simple. |
| Event flexibility | Multiple named bidding windows, add items after publish, edit and manage windows. Rename "lots" to "items" everywhere in the UI. |
| Studio | Needs a complete refresh, not more patches. |
| Schema (2026-10-12, later) | **Fresh production schema.** Production gets its own `migrations/` series from 001 with no `is_test`, alias list, synthetic denomination, legacy USD or one-window model. Staging (`staging.bidzizi.com`) stays frozen at its deployed revision as the demo reference and is not patched. `main` becomes the real product. We **port, not reinvent**: every engine guarantee (server time/acceptance, idempotency and original-request recovery, durable receipts, actor-private vs. business standing, integer minor units, immutable published terms) maps to the new schema, and the existing acceptance cases are rewritten as its contract. Design out the 016 cross-org lock limitation. **Gate:** a schema design doc reviewed by Zack + an independent reviewer before any T1 code. |

**Defaults I'm choosing (reversible; flag if wrong):**
- Window editing:
  - Before a window opens, staff may change its open and close times freely.
  - After it opens, its open time is frozen. Its close time may still change, but never to less than 5 minutes from now on the server clock.
  - Every change is a recorded revision, and bidders see the new time.
  - A closed window is frozen.
- Additive publication appends a new immutable catalog version. Previously published items, their terms and their bids are never altered. New items can go into any window that has not closed.
- Donation availability: from catalog publication until the last window closes, plus a staff on/off toggle.

## Architecture

- **Keep the durable engine.** That means PostgreSQL authority functions, receipts, idempotent requests, database-clock phases, actor-private history and shared business standing. Extend it with **additive migrations (020+)**. Never rewrite installed ones.
- **Real mode alongside test mode.** Add `BIDZIZI_APP_MODE=production`:
  - `config.ts` accepts a production database on a production origin, with Neon pooled endpoint and verified TLS still required.
  - Authentication gets a credential path for non-test people.
  - Existing `testMode()` staging behavior stays intact for the demo and acceptance suites.
  - Replace `is_test` gates with a mode check: production mode accepts only `is_test = false` and test mode only `is_test = true`. This means data never crosses between modes.
- **Separate production resources.** Use a new Neon database or project and a new Vercel project or production domain. Never reuse `bz_staging_e2e` or the staging alias.
- **Studio is rebuilt as React under `src/app/studio/`.** Use the same Next.js app and server modules as the bidder pages, replacing `public/staging-admin/*`, which stays in place until the new Studio is accepted. Follow the frontend-design workflow: an isolated prototype first, then Zack's visual decision, then connect it.
- **The bidder app keeps the selected Design A language.** It gets copy changes (`$`, "items"), the windows display, "You won", and the simplified donation page.

## Tranches

Each tranche gets a frozen contract in `tasks/*.toml` with acceptance and adversarial evidence, committed to base before implementation. Each is verified with `~/code/_kernel/verify.py` (RED on base, GREEN on candidate) against a disposable per-tree test database.

### T0 — Land the current UI v1 (prerequisite)
- Zack reviews the isolated preview of `3d70109` and gives visual acceptance (or doesn't). On acceptance, merge `ui/v1-skin` to `main`. Nothing is pushed or promoted without his go-ahead.

### T1 — Fresh production schema + ported engine (backend; blocks everything real)

> Superseded detail below: where T1/T2/T3 mention "migration 020/021/022" or "mode-aware versions of is_test checks", read instead: new schema series `migrations/prod/001…` designed from scratch (no is_test), covering T1–T3 tables. Step 1 is `docs/plans/REAL_V1_SCHEMA.md` (tables, authority rules, old-guarantee → new-mechanism map), reviewed before code.

- `src/server/config.ts`: production mode and its origin/database selection rules.
- `src/server/auth.ts`:
  - email + password login using `crypto.scrypt` (no new dependency), constant-time comparison, rate limit per email and IP, and generic error copy;
  - `identity()` and `sessionIsCurrent()` become mode-aware;
  - Secure, HttpOnly, SameSite=Lax cookie.
- Migration 020:
  - `bz_people.email` (unique, citext), a `bz_person_credentials` table, an org `settlement_mode` column, and a real denomination `SATURN_TRADE` alongside the synthetic one;
  - mode-aware versions of the `is_test` checks in the SQL functions, added as new functions so the installed ones are untouched.
- `scripts/provision-staff.mjs`: creates the Saturn org and one staff person with a grant and a password. It is run once by an engineer against production.
- Real attendee entry: a non-test version of `bz_demo_enroll` (`demo-entry.ts`, migration 009 pattern). It creates a real person and business with BID access when entry is enabled. The QR flow and the "Member ID not verified" honesty stay.
- Amount display: one formatter producing `$1,234` (cents only when non-zero), used by bidder, Studio, CSVs and display.

### T2 — Event model: windows, additive publication, bidding rules (backend)
- Migration 021:
  - `bz_event_windows` (named, open/close, revisioned) and an item → window assignment;
  - catalog versions (append-only snapshots referencing their prior version);
  - per-event `bid_rules` (mode `tiered | fixed`, editable tier table, default as recorded).
- `bz_catalog_phase()` and the manual-bid close checks read the **item's window** on the database clock. Window edits follow the defaults above. Leave `timing.ts` `TRADE_TIERS` as the seeded default only.
- Server API for window CRUD and edits, add-items publication, and rule editing (`src/app/api/admin/events/[id]/…`). Every call checks staff grants and request idempotency.

### T3 — After close: awards, fulfillment, donations (backend)
- Migration 022:
  - `bz_lot_awards` is an append-only decision log: confirm, reassign, none, with reason, actor and time. The current award is the latest decision.
  - Fulfillment state per awarded item: awarded → fulfilled.
  - `bz_donation_processing` is a separate append-only table (pending → processed), so the immutable pledge receipt and its CHECK stay untouched.
  - Donation settings: no window coupling, a $10,000 per-pledge cap, and staff-curated nonprofits.
- The results read model exposes `finalized` per item. CSV exports add award and fulfillment columns, and donations add a processed column.
- Bidder read: "You won" only from a confirmed award. Closed-leading still reads "Bidding closed — awaiting confirmation".

### T4 — Studio refresh (frontend-design workflow)
1. **Prototype phase.** Build an isolated prototype in `prototypes/studio-v2` with no `src/` imports and synthetic fixtures labeled as such. Desktop-first, with a usable phone view. Cover one continuous journey:
   - Events home → event setup;
   - **Items** (add, edit, duplicate, reorder, photos, assign to a window);
   - **Windows** (create, edit, see what is in each, live status);
   - **Bidding rules** (tier editor or fixed mode);
   - **Catalog** (publish, add more items later, see published versions);
   - **Entry/QR & Bidders**;
   - **Donations** (nonprofits, settings, pledges, mark processed);
   - **Results** (confirm awards, mark fulfilled, export).
   - Include the hard states: a window closing mid-edit, a publish conflict and an empty event.

   Present desktop and phone captures. **Zack picks the direction.** That record is the visual acceptance.
2. **Connected phase.** Implement the accepted prototype in `src/app/studio/` against the T1–T3 APIs. Reuse server modules (`staff.ts`, `staff-operations.ts`, `donation-pledges.ts`, `staff-assets.ts`). Keep `/admin` serving the old Studio until the new one is accepted, then redirect it.

### T5 — Bidder updates (contained, inside Design A)
- Rename "lots" to "items" in copy and use the `$` formatter.
- Show each item's window close time, and group items by window when there is more than one.
- "You won" state and My Bids award status.
- **Donation page rebuilt simple:** pick a nonprofit, tap $25/$50/$100 or type an amount, then review → confirm → "Donation recorded. Saturn staff will process it." No trade explanation paragraphs.
- Prototype the donation page in `prototypes/lanyard` style first, because Zack called it confusing; he accepts it before it is connected.

### T6 — Production pilot (external effects; each step needs Zack's explicit go)
1. Create the production Neon database and Vercel project or domain, and set env vars, all server-side.
2. Apply migrations 001–022 to the fresh production database. Production has no synthetic seed.
3. Run `provision-staff.mjs` for the one Saturn staff account.
4. Zack (as staff) runs a full rehearsal on production with two phones: set up the event, two windows, publish, add an item, bid and outbid, donate, close, confirm awards, mark fulfilled and processed, and export. Then delete or archive the rehearsal event, or keep it clearly named.
5. Hand the account to Saturn staff for the first real event.

## Sequencing

T1 → (T2 ∥ T3 backend) → T4 connected phase. The T4 prototype phase and the T5 donation prototype can start immediately in parallel, because they are isolated and need Zack's visual decision anyway. T6 comes last. Staff can't do useful work on production before T1 + T2 + T4, because a Studio without windows or additive publish doesn't meet the bar.

## Critical files

- `src/server/config.ts`, `auth.ts`, `demo-entry.ts`, `staff.ts`, `timing.ts`, `manual-bids.ts`, `staff-operations.ts`, `read-model.ts`, `donation-pledges.ts`
- `migrations/` (new 020–022; installed 001–019 are untouched)
- `src/app/events/[id]/*` (bidder), new `src/app/studio/*`, `src/app/api/admin/events/[id]/*`
- `tests/acceptance/<new-task>/run.mjs` + seeds; `tasks/<new-task>.toml`
- `prototypes/studio-v2/` (new), `prototypes/lanyard/` (donation study)

## Verification

- **Per tranche:** the kernel `verify.py` baseline is RED on base and GREEN on candidate, run against a disposable `bz_test_*` database. `pnpm typecheck` and `pnpm build` pass on Node 24.
- **Adversarial cases:**
  - a test person can't sign in under production mode, and the reverse;
  - wrong password or unknown email produces the same response and timing class;
  - a bid after its item's window closes on the database clock is refused;
  - a window edit can't make the close earlier than now + 5 min, and can't touch an opened window's open time;
  - additive publish leaves prior items and receipts byte-identical;
  - "You won" never appears without a confirmed award;
  - a pledge over $10,000 is refused;
  - processing a pledge leaves the original receipt unchanged.
- **Rendered checks:** phone (390) and desktop (1440) for the Studio journey and bidder journey, including back/reload, pending and failed states, and stale and closed states. Tests do not grant visual acceptance; Zack's review does.
- **Release:** deployed-revision readback on the production domain, then the T6 rehearsal on two real phones.

## Authority gates (not granted by approving this plan)

Approving the plan authorizes local implementation on branches or worktrees, commits there, and disposable test databases. Each of these still needs Zack's explicit go:
- merge or push to `main`;
- creating production Neon or Vercel resources and setting env vars;
- applying migrations to any shared or production database;
- deploying and binding a domain;
- provisioning the real staff account.

## Known risks

- The held migration 016 authorization-protocol limitation (an unrelated org can block on zero-row locks) is acceptable for Saturn-only. It must be resolved before a second organization.
- The Neon preview branch `br-plain-scene-arz0x256` expires Oct 17, but production doesn't depend on it.
- The Studio refresh is the largest piece and sits on the critical path. The prototype should start first.
