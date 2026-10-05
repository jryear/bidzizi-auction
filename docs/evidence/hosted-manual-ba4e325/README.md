# Verified staging staff and manual-bid demo

Deployed application source: `ba4e3257681081c127c9c70191d6ec379de64ab4`. Protected Preview: https://bidzizi-clean-staging-ovcmw8h7k-saturn-ea53.vercel.app.

The clean kernel verdict is SUPPORTED: all13 checks passed, including the two manual groups and all11 cumulative staff/catalog checks. The exact protected Preview then completed all14 hosted browser/HTTP/SQL groups. [Full hosted receipt](receipt.json) and [local gate](local/receipt.txt) are separate evidence. The final copy change clarifies that the staff draft preview does not place bids and that bidder access is separate from catalog approval.

## Open the demo

- [Staff Event/Lots workspace](https://bidzizi-clean-staging-ovcmw8h7k-saturn-ea53.vercel.app/admin?event=9280a1f9-27df-438c-893b-7d6069d46a59): choose **Test Saturn Staff**, then Sign in.
- [Bidder event](https://bidzizi-clean-staging-ovcmw8h7k-saturn-ea53.vercel.app/events/9280a1f9-27df-438c-893b-7d6069d46a59): choose **Test Juniper Bidder**, then Sign in. Use **Test Harbor Bidder** in a second private window to compete.
- Complete Vercel's existing team sign-in if the protected Preview asks for it. No protection credential is embedded in these links.

The fresh synthetic event is **BidZizi demo (test)**. It opens Mon Oct 05, 2:20 AM Pacific and closes Mon Oct 05, 2:20 PM Pacific; exact UTC boundaries are in [the demo receipt](demo/receipt.json). Three organization-provided example lots are approved. [Actual deployed desktop/390px capture](demo/visual-receipt.json) verified the open phase and zero initial bids without submitting a bid. This twelve-hour window is separate from the four-minute hosted close-boundary test.

A minor current UI issue remains: on first opening an already approved event, the working-draft hint can retain the pre-approval sentence until changing tabs. The Approved header, catalog snapshot and disabled re-approval action are correct.

Staff can inspect the approved event, edit the working draft, organize lots and use the actual A draft preview. Later draft changes leave the immutable approved catalog unchanged. The prototype does not offer replacement, cancellation, rescheduling or grant management for an approved release. Test account selection sends no SMS.

## Actual images

| Staff and bidder demo | Hosted bid and recovery proof |
| --- | --- |
| [Event with interactive A preview](demo/desktop-event.png) | [Business/person review](phone-review.png) |
| [Lots workspace](demo/desktop-lots.png) | [Pending](phone-pending.png), [accepted](phone-accepted.png) |
| [Welcome](demo/phone-welcome.png), [catalog](demo/phone-catalog.png) | [Outbid standing](additional-outbid-standing.png) |
| [Lot detail](demo/phone-detail.png), [bid review](demo/phone-review.png) | [Unconfirmed](phone-unconfirmed-committed.png), [recovered](phone-recovered.png) |
| [Open demo/source observation](demo/visual-receipt.json) | [Not recorded/retry](phone-not-recorded.png), [closed](phone-closed.png) |

The readable outbid card is an additional read-only capture after the hosted event closed; it restores the original synthetic operation intent to fetch the same actor's durable server receipt, with no bid write or injected acceptance. [Its receipt](additional-visual-receipt.json) records full-card visibility above the fixed controls.

All images are actual Chromium captures from the bound deployment, not composited mockups or physical-device evidence. Image hashes, event/release IDs and viewport sizes accompany the receipts.

## Preserved corrections

The first hosted setup exposed broad privileges inherited from the operator's default ACL, before any event or bid was created. The operator script now removes those default/new-table grants and applies narrow explicit permissions. [The correction](permissions/manual003-default-ACL-correction.json) preserved full row digests for all17 tables; [independent disposable-database proof](permissions/independent-default-ACL-proof.json) demonstrated old failure and17 corrected denials, including PUBLIC defaults and idempotent rerun. [Original failure](history/default-ACL-first-failure.json) remains separate.

The next run completed8 groups, then a runner assertion incorrectly required continued uncertainty after a definitive original-UUID404. Frozen BID-X12 requires visible absence and the same-intent retry. [Original run](history/no-receipt-assertion-failure.json), [bounded old/new controls](history/independent-no-receipt-correction.json) and correction diffs are retained. The full14-group pass used the corrected external runner, with no frozen contract or application change to satisfy that assertion.

The release demonstrates synthetic `staging-usd-manual-v1`: USD integer cents, $25 increment, a test cap and no leading-business self-raise. It does not settle real barter currency, member verification, admission, close policy, auto-bidding, payments, donations or settlement. No main merge, production release or physical-device acceptance is claimed.

This evidence checkpoint packages completed observations. Its own Git revision is distinct from the deployed application source above. [Source and artifact binding](SOURCE_BINDING.json).
