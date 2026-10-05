# BidZizi staging journey map

Version 1.7 · delivery record · verified protected staff/catalog/manual source `ba4e325` · synthetic demo available.

The staging goal is two connected journeys using synthetic accounts and data. A remains the design foundation. Use plain labels. BidZizi contains organizations; an organization owns events and provides lots. Optional event sponsors are separate. This map describes test behavior, not real member verification, financial commitments or settlement.

## Current delivery state

| Slice | State | Evidence boundary |
| --- | --- | --- |
| [staging-staff-drafts-001](../tasks/staging-staff-drafts-001.toml) | Local kernel SUPPORTED at `5285648`; deployed with boundary fix at `91d3de0` | [All11 hosted browser/SQL groups passed](evidence/hosted-staff-91d3de0/receipt.json): HTTPS session, creation, complete saves/order, pending/lost response, independent reload, stale conflict, tenant denial and actual A saved preview. |
| [staging-preview-database-boundary-001a](../tasks/staging-preview-database-boundary-001a.toml) | Clean `91d3de0` SUPPORTED against `e1abd3a`; deployed target verified | Dedicated branch Preview connection matches the isolated restricted runtime. [Exact source/deployment binding](evidence/hosted-staff-91d3de0/SOURCE_BINDING.json); no managed fallback. |
| [staging-catalog-002](../tasks/staging-catalog-002.toml) | Clean `28b1782` SUPPORTED and exact hosted journey passed | Corrected base `7eef3e7`; all11 local fixed/cumulative checks and [all12 hosted groups](evidence/hosted-catalog-28b1782/receipt.json) passed. Immutable saved selection, audience VIEW and retained-phone automatic DB opening/closing. [Actual desktop/phone evidence](evidence/hosted-catalog-28b1782/README.md). |
| [staging-manual-bid-003](../tasks/staging-manual-bid-003.toml) | Clean `ba4e325` SUPPORTED and exact hosted14 groups passed | Corrected base `d1913e6` READY; final13 checks include all11 cumulative regressions. [All14 hosted browser/HTTP/SQL groups](evidence/hosted-manual-ba4e325/receipt.json) cover separate person/business/network/VIEW/BID, durable owned receipts, interrupted recovery, competing/outbid standing, duplicate/race handling, actor changes and post-lock DB closing. [Actual captures and open demo](evidence/hosted-manual-ba4e325/README.md). |
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
| Catalog / detail | At inclusive DB-clock opening, browse the approved selected lots and inspect actual A details. Visible pages refresh from server authority every5seconds and on return from the background. | 002 API/SQL/A equality; before/open/after boundary checks | Server time overrides browser clock hints. Reload/new browser sees the same immutable release. Unknown or denied events cannot fall back to another event. |
| Watch | Save lots separately from My Bids and return with browsing/search position preserved. | Approved prototype direction; later durable watching slice, not promised by 002/003 | Ownership and persistence must be defined and independently tested. Watching never places a bid. |
| Manual bid | Review the business/person attribution and amount; submit to the admitted open lot. | 003 acceptance, frozen test monetary/order rules | Sending is not accepted. Only a durable receipt may show confirmation and leading standing. |
| Retry | Check an uncertain result and retry the same request. | 003 acceptance/adversarial receipt and rollback checks | Lost response may already be committed. Preserve request ID and payload; reject changed payload; prevent duplicate bids. |
| Outbid / return | A second admitted bidder competes; My Bids/detail show authoritative standing. | 003 two-user/concurrency checks | Race/stale rejection updates the minimum and standing. Offline views show timestamped last-known information. |
| Close / result | After exclusive server/DB closing, new bids are denied and the confirmed final standing remains readable. | 003 late/request-lock/close-boundary checks | A queued request, browser clock or stale screen cannot extend bidding. Financial winner/settlement semantics remain deferred. |

## Next release checkpoints

1. Completed: protected hosted001/001a at exact source91d3de0,11groups. Screenshots and separately bound receipts published in evidence checkpoint2ea7f80.
2. Completed: catalog002 clean `28b1782` SUPPORTED and exact protected hosted12groups passed. Evidence checkpoint `93d0b45` carries actual captures, source/deployment and SQL clock observations.
3. Completed: manual003 clean `ba4e3257681081c127c9c70191d6ec379de64ab4` SUPPORTED, all13 checks; exact protected Preview completed all14 hosted groups in run `b46aaed8`. Permission correction preserved all17 table data digests, and external assertion correction preserved frozen evidence and reran every group.
4. Completed: a separate synthetic demo event has three approved lots, explicit test VIEW/BID access, zero initial bids, and a twelve-hour Pacific window. Actual deployed1440px staff/A preview and390px bidder welcome/catalog/detail/review captures passed with no script errors. Demo closes Monday October5,2026 at2:20PM Pacific. [URLs, account instructions and source-bound visual receipts](evidence/hosted-manual-ba4e325/README.md).

Local001 was rerun on clean committed5285648 and001a on clean91d3de0 (dirty_before_log=false). The protected91d3de0 Preview then passed all11 hosted groups against the approved isolated runtime. Application writes were made only after its dedicated database binding and restricted runtime were verified. The earlier mismatched528 deployment received no application login or write. Earlier verified staff URL: https://bidzizi-clean-staging-gnfu6vvk7-saturn-ea53.vercel.app/admin. Evidence checkpoint2ea7f80 carries the actual91 captures; it does not claim later catalog/bid completion.

Current independent evidence: [001 acceptance/adversarial](../tests/acceptance/staff-drafts/run.mjs), [001 context-race/restart](../tests/acceptance/staff-drafts/context-race.mjs), and [actual gate receipts](STAGING_GATE_RECEIPTS.txt). Catalog/manual packets are frozen and their exact-source completion claims are linked above. Hosted claims, local kernel verdicts and physical-device/live-member acceptance remain distinct.

Current verified protected Preview: https://bidzizi-clean-staging-ovcmw8h7k-saturn-ea53.vercel.app. Application source is `ba4e3257681081c127c9c70191d6ec379de64ab4`; the separate evidence checkpoint does not claim its own revision was the tested deployment. Existing Vercel team sign-in may be required. All accounts and lots are synthetic. A minor initial working-draft hint can retain pre-approval wording until changing tabs; Approved state and immutable catalog authority are correct.
