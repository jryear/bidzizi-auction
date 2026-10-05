# BidZizi staging journey map

Version 1.0 · planning record · source checkpoint `5285648` · no release acceptance claim.

The staging goal is two connected journeys using synthetic accounts and data. A remains the design foundation. Use plain labels. BidZizi contains organizations; an organization owns events and provides lots. Optional event sponsors are separate. This map describes test behavior, not real member verification, financial commitments or settlement.

## Current delivery state

| Slice | State | Evidence boundary |
| --- | --- | --- |
| [staging-staff-drafts-001](../tasks/staging-staff-drafts-001.toml) | Committed at `5285648`; local kernel SUPPORTED against frozen base `3983c89` | Real PostgreSQL drafts, server sessions/grants, independent browser recovery and A staff preview. Protected hosted E2E remains pending. |
| staging-catalog-002 | Proposed; independent contract/evidence being authored in `/tmp` | One immutable approved copy of selected saved lots, shared UTC window, event-view admission and DB-time visibility. Not frozen or implemented. |
| [staging-manual-bid-003 proposal](proposed/staging-manual-bid-003.toml) | Proposed | Separate person/business authority, one manual durable bid, two-bidder standing and recovery. Test monetary/order/close rules must be frozen first. |
| Other journey work | Deferred or prototype-only | No real SMS, uploads, auto-bidding, donations, payments or settlement. |

## Staff journey

| Step | User action and resulting state | Slice / intended check | Recovery |
| --- | --- | --- | --- |
| Entry | Choose a clearly labeled test staff account; server supplies permitted organizations. | 001 acceptance; adversarial session/tenant checks | Expired, revoked or wrong account cannot access drafts. Logout clears previous account content; late responses cannot replace the new workspace. |
| Event | Choose/create an event; edit welcome, venue, photo and optional sponsors. | 001 acceptance; context-race/restart checks | Create retry preserves its request ID. A failed/uncertain response does not show Saved. |
| Lots | Staff enter descriptions, categories, fixture images and opening-amount metadata; reorder lots. | 001 acceptance: full SQL/API equality; browser edits and description recovery | Incomplete drafts save. Invalid entered amount text remains editable. Partial transaction failure preserves the prior complete draft. |
| Window | Select lots together and edit one shared date/start/end/time zone. | 001 stores draft metadata; 002 acceptance/adversarial time-conversion checks | Invalid or ambiguous local times cannot be approved. Draft editing alone never opens a catalog. |
| Approval | Review the selected SAVED draft revision and approve one immutable catalog with the shared window. | 002 acceptance: exact saved snapshot, selected set/order, request receipt; adversarial stale/concurrent approval | Unsaved edits are excluded. A stale revision conflicts. Identical uncertain retry recovers one release; changed payload conflicts. No replacement/cancel/reschedule in this slice. |
| Monitor | See the release and server-derived scheduled/open/closed phase; inspect the same A audience content. | 002 acceptance: API/SQL/A equality; adversarial DB-clock and viewer admission | DB failure cannot invent phase or publish local content. Draft changes leave the approved release unchanged. |
| Close | Inspect the retained read-only catalog after the exclusive closing boundary. | 002 boundary checks; 003 authoritative closed-standing checks | Catalog visibility does not imply bidding is enabled. Winner, payment, pickup and settlement actions remain deferred. |

## Bidder journey

| Step | User action and resulting state | Slice / intended check | Recovery |
| --- | --- | --- | --- |
| Test identity | Choose an explicitly synthetic account. No SMS is sent and no phone verification is claimed. | Test-session gate from 001; actual bidder entry in 002/003 | Production/custom-domain/flag-off contexts must deny test sessions. Real phone verification remains deferred. |
| Person / business / event access | Server-held person, business membership and event permission remain distinct. Event VIEW access permits browsing; it never grants BID authority. | 002 viewer-grant adversarial checks; 003 membership/admission checks | Typed Member ID/business name/phone cannot grant access. Revocation is checked on fresh reads, writes and receipt recovery. Multiple people per business remain representable. |
| Welcome | A welcome shows only permitted event information and optional sponsors before opening. | 002 acceptance pre-open browser/API checks | No selected lot rows, titles, descriptions or order are sent before the opening boundary. |
| Catalog / detail | At inclusive DB-clock opening, browse the approved selected lots and inspect actual A details. | 002 API/SQL/A equality; before/open/after boundary checks | Server time overrides browser clock hints. Reload/new browser sees the same immutable release. Unknown or denied events cannot fall back to another event. |
| Watch | Save lots separately from My Bids and return with browsing/search position preserved. | Approved prototype direction; later durable watching slice, not promised by 002/003 | Ownership and persistence must be defined and independently tested. Watching never places a bid. |
| Manual bid | Review the business/person attribution and amount; submit to the admitted open lot. | 003 acceptance, frozen test monetary/order rules | Sending is not accepted. Only a durable receipt may show confirmation and leading standing. |
| Retry | Check an uncertain result and retry the same request. | 003 acceptance/adversarial receipt and rollback checks | Lost response may already be committed. Preserve request ID and payload; reject changed payload; prevent duplicate bids. |
| Outbid / return | A second admitted bidder competes; My Bids/detail show authoritative standing. | 003 two-user/concurrency checks | Race/stale rejection updates the minimum and standing. Offline views show timestamped last-known information. |
| Close / result | After exclusive server/DB closing, new bids are denied and the confirmed final standing remains readable. | 003 late/request-lock/close-boundary checks | A queued request, browser clock or stale screen cannot extend bidding. Financial winner/settlement semantics remain deferred. |

## Next release checkpoints

1. Finish protected hosted 001 E2E with the exact deployed revision, HTTPS cookies, isolated database persistence and independent browsers.
2. Review/freeze catalog002 contract and executable evidence on a feature-absent trusted base; require RED baseline before implementation and GREEN candidate afterward.
3. Freeze the narrow synthetic manual-bid003 rules and independent evidence; preserve staff and catalog regressions.
4. Run the connected journeys on the deployed protected staging target. Local kernel verdicts and a rendered shell alone do not establish that release.

Local001 was rerun on clean committed5285648 (head5285648, dirty_before_log=false). Vercel built that revision, but its managed database binding changed; remote E2E is blocked until dedicated Preview connection correction001a is verified. No remote sign-in or application write was performed on the mismatched deployment.

Current independent evidence: [001 acceptance/adversarial](../tests/acceptance/staff-drafts/run.mjs), [001 context-race/restart](../tests/acceptance/staff-drafts/context-race.mjs), and [actual gate receipts](STAGING_GATE_RECEIPTS.txt). Catalog/manual check handles above are intended modes and assertions; they become claims only when their reviewed executable packets are frozen.
