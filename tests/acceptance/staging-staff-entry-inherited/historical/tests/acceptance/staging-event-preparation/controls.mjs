#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {withFixture,HarnessError} from '../staging-workspace-entry/harness.mjs';
import {healthy} from '../staging-workspace-entry/fixtures.mjs';
import {classifyError} from '../staging-saturn-event-home-v3/classify.mjs';
import {cases} from './checks.mjs';
import {controlledSource,controls} from './source-controls.mjs';
const startedMs=Date.now(),root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex');let output;
try{
 assert.equal(process.argv.length,2);assert.equal(process.env.EVENT_PREPARATION_CONTROL,undefined);await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/event-preparation006-controls-');
 const source=await readFile(join(root,'public/staging-admin/studio.js'),'utf8'),commit=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),results=[];
 for(const id of controls){const text=controlledSource(source,id),parsed=spawnSync('/Users/jryear/.nvm/versions/node/v24.4.1/bin/node',['--check','--input-type=module'],{input:text,encoding:'utf8'});if(parsed.status!==0)throw new HarnessError('Control source does not parse: '+id);}
 const plans=controls.flatMap(control=>control==='REFERENCE'?Object.keys(cases).map(selected=>({control,selected})):[{control,selected:control==='RUNTIME_CARRYOVER'||control==='WRONG_SOURCE'?'DUPLICATE_SELECTED_ALLOWLIST':'DUPLICATE_EDIT_SAVE_RELOAD_PREVIEW'}]);
 await withFixture(async f=>{await healthy(f);
  for(const {control,selected} of plans){const out=join(output,control+'-'+selected);await mkdir(out);process.env.EVENT_PREPARATION_CONTROL=control;const start=Date.now();let actualExit=0,detail='Independent reference completed';try{await cases[selected](f,out);}catch(e){actualExit=classifyError(e);detail=String(e?.message||e);}finally{delete process.env.EVENT_PREPARATION_CONTROL;}
   results.push({control,case:selected,expectedExit:control==='REFERENCE'?0:1,actualExit,detail,durationMs:Date.now()-start,sourceSHA256:hash(source),servedSHA256:hash(controlledSource(source,control)),gateProof:false});console.log('CONTROL_RESULT '+JSON.stringify(results.at(-1)));assert.equal(actualExit,control==='REFERENCE'?0:1,'Control reaches its intended finite result: '+control);
  }
 });
 const receipt={version:1,commit,sourceRoot:root,sourceSHA256:hash(source),startedMs,endedMs:Date.now(),gateProof:false,results};await writeFile(join(output,'CONTROLS_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');console.log('EVENT_PREPARATION006_CONTROLS_RECEIPT '+join(output,'CONTROLS_RECEIPT.json'));
}catch(e){delete process.env.EVENT_PREPARATION_CONTROL;console.error('CONTROL_PREPARATION_FAILED '+String(e?.message||e)+(output?' output='+output:''));process.exitCode=99;}
