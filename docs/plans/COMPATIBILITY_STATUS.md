# Compatibility build — 2026-10-13

Continued by Codex after Claude's session limit. Source baseline `ece2890`; worktree `real-v1-claude-shell`, branch `jryear/real-v1-claude-shell`. The interrupted sheet hotfix was completed separately in `real-v1-deploy` as `d58c9be` (`hotfix/sheet-no-dialog`) and integrated while preserving the shell's in-progress telemetry work.

**Software implementation and local browser checks are complete. The requested old-iOS simulator validation remains unavailable.** No push, production deployment, cloud resource, real-message send or provider configuration change was performed.

## What changed

### Bid sheet

A fixed overlay replaces the native `<dialog>` top layer. It preserves keyboard focus containment, inaccessible background content, Escape/backdrop dismissal, scroll position, drag dismissal and sending-state protection. Visual viewport sizing keeps the primary action above the software keyboard. Safari opening controls explicitly receive focus for correct restoration.

Chromium and Playwright WebKit checks verify actual button bounds and hit targets at 390×844, 390×420 and 1440×1000. A lost accepted response is recovered using the original receipt, with exactly one recorded bid. This demonstrates engine/browser behavior, not iOS 16.4 behavior.

### Devices and error reporting

New migration `009_client_reports.sql` stores device, error and render-health reports. Participant/staff identity comes from server cookies; payload identities cannot impersonate a participant. Reports have bounded bodies, validation, atomic per-device/per-IP limits, route/query separation and diagnostic redaction. No form values are deliberately collected. Raw diagnostics can never be assumed to be anonymous; common emails, credentials and URL query strings are redacted before storage.

Guest reporting starts before hydration and continues after the app starts; foreground heartbeats make the last-seen activity estimate meaningful. Staff and stage errors report separately. Live → Devices shows the reporting device mix and surfaces newly reported problems. “No reported problems” deliberately does not assert that every device is healthy. Successful bid receipts do not create a false missing-button health alert.

Device/error reads are organization-scoped. Queries cover the last 30 days, and subsequent writes delete expired reports; retention does not change participant access duration. Simple-mode pages do not emit JavaScript diagnostic beacons.

### Browser compatibility gate

Declared targets: iOS Safari 15.4+, Chrome/Chrome Android 100+, Samsung Internet 18+, Firefox 115+, and WebViews on those engines. These are engineering targets, not a claim that every listed version has been tested.

`pnpm compat` checks browser APIs using `eslint-plugin-compat` and CSS using `doiuse` plus explicit checks for color-mix, viewport/container units, overflow clip and field-sizing fallbacks. Unsupported unguarded critical features fail the check. The gate's negative fixture proves that removing required CSS fallbacks fails. Cosmetic/partial-support exceptions have specific explanations in the checker. Autoprefixer uses the same Browserslist targets; Next's documented custom Browserslist support targets the client output as well.

Supported fallback declarations precede color-mix and viewport/container units. Relational selectors are guarded. Vibration/fullscreen controls feature-detect optional APIs. Keyboard reordering retains its latest position, avoids double-handling Alt+arrows, and no longer loses focus to a delayed amount-field selection.

### Simple mode

`/e/CODE/simple` returns complete HTML without a client bundle. A restrictive script CSP and tests with JavaScript disabled verify this. Forms POST and redirect through the **existing server engine**, retaining the same cookie identity, server clock, bid standing, privacy, receipt ownership and idempotency.

Includes join, rejoin, item detail, bidding, receipt checks, My bids and donation pledges. Accepted receipts describe a recorded bid separately from current leadership. Losing items lead with the current top bid. Uncertain bids/pledges offer status checking or retry of the original request; they do not offer a fresh transaction. Donations record pledges and never claim to charge money.

Entry points: guest error boundary, pre-hydration stuck-page notice, no-JavaScript link, Event page/footer and Studio Share/Devices. Error fallback does not turn a failed request into acceptance.

## Evidence

All software checks used Node **24.4.1**, compiled application output and the separate loopback database `bz_test_compat_20261013`. No shared review database was seeded or reset for testing.

| Check | Result |
|---|---|
| `pnpm compat` | PASS; zero blocking findings |
| Compatibility gate negative/positive CSS fixtures | 2/2 |
| Device parsing | 10/10 |
| Telemetry endpoint | 8/8: draft isolation, validation/size/origin, concurrent device/IP limits, redaction, staff/tenant scoping, retention |
| Devices UI | PASS; report appears in Live, no false successful-bid alert |
| Bid-sheet connected journey | 2/2 engines: Chromium and WebKit |
| JavaScript-disabled simple-mode journey | 2/2 engines: join, detail, bid/pledge replay, outbid/My bids, receipt ownership, uncertain recovery, rejoin, CSRF |
| Auction journey | 55/55 |
| Operations UI | PASS |
| Items UI | 15/15 |
| Studio saving | 7/7 |
| Photo UI / connected photos | 11/11 and 8/8 |
| Display logic / Items logic | 10/10 and 10/10 |
| TypeScript / production Next build / diff whitespace | PASS |

Save/photo fixtures explicitly acknowledge diagnostic requests without counting them as event edits. Their mutation assertions remain intact. The Items focus assertion waits for the intended animation-frame focus change instead of racing it.

[WebKit sheet, phone](images/compatibility/webkit-sheet-390.png) · [WebKit sheet, desktop](images/compatibility/webkit-sheet-1440.png) · [Simple mode, phone](images/compatibility/webkit-simple-390.png) · [Simple mode, desktop](images/compatibility/webkit-simple-1440.png) · [Devices and alert](images/compatibility/devices-1440.png).

Phone/desktop captures were inspected. Physical-device performance and VoiceOver remain untested; the crowd rehearsal below supplies that evidence.

## Old-iOS matrix: not passed

| Requested runtime | Actual state |
|---|---|
| iOS 16.4 | Not installed; Apple downloader reports unavailable for arm64 and universal variants |
| iOS 17.5 | Not installed; Apple downloader reports unavailable |
| iOS 18.6 | Not installed; Apple downloader reports unavailable |

Local Xcode is 26.0. `xcrun simctl list runtimes` returns no runtimes. `pnpm test:ios` therefore exits **99 (infrastructure unavailable)** and writes [the matrix](images/compatibility/ios-matrix.json). It has not produced a simulator screenshot or a real iOS pass. Changing a user agent or running Playwright WebKit is not a substitute.

The runner uses [Apple/WebKit's documented iOS WebDriver capabilities](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13/). It is syntactically checked, but its native-simulator path is unexecuted. Once the requested runtimes and Remote Automation are available, it drives real Mobile Safari through the guest journey and requires an isolated vulnerable `88997dd` build via `IOS_BASELINE_URL` for the 16.4 RED comparison. UI failures exit 1; missing infrastructure exits 99. Any simulator-driver issues discovered then remain work to resolve before claiming that matrix passed.

## Run and review

- Studio preview remains **http://127.0.0.1:3420/studio**, using `bz_test_claude`. Migration 009 is applied only to local test/review databases. Existing account and events are retained.
- Run the connected software suite against a compiled app on its disposable database:

```sh
BASE=http://127.0.0.1:3432 HOST_EMAIL=... HOST_PASSWORD=... \
BIDZIZI_DATABASE_URL=postgres://...@127.0.0.1:55433/bz_test_... \
pnpm test:compat
```

- Run `pnpm test:ios` separately with the same test context and `IOS_BASELINE_URL`; expect 99 until the native prerequisites exist.
- [Saturn's 10–15-person rehearsal](COMPAT_CROWD_REHEARSAL.md) covers real phones, in-app browsers, Wi-Fi/cellular, outbid/recovery, donation/rejoin, simple mode and results.

The saved information-architecture tranche remains separate. This compatibility build does not implement its publication terminology, event index or expanded Live console.
