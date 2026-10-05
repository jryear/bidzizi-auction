# Date probe compatibility correction

The exact c221351b preload from edcfa47 is preserved here. Its writeHead hook
correctly proves a365day clock skew on streamed responses, but its ES Date
subclass inherits UTC and parse instead of owning them. Actual Next16.3.8
node-environment-extensions/date.js copies only native constructor OWN
descriptors to a callable constructor. This loses UTC/parse, and applying the
original subclass as Date() throws. The actual pg timestamptz parser uses UTC,
so this defective fixture made real timestamp-reading API routes fail503.

Root's two incomplete adversarial development runs are retained with actual
exit1 and durations11.47s/11.439s; five groups had completed before the503.
Neither was a clean committed candidate or kernel verdict. The application
was not patched to compensate. The original first missing-header version
already remains additively preserved in clock-probe-v1 on the prior base.

The replacement uses a strict CALLABLE function, Reflect.construct for all
new targets, copies all native own descriptors/prototype/staticUTC/parse,
and changes only implicit Date()/new Date()/Date.now. Explicit constructor
arguments and native parser values remain unchanged. The writeHead/end hooks
still stamp the MEASURED actual-worker skew; no constant fake header is added.

REPRODUCTION_RECEIPT.json binds the scripts, raw exits, durations and logs.
The c221 primitive probe fails7of11 with the actual installed Next Date
wrapper and pg1184 timestamptz parser. The replacement passes all11. The
archived feature-absent2ea application with disposable PG reproduces original
create503/session200/header31536000000 (exit1); the replacement gives actual
create201/read200/list200 and exact independently queried SQL timestamp
equality (exit0). Five streamed response/header patterns also pass after
the callable replacement.

The reproduction harness is a PRIVATE copy of the frozen staff helper with
only process --require injection, not an application or original grader edit.
Its legacy owner-role topology proves timestamp compatibility only, not the
new catalog least-privilege model. The archived application is unchanged.
No production credentials, providers, public clock route or application clock
environment switch are used. Parent owns the corrected evidence freeze and
full finite baseline/candidate reruns; this process proof is not a catalog pass.
