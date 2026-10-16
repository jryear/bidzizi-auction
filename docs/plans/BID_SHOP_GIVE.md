# Bid · Shop · Give — design spec

Decided with Zack on 2026-10-16. Branch `jryear/bid-shop-give` (worktree `~/orca/workspaces/integration/bid-shop-give`), based on `main` `573f329`.

## Outcome

Guests get one place to browse everything an event offers, filtered **Bid · Shop · Give**. Staff can sell fixed-price items with limited stock ("Buy it Now") alongside the auction, for the Saturn Holiday Trade Show on Nov 19. Navigation gets simpler: three tabs instead of five.

Success: a Saturn guest buys a gift box on their phone in under 30 seconds without help. Two guests can never both get the last unit. Staff can see every purchase, collect payment offline and mark it picked up.

## Phases

| Phase | What | Gate |
|---|---|---|
| A | Isolated interactive prototypes in `prototypes/bid-shop-give/`: guest phone (two shells) and Studio (two models). Synthetic, browser-local data. | Zack picks the combination |
| B | Connected build: migration, server rules, guest app, Studio, tests. Deployed to staging.bidzizi.com and trialled with Saturn staff. | Staging trial passes |
| C | Production for Nov 19 | Zack's explicit go |
| 2 | Multi-quantity auction items (top N bidders win) | Separate spec; Nov 19 only if it passes the bid tests |

## Decisions

| Topic | Decision |
|---|---|
| Shop item | Fixed price plus stock count. Buying takes units; at zero it shows **Sold out** and stays listed. |
| Payment | Settled offline, like awards. The app records a committed purchase; staff collect payment. No processor. |
| Window | Same window as bidding (event start/end), with per-item open/close overrides. Committed purchases stand after close. |
| Quantity per purchase | The guest picks a quantity, capped by stock and the per-guest limit. |
| Limit | One limit for now: **per guest, per item** (optional). Whole-shop and spend caps are later. |
| Confirm | The guest reviews and confirms. Guests can't cancel; staff can. |
| Filters | **Bid · Shop · Give** |
| Navigation | Bottom tabs **Browse · Mine · Event**. Browse holds the Bid/Shop/Give switch. Mine collects bids, purchases, donations and watched items. |
| Pickup | Each shop item has an optional pickup line ("Table 4, until 8 PM"), shown on the guest's purchase. |
| Guest shell | **B · Transform** (chosen 2026-10-16): mode cards with counts, dense bid rows, 2-column shop grid, one-tap cause cards, pickups grouped by place in Mine. |
| Studio | **B · Shop workspace** (chosen 2026-10-16): Shop is its own mode beside Set up / Live / Results, with Products, Purchases and Pickup desk. Purchases stay completely separate from auction results. The event sidebar stays visible in Shop (Selling → Auction items / Shop), so navigation never leaves. |
| Multi-quantity auctions (phase 2) | Top N bids win; each winner pays their own bid; one unit per guest. |

## Data model (phase B)

Extend `items`, don't add a parallel table, so photos, categories, ordering, paste rows and visibility are shared.

- `kind text NOT NULL DEFAULT 'auction' CHECK (kind IN ('auction','shop'))`
- `quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10000)`. Phase 2 reuses this for auctions.
- `price_minor bigint`, `per_guest_limit integer`, `pickup text NOT NULL DEFAULT ''`
- **Kind constraints** (CHECK):
  - Shop items have `price_minor`, and no `opening_minor`, increment override or standings row. `opening_minor` becomes nullable, required for auctions.
  - Auction items have no `price_minor` or `per_guest_limit`.
- `item_stock (item_id PK, event_id, remaining integer CHECK (remaining >= 0))`, created with each shop item. Every purchase and cancel locks it `FOR UPDATE`, the same way bids lock `standings`.
- `purchases (id, item_id, event_id, participant_id, request_id, quantity, unit_minor, amount_minor, status, created_at, revision)`, with `UNIQUE (participant_id, request_id)`.
- `purchase_receipts`, keyed like `bid_receipts`, so a retried request returns the original decision, accepted or refused.
- `purchase_log`: staff status changes, like `award_log`.

### Purchase decision (one transaction)

1. Lock the event's item and its `item_stock` row `FOR UPDATE`.
2. If a receipt exists for `(participant, request_id)`: same payload returns the original receipt; a different payload is a conflict.
3. Check server time against the item window, `ready`, and the event status.
4. **With the lock held**, sum this guest's non-cancelled quantity for the item and check `held + quantity <= per_guest_limit`.
5. Check `quantity <= remaining`.
6. Insert the purchase, decrement `remaining`, and write the receipt.

The limit check must stay inside the lock. A conditional `UPDATE … SET remaining = remaining - q WHERE remaining >= q` is not a substitute: it skips the per-guest limit, and that limit can only be decided while the stock row is locked. Refusals (`SOLD_OUT`, `LIMIT_REACHED`, `NOT_OPEN`, `CLOSED`, `NOT_AVAILABLE`) are receipted like bid refusals.

### Purchase states

```
committed ──> paid ──> picked_up (final)
    │           │
    └───────────┴──> cancelled (final)
```

Allowed: committed → paid, paid → picked_up, committed → cancelled, paid → cancelled (any refund happens offline). Picked up is final. Cancelling returns the stock exactly once: the state change and the `remaining + quantity` happen in the same transaction under the stock lock, and a repeated cancel is a no-op through the same revision and log. Only staff change status.

### Kind-leak audit (where the real cost is)

Every reader of `opening_minor`, `standings`, `closesOf`/`phaseOf`, winner proposal, awards, Live metrics ("raised", "no bids yet"), Results, exports, stage display, paste rows, duplicate event and practice reset must be checked for shop items. Shop items have no standings, bids, awards or "no bids" alerts. "Raised so far" counts committed purchases separately from winning bids.

## Guest experience

- **Browse** with the Bid · Shop · Give switch. It remembers the last switch position and sits in the URL, so Back and reload behave.
  - **Bid:** today's catalog.
  - **Shop:** cards show price and stock ("8 left", "Sold out").
  - **Give:** today's donate flow, recipients as cards.
- **Shop item page:** price, stock, limit line, pickup line, and a **Buy** button that opens the buy sheet: a quantity stepper, a total, then a review-and-confirm step. Sending, retry and uncertain-outcome behaviour matches the bid sheet. An uncertain result never offers a fresh purchase; it re-asks with the original request ID.
- **Mine:** bids (leading, outbid, won), purchases (committed, paid, picked up, with pickup line), donations, and watched items.
- **Event:** unchanged.
- **Old iOS:** the buy sheet uses the fixed-overlay pattern (hotfix `d58c9be`), not `<dialog>`. Simple mode gets an HTML-form buy path that reuses the engine and request IDs.

## Studio

- **Item editor** for a shop item: Price, Quantity, Per-guest limit (optional), Pickup. Starting bid and increment are hidden. Paste rows accepts a `Type` column (Auction or Shop) and `Price` / `Quantity` / `Limit` headers.
- **Purchases:** a list (buyer, business, item, quantity, amount, status, time) with Mark paid, Mark picked up and Cancel. Cancel asks first and states that the stock returns. Filters by status. CSV export.
- **Live:** units sold, revenue committed, and "just sold out".
- Layout: a separate Shop mode (Studio B), with the event sidebar kept visible.

## Proof (phase B)

- Concurrency tests against a disposable database:
  - N guests racing for the last unit: exactly one wins, the rest get `SOLD_OUT`;
  - parallel requests from one guest can't exceed the limit;
  - a retried request returns the original receipt;
  - a cancel/purchase race returns stock exactly once.
- **Invariant checker** additions (the database is the judge):
  - for each shop item, `quantity = remaining + sum(non-cancelled purchase quantity)`;
  - no guest's non-cancelled quantity exceeds `per_guest_limit`;
  - each `(participant, request_id)` has at most one purchase.
- Browser suites: buy sheet in Chromium and WebKit, Back/reload on Browse filters, Mine, Studio Purchases. Bid-sheet suite stays green.
- Staging trial on Saturn staff phones before production.

## Out of scope for now

Card payment, whole-shop and spend limits, staff walk-up sales ("record a sale for a guest"), variants (sizes/colours), shipping, tax, multi-quantity auctions (phase 2).

## Prototype fixtures

All prototype items, donors, guests and amounts are synthetic: the holiday gift list written for the staff demo spreadsheet, with fictional local businesses. No Saturn data.

## Phase A status (2026-10-16)

The prototype is built at `prototypes/bid-shop-give/` (README there; `node prototypes/bid-shop-give/serve.mjs`, port 3424). It has two guest shells and two Studio models over one synthetic store, with captures in `prototypes/bid-shop-give/evidence/`.

These states were exercised in Chromium, with no page errors:
- the last unit sells while the sheet is open → "Just sold out";
- the stepper stops at the per-guest limit, and the item then shows "You've reached the limit";
- a dropped reply → "Check my purchase" finds the single purchase, with no duplicate;
- a staff cancel returns its units once, and the stock and limit invariants stay clean;
- buying closed;
- the phone width has no horizontal overflow.

Not yet checked: WebKit and older iOS, which apply to phase B code, not this prototype.

**Accepted (Zack, 2026-10-16): Guest B and Studio B**, with one change: the event sidebar stays in Shop mode instead of disappearing. Zack singled out the separation of purchases from auction results and the staff check-off workflow (Purchases, Pickup desk) as what to keep. Reference: the prototype at the commit that records this decision, with `evidence/guest-b-*.png` and `evidence/studio-b-shop-nav.png`. Phase B builds this combination; variants A stay in the prototype for reference only.
