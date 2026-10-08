#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {withFixture,HarnessError} from '../staging-workspace-entry/harness.mjs';
import {healthy} from '../staging-workspace-entry/fixtures.mjs';
import {bounded} from '../staging-workspace-entry/browser.mjs';
import {classifyError} from '../staging-saturn-event-home-v3/classify.mjs';
import {cases as duplicationCases} from './checks.mjs';
import {ROUTER_REFRESH_EVENT_ROUTE} from './refresh-checks.mjs';
const cases={...duplicationCases,ROUTER_REFRESH_EVENT_ROUTE};
const startedMs=Date.now(),hash=b=>createHash('sha256').update(b).digest('hex'),root=resolve(process.env.VERIFY_ROOT||process.cwd());let timer;
try{
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE'])if(process.env[key]!==undefined)throw new HarnessError('Inherited provider/runtime environment refused');
 if(process.env.EVENT_PREPARATION_CONTROL)throw new HarnessError('Controls are forbidden in application gate runner');
 const args=process.argv.slice(2),mode=args.shift();let output;if(args.length){assert.equal(args.shift(),'--output');output=resolve(args.shift());assert.equal(args.length,0);}
 const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),c=config.checks.find(c=>c.kind===mode)||config.checks.find(c=>c.assertions.includes(mode));if(!c)throw new HarnessError('Exact contracted mode/case required');
 await mkdir('/tmp/task-root',{recursive:true});output=output||await mkdtemp('/tmp/task-root/event-preparation006-direct-');await mkdir(output,{recursive:true});
 const revision=()=>{const r=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000});if(r.error||r.status!==0)throw new HarnessError('Source revision unavailable');return r.stdout.trim();};
 const map=async paths=>Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,hash(await readFile(join(root,p)))])));
 const sourcePaths=Object.keys(JSON.parse(await readFile(join(root,'tests/acceptance/staging-workspace-entry/SOURCE_BINDING.json'),'utf8')).sha256),commit=revision(),sourceHashes=await map(sourcePaths),helperHashes=await map(c.chain),binding={check:c.name,phase:process.env.VERIFY_TREE||'direct',runId:process.env.VERIFY_RUN_ID||'direct',commit,sourceHashes,helperHashes,startedMs,output};
 await writeFile(join(output,'START_RUN.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});timer=setTimeout(()=>{console.error('HARNESS99 internal deadline');process.emit('SIGTERM');},c.timeout*1000-2000);timer.unref();const results=[];let actualExit=0;
 await withFixture(async f=>{await healthy(f);for(const id of c.assertions.filter(id=>mode===c.kind||mode===id)){const start=Date.now();let exit=0,detail='All independently authored working/UI/API/SQL/preview observations completed';try{await bounded(cases[id](f,output),id,90000);}catch(e){exit=classifyError(e);detail=String(e?.message||e);console.error((exit===99?'HARNESS99':'FAIL')+' '+id+': '+detail);}results.push({id,actualExit:exit,detail,durationMs:Date.now()-start});console.log('CASE_RESULT '+JSON.stringify(results.at(-1)));if(exit===99){actualExit=99;break;}if(exit===1)actualExit=1;}});
 clearTimeout(timer);assert.equal(revision(),commit);assert.deepEqual(await map(sourcePaths),sourceHashes);assert.deepEqual(await map(c.chain),helperHashes);
 const receipt={version:1,...binding,mode:c.kind,endedMs:Date.now(),actualExit,results};await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('EVENT_PREPARATION006_RUN_RECEIPT '+JSON.stringify({path:join(output,'RUN_RECEIPT.json'),sha256:hash(await readFile(join(output,'RUN_RECEIPT.json')))}));process.exitCode=actualExit;
}catch(e){clearTimeout(timer);console.error('HARNESS99 runner '+String(e?.message||e));process.exitCode=99;}
