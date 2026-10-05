# Staff draft packet revision and limits

The owner requested author review and independent red-team challenge of contracts
and pass semantics. The original packet was frozen at
`9748ee57da6d3bbc0826df5c9e2271edce28ac24`; its valid baseline was feature-absent,
with acceptance ordinary RED and regressions GREEN. This revision is independently
authored while the existing candidate is stashed, leaving source/prototype/provider
state untouched. Root must inspect the exact diff and commit a new feature-absent
trusted base, rerun the actual baseline, then restore and verify the candidate.
An old baseline/verdict does not transfer to the revised packet.

The revised assertions strengthen direct authorization, complete JSON durability
and transaction recovery. They add the red-team's concrete stale authorized GET
race: removing only the late `loadEvent` response guard passed all nine original
acceptance groups but exposed Saturn content after Pine sign-in. The original
standalone red-team script at `/tmp/bz-redteam-2eeq3qrw/race.mjs` passed three groups
on the candidate and failed the guard-removed mutant. The protected adaptation
must be rerun on candidate and mutant after the new base; these prior observations
are review evidence, not the revised packet's pass receipt.

No check skips or expected-exit weakening were added. Actual HTTP responses,
independent SQL rows, empty browser contexts, post-commit lost responses,
rejecting database triggers and a Next restart establish the bounded outcome.
One received app500/timeout cannot establish baseline RED. Unavailable tools,
connections and browser processes remain infrastructure99; reached app failures
are functional1 on candidate and unverifiable99 on baseline. A check killed by
the kernel's overall timeout must be investigated separately, never accepted as
finite missing-feature baseline evidence.

## Separate cryptographic source review

Read-only inspection of `stash@{0}^3:src/server/auth.ts` found SHA256 source hash
`f6bdcc9ef0402fcddb33a73aa8f9288f58d9fbdab8b7d8b963dcca9e6fa2378b`.
The code imports `randomBytes` from `node:crypto`, invokes
`randomBytes(32).toString("base64url")`, and stores only its SHA256 digest. No
Math.random, time, counter, client-supplied token or generator-error fallback was
present in that inspected login path. This is implementation review, rather than
inferring entropy from a long cookie. Node documents this function as a
cryptographic pseudorandom generator:
[Node24 crypto.randomBytes](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptorandombytessize-callback).
The source hash must be checked again at candidate/release review; changed auth
code requires renewed review. This does not test or certify OS entropy quality.

## Remaining boundaries

This is synthetic staging staff identity, not real phone verification or auction
admission. Local HTTP cannot prove Secure cookies or positive Vercel Preview/Neon
configuration. Those require exact deployed revision, protected generated host,
HTTPS cookie behavior and independent provider/browser evidence. Visual review,
physical devices, release operations and future catalog/manual bids remain
separate gates. Linked installed dependencies are infrastructure, not immutable
review evidence. Neither a documented prior pass nor reviewer metadata substitutes
for invoking every revised check against the new trusted base and candidate.
