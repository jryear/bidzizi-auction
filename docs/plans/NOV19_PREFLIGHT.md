# Morning preflight

The engineer runs this before staff rely on the real event. `scripts/preflight.mjs` defaults to read-only checks: verified HTTPS/reachability, guest-visible published event, entry open/nonclosed phase, exact expected opening/closing instants, at least the expected number of visible items, and a fresh alert readiness receipt. It returns JSON and exit 0 only when required checks pass; failures return exit 1 with an action. No staff password, DSN or database connection is printed.

Use Node 24 and pnpm 12.4.2. Supply the actual production room code and expected UTC/offset timestamps; these are not yet supplied for Nov 19. Do not infer the show schedule from the current clock or a test event.

```sh
node scripts/preflight.mjs \
  --origin https://app.bidzizi.com \
  --event-code "$SHOW_EVENT_CODE" \
  --starts-at "$SHOW_STARTS_AT" \
  --ends-at "$SHOW_ENDS_AT" \
  --min-items "$SHOW_VISIBLE_ITEM_COUNT" \
  --alerts docs/evidence/nov19/alert-readiness.json
```

Expected times must include `Z` or an explicit UTC offset. Default visible-item minimum is one; supply the real count to catch unexpectedly hidden items. The exported API also accepts expected item UUIDs for a specific list. An event public snapshot is required (`preview=false`); a signed-in preview is not evidence of guest visibility. The default does not join, bid, create, publish or delete anything. It refuses disabled TLS verification and follows no redirects/challenges/blocks/429s.

## Alert receipt

Immediately before the check, the engineer reads back both production Sentry rules in authenticated Sentry UI: enabled, project bidzizi-real-v1, category tags server-failure/guest-blocked, required production environment, and Email notification to jryr/zackj13@gmail.com. Refresh `alerts-production-rules.json`'s verifiedAt only after this actual readback. Then run:

```sh
node scripts/refresh-alert-readiness.mjs --production-rules-confirmed
```

This uses read-only Vercel requests to verify the actual production alias, READY deployment and DSN variable presence. It checks that alert application/dependency bytes match the demonstrated delivery source. It combines those checks with the explicit engineer Sentry-rule confirmation; it does not claim an automated Sentry management API read. The receipt expires for preflight after 24 hours. Existing credentials stay in server-held configuration; no secret values are retained in the receipt.

Production inbox delivery is demonstrated and user-confirmed, but two incidents took 98.852 and 103.850 seconds. Normal preflight warns about this and requires direct staff-to-engineer escalation. Add `--require-subminute` to enforce the original strict acceptance criterion; this currently returns nonzero. A fresh configuration receipt is not a new email test, an availability guarantee or proof every guest phone is healthy.

## Explicit practice mode

Add `--practice-event` only when a rehearsal is intended. Provide the existing staff email/password through `PREFLIGHT_HOST_EMAIL` and `PREFLIGHT_HOST_PASSWORD` using a private environment/credential mechanism; do not put the password in CLI arguments or shell history. Credentials may be sent only to app.bidzizi.com, staging.bidzizi.com or the explicitly guarded local test origin.

The script first checks the specified real event read-only, then creates a separate `Preflight practice <UUID>` event, adds one practice item, publishes it, verifies one join, deletes only that event, confirms its 404 absence and logs out its own host session. It never bids or edits the real event. If create committed but its response was lost, cleanup discovers only the exact unique practice name through that authenticated host's event list. Ownership/name/isPractice are checked before deletion. Cleanup or logout failure returns nonzero and identifies the fixture for engineer follow-up. Existing host/account activity and idempotent request receipts are not broadly erased.

Practice mode was validated only on a disposable local database during stage 5. It was not run against production by readiness implementation. The earlier production alert proof was a separately approved scoped workflow, with its own full account/org cleanup evidence.

## Validation and limits

The failure suite covers unreachable network, a real self-signed TLS handshake rejection, wrong expected times, hidden/missing items, disarmed/stale alerts, strict latency failure, platform 429 stop, failed practice join, cleanup failure, lost create response and credential-origin rejection. The CLI failure exit is checked. A real next build/next start run proved read-only default, practice create/publish/join/delete/logout, independent SQL cleanup and the restore manifest helper. Initial logout failure (missing JSON body) was fixed and the complete suite rerun; the failed log is retained.

See [real local receipt](../evidence/nov19/preflight-local.json), [full validation log](../evidence/nov19/preflight-validation.log), [current alert receipt](../evidence/nov19/alert-readiness.json). Actual venue Wi-Fi, physical phones/QR scans, named staff and the real event's code/times remain human inputs. This script cannot perform those rehearsals.
