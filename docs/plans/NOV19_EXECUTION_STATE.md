# Nov 19 readiness execution state

Owner: this Codex implementation context. Worktree: `real-v1-nov19-execution`, branch `jryear/real-v1-nov19-execution`.
Baseline: `1ee003bc978692b3525ad47d0ab2b18646dea53d` (`8246e7f` plus only the readiness brief).
The source checkout is preserved. No push, merge, production deploy, configuration change or new provider resource is authorized. The user subsequently approved a staging-only rehearsal with read-only staging/production deployment, compute, pooler and firewall comparison; isolated test-account/practice-event setup and cleanup; and a stop on the first platform challenge/block/429. Staging must be representative, and material differences must be reported before load. Nothing may request `app.bidzizi.com`.

Stages are sequential. The supplied execution plan requires: “Stop for your explicit approval before any staging access or provider-resource creation” and “Record approved hosted results in a follow-up commit before stage 2.”

1. **Local portion verified; approved hosted rehearsal held at the representativeness prerequisite:** 50/150/300-session load passed with zero unexpected failures and zero database invariant failures. The server-clock standing-lock test and Chromium/WebKit poor-network recovery passed. Typecheck, production build, compatibility, 55/55 journey checks, bid-sheet, simple mode and 8/8 telemetry checks passed. See [local results and staging proposal](NOV19_LOCAL_LOAD_RESULTS.md) and [validation log](../evidence/nov19/validation.log). No application optimization was justified; app/schema/dependencies/UI are unchanged. Local fixtures and owned processes were cleaned up. Hosted evidence and a follow-up acceptance commit are required to finish stage 1. The original local evidence commit is `824f6fa25000ef7f01feb3d0cf4141bfe3d05cfa`.
2. **Not started:** compare two alert options with official current pricing; obtain selection, destination and resource approval; implement local delivery/failure tests; prove staging notification within 60 seconds; commit.
3. **Not started:** prepare local restore verification; obtain approval for exact Neon inspection/restore branch/lifecycle; read-only verification, timings and cleanup; commit.
4. **Not started:** staff page and engineer appendix; verify retained rollback identity without executing rollback; mark personnel and physical scan rehearsals outstanding; commit.
5. **Not started:** read-only default preflight and explicit practice-event lifecycle; failure tests and full checks; final checkpoint and commit.

Local disposable fixtures and the conditionally approved isolated staging rehearsal fixtures are permitted. No production fixtures are permitted. No production capacity or event-day acceptance follows from a local pass. The final readiness checkpoint will remain incomplete until all required proofs exist.

## Approved readback follow-up (2026-10-14)

Read-only provider/SQL inspection completed; see [staging/production comparison](NOV19_STAGING_READBACK.md) and [sanitized receipt](../evidence/nov19/provider-readback.json). Staging is fixed at 0.25 CU with 300s autosuspend and 112 Postgres connections; production scales 0.25–8 CU with autosuspend disabled and 901 Postgres connections. Both domain-bound Vercel deployments identify `088e3b0`, Node 24, Fluid/standard memory, 300s timeout and `pdx1`; staging's project target/defaults are stale and were not treated as the served deployment.

**Stopped before the 50-phone ramp:** the compute/suspension mismatch is material under the user's conditions. No fixtures or application requests were made, and no configuration/deployment changes occurred. Cold-start metrics are available, but a VM-instance-count source and the staging function's database binding still need independent evidence before a future run. Hosted correctness and connection-peak evidence remain uncollected. Stages 2–5 remain unstarted.

Isolated staging fixtures are authorized only for the conditional rehearsal; none were created because its representativeness prerequisite failed. The readback commit is not a hosted-load acceptance commit.
