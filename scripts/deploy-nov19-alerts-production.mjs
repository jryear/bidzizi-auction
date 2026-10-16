#!/usr/bin/env node
// Explicitly approved production alert activation; never migrates or changes other settings.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { alertConfig } from '../src/server/v1/alert-core.ts';
import { targets } from '../tests/load/staging-provider.mjs';
assert.deepEqual(process.argv.slice(2,3),['--deploy-production-alerts-approved']);
const commit=process.argv[3];assert.match(commit??'',/^[a-f0-9]{40}$/);assert.equal(process.argv.length,4);assert.match(process.version,/^v24\./);
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','Commit implementation and evidence first.');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit);
const validation=JSON.parse(await readFile('docs/evidence/nov19/alerts-validation.json','utf8'));assert.equal(validation.passed,true);
for(const [path,digest] of Object.entries(validation.manifest))assert.equal(createHash('sha256').update(execFileSync('git',['show',`${commit}:${path}`])).digest('hex'),digest,'Deploy only tested application source.');
const rules=JSON.parse(await readFile('docs/evidence/nov19/alerts-production-rules.json','utf8'));
assert.equal(rules.rules.length,2);for(const r of rules.rules)assert.ok(r.enabled&&r.environmentAttributeEquals==='production'&&r.filtersRequireAll);
const dsn=(await readFile('/Users/jryear/.config/bidzizi/sentry-dsn','utf8')).trim();
assert.ok(alertConfig({VERCEL:'1',BIDZIZI_APP_MODE:'production',APP_ORIGIN:'https://app.bidzizi.com',BIDZIZI_SENTRY_DSN:dsn}),'Invalid DSN; value suppressed.');
const auth=JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json','utf8'));
const team='team_fOkqe9T0PRKMmdczUvnoMXct',prod=targets.production,stage=targets.staging;
async function api(method,path,body){const r=await fetch('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId='+team,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+auth.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,`Vercel ${method} failed (${r.status}); details suppressed.`);return r.json();}
const deploymentOf=a=>a.deployment?.id??a.deploymentId;
const envList=d=>{const list=Array.isArray(d)?d:d.envs;assert.ok(Array.isArray(list),'Unexpected env shape; suppressed.');return list;};
assert.equal(deploymentOf(await api('GET','/v4/aliases/'+prod.alias)),prod.deployment);
const previous=await api('GET','/v13/deployments/'+prod.deployment);assert.equal(previous.readyState,'READY');assert.equal(previous.projectId,prod.project);assert.equal(previous.meta?.sourceCommit,prod.sourceCommit);
execFileSync('git',['merge-base','--is-ancestor',prod.sourceCommit,commit]);
assert.equal(deploymentOf(await api('GET','/v4/aliases/'+stage.alias)),stage.deployment);
const staged=await api('GET','/v13/deployments/'+stage.deployment);assert.equal(staged.projectId,stage.project);assert.equal(staged.readyState,'READY');
// The separately built staging candidate must contain byte-identical tested application source.
for(const path of Object.keys(validation.manifest))assert.equal(execFileSync('git',['show',`${staged.meta.sourceCommit}:${path}`]).compare(execFileSync('git',['show',`${commit}:${path}`])),0,'Production app must match the staging-tested app.');
const before=envList(await api('GET',`/v10/projects/${prod.project}/env`));assert.ok(!before.some(v=>v.key==='BIDZIZI_SENTRY_DSN'),'Unexpected prior production activation; stop.');
const receipt={startedAt:new Date().toISOString(),sourceCommit:commit,projectId:prod.project,previousProduction:prod.deployment,previousProductionSource:prod.sourceCommit,stagingDeployment:stage.deployment,stagingSource:staged.meta.sourceCommit,applicationMatchesStaging:true};
const save=()=>writeFile('docs/evidence/nov19/alerts-production-deployment.json',JSON.stringify(receipt,null,2)+'\n');
await save();
await api('POST',`/v10/projects/${prod.project}/env?upsert=true`,{key:'BIDZIZI_SENTRY_DSN',value:dsn,type:'sensitive',target:['production'],comment:'Zack approved Nov19 server-only production alerts; no client capture.'});
const envs=envList(await api('GET',`/v10/projects/${prod.project}/env`));const variable=envs.find(v=>v.key==='BIDZIZI_SENTRY_DSN');assert.equal(variable?.type,'sensitive');assert.deepEqual(variable.target,['production']);
assert.deepEqual(envs.filter(v=>v.key!=='BIDZIZI_SENTRY_DSN').map(v=>v.id).sort(),before.map(v=>v.id).sort(),'Existing variables retained.');
receipt.productionEnv={key:variable.key,type:variable.type,target:variable.target,id:variable.id};await save();
const directory=await mkdtemp(join(tmpdir(),'bz-prod-alerts-'));
try{
 const names=execFileSync('git',['ls-tree','-r','--name-only',commit],{encoding:'utf8'}).trim().split('\n').filter(p=>p.startsWith('src/')||p.startsWith('public/')||['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','next.config.ts','postcss.config.mjs','vercel.json'].includes(p));
 assert.ok(names.includes('src/server/v1/alerts.ts')&&!names.some(p=>p.includes('.env')));
 const archive=execFileSync('git',['archive','--format=tar',commit,...names],{maxBuffer:100*1024*1024});assert.equal(spawnSync('tar',['-xf','-','-C',directory],{input:archive,stdio:['pipe','pipe','pipe']}).status,0);
 await mkdir(join(directory,'.vercel'));await writeFile(join(directory,'.vercel/project.json'),JSON.stringify({projectId:prod.project,orgId:team}));
 const raw=execFileSync('/Users/jryear/.local/bin/vercel',['deploy','--prod','--skip-domain','--yes','--project',prod.project,'--scope','saturn-ea53','--cwd',directory,'--meta',`sourceCommit=${commit}`,'--meta',`previousProduction=${prod.deployment}`,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:600000,maxBuffer:5*1024*1024});
 const data=JSON.parse(raw),lookup=data.id??data.deployment?.id??data.deploymentId??data.url?.replace(/^https:\/\//,'');assert.ok(typeof lookup==='string'&&/^(?:dpl_[A-Za-z0-9]+|[A-Za-z0-9.-]+\.vercel\.app)$/.test(lookup));
 const d=await api('GET','/v13/deployments/'+lookup);assert.equal(d.projectId,prod.project);assert.equal(d.readyState,'READY');assert.equal(d.meta?.sourceCommit,commit);
 receipt.deploymentId=d.id;receipt.deploymentUrl=d.url;receipt.readyState=d.readyState;await save();
 // Stop promotion if either alias changed while the build ran.
 assert.equal(deploymentOf(await api('GET','/v4/aliases/'+prod.alias)),prod.deployment);
 assert.equal(deploymentOf(await api('GET','/v4/aliases/'+stage.alias)),stage.deployment);
 await api('POST',`/v2/deployments/${d.id}/aliases`,{alias:prod.alias});
 assert.equal(deploymentOf(await api('GET','/v4/aliases/'+prod.alias)),d.id);
 receipt.completedAt=new Date().toISOString();receipt.aliased=true;receipt.stagingUnchanged=true;await save();
 console.log(JSON.stringify({sourceCommit:commit,productionDeployment:d.id,ready:true,dsnValueSuppressed:true}));
}catch{receipt.failure='Production activation incomplete; inspect sanitized receipt. Raw output suppressed.';await save();throw new Error(receipt.failure);}finally{await rm(directory,{recursive:true,force:true});}
