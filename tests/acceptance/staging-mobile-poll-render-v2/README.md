# MOBILE014 successor evidence

The original contract and every original evidence file are preserved byte-for-byte.
`predecessor-binding.json` pins them, and the successor contract explicitly protects
their paths. The wrapper runs the original child runner with unchanged environment,
assertion IDs and kernel terminal protocol, retaining all 29 original assertions
and their eight exact RED-on-base acceptance IDs. No test is replaced or weakened.

The new module imports the frozen original browser harness and local DTO helpers.
It adds nine assertions: predecessor identity plus four per mobile engine. All new
cases are regression/adversarial with an empty expected baseline-failure set; the
main agent must establish GREEN on base before implementation. No browser has been
run while authoring this packet. Source inspection alone does not establish GREEN.

Reviewed cases cover two-lot insertion, three-lot insertion/reordering, removal,
updated card link/image/alt/title/short text, and navigation to matching lot detail;
retained eligible business identity despite array reorder, membership replacement
falling back to the first eligible business, refreshed person/business attribution
in footer and review, and retention of the typed review amount. There is no invented
business chooser: the test uses the existing retained-identity/first-eligible rule.

Open review safety separately checks permission revocation, server closure,
503/stale and offline. It requires a retained amount, disabled submit, safe status,
and zero bid POSTs. Closure updates catalog, standing and context.canBid together,
matching the current server DTO rule. It does not claim protection from a fabricated
standing-only closure that contradicts the returned context.

The delayed-receipt case locally aborts one synthetic bid request, captures its
accepted receipt while the old actor still owns it, changes actor through actual
parent refresh, then releases the captured receipt. It requires the old sheet to
close, the late receipt to be discarded, current attribution to remain visible,
and no additional bid POST. Every request is fulfilled/aborted on `.invalid` in a
fresh browser context; no live session, event, database or provider is touched.

Run one mode at a time with Node24:

```
node tests/acceptance/staging-mobile-poll-render-v2/run.mjs original-acceptance
node tests/acceptance/staging-mobile-poll-render-v2/run.mjs original-regression
node tests/acceptance/staging-mobile-poll-render-v2/run.mjs original-adversarial
node tests/acceptance/staging-mobile-poll-render-v2/run.mjs reviewed-regression
node tests/acceptance/staging-mobile-poll-render-v2/run.mjs reviewed-adversarial
```

The actual runtime in the contract is Node24.4.1; the external verifier is3.1.0
schema2. Unknown modes, dependencies, bootstrap, browser/runtime failures and
timeouts exit99; ordinary assertion failure exits1. Each browser/context is closed
before the next one starts. No server, build or broad suite is required.
