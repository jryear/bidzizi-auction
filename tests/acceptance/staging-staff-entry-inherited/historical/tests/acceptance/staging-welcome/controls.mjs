#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {withFixture,HarnessError} from '../staging-workspace-entry/harness.mjs';
import {healthy} from '../staging-workspace-entry/fixtures.mjs';
import {bounded} from '../staging-workspace-entry/browser.mjs';
import {classifyError} from '../staging-saturn-event-home-v3/classify.mjs';
import {cases} from './checks.mjs';
import {controlledSource,controls} from './source-controls.mjs';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),startedMs=Date.now(),hash=b=>createHash('sha256').update(b).digest('hex');let output;
try{
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','WELCOME_CONTROL','NODE_OPTIONS'])if(process.env[key])throw new HarnessError('Controls require clean disposable environment');
 const only=process.argv[2];assert.ok(process.argv.length<=3&&(!only||controls.includes(only)),'Optional exact control required');await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/welcome006b-controls-');
 const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),sourceHashes=Object.fromEntries(await Promise.all(config.sourcePaths.map(async p=>[p,hash(await readFile(join(root,p)))]))),helperHashes=Object.fromEntries(await Promise.all(config.checks[0].chain.map(async p=>[p,hash(await readFile(join(root,p)))]))),sourceSHA=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
 await writeFile(join(output,'START.json'),JSON.stringify({version:1,sourceRoot:root,sourceSHA,sourceHashes,helperHashes,startedMs,gateProof:false},null,2)+'\n');
 for(const control of controls){for(const path of ['/staging-bidder-preview/src/views.js','/staging-bidder-preview/src/app.js','/staging-catalog/views.js','/staging-catalog/app.js']){const text=controlledSource(await readFile(join(root,'public'+path),'utf8'),path,control),r=spawnSync('/Users/jryear/.nvm/versions/node/v24.4.1/bin/node',['--check','--input-type=module'],{input:text,encoding:'utf8'});if(r.status!==0)throw new HarnessError('Control does not parse: '+control+' '+path+' '+r.stderr);}}
 const plans=controls.filter(c=>!only||c===only).flatMap(control=>control==='REFERENCE'?Object.keys(cases).map(id=>({control,id})):control==='WRONG_COVER'?['WELCOME_SAVE_RELOAD_COMPOSITION','WELCOME_NULL_COVER'].map(id=>({control,id})):[{control,id:control==='DISABLED_SPONSOR_LEAK'?'WELCOME_LONG_TITLE_SPONSORS':control==='FOCUS_LOST'?'WELCOME_KEYBOARD_ROUTES':control==='DRAFT_AS_APPROVED'?'WELCOME_AUTHORIZED_CATALOG':'WELCOME_SAVE_RELOAD_COMPOSITION'}]);const results=[],sourceControls=[];
 await withFixture(async f=>{await healthy(f);f.controlBindings=sourceControls;for(const {control,id} of plans){f.welcomeControl=control;const out=join(output,control+'-'+id);await mkdir(out);let actualExit=0,detail='Independent transient reference completed';const started=Date.now();try{await bounded(cases[id](f,out),control+'/'+id,120000);}catch(e){actualExit=classifyError(e);detail=String(e.message||e);}const expectedExit=control==='REFERENCE'?0:1;results.push({control,id,expectedExit,actualExit,detail,durationMs:Date.now()-started,output:out,gateProof:false});console.log('CONTROL_RESULT '+JSON.stringify(results.at(-1)));await writeFile(join(output,'CONTROL_PROGRESS.json'),JSON.stringify({sourceSHA,sourceHashes,helperHashes,startedMs,updatedMs:Date.now(),results,sourceControls,gateProof:false},null,2)+'\n');assert.equal(actualExit,expectedExit,'Control must reach designated finite result');}});
 const receipt={version:1,sourceRoot:root,sourceSHA,sourceHashes,helperHashes,startedMs,endedMs:Date.now(),results,sourceControls,gateProof:false,referenceNeverWrittenToProduct:true};const path=join(output,'CONTROLS_RECEIPT.json');await writeFile(path,JSON.stringify(receipt,null,2)+'\n');console.log('WELCOME006B_CONTROLS_RECEIPT '+JSON.stringify({path,sha256:hash(await readFile(path))}));
}catch(e){if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'PREPARATION99',reason:String(e.stack||e),gateProof:false},null,2)+'\n').catch(()=>{});console.error('CONTROL_PREPARATION99 '+String(e.message||e)+(output?' output='+output:''));process.exitCode=99;}
