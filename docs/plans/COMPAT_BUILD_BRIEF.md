# Every phone works: compatibility build (2026-10-13)

## Why

Saturn's Nov 19 event will have about **50 active bidders on their own phones**: old iPhones, budget Androids, Samsung Internet, and links opened inside Gmail or Facebook. In the first staff walkthrough, two not-updated iPhone 14s got an opaque overlay instead of the bid sheet: older iOS Safari paints a blurred `::backdrop` over the dialog. That was hotfixed in `3fb5806` on `hotfix/old-ios-dialog`, and you have a queued note to merge it. **Goal: no guest is ever stuck, on any phone.**

Start this after the sign-in hero and the hotfix merge. Commit after each stage.

## Stage 1: device and error reporting

- `POST /api/v1/e/:code/telemetry`, rate-limited, small payloads, no personal data beyond the participant id if joined. It records:
  - the user agent, parsed into browser, version, OS and device class, plus in-app browser detection (Gmail, Facebook, Instagram, LinkedIn);
  - viewport;
  - JS errors and unhandled rejections (message, a trimmed stack, the route);
  - render-health signals for critical surfaces, e.g. "bid sheet opened but its Bid button isn't visible or tappable" (check with `getBoundingClientRect` and `elementFromPoint`), and "page failed to hydrate".
- Add a migration and a retention limit.
- **Studio Live gets a Devices panel:** the real device/browser mix, and an alert when any guest hits an error, so staff see problems within seconds.
- Add a staff-side error report too.
- Journey tests for the endpoint (validation, rate limit, scoping).

## Stage 2: compatibility gate on every build

- Declare support in `browserslist`: iOS Safari ≥ 15.4, Chrome and Chrome Android ≥ 100, Samsung Internet ≥ 18, Firefox ≥ 115, plus in-app WebViews on those engines. Adjust with justification.
- Add a `pnpm compat` check that fails on unsupported features without a fallback. Use `eslint-plugin-compat` for JS APIs and `doiuse` or `stylelint-no-unsupported-browser-features` for CSS.
- Fix every finding:
  - fallbacks (for example before `color-mix()`);
  - `@supports` guards;
  - feature detection.
- Where the toolchain can generate fallbacks automatically (Lightning CSS or PostCSS targets from browserslist), turn that on.
- **Rule:** no guest-critical path (join, browse, item, bid sheet, Bid button, receipt check, My bids, donate, rejoin) may depend on iOS 17+ features without a working fallback.

## Stage 3: real old iOS Safari, automated

- iOS simulator runtimes **16.4, 17.5 and 18.6** are being downloaded on this Mac. Check with `xcrun simctl list runtimes`, and wait if they're still installing.
- Create iPhone simulators (for example iPhone 14 on 16.4, iPhone 15 on 17.5, iPhone 16 on 18.6). Drive **Mobile Safari** through the full guest journey: join → browse → item → **bid sheet visible with a tappable Bid button** → place bid → outbid alert → My bids → donate → rejoin code.
- Pick the most reliable driver: `safaridriver` with simulator capabilities, Appium XCUITest, or `simctl openurl` plus scripted checks.
- Capture screenshots per step per runtime. Assert visibility with bounding boxes, not just DOM presence.
- **Confirm the hotfix with it:** on 16.4 the old build (88997dd) should fail the bid-sheet check, and the fixed build should pass.
- Add `pnpm test:ios`.

## Stage 4: simple mode, for any phone that still breaks

- `/e/[code]/simple`: a server-rendered page that works **without JavaScript**: plain HTML forms that POST, then redirect.
- Same cookie identity. Join and rejoin work there too.
- Browse the item list, open an item, and place a bid. **The same server rules and idempotency apply:** a hidden request id, receipts, and a clear accepted, rejected or "check status" outcome.
- My bids and donate.
- Small, fast, readable, still on-brand, but basic.
- **Entry points:**
  - a guest-app **error boundary** that shows "Something went wrong. Continue in simple mode" (and reports the error);
  - a quiet "Having trouble? Simple mode" link in the guest app's Event page and footer;
  - the link in the Studio Share panel, for staff to hand to anyone stuck.
- Journey tests for simple-mode join, bid (including retry and duplicate safety) and receipts.

## Stage 5: crowd rehearsal kit

Write a one-page plan for a practice event with 10–15 Saturn people on their own phones:
- what to do;
- what to watch in the Devices panel;
- how to report problems.

## Rules

- Keep these green:
  - tsc;
  - `next build`;
  - `tests/v1/journey.mjs`;
  - `operations-ui.mjs`, `items-ui.mjs`, `display-logic.mjs`;
  - the image checks;
  - the new `compat` and `test:ios`.
- Commit locally after each stage. **No push, merge to main or deploy:** the coordinating session reviews and deploys.
- Keep the dev server on `127.0.0.1:3420`.
- Finish with a "Compatibility" section in `docs/plans/CLAUDE_SHELL_CHECKPOINT.md`, with the device matrix results and screenshots.
