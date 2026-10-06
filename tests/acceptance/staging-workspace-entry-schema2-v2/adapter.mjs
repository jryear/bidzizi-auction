#!/usr/bin/env node
// V2 alone owns final handshake. Every v1 invocation writes a fresh PRIVATE result.
import {readFile,writeFile,mkdir,mkdtemp,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {strictJSON} from '../staging-workspace-entry-schema2-v1/validate.mjs';
import {need,privateResult,supplemental,compose,pngSize} from './validate.mjs';
const startedMs=Date.now(),root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex');let output,timer;
const map=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(join(root,p)))])));
const revision=()=>{const r=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000});need(!r.error&&r.status===0,'source revision unavailable');return r.stdout.trim();};
try{
 need(process.argv.length===3&&/^\d+$/.test(process.argv[2]),'exact check index required');const config=strictJSON(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),c=config.checks[Number(process.argv[2])];need(c&&c.index===Number(process.argv[2]),'unknown check');
 const phase=process.env.VERIFY_TREE,runId=process.env.VERIFY_RUN_ID,resultPath=process.env.VERIFY_RESULT_JSON;
 need(['base','candidate'].includes(phase)&&/^[a-f0-9]{32}$/.test(runId||'')&&resultPath&&resolve(resultPath)===resultPath,'schema2 environment required');
 try{await lstat(resultPath);throw Error('preexisting final result');}catch(e){if(e.code!=='ENOENT')throw e;}
 const evidenceRoot='/Users/jryear/.codex/evidence/bidzizi004-schema2-v2';await mkdir(evidenceRoot,{recursive:true});need(!(await lstat(evidenceRoot)).isSymbolicLink(),'evidence root symlink');output=await mkdtemp(join(evidenceRoot,phase+'-'+runId+'-'));
 const privatePath=join(output,'V1_PRIVATE_RESULT.json');need(privatePath!==resultPath,'private path cannot equal kernel final');
 const commit=revision(),helperHashes=await map(c.chain),bindingFile=strictJSON(await readFile(join(root,'tests/acceptance/staging-workspace-entry/SOURCE_BINDING.json'),'utf8')),sourcePaths=Object.keys(bindingFile.sha256),sourceHashes=await map(sourcePaths);
 const binding={check:c.name,phase,runId,commit,sourceHashes,helperHashes,startedMs,output,privatePath,finalPath:resultPath};await writeFile(join(output,'START.json'),JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
 // The original timeout is the total budget, including original acceptance plus supplement.
 timer=setTimeout(()=>{console.error('HARNESS99 v2 total original-check deadline evidence='+output);process.exit(99);},Math.max(1,c.timeout*1000-(Date.now()-startedMs)-500));
 const child=spawnSync(c.argv[0],['tests/acceptance/staging-workspace-entry-schema2-v1/adapter.mjs',String(c.index)],{cwd:root,env:{...process.env,VERIFY_RESULT_JSON:privatePath},encoding:'utf8',timeout:Math.max(1,c.timeout*1000-(Date.now()-startedMs)-1000),maxBuffer:32*1024*1024});
 await writeFile(join(output,'V1.stdout.txt'),child.stdout||'',{flag:'wx'});await writeFile(join(output,'V1.stderr.txt'),child.stderr||'',{flag:'wx'});need(!child.error&&!child.signal&&[0,1].includes(child.status),'delegated v1 setup/runtime/deadline99');
 const stat=await lstat(privatePath);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.mtimeMs>=startedMs-1000,'private v1 receipt freshness');
 const original=strictJSON(await readFile(privatePath,'utf8'));let rows=privateResult(original,c,binding,child.status);
 const references=(child.stdout||'').split('\n').filter(x=>x.startsWith('SCHEMA2_BOUND_RECEIPT '));need(references.length===1,'missing/duplicate delegated artifact binding');const delegated=strictJSON(references[0].slice('SCHEMA2_BOUND_RECEIPT '.length));need(delegated.runId===runId&&delegated.phase===phase&&delegated.check===c.name&&delegated.sha256===hash(await readFile(delegated.path)),'delegated artifact hash/invocation mismatch');
 let supplementReceipt=null;
 if(c.index===0){
  const plan=strictJSON(await readFile(new URL('./SCENES.json',import.meta.url),'utf8'));const {probe}=await import('./supplement.mjs');await probe(output,plan,binding);const receiptPath=join(output,'SUPPLEMENT_RECEIPT.json'),receiptStat=await lstat(receiptPath);need(receiptStat.isFile()&&!receiptStat.isSymbolicLink()&&receiptStat.mtimeMs>=startedMs-1000,'supplement persisted receipt freshness');supplementReceipt=strictJSON(await readFile(receiptPath,'utf8'));
  for(const scene of supplementReceipt.scenes||[]){need(scene.png?.path===join(output,scene.id+'.png'),'supplement screenshot outside owned allocation');const info=await lstat(scene.png.path);need(info.isFile()&&!info.isSymbolicLink()&&info.mtimeMs>=startedMs-1000,'supplement screenshot freshness');const bytes=await readFile(scene.png.path);need(hash(bytes)===scene.png.sha256&&JSON.stringify(pngSize(bytes))===JSON.stringify(scene.png.dimensions),'persisted screenshot bytes/dimensions mismatch');}
  rows=compose(rows,supplemental(supplementReceipt,plan,{...binding,endedMs:Date.now()}));
 }
 need(revision()===commit&&JSON.stringify(helperHashes)===JSON.stringify(await map(c.chain))&&JSON.stringify(sourceHashes)===JSON.stringify(await map(sourcePaths)),'source/helper changed during composite check');
 const exit=rows.some(x=>x.status==='fail')?1:0,result={protocol:1,check:c.name,phase,run_id:runId,assertions:rows};privateResult(result,c,binding,exit);
 const end={...binding,endedMs:Date.now(),exit,delegatedV1Receipt:delegated,privateV1ResultSHA256:hash(await readFile(privatePath)),supplementReceipt:supplementReceipt?join(output,'SUPPLEMENT_RECEIPT.json'):null,supplementSHA256:supplementReceipt?hash(await readFile(join(output,'SUPPLEMENT_RECEIPT.json'))):null,assertions:rows};await writeFile(join(output,'END.json'),JSON.stringify(end,null,2)+'\n',{flag:'wx'});
 await writeFile(resultPath,JSON.stringify(result)+'\n',{flag:'wx'});clearTimeout(timer);console.log('SCHEMA2_V2_BOUND_RECEIPT '+JSON.stringify({path:join(output,'END.json'),sha256:hash(await readFile(join(output,'END.json'))),runId,phase,check:c.name}));process.exitCode=exit;
}catch(e){clearTimeout(timer);const fail={classification:'HARNESS99',reason:String(e?.message||e),startedMs,endedMs:Date.now(),finalResultEmitted:false};if(output)try{await writeFile(join(output,'FAILED.json'),JSON.stringify(fail,null,2)+'\n',{flag:'wx'});}catch{}console.error('HARNESS99 v2: '+fail.reason+(output?' evidence='+output:''));process.exitCode=99;}
