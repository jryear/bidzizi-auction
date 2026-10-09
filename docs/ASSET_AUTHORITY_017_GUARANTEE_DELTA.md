# Asset authority 017: candidate guarantee change

**Status: concrete local candidate; guarantee change awaits parent/owner review.**
Base: `b07c535c39b55e3c1b10082c224aa70799dd3eb8`.
Candidate branch: `jryear/saturn-v1-authority-p2`.
The integration lead owns approval, landing, migration application and release.

## Exact change

016 installs five global exclusive BEFORE STATEMENT gates for session, person,
staff-grant, VIEW-grant and organization UPDATE/DELETE. Even an UPDATE matching
zero rows acquires the gate until its transaction ends. All gated staff/image
readers can consequently wait behind a mutation for another organization.

Additive 017 removes those triggers and their function. It replaces asset put,
recover and read with the **same 016 bodies minus only the global shared gate
acquisition**. Existing ownership, EXECUTE ACLs, private asset table ACLs, SHARE
locks, request/quota locks, data validation and final checks stay intact.
`auth.staff` likewise removes only its shared global gate acquisition. Old-cookie
login still revokes the old session **before** selecting/locking the person;
failed login rolls that revocation back. No SAVEPOINT workaround is included.
016 and the original development test remain byte-identical to the base.

## Resulting guarantees and explicit loss

Authority uses PostgreSQL's conventional committed-state and row-lock semantics.
Staff/image operations acquire relevant session/person/grant/organization rows
before event/request/image locks. A conflicting UPDATE/DELETE may wait for these
SHARE locks; a reader may wait for a mutation's row locks. Committed revocation,
removed grants and expiry deny access, including after controlled waits. Final
fresh database-clock checks remain; late asset denial rolls back its provisional
INSERT even if a direct caller COMMITs. Stale repeatable-read authority fails
closed with serialization failure.

**Uncommitted queued raw revoker priority is no longer guaranteed.** Starting or
queueing a revocation is not its commit boundary. An operation that obtains or
already holds valid authority may finish before the revoker commits. There is no
promise that every later reader waits behind every queued raw writer, nor a
statement gate before tuple/FK acquisition. This is a proposed guarantee change,
not approval to integrate/release it or the unchanged 016 queue contract.

A zero-row UPDATE has no global reader barrier. Held mutations on independent
actors/organizations allow unrelated Save and real normalized upload to finish.
Shared person/session/organization rows still produce legitimate contention;
actors granted multiple organizations lock those grant/organization rows. Broad
raw SQL touching multiple organizations and arbitrary reverse event/authority
lock ordering are not promised isolation or deadlock freedom.

## Evidence and historical assertion differences

Run with Node **24.21.0**, pnpm **12.4.2**:

```sh
node --experimental-transform-types tests/development/asset-authority-scope.mjs
pnpm typecheck
```

20 successor groups passed on disposable local PostgreSQL 18.6. Coverage includes
raw zero-row UPDATE while Save retains authority; held session/person/grant/org/
VIEW mutations versus unrelated Save/upload; session/grant UPDATE and DELETE
commit/rollback, token/actor/org changes; actual logout and old-cookie login versus
raw person UPDATE/DELETE; four failed-login rollback variants; expiry after event,
request, quota, image, recovery, Save and authority-row waits; direct late-denial
COMMIT; private replay/image boundaries; legacy identity/entry; stale repeatable
snapshot denial; published VIEW UPDATE/DELETE; and publication expiry rollback.
Raw person DELETE retains its existing FK rejection (`23503`), without a deadlock.

The successor records the historical before-tuple assertion as **FAIL**, with an
actual grant-row wait witness. The 016 tests using stronger gate/queue topology
are `queued-*` (four), `mutation-before-tuple-coverage`,
`gate-installation-permissions`, `publication-queued-grant`,
`legacy-manual-bid-cycle`, plus gate-wait assertions in
`login-and-unrelated-events`, both `old-cookie-login-person-*`,
`published-view-revocation` and `repeatable-read-revocation`. They remain unchanged;
this candidate does not claim all 21 original groups pass under 017. Their durable
revocation/expiry/login outcomes are preserved and exercised by successor cases;
the original legacy manual-bid-cycle group was not rerun under 017.

The final receipt path is reported with the candidate ref to the parent. Receipts
bind loaded source hashes and prove cluster stop, process absence, closed port and
removed cluster data. No shared database, app server, UI, provider credentials,
push or deployment was used. These are development checks, not Kernel, visual,
connected-provider or release acceptance. Apply 017 and the auth successor only
after the parent routes this exact guarantee delta; schema-first application also
allows older staff code's unused shared gate to drain during a rolling update.
