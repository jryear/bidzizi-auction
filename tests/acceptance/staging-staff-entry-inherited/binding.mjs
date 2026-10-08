import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {observeSource} from './source-observe.mjs';
import {validateSource} from './source-oracle.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),root=resolve(process.env.VERIFY_ROOT||process.cwd());
const groups=JSON.parse(await readFile(new URL('./GROUPS.json',import.meta.url))),binding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url))),manifest=JSON.parse(await readFile(new URL('./HISTORICAL_MANIFEST.json',import.meta.url)));
let output;
try{
 if(process.argv.length!==3||process.argv[2]!=='4')throw Error('Exact inherited binding group4 invocation');
 const phase=process.env.VERIFY_TREE,runId=process.env.VERIFY_RUN_ID,path=process.env.VERIFY_RESULT_JSON;
 if(!['base','candidate'].includes(phase)||!/^[a-f0-9]{32}$/.test(runId||'')||resolve(path||'.')!==path)throw Error('Exact schema2 invocation required');
 try{await lstat(path);throw Error('Preexisting result refused');}catch(e){if(e.code!=='ENOENT')throw e;}
 const git=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000});if(git.error||git.status!==0)throw Error('Actual source commit unavailable');
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/staff-entry-inherited-binding-');
 const observation=await observeSource(root,binding,manifest);let status='pass',detail='Exact current immutable application, unchanged009 identity boundary and historical evidence bytes';
 try{validateSource(observation,binding,manifest,groups);}catch(error){if(!(error instanceof assert.AssertionError))throw error;status='fail';detail='Reached source binding mismatch: '+error.message;}
 assert.deepEqual(await observeSource(root,binding,manifest),observation,'Source/evidence unchanged during binding');
 const g=groups.groups[31],rows=[{id:'DR_INHERITED_BINDING',status,detail}],exit=status==='pass'?0:1;
 const op=join(output,'OBSERVATION.json');await writeFile(op,JSON.stringify(observation,null,2)+'\n',{flag:'wx'});
 const receipt={commit:git.stdout.trim(),phase,runId,group:g.name,output,observedCurrentBytes:true,old198MetadataPreserved:true,bodyExecutionHere:false,all31OtherGroupsRequired:true,exit,results:rows,observation:{path:op,sha256:sha(await readFile(op))}};
 await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 await writeFile(path,JSON.stringify({protocol:1,check:g.name,phase,run_id:runId,assertions:rows})+'\n',{flag:'wx'});console.log('INHERITED_CURRENT_BINDING_RECEIPT '+join(output,'RUN_RECEIPT.json'));process.exitCode=exit;
}catch(error){if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:error.message,terminalResult:false},null,2)+'\n',{flag:'wx'});console.error('HARNESS99 '+error.message);process.exitCode=99;}
