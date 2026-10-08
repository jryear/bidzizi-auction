// One bounded historic group; root owns the sole runtime slot and invocation.
import {readFile,writeFile,mkdir,mkdtemp,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {observeSource} from './source-observe.mjs';
import {validateSource} from './source-oracle.mjs';
import {inspectLifecycle,recoverLifecycle} from './lifecycle.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),root=resolve(process.env.VERIFY_ROOT||process.cwd()),startedMs=Date.now();
const groups=JSON.parse(await readFile(new URL('./GROUPS.json',import.meta.url))),binding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url))),manifest=JSON.parse(await readFile(new URL('./HISTORICAL_MANIFEST.json',import.meta.url)));
let output,child,launcherBirth,interrupted=false,timer,registryDirectory;
const command=args=>spawnSync('/usr/bin/git',args,{cwd:root,encoding:'utf8',timeout:5000});
const birth=pid=>{const r=spawnSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:5000,env:{...process.env,TZ:'UTC',LC_ALL:'C'}});return !r.error&&r.status===0?r.stdout.trim():null;};
async function stopLauncher(){if(child&&child.exitCode===null){
 if(!launcherBirth||birth(child.pid)!==launcherBirth)throw Error('HARNESS99 launcher identity changed; preserve');process.kill(-child.pid,'SIGTERM');
 const end=Date.now()+5000;while(child.exitCode===null&&Date.now()<end)await new Promise(done=>setTimeout(done,50));
 if(child.exitCode===null){if(birth(child.pid)!==launcherBirth)throw Error('HARNESS99 launcher identity changed before force stop; preserve');process.kill(-child.pid,'SIGKILL');}
}}
const signal=()=>{interrupted=true;void stopLauncher().catch(()=>{});};
try{
 const index=Number(process.argv[2]);if(process.argv.length!==3||!Number.isInteger(index)||index<0||index>31)throw Error('Exact bounded group index0–31');const g=groups.groups[index];
 if(!binding.acceptedEntry)throw Error('Actual accepted Entry36 source must be rebound before inherited execution');
 if(binding.entrySuccessorExecutionHold!==false)throw Error('Root-supplied exact reviewed successor freeze/task is pending; inherited execution held');
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS','BZ_INHERITED_PROCESS_REGISTRY_DIR'])if(process.env[key]!==undefined)throw Error('Undeclared inherited environment '+key);
 const phase=process.env.VERIFY_TREE,runId=process.env.VERIFY_RUN_ID,resultPath=process.env.VERIFY_RESULT_JSON;
 if(!['base','candidate'].includes(phase)||!/^[a-f0-9]{32}$/.test(runId||'')||resolve(resultPath||'.')!==resultPath)throw Error('Exact schema2 invocation required');
 try{await lstat(resultPath);throw Error('Preexisting result refused');}catch(error){if(error.code!=='ENOENT')throw error;}
 const git=command(['rev-parse','HEAD']);if(git.error||git.status!==0)throw Error('Actual source commit unavailable');
 const before=await observeSource(root,binding,manifest);validateSource(before,binding,manifest,groups);
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/staff-entry-inherited-');registryDirectory=join(output,'PROCESS_REGISTRY');await mkdir(registryDirectory,{mode:0o700});
 const privateResult=join(output,'ORIGINAL_RESULT.json'),argv=index===31?[g.argv[0],join(root,'tests/acceptance/staging-staff-entry-inherited/binding.mjs'),'4']:g.argv;
 const effective=index===31?argv:[argv[0],'--import',join(root,'tests/acceptance/staging-staff-entry-inherited/loader.mjs'),...argv.slice(1)];
 await writeFile(join(output,'START.json'),JSON.stringify({commit:git.stdout.trim(),phase,runId,index,group:g.name,startedMs,originalArgv:g.argv,effectiveArgv:effective,deadlineSeconds:g.timeout,sourceBefore:before,output},null,2)+'\n',{flag:'wx'});
 const env={...process.env,VERIFY_RESULT_JSON:privateResult,BZ_INHERITED_PROCESS_REGISTRY_DIR:registryDirectory};
 if(index===31)delete env.BZ_INHERITED_PROCESS_REGISTRY_DIR;
 child=spawn(effective[0],effective.slice(1),{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});launcherBirth=birth(child.pid);if(!launcherBirth)throw Error('Launcher birth unavailable; no signal authorized');
 await writeFile(join(output,'LAUNCHER.json'),JSON.stringify({pid:child.pid,birth:launcherBirth,detached:true},null,2)+'\n',{flag:'wx'});
 process.on('SIGTERM',signal);process.on('SIGINT',signal);
 let stdout='',stderr='',oversize=false;const limit=64*1024*1024;
 child.stdout.on('data',d=>{stdout+=d;if(Buffer.byteLength(stdout)>limit){oversize=true;void stopLauncher().catch(()=>{});}});child.stderr.on('data',d=>{stderr+=d;if(Buffer.byteLength(stderr)>limit){oversize=true;void stopLauncher().catch(()=>{});}});
 // The original hard deadline includes teardown. Reserve15 seconds for the
 // existing5-second normal stop and exact owned recovery; a reserve hit is99.
 // All historical body/clock/deadline values remain untouched.
 timer=setTimeout(()=>{interrupted=true;void stopLauncher().catch(()=>{});},Math.max(1,g.timeout*1000-(Date.now()-startedMs)-15000));
 const exit=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>done({code,signal}));});clearTimeout(timer);
 await writeFile(join(output,'stdout.txt'),stdout,{flag:'wx'});await writeFile(join(output,'stderr.txt'),stderr,{flag:'wx'});
 let cleanup=await inspectLifecycle(registryDirectory);
 if(!cleanup.allExited||!cleanup.allPortsClosed){const recovery=await recoverLifecycle(registryDirectory);cleanup={...cleanup,recovery};throw Error('Original group cleanup incomplete; exact owned recovery recorded, no terminal assertions');}
 if(interrupted||oversize||exit.signal||![0,1].includes(exit.code)||cleanup.violations.length)throw Error('Original group cancellation/deadline/infrastructure/owned cleanup99');
 const result=JSON.parse(await readFile(privateResult,'utf8'));
 assert.deepEqual(Object.keys(result).sort(),['protocol','check','phase','run_id','assertions'].sort());assert.equal(result.protocol,1);assert.equal(result.check,g.name);assert.equal(result.phase,phase);assert.equal(result.run_id,runId);
 assert.deepEqual(result.assertions.map(r=>r.id).sort(),g.assertions.slice().sort());assert.equal(new Set(result.assertions.map(r=>r.id)).size,g.assertions.length);assert.ok(result.assertions.every(r=>['pass','fail'].includes(r.status)&&typeof r.detail==='string'));
 assert.equal(exit.code,result.assertions.some(r=>r.status==='fail')?1:0);
 const after=await observeSource(root,binding,manifest);assert.deepEqual(after,before);assert.equal(command(['rev-parse','HEAD']).stdout.trim(),git.stdout.trim());
 const receipt={commit:git.stdout.trim(),phase,runId,index,group:g.name,startedMs,endedMs:Date.now(),originalArgv:g.argv,effectiveArgv:effective,deadlineSeconds:g.timeout,actualExit:exit.code,originalResult:{path:privateResult,sha256:sha(await readFile(privateResult))},results:result.assertions,cleanup,observationsNormalized:false,sourceAfter:after};
 await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});await writeFile(resultPath,JSON.stringify(result)+'\n',{flag:'wx'});console.log('STAFF_ENTRY_INHERITED_RECEIPT '+join(output,'RUN_RECEIPT.json'));process.exitCode=exit.code;
}catch(error){
 clearTimeout(timer);try{await stopLauncher();}catch{}
 if(registryDirectory){try{const check=await inspectLifecycle(registryDirectory);if(!check.allExited)await recoverLifecycle(registryDirectory);}catch{}}
 if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:error.message,output,terminalResult:false},null,2)+'\n',{flag:'wx'});console.error('HARNESS99 '+error.message);process.exitCode=99;
}finally{process.off('SIGTERM',signal);process.off('SIGINT',signal);}
