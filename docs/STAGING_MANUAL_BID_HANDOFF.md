# Synthetic manual bidding

The A audience can review a manual bid with current person and business attribution, submit it, recover its durable receipt, and observe competing business standing. Test account selection is explicit; no phone/SMS verification is simulated as real authentication.

Person identity, active business-person membership, active organization-business membership, catalog VIEW and event BID are separate server-held facts. Every standing read, POST, receipt lookup and replay rechecks current authority. A member identifier cannot grant access. Multiple people can represent one business; one person can have more than one authorized business.

## Test version

`staging-usd-manual-v1` uses USD integer cents, increment2500 and cap1000000000. The first minimum comes from the immutable approved opening; subsequent minimum is current+2500. Any integer at or above minimum is permitted within cap. This fixture version disables raising for the currently leading business. It does not decide live auction currency, increments, limits or self-raise policy. Approved events with another increment reject this version.

For new valid requests the domain decision order is NOT_OPEN/CLOSED, AMOUNT_LIMIT, UNSUPPORTED_SELF_RAISE, then BELOW_MINIMUM. Current authority and identical receipt replay precede this decision. Invalid input and unsupported rulesets create no receipt. This records implementation precedence where conditions overlap; it does not change the frozen independent assertions.

Per-lot locking precedes the database decision clock. A queued request cannot extend the window, and session expiry is rechecked after waiting. Accepted bid, standing and receipt commit atomically. Actor/requestUUID binds event, release, lot, business, amount and version. Identical retries recover immutable accepted or terminal-rejected receipts; changed payload conflicts. An accepted replay after close retains its original receipt and reads fresh standing.

## Interface and recovery

Review does not write. Sending, a transport failure or a503 cannot show acceptance. An uncertain result keeps the original intent and offers Check status; Try again resends that exact intent. Only a current actor-owned durable receipt restores acceptance. Browser storage contains intent identifiers/inputs, never cached acceptance as authority. Shared business standing does not fabricate another person's receipt.

A confirmed offline view shows its database timestamp as stale and disables sending. Fresh reads restore standing. Logout/identity denial clears private data, and account/context generations discard older responses. If the same actor's context changes while acknowledgement is held, sending becomes unconfirmed; recovery still fetches the original UUID. Closed standing reads do not initialize database rows.

Routes under `/api/bidder/events/[eventId]`: `context`; `lots/[lotId]/standing`; POST `lots/[lotId]/bids`; `lots/[lotId]/bid-receipts/[requestId]`. Responses are no-store. Context does not reveal an unapproved event, grant BID, or replace the catalog DTO's separate visibility boundary.

## Storage and operator setup

Migration003 supplies synthetic business membership/admission, standing, immutable accepted bids and immutable actor-owned receipts. The runtime can read authority fields and lock their rows; it cannot change those fields or immutable history. It can insert bids/receipts and update operational standing. The server-only database/TLS and dedicated Preview selector remain unchanged.

`scripts/migrate-manual-staging.mjs` is an operator-only command for the explicitly approved isolated branch. It checks exact host/database/role and a private URL file, uses verified TLS, inserts only missing fixed synthetic rows, and refuses conflicting existing identity or authority. It never replaces rows, resets an event, grants event VIEW/BID, creates bids or runs from the application/build. Release-owner hosted evidence gives only its newly created synthetic event explicit test audience/admission grants.

## Verification

Frozen contract: `tasks/staging-manual-bid-003.toml`; corrected feature-absent trusted base: `d1913e61b793c83cb9dbdad93fbad2d3295d464f`. The complete baseline is READY: manual feature fails finitely and all11 cumulative regressions pass. The additive wrapper preserves original002 evidence byte-for-byte while running its full4/7 groups as implemented regressions. Original failures, correction diff and complete proof are retained in protected history.

All7 acceptance and21 adversarial groups passed during development. Focused independent browser/SQL probes then checked account hydration, selected leading business, same-actor held acknowledgement after close, and absent closed standing reads. The final clean committed kernel gate and exact hosted two-browser E2E remain separate pending release evidence. See [the journey map](STAGING_JOURNEYS.md) for later exact-source receipts.

No live admission, real member records, SMS, private maximum/auto-bidding, payment, donations, winner/settlement or production release is introduced.
