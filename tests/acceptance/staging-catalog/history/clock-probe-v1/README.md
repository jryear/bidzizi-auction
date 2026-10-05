# Clock process probe correction

The exact original frozen20a app-clock-skew.cjs is preserved here. It changes
Date.now() and a no-argument new Date() by365days but stamps the proof header
only at response end while headers are still mutable. Next streams headers
earlier, so the actual clock skew was present while its evidence was absent.

The original development run completed five adversarial groups then failed the
worker-header proof. It was incomplete, not a passing catalog result. Its raw
exit and elapsed time were not retained by the original shell; RUN_RECEIPT.json
records those values as null, rather than inferring them from a later log-print
process. The backend was uncommitted and changing; no kernel candidate was claimed.

The correction stamps the measured actual-worker Date difference at writeHead
before header commitment, keeping the end fallback. No application code, public
clock route, application environment switch or fake constant header is added.
All previously frozen behavioral assertions remain unchanged.

Independent process reproductions are bound in REPRODUCTION_RECEIPT.json. The
original Node probe exits1: no header for explicit writeHead, raw-array headers,
flushHeaders and implicit body-write; its end-only response works. The corrected
Node probe exits0 across all five patterns and independently verifies both worker
Date.now()/new Date() against parent real-time brackets. Explicit dated
constructor arguments remain unchanged. Archived feature-absent20a Next similarly
returns streamed HTTP200 with a missing original header (exit1), and the corrected
preload returns the measured31536000000ms header (exit0).

These are instrumentation results. They do not transfer a catalog pass. The
integration owner must freeze the additive correction, run a finite absent-API
baseline with all cumulative regressions and rerun the entire candidate grader.
