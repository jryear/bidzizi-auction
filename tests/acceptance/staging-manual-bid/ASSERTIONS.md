# Proposed invariant → independent assertion map

All 28 executable groups are concrete: 7 acceptance and 21 adversarial. This map
describes what their actual HTTP, SQL and A browser probes must establish. It is
not evidence that a candidate has executed or passed them. No missing callback,
unknown mode, zero-case suite, metadata or reviewer vote counts as completion.

| Executable group | Challenge and required result | Bound source |
| --- | --- | --- |
| BID-A01 | Exact test-person/business context, active server-held business and VIEW+BID capability; no extra authority/other-person fields | probes.mjs context |
| BID-A02 | First minimum uses approved opening10000, not draft111; POST201 complete receipt agrees with one committed bid, immutable receipt and standing version/count1, next minimum12500 | probes.mjs durable-first |
| BID-A03/A05 | Another business submits12751 without an invented grid; SQL standing count2/minimum15251; complete first receipt remains exact | probes.mjs competing-higher |
| BID-A04/X07 | Concurrent identical actor/key submissions both recover one receipt/bid/version; fresh-session replay changes no complete rows; changed amount sealed conflict; two people using the SAME UUID receive distinct actor-owned accepted receipts and bids | probes.mjs retry-and-conflict |
| BID-A06 | Two separately signed-in people act for one business on different released lots; SQL actor IDs differ/business agrees; coworker A view cannot fabricate original person's accepted marker or self-raise control | probes.mjs same-business-people |
| BID-A07/A08 | Actual A review shows amount/business/person with zero SQL writes; held request visibly pending without green result; acceptance paired with actual201 and committed SQL; second browser12751 yields authoritative outbid after reload; stale lotB review receives real409 and visibly rejected, with only rival's accepted SQL | bound-probes.mjs A review |
| BID-A09 | Interceptor lets actual201 commit then drops acknowledgement; unconfirmed A UI and independent one-bid SQL; Check status looks up original UUID and restores exact receipt without any row/version mutation | bound-probes.mjs lost acknowledgement |
| BID-X01 | Member-only, VIEW-only, BID-without-VIEW, unlisted and staff-only each deny POST/standing; complete privileged rows unchanged | probes.mjs admission-denials |
| BID-X02 | Typed Member ID/person/role/accepted claims and headers cannot create permission, receipt or changes; sealed error | probes.mjs typed-claims |
| BID-X03 | Pine versus Saturn business/event/lot crossings deny; another person's receipt is absent/opaque with no private request/actor/amount payload; complete privileged SQL unchanged | probes.mjs tenant-and-receipt |
| BID-X04 | Revoke active business-person membership after acceptance; old-cookie POST/replay/standing/receipt deny; complete authority/current standing and original receipt SQL preserved | probes.mjs revocation |
| BID-X05 | Concurrent different businesses equal10000: exactly one201, one stable durable BELOW_MINIMUM409; one bid/version/count1; independent SQL winner and both replay outcomes agree | probes.mjs equal-race |
| BID-X06 | Rival first10000 makes stale10000 a stable durable rejection; new12751 succeeds; leading business and its other authorized person get explicit durable UNSUPPORTED_SELF_RAISE for fresh requests, without changing accepted bids/version | probes.mjs stale-and-terminal-retry |
| BID-X08-before | Real DB preopen request durable NOT_OPEN; repeated key exact; independent DB clock crosses opening without release mutation; same old key remains rejected, fresh key accepted | probes.mjs window-denials |
| BID-X08-closed | Valid closed selected-lot POST durable stable CLOSED; zero accepted bids and unchanged complete rows on replay | probes.mjs window-denials |
| BID-X11 | Independent receipt INSERT and standing UPDATE trigger failures each yield actual503 with sealed error and exact full live-table rollback; remove fault and same key commits once with expected standing | probes.mjs atomic-failure |
| BID-X15 | Fraction/string/null/negative/unsafe integer and extra identity/history/currency/max/donation fields400; sealed errors and complete privileged-row equality | probes.mjs validation |
| BID-X04-rest | Individually revoke business, can_bid, organizer membership, BID admission, person and catalog VIEW while BID stays active; downgrade admission to VIEW; revoke/expire session. Every protected transport/replay denies, no privileged mutation, original accepted receipt immutable | bound-probes.mjs revocation |
| BID-X07-rest | Actor's existing UUID with another authorized business, lot or event yields sealed conflict; invalid ruleset400; wrong-route receipt lookup opaque deny; all privileged rows/receipt unchanged | bound-probes.mjs changed payload |
| BID-X08-unselected | Draft/unselected/cross-event lot cannot become public or bid; exact approved selected snapshot retained. Runtime role is nonowner/nonsuper/NOINHERIT and real SQL authority or immutable-history writes fail42501 | bound-probes.mjs unselected/runtime privileges |
| BID-X09 | Actual held lot lock, independently observed blocking PID and transaction start before close; release after actual DB close below statement timeout; CLOSED decision timestamp after close, no bid. Earlier accepted lotB receipt replays exactly after close. Three further held-lock cases expire a valid session during POST/standing/receipt wait; each401 at post-lock decision/read and complete privileged SQL unchanged | bound-probes.mjs queued-close and expiry |
| BID-X10 | Actual app-only365day preload marker plus compatible Date/PG proof; receipt decision DB-bracketed. Browser Date±day preserves genuine open controls; forged request times cannot open preopen/closed lots. Closed cannot send; preopen A cannot disclose lots. Standing serverNow independently DB-bracketed and phase agrees with immutable SQL window | bound-probes.mjs clock, protocol.mjs standing |
| BID-X12 | Abort before delivery => unconfirmed and no SQL; no-receipt Check status then Try again retains exact original UUID/payload and commits once. Received HTTP503 on another lot also stays unconfirmed with full rollback | bound-probes.mjs interrupted transport |
| BID-X13 | Capture genuinely authorized old-person receipt/context before logout, hold across second-person sign-in, deliver actual200; current actor identity and controls remain current; no old accepted ownership or person text, SQL unchanged | bound-probes.mjs context races |
| BID-X14 | Actual A review/confirm receives201; captured actor/UUID agrees with durable SQL and visible ownership. Confirmed standing has DB-bracketed as-of; offline keeps its stamp/stale label and disabled sending while rival commits. Reload GETs that exact owned receipt, verifies complete immutable receipt, then shows authoritative outbid/count2 with no further writes | bound-probes.mjs offline |
| BID-X15-rest | Origin/content-type/JSON/size/UUID/cap malformed requests sealed errors and no changes. Cap1000000000 and exact cap-increment edge/one-cent-over edge prove null versus available next minimum. Approved event increment5000 cannot silently become2500: sealed UNSUPPORTED_RULESET/no writes/context disabled | bound-probes.mjs boundary validation |
| BID-X16 | Reuse accepted session under flag-off/production/custom Preview/unsafe origin/unsafe DB settings; all protected transports/context deny without rows changing; restore local gating and fresh session retrieves original immutable receipt | bound-probes.mjs mode guards |
| BID-X17 | Restart only the own app process; old and fresh sessions read identical immutable catalog, receipt and bid plus current standing; full privileged SQL unchanged and no fixture reset | bound-probes.mjs restart |

Error/private-response helpers apply no-store and sealed allowlists, not just a
top-level receipt absence. Generic authority-copy allowlist excludes nested
private actor/business/request/amount disclosures. Current standing has an exact
allowlist and no private actor/receipt fields. SQL snapshots use complete rows;
browser expected authority comes from independent fixtures/SQL, never app helpers.

The 28 groups cover more named invariants because related cases share a fresh
fixture; the final run pins their actual 7/21 mode counts and executed counts.
Previous mode mutation could run zero cases and exit0; the corrected runner must
classify such a packet as HARNESS99. Pure helper counterexamples and history are
versioned as preparation evidence, not candidate correctness evidence.

## Deliberate weak-candidate challenges

- Accepted JSON without committed SQL fails A02/A07; non-atomic receipt/standing
  writes fail X11/X12.
- Login, Member ID, VIEW-only or BID-without-VIEW authorizing writes fails X01/X02.
- Receipt lookup before current authority fails X04 and X04-rest, including
  independent VIEW revoke while BID remains active.
- A global requestUUID key or duplicate nonserialized actor retry fails A04/X07.
- Equal-amount unsynchronized acceptance fails X05; client or transaction-start
  clock authorizing after the held close/expiry boundary fails X09.
- New UUID after lost acknowledgement fails A09; every resolved HTTP response
  rendered accepted fails real409 A07/A08 and real503 X12.
- Cached old-person responses repopulating the new actor fails X13; offline
  fabricated fresh standing fails X14.
- cap boundary >= versus > mistakes fail X15-rest's exact and one-past edges;
  unsupported approved increment silently replaced by2500 fails the5000 case.

## Classification and limits

Finite missing context404 after a healthy inherited session is ordinary feature
RED. Owned tool/module/storage/browser/dependency/setup failures are99. Reached
application500/deadline is candidate1 and baseline99. Assertions establish only
their executed outcome; syntax/list/helper checks do not establish bidder GREEN.

Both failed clock instruments remain additive history. The transparent callable
v3 Date replacement must bind the actual Next/PG primitive/reproduction proof and
parent's corrected trusted base before freeze. Header reach alone is insufficient.

All tests use explicit synthetic identities and isolated owned PG/Next/Chromium
fixtures. This does not settle live money/identity/closing/auto-bid rules. Actual
visual composition, desktop/phone/device behavior, browsing state/focus, exact
hosted revision/HTTPS/provider E2E remain separate inspections.
