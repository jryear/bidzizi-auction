# Bid · Shop · Give — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship fixed-price Shop items alongside the auction: guests browse Bid · Shop · Give in one place and buy with a quick confirm; staff run Shop as its own Studio mode with Products, Purchases and a Pickup desk. Land on staging.bidzizi.com for a Saturn staff trial.

**Architecture:** Shop items are rows in `items` with `kind = 'shop'`, so photos, categories, ordering, visibility and paste rows stay shared. Stock lives in `item_stock` and is decided under a `FOR UPDATE` lock, exactly like bids lock `standings`; purchases are receipted by `(participant, request_id)` like bids. The guest app (accepted **Guest B**) and Studio (accepted **Studio B**, event sidebar kept in Shop) are ports of the accepted prototype in `prototypes/bid-shop-give/`.

**Tech Stack:** Next.js 16.3.8 (App Router, Turbopack), React 19, `pg` against Postgres 18 (Neon in deploys), Playwright 1.63 (Chromium + WebKit), Node 24.4.1, pnpm 12.4.2.

**Spec:** [BID_SHOP_GIVE.md](BID_SHOP_GIVE.md) (decisions, data model, purchase decision, states, kind-leak audit). Accepted design: `prototypes/bid-shop-give/` (`js/guest.js` variant `b`, `js/studio.js` variant `b`, `css/guest.css` `.g-b`, `css/studio.css`), evidence `evidence/guest-b-*.png`, `evidence/studio-b-shop-nav.png`.

## Global Constraints

- Base: `jryear/money-path-fixes` @ `ece7e07` (production source `e3c6930` + release record). Never build on old `main` alone.
- Money is integer cents end to end; display with `formatMoney` from `src/lib/money.ts`.
- Server time decides: every window check uses `now(db)` (database clock) after locks are taken.
- Lock order everywhere: **event → item → (standing | item_stock) → purchase rows**. No exceptions.
- Every guest write is idempotent by `(participant_id, request_id)`; a retried request returns the original receipt; a different payload with the same id is `409 CONFLICT`.
- Uncertain outcomes never offer a fresh purchase: the only action is to resend the same request id.
- Guests can't cancel. Only staff change purchase status. Allowed: committed→paid, paid→picked_up, committed→cancelled, paid→cancelled. picked_up and cancelled are final. Cancel returns stock exactly once.
- One limit only: `per_guest_limit` per guest per item (optional).
- Older iOS Safari (<17) must work: the buy sheet uses the fixed-overlay pattern from `src/app/e/[code]/sheet.tsx` (no `<dialog>`, no `backdrop-filter` outside `@supports (text-wrap: balance)`); `color-mix()` needs a fallback.
- Simple mode (`/e/[code]/simple`, no JavaScript) gets an HTML-form buy path that reuses the engine and request ids.
- Copy: filters are **Bid · Shop · Give**; tabs **Browse · Mine · Event**; "Sold out", "N left", "You've reached the limit", "Just sold out".
- Prototype fixtures never ship. No `prototypes/` imports from `src/`.
- Tests run only against disposable loopback `bz_test_*` databases (`tests/db/lib.mjs` guards). Never seed or reset shared staging for tests.
- Staging deploy, production deploy, and `main` merge are separate actions; this plan ends at **staging**. Production needs Zack's explicit go.

## Spec amendment (for Zack's review)

The spec says shop items have no standings row. This plan **keeps an empty standings row** for every item. Reason: `host.ts` joins `standings` in the workspace (`:252`), Live (`:321`) and the CSV export (`:938`); without the row those queries silently drop shop items, which is exactly the kind-leak class the spec warns about. The engine refuses bids on shop items (`NOT_AVAILABLE`), awards refuse shop items, and the invariant checker asserts every shop item's standing has `bid_count = 0`. Phase 2 (multi-quantity auctions) reuses the same row.

## Review Focus

1. **A shop item reaching an auction path** (bid, award, winner proposal, "no bids yet" alert, stage display, results export): expect a clear refusal or omission, never a $0 bid minimum or a phantom "no winner" card. Pinned in Task 4.
2. **Stock edits during sales** (staff lowers quantity while guests buy): quantity can't go below sold; remaining moves by the same delta under the stock lock. Pinned in Task 4 (`updateItem` stock test).
3. **Event duplicated or practice-reset with purchases**: duplicate copies shop items at full stock with no purchases; reset deletes purchases/receipts/log and restores remaining = quantity. Pinned in Task 4.
4. **Guest quantity input abuse** (0, negative, 1.5, "2", 10001, missing): `400 INVALID`, never a receipt. Pinned in Task 2.
5. **Old links and bookmarks** (`?s=items`, `?s=give`, `?s=watching`, and the item `&i=` param): land on the matching new screen. Pinned in Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `migrations/prod/012_shop.sql` (create) | kind/price/quantity/limit/pickup columns + kind CHECK; `item_stock`, `purchases`, `purchase_receipts`, `purchase_log` |
| `src/server/v1/shop.ts` (create) | Guest `buy`, `purchaseReceipt`; staff `listPurchases`, `setPurchaseStatus`, purchases CSV; `stockFor` helper |
| `src/server/v1/engine.ts` (modify) | `ItemRow` gains shop fields; `placeBid` refuses shop; snapshot projects shop fields and `me.purchases` |
| `src/server/v1/host.ts` (modify) | Kind-aware create/edit/paste/duplicate/reset/delete/bulk/workspace/live/award/export |
| `src/app/api/v1/[...path]/route.ts` (modify) | New routes |
| `src/server/v1/simple.ts` (modify) | Shop list + buy form |
| `src/app/e/[code]/model.ts` (modify) | `Item` shop fields, `Purchase` type, `PendingBuy` storage helpers |
| `src/app/e/[code]/guest-shell.tsx` (modify) | Browse · Mine · Event tabs, Bid/Shop/Give switch, legacy URL mapping |
| `src/app/e/[code]/browse.tsx` (create) | Mode cards (B), bid rows, 2-column shop grid, cause cards |
| `src/app/e/[code]/buy-sheet.tsx` (create) | Quantity → review → sending → done / refused / uncertain |
| `src/app/e/[code]/item.tsx` (modify) | Shop item page (price, stock, limit, pickup, Buy) |
| `src/app/e/[code]/mine.tsx` (modify) | Bids, purchases grouped by pickup place, donations, watched |
| `src/app/studio/data.ts` (modify) | Studio `Item` shop fields, `Purchase` type |
| `src/app/studio/[id]/shop.tsx` (create) | Shop mode: Products, Purchases, Pickup desk |
| `src/app/studio/[id]/studio.tsx` (modify) | `Mode` gains `"shop"`; Shop renders with the Outline rail |
| `src/app/studio/[id]/setup.tsx` (modify) | Outline "Selling" group: Auction items / Shop; item panel kind fields |
| `src/app/studio/[id]/live.tsx`, `results.tsx` (modify) | Shop sales KPI; Results excludes shop, links to Shop |
| `tests/db/shop.mjs`, `tests/db/invariants.mjs` (create) | Engine races and invariants |
| `tests/v1/buy.mjs`, `tests/v1/shop-ui.mjs` (create) | Guest buy sheet and Studio Shop in Chromium + WebKit |

---

### Task 0: Branch and baseline

**Files:** none changed.

- [ ] **Step 1: Bring the accepted design onto the production base**

```bash
cd ~/orca/workspaces/integration/bid-shop-give
git fetch origin
git merge --no-ff origin/jryear/money-path-fixes -m "Merge production base (money-path fixes) into bid-shop-give"
git log --oneline -3
```
Expected: merge commit on top; no conflicts (bid-shop-give only adds `docs/plans/BID_SHOP_GIVE*.md` and `prototypes/bid-shop-give/`).

- [ ] **Step 2: Disposable database and baseline suites**

```bash
export PATH=/Users/jryear/.nvm/versions/node/v24.4.1/bin:$PATH
pnpm install --frozen-lockfile
PG=/opt/homebrew/Cellar/postgresql@18/18.6/bin; D=$(mktemp -d /tmp/bzpg.XXXX)
$PG/initdb -D $D/data -U bz -A trust >/dev/null
$PG/pg_ctl -D $D/data -o "-p 55490 -k '' -c listen_addresses=127.0.0.1" -l $D/log start
$PG/createdb -h 127.0.0.1 -p 55490 -U bz bz_test_shop
export BIDZIZI_DATABASE_URL=postgres://bz@127.0.0.1:55490/bz_test_shop BIDZIZI_TEST_PG=postgres://bz@127.0.0.1:55490
node scripts/prod-migrate.mjs
BIDZIZI_STAFF_PASSWORD=shop-owner-pass-1 node scripts/provision-staff.mjs --org shop --org-name "Shop test" --email owner@example.test --name "Olive Owner"
BIDZIZI_APP_MODE=local pnpm build && (BIDZIZI_APP_MODE=local APP_ORIGIN=http://127.0.0.1:3490 node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3490 &)
export BASE=http://127.0.0.1:3490 HOST_EMAIL=owner@example.test HOST_PASSWORD=shop-owner-pass-1
node tests/v1/journey.mjs | tail -1 && node tests/db/races.mjs | tail -1 && node tests/v1/recovery.mjs | tail -1 && node tests/db/migrate.mjs | tail -1
```
Expected: `55/55`, `10/10`, `6/6`, `7/7`. Record the temp dir; stop it at the end with `pg_ctl -D $D/data stop`.

---

### Task 1: Migration 012 — shop schema

**Files:**
- Create: `migrations/prod/012_shop.sql`
- Test: `tests/db/shop-schema.mjs`

**Interfaces:**
- Produces: columns `items.kind ('auction'|'shop')`, `items.quantity int`, `items.price_minor bigint|null`, `items.per_guest_limit int|null`, `items.pickup text`; `items.opening_minor` nullable; tables `item_stock(item_id, event_id, remaining)`, `purchases`, `purchase_receipts`, `purchase_log`.

- [ ] **Step 1: Write the failing schema test**

```js
#!/usr/bin/env node
// tests/db/shop-schema.mjs — kind CHECKs and table constraints.
//   BIDZIZI_TEST_PG=postgres://bz@127.0.0.1:PORT node tests/db/shop-schema.mjs
import assert from "node:assert/strict";
import { migrate } from "../../scripts/prod-migrate.mjs";
import { check, done, freshDb } from "./lib.mjs";

const db = await freshDb();
await migrate(db.client, new URL("../../migrations/prod/", import.meta.url), () => {});
const q = (s, p) => db.client.query(s, p);
const org = (await q("INSERT INTO orgs (slug, name) VALUES ('s', 'S') RETURNING id")).rows[0].id;
const ev = (await q(`INSERT INTO events (org_id, join_code, name, starts_at, ends_at, access_ends_at)
  VALUES ($1, 'SHPTST', 'E', now(), now() + interval '1 hour', now() + interval '2 hours') RETURNING id`, [org])).rows[0].id;
const item = (cols, vals) => q(`INSERT INTO items (event_id, org_id, position, title, ${cols}) VALUES ($1, $2, 0, 'T', ${vals.map((_, i) => `$${i + 3}`)}) RETURNING id`, [ev, org, ...vals]);

await check("auction items need opening_minor and no shop fields", async () => {
  await item("opening_minor", [1000]);
  await assert.rejects(item("opening_minor, price_minor", [1000, 500]), /items_kind_fields/);
  await assert.rejects(item("kind", ["auction"]), /items_kind_fields/);
});
await check("shop items need price_minor and no auction fields", async () => {
  await item("kind, price_minor, quantity, per_guest_limit, pickup", ["shop", 4000, 20, 2, "Gift table"]);
  await assert.rejects(item("kind, quantity", ["shop", 5]), /items_kind_fields/);
  await assert.rejects(item("kind, price_minor, opening_minor", ["shop", 4000, 1000]), /items_kind_fields/);
});
await check("stock can't go negative; purchases amount = unit × quantity; one purchase per request", async () => {
  const id = (await item("kind, price_minor, quantity", ["shop", 1500, 3])).rows[0].id;
  await assert.rejects(q("INSERT INTO item_stock (item_id, event_id, remaining) VALUES ($1, $2, -1)", [id, ev]), /check/i);
  await q("INSERT INTO item_stock (item_id, event_id, remaining) VALUES ($1, $2, 3)", [id, ev]);
  const p = (await q(`INSERT INTO participants (event_id, display_name, business_name, token_hash, join_request_id, bidder_number)
    VALUES ($1, 'G', 'B', repeat('a', 64), gen_random_uuid(), 1) RETURNING id`, [ev])).rows[0].id;
  const rid = "11111111-1111-4111-8111-111111111111";
  const buy = (n, amount) => q(`INSERT INTO purchases (id, item_id, event_id, participant_id, request_id, quantity, unit_minor, amount_minor, created_at)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1500, $6, now())`, [id, ev, p, rid, n, amount]);
  await assert.rejects(buy(2, 1500), /check/i);
  await buy(2, 3000);
  await assert.rejects(buy(1, 1500), /unique|duplicate/i);
});
await db.drop();
done();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/db/shop-schema.mjs`
Expected: FAIL (`relation "item_stock" does not exist`, `column "kind" does not exist`).

- [ ] **Step 3: Write the migration**

```sql
-- migrations/prod/012_shop.sql
-- Shop items: fixed price, limited stock, optional per-guest limit, settled offline like awards.
-- Design: docs/plans/BID_SHOP_GIVE.md. Stock is decided under item_stock FOR UPDATE, like bids under standings.
BEGIN;

ALTER TABLE items ADD COLUMN kind text NOT NULL DEFAULT 'auction' CHECK (kind IN ('auction', 'shop'));
ALTER TABLE items ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10000);
ALTER TABLE items ADD COLUMN price_minor bigint CHECK (price_minor IS NULL OR price_minor BETWEEN 1 AND 1000000000);
ALTER TABLE items ADD COLUMN per_guest_limit integer CHECK (per_guest_limit IS NULL OR per_guest_limit BETWEEN 1 AND 10000);
ALTER TABLE items ADD COLUMN pickup text NOT NULL DEFAULT '' CHECK (length(pickup) <= 200 AND pickup !~ '[[:cntrl:]]');
ALTER TABLE items ALTER COLUMN opening_minor DROP NOT NULL;
ALTER TABLE items ADD CONSTRAINT items_kind_fields CHECK (
  (kind = 'auction' AND opening_minor IS NOT NULL AND price_minor IS NULL AND per_guest_limit IS NULL AND quantity = 1)
  OR (kind = 'shop' AND opening_minor IS NULL AND increment_override_minor IS NULL AND price_minor IS NOT NULL));

CREATE TABLE item_stock (
  item_id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  remaining integer NOT NULL CHECK (remaining >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (item_id, event_id) REFERENCES items (id, event_id)
);

CREATE TABLE purchases (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  request_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_minor bigint NOT NULL CHECK (unit_minor BETWEEN 1 AND 1000000000),
  amount_minor bigint NOT NULL CHECK (amount_minor = unit_minor * quantity),
  status text NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'paid', 'picked_up', 'cancelled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES staff(id),
  FOREIGN KEY (item_id, event_id) REFERENCES items (id, event_id),
  FOREIGN KEY (participant_id, event_id) REFERENCES participants (id, event_id),
  UNIQUE (participant_id, request_id)
);
CREATE INDEX purchases_held_idx ON purchases (item_id, participant_id) WHERE status <> 'cancelled';
CREATE INDEX purchases_event_idx ON purchases (event_id, created_at DESC);

CREATE TABLE purchase_receipts (
  participant_id uuid NOT NULL REFERENCES participants(id),
  request_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES items(id),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  accepted boolean NOT NULL,
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  PRIMARY KEY (participant_id, request_id)
);
CREATE INDEX purchase_receipts_item_idx ON purchase_receipts (item_id);

CREATE TABLE purchase_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES purchases(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  staff_id uuid NOT NULL REFERENCES staff(id),
  at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
```

- [ ] **Step 4: Run tests**

Run: `node tests/db/shop-schema.mjs && node tests/db/migrate.mjs`
Expected: `3/3 passed`, `7/7 passed`.

- [ ] **Step 5: Apply to the running local DB and commit**

```bash
node scripts/prod-migrate.mjs   # expect: applied 012_shop.sql
git add migrations/prod/012_shop.sql tests/db/shop-schema.mjs
git commit -m "Shop schema: kind fields, item_stock, purchases, receipts, log (012)"
```

---

### Task 2: Purchase engine (guest buy + receipt)

**Files:**
- Create: `src/server/v1/shop.ts`
- Modify: `src/server/v1/engine.ts:25-29` (`ItemRow`), `src/app/api/v1/[...path]/route.ts` (two routes)
- Test: `tests/db/shop.mjs`

**Interfaces:**
- Consumes: `eventByCode`, `phaseOf`, `EventRow`, `ItemRow` from `engine.ts`; `requireParticipant` from `auth.ts`; `tx`, `now` from `db.ts`; `conflict`, `id`, `invalid`, `json`, `notFound`, `readJson`, `sha256` from `http.ts`.
- Produces:
  - `POST /api/v1/e/:code/buy` body `{ requestId, itemId, quantity }` → `201 { receipt, replay }` accepted, `409 { receipt, replay }` refused.
  - `GET /api/v1/e/:code/purchase/:requestId` → `{ receipt: PurchaseReceipt | null }`.
  - `type BuyReason = "NOT_AVAILABLE" | "NOT_OPEN" | "CLOSED" | "PAUSED" | "SOLD_OUT" | "LIMIT_REACHED"`
  - `type PurchaseReceipt = { requestId: string; itemId: string; quantity: number; accepted: boolean; reason: BuyReason | null; purchaseId: string | null; unitMinor: number; amountMinor: number; decidedAt: string; remaining: number; heldAfter: number; limit: number | null }`

- [ ] **Step 1: Extend `ItemRow`**

In `src/server/v1/engine.ts` replace the `ItemRow` type with:

```ts
export type ItemRow = {
  id: string; event_id: string; position: number; title: string; short: string; description: string; category: string; donor: string;
  image_asset_id: string | null; image_focal: Partial<Frame>; opening_minor: string | null; increment_override_minor: string | null;
  opens_at: Date | null; closes_at: Date | null; ready: boolean; revision: number; withdrawn_at: Date | null; withdrawal_message: string;
  kind: "auction" | "shop"; quantity: number; price_minor: string | null; per_guest_limit: number | null; pickup: string;
};
```
Run `pnpm typecheck`; every `Number(i.opening_minor)` error it reports is a kind-leak site listed in Task 4. Leave the remaining sites to Task 4. In this task, change only `placeBid` (`engine.ts`, the `reason` expression) so shop items are refused before any arithmetic:

```ts
      !item.ready || item.withdrawn_at || e.status !== "live" || item.kind !== "auction" ? "NOT_AVAILABLE" :
```
and guard the two `minimumNext(..., Number(item.opening_minor), ...)` calls in `placeBid` with `item.kind === "auction" ? … : null`.

- [ ] **Step 2: Write the failing engine tests**

```js
#!/usr/bin/env node
// tests/db/shop.mjs — purchase decisions against a running local app and its disposable database.
//   BASE=… BIDZIZI_DATABASE_URL=… HOST_EMAIL=… HOST_PASSWORD=… node tests/db/shop.mjs
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { appDbUrl, check, client, done, sleep } from "./lib.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3490";
const db = new pg.Client({ connectionString: appDbUrl() }); await db.connect();
const iso = ms => new Date(Date.now() + ms).toISOString();
const ip = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

async function owner() {
  const c = client(BASE, { "x-forwarded-for": ip() });
  assert.equal((await c("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD })).status, 200);
  return c;
}
/** A live event with one shop item. Shop items are created through the staff API (Task 4); until then insert directly. */
async function shopEvent(staff, { quantity = 5, limit = null, priceMinor = 4000, ...item } = {}) {
  const e = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Shop test", startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  const r = await staff("POST", `/api/v1/host/events/${e.data.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Gift box", priceMinor, quantity, perGuestLimit: limit, ...item });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const w = await staff("GET", `/api/v1/host/events/${e.data.id}`);
  await staff("PATCH", `/api/v1/host/events/${e.data.id}`, { revision: w.data.event.revision, status: "live" });
  return { eventId: e.data.id, code: w.data.event.code, itemId: r.data.id };
}
async function guest(code) {
  const g = client(BASE);
  assert.equal((await g("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "Guest", businessName: "Guest Co" })).status, 201);
  return g;
}
const buy = (g, code, itemId, quantity, requestId = randomUUID()) => g("POST", `/api/v1/e/${code}/buy`, { requestId, itemId, quantity });
const remaining = async itemId => (await db.query("SELECT remaining FROM item_stock WHERE item_id = $1", [itemId])).rows[0].remaining;

await check("a purchase takes stock and returns an accepted receipt", async () => {
  const o = await owner(), { code, itemId } = await shopEvent(o, { quantity: 5 }), g = await guest(code);
  const r = await buy(g, code, itemId, 2);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.receipt.accepted, true); assert.equal(r.data.receipt.amountMinor, 8000);
  assert.equal(r.data.receipt.remaining, 3); assert.equal(await remaining(itemId), 3);
});

await check("N guests racing for the last unit: exactly one wins, the rest get SOLD_OUT", async () => {
  const o = await owner(), { code, itemId } = await shopEvent(o, { quantity: 1 });
  const guests = await Promise.all(Array.from({ length: 12 }, () => guest(code)));
  const all = await Promise.all(guests.map(g => buy(g, code, itemId, 1)));
  assert.equal(all.filter(r => r.data.receipt?.accepted).length, 1, JSON.stringify(all.map(r => r.data.receipt?.reason)));
  assert.ok(all.filter(r => !r.data.receipt.accepted).every(r => r.data.receipt.reason === "SOLD_OUT"));
  assert.equal(await remaining(itemId), 0);
});

await check("parallel requests from one guest can't exceed the per-guest limit", async () => {
  const o = await owner(), { code, itemId } = await shopEvent(o, { quantity: 50, limit: 2 }), g = await guest(code);
  const all = await Promise.all(Array.from({ length: 8 }, () => buy(g, code, itemId, 1)));
  assert.equal(all.filter(r => r.data.receipt.accepted).length, 2);
  assert.ok(all.filter(r => !r.data.receipt.accepted).every(r => r.data.receipt.reason === "LIMIT_REACHED"));
});

await check("a retried request returns the original receipt; a different payload is a conflict", async () => {
  const o = await owner(), { code, itemId } = await shopEvent(o), g = await guest(code), rid = randomUUID();
  const [a, b, c] = await Promise.all([buy(g, code, itemId, 1, rid), buy(g, code, itemId, 1, rid), buy(g, code, itemId, 1, rid)]);
  assert.equal(new Set([a, b, c].map(r => r.data.receipt.purchaseId)).size, 1);
  assert.equal([a, b, c].filter(r => r.data.replay === false).length, 1);
  assert.equal((await buy(g, code, itemId, 2, rid)).status, 409);
  const look = await g("GET", `/api/v1/e/${code}/purchase/${rid}`);
  assert.equal(look.data.receipt.purchaseId, a.data.receipt.purchaseId);
  assert.equal((await g("GET", `/api/v1/e/${code}/purchase/${randomUUID()}`)).data.receipt, null);
});

await check("refusals are receipted: not open, closed, hidden, paused", async () => {
  const o = await owner();
  const later = await shopEvent(o, { opensAt: iso(3_600_000), closesAt: iso(7_200_000) }), g1 = await guest(later.code);
  assert.equal((await buy(g1, later.code, later.itemId, 1)).data.receipt.reason, "NOT_OPEN");
  const soon = await shopEvent(o, { closesAt: iso(2_000) }), g2 = await guest(soon.code);
  await sleep(2_500);
  const closed = await buy(g2, soon.code, soon.itemId, 1);
  assert.equal(closed.status, 409); assert.equal(closed.data.receipt.reason, "CLOSED");
  const hidden = await shopEvent(o), g3 = await guest(hidden.code);
  await db.query("UPDATE items SET ready = false WHERE id = $1", [hidden.itemId]);
  assert.equal((await buy(g3, hidden.code, hidden.itemId, 1)).data.receipt.reason, "NOT_AVAILABLE");
  const paused = await shopEvent(o), g4 = await guest(paused.code);
  await db.query("UPDATE participants SET can_bid = false WHERE event_id = (SELECT event_id FROM items WHERE id = $1)", [paused.itemId]);
  assert.equal((await buy(g4, paused.code, paused.itemId, 1)).data.receipt.reason, "PAUSED");
});

await check("quantity input is validated before any decision", async () => {
  const o = await owner(), { code, itemId } = await shopEvent(o), g = await guest(code);
  for (const q of [0, -1, 1.5, "2", 10001, null, undefined]) {
    const r = await g("POST", `/api/v1/e/${code}/buy`, { requestId: randomUUID(), itemId, quantity: q });
    assert.equal(r.status, 400, `quantity ${JSON.stringify(q)} → ${r.status}`);
  }
  assert.equal((await db.query("SELECT count(*)::int n FROM purchase_receipts WHERE item_id = $1", [itemId])).rows[0].n, 0);
});

await check("buying an auction item is refused; bidding on a shop item is refused", async () => {
  const o = await owner(), { code, itemId, eventId } = await shopEvent(o), g = await guest(code);
  const a = await o("POST", `/api/v1/host/events/${eventId}/items`, { requestId: randomUUID(), title: "Cabin", openingMinor: 10_000 });
  assert.equal((await buy(g, code, a.data.id, 1)).data.receipt.reason, "NOT_AVAILABLE");
  const bid = await g("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId, amountMinor: 10_000 });
  assert.equal(bid.data.receipt.reason, "NOT_AVAILABLE");
});

await db.end();
done();
```

- [ ] **Step 3: Run to verify it fails**

Run: `node tests/db/shop.mjs`
Expected: FAIL (`/buy` 404; staff item create rejects `kind`). The tests create shop items through the staff API, so do **Task 4 Step 2** (`itemInput`/`insertItem` kind support) before Steps 4–6 here.

- [ ] **Step 4: Implement `src/server/v1/shop.ts` (guest part)**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { now, tx } from "./db";
import { conflict, id, invalid, json, notFound, readJson, sha256 } from "./http";
import { requireParticipant } from "./auth";
import { eventByCode, phaseOf, type EventRow, type ItemRow } from "./engine";

export type BuyReason = "NOT_AVAILABLE" | "NOT_OPEN" | "CLOSED" | "PAUSED" | "SOLD_OUT" | "LIMIT_REACHED";
export type PurchaseReceipt = {
  requestId: string; itemId: string; quantity: number; accepted: boolean; reason: BuyReason | null; purchaseId: string | null;
  unitMinor: number; amountMinor: number; decidedAt: string; remaining: number; heldAfter: number; limit: number | null;
};
const MAX_PER_PURCHASE = 100;
const buyHash = (itemId: string, quantity: number) => sha256(JSON.stringify(["buy", itemId, quantity]));
function quantityOf(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > MAX_PER_PURCHASE) throw invalid("Choose a quantity from 1 to 100.");
  return v;
}

/** One purchase decision. Lock order: event, item, item_stock (FOR UPDATE); the per-guest limit is checked with the stock lock held. */
export async function buy(request: Request, code: string): Promise<Response> {
  const input = await readJson(request);
  const requestId = id(input.requestId), itemId = id(input.itemId), quantity = quantityOf(input.quantity);
  const outcome = await tx(async db => {
    const e0 = await eventByCode(db, code);
    const me = await requireParticipant(db, request, e0.id);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`buy:${me.id}:${requestId}`]);
    const prior = (await db.query<{ payload_hash: string; receipt: PurchaseReceipt }>(
      "SELECT payload_hash, receipt FROM purchase_receipts WHERE participant_id = $1 AND request_id = $2", [me.id, requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== buyHash(itemId, quantity)) throw conflict("This request was already used for a different purchase.");
      return { receipt: prior.receipt, replay: true };
    }
    const e = (await db.query<EventRow>("SELECT * FROM events WHERE id = $1 FOR SHARE", [e0.id])).rows[0];
    const item = (await db.query<ItemRow>("SELECT * FROM items WHERE id = $1 AND event_id = $2 FOR SHARE", [itemId, e.id])).rows[0];
    if (!item) throw notFound("This item");
    const stock = item.kind === "shop"
      ? (await db.query<{ remaining: number }>("SELECT remaining FROM item_stock WHERE item_id = $1 FOR UPDATE", [itemId])).rows[0] ?? { remaining: 0 }
      : { remaining: 0 };
    const fresh = await requireParticipant(db, request, e.id);
    const at = await now(db);
    const held = Number((await db.query<{ held: string }>(
      "SELECT coalesce(sum(quantity), 0)::text AS held FROM purchases WHERE item_id = $1 AND participant_id = $2 AND status <> 'cancelled'",
      [itemId, fresh.id])).rows[0].held);
    const phase = phaseOf(e, item, at), unit = item.price_minor === null ? 0 : Number(item.price_minor);
    const reason: BuyReason | null =
      item.kind !== "shop" || !item.ready || item.withdrawn_at || e.status !== "live" ? "NOT_AVAILABLE" :
      phase === "scheduled" ? "NOT_OPEN" : phase === "closed" ? "CLOSED" :
      !fresh.canBid ? "PAUSED" :
      item.per_guest_limit !== null && held + quantity > item.per_guest_limit ? "LIMIT_REACHED" :
      quantity > stock.remaining ? "SOLD_OUT" : null;
    const purchaseId = reason ? null : randomUUID();
    if (purchaseId) {
      await db.query(
        `INSERT INTO purchases (id, item_id, event_id, participant_id, request_id, quantity, unit_minor, amount_minor, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [purchaseId, itemId, e.id, fresh.id, requestId, quantity, unit, unit * quantity, at]);
      await db.query("UPDATE item_stock SET remaining = remaining - $2, updated_at = $3 WHERE item_id = $1", [itemId, quantity, at]);
    }
    const receipt: PurchaseReceipt = {
      requestId, itemId, quantity, accepted: !reason, reason, purchaseId, unitMinor: unit, amountMinor: purchaseId ? unit * quantity : 0,
      decidedAt: at.toISOString(), remaining: stock.remaining - (purchaseId ? quantity : 0), heldAfter: held + (purchaseId ? quantity : 0),
      limit: item.per_guest_limit,
    };
    await db.query("INSERT INTO purchase_receipts (participant_id, request_id, item_id, payload_hash, accepted, receipt) VALUES ($1, $2, $3, $4, $5, $6)",
      [fresh.id, requestId, itemId, buyHash(itemId, quantity), !reason, JSON.stringify(receipt)]);
    return { receipt, replay: false };
  });
  return json(outcome, outcome.receipt.accepted ? 201 : 409);
}

/** "Did my purchase go through?" Returns the original decision; never creates one. */
export async function purchaseReceipt(request: Request, code: string, requestId: string): Promise<Response> {
  const key = id(requestId);
  return json(await tx(async db => {
    const e = await eventByCode(db, code), me = await requireParticipant(db, request, e.id);
    const row = (await db.query<{ receipt: PurchaseReceipt }>("SELECT receipt FROM purchase_receipts WHERE participant_id = $1 AND request_id = $2", [me.id, key])).rows[0];
    return { receipt: row?.receipt ?? null };
  }));
}
```

- [ ] **Step 5: Routes**

In `src/app/api/v1/[...path]/route.ts`, next to the existing guest `bid` and `receipt` routes, add (match the file's `at(...)` helper style):

```ts
    if (method === "POST" && at("e", "*", "buy")) return shop.buy(request, p[1]);
    if (method === "GET" && at("e", "*", "purchase", "*")) return shop.purchaseReceipt(request, p[1], p[3]);
```
with `import * as shop from "../../../../server/v1/shop";` at the top.

- [ ] **Step 6: Run tests, typecheck, commit**

Run: `pnpm typecheck && BIDZIZI_APP_MODE=local pnpm build`, restart the app, then `node tests/db/shop.mjs`
Expected: `7/7 passed`.

```bash
git add src/server/v1/shop.ts src/server/v1/engine.ts src/app/api/v1/[...path]/route.ts tests/db/shop.mjs
git commit -m "Purchase engine: locked stock, per-guest limit under the lock, receipted decisions"
```

---

### Task 3: Staff purchase status, cancel and CSV; invariant checker

**Files:**
- Modify: `src/server/v1/shop.ts` (staff part), `src/server/v1/host.ts` (export kinds), `src/app/api/v1/[...path]/route.ts`
- Create: `tests/db/invariants.mjs`
- Test: append to `tests/db/shop.mjs`

**Interfaces:**
- Produces:
  - `GET /api/v1/host/events/:id/purchases` → `{ purchases: StaffPurchase[] }`
  - `POST /api/v1/host/purchases/:id/status` body `{ to: "paid" | "picked_up" | "cancelled", revision: number }` → `{ ok: true, status, revision, replay }`
  - CSV kind `purchases` on the existing export route (same handler as `results`/`donations`/`participants`).
  - `type StaffPurchase = { id: string; itemId: string; itemTitle: string; pickup: string; participantId: string; name: string; business: string; quantity: number; unitMinor: number; amountMinor: number; status: "committed" | "paid" | "picked_up" | "cancelled"; revision: number; createdAt: string; updatedAt: string }`
  - `export async function checkInvariants(client): Promise<string[]>` in `tests/db/invariants.mjs` (empty array = clean).

- [ ] **Step 1: Invariant checker**

```js
// tests/db/invariants.mjs — the database is the judge. Returns a list of violations (empty = clean).
export async function checkInvariants(c) {
  const bad = [];
  const rows = async (label, sql) => { for (const r of (await c.query(sql)).rows) bad.push(`${label}: ${JSON.stringify(r)}`); };
  await rows("quantity ≠ remaining + sold", `
    SELECT i.id, i.quantity, s.remaining, coalesce(sum(p.quantity) FILTER (WHERE p.status <> 'cancelled'), 0) AS sold
      FROM items i JOIN item_stock s ON s.item_id = i.id LEFT JOIN purchases p ON p.item_id = i.id
     WHERE i.kind = 'shop' GROUP BY i.id, i.quantity, s.remaining
    HAVING i.quantity <> s.remaining + coalesce(sum(p.quantity) FILTER (WHERE p.status <> 'cancelled'), 0)`);
  await rows("guest over limit", `
    SELECT p.item_id, p.participant_id, sum(p.quantity) AS held, i.per_guest_limit
      FROM purchases p JOIN items i ON i.id = p.item_id
     WHERE p.status <> 'cancelled' AND i.per_guest_limit IS NOT NULL
     GROUP BY p.item_id, p.participant_id, i.per_guest_limit HAVING sum(p.quantity) > i.per_guest_limit`);
  await rows("shop item missing stock row", `SELECT i.id FROM items i LEFT JOIN item_stock s ON s.item_id = i.id WHERE i.kind = 'shop' AND s.item_id IS NULL`);
  await rows("auction item has stock or purchases", `
    SELECT i.id FROM items i WHERE i.kind = 'auction' AND (EXISTS (SELECT 1 FROM item_stock s WHERE s.item_id = i.id) OR EXISTS (SELECT 1 FROM purchases p WHERE p.item_id = i.id))`);
  await rows("shop item has bids", `SELECT i.id FROM items i JOIN standings s ON s.item_id = i.id WHERE i.kind = 'shop' AND s.bid_count <> 0`);
  await rows("accepted receipt without its purchase", `
    SELECT r.participant_id, r.request_id FROM purchase_receipts r LEFT JOIN purchases p ON p.participant_id = r.participant_id AND p.request_id = r.request_id
     WHERE r.accepted AND p.id IS NULL`);
  await rows("cancel logged twice", `SELECT purchase_id, count(*) FROM purchase_log WHERE to_status = 'cancelled' GROUP BY purchase_id HAVING count(*) > 1`);
  return bad;
}
```

- [ ] **Step 2: Failing staff tests (append to `tests/db/shop.mjs`, before `await db.end()`)**

```js
import { checkInvariants } from "./invariants.mjs"; // move to the top of the file

await check("staff: committed → paid → picked up; picked up is final; replay is ok", async () => {
  const o = await owner(), { code, itemId, eventId } = await shopEvent(o), g = await guest(code);
  await buy(g, code, itemId, 1);
  let p = (await o("GET", `/api/v1/host/events/${eventId}/purchases`)).data.purchases[0];
  assert.equal(p.status, "committed");
  let r = await o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "paid", revision: p.revision });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "paid", revision: p.revision })).data.replay, true);
  r = await o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "picked_up", revision: r.data.revision });
  assert.equal(r.data.status, "picked_up");
  assert.equal((await o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "cancelled", revision: r.data.revision })).status, 409);
});

await check("staff: committed → picked up directly is refused", async () => {
  const o = await owner(), { code, itemId, eventId } = await shopEvent(o), g = await guest(code);
  await buy(g, code, itemId, 1);
  const p = (await o("GET", `/api/v1/host/events/${eventId}/purchases`)).data.purchases[0];
  assert.equal((await o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "picked_up", revision: p.revision })).status, 409);
});

await check("cancel returns stock exactly once, even when repeated or racing a purchase", async () => {
  const o = await owner(), { code, itemId, eventId } = await shopEvent(o, { quantity: 3 }), g = await guest(code), g2 = await guest(code);
  await buy(g, code, itemId, 3);
  const p = (await o("GET", `/api/v1/host/events/${eventId}/purchases`)).data.purchases[0];
  const [c1, c2, b] = await Promise.all([
    o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "cancelled", revision: p.revision }),
    o("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "cancelled", revision: p.revision }),
    buy(g2, code, itemId, 3),
  ]);
  assert.ok([c1, c2].every(r => r.status === 200), JSON.stringify([c1.data, c2.data]));
  const stockNow = await remaining(itemId), bought = b.data.receipt.accepted ? 3 : 0;
  assert.equal(stockNow, 3 - bought);
  assert.deepEqual(await checkInvariants(db), []);
});

await check("staff can't touch another org's purchase; guests can't change status", async () => {
  const o = await owner(), { code, itemId, eventId } = await shopEvent(o), g = await guest(code);
  await buy(g, code, itemId, 1);
  const p = (await o("GET", `/api/v1/host/events/${eventId}/purchases`)).data.purchases[0];
  assert.equal((await g("POST", `/api/v1/host/purchases/${p.id}/status`, { to: "cancelled", revision: 1 })).status, 401);
});

await check("purchases CSV has one row per purchase and guards formulas", async () => {
  const o = await owner(), { code, itemId, eventId } = await shopEvent(o), g = client(BASE);
  await g("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "=SUM(A1)", businessName: "Co" });
  await buy(g, code, itemId, 1);
  const csv = (await o("GET", `/api/v1/host/events/${eventId}/export/purchases`)).data;
  assert.match(csv, /^Time,Buyer,Business,Item,Quantity,Amount,Status,Pickup/m);
  assert.match(csv, /'=SUM\(A1\)/);
});

await check("invariants hold after everything above", async () => {
  assert.deepEqual(await checkInvariants(db), []);
});
```
Run: `node tests/db/shop.mjs` → the new checks FAIL (404 routes).

- [ ] **Step 3: Implement the staff part in `shop.ts`**

```ts
import { staffFrom, type Staff } from "./auth"; // add to imports
import { ApiError } from "./http";               // add to imports

export type PurchaseStatus = "committed" | "paid" | "picked_up" | "cancelled";
const NEXT: Record<PurchaseStatus, PurchaseStatus[]> = { committed: ["paid", "cancelled"], paid: ["picked_up", "cancelled"], picked_up: [], cancelled: [] };

export async function listPurchases(request: Request, eventId: string): Promise<Response> {
  return json(await tx(async db => {
    const staff = await staffFrom(db, request);
    const e = (await db.query("SELECT id FROM events WHERE id = $1 AND org_id = $2", [id(eventId), staff.orgId])).rows[0];
    if (!e) throw notFound("This event");
    const rows = (await db.query(
      `SELECT p.id, p.item_id, i.title, i.pickup, p.participant_id, x.display_name, x.business_name, p.quantity, p.unit_minor::text, p.amount_minor::text,
              p.status, p.revision, p.created_at, p.updated_at
         FROM purchases p JOIN items i ON i.id = p.item_id JOIN participants x ON x.id = p.participant_id
        WHERE p.event_id = $1 ORDER BY p.created_at DESC`, [e.id])).rows;
    return { purchases: rows.map(r => ({ id: r.id, itemId: r.item_id, itemTitle: r.title, pickup: r.pickup, participantId: r.participant_id,
      name: r.display_name, business: r.business_name, quantity: r.quantity, unitMinor: Number(r.unit_minor), amountMinor: Number(r.amount_minor),
      status: r.status, revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at })) };
  }));
}

/** Staff-only status change. Takes the stock lock for every change so a cancel and a purchase can't interleave. */
export async function setPurchaseStatus(request: Request, purchaseId: string): Promise<Response> {
  const input = await readJson(request);
  const to = input.to as PurchaseStatus;
  if (!["paid", "picked_up", "cancelled"].includes(to) || typeof input.revision !== "number") throw invalid();
  return json(await tx(async db => {
    const staff: Staff = await staffFrom(db, request);
    const target = (await db.query<{ item_id: string; event_id: string }>(
      "SELECT p.item_id, p.event_id FROM purchases p JOIN events e ON e.id = p.event_id WHERE p.id = $1 AND e.org_id = $2", [id(purchaseId), staff.orgId])).rows[0];
    if (!target) throw notFound("This purchase");
    await db.query("SELECT 1 FROM events WHERE id = $1 FOR SHARE", [target.event_id]);
    await db.query("SELECT 1 FROM items WHERE id = $1 FOR SHARE", [target.item_id]);
    await db.query("SELECT 1 FROM item_stock WHERE item_id = $1 FOR UPDATE", [target.item_id]);
    const p = (await db.query<{ status: PurchaseStatus; revision: number; quantity: number }>(
      "SELECT status, revision, quantity FROM purchases WHERE id = $1 FOR UPDATE", [purchaseId])).rows[0];
    if (p.status === to) return { ok: true, status: p.status, revision: p.revision, replay: true };
    if (p.revision !== input.revision) throw conflict("Someone else updated this purchase. Reload to see the latest.");
    if (!NEXT[p.status].includes(to)) throw conflict(`A ${p.status.replace("_", " ")} purchase can't become ${to.replace("_", " ")}.`);
    await db.query("UPDATE purchases SET status = $2, revision = revision + 1, updated_at = now(), updated_by = $3 WHERE id = $1", [purchaseId, to, staff.id]);
    if (to === "cancelled") await db.query("UPDATE item_stock SET remaining = remaining + $2, updated_at = now() WHERE item_id = $1", [target.item_id, p.quantity]);
    await db.query("INSERT INTO purchase_log (purchase_id, from_status, to_status, staff_id) VALUES ($1, $2, $3, $4)", [purchaseId, p.status, to, staff.id]);
    return { ok: true, status: to, revision: p.revision + 1, replay: false };
  }));
}
```
Remove the unused `ApiError` import if typecheck flags it.

- [ ] **Step 4: CSV kind**

In `host.ts`, in the export handler that switches on `results | donations | participants` (around `:925-960`), add a `purchases` branch using the same CSV helper and formula guard the other kinds use:

```ts
    if (kind === "purchases") {
      const rows = (await db.query<{ created_at: Date; display_name: string; business_name: string; title: string; quantity: number; amount_minor: string; status: string; pickup: string }>(
        `SELECT p.created_at, x.display_name, x.business_name, i.title, p.quantity, p.amount_minor::text, p.status, i.pickup
           FROM purchases p JOIN items i ON i.id = p.item_id JOIN participants x ON x.id = p.participant_id
          WHERE p.event_id = $1 ORDER BY p.created_at`, [e.id])).rows;
      return csv(`${e.join_code}-purchases.csv`, [["Time", "Buyer", "Business", "Item", "Quantity", "Amount", "Status", "Pickup"],
        ...rows.map(r => [r.created_at.toISOString(), r.display_name, r.business_name, r.title, r.quantity, formatMoney(Number(r.amount_minor)),
          r.status.replace("_", " "), r.pickup])]);
    }
```
(`csv` = the file's existing CSV response helper; use its exact name.)

- [ ] **Step 5: Routes, run, commit**

```ts
    if (method === "GET" && at("host", "events", "*", "purchases")) return shop.listPurchases(request, p[2]);
    if (method === "POST" && at("host", "purchases", "*", "status")) return shop.setPurchaseStatus(request, p[2]);
```
Run: rebuild, restart, `node tests/db/shop.mjs` → `13/13 passed`.

```bash
git add src/server/v1/shop.ts src/server/v1/host.ts src/app/api/v1/[...path]/route.ts tests/db/shop.mjs tests/db/invariants.mjs
git commit -m "Staff purchase status and cancel (stock returned once), purchases CSV, invariant checker"
```

---

### Task 4: Kind-leak audit — every auction reader handles shop items

**Files:**
- Modify: `src/server/v1/host.ts` (sites below), `src/server/v1/engine.ts` (snapshot), `src/server/v1/simple.ts` (bid form guard)
- Test: `tests/db/shop-kinds.mjs`

**Interfaces:**
- Consumes: `ItemRow` (Task 2).
- Produces: staff item API accepts `kind`, `priceMinor`, `quantity`, `perGuestLimit`, `pickup`; workspace item JSON gains `kind`, `priceMinor`, `quantity`, `remaining`, `sold`, `perGuestLimit`, `pickup`.

Sites (from `grep -n "opening_minor\|standings\|phaseOf(\|closesOf(\|awards" src/server/v1/*.ts`):

| Site | Change |
|---|---|
| `host.ts:136-138` template items | auction only (unchanged), but pass `kind: 'auction'` explicitly |
| `host.ts:168-173` duplicate | copy `kind, quantity, price_minor, per_guest_limit, pickup`; insert `item_stock(remaining = quantity)` for shop |
| `host.ts:184-189` practice reset | also `DELETE FROM purchase_log/purchases/purchase_receipts WHERE event`, `UPDATE item_stock SET remaining = items.quantity` |
| `host.ts:216` event delete | delete purchase tables and `item_stock` before items |
| `host.ts:251-291` workspace | project shop fields; `minimumNextMinor`/`openingMinor` null for shop |
| `host.ts:319-337` live | include `kind`; Live KPIs computed client-side from workspace purchases |
| `host.ts:452-470` `itemInput`/`insertItem` | accept kind fields; require `priceMinor` for shop, `openingMinor` for auction; insert `item_stock` for shop |
| `host.ts:524-556` `updateItem`/`deleteItem` | kind locked once bids or purchases exist; price locked after first sale; quantity ≥ sold, remaining moves by delta under stock lock; delete refuses items with purchases |
| `host.ts:860-877` `decideAward` | refuse `kind = 'shop'` with 409 "Shop items don't have winners." |
| `host.ts:935-942` results CSV | `WHERE i.kind = 'auction'` |
| bulk update/delete (`host.ts:671-718`) | "has bids" guard also treats "has purchases" as protected |
| stage view (`host.stageView`) | `kind = 'auction'` only |
| `engine.ts` snapshot | project shop fields (Task 5) |
| `simple.ts` bid form | render bid form only for `kind === "auction"` |

- [ ] **Step 1: Failing tests**

```js
#!/usr/bin/env node
// tests/db/shop-kinds.mjs — shop items never leak into auction paths, and staff edits keep stock honest.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { appDbUrl, check, client, done, sleep } from "./lib.mjs";
import { checkInvariants } from "./invariants.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3490";
const db = new pg.Client({ connectionString: appDbUrl() }); await db.connect();
const iso = ms => new Date(Date.now() + ms).toISOString();
const ip = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const o = client(BASE, { "x-forwarded-for": ip() });
assert.equal((await o("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD })).status, 200);

async function event(closesInMs = 3_600_000) {
  const e = await o("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Kinds", startsAt: iso(-60_000), endsAt: iso(closesInMs) });
  const shop = await o("POST", `/api/v1/host/events/${e.data.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Gift box", priceMinor: 4000, quantity: 5, perGuestLimit: 2, pickup: "Gift table" });
  const auction = await o("POST", `/api/v1/host/events/${e.data.id}/items`, { requestId: randomUUID(), title: "Cabin", openingMinor: 10_000 });
  const w = await o("GET", `/api/v1/host/events/${e.data.id}`);
  await o("PATCH", `/api/v1/host/events/${e.data.id}`, { revision: w.data.event.revision, status: "live" });
  return { id: e.data.id, code: w.data.event.code, shop: shop.data.id, auction: auction.data.id };
}
const ws = async id => (await o("GET", `/api/v1/host/events/${id}`)).data;

await check("create validates kind fields", async () => {
  const e = await event();
  const bad = [{ kind: "shop", title: "x", quantity: 2 }, { kind: "shop", title: "x", priceMinor: 100, openingMinor: 100 }, { kind: "auction", title: "x", priceMinor: 100 }];
  for (const body of bad) assert.equal((await o("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), ...body })).status, 400, JSON.stringify(body));
});

await check("workspace lists shop items with stock and no auction numbers", async () => {
  const e = await event(), item = (await ws(e.id)).items.find(i => i.id === e.shop);
  assert.equal(item.kind, "shop"); assert.equal(item.priceMinor, 4000); assert.equal(item.remaining, 5); assert.equal(item.sold, 0);
  assert.equal(item.minimumNextMinor, null); assert.equal(item.openingMinor, null);
});

await check("awards refuse shop items", async () => {
  const e = await event(3_000); await sleep(3_500);
  assert.equal((await o("POST", `/api/v1/host/items/${e.shop}/award`, { action: "no_winner", revision: 0 })).status, 409);
});

await check("editing stock: quantity can't go below sold; remaining moves by the same delta", async () => {
  const e = await event(), g = client(BASE);
  await g("POST", `/api/v1/e/${e.code}/join`, { requestId: randomUUID(), displayName: "G", businessName: "B" });
  await g("POST", `/api/v1/e/${e.code}/buy`, { requestId: randomUUID(), itemId: e.shop, quantity: 2 });
  let item = (await ws(e.id)).items.find(i => i.id === e.shop);
  assert.equal((await o("PATCH", `/api/v1/host/items/${e.shop}`, { revision: item.revision, quantity: 1 })).status, 409);
  const ok = await o("PATCH", `/api/v1/host/items/${e.shop}`, { revision: item.revision, quantity: 8 });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  item = (await ws(e.id)).items.find(i => i.id === e.shop);
  assert.equal(item.remaining, 6); assert.equal(item.sold, 2);
  assert.equal((await o("PATCH", `/api/v1/host/items/${e.shop}`, { revision: item.revision, priceMinor: 5000 })).status, 409, "price locked after first sale");
  assert.equal((await o("PATCH", `/api/v1/host/items/${e.shop}`, { revision: item.revision, kind: "auction", openingMinor: 100 })).status, 409, "kind locked");
  assert.equal((await o("DELETE", `/api/v1/host/items/${e.shop}`)).status, 409, "items with purchases can't be deleted");
});

await check("duplicate copies shop items at full stock with no purchases", async () => {
  const e = await event(), g = client(BASE);
  await g("POST", `/api/v1/e/${e.code}/join`, { requestId: randomUUID(), displayName: "G", businessName: "B" });
  await g("POST", `/api/v1/e/${e.code}/buy`, { requestId: randomUUID(), itemId: e.shop, quantity: 1 });
  const copy = await o("POST", `/api/v1/host/events/${e.id}/duplicate`, { requestId: randomUUID() });
  const item = (await ws(copy.data.id)).items.find(i => i.kind === "shop");
  assert.equal(item.remaining, 5); assert.equal(item.sold, 0); assert.equal(item.pickup, "Gift table"); assert.equal(item.perGuestLimit, 2);
});

await check("practice reset deletes purchases and restores stock", async () => {
  const e = await event();
  await db.query("UPDATE events SET is_practice = true WHERE id = $1", [e.id]);
  const g = client(BASE);
  await g("POST", `/api/v1/e/${e.code}/join`, { requestId: randomUUID(), displayName: "G", businessName: "B" });
  await g("POST", `/api/v1/e/${e.code}/buy`, { requestId: randomUUID(), itemId: e.shop, quantity: 2 });
  const r = await o("POST", `/api/v1/host/events/${e.id}/reset`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await db.query("SELECT count(*)::int n FROM purchases WHERE event_id = $1", [e.id])).rows[0].n, 0);
  assert.equal((await db.query("SELECT remaining FROM item_stock WHERE item_id = $1", [e.shop])).rows[0].remaining, 5);
});

await check("results CSV and stage list auction items only", async () => {
  const e = await event();
  const csv = (await o("GET", `/api/v1/host/events/${e.id}/export/results`)).data;
  assert.doesNotMatch(csv, /Gift box/);
  const stage = (await o("GET", `/api/v1/host/events/${e.id}/stage`)).data;
  assert.ok(!JSON.stringify(stage).includes("Gift box"));
});

await check("invariants hold", async () => assert.deepEqual(await checkInvariants(db), []));
await db.end();
done();
```
Before writing, confirm the exact reset and duplicate routes with `grep -n '"reset"\|"duplicate"' src/app/api/v1/[...path]/route.ts` and adjust the two paths above to match.

Run: `node tests/db/shop-kinds.mjs` → FAIL.

- [ ] **Step 2: `itemInput` / `insertItem` (`host.ts:440-470`)**

Extend the input parser to read the kind fields and validate them as a pair; then insert stock for shop items:

```ts
  if ("kind" in input) { if (input.kind !== "auction" && input.kind !== "shop") throw invalid(); out.kind = input.kind; }
  if ("priceMinor" in input) out.price_minor = input.priceMinor === null ? null : String(cents(input.priceMinor));
  if ("quantity" in input) { const q = input.quantity; if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 10000) throw invalid("Quantity is 1 to 10,000."); out.quantity = q; }
  if ("perGuestLimit" in input) { const l = input.perGuestLimit; if (l !== null && (typeof l !== "number" || !Number.isInteger(l) || l < 1 || l > 10000)) throw invalid("Limit is 1 to 10,000, or none."); out.per_guest_limit = l; }
  if ("pickup" in input) out.pickup = str(input.pickup, 200);
```
In `insertItem`, replace the `if (!i.title || !i.opening_minor)` guard with:

```ts
  const kind = i.kind ?? "auction";
  if (!i.title) throw invalid("Add a title.");
  if (kind === "auction" && (!i.opening_minor || i.price_minor || i.per_guest_limit)) throw invalid("Add a starting amount.");
  if (kind === "shop" && (!i.price_minor || i.opening_minor || i.increment_override_minor)) throw invalid("Add a price.");
```
add `kind, quantity, price_minor, per_guest_limit, pickup` to the INSERT column list and values (`quantity` defaults to `1` for auction, `i.quantity ?? 1` for shop), and after the standings insert:

```ts
  if (kind === "shop") await db.query("INSERT INTO item_stock (item_id, event_id, remaining) VALUES ($1, $2, $3)", [row.id, e.id, i.quantity ?? 1]);
```

- [ ] **Step 3: `updateItem` (`host.ts:524-552`)**

After loading `item` (already `FOR UPDATE`), compute `sold` under the stock lock and enforce the rules before the UPDATE:

```ts
    const stock = item.kind === "shop"
      ? (await db.query<{ remaining: number }>("SELECT remaining FROM item_stock WHERE item_id = $1 FOR UPDATE", [item.id])).rows[0] : null;
    const sold = stock ? item.quantity - stock.remaining : 0;
    const hasBids = (await db.query<{ bid_count: number }>("SELECT bid_count FROM standings WHERE item_id = $1", [item.id])).rows[0].bid_count > 0;
    if (next.kind !== item.kind && (hasBids || sold > 0)) throw conflict("The type is fixed once an item has bids or purchases.");
    if (item.kind === "shop" && sold > 0 && next.price_minor !== item.price_minor) throw conflict("The price is locked after the first sale.");
    if (next.kind === "shop" && next.quantity < sold) throw conflict(`${sold} already sold. Quantity can't go below that.`);
```
After the UPDATE:

```ts
    if (item.kind === "auction" && next.kind === "shop") await db.query("INSERT INTO item_stock (item_id, event_id, remaining) VALUES ($1, $2, $3)", [item.id, item.event_id, next.quantity]);
    else if (item.kind === "shop" && next.kind === "auction") await db.query("DELETE FROM item_stock WHERE item_id = $1", [item.id]);
    else if (stock) await db.query("UPDATE item_stock SET remaining = $2 - $3, updated_at = now() WHERE item_id = $1", [item.id, next.quantity, sold]);
```
Switching kind also resets the other kind's fields (`opening_minor`/`price_minor`/`per_guest_limit`/`quantity = 1`) so `items_kind_fields` holds. In `deleteItem` (`:556`), refuse when purchases exist and delete `item_stock` before the item:

```ts
    if ((await db.query("SELECT 1 FROM purchases WHERE item_id = $1 LIMIT 1", [itemId])).rows.length) throw conflict("This item has purchases. Hide it instead.");
    await db.query("DELETE FROM item_stock WHERE item_id = $1", [itemId]);
```

- [ ] **Step 4: Duplicate, reset, event delete, bulk, award, CSV, stage, workspace**

Apply each row of the sites table. Exact snippets:

```ts
// duplicate (host.ts:168-173): add columns to the INSERT … SELECT copy, then:
if (i.kind === "shop") await db.query("INSERT INTO item_stock (item_id, event_id, remaining) VALUES ($1, $2, $3)", [created.id, copy.id, i.quantity]);

// practice reset (host.ts:184-189), before the awards delete:
await db.query("DELETE FROM purchase_log WHERE purchase_id IN (SELECT id FROM purchases WHERE event_id = $1)", [eventId]);
await db.query("DELETE FROM purchases WHERE event_id = $1", [eventId]);
await db.query("DELETE FROM purchase_receipts WHERE item_id IN (SELECT id FROM items WHERE event_id = $1)", [eventId]);
await db.query("UPDATE item_stock s SET remaining = i.quantity, updated_at = now() FROM items i WHERE i.id = s.item_id AND i.event_id = $1", [eventId]);

// event delete (host.ts:216), same four deletes, plus:
await db.query("DELETE FROM item_stock WHERE event_id = $1", [e.id]);

// decideAward (after loading item):
if (item.kind !== "auction") throw conflict("Shop items don't have winners. See Shop → Purchases.");

// results CSV (host.ts:936-938): add  AND i.kind = 'auction'  to the WHERE
// stage view: add  AND i.kind = 'auction'  to its items query
// bulk delete/update "has bids" guard: also protect items with purchases:
//   EXISTS (SELECT 1 FROM purchases p WHERE p.item_id = i.id)
```
Workspace projection (`host.ts:251-291`): select stock with a LEFT JOIN and project shop fields:

```ts
      `SELECT i.*, s.current_minor, s.bid_count, s.leader_id, st.remaining
         FROM items i JOIN standings s ON s.item_id = i.id LEFT JOIN item_stock st ON st.item_id = i.id …`
// in the map:
          kind: i.kind, priceMinor: i.price_minor === null ? null : Number(i.price_minor), quantity: i.quantity,
          remaining: i.kind === "shop" ? i.remaining : null, sold: i.kind === "shop" ? i.quantity - i.remaining : 0,
          perGuestLimit: i.per_guest_limit, pickup: i.pickup,
          openingMinor: i.opening_minor === null ? null : Number(i.opening_minor),
          minimumNextMinor: i.kind !== "auction" || i.withdrawn_at ? null : minimumNext(current, Number(i.opening_minor), rules, override),
```
Add `purchases` (same shape as `listPurchases`) to the workspace payload so Studio has one source; keep `GET …/purchases` for the Pickup desk refresh.

- [ ] **Step 5: Run everything that touches items**

Run: rebuild, restart; `node tests/db/shop-kinds.mjs && node tests/db/shop.mjs && node tests/v1/journey.mjs | tail -1 && node tests/v1/items-ui.mjs | tail -1`
Expected: `8/8`, `13/13`, `55/55`, items-ui all pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/v1/host.ts src/server/v1/engine.ts src/server/v1/simple.ts tests/db/shop-kinds.mjs
git commit -m "Kind-aware item lifecycle: create/edit/stock/duplicate/reset/delete; shop items stay out of auction paths"
```

---

### Task 5: Snapshot projection and guest model

**Files:**
- Modify: `src/server/v1/engine.ts` (`buildSnapshot`), `src/app/e/[code]/model.ts`
- Test: append to `tests/db/shop-kinds.mjs`

**Interfaces:**
- Produces (guest `Item`): `kind: "auction" | "shop"`, `priceMinor: number | null`, `remaining: number | null`, `perGuestLimit: number | null`, `pickup: string`, `myQuantity: number`. For shop items `openingMinor`, `currentMinor`, `minimumNextMinor` are `null` and `bidHistory` is `[]`.
- Produces (guest `Me`): `purchases: Purchase[]` where `type Purchase = { id: string; itemId: string; title: string; quantity: number; amountMinor: number; status: "committed" | "paid" | "picked_up" | "cancelled"; pickup: string; createdAt: string }`.
- Produces (`model.ts`): `type PendingBuy = { requestId: string; itemId: string; quantity: number }`, `readPendingBuys(key)`, `writePendingBuy(key, itemId, p | null)`, `clearPendingBuy(key, requestId)` — same shape and semantics as the bid helpers added in `e3c6930`.

- [ ] **Step 1: Failing test (append)**

```js
await check("guest snapshot: shop fields, my quantity and purchases; no auction numbers on shop items", async () => {
  const e = await event(), g = client(BASE);
  await g("POST", `/api/v1/e/${e.code}/join`, { requestId: randomUUID(), displayName: "G", businessName: "B" });
  await g("POST", `/api/v1/e/${e.code}/buy`, { requestId: randomUUID(), itemId: e.shop, quantity: 2 });
  const s = (await g("GET", `/api/v1/e/${e.code}`)).data, item = s.items.find(i => i.id === e.shop);
  assert.equal(item.kind, "shop"); assert.equal(item.priceMinor, 4000); assert.equal(item.remaining, 3); assert.equal(item.myQuantity, 2);
  assert.equal(item.pickup, "Gift table"); assert.equal(item.minimumNextMinor, null); assert.deepEqual(item.bidHistory, []);
  assert.equal(s.me.purchases.length, 1); assert.equal(s.me.purchases[0].amountMinor, 8000); assert.equal(s.me.purchases[0].status, "committed");
});
```

- [ ] **Step 2: Implement**

In `buildSnapshot`: load `item_stock` for the event into a map; for `me`, load held quantities per item and the purchase list:

```ts
  const stock = new Map((await db.query<{ item_id: string; remaining: number }>("SELECT item_id, remaining FROM item_stock WHERE event_id = $1", [e.id])).rows.map(r => [r.item_id, r.remaining]));
  // inside if (me):
    const held = (await db.query<{ item_id: string; q: number }>(
      "SELECT item_id, sum(quantity)::int AS q FROM purchases WHERE participant_id = $1 AND status <> 'cancelled' GROUP BY item_id", [me.id])).rows;
    const purchases = (await db.query<{ id: string; item_id: string; title: string; quantity: number; amount_minor: string; status: string; pickup: string; created_at: Date }>(
      `SELECT p.id, p.item_id, i.title, p.quantity, p.amount_minor::text, p.status, i.pickup, p.created_at
         FROM purchases p JOIN items i ON i.id = p.item_id WHERE p.participant_id = $1 ORDER BY p.created_at DESC`, [me.id])).rows;
```
In the item map, branch on `i.kind`: shop items get `kind, priceMinor, remaining: stock.get(i.id) ?? 0, perGuestLimit, pickup, myQuantity` and null auction fields with `bidHistory: []`; auction items get `kind: "auction"`, `priceMinor: null`, `remaining: null`, `perGuestLimit: null`, `pickup: ""`, `myQuantity: 0` plus everything they have today. Add `purchases` to `me`. Mirror the types in `model.ts` and add the `PendingBuy` helpers next to `readPendingBids`/`writePendingBid`/`clearPendingRequest`.

- [ ] **Step 3: Run, typecheck, commit**

Run: `pnpm typecheck`, rebuild, `node tests/db/shop-kinds.mjs` → `9/9`; `node tests/v1/recovery.mjs` → `6/6`.

```bash
git add src/server/v1/engine.ts src/app/e/[code]/model.ts tests/db/shop-kinds.mjs
git commit -m "Guest snapshot: shop fields, my quantity, my purchases"
```

---

### Task 6: Guest shell B — Browse · Mine · Event with Bid / Shop / Give

**Files:**
- Modify: `src/app/e/[code]/guest-shell.tsx`, `src/app/e/[code]/participant.tsx` (route parsing), `src/app/e/[code]/participant.css`
- Create: `src/app/e/[code]/browse.tsx`
- Test: `tests/v1/shop-ui.mjs` (guest part)

**Interfaces:**
- Consumes: `Item`, `Me.purchases` (Task 5).
- Produces: `type Section = "browse" | "mine" | "event"`; `type Filter = "bid" | "shop" | "give"`; URL `?s=browse&f=shop&i=<id>`. `nav.tab(section)`, `nav.filter(f)` (new), `nav.openItem(id)` unchanged.

Design source: `prototypes/bid-shop-give/js/guest.js` functions for variant `b` (`browseB`, `modeCards`, `bidRows`, `shopGrid`, `causeCards`) and `css/guest.css` `.g-b` rules. Port anatomy and CSS values; replace prototype tokens with the app's existing participant tokens; keep the app's existing `ItemArt`/`FramedPhoto` for images.

- [ ] **Step 1: Failing UI test**

```js
#!/usr/bin/env node
// tests/v1/shop-ui.mjs — guest Browse/Shop/Mine and Studio Shop, Chromium + WebKit, 390px.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, webkit, expect } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3490";
const iso = ms => new Date(Date.now() + ms).toISOString();
let failed = 0;
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch(), staff = await browser.newContext();
  const call = async (method, path, data) => { const r = await staff.request.fetch(BASE + path, { method, headers: { Origin: BASE }, data }); const b = await r.json(); assert.ok(r.ok(), JSON.stringify(b)); return b; };
  try {
    await call("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
    const e = await call("POST", "/api/v1/host/events", { requestId: randomUUID(), name: `Shop UI ${engine.name()}`, startsAt: iso(-60_000), endsAt: iso(3_600_000) });
    await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), title: "Cabin weekend", openingMinor: 10_000 });
    const gift = await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Holiday gift box", priceMinor: 4000, quantity: 20, perGuestLimit: 2, pickup: "Gift table" });
    await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Mini wreath", priceMinor: 2800, quantity: 1 });
    await call("POST", `/api/v1/host/events/${e.id}/recipients`, { name: "Food Bank" });
    let w = await call("GET", `/api/v1/host/events/${e.id}`);
    await call("PATCH", `/api/v1/host/events/${e.id}`, { revision: w.event.revision, status: "live", donationsEnabled: true });
    w = await call("GET", `/api/v1/host/events/${e.id}`);
    const code = w.event.code;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }), page = await ctx.newPage(), errors = [];
    page.on("pageerror", err => { if (!/due to access control checks/.test(err.message)) errors.push(err.message); });
    await page.goto(`${BASE}/e/${code}`);
    await page.getByLabel("Your name").fill("Jo Park"); await page.getByLabel("Business name").fill("Park & Co");
    await page.getByRole("button", { name: "Join", exact: true }).click();

    // Tabs and filters
    const tabs = page.getByRole("navigation", { name: "Sections" });
    await expect(tabs.getByRole("button")).toHaveText(["Browse", "Mine", "Event"]);
    await page.getByRole("tab", { name: /Shop/ }).click();
    await expect(page).toHaveURL(/s=browse&f=shop|f=shop/);
    await expect(page.getByText("Holiday gift box")).toBeVisible();
    await expect(page.getByText("Sold out")).toHaveCount(0);
    await expect(page.getByText("1 left")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tab", { name: /Shop/, selected: true })).toBeVisible();

    // Legacy URLs
    for (const [legacy, expectSel] of [["?s=items", /Bid/], ["?s=give", /Give/]]) {
      await page.goto(`${BASE}/e/${code}${legacy}`);
      await expect(page.getByRole("tab", { name: expectSel, selected: true })).toBeVisible();
    }
    await page.goto(`${BASE}/e/${code}?s=watching`);
    await expect(tabs.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-current", "page");
    await page.goto(`${BASE}/e/${code}?s=items&i=${gift.id}`);
    await expect(page.getByRole("heading", { name: "Holiday gift box" })).toBeVisible();

    assert.deepEqual(errors, []);
    console.log(`ok   ${engine.name()}: tabs, filters, URL and reload, legacy links`);
  } catch (err) { failed++; console.log(`FAIL ${engine.name()}: ${err.message.split("\n").slice(0, 6).join("\n     ")}`); }
  finally { await browser.close(); }
}
process.exitCode = failed ? 1 : 0;
```
Run: `node tests/v1/shop-ui.mjs` → FAIL.

- [ ] **Step 2: Routing**

In `participant.tsx`, replace the route parser (`:28-32`) with:

```ts
export type Section = "browse" | "mine" | "event";
export type Filter = "bid" | "shop" | "give";
type Route = { s: Section; f: Filter; i: string | null };
const LEGACY: Record<string, Partial<Route>> = { items: { s: "browse", f: "bid" }, give: { s: "browse", f: "give" }, watching: { s: "mine" } };
const FILTER_KEY = (code: string) => `bz_filter_${code}`;
function routeOf(code: string): Route {
  const q = new URLSearchParams(location.search), raw = q.get("s") ?? "", legacy = LEGACY[raw] ?? {};
  const s = (["browse", "mine", "event"].includes(raw) ? raw : legacy.s ?? "browse") as Section;
  let saved: string | null = null; try { saved = localStorage.getItem(FILTER_KEY(code)); } catch { /* storage unavailable */ }
  const fRaw = q.get("f") ?? legacy.f ?? saved ?? "bid";
  return { s, f: (["bid", "shop", "give"].includes(fRaw) ? fRaw : "bid") as Filter, i: q.get("i") };
}
const urlOf = (r: Route) => `${location.pathname}?${new URLSearchParams({ s: r.s, ...(r.s === "browse" ? { f: r.f } : {}), ...(r.i ? { i: r.i } : {}) })}`;
```
Add `nav.filter = (f: Filter) => { try { localStorage.setItem(FILTER_KEY(code), f); } catch {} ; push({ ...route, s: "browse", f, i: null }); }` next to `nav.tab`.

- [ ] **Step 3: Shell and Browse**

In `guest-shell.tsx`, tabs become `["browse", "mine", "event"]` with labels `Browse`, `Mine`, `Event` and icons `IGrid`, `ITicket`, `IInfo`; the Mine dot counts outbid + won + purchases ready to collect. The Browse screen renders `<Browse … />` from `browse.tsx`:

```tsx
export function Browse({ snap, now, nav, filter, pending, stale }: { snap: Snapshot; now: number; nav: Nav; filter: Filter; pending: PendingBid[]; stale: boolean }) {
  const bid = snap.items.filter(i => i.kind === "auction"), shop = snap.items.filter(i => i.kind === "shop");
  const give = snap.event.donations.enabled;
  const modes: { id: Filter; label: string; sub: string }[] = [
    { id: "bid", label: "Bid", sub: `${bid.filter(i => i.phase === "open").length} open` },
    ...(shop.length ? [{ id: "shop" as const, label: "Shop", sub: `${shop.filter(i => (i.remaining ?? 0) > 0).length} available` }] : []),
    ...(give ? [{ id: "give" as const, label: "Give", sub: `${snap.event.donations.recipients.length} causes` }] : []),
  ];
  return (
    <>
      <div className="br-modes" role="tablist" aria-label="Browse">
        {modes.map(m => <button key={m.id} type="button" role="tab" aria-selected={filter === m.id} className={`br-mode${filter === m.id ? " on" : ""}`} onClick={() => nav.filter(m.id)}><b>{m.label}</b><small>{m.sub}</small></button>)}
      </div>
      {filter === "bid" && <BidRows items={bid} now={now} nav={nav} pending={pending} stale={stale} />}
      {filter === "shop" && <ShopGrid items={shop} nav={nav} />}
      {filter === "give" && <CauseCards snap={snap} nav={nav} />}
    </>
  );
}
```
`BidRows` reuses the existing `Catalog` list item markup in its compact row form (port `.g-b .bid-row` from the prototype). `ShopGrid` renders a two-column grid: photo/art, title, `formatMoney(priceMinor)`, and a stock line: `remaining === 0 ? "Sold out" : remaining <= 5 ? `${remaining} left` : ""`. `CauseCards` renders the existing `Give` component's recipients as one-tap cards that open the existing donation review (keep `give.tsx` logic, including the held-pledge recovery from `e3c6930`). If shop has no items, the Shop mode card is absent and `f=shop` falls back to `bid`.

CSS: port `.g-b .modes`, `.g-b .shop-grid`, `.g-b .bid-row`, `.g-b .cause` into `participant.css` under `.br-*` class names, using existing participant tokens. No `backdrop-filter`; no `color-mix()` without a solid fallback first.

- [ ] **Step 4: Run, commit**

Run: rebuild; `node tests/v1/shop-ui.mjs` → `ok` both engines; `node tests/v1/recovery.mjs` → `6/6` (its selectors use `Items` and `?s=give`; update them to `Browse`/`f=give` in the same commit if they break, keeping their assertions identical).

```bash
git add src/app/e/[code] tests/v1/shop-ui.mjs tests/v1/recovery.mjs
git commit -m "Guest B shell: Browse · Mine · Event with Bid / Shop / Give, legacy links mapped"
```

---

### Task 7: Shop item page and buy sheet (with lost-reply recovery)

**Files:**
- Create: `src/app/e/[code]/buy-sheet.tsx`
- Modify: `src/app/e/[code]/item.tsx`, `src/app/e/[code]/participant.tsx`
- Test: `tests/v1/buy.mjs`

**Interfaces:**
- Consumes: `PendingBuy` helpers (Task 5), `POST …/buy`, `GET …/purchase/:id` (Task 2).
- Produces: `<BuySheet item code me pendingKey onPending onClose onSettled notify />`; `ResumePendingBuys` (same contract as `ResumePending` for bids).

Design source: prototype `js/guest.js` `buySheet` (pick → review → sending → done / refused / uncertain). Structure and focus/overlay code: copy from `sheet.tsx` (fixed overlay, inert background, focus trap, scroll restore, sending protection) — do not use `<dialog>`.

- [ ] **Step 1: Failing browser test**

```js
#!/usr/bin/env node
// tests/v1/buy.mjs — buy sheet in Chromium + WebKit: limit stepper, sold-out race, lost reply, reload.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, webkit, expect } from "@playwright/test";
import pg from "pg";
import { appDbUrl } from "../db/lib.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3490";
const db = new pg.Client({ connectionString: appDbUrl() }); await db.connect();
const iso = ms => new Date(Date.now() + ms).toISOString();
let failed = 0;
async function setup(browser, label) {
  const staff = await browser.newContext();
  const call = async (method, path, data) => { const r = await staff.request.fetch(BASE + path, { method, headers: { Origin: BASE }, data }); const b = await r.json(); assert.ok(r.ok(), JSON.stringify(b)); return b; };
  await call("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  const e = await call("POST", "/api/v1/host/events", { requestId: randomUUID(), name: `Buy ${label}`, startsAt: iso(-60_000), endsAt: iso(3_600_000) });
  const gift = await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Holiday gift box", priceMinor: 4000, quantity: 20, perGuestLimit: 2, pickup: "Gift table, until 8 PM" });
  const candle = await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Candle trio", priceMinor: 3200, quantity: 1 });
  let w = await call("GET", `/api/v1/host/events/${e.id}`);
  await call("PATCH", `/api/v1/host/events/${e.id}`, { revision: w.event.revision, status: "live" });
  w = await call("GET", `/api/v1/host/events/${e.id}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }), page = await ctx.newPage(), errors = [];
  page.on("pageerror", err => { if (!/due to access control checks/.test(err.message)) errors.push(err.message); });
  await page.goto(`${BASE}/e/${w.event.code}`);
  await page.getByLabel("Your name").fill("Jo Park"); await page.getByLabel("Business name").fill("Park & Co");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  return { page, errors, code: w.event.code, eventId: e.id, gift: gift.id, candle: candle.id, close: () => Promise.all([staff.close(), ctx.close()]) };
}
const count = async itemId => (await db.query("SELECT coalesce(sum(quantity),0)::int n FROM purchases WHERE item_id = $1 AND status <> 'cancelled'", [itemId])).rows[0].n;

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  const run = async (name, fn) => { try { await fn(); console.log(`ok   ${engine.name()}: ${name}`); } catch (err) { failed++; console.log(`FAIL ${engine.name()}: ${name}\n     ${err.message.split("\n").slice(0, 6).join("\n     ")}`); } };
  try {
    await run("buy 2 with the stepper capped at the limit; then the item says the limit is reached", async () => {
      const t = await setup(browser, `${engine.name()} limit`);
      try {
        await t.page.goto(`${BASE}/e/${t.code}?s=browse&f=shop&i=${t.gift}`);
        await t.page.getByRole("button", { name: /^Buy/ }).click();
        const sheet = t.page.getByRole("dialog");
        await sheet.getByRole("button", { name: "More" }).click();
        await expect(sheet.getByRole("button", { name: "More" })).toBeDisabled();
        await sheet.getByRole("button", { name: /^Review/ }).click();
        await expect(sheet.getByText("Gift table, until 8 PM")).toBeVisible();
        await sheet.getByRole("button", { name: /^Confirm \$80/ }).click();
        await expect(sheet.getByRole("heading", { name: /You.re buying|Bought/ })).toBeVisible();
        await sheet.getByRole("button", { name: "Done" }).click();
        await expect(t.page.getByText("You’ve reached the limit")).toBeVisible();
        assert.equal(await count(t.gift), 2); assert.deepEqual(t.errors, []);
      } finally { await t.close(); }
    });
    await run("last unit sells while the sheet is open: 'Just sold out', nothing bought", async () => {
      const t = await setup(browser, `${engine.name()} race`);
      try {
        await t.page.goto(`${BASE}/e/${t.code}?s=browse&f=shop&i=${t.candle}`);
        await t.page.getByRole("button", { name: /^Buy/ }).click();
        const sheet = t.page.getByRole("dialog");
        await sheet.getByRole("button", { name: /^Review/ }).click();
        // Another guest buys the last unit while this sheet is on review.
        const other = await browser.newContext();
        await other.request.fetch(`${BASE}/api/v1/e/${t.code}/join`, { method: "POST", headers: { Origin: BASE }, data: { requestId: randomUUID(), displayName: "Sam", businessName: "Ortiz" } });
        const won = await other.request.fetch(`${BASE}/api/v1/e/${t.code}/buy`, { method: "POST", headers: { Origin: BASE }, data: { requestId: randomUUID(), itemId: t.candle, quantity: 1 } });
        assert.equal(won.status(), 201); await other.close();
        await sheet.getByRole("button", { name: /^Confirm/ }).click();
        await expect(sheet.getByText("Just sold out")).toBeVisible();
        await expect(sheet.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
        assert.equal(await count(t.candle), 1, "only the other guest's purchase");
      } finally { await t.close(); }
    });
    await run("lost reply: 'Check my purchase' finds the one purchase; a reload keeps it pending until checked", async () => {
      const t = await setup(browser, `${engine.name()} lost`);
      try {
        await t.page.goto(`${BASE}/e/${t.code}?s=browse&f=shop&i=${t.gift}`);
        await t.page.route("**/api/v1/e/*/buy", async route => { await route.fetch(); await route.abort(); });
        await t.page.getByRole("button", { name: /^Buy/ }).click();
        const sheet = t.page.getByRole("dialog");
        await sheet.getByRole("button", { name: /^Review/ }).click();
        await sheet.getByRole("button", { name: /^Confirm/ }).click();
        await expect(sheet.getByRole("button", { name: "Check my purchase" })).toBeVisible();
        await expect(sheet.getByRole("button", { name: /^Confirm/ })).toHaveCount(0);
        await t.page.unroute("**/api/v1/e/*/buy");
        await t.page.reload();
        await expect(t.page.getByText(/purchase went through/)).toBeVisible();
        assert.equal(await count(t.gift), 1);
      } finally { await t.close(); }
    });
  } finally { await browser.close(); }
}
await db.end();
process.exitCode = failed ? 1 : 0;
```
Run: `node tests/v1/buy.mjs` → FAIL.

- [ ] **Step 2: Item page**

In `item.tsx`, when `item.kind === "shop"`, render: title, price (`formatMoney(item.priceMinor!)`), stock line (`Sold out` / `N left` / blank), limit line (`Limit ${item.perGuestLimit} per guest` + `· you have ${item.myQuantity}` when > 0), pickup line, description, and an action bar with one primary button:
- `remaining === 0` → disabled `Sold out`
- limit reached → disabled `You’ve reached the limit`
- phase `scheduled`/`closed` → disabled `Opens …` / `Buying has closed`
- pending buy for this item → `Check purchase status`
- else `Buy · ${formatMoney(priceMinor)}`.
Never render bid history, "No bids yet", or the bid action bar for shop items.

- [ ] **Step 3: Buy sheet**

`buy-sheet.tsx` states: `"pick" | "review" | "sending" | "done" | "refused" | "uncertain"`. Max quantity = `min(remaining, (perGuestLimit ?? Infinity) - myQuantity, 100)`. Buttons are labelled `Fewer`/`More` (aria-labels) and the step text is `"Review · " + formatMoney(price × q)`. On confirm: create `{ requestId: newId(), itemId, quantity }`, `writePendingBuy` **before** `fetch`, POST; on receipt → `clearPendingBuy`, then `done` (accepted) or `refused` with copy: `SOLD_OUT` → "Just sold out" (if `remaining` > 0 add "Only N left"), `LIMIT_REACHED` → "You’ve reached the limit", `CLOSED` → "Buying has closed", `NOT_OPEN` → "Buying hasn’t opened yet", `PAUSED` → "Staff paused your account. Ask at the desk.", `NOT_AVAILABLE` → "This item isn’t available". On 5xx/network → `uncertain` with only `Check my purchase`, which GETs the receipt and, when `null`, resends the **same** request. Done copy: "You’re buying {q} × {title}. Pay and pick up at {pickup}." `ResumePendingBuys` mirrors `ResumePending`: on reload, resolve each pending buy; `null` keeps it pending with "Your purchase isn’t confirmed yet. Open the item and tap Check purchase status."

- [ ] **Step 4: Run, commit**

Run: rebuild; `node tests/v1/buy.mjs` → 3 ok per engine; `node tests/v1/bid-sheet.mjs` → `2/2 engines passed`; `pnpm compat` → 0 blocking.

```bash
git add src/app/e/[code] tests/v1/buy.mjs
git commit -m "Shop item page and buy sheet: limit stepper, refusals, lost-reply recovery"
```

---

### Task 8: Mine — purchases grouped by pickup place

**Files:**
- Modify: `src/app/e/[code]/mine.tsx`
- Test: append to `tests/v1/shop-ui.mjs`

- [ ] **Step 1: Failing check (append inside the engine loop, after the legacy-URL checks)**

```js
    await call("POST", `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), kind: "shop", title: "Cookie tin", priceMinor: 1500, quantity: 9, pickup: "Gift table" });
    const snapItems = (await (await ctx.request.get(`${BASE}/api/v1/e/${code}`)).json()).items;
    for (const title of ["Holiday gift box", "Cookie tin"]) {
      const item = snapItems.find(i => i.title === title);
      await ctx.request.fetch(`${BASE}/api/v1/e/${code}/buy`, { method: "POST", headers: { Origin: BASE }, data: { requestId: randomUUID(), itemId: item.id, quantity: 1 } });
    }
    await page.goto(`${BASE}/e/${code}?s=mine`);
    const group = page.getByRole("region", { name: /Gift table/ });
    await expect(group.getByText("Holiday gift box")).toBeVisible();
    await expect(group.getByText("Cookie tin")).toBeVisible();
    await expect(group.getByText(/\$55/)).toBeVisible();
    await expect(page.getByText("To pick up")).toBeVisible();
```

- [ ] **Step 2: Implement**

Mine sections, in order: **Bids** (existing groups), **To pick up** (purchases with status `committed`/`paid`, grouped by `pickup`, blank pickup grouped as "Ask staff"; each group is a `<section aria-label={place}>` listing `q × title · amount` and a group total; status chip `To pay`/`Paid`), **Picked up**, **Cancelled** (muted, with "Cancelled by staff"), **Donations**, **Watching** (moved from the old Watching tab). Port `.g-b .pickup-group` from the prototype.

- [ ] **Step 3: Run, commit**

```bash
node tests/v1/shop-ui.mjs
git add src/app/e/[code]/mine.tsx src/app/e/[code]/participant.css tests/v1/shop-ui.mjs
git commit -m "Mine: purchases grouped by pickup place; watching moves into Mine"
```

---

### Task 9: Simple mode buy path

**Files:**
- Modify: `src/server/v1/simple.ts`
- Test: append to `tests/v1/simple-ui.mjs` (its existing structure)

- [ ] **Step 1: Failing check**

Add to `tests/v1/simple-ui.mjs`, in each engine's JavaScript-disabled journey: create a shop item (`kind: "shop"`, `priceMinor: 1500`, `quantity: 3`, `perGuestLimit: 1`), open `/e/<code>/simple?item=<id>`, submit the buy form with quantity 1, assert the page shows "You’re buying 1 × …", resubmit the **same** form (browser back + submit) and assert exactly one purchase via the staff purchases API, then submit a fresh form and assert "You’ve reached the limit".

- [ ] **Step 2: Implement**

In `simpleGet`, list shop items in their own "Shop" section with price and stock; the item view for `kind === "shop"` renders:

```ts
`<form method="post" action="${base}">${hidden("action", "buy")}${hidden("requestId", uuid(null))}${hidden("itemId", item.id)}
  <label>Quantity <input name="quantity" inputmode="numeric" value="1" required></label>
  <button>Buy at ${esc(formatMoney(item.priceMinor))} each</button></form>`
```
In `simplePost`, handle `action === "buy"` exactly like the bid branch: build a JSON `Request` to `buy(...)` with `{ requestId, itemId, quantity: Number(quantity) }`, render the receipt (accepted / refusal copy from Task 7) and on 5xx render the uncertain page whose only button resubmits the same `requestId`. Never render a bid form for shop items (Task 4 guard).

- [ ] **Step 3: Run, commit**

```bash
node tests/v1/simple-ui.mjs   # expect 2/2 simple-mode journeys passed
git add src/server/v1/simple.ts tests/v1/simple-ui.mjs
git commit -m "Simple mode: buy shop items with request-id replay"
```

---

### Task 10: Studio B — Shop mode with the sidebar kept

**Files:**
- Create: `src/app/studio/[id]/shop.tsx`
- Modify: `src/app/studio/[id]/studio.tsx`, `src/app/studio/[id]/setup.tsx` (Outline, ItemPanel), `src/app/studio/data.ts`, `src/app/studio/studio.css`, `src/app/studio/[id]/live.tsx`, `src/app/studio/[id]/results.tsx`, `src/app/studio/[id]/items.tsx` (exclude shop rows)
- Test: append Studio checks to `tests/v1/shop-ui.mjs`

**Interfaces:**
- Consumes: workspace `items[].kind/priceMinor/quantity/remaining/sold/perGuestLimit/pickup` and `purchases[]` (Task 4); `POST /api/v1/host/purchases/:id/status` (Task 3); staff item PATCH/POST with kind fields (Task 4).
- Produces: `type Mode = "setup" | "live" | "shop" | "results"`; URL `?mode=shop&tab=products|purchases|desk`.

Design source: prototype `js/studio.js` variant `b` (`shopMode`, `products`, `purchases`, `desk`, `setupNav`), `css/studio.css`, evidence `studio-b-shop-nav.png`. Zack's condition: **the event sidebar stays visible in Shop** (Selling → Auction items / Shop).

- [ ] **Step 1: Failing Studio checks (append to `tests/v1/shop-ui.mjs`, new block per engine at 1440×1000)**

```js
    const studio = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await studio.request.fetch(`${BASE}/api/v1/host/login`, { method: "POST", headers: { Origin: BASE }, data: { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD } });
    const sp = await studio.newPage();
    await sp.goto(`${BASE}/studio/${e.id}?mode=shop`);
    await expect(sp.getByRole("complementary", { name: /Checklist and outline/ })).toBeVisible(); // sidebar stays
    await expect(sp.getByRole("button", { name: /^Shop/ }).first()).toHaveAttribute("aria-current", "page");
    await sp.getByRole("tab", { name: /Purchases/ }).click();
    const row = sp.getByRole("row", { name: /Jo Park.*Holiday gift box/ });
    await row.getByRole("button", { name: "Mark paid" }).click();
    await expect(row.getByText("Paid")).toBeVisible();
    await sp.getByRole("tab", { name: /Pickup desk/ }).click();
    await sp.getByLabel("Find a guest").fill("Jo");
    await sp.getByRole("button", { name: "Paid and handed over" }).first().click();
    await expect(sp.getByText(/Nothing left to collect|picked up/i)).toBeVisible();
    await sp.getByRole("button", { name: /^Auction items/ }).click();
    await expect(sp).toHaveURL(/mode=setup/);
    await studio.close();
    console.log(`ok   ${engine.name()}: Studio Shop with sidebar, purchases, pickup desk`);
```

- [ ] **Step 2: Data types**

In `src/app/studio/data.ts` add to `Item`: `kind: "auction" | "shop"; priceMinor: number | null; quantity: number; remaining: number | null; sold: number; perGuestLimit: number | null; pickup: string;` make `openingMinor: number | null`; add `export type Purchase = { id; itemId; itemTitle; pickup; participantId; name; business; quantity; unitMinor; amountMinor; status: "committed" | "paid" | "picked_up" | "cancelled"; revision; createdAt; updatedAt }` and `purchases: Purchase[]` on `Data`. Fix every typecheck error by excluding `kind === "shop"` from auction-only views (Items table `ItemsWorkspace` filters to auction; Live tiles; Results decide/handover).

- [ ] **Step 3: Mode and layout**

In `studio.tsx`: `type Mode = "setup" | "live" | "shop" | "results"`; add the Shop segment between Live and Results with a badge = purchases `committed` + `paid` count (`to collect`); `pickMode` and `selFromUrl` accept `shop`. Render Shop **inside the setup grid with the left rail**:

```tsx
      {mode === "shop" && (
        <div className="setup shop-layout">
          <aside className="rail-l" aria-label="Checklist and outline">
            <Outline ctx={ctx} sel={{ kind: "shop" } as Sel} select={(s, sc) => { pickMode("setup"); select(s, sc); }} addItem={() => { pickMode("setup"); setAddRequest(n => n + 1); }} />
          </aside>
          <ShopWorkspace ctx={ctx} />
        </div>
      )}
```
In `setup.tsx` `Outline`, rename the items group header to **Selling** with two rows: `Auction items` (selects `{ kind: "items" }` in setup) and `Shop` (calls a new `onShop` prop that does `pickMode("shop")`); mark the active row with `aria-current="page"`. Add `{ kind: "shop" }` to `Sel` as a no-op selection used only for highlighting.

- [ ] **Step 4: `shop.tsx`**

`ShopWorkspace({ ctx })` with tabs (`role="tab"`) **Products · Purchases (badge) · Pickup desk**, state in the URL `tab=`:
- **Products:** header "Shop" + count + "N on sale · N sold out"; actions `Paste rows`, `Add product`. Table rows: photo, title, price, stock stepper (`−`/`+` call PATCH `quantity`, disabled below `sold`), sold, limit, pickup, visible toggle. Clicking a row opens the item editor drawer (`ItemPanel` kind fields: Price, Quantity, Per-guest limit, Pickup; Type shown read-only once sold > 0).
- **Purchases:** KPIs (Committed, Collected, To collect, Picked up), search, status chips with counts, table (Time, Buyer + business, Item, Qty, Amount, Status chip, actions). Actions: `Mark paid` (committed), `Mark picked up` (paid), `✕` → inline confirm "Cancel and return N to stock?" `Cancel purchase` / `Keep`. `Export CSV` links to `…/export/purchases`. Every action POSTs `{ to, revision }` and reloads on `409`.
- **Pickup desk:** `Find a guest` search; per guest card: name, business, lines to collect with amounts, total owed; buttons `Mark all paid` and `Paid and handed over` (paid then picked_up for each line, sequentially, stopping on the first error and showing it).
Port markup and spacing from the prototype; use existing Studio tokens/classes (`sx-btn`, `sx-field`, chips).

- [ ] **Step 5: Live and Results**

Live KPIs gain **Shop sales** (sum of non-cancelled `amountMinor`, with units) and a "Just sold out" list (items with `remaining === 0` sold in the last 10 minutes from purchases). Results header copy: "Winners and donations. Shop purchases are settled in Shop." with a link that switches mode.

- [ ] **Step 6: Run, commit**

Run: rebuild; `node tests/v1/shop-ui.mjs`, `node tests/v1/items-ui.mjs`, `node tests/v1/operations-ui.mjs`, `node tests/v1/studio-saving.mjs` → all pass.
Capture `1440×1000` and `390×844` screenshots of Products, Purchases and Pickup desk into `docs/evidence/bid-shop-give/` and compare side by side with `prototypes/bid-shop-give/evidence/studio-b-shop-nav.png`; fix visible drift before committing.

```bash
git add src/app/studio tests/v1/shop-ui.mjs docs/evidence/bid-shop-give
git commit -m "Studio B: Shop mode (Products, Purchases, Pickup desk) with the event sidebar kept"
```

---

### Task 11: Paste rows with Type / Price / Quantity / Limit / Pickup

**Files:**
- Modify: `src/app/studio/[id]/items-dialogs.tsx` (paste parser), `src/server/v1/host.ts` (paste endpoint uses `itemInput`, already kind-aware after Task 4)
- Test: `tests/v1/items-logic.mjs` (pure parser cases) and one API check appended to `tests/db/shop-kinds.mjs`

- [ ] **Step 1: Failing parser cases**

Add to `tests/v1/items-logic.mjs` (follow its existing `case(name, input, expected)` style): headers `Title, Type, Price, Quantity, Limit, Pickup` → rows with `kind: "shop"`, `priceMinor`, `quantity`, `perGuestLimit`, `pickup`; `Type` values `Shop`/`shop`/`Buy it now` → shop, `Auction`/blank → auction; a shop row without Price → row error "Add a price"; an auction row with Quantity > 1 → row error "Quantity is for shop items".

- [ ] **Step 2: Implement** the header aliases (`type`, `kind`; `price`, `buy now price`; `quantity`, `qty`, `stock`; `limit`, `per guest`; `pickup`, `pick up`) in the paste parser and pass the fields through; the server reuses `itemInput`, so validation stays in one place. When opened from Shop → Products, default `Type` to Shop.

- [ ] **Step 3: Run, commit**

```bash
node tests/v1/items-logic.mjs && node tests/db/shop-kinds.mjs
git add src/app/studio/[id]/items-dialogs.tsx tests/v1/items-logic.mjs tests/db/shop-kinds.mjs
git commit -m "Paste rows: Type, Price, Quantity, Limit and Pickup columns"
```

---

### Task 12: Full verification and staging

**Files:**
- Modify: `docs/plans/BID_SHOP_GIVE.md` (Phase B status), `docs/plans/REAL_V1_STAGING_RELEASE.md` (staging section)

- [ ] **Step 1: Every suite on a production build**

```bash
pnpm typecheck && pnpm compat && BIDZIZI_APP_MODE=local pnpm build   # restart the app
for t in tests/db/migrate.mjs tests/db/shop-schema.mjs; do BIDZIZI_TEST_PG=$BIDZIZI_TEST_PG node $t | tail -1; done
for t in tests/db/races.mjs tests/db/shop.mjs tests/db/shop-kinds.mjs tests/v1/journey.mjs tests/v1/recovery.mjs tests/v1/bid-sheet.mjs \
         tests/v1/buy.mjs tests/v1/shop-ui.mjs tests/v1/simple-ui.mjs tests/v1/items-ui.mjs tests/v1/items-logic.mjs \
         tests/v1/operations-ui.mjs tests/v1/studio-saving.mjs tests/v1/photos.mjs; do echo "== $t"; node $t | tail -2; done
```
Expected: every suite reports all passed. Then `node -e` the invariant checker against the test DB → `[]`.

- [ ] **Step 2: Visual comparison**

Capture guest Browse (Bid, Shop, Give), shop item page, buy sheet (pick, review, done, just sold out, uncertain), Mine, and Studio Shop (three tabs) at 390×844 and 1440×1000 in Chromium and WebKit. Compare with `prototypes/bid-shop-give/evidence/guest-b-*.png` and `studio-b-shop-nav.png`. Present them to Zack; passing tests are not visual acceptance.

- [ ] **Step 3: Staging**

Follow the staging steps recorded in `REAL_V1_PRODUCTION_RELEASE.md` → "Money-path fixes" (identity check; read-only hash check of `br-crimson-mountain-arsolcfe`; `node scripts/prod-migrate.mjs` → `applied 012_shop.sql`; `git archive` export with the standard exclusions; `vercel deploy --prod --skip-domain` to `prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9`; `vercel alias set … staging.bidzizi.com`; routes 200 / host APIs 401 / simple CSP; Chromium + WebKit at 390 with 0 page errors; a throwaway owner org exercises one shop purchase end to end, then is deleted, and staging business tables hash identical to before apart from the throwaway rows).

- [ ] **Step 4: Record and hand to Zack**

Write a "Phase B status" section in `BID_SHOP_GIVE.md` (what shipped, test counts, staging deployment id, what wasn't covered: real old iPhones) and a staging section in `REAL_V1_STAGING_RELEASE.md`. Commit, push `jryear/bid-shop-give`. Production waits for Zack's go after the Saturn staff trial on staging.

```bash
git add docs/plans
git commit -m "Record Bid · Shop · Give phase B on staging"
git push origin jryear/bid-shop-give
```
