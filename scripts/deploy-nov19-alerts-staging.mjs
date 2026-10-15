#!/usr/bin/env node
// One-time authorized staging deployment. Never accepts a project/domain override or production action.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { alertConfig } from '../src/server/v1/alert-core.ts';
import { targets } from '../tests/load/staging-provider.mjs';

assert.equal(process.argv[2], '--deploy-staging-approved');
const commit = process.argv[3]; assert.match(commit ?? '', /^[a-f0-9]{40}$/); assert.equal(process.argv.length, 4);
assert.match(process.version, /^v24\./);
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit reviewed implementation/evidence first.');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), commit);
const validation = JSON.parse(await readFile('docs/evidence/nov19/alerts-validation.json','utf8')); assert.equal(validation.passed, true);
for (const [path, digest] of Object.entries(validation.manifest))
  assert.equal(createHash('sha256').update(execFileSync('git',['show',`${commit}:${path}`])).digest('hex'), digest, 'Deploy exactly tested application source');
let dsn;
try { dsn = (await readFile('/Users/jryear/.config/bidzizi/sentry-dsn','utf8')).trim(); } catch { throw new Error('Approved DSN file not ready; no provider mutation occurred.'); }
assert.ok(alertConfig({ VERCEL:'1', BIDZIZI_APP_MODE:'production', APP_ORIGIN:'https://staging.bidzizi.com', BIDZIZI_SENTRY_DSN:dsn }), 'Invalid DSN file; value suppressed.');
try { execFileSync('/Users/jryear/.local/bin/vercel',['whoami','--scope','saturn-ea53'],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}); }
catch { throw new Error('Existing Vercel authentication unavailable; no provider mutation occurred. Raw output suppressed.'); }
const auth = JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json','utf8'));
// Preserve the newer photo framing release observed on staging before this alert deploy.
const team = 'team_fOkqe9T0PRKMmdczUvnoMXct', stage = { ...targets.staging, deployment: 'dpl_AqVVa22iSSFxtQTL6n5JtBCuw4bC' }, prod = targets.production;
async function api(method,path,body) {
  const r = await fetch('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId='+team, {method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:'Bearer '+auth.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  assert.ok(r.ok,`Vercel ${method} failed (${r.status}); response suppressed.`); return r.json();
}
const beforeAlias = await api('GET','/v4/aliases/'+stage.alias);
assert.equal(beforeAlias.deployment?.id ?? beforeAlias.deploymentId,stage.deployment,'Staging changed since approved baseline; stop before mutation.');
const served = await api('GET','/v13/deployments/'+stage.deployment);
assert.equal(served.meta?.sourceCommit,'efc302b8960badcb8fb54c2d468cd86e34f6903a');
assert.equal(served.projectId,stage.project); assert.equal(served.readyState,'READY');
execFileSync('git',['merge-base','--is-ancestor',served.meta.sourceCommit,commit]);
const beforeProd = await api('GET','/v4/aliases/'+prod.alias);
assert.equal(beforeProd.deployment?.id ?? beforeProd.deploymentId,prod.deployment);
const prodVars = await api('GET',`/v10/projects/${prod.project}/env`);
const envList = data => { const list=Array.isArray(data)?data:data.envs;assert.ok(Array.isArray(list),'Unexpected env readback shape; values suppressed.');return list; };
assert.ok(!envList(prodVars).some(x=>x.key==='BIDZIZI_SENTRY_DSN'),'Production alert activation must remain gated.');
const receipt={startedAt:new Date().toISOString(),sourceCommit:commit,projectId:stage.project,productionProjectUntouched:true,
  priorStagingDeployment:stage.deployment,productionDeployment:prod.deployment,productionDsnAbsent:true};
await api('POST',`/v10/projects/${stage.project}/env?upsert=true`, {key:'BIDZIZI_SENTRY_DSN',value:dsn,type:'sensitive',target:['production'],
  comment:'Approved Nov19 server-only alerts; staging project only. Production app activation remains gated.'});
const envs = await api('GET',`/v10/projects/${stage.project}/env`);
const variable=envList(envs).find(x=>x.key==='BIDZIZI_SENTRY_DSN' && x.target?.includes('production'));
assert.equal(variable?.type,'sensitive'); assert.deepEqual(variable.target,['production']);
receipt.stagingEnv={key:variable.key,type:variable.type,target:variable.target,id:variable.id,
  interpretation:'production is the deployment target INSIDE the isolated staging project, not the production application project.'};
await writeFile('docs/evidence/nov19/alerts-deployment.json',JSON.stringify(receipt,null,2)+'\n');
const directory=await mkdtemp(join(tmpdir(),'bz-alerts-deploy-'));
try {
  const names=execFileSync('git',['ls-tree','-r','--name-only',commit],{encoding:'utf8'}).trim().split('\n').filter(p=>
    p.startsWith('src/')||p.startsWith('public/')||['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','next.config.ts','postcss.config.mjs','vercel.json'].includes(p));
  assert.ok(names.includes('src/server/v1/alerts.ts') && !names.some(p=>p.includes('.env')));
  const archive=execFileSync('git',['archive','--format=tar',commit,...names],{maxBuffer:100*1024*1024});
  const unpack=spawnSync('tar',['-xf','-','-C',directory],{input:archive,stdio:['pipe','pipe','pipe']}); assert.equal(unpack.status,0);
  await mkdir(join(directory,'.vercel'));
  await writeFile(join(directory,'.vercel/project.json'),JSON.stringify({projectId:stage.project,orgId:team}));
  // CLI receives no secret argument/env override. It resolves the sensitive value within the staging project.
  const deployed=execFileSync('/Users/jryear/.local/bin/vercel',['deploy','--prod','--skip-domain','--yes','--project',stage.project,
    '--scope','saturn-ea53','--cwd',directory,'--meta',`sourceCommit=${commit}`,'--json'],
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:600000,maxBuffer:5*1024*1024});
  const data=JSON.parse(deployed), lookup=data.id ?? data.deployment?.id ?? data.deploymentId ?? data.url?.replace(/^https:\/\//,'');
  assert.ok(typeof lookup==='string'&&/^(?:dpl_[A-Za-z0-9]+|[A-Za-z0-9.-]+\.vercel\.app)$/.test(lookup));
  const deployment=await api('GET','/v13/deployments/'+lookup),id=deployment.id;
  assert.match(id??'',/^dpl_[A-Za-z0-9]+$/);
  assert.equal(deployment.projectId,stage.project); assert.equal(deployment.readyState,'READY'); assert.equal(deployment.meta?.sourceCommit,commit);
  receipt.deploymentId=id; receipt.deploymentUrl=deployment.url; receipt.readyState=deployment.readyState;
  await writeFile('docs/evidence/nov19/alerts-deployment.json',JSON.stringify(receipt,null,2)+'\n');
  await api('POST',`/v2/deployments/${id}/aliases`,{alias:stage.alias});
  const afterAlias=await api('GET','/v4/aliases/'+stage.alias); assert.equal(afterAlias.deployment?.id ?? afterAlias.deploymentId,id);
  const afterProd=await api('GET','/v4/aliases/'+prod.alias); assert.equal(afterProd.deployment?.id ?? afterProd.deploymentId,prod.deployment);
  const prodAfter=await api('GET',`/v10/projects/${prod.project}/env`); assert.ok(!envList(prodAfter).some(x=>x.key==='BIDZIZI_SENTRY_DSN'));
  receipt.completedAt=new Date().toISOString(); receipt.aliased=true; receipt.productionUnchanged=true;
  await writeFile('docs/evidence/nov19/alerts-deployment.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({sourceCommit:commit,stagingDeployment:id,ready:true,stagingAlias:stage.alias,productionUnchanged:true,dsnValueSuppressed:true}));
} catch {
  receipt.failure='Deployment/readback failed; sensitive CLI/provider output suppressed. Existing production project was not mutated.';
  await writeFile('docs/evidence/nov19/alerts-deployment.json',JSON.stringify(receipt,null,2)+'\n');
  throw new Error('Staging deployment incomplete; inspect sanitized receipt. Raw output suppressed.');
} finally { await rm(directory,{recursive:true,force:true}); }
