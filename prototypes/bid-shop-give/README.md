# Bid · Shop · Give prototype

Phase A of [BID_SHOP_GIVE.md](../../docs/plans/BID_SHOP_GIVE.md). This page compares two guest shells and two Studio models so Zack can pick the combination for the connected build.

Run it with `node prototypes/bid-shop-give/serve.mjs` and open http://127.0.0.1:3424. Default port 3424; override it with `PORT=`. On a phone-width screen the guest app fills the page.

**Everything is synthetic and browser-local:**
- No API calls, no imports from `src/`, and no database.
- Items, donors, guests and amounts are fictional (the holiday gift list written for the staff demo).
- Shop items use drawn tiles because the kit has only six photos, and the auctions use all six.
- `js/store.js` imitates the server rules in the spec (stock lock, per-guest limit, request-ID receipts, staff status transitions) so the states can be tried. It is not the engine.

## Controls (top bar)

| Control | What it does |
|---|---|
| Show | Both side by side, guest phone only, or Studio only. Both share one store, so a purchase on the phone appears in Studio. |
| Guest A · Inherit | Today's guest shell (ink pass header, photo cards, ink pill nav) with Browse · Mine · Event and a Bid / Shop / Give switch |
| Guest B · Transform | A lighter header, mode cards with counts, dense bid rows, a 2-column shop grid, one-tap donation cards, and pickups grouped by place in Mine |
| Studio A · One list | Shop items live in the Items list with a Type. Purchases sit under Results. Live counts bids and sales. |
| Studio B · Shop workspace | Shop is its own mode with three tabs: Products (stock steppers), Purchases, and a Pickup desk for the gift table |
| Rush | Other guests buy and bid |
| Close / Reopen | Ends or reopens the bidding and buying window |
| Drop next reply | The next guest confirm commits, but the phone never hears back |
| Reset | Restores the example data |

## Five-minute pass

1. **Guest:** Browse → Shop → Holiday gift box → Buy 2 → review → confirm. Then open the item again: the limit is reached. Check Mine.
2. Open the candle trio, which has 1 left, and get to review. Press **Rush**, then confirm: it says "Just sold out".
3. Press **Drop next reply**, then buy a cookie tin. Use **Check my purchase**: it finds the one purchase and doesn't make a second.
4. **Studio A:** Items has the Type filter, and a shop row opens the editor with price, quantity, limit and pickup. Under Results → Purchases, mark one paid, then cancel one and watch its stock return on the phone.
5. **Studio B:** go to Shop → Pickup desk. Find Jo Park and press "Paid and handed over". Mine on the phone updates.
6. Switch Guest A and B on the same screens. Decide which shell, which Studio model, and which pieces to borrow from the other.

## Decision to make

- Which guest shell, and anything worth borrowing from the other (for example B's pickups grouped by place in Mine)?
- Studio A or B, or A's single Items list with B's Pickup desk?

Evidence is in `evidence/`, captured at 390×844 (phone) and 1600×1000 (Studio). Nothing is accepted until Zack chooses.
