# Next tranche: Studio information architecture and event operations

Recorded from Zack's direction on 2026-10-13. Source baseline: `0837185` on `jryear/real-v1-claude-shell`, following the reliability checkpoint (`63580aa`) and image landing (`96af781`).

**Status: saved for the next tranche; implementation has not started.** Zack's review of the current build and isolated [Items interaction study](ITEMS_WORKSPACE_STUDY.md) comes next. This document preserves that direction for the subsequent build; it does not declare the current layouts canonical or select an Items creation flow on Zack's behalf.

## Outcome and product primitives

Freeze the overall information architecture before adding much more functionality: the relationships, navigation and interaction model, rather than every pixel or control. Establish these primitives:

- **Studio**: the staff workspace.
- **Organization**: the host context containing its events.
- **Events**: the central unit of preparation, participation, operation and results.
- **Set up / Live / Results**: the three event workspace modes.
- **Navigator / Preview / Inspector**: the consistent setup interaction model.
- **Real guest components as preview**: the operator edits and previews the same experience guests receive.

Build and verify one complete event through this model. New features should fit these primitives; avoid separate workspaces, duplicate controls or one-off workflows that undermine them. Preserve the accepted Claude shell's design language and the simple Kahoot/jackbox.tv host/join model.

## 1. Separate publication from the Live workspace mode

The current green “Live · changes appear to guests instantly” header badge and the **Live** mode describe different concepts. Make the distinction explicit:

| Concept | Meaning | Proposed presentation |
|---|---|---|
| Published | Guests can see the event; saved changes propagate | **Published · changes appear instantly** |
| Live | Staff's operational mode for running the auction | **Set up / Live / Results** |

Publication does not mean bidding is currently open. Item schedules and server time still decide that. Preserve autosave and the existing direct propagation of confirmed changes; this naming change must not introduce an additional publish step for ordinary edits. Draft events remain staff-only. Keep event publication, auction timing and staff navigation as separate concepts internally as well as in copy.

## 2. Make the event index work with 108 events

Keep the strong current-event hero at the top. Replace a flat “Other events” list with an **Events** index that supports:

- Current / Upcoming / Past organization;
- Search events;
- status filters, proposed by Zack as **All / Live / Upcoming / Drafts / Past**;
- clear handling of drafts and the existing archive behavior.

Resolve final filter wording during the review: if “Live” means currently bidding in the index, make that meaning explicit so it does not recreate the publication/mode ambiguity above. This is an organization and retrieval improvement, not a new event lifecycle or approval workflow.

## 3. Make Live an operations console that adapts to phase

Keep the visual quality, but prioritize what needs action. An operator should not have to hunt through attractive item cards to discover the next problem.

| Phase | Priorities |
|---|---|
| Before bidding | Readiness, countdown to open, bidder count, display connections, SMS health |
| During bidding | Ending-soon lots, current leaders, bid velocity, recent bids, active alerts, operator controls |
| Final closing | Lots under two minutes, extensions, contested/paused lots, no-bid lots, closing queue |

This table records the intended operational capabilities. Inspect their actual support before implementing each one. Display connections, SMS health and contested/paused status need truthful server-backed definitions and may require new capabilities. Do not show simulated “healthy,” “connected” or “paused” claims in the connected app. Record any required capability and its delivery scope in the tranche's implementation spec.

Phase and urgency derive from server-authoritative timing and item state. Metrics must have clear meanings; counts and velocity must reflect real data. Existing void, withdraw and change-close controls should remain directly reachable from the relevant item or alert. “Extensions” and “closing queue” do not themselves authorize new automatic-extension, pause, bid-ordering or close rules; preserve existing auction guarantees until an explicit product rule changes them.

## 4. Formalize Navigator → Preview → Inspector

Use the setup editor's three-panel pattern consistently for:

- Welcome;
- Schedule;
- Look;
- Bidding rules;
- Donations;
- Sponsors;
- Item editing;
- Stage/display configuration.

The Navigator selects what staff are working on, the Preview shows the relevant guest or display experience, and the Inspector exposes the useful configuration for that selection. Keep selection and work intact across navigation. Adapt the same relationships for phones without squeezing three desktop columns onto a narrow screen.

The Items study will settle how a full-width management workspace fits this model. Preserve its review outcome when writing the connected Items spec; this tranche does not supersede that pending trial. Stage/display configuration belongs within this model when it is built, rather than becoming a separate configuration product.

## 5. Separate brand identity from semantic state

Preserve the rule that theme customization changes identity, while leading, outbid and closing retain consistent meaning. Express that separation in the design tokens:

```text
brand.accent
brand.background
brand.surface

state.leading
state.outbid
state.closing
state.success
state.warning
state.danger
```

Themes can change the brand group. Themes must not override the state group. Contrast, focus and readable state indications must survive every supported theme. This establishes the token boundary; it does not require exposing every brand token as an editable field immediately.

## 6. Human choice first, technical detail second

Apply the bidding-rules standard throughout the application. For example:

**Grows with price**

Small steps on small bids, bigger steps as prices climb.

Then show the actual ranges and concrete examples. Avoid leading with internal field names such as `increment_mode = tiered`. Technical details belong underneath a meaningful operator choice when they help someone understand or predict the result.

## 7. Render the actual guest experience inside Studio

The phone preview must render the guest component tree, not a parallel approximation:

```text
GuestWelcome
GuestItems
GuestItemDetail
       ↓ shared by
Real bidder route + Studio preview shell
```

Use the same components, event state mapping and theme tokens. Existing shared guest components in the Claude shell are the foundation; inspect and close actual gaps rather than creating a redundant component system or renaming components for appearance alone.

Keep editor affordances around that shared tree. Preview mode cannot submit a real bid or imply an accepted outcome. Actual participant identity, bidding state, receipts and privacy masking remain server-authoritative; a staff preview must apply the same guest-facing visibility rules.

## 8. Keep item detail prominent and bidding actions recoverable

A dedicated item-detail page benefits from a large image. Preserve:

- large image, item number and save control;
- category and item title;
- opening/current bid;
- opening/closing time;
- bid increment.

Once bidding is open, make the lower action area strong and sticky:

```text
Current bid $650
Bid $700
```

The bidder should never need to scroll to recover the action. The amount and action must update together from current server standing and the applicable increment. Preserve leading/outbid behavior, self-raise restrictions, pending and uncertain states, and acceptance only after durable confirmation. Do not reintroduce the participant's losing bid as the prominent amount. Images remain prominent on detail pages without forcing large images into catalog browsing or staff operations.

## 9. Use results language that matches the event's actual transaction

Preserve the useful structure:

**Confirm winners → Hand over → Still open → Exports**

Use neutral wording or event-appropriate configuration where needed:

| Prefer | Reason |
|---|---|
| Items awarded | A winning bid does not necessarily mean a conventional cash sale |
| Winning total | Describes the auction outcome without implying payment received |
| Handover | Describes fulfillment |
| Settlement | Describes any follow-up reconciliation, with its actual meaning specified |
| Donations | Show donation language only when donations are enabled |

For Saturn, a winning bid is not evidence of a cash payment. Do not label bids, awards or handover as paid/settled without the corresponding recorded fact. Choosing neutral defaults comes before adding a broad terminology-configuration system. Settlement wording here does not authorize payment processing or a new financial subsystem.

## 10. Align backend responsibilities with the product model

Use this logical domain map to guide boundaries, naming and interfaces:

```text
Organization
  └── Events
       ├── Setup
       │    ├── details
       │    ├── schedule
       │    ├── appearance
       │    ├── bid rules
       │    ├── donations
       │    └── sponsors
       ├── Items
       ├── Participants
       ├── Invitations
       ├── Bids
       ├── Displays
       ├── Messages
       ├── Live Operations
       └── Results
            ├── winners
            ├── handover
            ├── settlement
            └── exports
```

The interface and domain language should reinforce each other. Treat this as a responsibility map, not a requirement to create a table, service, route or staff task for every node. Reuse sound existing persistence and APIs. Invitations/messages/displays describe capabilities to specify and build where needed; they do not establish working integrations today. Invitations must not become mandatory participant admission or business verification.

Preserve durable bid/pledge idempotency, server-clock timing, exact money, concurrent standing, historical receipts, staff ownership, participant privacy, duplicate-event isolation and accurate recovery. Add migrations only where the implemented capability requires them; preserve applied history.

## Implementation packet after Zack's review

Carry the accepted review notes and Items-study decision into a bounded implementation spec. Establish the architecture and wording first, then make one event work end to end:

1. Staff find/create an event and configure it through the consistent setup pattern.
2. Items are prepared using the chosen creation flow; the real guest preview reflects saved state.
3. Staff publish/share; guests join and place durably confirmed bids.
4. Live operations surface the next actionable work as bidding progresses and closes.
5. Staff confirm winners, record handover and the supported settlement follow-up, then export results with truthful language.

Validate this complete journey with a disposable local database and the existing bidding/operations regressions, including concurrency, retries, timing, privacy and interruption. Inspect actual 390px and 1440px renders, keyboard/focus, sticky actions, navigation and recovery; include before/after evidence and source revisions in the checkpoint.

Keep local work in reviewable commits. No push, production deployment, provider resource, domain change or external messaging is authorized by this saved tranche. The current build and prototype remain available for Zack's review; saving this direction does not start its implementation.
