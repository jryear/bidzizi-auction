// Test-side observer control only; deliberately no actual application response.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {consumedRead} from './browser.mjs';
import {HarnessError,evidenceExit} from './harness.mjs';
import {readFile} from 'node:fs/promises';
const started=Date.now();let error;
try{await consumedRead({frame:{evaluate:async()=>undefined}},'/api/admin/events/explicit-missing-consumption-v4');}catch(e){error=e;}
assert.ok(error instanceof HarnessError);assert.equal(evidenceExit(error),99);
const hashes={};for(const name of ['CASE_PLAN.json','browser.mjs','checks.mjs','run.mjs','syntax.mjs'])hashes[name]=createHash('sha256').update(await readFile(new URL('./'+name,import.meta.url))).digest('hex');
const receipt={version:4,observerControl:true,classification:'SIMULATED_MISSING_CONSUMPTION_GUARD',expectedEvidenceExit:99,actualEvidenceExit:evidenceExit(error),controlScriptExit:0,durationMs:Date.now()-started,message:error.message,evidenceHashes:hashes};
if(process.argv[2]){await mkdir(process.argv[2],{recursive:true});await writeFile(process.argv[2]+'/CONTROL_RECEIPT.json',JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt));
