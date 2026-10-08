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
import {cases} from './checks.mjs';
const startedMs=Date.now(),root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex');let timer,output;
try{
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','WELCOME_CONTROL','NODE_OPTIONS'])if(process.env[key]!==undefined)throw new HarnessError('Undeclared runtime/control environment refused: '+key);
 const args=process.argv.slice(2),mode=args.shift();if(args.length){assert.equal(args.shift(),'--output');output=resolve(args.shift());assert.equal(args.length,0);}
 const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),c=config.checks.find(c=>c.kind===mode)||config.checks.find(c=>c.assertions.includes(mode));if(!c)throw new HarnessError('Exact current welcome group/case required');
 await mkdir('/tmp/task-root',{recursive:true});output=output||await mkdtemp('/tmp/task-root/welcome006b-direct-');await mkdir(output,{recursive:true});
 const revision=()=>{const r=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000});if(r.status!==0||r.error)throw new HarnessError('Source revision unavailable');return r.stdout.trim();};
 const map=async ps=>Object.fromEntries(await Promise.all([...new Set(ps)].sort().map(async p=>[p,hash(await readFile(join(root,p)))])));
 const sourcePaths=config.sourcePaths,commit=revision(),sourceHashes=await map(sourcePaths),helperHashes=await map(c.chain),binding={check:c.name,phase:process.env.VERIFY_TREE||'direct',runId:process.env.VERIFY_RUN_ID||'direct',commit,sourceHashes,helperHashes,startedMs,output,sourceRoot:root};await writeFile(join(output,'START_RUN.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
 timer=setTimeout(()=>{console.error('HARNESS99 internal deadline');process.emit('SIGTERM');},c.timeout*1000-2000);timer.unref();const results=[];let actualExit=0;
 await withFixture(async f=>{await healthy(f);for(const id of c.assertions.filter(id=>mode===c.kind||mode===id)){const start=Date.now(),out=join(output,id);await mkdir(out);let exit=0,detail='Complete native saved/API/SQL/authorized observations passed';try{await bounded(cases[id](f,out),id,120000);}catch(e){exit=classifyError(e);detail=String(e?.message||e);console.error((exit===99?'HARNESS99':'FAIL')+' '+id+': '+detail);}results.push({id,actualExit:exit,detail,durationMs:Date.now()-start});console.log('CASE_RESULT '+JSON.stringify(results.at(-1)));if(exit===99){actualExit=99;break;}if(exit===1)actualExit=1;}});
 clearTimeout(timer);assert.equal(revision(),commit);assert.deepEqual(await map(sourcePaths),sourceHashes);assert.deepEqual(await map(c.chain),helperHashes);
 const receipt={version:1,...binding,mode:c.kind,endedMs:Date.now(),actualExit,results};await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('WELCOME006B_RUN_RECEIPT '+JSON.stringify({path:join(output,'RUN_RECEIPT.json'),sha256:hash(await readFile(join(output,'RUN_RECEIPT.json')))}));process.exitCode=actualExit;
}catch(e){clearTimeout(timer);if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:String(e?.message||e),startedMs,endedMs:Date.now(),finalResultEmitted:false},null,2)+'\n').catch(()=>{});console.error('HARNESS99 welcome runner '+String(e?.message||e)+(output?' output='+output:''));process.exitCode=99;}
