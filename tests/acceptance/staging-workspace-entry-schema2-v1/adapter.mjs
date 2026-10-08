#!/usr/bin/env node
// Protected adapter: execute immutable graders, then validate complete observed evidence.
import {readFile,writeFile,mkdtemp,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateUI,validateSyntax,commandRows,protocolResult,strictJSON,InvalidEvidence} from './validate.mjs';
const started=Date.now(),root=resolve(process.env.VERIFY_ROOT||process.cwd());let output,c;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,why)=>{if(!ok)throw new InvalidEvidence(why);};
const digest=async path=>hash(await readFile(join(root,path)));
const command=(binary,args)=>{const p=spawnSync(binary,args,{cwd:root,encoding:'utf8',timeout:5000});need(!p.error&&!p.signal&&p.status===0,'binding/runtime command unavailable');return p.stdout.trim();};
const sourceMap=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
try{
 need(process.argv.length===3&&/^\d+$/.test(process.argv[2]),'exact adapter check index required');
 const config=strictJSON(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8'));c=config.checks[Number(process.argv[2])];need(c&&c.index===Number(process.argv[2]),'unknown check index');
 const phase=process.env.VERIFY_TREE,runId=process.env.VERIFY_RUN_ID,resultPath=process.env.VERIFY_RESULT_JSON;
 need(['base','candidate'].includes(phase)&&/^[a-f0-9]{32}$/.test(runId||'')&&resultPath&&resolve(resultPath)===resultPath,'schema2 environment binding required');
 try{await lstat(resultPath);throw new InvalidEvidence('preexisting/stale terminal result refused');}catch(e){if(e.code!=='ENOENT')throw e;}
 need(command(c.argv[0],['--version'])==='v24.4.1','exact Node24 runtime required');
 const commit=command('/usr/bin/git',['rev-parse','HEAD']);
 const chainHashes=await sourceMap(c.chain);
 const evidenceRoot='/Users/jryear/.codex/evidence/bidzizi004-schema2-v1';
 await mkdir(evidenceRoot,{recursive:true});const rootStat=await lstat(evidenceRoot);need(rootStat.isDirectory()&&!rootStat.isSymbolicLink(),'evidence root must be a regular directory');
 output=await mkdtemp(join(evidenceRoot,phase+'-'+runId+'-'));
 const envelope={version:1,check:c.name,checkIndex:c.index,phase,runId,startedAt:new Date(started).toISOString(),sourceCommit:commit,sourceRoot:root,outputPath:output,runtime:c.argv[0],runtimeSHA256:hash(await readFile(c.argv[0])),externalDependencies:await realpath(join(root,'node_modules')),chainHashes};
 await writeFile(join(output,'START.json'),JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
 let context={commit,phase,runId,runtime:c.argv[0]},sourcePaths;
 if(c.category==='ui'){
  const native='tests/acceptance/staging-workspace-entry/';
  const planText=await readFile(join(root,native,'CASE_PLAN.json'));context.plan=strictJSON(planText.toString());context.planHash=hash(planText);
  const binding=strictJSON(await readFile(join(root,native,'SOURCE_BINDING.json'),'utf8'));sourcePaths=Object.keys(binding.sha256);context.sourceHashes=await sourceMap(sourcePaths);
  const evidenceNames=['CASE_PLAN.json','SOURCE_BINDING.json','run.mjs','checks.mjs','browser.mjs','fixtures.mjs','protocol.mjs','harness.mjs','syntax.mjs','seed-people.sql'];
  context.evidenceHashes=Object.fromEntries(await Promise.all(evidenceNames.map(async n=>[n,await digest(native+n)])));
 }else if(c.category==='syntax'){
  context.sourcePath=join(root,'public/staging-admin/studio.js');context.sourceHash=hash(await readFile(context.sourcePath));context.syntaxHash=await digest('tests/acceptance/staging-workspace-entry/syntax.mjs');
 }
 const argv=[...c.argv.slice(1)];if(['ui','syntax'].includes(c.category))argv.push('--output',output);
 // Keep original runner within its unchanged outer deadline; adapter uses the same contract timeout.
 const childEnv={...process.env};delete childEnv.VERIFY_RESULT_JSON;delete childEnv.VERIFY_RUN_ID;
 const before=Date.now();const child=spawnSync(c.argv[0],argv,{cwd:root,env:childEnv,encoding:'utf8',timeout:c.timeout*1000,maxBuffer:32*1024*1024});
 const ended=Date.now();context={...context,elapsedMs:ended-before,exit:child.status,stdout:child.stdout||'',stderr:child.stderr||'',receiptPath:join(output,'RUN_RECEIPT.json')};
 await writeFile(join(output,'stdout.txt'),context.stdout,{flag:'wx'});await writeFile(join(output,'stderr.txt'),context.stderr,{flag:'wx'});
 need(!child.error&&!child.signal&&[0,1].includes(child.status),'runner setup/deadline/reserved exit');
 need(commit===command('/usr/bin/git',['rev-parse','HEAD']),'source revision changed during execution');
 need(JSON.stringify(chainHashes)===JSON.stringify(await sourceMap(c.chain)),'declared immutable execution chain changed');
 let rows;
 if(['ui','syntax'].includes(c.category)){
  const stat=await lstat(context.receiptPath);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.mtimeMs>=before-1000&&stat.mtimeMs<=ended+1000,'native receipt stale/nonregular');
  const receipt=strictJSON(await readFile(context.receiptPath,'utf8'));
  if(c.category==='ui'){
   need(JSON.stringify(context.sourceHashes)===JSON.stringify(await sourceMap(sourcePaths)),'UI source changed during execution');
   rows=validateUI(receipt,c,context);
  }else{
   need(context.sourceHash===hash(await readFile(context.sourcePath)),'syntax source changed during execution');rows=validateSyntax(receipt,c,context);
  }
 }else rows=commandRows(c,context);
 const result=protocolResult(c,context,rows);
 const end={...envelope,endedAt:new Date(ended).toISOString(),durationMs:ended-started,exit:child.status,assertionIds:rows.map(x=>x.id),nativeReceipt:['ui','syntax'].includes(c.category)?context.receiptPath:null,assertionStatuses:rows.map(x=>({id:x.id,status:x.status})),schema2ResultPath:resultPath};
 await writeFile(join(output,'END.json'),JSON.stringify(end,null,2)+'\n',{flag:'wx'});
 await writeFile(resultPath,JSON.stringify(result)+'\n',{flag:'wx'});
 console.log('SCHEMA2_BOUND_RECEIPT '+JSON.stringify({path:join(output,'END.json'),sha256:hash(await readFile(join(output,'END.json'))),runId,phase,check:c.name}));process.exitCode=child.status;
}catch(e){
 const failure={version:1,check:c?.name||null,startedAt:new Date(started).toISOString(),endedAt:new Date().toISOString(),classification:'HARNESS99',reason:String(e?.message||e),terminalResultEmitted:false};
 if(output)try{await writeFile(join(output,'FAILED.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx'});}catch{}
 console.error('HARNESS99 schema2 adapter: '+failure.reason+(output?' evidence='+output:''));process.exitCode=99;
}
