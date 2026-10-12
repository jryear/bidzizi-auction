# Real V1 production schema — design for review (revision 2)

**Status: NOT APPROVED.**
- Revision 1 (`10c36fa`): the independent Codex review ([REAL_V1_SCHEMA_REVIEW.md](REAL_V1_SCHEMA_REVIEW.md)) found **changes required** (R1–R8). An earlier line in revision 1 claimed "accepted after revision"; that overstated the reviewer's position and is withdrawn.
- Revision 2 (this document) answers each finding; see [§ Finding resolutions](#finding-resolutions).
- The design gate passes only after Zack accepts it and a re-review finds no remaining blocking finding.
- No code, migration or database activity happens before then.

Plan: [REAL_V1_PLAN.md](REAL_V1_PLAN.md). This covers T1 (identity, entry, bidding), T2 (windows, catalog versions, rules) and T3 (awards, fulfillment, donations).

## Ground rules

- **New series.** `migrations/prod/001_*.sql` onward, installed only on the new production database. The staging migrations (`migrations/001–019`) and `staging.bidzizi.com` stay frozen as the demo reference and are never applied here.
- **No test population.** There is no `is_test`, `alias`, synthetic denomination or legacy USD path. Rehearsals happen as clearly named production events, or on a disposable `bz_test_*` database.
- **Every person belongs to exactly one organization.** This includes staff. It is the key simplification (R1). If the same human works for two organizations, they have two person rows and sign in to each separately. No row is shared across organizations, so **no transaction ever needs more than one organization's gate.**
- **Two database roles.**
  - `bz_owner` runs migrations and owns every object.
  - `bz_app` is the runtime role. It gets exactly the privileges in [§ Runtime privileges](#runtime-privileges) and nothing from PUBLIC or default grants.
  - The connection still requires the Neon pooled endpoint and verified TLS.
- **Time.** Every decision reads `clock_timestamp()` **after** all of its locks are held. The browser clock is never used.
- **Money.**
  - Amounts are `bigint` minor units (cents), always `> 0`.
  - The display is plain `$1,234`, with cents only when non-zero.
  - `events.unit = 'trade_cent'` (scale 100) is **frozen once the event's first catalog version exists**, so no stored amount is ever reinterpreted.

## Tables

All `id` columns are `uuid`. "(org)" marks a denormalized `org_id` that is kept consistent by composite foreign keys, listed in [§ Relational invariants](#relational-invariants).

### Organizations and people

| Table | Key columns | Notes |
|---|---|---|
| `orgs` | `id`, `slug UNIQUE`, `name`, `initials`, `settlement_mode` | `settlement_mode IN ('manual_trade')`. A future payment processor adds a value and its own config table; amount columns never change. |
| `people` | `id`, `org_id`, `name`, `email citext NULL`, `active`, `created_at` | `UNIQUE(org_id, email)`. Staff have an email. Attendees created by QR entry have none. `id` and `org_id` are immutable (trigger). |
| `staff_credentials` | `person_id PK`, `org_id`, `password_hash`, `password_updated_at`, `failed_count`, `locked_until` | scrypt (N=2^15, r=8, p=1, 16-byte salt, 64-byte key), encoded `scrypt$N$r$p$salt$hash`. Access only through functions. |
| `staff_grants` | `(person_id, org_id) PK`, `role IN ('owner','staff')`, `active`, `revision` | V1 provisions one `owner`. |
| `sessions` | `token_hash PK`, `person_id`, `org_id`, `kind IN ('staff','attendee')`, `event_id NULL`, `created_at`, `expires_at`, `revoked_at` | Stores only the sha256 of a 32-byte random token; the raw token is never logged. `CHECK((kind='staff' AND event_id IS NULL) OR (kind='attendee' AND event_id IS NOT NULL))`. Staff sessions last 12h. Attendee sessions last a fixed 30 days with no sliding renewal. A session never extends bidding or donation availability. Immutable except `revoked_at`. |
| `login_attempts` | `id`, `org_id`, `email_hash`, `ip_hash`, `at`, `succeeded` | Rate limit: 5 failures per email per 15 minutes, 20 per IP. Append-only and pruned by age. |

**Staff login.** V1 has one organization, and the deployment is configured with its slug. Later organizations sign in through a slug-scoped path. The login flow:
1. The server calls `bz_staff_login_begin(org, email_hash)`. It returns the stored hash, or a fixed dummy hash for an unknown email, so timing and response look the same either way.
2. The server verifies the password with scrypt in Node.
3. The server calls `bz_staff_login_finish(...)`, which records the attempt, updates the counters and, on success, creates the session.

Every failure returns the same generic error.

### Businesses and attendees

| Table | Key columns | Notes |
|---|---|---|
| `businesses` | `id`, `org_id`, `name`, `claimed_member_id NULL`, `active` | Each entry creates its own business. **Matching names or Member IDs never merge businesses** or grant one business's authority to another. |
| `business_members` | `(person_id, business_id) PK`, `org_id`, `can_bid`, `active` | Shared business standing comes from this table. |
| `event_attendees` | `(person_id, event_id) PK`, `org_id`, `access IN ('VIEW','BID')`, `active`, `revision` | Open QR entry inserts `BID`. Staff can lower an attendee to VIEW or deactivate them. |
| `entry_slots` | exactly as migration 009 | See R8. |
| `reentry_codes` | `id`, `org_id`, `person_id`, `event_id`, `code_hash UNIQUE`, `issued_by`, `issued_at`, `expires_at`, `consumed_at`, `session_hash NULL` | Staff-issued, one-time recovery for an existing attendee. See R8. |

### Events, items, windows

| Table | Key columns | Notes |
|---|---|---|
| `events` | `id`, `org_id`, `name`, `welcome`, `venue`, `cover_asset_id NULL`, `timezone`, `unit`, `entry_enabled`, `donations_enabled`, `donation_deadline NULL`, `revision`, `updated_at`, `updated_by` | Uses optimistic concurrency: a save with a stale `revision` gets 409. `CHECK(NOT donations_enabled OR donation_deadline IS NOT NULL)`. |
| `event_sponsors` | `id`, `event_id`, `org_id`, `position`, `name`, `logo_asset_id NULL`, `alt` | `UNIQUE(event_id, position)`. |
| `bid_rules` | `event_id PK`, `org_id`, `mode IN ('tiered','fixed')`, `tiers jsonb NULL`, `fixed_raise_minor NULL`, `revision` | `CHECK(bz_valid_rules(mode, tiers, fixed_raise_minor))` requires: in tiered mode, 1–10 tiers, strictly ascending `below_minor`, every `raise_minor` > 0, and only the last tier has `below_minor = null`; in fixed mode, `fixed_raise_minor` > 0 and no tiers. Default: $25 below $500, $50 below $1,000, $100 below $2,500, then $250. |
| `windows` | `id`, `event_id`, `org_id`, `name`, `opens_at`, `closes_at`, `revision` | `CHECK(opens_at < closes_at)`. Edits go only through `bz_window_edit` (R3). |
| `window_revisions` | `(window_id, revision) PK`, `opens_at`, `closes_at`, `changed_by`, `changed_at`, `reason` | Append-only. Revision 1 is written on creation. |
| `items` | `id`, `event_id`, `org_id`, `position`, `title`, `short`, `description`, `category`, `image_asset_id NULL`, `alt`, `opening_minor NULL`, `fixed_raise_minor NULL`, `includes text[]`, `fine_print`, `window_id NULL`, `revision` | The working draft. **Frozen once published:** a trigger rejects any update or delete when a `published_items` row exists for the item. There is no separate `published_at` flag; the `published_items` row is the atomic publication marker. |
| `assets` | `id`, `event_id`, `org_id`, `uploaded_by`, `request_id`, source mime/size/sha256, `bytes bytea`, `width`, `height`, `created_at` | Ports migration 016's full asset contract (see R5). |

### Publication (append-only)

| Table | Key columns | Notes |
|---|---|---|
| `catalog_versions` | `id`, `event_id`, `org_id`, `version`, `published_by`, `published_at`, `event_snapshot jsonb` | `UNIQUE(event_id, version)`. Version 1 is the first publication; each "add items" publication adds the next version. |
| `published_items` | `item_id PK`, `event_id`, `org_id`, `catalog_version_id`, `window_id`, `position`, `opening_minor`, `rules_snapshot jsonb`, `snapshot jsonb` | Written once, then **immutable** (trigger, and no UPDATE/DELETE privilege). `UNIQUE(event_id, position)`. The required columns (`opening_minor`, `window_id`, `position`) are real `NOT NULL` columns, not JSON. `rules_snapshot` passes `bz_valid_rules`. `snapshot` must contain `title`, `short`, `description`, `category`, `includes`, `fine_print`, `image_asset_id` and `alt`, checked with `?&` and type checks; `jsonb_typeof` must be `'object'`. An item's `catalog_version_id` never changes. |
| `standings` | `item_id PK`, `event_id`, `org_id`, `current_minor NULL`, `leading_business_id NULL`, `accepted_bid_id NULL`, `accepted_count`, `version`, `updated_at` | **Created at publication**, in the zero state, so there is no lazy first-bid initialization race. Zero/non-zero `CHECK` as in migration 003: either `accepted_count = 0` and every bid field is null, or `accepted_count > 0` and they are all set, with `0 < current_minor ≤ 1_000_000_000`. Also `version = accepted_count`, and `accepted_count` is between 0 and 2^31 − 1. |

**The publish operation** is one transaction, following the lock order in [§ Lock order](#lock-order):
1. Lock the event `FOR UPDATE`. This serializes publications per event and freezes `unit` from version 1 on.
2. Lock the selected items `FOR UPDATE` and their windows `FOR SHARE`.
3. Read the clock.
4. Require every item to:
   - be complete (title, opening amount, a window, alt text whenever it has an image);
   - have never been published;
   - belong to a window of this event whose `closes_at` is after now.
5. Insert `catalog_versions` (next version), then `published_items`, then zero `standings`.

Earlier versions, their items, bids and receipts are never touched.

**Phases.** An **item's phase** (`scheduled | open | closed`) comes from its window's current times against the decision clock. It is the only authority for bidding. The **event rollup** is for display only:

| Situation | Event shows |
|---|---|
| No published items | `not_published` |
| Any item window open | `open` |
| None open, some still in the future | `upcoming` (with the next opening time) |
| All windows closed | `closed` |

### Bidding (ported engine)

| Table | Key columns | Notes |
|---|---|---|
| `bids` | `id`, `item_id`, `event_id`, `org_id`, `actor_id`, `business_id`, `request_id`, `amount_minor`, `standing_version`, `window_revision`, `decided_at` | Accepted bids only. Append-only. `UNIQUE(actor_id, request_id)`, `UNIQUE(item_id, standing_version)`, `UNIQUE(id, item_id)`, `CHECK(0 < amount_minor ≤ 1_000_000_000)`. |
| `bid_receipts` | `(actor_id, request_id) PK`, `org_id`, `event_id`, `item_id`, `business_id`, `payload_hash`, `receipt jsonb`, `http_status IN (201,409)` | Every decision, accepted or rejected. Append-only. A `CHECK` binds the receipt JSON's `actorId`, `requestId`, `eventId`, `itemId` and `businessId` to the columns. The receipt records `catalogVersionId`, `windowId`, `windowRevision` and the `rules_snapshot` that was applied. |
| `watches` | `(actor_id, item_id) PK`, `event_id`, `org_id`, `watched_at` | Personal. Watch and unwatch requests use `requests` for idempotency. |
| `requests` | `(actor_id, operation, request_id) PK`, `org_id`, `payload_hash`, `response jsonb`, `status` | Generic idempotency, **only** for operations with no record of their own: watches and staff edits. Bids and pledges are idempotent through their own tables and never write here. Every operation has exactly one idempotency record. |

`standings.accepted_bid_id` references `bids(id, item_id)` through the composite foreign key `(accepted_bid_id, item_id)`, as in migration 003, so a standing can never point to a bid on a different item.

**The bid decision** (TypeScript transaction, following [§ Lock order](#lock-order)):
1. Take the shared org gate, then lock the authority rows `FOR SHARE`: session, person, `event_attendees`, `business_members` and the business. The session's `org_id` and `event_id` must match the target.
2. Take the advisory lock `bid:<actor>:<request_id>`.
3. Lock the item's window `FOR SHARE`, then its `standings` row `FOR UPDATE`.
4. **Read the clock now, after every wait.** Then require `session.expires_at > clock` (R2). Expiry is the only authority fact that can change while the gate is held, because a revocation needs the exclusive gate.
5. **Replay:** if a receipt exists for `(actor, request_id)`:
   - a different `payload_hash`, or a different event, item or business, returns 409 `IDEMPOTENCY_CONFLICT`;
   - otherwise return the **stored** receipt unchanged. An accepted replay also returns fresh standing.

   Replay requires the current session plus active attendance (VIEW or BID). It works after the window closes. It is never regenerated from current rules or the current catalog.
6. **New decision:** require `BID` access plus an active `can_bid` membership in the chosen business. Compute the phase from the locked window values and the clock, then the first applicable reason, in order: `NOT_OPEN`, `CLOSED`, `AMOUNT_LIMIT`, `UNSUPPORTED_SELF_RAISE`, `BELOW_MINIMUM`. The minimum next bid comes from `rules_snapshot`: a per-item fixed raise takes precedence, otherwise the tier for the current amount applies.
7. Write the bid and standing (if accepted), then the receipt. All of it commits together, and the response is sent only after commit.

### After close

| Table | Key columns | Notes |
|---|---|---|
| `award_decisions` | `id`, `item_id`, `event_id`, `org_id`, `sequence`, `supersedes_id NULL`, `decision IN ('confirm','reassign','none')`, `bid_id NULL`, `reason NULL`, `decided_by`, `decided_at`, `request_id` | Append-only, `UNIQUE(item_id, sequence)`. The first decision has `sequence = 1` and `supersedes_id IS NULL`; each later one has `supersedes_id` = the previous decision and `sequence` = previous + 1. `bid_id` references `bids(id, item_id)`, so it can only be a bid on this item. `confirm` requires `bid_id` = the standing's accepted bid. `reassign` requires any accepted `bid_id` on the item and a reason. `none` requires a reason and no `bid_id`. The winner and amount are **derived from the bid**. |
| `fulfillment_events` | `id`, `award_decision_id`, `sequence`, `supersedes_id NULL`, `state IN ('fulfilled','reopened')`, `by`, `at`, `note`, `request_id` | **Bound to one award decision**, not to the item (R7). `UNIQUE(award_decision_id, sequence)`. A reassignment creates a new decision with no fulfillment history. Fulfillment is allowed only when the referenced decision is the item's current one and is `confirm` or `reassign`. |
| `nonprofits` | `id`, `org_id`, `name`, `description`, `logo_asset_id NULL`, `active`, `revision` | Organization-level ("Saturn's nonprofits"), curated by staff. |
| `nonprofit_revisions` | `(nonprofit_id, revision) PK`, `name`, `description`, `logo_asset_id`, `changed_by`, `changed_at` | Append-only. A pledge references the exact revision the attendee reviewed. |
| `event_nonprofits` | `(event_id, nonprofit_id) PK`, `org_id`, `active` | The nonprofits shown at this event. |
| `donation_pledges` | `id`, `org_id`, `event_id`, `actor_id`, `request_id`, `business_id`, `nonprofit_id`, `nonprofit_revision`, `amount_minor`, `payload jsonb`, `receipt jsonb`, `recorded_at` | Append-only. `UNIQUE(actor_id, request_id)` is the pledge's only idempotency record. `CHECK(amount_minor BETWEEN 1 AND 1_000_000)` enforces the $10,000 cap. `(nonprofit_id, nonprofit_revision)` references `nonprofit_revisions`. The receipt is bound to its columns by `CHECK`; its status is always `recorded`. Processing state lives only in `donation_processing`. |
| `donation_processing` | `id`, `pledge_id`, `sequence`, `supersedes_id NULL`, `state IN ('processed','reopened')`, `by`, `at`, `note`, `request_id` | Append-only, `UNIQUE(pledge_id, sequence)`. The current state is the highest `sequence`, or `pending` when there are no rows. |

**Award, fulfillment and processing transitions** all follow one pattern:
- the request carries the `expected_current_id` the staff member saw (`null` if nothing exists yet);
- the server locks the parent row `FOR UPDATE`: the `standings` row for awards (this also waits out any in-flight bid), the award decision for fulfillment, the pledge for processing;
- if the current head isn't `expected_current_id`, the request fails with 409 `STALE`;
- staff idempotency comes from `request_id` (`UNIQUE(decided_by, request_id)`).

An award also requires its window `FOR SHARE` and, from the clock read after the locks, phase `closed`.

**Bidder rule:** "You won" appears only when the item's current decision is `confirm` or `reassign` and its bid belongs to one of the actor's businesses. A closed leader with no decision sees "Bidding closed — awaiting confirmation".

**Donation decision** (`bz_donation_member`, `SECURITY DEFINER`, ported from migration 018):
1. Validate the payload exactly (`actorId`, `requestId`, `businessId`, `nonprofitId`, `nonprofitRevision`, `amountMinor`). If `actorId` isn't the session's person, return `ACTOR_CHANGED`.
2. Take the shared gate, lock authority `FOR SHARE`, then take the advisory lock `pledge:<actor>:<request_id>`.
3. **Replay or recovery first.** If a pledge exists for `(actor, request_id)`, its payload must match exactly or the request gets 409 `IDEMPOTENCY_CONFLICT`. Otherwise the stored receipt is returned. Recovery needs only the current session plus active attendance. It works after donations are disabled, after the nonprofit changes and after the deadline.
4. **New pledge.** Lock the event `FOR SHARE` (toggle and deadline), the `event_nonprofits` row and the nonprofit `FOR SHARE`, then the business membership.
5. Read the clock. Then require all of:
   - the session hasn't expired;
   - `donations_enabled`;
   - at least one catalog version is published (availability starts at the first publication);
   - `clock < donation_deadline`;
   - the event nonprofit is active, and the nonprofit's current revision equals `nonprofitRevision` (otherwise return `NONPROFIT_CHANGED`);
   - `BID` access and an active `can_bid` membership.
6. Insert. A failed check returns its error without writing anything. Under the held shared gate, no authority can change after step 5.

**Donation deadline.** When staff first enable donations, it is **stored once**, defaulting to the latest `closes_at` among the event's windows. After that it changes only through an explicit donation-settings edit. **Window edits never move it.**

## Lock order

Every transaction acquires locks in this order. It may skip levels, but never goes backwards, never upgrades a lock and never takes a second organization gate.

| Level | Lock | Taken by |
|---|---|---|
| L1 | Org gate `bz:org:<org_id>`, transaction-scoped advisory lock | **Shared** by decisions; **exclusive** by authority mutations, always as their first statement |
| L2 | Authority rows `FOR SHARE`, in order: session, person, grant or attendee, business member, business | Decisions |
| L3 | Request advisory lock `<op>:<actor>:<request_id>` | Idempotent operations |
| L4 | `events` row (`FOR SHARE`, or `FOR UPDATE` for publication and settings) | Publication, settings, donations |
| L5 | `items` rows (`FOR UPDATE`, ascending `id`) | Publication, item edits |
| L6 | `windows` row (`FOR SHARE`, or `FOR UPDATE` for edits) | Bids, awards, publication, window edits |
| L7 | Parent row `FOR UPDATE`: `standings`, `award_decisions` head, pledge | Bids, awards, fulfillment, processing |
| — | Read `clock_timestamp()` and check session expiry | Every decision, after its last lock |

**Authority mutations** are separate `SECURITY DEFINER` functions: logout, revoke a session, deactivate a person, change a grant, change attendee access, issue or redeem a re-entry code, and staff login (which creates a session). They:
- take L1 exclusive first and then only lock rows of that same organization;
- are never called from inside a decision transaction, so no lock is ever upgraded.

**Login with an old cookie** revokes the old session in the same transaction, only when that session belongs to the same organization. A session for another organization is left alone, never touched.

**Revocation guarantee.**
- A revocation that is queued behind running decisions gets priority over newer decisions. PostgreSQL grants a waiting exclusive advisory request before later shared requests on the same key.
- After the revocation commits, no later decision can use the revoked authority.
- Decisions already holding the gate finish first.

Independent actors in different organizations never contend.

**Raw SQL.** Authority tables (`sessions`, `people`, `staff_grants`, `event_attendees`, `business_members`, `businesses`) have a `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW` guard. The guard checks `pg_locks` for an **exclusive, granted** advisory lock that:
- is held by `pg_backend_pid()`;
- is in the current database;
- has the row's org-gate key.

If the lock isn't there, the guard raises. The guarantee is precisely this: **an unprepared raw `INSERT`/`UPDATE`/`DELETE` is rejected**, not queued as migration 016's statement trigger queued it. That operator-interface change is deliberate. The operator path is to call the entry-point function. Notes on the guard:
- it can block on a row lock before rejecting;
- it can't prove the lock is transaction-scoped rather than session-scoped, because only the definer functions take the gate and they use the `xact` form;
- **a superuser or the table owner can disable triggers, so the guarantee excludes them.**

Exempt from the guard: decision inserts that don't change authority (bids, receipts, pledges, watches). Attendee creation through entry runs inside `bz_entry_enroll`, which takes L1 exclusive.

## Runtime privileges

`bz_app` has **no** privileges from PUBLIC or default grants (`ALTER DEFAULT PRIVILEGES … REVOKE`). Every function sets `search_path = pg_catalog, pg_temp` and uses schema-qualified names.

| Object group | `bz_app` may |
|---|---|
| `staff_credentials`, `sessions`, `login_attempts`, `entry_slots`, `reentry_codes`, `people`, `staff_grants`, `event_attendees`, `business_members`, `businesses` | **Nothing directly.** Access is only through `EXECUTE` on: `bz_staff_login_begin/finish`, `bz_session_resolve` (returns person, org, kind, event, expiry and grants for a token hash, and locks them L1/L2), `bz_logout`, `bz_entry_begin/enroll/acknowledge`, `bz_reentry_issue/redeem`, `bz_attendee_set`, `bz_grant_set`. |
| `assets` | Nothing directly. `bz_asset_put`, `bz_asset_read` (checks current authority at read time) and `bz_asset_list`. |
| `nonprofits`, `nonprofit_revisions`, `event_nonprofits`, `donation_pledges`, `donation_processing` | Nothing directly. `bz_donation_member` (context, submit, receipt), `bz_donation_staff` (nonprofit edits, settings, list, export) and `bz_donation_process`. |
| `events`, `event_sponsors`, `bid_rules`, `windows`, `items` | `SELECT`, `INSERT`, `UPDATE` (immutability enforced by triggers). Window updates only through `bz_window_edit`; there is no `UPDATE` on `windows`. No `DELETE` except draft `items` and `event_sponsors`. |
| `window_revisions`, `catalog_versions`, `published_items`, `bids`, `bid_receipts`, `award_decisions`, `fulfillment_events` | `SELECT`, `INSERT` only. |
| `standings` | `SELECT`, `INSERT`, `UPDATE`. A trigger allows only a version+1 transition that matches an inserted bid. |
| `watches`, `requests` | `SELECT`, `INSERT`, `DELETE` (watches only). |

**Trust split, stated honestly.** Identity, sessions, entry, authority changes, assets and donations are database-mediated: the runtime role cannot read or forge them directly. Bidding, publication, window edits, awards and staff edits run as TypeScript transactions, the same trust model as today's manual bids. For those, the database enforces the structural invariants: constraints, composite foreign keys, immutability triggers and the standing-transition trigger. **Authorization correctness rests on trusted server code**, which goes through `bz_session_resolve` to take the gate and lock authority.

## Relational invariants

Composite foreign keys keep every child inside its event and organization:
- `events (id, org_id)` is the root. Every event child references `(event_id, org_id) → events(id, org_id)`: windows, items, sponsors, rules, catalog versions, published items, standings, bids, receipts, watches, attendees, awards, pledges and assets.
- `published_items (window_id, event_id) → windows(id, event_id)`
- `published_items (catalog_version_id, event_id) → catalog_versions(id, event_id)`
- `items (window_id, event_id) → windows(id, event_id)`
- Asset references (`events.cover_asset_id`, `items.image_asset_id`, `event_sponsors.logo_asset_id`) go through `(asset_id, event_id) → assets(id, event_id)`. Nonprofit logos go through `(asset_id, org_id)`.
- `bids (business_id, org_id) → businesses(id, org_id)`
- `business_members (person_id, org_id) → people(id, org_id)`
- `standings (accepted_bid_id, item_id) → bids(id, item_id)`
- `award_decisions (bid_id, item_id) → bids(id, item_id)`
- `sessions (person_id, org_id) → people(id, org_id)`
- `sessions (event_id, org_id) → events(id, org_id)`
- `event_nonprofits (nonprofit_id, org_id) → nonprofits(id, org_id)`
- `donation_pledges (nonprofit_id, nonprofit_revision) → nonprofit_revisions`
- `donation_pledges (event_id, nonprofit_id) → event_nonprofits`

Authorization additionally checks that `session.org_id = event.org_id`, and that attendee sessions have `session.event_id = target event`.

## Guarantee map (old → new)

| Guarantee in today's engine | New mechanism |
|---|---|
| Server decides acceptance and time | Clock read after the last lock. Phase comes from the item's locked window. |
| Bid/standing/receipt commit together; response after commit | Same, in one transaction. |
| Idempotent bid with original-request replay | `bid_receipts` and the request advisory lock; **session expiry rechecked after all waits** (R2). Stored receipts are never regenerated. |
| Standing consistency | Same zero/non-zero CHECK, a version transition trigger, and the same-item composite foreign key. |
| No self-raise by the leading business | Same reason code. |
| Actor-private history vs. shared business standing | Receipts are keyed by actor; standing by business. My Bids reads only the actor's own receipts. |
| Published terms immutable | `published_items` and `rules_snapshot` are immutable. **Deliberate exception:** window times stay editable under the window rules, with a full `window_revisions` history and the window revision recorded on every bid. |
| Prior bids and receipts preserved across additions | Append-only `catalog_versions`; an item's version never changes. |
| Revocation priority (016) | Per-organization gate with exclusive-first mutation functions. Raw SQL is **rejected** (not queued). Superuser and owner are excluded from the guarantee. |
| Entry expiry and idempotency (009) | Ported exactly (R8). |
| Private immutable assets (016) | Ported in full (R5). |
| Donation idempotency, reviewed destination, recovery (018) | `bz_donation_member` ports migration 018's order, including the revision check and recovery before availability (R4). |
| Integer money, caps | Bids `≤ 1_000_000_000`, pledges `≤ 1_000_000` minor units, `Number.isSafeInteger` at the edge; the unit is frozen after publication. |
| Credentials never in client, URL or logs | HttpOnly Secure cookie, hashed tokens, dummy-hash login timing, generic errors. |

## API shape

Bidder responses keep today's `standing`, `receipt` and reason-code shapes where the meaning is unchanged. The deliberate differences:
- `releaseId` becomes `catalogVersionId`, **per item**;
- `rulesetId` becomes the item's `rulesSnapshot`;
- `phase` is **per item**, and clients must not assume one phase for the whole event;
- `currency` becomes `unit`;
- there is a new `award` field.

Staff endpoints are new and resource-shaped: `/api/studio/events/:id/items`, `/windows`, `/rules`, `/catalog/versions`, `/attendees`, `/results`, `/donations`.

## Finding resolutions

| Finding | Resolution in revision 2 |
|---|---|
| **R1** Revocation scope and order | People are organization-scoped, so there is no shared row and no multi-gate path. The full L1–L7 lock order is defined. Mutation functions take the exclusive gate first, never upgrade, and are never nested in decisions. Re-entry revokes only that attendee's sessions for that event. Login with an old cookie touches the old session only within the same organization. Raw SQL is described as **rejected**, using the exact `pg_locks` predicate; superuser and owner are excluded. The isolation claim is narrowed to independent actors in different organizations. |
| **R2** Replay freshness | The clock is read and session expiry checked after every wait, before both replay and decision. Replay returns the stored receipt bound to event, item and business, and works after close. |
| **R3** Window races | A window is locked `FOR SHARE` by bids, awards and publication, and `FOR UPDATE` by edits. Edit eligibility is judged from the old values and the clock read after the lock. Bids record `window_revision`. Standings are created at publication, which removes the lazy-initialization race. Awards lock the standing, which waits out any in-flight bid. Mutable schedule is declared as the one exception. |
| **R4** Donations | Migration 018's sequence ported: `ACTOR_CHANGED`, exact payload conflict, recovery before availability, reviewed `nonprofitRevision`, check after locks. One idempotency record per pledge (no `requests` row). Availability starts at the first publication. The deadline is stored once and is required before enabling. Window edits never move it. |
| **R5** Runtime boundary | Full privilege table; definer functions for identity, entry, authority, assets and donations; the trust split stated; the asset contract in full (immutable bytes, per-event quota, uploader binding, same-event reference keys, fresh read authorization). |
| **R6** Relational and monetary | Composite foreign keys enumerated; standing CHECK and transition trigger; required fields as real columns plus `?&` JSON checks; no `published_at` (the publication row is the marker); unique event-wide positions; unit frozen after the first version; `bz_valid_rules`. |
| **R7** Awards and fulfillment | One transition pattern: lock the parent, compare against expected-current, sequence numbers. Fulfillment is bound to an award decision, so a reassignment never inherits fulfillment. Donation processing uses the same pattern. |
| **R8** Clarifications | See below. |

**R8 details**

- **Entry (009), ported exactly:**
  - the slot is bound to its token hash, payload hash and session hash;
  - begin and enroll expire after 15 minutes;
  - acknowledgement stays idempotent after the slot expires or is consumed, for the **same current session only**;
  - entry is allowed only when `events.entry_enabled`.
- **Re-entry is a new capability**, not something migration 009 already validated:
  - only staff with a grant in the organization can issue a code;
  - the code is 32 random bytes; only its sha256 is stored, and the raw code appears once in the staff UI, never in logs;
  - it expires after 24 hours;
  - redemption is single-use, serialized by L1 exclusive plus `FOR UPDATE` on the code row;
  - redemption revokes that person's sessions **for that event only** and creates one new attendee session for the same person.
- **Event phase rollup** covers no windows and gaps between windows (see the table above). The item phase remains the only authority for bidding.
- **Catalog version identity:** an item's `catalog_version_id` is fixed at publication and never changes.
- **API translation:** see [§ API shape](#api-shape).
- **Stale plan sections:** reconciled in `REAL_V1_PLAN.md` in the same commit. The global-lock "acceptable for Saturn-only" note is removed, because the fresh schema has no global gate.

## Executable acceptance cases (frozen with the T1–T3 contracts)

These cases are taken from the review. Each runs against a disposable `bz_test_*` database **using the real `bz_app` privileges**:
- queued revocation versus later readers;
- unrelated-organization progress;
- old-cookie login, logout and re-entry lock ordering;
- session expiry during the request lock and the standing wait;
- exact accepted and rejected replay, and a changed-payload conflict across items and events;
- concurrent first bids;
- window edits racing bids, publication and awards;
- additive publication preserving prior receipts byte-for-byte;
- stale nonprofit revision;
- donation replay after disable, the deadline and a destination change;
- private asset read denial;
- cross-organization and cross-event foreign-key violations;
- reassignment after fulfillment;
- raw-SQL authority update rejected;
- `bz_app` denied direct reads of credentials, sessions and pledges.
