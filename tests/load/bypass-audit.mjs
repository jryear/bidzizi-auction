#!/usr/bin/env node
// Read-only dependency audit. Never put the bypass value in argv, output, or saved files.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, basename, extname } from 'node:path';
import assert from 'node:assert/strict';
const productionProject = 'prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2', team = 'team_fOkqe9T0PRKMmdczUvnoMXct';
const auth = JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json', 'utf8'));
const response = await fetch(`https://api.vercel.com/v9/projects/${productionProject}?teamId=${team}`, { headers: { Authorization: 'Bearer ' + auth.token }, signal: AbortSignal.timeout(15000) });
assert.ok(response.ok, 'Provider audit read failed; raw response suppressed.');
const project = await response.json();
const secrets = Object.entries(project.protectionBypass ?? {}).filter(([, v]) => v.scope === 'automation-bypass').map(([key]) => key);
assert.equal(secrets.length, 1, 'Expected exactly the one production automation-bypass credential.');
const secret = secrets[0];
const roots = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' }).split('\n').filter(s => s.startsWith('worktree ')).map(s => s.slice(9));
for (const name of await readdir('/Users/jryear/code')) if (/^(bidzizi|saturn)/.test(name)) roots.push('/Users/jryear/code/' + name);
const files = new Set(), skipped = [], failures = [];
for (const root of new Set(roots)) {
  try {
    const list = execFileSync('rg', ['--files', '--hidden', '--no-ignore', '-g', '!.git', '-g', '!node_modules', '-g', '!.next', '-g', '!.shots', '-g', '!out', '-g', '!dist', '-g', '!build', root], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    for (const file of list.trim().split('\n').filter(Boolean)) files.add(file);
  } catch { failures.push(root); }
}
for (const name of await readdir('/tmp')) if (/bidzizi|^bz[-_]|real-v1|nov19|compat|preview|items|vercel/i.test(name)) {
  const p = join('/tmp', name); try { if ((await stat(p)).isFile()) files.add(p); } catch { /* unrelated vanished temp file */ }
}
const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.sh','.bash','.zsh','.md','.txt','.json','.jsonl','.toml','.yaml','.yml','.html','.css','.conf','.ini','.env','.sql']);
const references = [], exactReferences = [];
let scanned = 0;
const pattern = /protectionBypass|protection_bypass_for_automation|x-vercel-protection-bypass|VERCEL_AUTOMATION_BYPASS_SECRET|VERCEL_PROTECTION_BYPASS|bypassSecret/i;
for (const file of files) {
  if (!textExtensions.has(extname(file)) && !/^\.env/.test(basename(file)) && !['Makefile','Dockerfile','project.json'].includes(basename(file))) continue;
  try {
    if ((await stat(file)).size > 12 * 1024 * 1024) { skipped.push(file); continue; }
    const body = await readFile(file, 'utf8'); scanned++;
    const lines = body.split('\n'), exact = [], refs = [];
    lines.forEach((line, i) => { if (line.includes(secret)) exact.push(i + 1); if (pattern.test(line)) refs.push(i + 1); });
    const safePath = file.replaceAll(secret, '[redacted]');
    if (exact.length) exactReferences.push({ file: safePath, lines: exact });
    if (refs.length) references.push({ file: safePath, lines: refs,
      containsProductionProject: body.includes(productionProject), containsProductionDomain: body.includes('app.bidzizi.com'),
      containsLegacyStagingProject: body.includes('prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP') });
  } catch { failures.push(file); }
}
function github(path) { return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 20000 })); }
const repo = 'repos/jryear/bidzizi-auction';
const ci = { repoSecrets: github(repo + '/actions/secrets').secrets.map(x => x.name), repoVariables: github(repo + '/actions/variables').variables.map(x => x.name),
  workflows: github(repo + '/actions/workflows').workflows.map(x => ({ name: x.name, path: x.path, state: x.state })), environments: [] };
for (const e of github(repo + '/environments').environments) ci.environments.push({ name: e.name,
  secrets: github(repo + '/environments/' + encodeURIComponent(e.name) + '/secrets').secrets.map(x => x.name),
  variables: github(repo + '/environments/' + encodeURIComponent(e.name) + '/variables').variables.map(x => x.name) });
const evidence = { auditedAt: new Date().toISOString(), projectId: productionProject, credentialCount: secrets.length,
  roots: [...new Set(roots)], filesScanned: scanned, unreadable: failures, oversizedTextFilesSkipped: skipped,
  exactCredentialReferences: exactReferences, genericBypassReferences: references, ci,
  limitation: 'No claim about consumers outside the inspected related repositories, worktrees, selected temporary scripts, and linked GitHub repository/CI metadata. Encrypted CI values are not readable.' };
await writeFile('docs/evidence/nov19/bypass-audit.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ filesScanned: scanned, roots: evidence.roots.length, unreadable: failures.length, oversizedSkipped: skipped.length,
  exactCredentialReferences: exactReferences, productionRelatedGenericReferences: references.filter(x => x.containsProductionProject || x.containsProductionDomain),
  genericReferenceFiles: references.length, ci }));
