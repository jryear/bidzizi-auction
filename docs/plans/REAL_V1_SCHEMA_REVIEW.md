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
| Attendee session lifetime | Keep a fixed 30 days, event-bound, with no sliding renewal and no effect on auction/donation availability. | Incorporated. This is a retention choice, not a claim that every event lasts 30 days. Added recovery codes need their own security/concurrency specification. |
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
