// Runnable ADMISSION closure: original runner protocol/cleanup retained; only imports,
// frozen-source binding and optional new candidate source hashes differ.
import { readFile,writeFile,mkdir,mkdtemp,lstat,realpath } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { node24,HarnessError,ApplicationFailure,evidenceExit } from '../staff-drafts/harness.mjs';
import { must } from '../staging-studio-composition/fixture.mjs';
import { configuration } from './entry.mjs';
import { groups } from './groups.mjs';
import { controls } from './controls.mjs';
import { ReachedMismatch } from '../staging-studio-composition/oracles.mjs';
import { withVerifiedFixture } from '../staging-studio-composition/cleanup.mjs';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex');
const command=(bin,args)=>{const r=spawnSync(bin,args,{cwd:root,encoding:'utf8',timeout:5000});must(!r.error&&!r.signal&&r.status===0,'Static source/runtime binding failed.');return r.stdout.trim();};
let output,activeGroup,results=[];
try {
  const index=process.argv[2];must(process.argv.length===3&&/^[0-3]$/.test(index),'Use one exact bounded group index0–3.');
  for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS'])must(process.env[key]===undefined,'Undeclared environment '+key);
  const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),
    group=+index===3?{...config.checks[3],run:controls}:groups[+index],declared=config.checks[+index];activeGroup=group;
  must(group.name===declared.name&&JSON.stringify(group.assertions)===JSON.stringify(declared.assertions),'Check declaration differs from executable group.');
  const schema=process.env.VERIFY_RESULT_JSON!==undefined,phase=schema?process.env.VERIFY_TREE:'direct',runId=schema?process.env.VERIFY_RUN_ID:'direct';
  if(schema){must(['base','candidate'].includes(phase)&&/^[a-f0-9]{32}$/.test(runId||'')&&resolve(process.env.VERIFY_RESULT_JSON)===process.env.VERIFY_RESULT_JSON,'Invalid schema2 invocation.');
    try{await lstat(process.env.VERIFY_RESULT_JSON);throw new HarnessError('Preexisting result refused.');}catch(e){must(e.code==='ENOENT','Result must be fresh.');}}
  must(command(node24,['--version'])==='v24.4.1','Literal installed Node24 is required.');
  const map=async(paths,source=false)=>Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>{
    try{return [p,hash(await readFile(join(root,p)))];}catch(error){if(source&&config.optionalSourcePaths.includes(p)&&error.code==='ENOENT')return [p,null];throw error;}
  })));
  const binding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url),'utf8')),
    sourceHashes=await map(config.sourcePaths,true),helperHashes=await map(config.helperPaths),commit=command('/usr/bin/git',['rev-parse','HEAD']);
  for(const [p,sha]of Object.entries(binding.inheritedEvidenceSHA256))must(helperHashes[p]===sha,'Frozen accepted Studio helper changed: '+p);
  if(phase==='base')for(const [p,sha]of Object.entries(binding.baselineStaffSHA256))must(sourceHashes[p]===sha,'Baseline staff source differs from accepted Studio d631; rebind and review before freeze: '+p);
  await mkdir('/tmp/bz-studio-admission-successor',{recursive:true});output=await mkdtemp('/tmp/bz-studio-admission-successor/'+phase+'-');
  const start={version:1,check:group.name,phase,runId,commit,sourceRoot:root,sourceHashes,helperHashes,output,startedMs:Date.now(),
    runtime:node24,runtimeSHA256:hash(await readFile(node24)),dependencies:await realpath(join(root,'node_modules')),proposedBaselineBinding:binding};
  await writeFile(join(output,'START.json'),JSON.stringify(start,null,2)+'\n',{flag:'wx'});
  const captures=[];
  const capture=async(ui,label)=>{const path=join(output,label+'.png');await ui.page.screenshot({path,fullPage:false});captures.push({path,sha256:hash(await readFile(path))});};
  const record=async(id,observation,validate,ui)=>{
    must(id===group.assertions[results.length],'Every declared assertion must be reached once in order.');let status='pass',detail='Captured observations satisfy the independent requirement.';
    try{validate(observation);}catch(e){if(!(e instanceof ReachedMismatch))throw e;status='fail';detail=e.message;}
    const path=join(output,id+'.json');await writeFile(path,JSON.stringify(observation,null,2)+'\n',{flag:'wx'});
    if(ui)await capture(ui,id);const row={id,status,detail,observationPath:path,observationSHA256:hash(await readFile(path))};results.push(row);console.log('CASE_RESULT '+JSON.stringify(row));
  };
  let verifiedCleanup;
  if(+index===3)verifiedCleanup={browser:await controls(null,record)};
  else {const result=await withVerifiedFixture(async f=>{f.capture=capture;await f.initialize();await group.run(f,record);return f.browserCleanup;},configuration);
    verifiedCleanup={services:result.cleanup,browser:result.result};}
  must(verifiedCleanup.browser?.allExited,'Owned browser cleanup witness is missing.');
  must(JSON.stringify(results.map(v=>v.id))===JSON.stringify(group.assertions),'Declared assertions were not all reached.');
  must(command('/usr/bin/git',['rev-parse','HEAD'])===commit&&JSON.stringify(await map(config.sourcePaths,true))===JSON.stringify(sourceHashes)&&
    JSON.stringify(await map(config.helperPaths))===JSON.stringify(helperHashes),'Source or relied-on evidence changed during execution.');
  const exit=results.some(v=>v.status==='fail')?1:0,receipt={...start,endedMs:Date.now(),exit,classification:exit?'FINITE_REACHED_MISMATCH':'PASS',results,captures,verifiedCleanup};
  await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  if(schema)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:group.name,phase,run_id:runId,assertions:results.map(({id,status,detail})=>({id,status,detail}))})+'\n',{flag:'wx'});
  console.log('STUDIO_BOUND_RECEIPT '+JSON.stringify({path:join(output,'RUN_RECEIPT.json'),exit}));process.exitCode=exit;
} catch(error) {
  // Required inherited product failure is99 on base and1 on candidate. Only
  // captured absent-feature oracles may prove base RED. External failures are99.
  const exit=error instanceof ApplicationFailure?evidenceExit(error):99,
    classification=error instanceof ApplicationFailure?'REACHED_PRODUCT_PREREQUISITE_FAILURE':'HARNESS99',
    unreached=(activeGroup?.assertions||[]).filter(id=>!results.some(row=>row.id===id));
  // Preserve only observations actually reached. No synthetic assertion row or
  // terminal protocol is emitted: the kernel must not accept an interrupted run.
  if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification,exit,reason:error.message,stack:error.stack,
    original:error.original,observation:error.observation,verifiedServiceCleanup:error.verifiedServiceCleanup,
    verifiedBrowserCleanup:error.verifiedBrowserCleanup,results,unreached,finalResultEmitted:false},null,2)+'\n').catch(()=>{});
  console.error(classification+' '+String(error.stack||error)+(output?' output='+output:''));process.exitCode=exit;
}
