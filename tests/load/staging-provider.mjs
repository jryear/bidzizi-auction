import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const targets = {
  staging: { project: 'prj_nQdWJzjZjFg0TY2MjlTf2hxWtBf9', alias: 'staging.bidzizi.com',
    branch: 'br-crimson-mountain-arsolcfe', endpoint: 'ep-orange-cake-aryndhab', deployment: 'dpl_AZZH3S67gBuDQvff6rmapwAUGKjr',
    sourceCommit: 'c50cad0e441a75a8db045b3baf76054032b2821b' },
  production: { project: 'prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2', alias: 'app.bidzizi.com',
    branch: 'br-cold-glitter-arx1msrh', endpoint: 'ep-broad-credit-arcrxgvi', deployment: 'dpl_kkAtoBzwqXeF72ieMkuLwUZyCgtT',
    sourceCommit: '4d6028f10b30e5cd8f5c33db060cce753114db77' },
};
const project = 'delicate-math-48681189', team = 'team_fOkqe9T0PRKMmdczUvnoMXct';
export async function providers() {
  const va = JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json', 'utf8'));
  const na = JSON.parse(await readFile('/Users/jryear/.config/neon/credentials.json', 'utf8'));
  async function get(host, path, token) {
    const r = await fetch(`https://${host}${path}`, { redirect: 'error', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15_000) });
    assert.ok(r.ok, `Provider GET failed (${r.status}); details suppressed.`);
    return r.json();
  }
  const neon = path => get('console.neon.tech', '/api/v2' + path, na.access_token);
  const vercel = path => get('api.vercel.com', path + (path.includes('?') ? '&' : '?') + 'teamId=' + team, va.token);
  async function readback() {
    const endpoints = (await neon(`/projects/${project}/endpoints`)).endpoints;
    const out = { at: new Date().toISOString(), targets: {} };
    for (const [label, t] of Object.entries(targets)) {
      const ep = endpoints.find(e => e.id === t.endpoint);
      assert.equal(ep?.branch_id, t.branch);
      const alias = await vercel('/v4/aliases/' + t.alias);
      assert.equal(alias.deployment?.id ?? alias.deploymentId, t.deployment, 'Domain deployment changed; stop before writes.');
      const d = await vercel('/v13/deployments/' + t.deployment), p = await vercel('/v9/projects/' + t.project);
      assert.equal(d.projectId, t.project);
      assert.equal(d.readyState, 'READY'); assert.equal(d.meta?.sourceCommit, t.sourceCommit);
      const fw = await vercel('/v1/security/firewall/config?projectId=' + t.project);
      const attack = await vercel('/v1/security/firewall/attack-status?projectId=' + t.project);
      out.targets[label] = { ...t, minCu: ep.autoscaling_limit_min_cu, maxCu: ep.autoscaling_limit_max_cu,
        autosuspendSeconds: ep.suspend_timeout_seconds, sourceCommit: d.meta?.sourceCommit ?? null,
        regions: d.regions, nodeVersion: d.nodeVersion,
        function: { type: d.config?.functionType, memoryType: d.config?.functionMemoryType, timeoutSeconds: d.config?.functionTimeout, activeCpu: d.config?.isUsingActiveCPU },
        firewall: { activePresent: Boolean(fw.active), enabled: fw.active?.firewallEnabled ?? null,
          rules: fw.active?.rules?.length ?? 0, ips: fw.active?.ips?.length ?? 0,
          attackModeEnabled: p.security?.attackModeEnabled ?? false, attackAnomalies: attack.anomalies?.length ?? null } };
    }
    return out;
  }
  async function database(label, purpose, readOnly) {
    assert.ok(label === 'staging' || (label === 'production' && readOnly), 'Production clients are read-only.');
    const t = targets[label];
    const ep = (await neon(`/projects/${project}/endpoints`)).endpoints.find(e => e.id === t.endpoint);
    assert.equal(ep?.branch_id, t.branch);
    const database = (await neon(`/projects/${project}/branches/${t.branch}/databases`)).databases.find(x => x.name === 'neondb');
    assert.ok(database?.owner_name);
    const params = new URLSearchParams({ branch_id: t.branch, endpoint_id: t.endpoint, database_name: database.name, role_name: database.owner_name, pooled: 'false' });
    const u = new URL((await neon(`/projects/${project}/connection_uri?${params}`)).uri);
    assert.ok(u.hostname.startsWith(t.endpoint + '.') && u.hostname.endsWith('.neon.tech'));
    for (const k of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'channel_binding']) u.searchParams.delete(k);
    const db = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 15_000, query_timeout: 10_000,
      options: readOnly ? '-c default_transaction_read_only=on -c statement_timeout=8000' : '-c statement_timeout=8000',
      application_name: 'nov19-' + purpose });
    // Suppress raw pg errors: they may contain host or query parameters.
    db.on('error', () => {});
    await db.connect();
    if (readOnly) assert.equal((await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
    return db;
  }
  async function assertStagingDeployment(deploymentId, sourceCommit) {
    assert.match(deploymentId, /^dpl_[A-Za-z0-9]+$/); assert.match(sourceCommit, /^[a-f0-9]{40}$/);
    const alias = await vercel('/v4/aliases/' + targets.staging.alias);
    assert.equal(alias.deployment?.id ?? alias.deploymentId, deploymentId);
    const d = await vercel('/v13/deployments/' + deploymentId);
    assert.equal(d.projectId, targets.staging.project); assert.equal(d.readyState, 'READY');
    assert.equal(d.meta?.sourceCommit, sourceCommit);
    const prod = await vercel('/v4/aliases/' + targets.production.alias);
    assert.equal(prod.deployment?.id ?? prod.deploymentId, targets.production.deployment, 'Production must remain unchanged.');
    return { deploymentId, sourceCommit, readyState: d.readyState, projectId: d.projectId, productionUnchanged: true };
  }
  return { readback, database, assertStagingDeployment };
}
