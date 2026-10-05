# Admin prototype QA — 2026-10-03

Scope: isolated browser-local prototype, built from A commit `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`. Checks use fictional items and events. BiddingOwl was inspected read-only and returned to its dashboard.

## Browser observations

The studio was exercised in the Codex in-app browser at 1440×1000 and laptop 1280×800, with its embedded A phone preview. A laptop layout issue was corrected so the preview sits alongside the header rather than starting below it. At 1280×800, the preview ended above the simulation footer and the page had no horizontal overflow. The latest desktop captures include the final sticky organization header.

Verified through visible UI:

- Bulk selection assigned all six lots to one shared 6 PM–8 PM example window. Closing before opening was refused; correcting it enabled assignment.
- Review found the flower fixture's missing description and disabled scheduling. Fix navigated to the relevant editor; completing its description made review ready.
- A simulated save interruption displayed Unsaved edits. Retry saved the draft; a reload restored the edited value.
- Scheduling preserved a local release snapshot. Audience view hid the catalog before opening, displayed it during bidding, and showed closed/no-bid standing after closing. The preview clock is an explicit simulation control.
- Subsequent working title changes appeared in Working draft while Audience view retained the scheduled title. Draft edits were restored after this check.
- Selecting an event cover and enabling optional event sponsors updated the A preview. Sponsors remained separate from item provider attribution.
- The organization dialog closed with Escape and returned focus to its trigger. The preview collapsed and reopened; the editor expanded when it was hidden.
- Switching to the fictional second organization showed an empty event. Staff could add its first lot; an opening amount misaligned with the example increment was blocked. Returning to Saturn restored its original event draft.
- Creating a second Saturn event started with an empty catalog and preserved the first event.
- Lot search survived reload. Clearing search restored the inventory. Browser Back returned from Event to Lots.
- Actual A welcome, catalog, and lot-detail renderers were exercised. Before-opening lot controls displayed the opening time and did not offer an active bid.

The current Saturn example was reset after the walkthrough so the user starts with six unassigned lots and the intentional missing description. QA-created secondary local events remain available in the event/organization pickers.

## Executable checks

`model-check.mjs` passed nine model boundaries:

1. Exact integer-cent parsing and rejection of malformed/unsafe amounts.
2. IANA time-zone conversion, invalid dates, and refusal of ambiguous/gap DST wall times.
3. Refusal to schedule a catalog without assigned lots.
4. Incomplete assigned lot blocks scheduling.
5. Opening-inclusive and closing-exclusive simulated boundaries.
6. Audience catalog hidden before opening and visible afterward.
7. Working edits preserve the release's content and time window.
8. Unassigned lots excluded from the release snapshot.
9. Invalid shared windows cannot be released.

All prototype JavaScript files also passed Node 24 syntax checks. These checks are implementer-owned prototype evidence, not independent contract evidence.

## Captures

- `event-desktop.jpg`: final clean Event workspace and A welcome preview, 1440×1000.
- `lots-desktop.jpg`: final clean Lots workspace and A selected-lot preview, 1440×1000.
- `event-laptop.jpg`, `lots-laptop.jpg`: laptop layout checks from the QA session, with a prepared local draft. The Lots capture was scrolled; use the final desktop capture for the composition review.
- `review-blocked.jpg`, `review-ready.jpg`, `scheduled-hidden.jpg`, `empty-event.jpg`: behavior checkpoints recorded earlier in the session, before the final header/preview positioning adjustment.

## Not established

No physical-device/browser matrix, full accessibility audit, actual image upload, server scheduler, staff authorization, tenant isolation, real persistence/concurrency, or real bidder lifecycle was validated. The inherited bidder simulation was inspected in the admin context, not exhaustively requalified. One browser-side MutationObserver error appeared during initial tab setup; its source was not established and it did not prevent the recorded interactions.

No production DB access, SMS, real bids, pushes, merges, or deployments occurred. No operational contract was frozen or kernel verdict claimed.

## Copy update — 2026-10-04

Removed the dramatic admin headings, prompts, empty-state wording, and photo captions. The interface now uses labels such as Event details, Welcome page, Bidding schedule, Event sponsors, Lots, and Review schedule. New-draft welcome defaults were also simplified. Existing editable event content was preserved.

`studio.js` and `model.js` passed Node 24 syntax checks. The local preview was restarted and HTTP verification confirmed that it serves the updated copy. Browser automation was unavailable for this turn, so the earlier screenshots show the prior wording; no new visual verification is claimed. Layout and interaction code were not changed.
