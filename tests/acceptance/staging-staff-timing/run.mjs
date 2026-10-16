import { readFile,writeFile,mkdir,mkdtemp,lstat,realpath } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { HarnessError,ApplicationFailure,evidenceExit,node24 } from '../staff-drafts/harness.mjs';
import { withVerifiedFixture } from '../staging-studio-composition/cleanup.mjs';
import { configuration } from './fixture.mjs';
import { groups } from './cases.mjs';
import { controls } from './controls.mjs';
import { ReachedMismatch,completion } from './oracles.mjs';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),sha=b=>createHash('sha256').update(b).digest('hex');
const must=(v,m)=>{if(!v)throw new HarnessError(m);};
const command=(bin,args)=>{const r=spawnSync(bin,args,{cwd:root,encoding:'utf8',timeout:5000});must(!r.error&&!r.signal&&r.status===0,'Static source/runtime binding unavailable.');return r.stdout.trim();};
let output,group,results=[];
try {
  must(process.argv.length===3&&/^[0-5]$/.test(process.argv[2]),'Use one exact timing group0–5.');const index=+process.argv[2];
  for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS'])must(process.env[key]===undefined,'Undeclared environment '+key);
  const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),declared=config.checks[index];group=index===5?{...declared,run:controls}:groups[index];
  must(group.name===declared.name&&JSON.stringify(group.assertions)===JSON.stringify(declared.assertions),'Executed check differs from declaration.');
  const schema=process.env.VERIFY_RESULT_JSON!==undefined,phase=schema?process.env.VERIFY_TREE:'direct',runId=schema?process.env.VERIFY_RUN_ID:'direct';
  if(schema){must(['base','candidate'].includes(phase)&&/^[a-f0-9]{32}$/.test(runId||'')&&resolve(process.env.VERIFY_RESULT_JSON)===process.env.VERIFY_RESULT_JSON,'Invalid schema2 invocation.');try{await lstat(process.env.VERIFY_RESULT_JSON);throw new HarnessError('Preexisting result refused.');}catch(e){must(e.code==='ENOENT','Result path must be fresh.');}}
  must(command(node24,['--version'])==='v24.4.1','Literal Node24 required.');
  const binding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url),'utf8'));must(binding.freezeReady===true&&/^[a-f0-9]{40}$/.test(binding.selectedProductBase||''),'DRAFT_UNFROZEN: root must rebind accepted Studio/ASSETS/product/helper bytes and obtain independent executable review before any run.');
  must(sha(await readFile(node24))===binding.literalNode.sha256,'Literal Node bytes differ from reviewed binding.');
  const kernelRoot=resolve(binding.externalKernel.path,'..');for(const [p,digest]of Object.entries(binding.externalKernel.sha256))must(sha(await readFile(join(kernelRoot,p)))===digest,'External trust anchor differs from reviewed binding.');
  const map=async(paths,optional=false)=>{const rows=[];for(const p of [...new Set(paths)].sort()){try{rows.push([p,sha(await readFile(join(root,p)))]);}catch(e){if(optional&&e.code==='ENOENT')rows.push([p,null]);else throw e;}}return Object.fromEntries(rows);};
  const sourceHashes=await map(config.sourcePaths,true),helperHashes=await map(config.helperPaths),commit=command('/usr/bin/git',['rev-parse','HEAD']);
  if(phase==='base')for(const [p,digest]of Object.entries(binding.baselineProductSHA256))must(sourceHashes[p]===digest,'Base bytes differ from reviewed binding: '+p);
  await mkdir('/tmp/bz-timing-evidence',{recursive:true});output=await mkdtemp('/tmp/bz-timing-evidence/'+phase+'-');const start={version:1,check:group.name,phase,runId,commit,sourceRoot:root,sourceHashes,helperHashes,output,startedMs:Date.now(),runtime:node24,runtimeSHA256:sha(await readFile(node24)),dependencies:await realpath(join(root,'node_modules')),binding};await writeFile(join(output,'START.json'),JSON.stringify(start,null,2)+'\n',{flag:'wx'});
  const captures=[];const capture=async(ui,label)=>{const path=join(output,label+'.png');await ui.page.screenshot({path,fullPage:false});captures.push({path,sha256:sha(await readFile(path))});};
  const record=async observation=>{let status='pass',detail='All targeted independent witnesses completed.';try{completion(observation);}catch(e){if(!(e instanceof ReachedMismatch))throw e;status='fail';detail=observation.reason||e.message;}const path=join(output,group.assertions[0]+'.json');await writeFile(path,JSON.stringify(observation,null,2)+'\n',{flag:'wx'});results.push({id:group.assertions[0],status,detail,observationPath:path,observationSHA256:sha(await readFile(path))});console.log('CASE_RESULT '+JSON.stringify(results[0]));};
  let observation,cleanup;
  const run=async f=>{try{return await group.run(f);}catch(e){if(!(e instanceof ReachedMismatch))throw e;return {completed:false,reason:e.message,reached:e.observation,steps:[{name:e.message,pass:false}]};}};
  if(index===5){observation=await run();cleanup={kind:'pure-controls',runtimeStarted:false};}
  else {const verified=await withVerifiedFixture(async f=>{f.capture=capture;await f.initialize();const schemaBefore=(await f.db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;const value=await run(f);const schemaAfter=(await f.db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;must(JSON.stringify(schemaBefore)===JSON.stringify(schemaAfter),'Timing introduced undeclared schema/columns.');return {value,browser:f.browserCleanup};},configuration);observation=verified.result.value;cleanup={services:verified.cleanup,browser:verified.result.browser};if(index===0)must(cleanup.browser?.allExited,'Owned native browser cleanup missing.');}
  await record(observation);must(results.length===1&&results[0].id===group.assertions[0],'Every declared assertion must be reached exactly once.');
  must(command('/usr/bin/git',['rev-parse','HEAD'])===commit&&JSON.stringify(await map(config.sourcePaths,true))===JSON.stringify(sourceHashes)&&JSON.stringify(await map(config.helperPaths))===JSON.stringify(helperHashes),'Source/evidence changed during run.');
  for(const [p,digest]of Object.entries(binding.externalKernel.sha256))must(sha(await readFile(join(kernelRoot,p)))===digest,'External trust anchor changed during run.');
  const exit=results.some(r=>r.status==='fail')?1:0,receipt={...start,endedMs:Date.now(),exit,classification:exit?'FINITE_REACHED_MISMATCH':'PASS',results,captures,verifiedCleanup:cleanup};await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(schema)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:group.name,phase,run_id:runId,assertions:results.map(({id,status,detail})=>({id,status,detail}))})+'\n',{flag:'wx'});console.log('TIMING_BOUND_RECEIPT '+JSON.stringify({path:join(output,'RUN_RECEIPT.json'),exit}));process.exitCode=exit;
}catch(error){const timeout=/timeout|timed out|deadline|did not complete|failed to respond|HTTP\s*5\d\d/i.test(error?.message||'')||['TimeoutError','AbortError'].includes(error?.name),exit=timeout?99:error instanceof ApplicationFailure?evidenceExit(error):99;const unreached=(group?.assertions||[]).filter(id=>!results.some(r=>r.id===id));if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({exit,classification:'INTERRUPTED_NO_TERMINAL_RESULT',reason:error.message,stack:error.stack,observation:error.observation,verifiedServiceCleanup:error.verifiedServiceCleanup,verifiedBrowserCleanup:error.verifiedBrowserCleanup,results,unreached,finalResultEmitted:false},null,2)+'\n').catch(()=>{});console.error('TIMING_INTERRUPTED '+String(error.stack||error)+(output?' output='+output:''));process.exitCode=exit;}
