#!/usr/bin/env node
// READ ONLY. Never requests an application origin, edits provider config, or creates fixtures.
// Existing provider tokens and temporary connection URIs stay in memory; emit only explicit fields.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const team = 'team_fOkqe9T0PRKMmdczUvnoMXct', project = 'delicate-math-48681189';
const va = JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json', 'utf8'));
const na = JSON.parse(await readFile('/Users/jryear/.config/neon/credentials.json', 'utf8'));
const targets = [
  { label: 'staging', vercel: 'prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9', branch: 'br-crimson-mountain-arsolcfe', endpoint: 'ep-orange-cake-aryndhab', alias: 'staging.bidzizi.com' },
  { label: 'production', vercel: 'prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2', branch: 'br-cold-glitter-arx1msrh', endpoint: 'ep-broad-credit-arcrxgvi', alias: 'app.bidzizi.com' },
];
async function api(host, path, token) {
  assert.ok(['api.vercel.com', 'console.neon.tech'].includes(host));
  const r = await fetch(`https://${host}${path}`, { method: 'GET', redirect: 'error',
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15_000) });
  assert.ok(r.ok, `Provider GET failed (${r.status}); response suppressed.`);
  return r.json();
}
const neon = path => api('console.neon.tech', '/api/v2' + path, na.access_token);
const vercel = path => api('api.vercel.com', path + (path.includes('?') ? '&' : '?') + 'teamId=' + team, va.token);
const endpoints = (await neon(`/projects/${project}/endpoints`)).endpoints;
const evidence = { readAt: new Date().toISOString(), localRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Provider GETs and read-only pg_settings/pg_roles queries only. No application requests or business-data queries.', targets: [] };

for (const t of targets) {
  const endpoint = endpoints.find(e => e.id === t.endpoint);
  assert.equal(endpoint?.branch_id, t.branch, 'Pinned endpoint must belong to pinned branch');
  const p = await vercel('/v9/projects/' + t.vercel);
  assert.equal(p.id, t.vercel);
  const alias = await vercel('/v4/aliases/' + t.alias);
  const deploymentId = alias.deployment?.id ?? alias.deploymentId;
  assert.ok(deploymentId, 'Alias must identify a deployment');
  const d = await vercel('/v13/deployments/' + deploymentId);
  assert.equal(d.projectId, t.vercel, 'Alias must point to the pinned project');
  const firewall = await vercel('/v1/security/firewall/config?projectId=' + t.vercel);
  const attacks = await vercel('/v1/security/firewall/attack-status?projectId=' + t.vercel);
  const active = firewall.active;
  const item = { label: t.label, vercelProjectId: t.vercel, deploymentId, deploymentState: d.readyState,
    sourceCommit: d.meta?.sourceCommit ?? null, servedRegions: d.regions, nodeVersion: d.nodeVersion,
    projectDefaultRegions: p.defaultResourceConfig?.functionDefaultRegions,
    function: { type: d.config?.functionType, memoryType: d.config?.functionMemoryType, timeoutSeconds: d.config?.functionTimeout,
      activeCpu: d.config?.isUsingActiveCPU, elasticConcurrencyEnabled: p.defaultResourceConfig?.elasticConcurrencyEnabled },
    firewall: { activeConfigPresent: active !== null && active !== undefined, activeVersion: active?.version ?? null,
      firewallEnabled: active?.firewallEnabled ?? null, botIdEnabled: active?.botIdEnabled ?? null,
      customRuleCount: active?.rules?.length ?? 0, ipRuleCount: active?.ips?.length ?? 0,
      attackChallengeMode: { enabled: p.security?.attackModeEnabled ?? false, activeUntil: p.security?.attackModeActiveUntil ?? null,
        securityFieldPresent: p.security !== undefined && p.security !== null,
        interpretation: 'Missing security block means disabled in the official Vercel Terraform GetAttackChallengeMode implementation.' },
      activeAttackAnomalyCount: Array.isArray(attacks.anomalies) ? attacks.anomalies.length : null },
    neon: { project, branch: t.branch, endpoint: t.endpoint, region: endpoint.region_id,
      stateBeforeSqlRead: endpoint.current_state, minCu: endpoint.autoscaling_limit_min_cu, maxCu: endpoint.autoscaling_limit_max_cu,
      autosuspendSeconds: endpoint.suspend_timeout_seconds, poolerMode: endpoint.pooler_mode,
      apiPoolerEnabledField: endpoint.pooler_enabled },
    deploymentDatabaseBinding: 'Not independently established: project database environment variable is sensitive/redacted by Vercel.' };

  // Resolve only the pinned endpoint's existing database owner; creates no role or credential.
  const database = (await neon(`/projects/${project}/branches/${t.branch}/databases`)).databases.find(x => x.name === 'neondb');
  assert.ok(database?.owner_name);
  const query = new URLSearchParams({ branch_id: t.branch, endpoint_id: t.endpoint, database_name: database.name,
    role_name: database.owner_name, pooled: 'true' });
  const u = new URL((await neon(`/projects/${project}/connection_uri?${query}`)).uri);
  assert.ok(u.hostname.startsWith(t.endpoint + '-pooler.') && u.hostname.endsWith('.neon.tech'), 'Connection must use pinned pooled endpoint');
  for (const k of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'channel_binding']) u.searchParams.delete(k);
  const db = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15_000, query_timeout: 5000, application_name: 'nov19-readonly-config' });
  try {
    await db.connect(); await db.query('BEGIN READ ONLY');
    const settings = (await db.query("SELECT name,setting FROM pg_settings WHERE name IN ('max_connections','superuser_reserved_connections','reserved_connections') ORDER BY name")).rows;
    item.neon.postgresLimits = Object.fromEntries(settings.map(s => [s.name, Number(s.setting)]));
    item.neon.roleConnectionLimit = (await db.query('SELECT rolconnlimit FROM pg_roles WHERE rolname=current_user')).rows[0].rolconnlimit;
    item.neon.verifiedTls = true; item.neon.pooledReadSucceeded = true;
    item.neon.poolerLimits = { documentedMaxClients: 10000, documentedQueryWaitSeconds: 120,
      documentedServerPoolFormula: '90% of max_connections per user/database',
      derivedServerPoolBeforeRounding: .9 * item.neon.postgresLimits.max_connections,
      evidenceLevel: 'PgBouncer limits are official documented defaults; live PgBouncer SHOW CONFIG was not available. Postgres limits above are live reads.' };
    await db.query('ROLLBACK');
  } finally { await db.end().catch(() => {}); }
  evidence.targets.push(item);
}
try {
  const raw = execFileSync('/Users/jryear/.local/bin/vercel', ['metrics', 'vercel.function_invocation.count', '--project', targets[0].vercel,
    '--scope', 'saturn-ea53', '--group-by', 'functionStartType', '--since', '1h', '--json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000 });
  const b = JSON.parse(raw);
  evidence.observabilityCapability = { coldStartMetricAvailable: true, window: { start: b.query?.startTime, end: b.query?.endTime },
    historicalSummary: b.summary.map(x => ({ startType: x.functionStartType, invocations: x.vercel_function_invocation_count_count })),
    note: 'Historical staging traffic, not rehearsal evidence. No load has run. Function instance counts and DB peaks remain unmeasured.',
    functionInstanceCountSource: 'Not established. The public function-invocation metric schema has no instance ID dimension; request/invocation IDs must not be counted as VM instances.' };
} catch { evidence.observabilityCapability = { coldStartMetricAvailable: false, rawOutputSuppressed: true }; }
evidence.rehearsal = { started: false, fixturesCreated: 0, applicationRequests: 0,
  reason: 'Material compute/autosuspend mismatch; stop under user approval conditions. No configuration/deployment changes.',
  stagingProductionSourceMetadataMatches: evidence.targets[0].sourceCommit === evidence.targets[1].sourceCommit };
await writeFile('docs/evidence/nov19/provider-readback.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ saved: 'docs/evidence/nov19/provider-readback.json', rehearsal: evidence.rehearsal,
  comparison: evidence.targets.map(t => ({ label: t.label, minCu: t.neon.minCu, maxCu: t.neon.maxCu,
    autosuspendSeconds: t.neon.autosuspendSeconds, maxConnections: t.neon.postgresLimits.max_connections,
    servedRegions: t.servedRegions, function: t.function, firewall: t.firewall, sourceCommit: t.sourceCommit })) }));
