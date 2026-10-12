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
- Donation availability: an explicit donation deadline (defaults to the final window close; staff may extend it) plus a staff on/off toggle. Receipts stay recoverable after the deadline. (Revised after review.)

## Architecture

- **Port the durable engine onto a fresh production schema.** Every guarantee is carried over: server time and acceptance, idempotency and original-request recovery, atomic receipts, actor-private history vs. shared business standing, integer amounts, immutable published terms. The authoritative design is [REAL_V1_SCHEMA.md](REAL_V1_SCHEMA.md): its tables, lock order, runtime privileges and guarantee map. The new series is `migrations/prod/001…`. The staging series `migrations/001–019` is never edited or applied to production.
- **Production mode in the app.** `BIDZIZI_APP_MODE=production` selects the production database (Neon pooled endpoint, verified TLS) and the real-auth code path. The frozen staging deployment keeps its own revision, and `main` no longer carries test-auth paths.
- **Separate production resources.** Use a new Neon database or project and a new Vercel project or production domain. Never reuse `bz_staging_e2e` or the staging alias.
- **Studio is rebuilt as React under `src/app/studio/`.** Use the same Next.js app and server modules as the bidder pages, replacing `public/staging-admin/*`, which stays in place until the new Studio is accepted. Follow the frontend-design workflow: an isolated prototype first, then Zack's visual decision, then connect it.
- **The bidder app keeps the selected Design A language.** It gets copy changes (`$`, "items"), the windows display, "You won", and the simplified donation page.

## Tranches

Each tranche gets a frozen contract in `tasks/*.toml` with acceptance and adversarial evidence, committed to base before implementation. Each is verified with `~/code/_kernel/verify.py` (RED on base, GREEN on candidate) against a disposable per-tree test database.

### T0 — Land the current UI v1 (prerequisite)
- Zack reviews the isolated preview of `3d70109` and gives visual acceptance (or doesn't). On acceptance, merge `ui/v1-skin` to `main`. Nothing is pushed or promoted without his go-ahead.

### T1 — Fresh production schema + identity, entry and bidding (backend; blocks everything real)
- The schema design gate: [REAL_V1_SCHEMA.md](REAL_V1_SCHEMA.md), accepted by Zack and re-reviewed with no blocking findings, before any code.
- `migrations/prod/` covering organizations, people, credentials, sessions, attendees, entry and re-entry, assets, events, items, windows, rules, catalog versions, standings, bids, receipts, watches and requests. This includes the definer functions, guards and runtime privileges.
- Server modules:
  - `config.ts` production mode;
  - `auth.ts`, with login through `bz_staff_login_begin/finish`, scrypt in Node and a generic error;
  - entry and re-entry;
  - the bid decision as specified (lock order, recheck expiry after waits, replay).
- `scripts/provision-staff.mjs` creates the Saturn organization and its one owner. An engineer runs it once.
- One amount formatter, producing `$1,234`, used everywhere.

### T2 — Windows, additive publication and bidding rules (backend)
- Window create and edit (`bz_window_edit`, edit rules, revisions); additive publication (event lock, append-only versions, standings created at publication); per-event `bid_rules` with `bz_valid_rules`.
- Staff API under `/api/studio/events/:id/…` with request idempotency.

### T3 — After close: awards, fulfillment and donations (backend)
- `award_decisions`, plus `fulfillment_events` bound to the award decision. All transitions use expected-current and sequence numbers.
- Organization-level nonprofits with revisions; `bz_donation_member` ported from migration 018; the explicit donation deadline; $10,000 cap; `donation_processing`.
- Results and CSV exports with award, fulfillment and processed columns. "You won" appears only from a current confirm or reassign decision.

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
2. Apply `migrations/prod/*` to the fresh production database. Production has no synthetic seed.
3. Run `provision-staff.mjs` for the one Saturn staff account.
4. Zack (as staff) runs a full rehearsal on production with two phones: set up the event, two windows, publish, add an item, bid and outbid, donate, close, confirm awards, mark fulfilled and processed, and export. Then delete or archive the rehearsal event, or keep it clearly named.
5. Hand the account to Saturn staff for the first real event.

## Sequencing

T1 → (T2 ∥ T3 backend) → T4 connected phase. The T4 prototype phase and the T5 donation prototype can start immediately in parallel, because they are isolated and need Zack's visual decision anyway. T6 comes last. Staff can't do useful work on production before T1 + T2 + T4, because a Studio without windows or additive publish doesn't meet the bar.

## Critical files

- `src/server/config.ts`, `auth.ts`, `demo-entry.ts`, `staff.ts`, `timing.ts`, `manual-bids.ts`, `staff-operations.ts`, `read-model.ts`, `donation-pledges.ts`
- `migrations/prod/` (new series; the staging `migrations/001–019` are untouched)
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

- Migration 016's global-gate limitation doesn't apply to production: the fresh schema uses per-organization gates and organization-scoped people (REAL_V1_SCHEMA.md, R1). It remains a property of the frozen staging demo only.
- The Neon preview branch `br-plain-scene-arz0x256` expires Oct 17, but production doesn't depend on it.
- The Studio refresh is the largest piece and sits on the critical path. The prototype should start first.
