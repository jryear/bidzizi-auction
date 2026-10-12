# Real V1 schema — independent architectural review

Date: 2026-10-12  
Reviewer: Codex, independent static architectural review  
Branch: `real-v1/t1-foundation`  
Reviewed revision: `10c36fa8825636e51c52de07ce3c360d489fce73`  
Verdict: **CHANGES REQUIRED — the schema is not yet approved for T1 implementation.**

## Scope and conclusion

Reviewed `AGENTS.md`, `REAL_V1_PLAN.md`, `REAL_V1_SCHEMA.md`, `src/server/manual-bids.ts`, and migrations 009, 016, and 018. Supporting inspection covered `src/server/auth.ts`, `src/server/db.ts`, and migration 003's standing/bid/receipt constraints. No code or migrations were changed, no database was accessed, and no concurrency tests were run. This is design evidence, not executable acceptance or release evidence.

The initial review covered `119972a0b2e4dc25f9b73cf02bdf4f111ea93c69`. Before writing this report, I checked the changes through the revision above. Only the plan and schema changed. This report credits those revisions rather than treating the original findings as unchanged.

**The design does not yet demonstrate that every existing guarantee survives.** Atomic receipts, integer amounts, business standing, and immutable item snapshots have sensible counterparts. The written decision sequence loses the current post-wait authority check on bid replay; donation consent/recovery and runtime database boundaries remain underspecified; mutable windows introduce an unresolved decision race. The revised revocation protocol is an improvement, but does not justify its unconditional deadlock-freedom or cross-org isolation claims.

The schema's “accepted after revision” and “Accepted in review” statements overstate my earlier recommendation. I recommended the direction subject to corrections; I have not approved the current protocol. The schema and plan should record this report's outstanding conditions before the design gate is treated as passed.

## Findings

### R1 — Blocking: revocation scope and lock ordering remain incomplete

**Evidence:** schema, “Authority and revocation”; migration 016, lines 2–28; `auth.ts`, `identity()` and `staff()`.

Org-bound sessions and function-mediated authority changes improve the original proposal. However, computing the organizations for a shared person and locking them in ascending order does not make that set stable. Concurrent session/grant/admission creation can introduce another organization while deactivation discovers or locks the original set. The design does not say whether the set includes existing sessions, inactive relationships, or authority rows being inserted, removed, or moved. Newly added re-entry redemption says it revokes the person's “other sessions,” potentially spanning organizations, contradicting the claim that person deactivation is the only multi-gate path.

Ascending gate order prevents one category of cycles; it is not a proof for transactions also taking person, session, event, request, and standing locks. In particular, a staff mutation must not enter through the ordinary shared-gate decision wrapper and then upgrade to exclusive. Porting `identity()` unchanged would also lock grants/orgs beyond the target organization.

Migration 016 queues raw authority updates through a **BEFORE STATEMENT** trigger before tuple acquisition. The proposed **BEFORE ROW** guard verifies a pre-held gate; it can reject unprepared raw SQL, but it does not automatically queue it as 016 does. This is an intentional operator-interface change, not an identical guarantee. A row guard may wait for a tuple before it can reject the statement.

**Required revision:** specify how shared-person mutation stabilizes organization membership against concurrent authority/session creation, and a complete acquisition order for every supported path. Include inserts, key changes, logout/login, re-entry, and multi-row mutations. Make authority keys immutable where possible. Mutating entry points must acquire exclusive gates before authority row locks, without upgrades. Restrict ordinary reads to their target org. Scope re-entry revocation explicitly; recommend only the recovered attendee's event sessions unless broader revocation is deliberately designed.

Keep database entry points plus guards rather than an app-only convention. Describe unprepared raw SQL as rejected, and exclude owner/superuser trigger bypass from the guarantee. Check the exact advisory key namespace, database, backend, granted state, and exclusive mode. `pg_locks` does not establish acquisition order or expose queue order; its fields alone do not prove use of transaction-scoped rather than session-scoped advisory locking. See [PostgreSQL pg_locks](https://www.postgresql.org/docs/current/view-pg-locks.html) and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

Narrow “one organization's staff changes never stall another organization”: shared-person changes legitimately affect several orgs. Independent actors in unrelated orgs should remain independent. Finally, distinguish 016's gated asset/staff operations from manual bids and 018 activity: the latter paths do not all acquire the 016 shared advisory gate today.

### R2 — Blocking: replay skips freshness after a blocking wait

**Evidence:** schema bid steps 2–4; `manual-bids.ts`, lines 163–169 and 189–195.

The schema returns a prior receipt before its step-4 authority recheck. A session can expire while waiting for the actor/request lock; row locks cannot stop time. Today's `placeTradeBid()` rechecks current authority after the request lock, before either accepted or rejected replay. Accepted replay checks again after obtaining standing.

**Required revision:** explicitly recheck session expiry and applicable authority after blocking acquisitions and before replay/recovery responses. Preserve event/item/business binding on receipt lookup. Replay the immutable original receipt even after window close, subject to the operation's current authority requirements; accepted replay may return fresh standing alongside it. Do not regenerate a receipt using current rules or current catalog version.

### R3 — Blocking: window edits are not serialized with decisions

**Evidence:** schema window rules and bid steps 4–5; `manual-bids.ts`, lines 171–180.

Today's bid decision reads immutable release times. The new engine reads mutable windows but specifies only a standing lock. A concurrent staff edit can invalidate the schedule used by the decision. Publication and award confirmation have the same dependency; award confirmation must also wait for an in-flight final bid before reading final standing.

**Required revision:** define one compatible lock order across publication, window edits, bids, and awards. Hold a shared lock on the applicable window through a bid transaction, with conflicting locks for edits; take the decision clock after waits. Evaluate edit eligibility against the old window values, not the proposed new values. Serialize awards with standing and the window. Record schedule revision in decision evidence so the applicable timing can be reconstructed. Preserve safe concurrent initialization of an absent standing row.

Immutable item/rule snapshots are appropriate. Mutable schedule history must be described as an intentional exception to immutable published terms.

### R4 — Blocking: donation recovery and reviewed-destination guarantees are not fully mapped

**Evidence:** migration 018, lines 38–49 and 265–326; revised pledge table.

The revision correctly separates a donation deadline from bidding and preserves recovery after that deadline. Still missing are explicit counterparts for `UNIQUE(actor_id, request_id)`, exact payload conflict detection, expected nonprofit-version validation, and the different authority requirements for new pledges versus owned recovery. A destination snapshot records what was used; it does not prove it matches what the attendee reviewed.

Today, owned replay requires current session + VIEW and occurs before new-pledge availability/eligibility checks. New pledges additionally require current BID/business authority and the reviewed nonprofit version. Late checks roll back the insert on authority or availability failure.

**Required revision:** retain those behaviors, including actor-change rejection, immutable payload/receipt binding, and atomic request/pledge persistence. Define how generic `requests` participates; do not leave two independent idempotency records that can disagree. Lock settings, event/nonprofit association, destination, and authority as required; preserve late refusal with rollback. Recovery must work after disabling donations, destination changes, and deadline expiry under current session + VIEW. New requests must satisfy the current deadline, toggle, destination revision, and BID/business eligibility.

Specify publication as the availability start, a non-null deadline before enabling donations, and whether a later window edit changes the defaulted deadline. Recommend storing the default once and changing it only through an explicit donation-settings edit.

### R5 — Blocking: database runtime boundaries remain weaker or unspecified

**Evidence:** schema ground rules; migration 009's entry functions; migration 016's asset functions and privilege revocation; migration 018, lines 53–120 and final function privilege block.

The revised design restricts authority mutations to database entry points, but still says other decisions run in TypeScript transactions without a complete privilege specification. Existing entry, asset, and activity/donation operations use database functions with sensitive tables withheld from runtime access. Append-only permissions cannot prevent an unauthorized initial insert, forged receipt, or private read.

**Required revision:** retain function-mediated access for these operations or specify an equivalent enforceable database boundary. List runtime table, column, and function privileges, with fixed function search paths and no unintended PUBLIC/default grants. State which invariants are database-enforced and which rely on trusted server code. The manual-bid path already uses TypeScript transactions; this finding concerns losing stronger boundaries elsewhere, not a claim that all current bidding runs in SQL functions.

For assets, “ported as-is” must include immutable bytes, quotas, upload ownership, saved/published reference binding, and fresh read authorization, not just MIME/size normalization.

### R6 — Blocking: relational and monetary invariants need explicit counterparts

**Evidence:** migration 003, lines 20–52; migration 009 slot constraints; migration 016 composite asset relationships; migration 018 composite event/destination relationships.

The table outline lists independent IDs without specifying enough relationships to establish same-event/same-org containment. In particular, preserve the standing's accepted-bid-to-same-item foreign key. Require published items to reference windows and catalog versions from their own event; businesses, assets, nonprofits, and awards must remain in the applicable org/event boundary. Scope attendee sessions to both their org and admitted event during authorization, not merely through a non-null event column.

**Required revision:** enumerate these composite constraints or equivalent database checks, the standing zero/nonzero invariant, count/version bounds, bid cap, and receipt identity/payload bindings. Ensure JSON validation rejects missing required fields rather than passing through SQL NULL semantics. Serialize additive publication and enforce unique event-wide positions, immutable snapshots, and atomic publication markers. The draft references `items.published_at` without declaring it.

Freeze event unit/scale once published or used in a durable monetary record. An editable unit must not reinterpret old amounts. Preserve fixed-override precedence and explicit validation of tier thresholds, raises, and terminal tier.

### R7 — Required before T3 freeze: award ordering improved; fulfillment still attaches to the wrong lifetime

**Evidence:** revised award, fulfillment, and donation-processing tables.

Award sequence, `supersedes_id`, and deriving recipient/amount from the chosen bid address much of the original finding. They still require serialization, including the first decision where no prior award exists. Fulfillment currently points only to an item. If a fulfilled award is reassigned, the new recipient can incorrectly inherit fulfillment.

**Required revision:** bind fulfillment to an award decision, serialize transitions, and reject stale expected-current decisions. A reassignment must not inherit fulfillment. Give fulfillment and donation-processing logs deterministic revision order and concurrency/idempotency rules; “latest” by timestamp alone is insufficient.

### R8 — Clarifications needed before contract freeze

- Preserve 009's exact slot/session/payload binding, 15-minute begin/enroll expiry, and current-session-only idempotent acknowledgement after slot expiry/consumption. The new recovery-code mechanism is an additional capability, not something already validated by 009. Specify hashed bearer credentials, single-use serialization, authorized issuance, and no raw token logging.
- Define event rollup between disjoint windows and when there are no windows. The present three clauses do not cover those cases. Item phase must remain authoritative for bidding.
- Specify that an existing item's catalog-version identity never changes after additive publication. Translate `releaseId` and ruleset semantics explicitly; the API changes exceed merely renaming `currency` if clients previously assumed one event-wide release/phase.
- Reconcile the plan's stale additive-migration/mode-aware sections, production migration instructions, and “acceptable for Saturn-only” global-lock note with the fresh-schema decision. No staging migration or deployment is authorized by this review.

## Recommendations on the four review points

| Point | Recommendation | Current revision assessment |
|---|---|---|
| Per-org gate plus guard | Prefer database mutation entry points plus guards over app-only conventions. Approval remains conditional on R1. | Org-bound sessions and restricted authority writes are improvements. Shared-person set stability, full lock ordering, raw-SQL semantics, and re-entry revocation remain unresolved. **Not approved as written.** |
| Attendee session lifetime | Historical recommendation at the reviewed revision: fixed 30 days. **Superseded by Zack’s 2026-10-12 decision below: org-configured attendee access end.** | The historical technical review remains applicable; the fixed-duration recommendation does not. |
| Award reassignment | Allow any accepted bid on the item, with mandatory reason, staff identity, immutable history, and conflict detection. Derive business and amount from the bid. | Incorporated in principle. Do not impose an unrequested next-highest-only restriction. Complete R3/R7. |
| Donations after bidding | Use an independent explicit donation deadline plus staff toggle; default to final bidding close and allow deliberate extension. Preserve receipt recovery. | Incorporated in principle. No implicit “event day ends” rule. Complete R4's start/default/recovery semantics. |

## Guarantee disposition and acceptance evidence

| Existing guarantee | Disposition |
|---|---|
| Bid/standing/receipt commit together; response after commit | Preserved in intent. Keep transaction wrapper semantics. |
| Integer money, cap, minimum bid, no leading-business self-raise | Preserved in intent; complete R6 constraints and rules validation. |
| Original-request bid replay | Written sequence regresses freshness; R2 blocks parity. |
| Actor-private history versus shared business standing | Preserved conceptually; operation-specific authorization and database privileges need R4/R5. |
| Immutable published terms and durable history | Item/rule snapshots are sound; unit, publication binding, and mutable schedule semantics need R3/R6. |
| 016 revocation priority and raw mutation behavior | Revised mechanism is not yet equivalent; R1. Do not overstate its coverage in today's engine. |
| Entry expiry and recovery | Referenced but not fully specified; retain 009 semantics and separately review new re-entry. |
| Private immutable assets | Retain the full 016 access/quota/recovery contract under R5. |
| Donation idempotency, reviewed destination, recovery | Partially omitted; R4/R5 block parity. |

Before implementation acceptance, freeze executable cases for: queued revocation versus later readers; shared-person mutation versus new-org grants/sessions; unrelated-org progress; old-cookie login/logout and re-entry lock ordering; expiry during request/standing waits; exact accepted/rejected replay and changed-payload conflict across items/events; concurrent first bids; window edits racing bids/publication/awards; additive publication preserving prior receipts; stale nonprofit consent; donation replay after disable/close/destination change; private asset/read denial; cross-org/event foreign-key violations; and reassignment after fulfillment. Validate with actual runtime privileges. These cases were not executed during this review and do not authorize database work.

**Decision:** record the four recommendations above, correct the schema's premature acceptance attribution, and resolve the blocking findings before treating the schema design gate as passed. Implementation and database activity remain outside this review.

## Re-review — 2026-10-12 — revision 2

**Reviewed commit:** `9dac01921020808e925046497554ba62b0ce6794`, branch `real-v1/t1-foundation`. The worktree was clean before this append. Compared the complete revision-2 schema and revised plan against R1–R8, and rechecked the current bid replay and migration 018 donation paths. References below are to schema line numbers at this commit. No code, migrations, commits, database access, or executable concurrency tests were performed.

**Verdict: CHANGES REQUIRED.** Revision 2 materially improves the design and correctly withdraws the premature approval attribution. The organization-scoped identity model is a sound simplification for V1. The remaining issues are concrete authorization, relational, operation-interface, and concurrency gaps; this is not a request to reconsider the fresh-schema direction.

“Resolved” below means resolved at the architectural specification level, not implemented or tested.

### R1–R8 disposition

| Finding | Status | Assessment and remaining action |
|---|---|---|
| **R1 — Revocation scope/order** | **Partially resolved** | Organization-scoped people with immutable identity/org keys eliminate discovery of a changing multi-org set. One gate, exclusive-first mutations, no upgrades, event-scoped re-entry revocation, and same-org old-cookie handling address the original design problem. Raw-SQL semantics are now stated accurately. However, the enumerated foreign keys do not yet enforce organization containment for all authority relationships (R6), and the donation sequence reacquires business membership after L4 despite L2 ordering. Complete those relationships and make each operation conform to the declared lock protocol. |
| **R2 — Bid replay freshness** | **Partially resolved** | Bid steps 3–5 now lock window/standing and check expiry before replay: the original timing defect is resolved. But line 119 newly permits replay with VIEW alone. The current `placeTradeBid()` and `tradeBidReceipt()` require current BID and applicable business bidding authority. Restore that requirement for those endpoints, or explicitly obtain approval for a changed disclosure policy and distinguish it from the existing VIEW-authorized My Bids read. This is not unchanged engine behavior. |
| **R3 — Window races** | **Resolved** | Shared window locks, exclusive edits, standing locks for awards, clock-after-locks, recorded window revisions, and publication-created standings address the identified races. Old-value edit eligibility is explicitly retained in the finding-resolution table; the plan retains the open/close edit limits. Implement those limits in `bz_window_edit`. For batch publication, specify ascending window IDs as well as ascending item IDs; this is a lock-order clarification, not a new architecture. R7 still concerns a separate fulfillment/reassignment race. |
| **R4 — Donations** | **Partially resolved** | Single pledge idempotency record, reviewed nonprofit revision, publication start, independent stored deadline, and recovery before availability are good corrections. The concrete sequence still omits a fresh expiry check before replay, a `nonprofits.active` check, and the current post-insert expiry/deadline check with rollback. It also conflates submit and receipt lookup payloads. Corrections are specified below. |
| **R5 — Runtime boundary** | **Partially resolved** | The explicit trust split and function-mediated identity/asset/donation tables resolve much of the concern. However, the grant list does not expose enough functions/results to execute the described TypeScript operations with those privileges. Define the missing authorized interfaces rather than restoring broad private-table access. Also state the Node password verifier's trust role honestly. |
| **R6 — Relational/money invariants** | **Partially resolved** | Unit freeze, publication marker, event-wide positions, receipt columns, standing transition rule, and several composite foreign keys improve the contract. The enumerated relationships still permit mismatched person/business/org and item/event ownership unless additional constraints are supplied. Published fixed-rule selection also needs the fixed-event mode explicitly included. See the concrete examples below. |
| **R7 — Awards/fulfillment** | **Partially resolved** | Award-bound fulfillment and sequence/expected-current fields fix inherited fulfillment and ambiguous timestamp ordering. Fulfillment locks the old award row while reassignment locks standing, so their current-award checks are not serialized with each other. Staff transition idempotency is also asserted without a replay-before-stale algorithm or payload conflict binding. |
| **R8 — Clarifications** | **Resolved** | Entry binding/expiry/acknowledgement, hashed and serialized event-scoped recovery codes, phase gaps, fixed catalog identity, explicit API translation, and the main plan reconciliation are present. The plan's remaining “test person under production mode and reverse” check should be rewritten for separate production/staging resources because production has no `is_test`; this is editorial cleanup, not a schema blocker. |

### Organization-scoped people and raw SQL

**Organization-scoped people: recommend acceptance as the V1 identity boundary.** Separate person rows, credentials and sessions per organization remove the original multi-gate shared-person problem instead of attempting to synchronize a changing organization set. The product consequence is deliberate: the same human signs in separately for each organization; deactivation or recovery in one organization has no effect in another. This must be backed by composite relationships on both sides of every authority association, not merely by `people.org_id` and a session check. Do not carry forward the earlier shared-person test as though that feature still exists; replace it with tests rejecting cross-org associations and confirming independent progress.

**Raw SQL: recommend acceptance of “rejected, not queued” as an explicit operator-interface change.** Revision 2 now correctly says a row trigger can wait before rejecting, cannot prove transaction-scoped acquisition, and does not constrain a trigger-bypassing owner/superuser. Supported revocation functions still queue before row acquisition. Unprepared direct SQL has no revocation-priority promise. Record this distinction in the frozen contract and operator instructions; it is an intentional replacement of 016's raw-writer behavior, not identical preservation.

Neither choice by itself is a new blocker. Do not strengthen “rejected” into “rejected immediately,” or claim that `pg_locks` proves only a definer function could have acquired the gate. The guard verifies possession; privilege policy and trusted entry points establish the supported acquisition protocol.

### Remaining blocking corrections

**B1 — Newly introduced: bid replay authorization is broadened (R2; lines 110–120).** A bidder downgraded to VIEW, or removed from a bidding business, can replay through the newly specified policy when the current bid endpoints would refuse it. Actor ownership still protects against another person's receipt access, so this is a specific change in revocation/disclosure semantics, not a claim of arbitrary receipt exposure. Recommend retaining current BID/business authorization on bid submission replay and direct bid receipt recovery. Keep VIEW access to the separate actor-private activity history as today. If broader recovery is desired, record it as a deliberate product/security decision and test both interfaces separately.

**B2 — Unresolved donation parity (R4; lines 145–157).**

- Step 3 returns replay before step 5's fresh clock check. The general L1–L7 rule promises freshness, but the actual algorithm contradicts it. Require a fresh session check immediately after the request-lock wait, before replay. Migration 018 does this before returning an owned receipt.
- A `receipt` lookup must take only its request identifier plus server-resolved actor/event context; it must not require the original submit payload. Exact payload comparison applies to submit replay. Bind lookup to the requested event, returning NOT_FOUND for another event's receipt, as 018 does.
- New pledges must require both `event_nonprofits.active` and `nonprofits.active`, plus an active business and membership, BID access, and the reviewed revision. The current list only explicitly checks the event association's active flag and revision; an inactive org nonprofit must not remain eligible merely because its event association is active.
- The shared gate prevents authority mutation, **not expiry or passage of the deadline**. Preserve 018's post-insert fresh expiry/deadline check and rollback on failure. The proposed pre-insert-only sequence weakens the current behavior if an insert waits across either boundary.
- Acquire required membership/business locks at L2; do not introduce a fresh L2 acquisition after the event/nonprofit locks. Define the order for nonprofit and event-association locks too.

These are surviving R4 gaps, not newly discovered requirements unrelated to the original review.

**B3 — Newly explicit: operation/privilege interfaces do not line up (R5; lines 201–215).** `bz_app` cannot read attendee/membership/business rows, yet TypeScript bidding is instructed to lock and evaluate them. `bz_session_resolve` is described as returning person/org/kind/event/expiry/grants, not the target business membership, business state, and attendance needed for that decision. `watches` is writable directly and no activity function is listed, despite the stated port of the stronger 018 activity boundary. `bz_window_edit` is required but absent from the explicit executable grant list. Person deactivation and business/member authority mutations are discussed without corresponding listed entry points.

Specify a token- and target-bound resolver or private operation function that returns and locks the exact attendee/business authority needed, retaining L1/L2 semantics. Add explicit EXECUTE grants for supported window/authority operations, and retain function-mediated activity/watches or explicitly justify that trust-boundary change. Resolve the prose saying window edits are TypeScript operations while direct window UPDATE is forbidden: TypeScript should call the authorized database function.

The split password flow also needs an explicit trust statement: Node verifies the password, so a finish function accepting its verdict cannot independently establish password correctness. Bind finish to the begin attempt, org/person and credential version; atomically enforce rate limits and current person/grant state, with no session created from stale verification. Do not assert that database mediation alone makes session issuance unforgeable by a compromised trusted runtime. This is specification work, not a recommendation to move scrypt into PostgreSQL.

**B4 — Unresolved containment constraints (R6; lines 217–235).** Examples of missing counterparts in the enumerated list:

- `business_members` binds its person to its org, but not its business to that same org.
- `staff_grants`, `event_attendees`, credentials, and re-entry records need person-to-org binding; attendee/re-entry records also need their event-to-org binding.
- Bids, standings, receipts, watches and awards need item-to-event/org binding. A child foreign key to `events` and a same-item accepted-bid foreign key do not establish that the item belongs to that event.
- Pledges need business/actor-to-org binding; event nonprofit associations need both event and nonprofit org binding. Published items need their underlying draft item bound to the same event/org.

Add these relationships, their referenced unique keys, and immutable ownership columns. This closes the proof behind the one-org gate; it does not require changing that design. Also define minimum selection as **item override → event fixed raise when fixed → tier lookup when tiered**. The current wording falls directly from item override to a tier even though fixed mode has no tiers. Preserve the fixed override explicitly in the immutable published representation used by the decision.

**B5 — Unresolved fulfillment concurrency and staff recovery (R7; lines 135–141).** A fulfillment transaction can lock old award A and observe it as current; a simultaneous reassignment locks standing and appends B without conflicting with A's row lock; fulfillment can then append against an award that has ceased to be current. Binding history to A prevents inheritance by B but does not enforce “allowed only when current.” Require fulfillment and reassignment to serialize on the same item standing row first; then check current award and lock any subordinate history parent in a defined order.

For award/fulfillment/processing requests, look up an actor/operation/request receipt under serialization before applying expected-current validation. A retry after a committed response was lost must return its original result, not STALE merely because its own first execution advanced the head. Store or reconstruct a stable original payload binding and reject changed payloads. State the actual actor-column uniqueness for each table (`by` versus `decided_by`); uniqueness alone is not the replay algorithm. This completes the original R7 idempotency requirement.

### New blockers versus carried findings

Revision 2 newly **broadens bid replay authorization (B1)** and introduces a concrete **privilege/interface mismatch (B3)** while claiming an exhaustive grant list. The split login contract in B3 also needs its trusted-server assumption made explicit. B2, B4, and B5 are remaining defects within previously identified donation, relational, and transition guarantees. The organization-scoped identity simplification and raw-SQL rejection policy are acceptable directions, not regressions requiring redesign.

### What Zack can review now

The following product/operating choices are concrete enough for review independently of the remaining backend corrections:

1. **Separate identity per organization:** the same human has separate accounts/sign-ins and recovery in each organization.
2. **Authorized access changes and session logout through supported functions:** unprepared direct authority SQL is rejected; automatic queuing of arbitrary raw SQL is intentionally retired.
3. **Org-configured attendee access end and staff-assisted event-specific recovery**, separate from bidding and donation availability. This supersedes the fixed 30-day recommendation after Zack’s clarification.
4. **Any accepted bid may be selected for reassignment**, with reason and history; fulfillment belongs to the specific award.
5. **An independent donation deadline**, defaulted once and edited explicitly, with old receipts recoverable after closure.

Recommend retaining the current bid-replay authority policy (B1) rather than introducing an additional product decision by accident. Zack can accept the five choices above without treating the whole schema as implementation-ready. The next engineering action is a bounded document correction for B1–B5, followed by review of that delta; no broader redesign, implementation, or database work is authorized by this report.


## Product clarification — 2026-10-12 — org-configured attendee access

Zack confirmed that a one-off event should have an organization-configured attendee access end, rather than a fixed 30-day access policy. The plan and schema now record this decision. Staff set the event access end separately from bidding windows and the donation deadline. Sessions cannot outlast it; current access end is checked on attendee requests, including receipt recovery. Shortening access affects existing sessions; extending access does not revive an expired or revoked session. Historical records remain durable, and staff accounts retain their separate access/session policy.

“Operator revocations” was confusing wording. The intended behavior is **authorized access changes and session logout**: staff may disable an attendee, and a user may end a session or replace a lost-device session. Operators are not automatically removed when an event ends. The technical distinction between supported function calls and rejected unprepared raw SQL remains unchanged.

This product decision supersedes the 30-day recommendation in earlier review text; it does not resolve B1–B5 or approve the schema for implementation. The new mutable event access end must participate in the exclusive-first access-change protocol, be checked on the database clock after waits, and be tested for shortening, extension, expiry, recovery and unaffected staff access.
