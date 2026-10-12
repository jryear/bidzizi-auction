# Real V1 production schema — design for review

Status: **draft for Zack + independent review.** No code or migration is written until this is accepted.
Plan: [REAL_V1_PLAN.md](REAL_V1_PLAN.md). Covers tables for T1 (identity, entry, bidding), T2 (windows, catalog versions, rules) and T3 (awards, fulfillment, donations).

## Ground rules

- **New series.** `migrations/prod/001_*.sql` onward, installed only on the new production database. The staging migrations (`migrations/001–019`) and `staging.bidzizi.com` are frozen as the demo reference and are never applied here.
- **No test population.** There is no `is_test`, `alias`, synthetic denomination or legacy USD path. Rehearsals happen on production as clearly named events, or on a disposable `bz_test_*` database.
- **Where logic lives.** Decisions run in TypeScript server transactions; invariants live in the database. Every rule that must never break is a constraint, a foreign key or a trigger, so a code bug can't violate it:
  - append-only tables revoke `UPDATE`/`DELETE` from the app role;
  - immutable snapshots are guarded by a trigger;
  - amounts are `CHECK`ed integers.
- **Two database roles.**
  - `bz_owner` runs migrations.
  - `bz_app` is the runtime role, with only the privileges listed per table.
  - The connection still requires the Neon pooled endpoint and verified TLS.
- **Time.** Every acceptance decision uses `clock_timestamp()` read **after** all locks are held. The browser clock is never used.
- **Money.** Amounts are `bigint` minor units (cents), always `> 0`. The display is plain `$1,234`, with cents only when non-zero. The unit lives on the event (`unit = 'trade_cent'`, scale 100), so it can change later without touching amounts.

## Tables

### Organizations and people

| Table | Key columns | Notes |
|---|---|---|
| `orgs` | `id`, `name`, `initials`, `settlement_mode` | `settlement_mode IN ('manual_trade')` for now. A future processor adds a value and a config table; no amount columns change. |
| `people` | `id`, `name`, `email citext UNIQUE NULL`, `active`, `created_at` | Staff have an email. Attendees created by QR entry have none. |
| `staff_credentials` | `person_id PK`, `password_hash`, `password_updated_at`, `failed_count`, `locked_until` | scrypt (N=2^15, r=8, p=1, 16-byte salt, 64-byte key), encoded `scrypt$N$r$p$salt$hash`. The app role can read it, and update only the counters. |
| `staff_grants` | `(person_id, org_id)`, `role IN ('owner','staff')`, `active` | V1 provisions one `owner`. |
| `sessions` | `token_hash PK`, `person_id`, `kind IN ('staff','attendee')`, `expires_at`, `revoked_at` | Only the sha256 of a 32-byte random token is stored. Staff sessions last 12h; attendee sessions last 30 days, the length of an event. |
| `login_attempts` | `(email_hash, ip_hash, at)` | Rate limit: 5 failures per email per 15 minutes, and 20 per IP. The table is append-only and pruned by age. |

### Businesses and attendees

| Table | Key columns | Notes |
|---|---|---|
| `businesses` | `id`, `org_id`, `name`, `claimed_member_id NULL`, `active` | Created by entry. **Matching names or Member IDs never merge businesses**: each entry creates its own business row. Staff may merge later; that is not V1. |
| `business_members` | `(person_id, business_id)`, `can_bid`, `active` | Shared business standing comes from this table. |
| `event_attendees` | `(person_id, event_id)`, `access IN ('VIEW','BID')`, `active`, `revision` | Replaces view grants plus bidder admissions. Open QR entry inserts `BID`. Staff can lower an attendee to VIEW or deactivate them from the roster. |
| `entry_slots` | as in 009: `id`, `event_id`, `token_hash`, `expires_at`, `consumed_at`, `payload_hash` … | Keeps the begin → enroll → acknowledge flow, with its idempotent retry and its 15-minute slot. |

### Events, items, windows

| Table | Key columns | Notes |
|---|---|---|
| `events` | `id`, `org_id`, `name`, `welcome`, `venue`, `cover_asset`, `timezone`, `unit`, `entry_enabled`, `donations_enabled`, `revision`, `updated_at/by` | Editable details. `revision` is used for optimistic concurrency: a save that sends a stale revision gets a 409 conflict. |
| `event_sponsors` | `id`, `event_id`, `position`, `name`, `logo_asset`, `alt` | |
| `bid_rules` | `event_id PK`, `mode IN ('tiered','fixed')`, `tiers jsonb`, `fixed_raise_minor`, `revision` | Default tiers: $25 below $500, $50 below $1,000, $100 below $2,500, then $250. A `CHECK` requires the tiers to be strictly ascending, every raise > 0, and the final `below` to be null. Edits apply only to items published **afterwards**: published items keep a snapshot. |
| `windows` | `id`, `event_id`, `name`, `opens_at`, `closes_at`, `revision`, `created_at` | `CHECK(opens_at < closes_at)`. Edits go through one function enforcing the edit rules below. |
| `window_revisions` | `(window_id, revision)`, `opens_at`, `closes_at`, `changed_by`, `changed_at`, `reason` | Append-only history of every change. |
| `items` | `id`, `event_id`, `position`, `title`, `short`, `description`, `category`, `image_asset`, `alt`, `opening_minor`, `fixed_raise_minor NULL`, `includes jsonb`, `fine_print`, `window_id NULL`, `revision` | The working draft. Editable until the item is published; after that its row is locked by a trigger (`published_at IS NOT NULL` → no update). |
| `assets` | as in 016: normalized webp, size and mime checks, `event_id`, `uploaded_by` | Ported as-is, minus the global gate. |

**Window edit rules** (enforced in a `windows` `BEFORE UPDATE` trigger using `clock_timestamp()`):

- Before `opens_at` passes, either time may change, as long as `opens_at < closes_at`.
- After it opens, `opens_at` is frozen. `closes_at` may change only to a time **≥ now + 5 minutes**.
- After `closes_at` passes, the window is frozen.
- Every change writes a `window_revisions` row in the same transaction.

### Publication (append-only)

| Table | Key columns | Notes |
|---|---|---|
| `catalog_versions` | `id`, `event_id`, `version` (1, 2, …), `published_by`, `published_at`, `event_snapshot jsonb` | `UNIQUE(event_id, version)`. Version 1 is the first publish; each "add items" publish adds the next version. |
| `published_items` | `item_id PK`, `event_id`, `catalog_version_id`, `window_id`, `position`, `snapshot jsonb`, `rules_snapshot jsonb`, `opening_minor` | One row per item, written exactly once. The snapshot holds the bidder-visible terms; `rules_snapshot` holds that item's raise logic frozen at publish. **Immutable** (trigger + revoked UPDATE/DELETE). |

Publish rules (one transaction):
1. Every item is complete (title, opening amount, a window assigned, alt text if it has an image).
2. Its window has not closed.
3. The item has never been published.
4. The new version's items plus all prior versions' items keep unique positions.

Earlier versions and their bids are never touched.

**Item phase** = `scheduled | open | closed`. It is derived from its window's **current** `opens_at`/`closes_at` against `clock_timestamp()`; there is no stored phase. The event phase for display is a rollup: scheduled until any window opens, open while any window is open, closed when all are closed.

### Bidding (ported engine)

| Table | Key columns | Notes |
|---|---|---|
| `standings` | `item_id PK → published_items`, `current_minor NULL`, `leading_business_id NULL`, `accepted_bid_id NULL`, `accepted_count`, `version`, `updated_at` | The same consistency `CHECK` as today: either no bids and all fields null, or bids with all fields set and `version = accepted_count`. |
| `bids` | `id`, `item_id`, `actor_id`, `business_id`, `request_id`, `amount_minor`, `standing_version`, `decided_at` | Accepted bids only. `UNIQUE(actor_id, request_id)`, `UNIQUE(item_id, standing_version)`. Append-only. |
| `bid_receipts` | `(actor_id, request_id) PK`, `payload_hash`, `receipt jsonb`, `http_status IN (201,409)` | Every decision, accepted or rejected. Append-only. |
| `watches` | `(actor_id, item_id)`, `watched_at` | Personal. |
| `requests` | `(actor_id, operation, request_id)`, `payload_hash`, `response` | Generic idempotency for staff and attendee mutations. |

**The bid decision** follows today's `placeTradeBid`, in the same order:
1. Authority gate (see below).
2. Advisory lock on `actor/request_id`.
3. A prior receipt with the same payload replays the original decision; a different payload returns 409 `IDEMPOTENCY_CONFLICT`.
4. Lock the standing row `FOR UPDATE`, then recheck authority, then read the clock.
5. Phase from the item's window, then the reason: `NOT_OPEN | CLOSED | AMOUNT_LIMIT | UNSUPPORTED_SELF_RAISE | BELOW_MINIMUM`.
6. Write the bid and standing, then the receipt.

The minimum next bid comes from `rules_snapshot`: a per-item fixed raise wins; otherwise the tier for the current amount applies.

### After close

| Table | Key columns | Notes |
|---|---|---|
| `award_decisions` | `id`, `item_id`, `decision IN ('confirm','reassign','none')`, `business_id NULL`, `bid_id NULL`, `reason`, `decided_by`, `decided_at` | Append-only. The current award is the latest row per item. Allowed only when the item's phase is `closed` (checked on the database clock). `confirm` must reference the standing's accepted bid. `reassign` must reference another accepted bid on the item, with a required reason. `none` requires a reason. |
| `fulfillment_events` | `id`, `item_id`, `state IN ('fulfilled','reopened')`, `by`, `at`, `note` | Append-only. Allowed only while a current award exists. |
| `nonprofits` | `id`, `org_id`, `name`, `description`, `logo_asset`, `active`, `revision` | **Org-level** ("Saturn's nonprofits"), curated by staff. |
| `event_nonprofits` | `(event_id, nonprofit_id)`, `active` | The nonprofits shown at this event. |
| `donation_pledges` | `id`, `actor_id`, `request_id`, `event_id`, `business_id`, `nonprofit_id`, `nonprofit_snapshot jsonb`, `amount_minor CHECK(amount_minor BETWEEN 1 AND 1000000)`, `receipt`, `recorded_at` | $10,000 cap per pledge. Append-only; the receipt never changes. Allowed while `donations_enabled` and the event isn't fully closed. |
| `donation_processing` | `id`, `pledge_id`, `state IN ('processed','reopened')`, `by`, `at`, `note` | Append-only. The current state is the latest row, or `pending` when there is none. |

Bidder rule: "You won" shows only when the current award decision is `confirm` or `reassign` naming one of the actor's businesses. A closed leader with no decision reads "Bidding closed — awaiting confirmation".

## Authority and revocation

Every attendee or staff decision first takes `pg_advisory_xact_lock_shared(org_gate(org_id))`. It then reads its authority rows `FOR SHARE`:
- session;
- person;
- `staff_grants`, or the attendee path: `event_attendees`, `business_members` and `businesses`.

Every authority change (logout, revoke session, deactivate person, change a grant or attendee access) takes `pg_advisory_xact_lock(org_gate(org_id))` exclusively, **before** it updates anything.

- **Guarantee kept from 016:**
  - A queued revocation gets priority: PostgreSQL's lock queue makes new shared requests wait behind a waiting exclusive request.
  - Once the revocation commits, no later decision can use the revoked authority.
  - A decision already holding the shared gate finishes first.
- **What changes from 016:** the gate is keyed **per organization**, not global, so one organization's staff changes never stall another organization. This designs out the held 016 limitation.
- **Raw SQL is covered too.** A `BEFORE UPDATE OR DELETE … FOR EACH ROW` trigger on each authority table checks `pg_locks` to confirm the current backend holds that row's org gate exclusively, and raises otherwise. An operator's manual `UPDATE` therefore fails loudly instead of slipping past the queue. Sessions map to an org through the person's grants or attendance; logout of an attendee session takes the gate of the session's event org. **Review point:** confirm the trigger approach versus documenting "authority changes only through the app".

## Guarantee map (old → new)

| Guarantee in today's engine | Where it lived | New mechanism |
|---|---|---|
| Server decides acceptance and time | `clock()` after locks, `bz_catalog_phase` | Same order. Phase comes from the item's window. |
| Idempotent bid and original-request recovery | `bz_bid_receipts`, advisory `actor/request` lock, payload hash | Same tables and order, renamed. |
| Accepted only after a durable write | receipt inserted in the same transaction | Same. |
| Standing consistency | `bz_lot_standing` CHECK, `UNIQUE(release,lot,standing_version)` | Same CHECK, keyed by `item_id`. |
| No self-raise by the leading business | reason `UNSUPPORTED_SELF_RAISE` | Same. |
| Actor-private history vs. shared business standing | receipts keyed by actor; standing by business | Same. My Bids reads only the actor's own receipts. |
| Published terms immutable | single approval snapshot | `published_items` is immutable; rules are snapshotted per item. |
| Prior bids and receipts preserved | — | `catalog_versions` is append-only. Earlier versions are never rewritten. |
| Revocation priority | global 016 gate | Per-org gate plus guard trigger. |
| Integer money, cap | `CHECK amount ≤ 1e9`, `Number.isSafeInteger` | Same. Bid cap 1e9 minor; donation cap 1e6 minor. |
| Entry idempotent and expiring | 009 slots | Ported as-is. |
| Credentials never in client/URL/log | — | HttpOnly Secure cookie, hashed token, generic auth errors, no email enumeration. |

## API shape

Bidder endpoints keep today's response shapes where the meaning is unchanged (`standing`, `receipt`, the reason codes), so the Design A bidder UI ports with minimal change. There are three intentional differences:
- `phase` is per item;
- `currency` becomes `unit`;
- there is a new `award` field.

Staff endpoints are new and resource-shaped (`/api/studio/events/:id/items`, `/windows`, `/rules`, `/catalog/versions`, `/attendees`, `/results`, `/donations`), designed for the new Studio.

## Open review points

1. Is the per-org gate plus `pg_locks` guard trigger acceptable as the revocation design (the alternative is "app-only authority changes")?
2. Attendee session length of 30 days is proposed. Is a shorter length preferable?
3. `reassign` lets staff award an item to a lower accepted bid (e.g. the winner withdrew). Should it be limited to the next-highest bid?
4. Should donations stay open after bidding closes (e.g. until the event day ends)? The current proposal closes them with the last window.
