#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, lstat, realpath, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { withFixture } from '../staging-workspace-entry/harness.mjs';
import { groups } from './checks.mjs';

const root=resolve(process.env.VERIFY_ROOT||process.cwd());
const hash=b=>createHash('sha256').update(b).digest('hex');
const need=(x,why)=>{if(!x)throw Error('HARNESS99 '+why);};
const command=(bin,args)=>{const r=spawnSync(bin,args,{cwd:root,encoding:'utf8',timeout:5000});need(!r.error&&!r.signal&&r.status===0,'source/runtime binding');return r.stdout.trim();};
export const classify=e=>e instanceof assert.AssertionError?1:99;
let output;
try {
 const index=process.argv[2];need(process.argv.length===3&&/^[0-4]$/.test(index||''),'exact bounded group index0–4');
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS'])need(process.env[key]===undefined,'undeclared environment '+key);
 const schema=process.env.VERIFY_RESULT_JSON!==undefined,phase=schema?process.env.VERIFY_TREE:'direct',runId=schema?process.env.VERIFY_RUN_ID:'direct';
 if(schema){need(['base','candidate'].includes(phase)&&/^[a-f0-9]{32}$/.test(runId||'')&&resolve(process.env.VERIFY_RESULT_JSON)===process.env.VERIFY_RESULT_JSON,'schema2 invocation');try{await lstat(process.env.VERIFY_RESULT_JSON);throw Error('Preexisting result refused');}catch(e){need(e.code==='ENOENT','fresh schema2 result');}}
 const config=JSON.parse(await readFile(new URL('./CASE_PLAN.json',import.meta.url),'utf8'));
 const binding=JSON.parse(await readFile(new URL('./source-binding.json',import.meta.url),'utf8'));
 const inherited=JSON.parse(await readFile(new URL('./INHERITED.json',import.meta.url),'utf8'));
 const group=+index===4?{name:'Inherited accepted source and exact59 assertion bindings remain unchanged',ids:['DR_INHERITED_BINDING']}:groups[+index];
 need(group.name===config.groups[+index].name&&JSON.stringify(group.ids)===JSON.stringify(config.groups[+index].assertions),'declared bounded group');
 const runtime='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';need(command(runtime,['--version'])==='v24.4.1','exact Node24 runtime');
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/display-private-'+phase+'-');
 const map=async(paths,optional=false)=>Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>{try{return [path,hash(await readFile(join(root,path)))];}catch(e){if(optional&&e.code==='ENOENT')return [path,null];throw e;}})));
 const sourceHashes=await map(config.applicationPaths,true),helperHashes=await map(config.helperPaths),commit=command('/usr/bin/git',['rev-parse','HEAD']);
 const start={protocol:1,name:group.name,phase,runId,commit,sourceRoot:root,sourceHashes,helperHashes,startedMs:Date.now(),output,runtime,runtimeSHA256:hash(await readFile(runtime)),dependencies:await realpath(join(root,'node_modules')),aggregateGate:false,ownerAcceptance:false};
 await writeFile(join(output,'START.json'),JSON.stringify(start,null,2)+'\n',{flag:'wx'});
 const results=[];
 const record=async(id,observation,validate,page)=>{
  need(id===group.ids[results.length],'ordered unique complete assertion protocol');
  const before=Date.now();let status='pass',detail='Reached actual browser/API/SQL observation agrees with the bounded requirement';
  try{validate(observation);}catch(e){if(classify(e)!==1)throw e;status='fail';detail=e.message;}
  const path=join(output,id+'.json');await writeFile(path,JSON.stringify(observation,null,2)+'\n',{flag:'wx'});
  if(page)await page.screenshot({path:join(output,id+'.png'),fullPage:true});
  const row={id,status,detail,observationPath:path,observationSHA256:hash(await readFile(path)),durationMs:Date.now()-before};results.push(row);console.log('CASE_RESULT '+JSON.stringify(row));
 };
 if(+index===4){
  const actual=await map(Object.keys(binding.inheritedSHA256));
  await record('DR_INHERITED_BINDING',{acceptedApplication:binding.acceptedApplication,acceptedContract:binding.acceptedContract,docsHead:binding.docsHead,expected:binding.inheritedSHA256,actual,assertionIds:inherited.assertionIds,groups:inherited.groups,fullExecutionRequiredByParent:true,executedHistoricalBodies:false},v=>{
   assert.deepEqual(v.actual,v.expected,'No historical source/helper weakening');assert.equal(v.groups.length,24);assert.equal(v.assertionIds.length,59);assert.equal(new Set(v.assertionIds).size,59);assert.ok(v.groups.every(g=>g.argv.length>0&&g.timeout>0));
  });
 }else{
  const timer=setTimeout(()=>process.emit('SIGTERM'),config.groups[+index].timeout*1000-2000);timer.unref();
  try{await withFixture(async f=>{f.evidenceOutput=output;await group.run(f,record);});}finally{clearTimeout(timer);}
 }
 need(JSON.stringify(results.map(r=>r.id))===JSON.stringify(group.ids),'every declared assertion reached');
 need(command('/usr/bin/git',['rev-parse','HEAD'])===commit&&JSON.stringify(await map(config.applicationPaths,true))===JSON.stringify(sourceHashes)&&JSON.stringify(await map(config.helperPaths))===JSON.stringify(helperHashes),'unchanged application and evidence during observation');
 const exit=results.some(r=>r.status==='fail')?1:0;
 const files=(await readdir(output)).filter(p=>p.endsWith('.png'));const captures=await Promise.all(files.map(async p=>({path:join(output,p),sha256:hash(await readFile(join(output,p)))})));
 const receipt={...start,endedMs:Date.now(),exit,classification:exit===1?'FINITE_REACHED_MISMATCH':'BOUNDED_PASS',results,captures,limitations:['Bounded private slice only; parent must execute all24 historical groups/59 assertion IDs.','No full-gate GREEN, deployment, public TV authorization, owner acceptance or physical projector/mobile keyboard claim.','Controlled browser time/visibility is identified in observations; server payload clocks come from actual disposable PostgreSQL.']};
 const path=join(output,'RUN_RECEIPT.json');await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(schema)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:group.name,phase,run_id:runId,assertions:results.map(({id,status,detail})=>({id,status,detail}))})+'\n',{flag:'wx'});
 console.log('DISPLAY_PRIVATE_BOUND_RECEIPT '+JSON.stringify({path,sha256:hash(await readFile(path)),exit,aggregateGate:false}));process.exitCode=exit;
} catch(e) {
 if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:e.message,stack:e.stack,output,finalResultEmitted:false},null,2)+'\n').catch(()=>{});
 console.error('HARNESS99 '+String(e?.stack||e)+(output?' output='+output:''));process.exitCode=99;
}
