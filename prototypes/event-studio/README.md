# Workspace Event Studio exploration

An interactive desktop staff prototype, based on Design A at `99156cc4e4f8240c536fbab2d5d13ba4acc3e4dc`. It is a static application outside the Next.js app. Every event, lot, check, and external effect is fictional or simulated. Data and editor drafts persist only in this browser, under `bidzizi.event-studio.workspace.v1`.

## Run

Use Node 24 and pnpm 12.4.2. From the worktree root:

```sh
PORT=4340 node prototypes/event-studio/serve.mjs
# http://127.0.0.1:4340/event-studio/
```

There is no build step, account, environment file, or database connection. The loopback server serves static prototype files and accepts only GET/HEAD. To start fresh, clear this prototype's localStorage key in this browser. Another browser starts with the two original fictional events.

The server is retained by the delivering session. Stop only that owned server if needed; do not terminate other prototype servers.

## Try the complete journey

1. Switch between Holiday Trade Show and Spring Market Social. Their lots, categories, windows, presentation, display configurations, SMS checks, editor drafts, and reviews stay separate.
2. Create an event. Edit its heading image, welcome message, physical date/time, venue, and timezone.
3. Enter the auction workspace. Add a lot and duplicate it from its editor. Incomplete draft content can be saved and stays visible in Needs attention.
4. Create a category. Select lots and categorize them in bulk.
5. Create two bidding windows. Open Unassigned, select lots, and bulk-assign them. Each lot has one draft window reference.
6. Open Bidder preview. Browse categories, open a lot, return to the list, and inspect the welcome page. The preview uses A's actual list and detail renderers against the current draft data. Bid actions are unavailable.
7. Open Readiness, follow Resolve actions, complete missing content and assignments, then record a local readiness review. Later content edits mark that review as stale.
8. In Displays, edit the live draft preview, apply it locally, then edit again to compare draft and applied views. No screen is connected.
9. Inspect Attendees & access, present or print the same shared event-link QR. It is not a personal admission credential. The encoded loopback destination works only in this browser with its local data; hosted sharing and iPad access are simulated.
10. In Notifications, review the demo sender/consent prerequisites and run a simulated SMS check. Failure and interruption remain distinct from a fixture pass. No texts are sent.
11. Donations has a separate destination for optional giving information. It contains no checkout or money movement. Sponsors belong to event presentation and are optional.

Editor text is retained locally before Save changes. Closing, Escape, or Back retains that editor draft; Discard editor draft removes it. Saving commits it to this event's local data. Reload restores the open editor and its draft. Native dialogs contain keyboard focus, and Close restores the initiating control when it exists. In the embedded bidder preview, internal navigation replaces iframe history so browser Back closes the parent preview.

## Prototype assumptions and open decisions

- **One bidding window per lot** is provisional. A new draft assignment replaces that single reference. There is no relisting or post-approval rescheduling workflow.
- **Visibility of later windows** remains open. Existing staging hides the catalog until bidding opens. Staff preview deliberately shows every draft lot and does not grant audience visibility or authority.
- USD and integer cents are fixtures. Opening bids and increments are positive amounts, with at most two decimal places. The displayed example is `$100 current + $25 increment = $125 next eligible`. Real currency, scale, increments, bid ordering, admission, retry, closing, extensions, self-raise, and post-close policies remain undecided.
- Date/time inputs are wall-clock fixtures with an event timezone label. They do not schedule a job or interpret daylight-saving transitions. Window overlap policy and authority to approve/reschedule remain open.
- Shared-link hosting, phone versus invitation admission, staff/business authority, actual SMS consent/provider/delivery, connected TV/projector discovery, and donation/payment/receipt behavior need separate decisions.

## Verification

```sh
pnpm install --frozen-lockfile
node prototypes/event-studio/evidence/walk.mjs
node prototypes/event-studio/evidence/capture.mjs
# URL=http://127.0.0.1:<other-port>/event-studio/ to target another owned preview
pnpm typecheck
```

The final run passed **58/58 browser checks**; `pnpm typecheck` passed. The browser walker runs in disposable Chromium and WebKit contexts. It writes `evidence/results.json` and representative desktop/laptop screenshots under `evidence/shots/`. It tests the complete journey, persistence, validation, repeated actions, event isolation, Back/Escape/focus, draft/applied displays, SMS interruption and failure, storage failure/recovery, and 60-lot bulk assignment. These are implementer-owned prototype checks, not independent frozen-contract evidence or production acceptance.

See [DESIGN_RECORD.md](DESIGN_RECORD.md) for inspection provenance, visual decisions, evidence, and limitations. The retained bidder source under `prototypes/lanyard` is unchanged. The QR generator is vendored from `qrcode-generator` 2.0.4; its MIT license notice is included in the source and [vendor/LICENSE](vendor/LICENSE).
