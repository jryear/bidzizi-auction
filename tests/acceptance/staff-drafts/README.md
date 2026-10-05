# Independent staff-draft evidence

This packet belongs to the frozen `staging-staff-drafts-001` contract. It is written
before application implementation, then committed by the integration owner. It
must not be changed by implementation to make results pass.

Run with Node 24 from the repository, or through the external kernel with a
trusted committed base:

```sh
/Users/jryear/.nvm/versions/node/v24.4.1/bin/node tests/acceptance/staff-drafts/run.mjs acceptance
/Users/jryear/.nvm/versions/node/v24.4.1/bin/node tests/acceptance/staff-drafts/run.mjs adversarial
/Users/jryear/.nvm/versions/node/v24.4.1/bin/node tests/acceptance/staff-drafts/context-race.mjs
```

Each run creates a unique temporary PostgreSQL18 cluster, nonsuperuser app role,
`bz_test_*` database and loopback Next dev service. It does not use shared local
Postgres, staging, Neon, Vercel credentials, or the user's browser profile. It
applies the candidate migration and the protected synthetic fixture, independently
queries storage, launches an empty Chromium context, then stops its own processes
and removes its own temporary cluster. The frozen base exercises service startup
and fails ordinarily on the missing session API. Application errors and assertion
failures return 1 on candidate; unavailable setup, connection, service readiness,
or browser infrastructure returns 99. A reached application500 or request deadline
is a functional candidate failure, and baseline-unverifiable99, so it cannot
masquerade as the finite missing-feature RED required to authorize implementation.
Kernel overall timeouts have separate semantics and must not establish baseline
readiness. Kernel and provider verification remain separate.

The first acceptance suite checks persisted, incomplete, ordered drafts, session
hashing, server-owned fields, idempotent receipt recovery, revision conflicts,
fresh-session/database agreement, and actual A saved-draft browser preview. It
aborts an outgoing save request, loses a response after commit, and independently
installs a temporary rejecting PostgreSQL lot-write trigger. These prove no false
Saved, no second revision on receipt recovery, no partial transaction rows,
preserved confirmed preview content, and successful retry/stale-browser recovery.
Complete compact event/lot JSON and order are compared against independent SQL
storage, including recovered lot description/order after rejection. A new browser
and independent API must read that same recovered draft.

Adversarial checks probe forged sessions/person headers/Member ID, staff/bidder
and tenant boundaries, same-origin JSON writes, ownership/history injection,
direct existing-event PUTs by another tenant and by a bidder with complete
event/lot/idempotency rows unchanged,
invalid amounts and duplicate lot IDs, atomic rejection, concurrent revisions,
cross-tenant lot reparenting, grant/person revocation, logout, expiry, and flag-off
or production denial of test identities. Existing valid staff cookies are also
rejected when the configured Preview origin is not its generated Vercel origin,
or when local origin/database bounds are invalid. These are fixed synthetic staff accounts;
the evidence makes no claim of real member identity or phone verification.

The immutable context-race suite captures a successful authorized Saturn GET
before logout, holds it across Pine sign-in, then delivers it and asserts Pine's
editor, organization and A preview remain Pine. This addresses a demonstrated
counterexample to the original packet. It also checks a stored HTML canary remains
text and full data survives a Next process restart with the same server session.

Cookie shape is only an encoding assertion. See `AUTHOR_REVIEW.md` for the separate
Node crypto generator review and its exact source hash. Local HTTP deliberately
does not claim Secure HTTPS cookies: the generated Vercel Preview, protected host,
verified Neon connection and actual HTTPS cookies require deployed release checks.

Required application protocol is declared in `protocol.mjs`. UI selectors are
semantic labels agreed with the UI implementer, with the approved `#saved` and
`#bidder-frame` hooks. The test does not alter prototypes or bypass authorization.
Original A visual composition is still assessed separately in browser inspection;
the kernel proves only the contracted behavior.
