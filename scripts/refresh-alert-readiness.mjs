#!/usr/bin/env node
// Read-only Vercel checks plus an explicit engineer confirmation of the Sentry UI rules.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
assert.deepEqual(process.argv.slice(2),['--production-rules-confirmed']);
try{execFileSync('/Users/jryear/.local/bin/vercel',['whoami','--scope','saturn-ea53'],{stdio:['ignore','pipe','pipe'],timeout:25000});}catch{throw new Error('Existing Vercel authentication unavailable; raw CLI output suppressed.');}
const auth=JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json','utf8'));
async function get(path){const r=await fetch('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId=team_fOkqe9T0PRKMmdczUvnoMXct',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+auth.token}});assert.ok(r.ok,`Read-only Vercel GET failed (${r.status}); details suppressed.`);return r.json();}
const alias=await get('/v4/aliases/app.bidzizi.com'),id=alias.deployment?.id??alias.deploymentId,d=await get('/v13/deployments/'+id);
assert.equal(d.projectId,'prj_gJg1GmPcU3pxeXf9UCj5O7clYZf2');assert.equal(d.readyState,'READY');
const vars=await get('/v10/projects/'+d.projectId+'/env'),list=Array.isArray(vars)?vars:vars.envs;assert.ok(Array.isArray(list));
const proof=JSON.parse(await readFile('docs/evidence/nov19/alerts-production-proof.json','utf8')),rules=JSON.parse(await readFile('docs/evidence/nov19/alerts-production-rules.json','utf8'));
assert.ok(proof.deliveryDemonstrated&&proof.inboxProof.confirmed);assert.ok(Date.now()-Date.parse(rules.verifiedAt)<=86400000,'Read back both Sentry production rules before refreshing their readiness receipt.');
assert.ok(rules.rules.length===2&&rules.rules.every(r=>r.enabled&&r.environmentAttributeEquals==='production'));
for(const path of ['src/instrumentation.ts','src/sentry.server.config.ts','src/server/v1/alerts.ts','src/server/v1/alert-core.ts','src/server/v1/sentry-sdk.ts','next.config.ts','package.json','pnpm-lock.yaml'])assert.equal(execFileSync('git',['show',`${proof.sourceCommit}:${path}`]).compare(execFileSync('git',['show',`${d.meta.sourceCommit}:${path}`])),0,'Alert code changed since demonstrated delivery; run a new approved proof.');
const receipt={origin:'https://app.bidzizi.com',verifiedAt:new Date().toISOString(),deploymentId:id,sourceCommit:d.meta.sourceCommit,dsnConfigured:list.some(v=>v.key==='BIDZIZI_SENTRY_DSN'),rulesEnabled:true,rulesVerification:'Engineer-confirmed authenticated Sentry UI readback; not an automated Sentry management API check',rulesReadbackAt:rules.verifiedAt,deliveryDemonstrated:true,deliveryProofSource:proof.sourceCommit,subminuteProofPassed:proof.readinessAcceptancePassed===true,observedMaxSeconds:Math.max(...Object.values(proof.scenarios).map(s=>s.occurrenceToInboxSeconds))};
await writeFile('docs/evidence/nov19/alert-readiness.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
