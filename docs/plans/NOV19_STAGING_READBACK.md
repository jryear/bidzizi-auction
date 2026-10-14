# Nov 19 rehearsal: read-only staging/production comparison

Read back on 2026-10-14. [Sanitized provider and SQL receipt](../evidence/nov19/provider-readback.json). **The rehearsal did not start.** The user's approval requires representative staging settings, reporting material differences before load, stopping on the first platform challenge/block/429, cleanup of test accounts/events, and no configuration or deployment changes.

## Material difference: database capacity and suspension

| Setting | Staging | Production | Evidence |
| --- | --- | --- | --- |
| Neon project | `delicate-math-48681189` | Same project | Live provider GET |
| Branch | `br-crimson-mountain-arsolcfe` | `br-cold-glitter-arx1msrh` | Live provider GET; distinct branches |
| Endpoint | `ep-orange-cake-aryndhab` | `ep-broad-credit-arcrxgvi` | Live provider GET; pinned to the branch before connecting |
| Region | `aws-us-west-2` | `aws-us-west-2` | Live provider GET |
| Minimum / maximum compute | **0.25 / 0.25 CU** | **0.25 / 8 CU** | Live provider GET |
| Autosuspend | **300 seconds** | **Disabled (0)** | Live provider GET |
| `max_connections` | **112** | **901** | Live read-only `pg_settings` query |
| Superuser-reserved / other-reserved connections | 4 / 0 | 4 / 0 | Live read-only `pg_settings` query |
| Existing owner role connection limit | -1 (no role-specific cap) | -1 (no role-specific cap) | Live read-only `pg_roles` query |
| Pool mode | Transaction | Transaction | Live provider GET |
| Pooled TLS configuration read | Succeeded | Succeeded | Verified TLS, pinned `-pooler` endpoint; read-only transaction |

Staging is fixed at the minimum production compute size, has a different cold-resume policy, and has about one eighth of production's configured Postgres connection limit. A run here could be a constrained-environment experiment, but it would not establish representative production capacity under the user's acceptance condition. No attempt was made to alter compute, suspension, connection settings or deployments.

The configuration query woke staging's idle compute as an ordinary consequence of reading it. Connections were closed; suspension settings were retained. Production database access was limited to configuration/role-limit reads, with no business-table queries or writes. No HTTP requests were sent to `app.bidzizi.com` or its deployment URL.

## PgBouncer limits: documented versus live evidence

Neon's [connection-pooling documentation](https://neon.com/docs/connect/connection-pooling) specifies a 10,000-client ceiling, transaction pooling, a 120-second wait timeout and a per-user/per-database server pool of 90% of `max_connections`. Applied to the **live** Postgres values, the derived server-pool figures before integer rounding are **100.8 for staging** and **810.9 for production**.

These PgBouncer limits are documented provider defaults, not a live `SHOW CONFIG` receipt; that administrative read was not available through the normal database connection. Do not promote the derived values into exact observed limits. Live `max_connections` takes precedence over the inconsistent examples/formulas found in provider documentation.

Both endpoint API objects also return `pooler_enabled: false`. That field does not establish that pooled access is disabled: verified TLS reads through each pinned `-pooler` endpoint succeeded. Both observations are retained without interpreting the flag as a capacity guarantee.

## Actual served Vercel deployments

The provider's **custom-domain alias binding** is the authoritative selection here. Staging's project `targets.production` still points at an older deployment and is not the deployment assigned to `staging.bidzizi.com`.

| Setting | Staging | Production |
| --- | --- | --- |
| Project | `prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9` | `prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2` |
| Domain-bound deployment | `dpl_84j5YvYHCn18XZxycpMckLTf5ftf` | `dpl_qWNvq4UCk7P6FKZGRJSdt1fqXAie` |
| State | READY | READY |
| Source metadata | `088e3b0316cc42914a17d80ca4ef04cf3f3d3761` | Same source metadata |
| Actual served function region | `pdx1` | `pdx1` |
| Node | 24.x | 24.x |
| Function type | Fluid | Fluid |
| Function memory class | Standard | Standard |
| Timeout | 300 seconds | 300 seconds |
| Active CPU billing mode | Enabled | Enabled |
| Project elastic-concurrency flag | False | False |
| Project default region | `iad1` | `pdx1` |

The **deployed** regions match despite the project-default mismatch. The readback returns a memory class, not an exact memory-MB value; no numeric value is invented. Matching source metadata is not a byte-for-byte artifact comparison. The local load results remain bound to application source `1ee003b`/`8246e7f`, preceding this later production preview tranche; they are not relabeled as tests of `088e3b0`.

The database variables are marked sensitive in Vercel and remained redacted through read APIs. The provider identities and pooled database connections above were verified, but the domain-bound functions' own database binding was **not independently established**. A later approved rehearsal must prove that staging serves the intended fork before any workload; it must never infer isolation merely from the URL or project name.

## Firewall and Attack Challenge Mode

Both projects' active WAF configuration is null; there are no returned active custom rules, IP rules or managed-rule settings. The active-attack endpoint reports zero anomalies on both projects at readback time. An absent active project WAF configuration does **not** disable Vercel's [platform-wide DDoS mitigation](https://vercel.com/docs/vercel-firewall).

Both project responses omit the `security` block. The [official Vercel Terraform client](https://github.com/vercel/terraform-provider-vercel/blob/main/client/attack_challenge_mode.go) implements that state as Attack Challenge Mode disabled, with no active-until timestamp. This is the provider client's default interpretation of an omitted field, rather than an explicit `attackModeEnabled: false` field returned by this API.

No bypass, allowlist, firewall setting, attack-mode setting, protection setting or project setting was changed. Before any future ramp, refresh these reads and arm a fail-closed stop on the first challenge header/page, platform block or 429. The local-only harness remains forbidden from targeting staging.

## Required measurements and their present boundary

- **Cold starts:** the staging Vercel metric `vercel.function_invocation.count`, grouped by `functionStartType`, is available. The saved historical query reports hot/cold/prewarmed traffic solely to prove that capability; it is not rehearsal evidence and is not attributable to this task.
- **Function instance counts:** a trustworthy VM-instance count source has not been established. The public invocation-count schema has no instance-ID dimension. Invocation/request IDs and cold-start counts must not be substituted for VM-instance counts. Establish a provider-supported source before a future workload, within whatever access/configuration scope is authorized.
- **Database connection peaks:** not measured; no workload ran. A future staging run must retain sampled backend counts and identify the interval/sampling limits, distinguishing backend connections from pooler client connections and from the harness observer.
- **SQL correctness after each run:** not performed because there were no runs or test bids. The existing independent checks remain required for each of 50, 150 and 300 phones, plus original receipt recovery and the server-clock/lock close proof. No shared statistics may be reset to collect evidence.

## Disposition and cleanup

Zero test accounts, organizations or practice events were created. There is no rehearsal fixture to delete. There were zero application-domain requests, zero application or provider configuration changes, zero deployments, zero pushes and zero production data writes. All configuration-query connections were closed.

Stage 1 remains incomplete. Under the no-configuration-change condition, stop here and report the mismatch. A readiness-counting rehearsal requires a separately authorized representative staging compute/suspension configuration, plus validated staging database binding and a function-instance-count evidence source. If compute alignment is later authorized, keep it scoped to the staging endpoint, time-bound it to the rehearsal, and restore its previous settings afterwards; no such change is authorized by the current approval.

An initial diagnostic inadvertently printed a production protection-bypass key because it was stored as an object key in the provider response. No key was copied into these artifacts or Git. Subsequent diagnostics use explicit field projections. Rotation remains a separate configuration action and was not performed under the current no-config-change instruction.
