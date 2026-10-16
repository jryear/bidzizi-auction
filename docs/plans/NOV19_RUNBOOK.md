# Nov 19: Saturn staff sheet

Use **app.bidzizi.com** for the real show. Staging is a separate sandbox. Keep this sheet beside the Studio laptop. **If a phone says Sending or Unconfirmed, use Check status; do not submit a new bid.** The server clock keeps running during a Wi-Fi outage.

**Roles to fill before rehearsal:** Studio operator [name/contact outstanding] makes host decisions; guest helper [name/contact outstanding] assists phones and keeps a problem log; engineer [name/contact outstanding] handles service failures and recovery. Kent is preparing the real event; his show-day operator assignment is not yet confirmed. Zack receives failure emails at zackj13@gmail.com; an on-call phone/contact is still needed.

| When | Staff action |
| --- | --- |
| Now–Oct 23 | Kent builds the real production event: actual items, photos, sponsors, opening/closing times and donation recipient if used. Record friction while there is time to fix it. |
| Oct 26–Nov 6 | Rehearse the complete journey on staff phones, including older iPhones, Android, in-app links, Wi-Fi/cellular, reconnect and simple mode. Start with the documented 10–15-person exercise; the proposed 50-person crowd exercise is still outstanding. |
| Nov 9–11 | Correct event details, confirm roles/escalation contacts, print QR cards and complete the two-metre scan check on physical phones. |
| **Nov 12 freeze** | Freeze features. Verify the actual event link, displayed schedule and visible items; keep only necessary defect fixes. |
| **Nov 19 morning** | Engineer runs preflight; operator checks the real event in Studio and guest view, helper scans the printed QR and confirms a backup cellular connection. Use a separate clearly named practice event for any bid rehearsal. |

| Situation | What staff do |
| --- | --- |
| Wi-Fi drops or a phone stalls | Try cellular or the approved backup hotspot. Keep the same browser tab/device identity. Check status for pending bids after reconnecting. Do not promise that bidding has paused. Tell the operator if the outage affects several phones. |
| Guest cannot join or bid | Check the room code, event link and whether new guests can join. In Studio → Live → Devices, inspect reported Problems. Use Share → Open simple mode; this still needs a network connection and refreshes standing when the page reloads. |
| Guest lost their phone/access | Studio → Live → People → participant menu → Rejoin code (new phone). Confirm the correct existing participant with the operator, give the code privately, and use it on the replacement phone. Do not create another identity to recover earlier bids. |
| Mistaken bid | Operator opens the item in Live, selects the specific bid → Void bid, records a reason and confirms. The next eligible bid leads; the old receipt stays on record. If it had won, confirm the winner again in Results. |
| Item withdrawn | Operator opens the item → Withdraw item, writes the guest message and confirms. Withdrawal stops bidding permanently for that item and preserves its bids. |
| Closing time changes | Operator changes Item closes and saves; verify the confirmed time in guest view and announce it. With bids placed, shortening must leave at least five minutes from server time. An already closed item with bids cannot be reopened this way. |
| Several guests fail / service unavailable | Helper records time, room code, step, phone/browser and visible message; omit passwords/rejoin codes. Operator contacts the engineer directly—email can take over a minute. Engineer reports whether service or Wi-Fi is affected and directs the operator. Staff do not run rollback or database commands. |

**QR printing:** Studio → Share → Table card or Full page. Print the production room code/link clearly, with space around the QR and no cropping. From two metres, scan the actual printed page in venue lighting on an older iPhone and an Android; confirm the correct event name. Physical scans, venue connectivity, real event code/times and all role/contact fields remain outstanding until recorded.

---

# Engineer appendix

**Current verified deployments (Oct 16):** production `dpl_9kMq1rKxWtkEUVEJJ6SggrLK1Xkj`, source a55dc11; staging `dpl_9E34vwRSHXbU5TfXE69Ggzxpucgh`, source 9f1d258. Read both aliases before any intervention. Preserve the photo, thumbnail, paste-focus and Safari dialog fixes. Source/provider history is in NOV19_EXECUTION_STATE.md and REAL_V1_PRODUCTION_RELEASE.md.

**Before guests arrive:** check verified HTTPS, public event reachability, exact expected opening/closing instants, visible item count, new-entry state and fresh alert readiness. Run scripts/preflight.mjs with the actual code/times and an engineer-verified alert readiness receipt. Default checks are read-only. Practice mode is explicit and creates/deletes only its uniquely named practice event; do not use the real event for test joins or bids. Resolve any nonzero result before staff rely on the preflight. Exact invocation and receipt procedure are documented beside the script in NOV19_PREFLIGHT.md.

**Escalation:** inspect Vercel errors and Sentry server-failure/guest-blocked issues, correlating safe event IDs and occurrence times. Production inbox proof is demonstrated, but server/health notifications took 103.850/98.852 seconds; client error took 26.959 seconds. Email is not a guaranteed subminute emergency channel. Keep a direct staff-to-engineer contact available. Missing telemetry does not establish that phones are healthy; ask the helper what guests see.

**Application rollback:** first compare the current domain-bound deployment with the incident revision. The retained deployment `dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT` was independently read back READY in the production project; source 4d6028f retains both dialog fixes. With explicit incident rollback authorization, from a production-linked checkout run:

```sh
vercel rollback dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT --scope saturn-ea53
```

Read back app.bidzizi.com, verify public pages and signed-out API isolation, then have staff verify their event. Leave migrations 001–010 in place. The immutable rollback deployment predates the alert DSN and would disarm alerts; account for that in incident communications. This command was documented after readback and has not been executed. If a newer release has landed, reselect and read back the appropriate retained deployment.

**Database recovery:** do not reset production while investigating. Preserve the live database and all receipts; identify the last known good point and later accepted bids/pledges. Restore into a new isolated branch first, compare event/bid/receipt/standing data with read-only verified-TLS SQL, and obtain separate production recovery authority before changing connections or promoting/resetting a branch. Reconcile post-point accepted activity explicitly. The successful Oct 16 drill matched an ended event at LSN 0/2824DA0 and cleaned up its temporary branch; actual configured history retention was 24 hours. See NOV19_RESTORE_DRILL.md. That drill is not authority for a live recovery or a whole-project RTO guarantee.

**Evidence boundaries:** current Chromium/WebKit suites passed against next build + next start. Safari 17 collapse reproduction is recorded by the release owner; Emma's actual production paste confirmation, real HEIC uploads, older iPhone journeys, venue Wi-Fi and two-metre QR scans remain human checks. The runbook's controls were checked against live.tsx, share.tsx, devices.tsx, host.ts and the journey/browser suites; changing a label does not create a new capability.
