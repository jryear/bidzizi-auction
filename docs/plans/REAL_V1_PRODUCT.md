# BidZizi Real V1: host an event, join an event

Decided by Zack on 2026-10-12. This document **supersedes** the authority-heavy parts of `REAL_V1_SCHEMA.md` revision 2 and its review cycle. That revision and its review stay as history.

## The model: Kahoot / jackbox.tv

Staff **host** an event; attendees **join** it, like entering a room. The event is the centre of the product. The backend preserves history and correctness behind the scenes, and it never turns that into management steps for anyone.

### Join (attendee, phone)
1. Scan the QR code or type the event's join code at `/join`.
2. Enter a display name and a business name. The business name is just a label, like a team name, with no verification or approval.
3. Browse the items.
4. Bid, see whether you're leading, and donate if staff have turned donations on.
5. See the results and any winner instructions from staff.

The participant identity is remembered on the device and lasts until the event's access end. If a phone is lost, staff can show a one-time rejoin code from the participant list.

### Host (staff, desktop)
- **Set up the room:**
  - name and schedule;
  - items with photos and starting amounts;
  - bid increments, with sensible defaults;
  - optional donations with chosen recipients;
  - preview, then share the QR code or join code.
- **Edit in place:** title, items, closing times and instructions all live in the same event workspace. The app explains a restriction only when an edit would affect bids already placed. For example, an item's starting amount locks after its first bid.
- **Run it:** items, participants, what's happening now, and what needs attention.
- **Afterwards:** results, winner assignment, follow-up notes, export.
- **Duplicate:** copies the setup and items into a new draft. Participants, bids, pledges, awards and notes are not copied.

## What the system guarantees (non-negotiable product behaviour)

- A bid is shown as accepted only after the server records it. Server time decides whether bidding is open; the phone's clock is never used.
- Duplicate taps, dropped connections and retries never create a second bid or pledge. Asking "did my bid go through?" returns the original receipt.
- When two people bid at the same moment, one wins and the other gets a clear "you were outbid" with the new minimum. Nothing is lost.
- Participants see their own activity for as long as they have event access. Placing a **new** bid separately requires the item to be open.
- Amounts are whole cents in integers and display as plain `$1,234`.

## Settled rules

| Rule | Value |
|---|---|
| Increments | Item override, then the event's fixed increment, then the event's tiers. Default tiers: $25 below $500, $50 below $1,000, $100 below $2,500, then $250. |
| Self-raise | The current leader can't outbid themselves. |
| Timing | The event has a start and an end. Any item can override its own closing (or opening) time. Staff can change times freely before an item has bids. After that, a closing time can't be moved earlier than 5 minutes from now. |
| Adding items | Allowed anytime before the event ends. An item goes live when staff mark it ready. |
| Donations | Staff pick the recipients; quick amounts $25/$50/$100 or custom; $10,000 per pledge; open until a deadline that defaults to the event end. Staff mark each pledge processed. |
| Winners | After an item closes, its leader is the proposed winner. Staff confirm or choose another bidder, then add follow-up notes and mark it fulfilled. |
| Access end | Staff set when participants can no longer return. It defaults to 7 days after the event end. Records are kept regardless. |
| Staff login | Email and password. One Saturn account to start, created by script. |

## How we work from here

- An **implementation owner builds and delivers.** Engineering findings from reviews become tasks for that owner, not approval gates.
- Escalate to Zack only for real product decisions: what users see or can do, or anything that costs money or reaches outside the app.
- "Done" means the host and join journeys work end to end on a real deployment, checked on a phone and a desktop.
- Still Zack's call before it happens: deploying to production, creating paid resources, and pointing a real domain.
