#!/usr/bin/env node
// Explicit user-authorized revocation of exactly the audited, unused production automation key.
// No credential values are written or emitted. No replacement key is generated.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const project = 'prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2', team = 'team_fOkqe9T0PRKMmdczUvnoMXct';
const audit = JSON.parse(await readFile('docs/evidence/nov19/bypass-audit.json', 'utf8'));
assert.equal(audit.projectId, project); assert.equal(audit.exactCredentialReferences.length, 0); assert.equal(audit.unreadable.length, 0);
assert.equal(audit.oversizedTextFilesSkipped.length, 0);
assert.equal(audit.ci.workflows.length + audit.ci.repoSecrets.length + audit.ci.repoVariables.length, 0);
assert.ok(audit.ci.environments.every(e => e.secrets.length === 0 && e.variables.length === 0));
assert.ok(audit.genericBypassReferences.filter(x => x.containsProductionProject || x.containsProductionDomain)
  .every(x => x.file.endsWith('/tests/load/bypass-audit.mjs')), 'A production bypass consumer requires review before removal');
assert.ok(Date.now() - Date.parse(audit.auditedAt) < 30 * 60_000, 'Fresh audit required');
const auth = JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json', 'utf8'));
async function api(path, body) {
  const r = await fetch('https://api.vercel.com' + path + '?teamId=' + team, { method: body ? 'PATCH' : 'GET', redirect: 'error',
    headers: { Authorization: 'Bearer ' + auth.token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  assert.ok(r.ok, `Provider operation failed (${r.status}); raw response suppressed`); return r.json();
}
async function publicJoin() {
  const r = await fetch('https://app.bidzizi.com/join', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const body = await r.text();
  assert.equal(r.status, 200); assert.ok(r.headers.get('content-type')?.includes('text/html'));
  assert.ok(!r.headers.get('x-vercel-mitigated') && !/vercel security checkpoint/i.test(body));
  return { status: r.status, bodySha256: createHash('sha256').update(body).digest('hex') };
}
const before = await api('/v9/projects/' + project), beforeAlias = await api('/v4/aliases/app.bidzizi.com');
const keys = Object.entries(before.protectionBypass ?? {}).filter(([, v]) => v.scope === 'automation-bypass').map(([k]) => k);
assert.equal(keys.length, 1, 'Expected the single audited automation key');
const healthBefore = await publicJoin();
await api('/v1/projects/' + project + '/protection-bypass', { revoke: { secret: keys[0], regenerate: false } });
const after = await api('/v9/projects/' + project), afterAlias = await api('/v4/aliases/app.bidzizi.com');
assert.ok(!Object.hasOwn(after.protectionBypass ?? {}, keys[0]), 'Old credential must be absent');
const remaining = Object.values(after.protectionBypass ?? {}).filter(v => v.scope === 'automation-bypass').length;
assert.equal(remaining, 0);
assert.deepEqual(after.ssoProtection, before.ssoProtection); assert.deepEqual(after.defaultResourceConfig, before.defaultResourceConfig);
const dep = a => a.deployment?.id ?? a.deploymentId;
assert.equal(dep(afterAlias), dep(beforeAlias), 'Production alias must be unchanged');
const healthAfter = await publicJoin();
assert.equal(healthAfter.bodySha256, healthBefore.bodySha256, 'Public Join HTML must be unchanged');
const evidence = { completedAt: new Date().toISOString(), projectId: project, action: 'Removed unused production Protection Bypass for Automation key',
  audit: 'bypass-audit.json', oldKeyAbsent: true, remainingAutomationKeys: remaining, replacementGenerated: false,
  deploymentIdBefore: dep(beforeAlias), deploymentIdAfter: dep(afterAlias), deploymentProtectionUnchanged: true, functionDefaultsUnchanged: true,
  publicJoin: { before: healthBefore, after: healthAfter, byteIdentical: true }, productionApplicationRequests: 2,
  scope: 'Only the approved unused automation-bypass key was revoked. No deployment, domain, database, application or other configuration change.' };
await writeFile('docs/evidence/nov19/bypass-removal.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
