// Narrow explicit source selection. Entry acceptance itself does not use this
// helper. Historical checks retain their exact phase, run token, argv and body.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,lstat,realpath,symlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha,identity,validateOwnership,observeApplication,validateApplication,observeSelected} from '../staging-staff-entry-inherited-selection-v1/source-guard.mjs';
import {ownedGit,birth,live,validateBirth} from '../staging-staff-entry-inherited-selection-v1/owned-git.mjs';
import {registerHooks} from 'node:module';
import {readFileSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const adapterURL=new URL('./loader.mjs',import.meta.url),ownedURL=new URL('./owned-processes.mjs',import.meta.url);
const delta=JSON.parse(readFileSync(new URL('./DELTAS.json',import.meta.url))).records[0];
const hook=registerHooks({load(url,context,next){const r=next(url,context);if(!new URL(url).pathname.endsWith('/'+delta.path))return r;let s=String(r.source);assert.equal(sha(Buffer.from(s)),delta.diskSHA256);for(const step of delta.steps){assert.equal(s.split(step.before).length-1,step.count);s=s.replaceAll(step.before,step.after);}assert.equal(sha(Buffer.from(s)),delta.executedSHA256);return {...r,source:s};}});
const startedMs=Date.now(),originalArgv=process.argv.slice(),originalCwd=process.cwd(),originalRoot=process.env.VERIFY_ROOT,originalResult=process.env.VERIFY_RESULT_JSON;
const selectionURL=new URL('../staging-staff-entry-inherited-selection-v1/SELECTION.json',import.meta.url),originalLog=console.log;
let output,selectedRoot,owned,deadline,timer,repeat,interrupted=false,signalError,delegated=false,snapshotCreated=false,snapshotRemovalAttempted=false,snapshotRemoved=false;
const signal=()=>{interrupted=true;if(owned)void owned.stop().catch(error=>{signalError=error.message;});};
process.on('SIGTERM',signal);process.on('SIGINT',signal);
try{
 const selectionBytes=await readFile(selectionURL),selection=JSON.parse(selectionBytes),actualRoot=await realpath(resolve(originalRoot||originalCwd));
 const index=Number(process.argv[2]);assert.equal(process.argv.length,3);assert.ok(Number.isInteger(index)&&index>=0&&index<32,'Exact original inherited index');
 const groups=JSON.parse(await readFile(join(actualRoot,selection.inheritedGroupsPath))),g=groups.groups[index];
 assert.equal(process.execPath,g.argv[0],'Literal Node24 runtime');
 const phase=process.env.VERIFY_TREE,runId=process.env.VERIFY_RUN_ID;
 assert.ok(['base','candidate'].includes(phase)&&/^[a-f0-9]{32}$/.test(runId||''),'Exact schema2 phase/run token');
 assert.ok(originalResult&&resolve(originalResult)===originalResult,'Exact original result path');
 try{await lstat(originalResult);throw Error('Preexisting verifier result refused');}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS','BZ_INHERITED_PROCESS_REGISTRY_DIR','BZ_RECOVERY_LOADER','BZ_RECOVERY_OWNED'])assert.equal(process.env[key],undefined,'Undeclared inherited environment '+key);
 deadline=startedMs+g.timeout*1000;assert.equal(selection.cleanupReserveMilliseconds,15000);owned=ownedGit(deadline);
 timer=setTimeout(()=>{process.kill(process.pid,'SIGTERM');repeat=setInterval(()=>process.kill(process.pid,'SIGTERM'),100);},Math.max(1,deadline-Date.now()-15000));
 const expected=selection.actualKernelApplicationSHA256ByPhase[phase],actualBefore=await observeApplication(actualRoot,expected);validateApplication(actualBefore,expected);
 assert.equal(await realpath(join(actualRoot,'node_modules')),selection.externalDependencies.node_modules.canonicalTarget,'Declared kernel dependency target');
 assert.equal(await realpath(selection.selectedSource.gitObjectStore),selection.selectedSource.gitObjectStore,'Canonical declared local Git input');
 const gitStoreBefore=await identity(selection.selectedSource.gitObjectStore);
 const actualCommit=(await owned.git(['rev-parse','HEAD'],actualRoot)).trim(),actualTree=(await owned.git(['rev-parse','HEAD^{tree}'],actualRoot)).trim();
 await mkdir('/tmp/task-root',{recursive:true});const canonicalParent=await realpath('/tmp/task-root');
 output=await mkdtemp(join(canonicalParent,'staff-entry-selected-v1-'));selectedRoot=join(output,'SOURCE');await mkdir(selectedRoot,{mode:0o700});snapshotCreated=true;
 const owner={version:1,pid:process.pid,birth:birth(process.pid),output:await identity(output),source:await identity(selectedRoot),canonicalParent};assert.ok(owner.birth,'Owner birth required');
 const ownerBytes=Buffer.from(JSON.stringify(owner,null,2)+'\n');await writeFile(join(output,'OWNER.json'),ownerBytes,{flag:'wx'});
 await writeFile(join(output,'START.json'),JSON.stringify({version:1,index,group:g.name,phase,runId,startedMs,deadlineMs:deadline,originalTimeoutSeconds:g.timeout,cleanupReserveMilliseconds:15000,actualKernelSource:{root:actualRoot,commit:actualCommit,tree:actualTree,application:actualBefore},selectedExternalSource:{...selection.selectedSource,manifest:undefined,root:selectedRoot},declaredExternalInputs:{gitObjectStore:gitStoreBefore,node_modules:selection.externalDependencies.node_modules},kernelAssuresSelectedSource:false,observationsNormalized:false},null,2)+'\n',{flag:'wx'});
 await owned.git(['init','--quiet',selectedRoot],output);
 await owned.git(['fetch','--quiet','--depth=1','--no-tags','--no-recurse-submodules',selection.selectedSource.gitObjectStore,selection.selectedSource.commit],selectedRoot);
 await owned.git(['checkout','--quiet','--detach',selection.selectedSource.commit],selectedRoot);
 await symlink(selection.externalDependencies.node_modules.canonicalTarget,join(selectedRoot,'node_modules'),'dir');
 const before=await observeSelected(selectedRoot,selection,owned.git);
 for(const [path,hash] of Object.entries(selection.frozenPredecessor460SHA256))assert.equal(sha(await readFile(join(selectedRoot,path))),hash,'Exact predecessor '+path);
 await writeFile(join(output,'SELECTED_BEFORE.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});
 assert.ok(!interrupted&&Date.now()<deadline-15000,'Original remaining outer deadline before delegation');
 const privateResult=join(output,'UNCHANGED_RESULT.json'),markers={};
 console.log=(...args)=>{const value=args.length===1&&typeof args[0]==='string'?args[0]:'';for(const tag of ['STAFF_ENTRY_INHERITED_RECEIPT','INHERITED_PORTABILITY_RECEIPT'])if(value.startsWith(tag+' ')){assert.equal(markers[tag],undefined,'One original receipt');markers[tag]=value.slice(tag.length+1);}originalLog(...args);};
 process.chdir(selectedRoot);process.env.VERIFY_ROOT=selectedRoot;process.env.VERIFY_RESULT_JSON=privateResult;
 process.argv=[originalArgv[0],join(selectedRoot,selection.unchangedInheritedDelegate),String(index)];delegated=true;
 process.env.BZ_RECOVERY_LOADER=fileURLToPath(adapterURL);process.env.BZ_RECOVERY_OWNED=fileURLToPath(ownedURL);
 try{await import(pathToFileURL(join(selectedRoot,selection.unchangedInheritedDelegate)).href);}
 finally{delegated=false;clearInterval(repeat);console.log=originalLog;process.chdir(originalCwd);process.argv=originalArgv;if(originalRoot===undefined)delete process.env.VERIFY_ROOT;else process.env.VERIFY_ROOT=originalRoot;if(originalResult===undefined)delete process.env.VERIFY_RESULT_JSON;else process.env.VERIFY_RESULT_JSON=originalResult;}
 const originalExit=process.exitCode??0;assert.ok(!interrupted&&!signalError&&[0,1].includes(originalExit),'Unchanged delegate finite completion within outer deadline');
 const bytes=await readFile(privateResult),result=JSON.parse(bytes);
 assert.deepEqual(Object.keys(result).sort(),['protocol','check','phase','run_id','assertions'].sort());assert.equal(result.protocol,1);assert.equal(result.check,g.name);assert.equal(result.phase,phase);assert.equal(result.run_id,runId);
 assert.deepEqual(result.assertions.map(r=>r.id).sort(),g.assertions.slice().sort());assert.equal(new Set(result.assertions.map(r=>r.id)).size,g.assertions.length);assert.ok(result.assertions.every(r=>['pass','fail'].includes(r.status)&&typeof r.detail==='string'));assert.equal(originalExit,result.assertions.some(r=>r.status==='fail')?1:0);
 assert.ok(markers.STAFF_ENTRY_INHERITED_RECEIPT&&markers.INHERITED_PORTABILITY_RECEIPT,'Both unchanged cleanup/source receipts required');
 for(const path of Object.values(markers)){const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Original regular receipt');}
 const receiptPath=await realpath(markers.STAFF_ENTRY_INHERITED_RECEIPT),portablePath=await realpath(markers.INHERITED_PORTABILITY_RECEIPT);
 assert.ok(receiptPath.startsWith(join(canonicalParent,'staff-entry-inherited-'))&&receiptPath.endsWith('/RUN_RECEIPT.json'),'Original private cleanup receipt path');
 assert.ok(portablePath.startsWith(join(canonicalParent,'staff-entry-inherited-portable-'))&&portablePath.endsWith('/PORTABILITY_RECEIPT.json'),'Original private portability receipt path');
 const originalReceipt=JSON.parse(await readFile(receiptPath)),portableReceipt=JSON.parse(await readFile(portablePath));
 assert.equal(originalReceipt.commit,selection.selectedSource.commit);assert.equal(originalReceipt.phase,phase);assert.equal(originalReceipt.runId,runId);assert.equal(originalReceipt.index,index);assert.equal(originalReceipt.group,g.name);assert.equal(originalReceipt.deadlineSeconds,g.timeout);assert.equal(originalReceipt.actualExit,originalExit);
 assert.ok(originalReceipt.cleanup.allExited&&originalReceipt.cleanup.allPortsClosed&&originalReceipt.cleanup.violations.length===0,'Original cleanup proved');
 assert.equal(portableReceipt.index,index);assert.equal(portableReceipt.originalExit,originalExit);assert.equal(portableReceipt.forwardedResultSHA256,sha(bytes));assert.deepEqual(portableReceipt.before,portableReceipt.after);
 // Independently reprobe the original unchanged registry and detached launcher.
 const registry=join(receiptPath,'..','PROCESS_REGISTRY'),launcher=JSON.parse(await readFile(join(receiptPath,'..','LAUNCHER.json')));
 validateBirth(launcher,birth(launcher.pid),live(launcher.pid));assert.equal(live(-launcher.pid),false,'Original detached launcher group gone');
 const {inspectLifecycle}=await import(pathToFileURL(join(selectedRoot,'tests/acceptance/staging-staff-entry-inherited/lifecycle.mjs')).href);
 const cleanup=await inspectLifecycle(registry);assert.ok(cleanup.allExited&&cleanup.allPortsClosed&&cleanup.violations.length===0,'Fresh original lifecycle and PG-port cleanup');
 const after=await observeSelected(selectedRoot,selection,owned.git);assert.deepEqual(after,before,'Full selected source/index/HEAD/modes/Git metadata unchanged');
 const actualAfter=await observeApplication(actualRoot,expected);validateApplication(actualAfter,expected);assert.deepEqual(actualAfter,actualBefore);
 assert.equal((await owned.git(['rev-parse','HEAD'],actualRoot)).trim(),actualCommit);assert.equal((await owned.git(['rev-parse','HEAD^{tree}'],actualRoot)).trim(),actualTree);
 assert.deepEqual(await identity(selection.selectedSource.gitObjectStore),gitStoreBefore,'Local Git external input identity unchanged');assert.equal(sha(await readFile(selectionURL)),sha(selectionBytes),'Selection binding unchanged');
 await writeFile(join(output,'SELECTED_AFTER.json'),JSON.stringify(after,null,2)+'\n',{flag:'wx'});await owned.assertGone();
 assert.ok(!interrupted&&!signalError&&Date.now()<deadline,'Original outer deadline includes all guard/cleanup');
 assert.equal(sha(await readFile(join(output,'OWNER.json'))),sha(ownerBytes),'Own marker exact');validateOwnership(await identity(output),owner.output,canonicalParent);validateOwnership(await identity(selectedRoot),owner.source,canonicalParent);assert.equal(birth(process.pid),owner.birth);
 // No force cleanup of an uncertain source, process identity, or unrelated tree.
 snapshotRemovalAttempted=true;await rm(selectedRoot,{recursive:true,force:false});try{await lstat(selectedRoot);throw Error('Owned snapshot teardown unconfirmed');}catch(error){if(error.code!=='ENOENT')throw error;snapshotRemoved=true;}
 assert.ok(!interrupted&&!signalError&&Date.now()<deadline,'Original hard deadline after owned teardown');clearTimeout(timer);
 await writeFile(join(output,'SELECTION_RECEIPT.json'),JSON.stringify({version:1,index,group:g.name,phase,runId,startedMs,endedMs:Date.now(),deadlineMs:deadline,actualKernelSource:{root:actualRoot,commit:actualCommit,tree:actualTree,before:actualBefore,after:actualAfter},selectedExternalSource:{root:selectedRoot,commit:selection.selectedSource.commit,tree:selection.selectedSource.tree,manifestSHA256:selection.selectedSource.canonicalManifestSHA256,fullBefore:join(output,'SELECTED_BEFORE.json'),fullAfter:join(output,'SELECTED_AFTER.json'),kernelAssured:false},declaredExternalInputs:selection.externalDependencies,gitObjectStore:gitStoreBefore,gitCommands:owned.records,unchangedDelegate:selection.unchangedInheritedDelegate,originalArgvIndex:index,originalExit,originalReceipt:receiptPath,portableReceipt:portablePath,freshCleanup:cleanup,launcher,owner,snapshotRemoved:true,recoveryAdapter:{loader:fileURLToPath(adapterURL),owned:fileURLToPath(ownedURL),groupExecutedSHA256:delta.executedSHA256},selectionSHA256:sha(selectionBytes),forwardedResultSHA256:sha(bytes),observationsNormalized:false,phaseChanged:false,bodyChanged:false},null,2)+'\n',{flag:'wx'});
 await writeFile(originalResult,bytes,{flag:'wx'});process.exitCode=originalExit;console.log('INHERITED_SELECTION_RECEIPT '+join(output,'SELECTION_RECEIPT.json'));
}catch(error){
 clearTimeout(timer);clearInterval(repeat);try{if(owned)await owned.stop();}catch(stopError){signalError=stopError.message;}
 if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:error.message,signalError,output,selectedRoot,snapshotCreated,snapshotRemovalAttempted,snapshotRemoved:snapshotRemoved?true:snapshotRemovalAttempted?null:false,selectedSnapshotPreserved:snapshotRemoved?false:snapshotRemovalAttempted?null:snapshotCreated?true:null,gitCommands:owned?.records,delegated,terminalResult:false,observationsNormalized:false},null,2)+'\n',{flag:'wx'});
 console.error('HARNESS99 explicit inherited source selection '+error.message);process.exitCode=99;
}finally{
 delete process.env.BZ_RECOVERY_LOADER;delete process.env.BZ_RECOVERY_OWNED;hook.deregister();
 clearTimeout(timer);clearInterval(repeat);process.off('SIGTERM',signal);process.off('SIGINT',signal);console.log=originalLog;process.chdir(originalCwd);process.argv=originalArgv;
 if(originalRoot===undefined)delete process.env.VERIFY_ROOT;else process.env.VERIFY_ROOT=originalRoot;if(originalResult===undefined)delete process.env.VERIFY_RESULT_JSON;else process.env.VERIFY_RESULT_JSON=originalResult;
}
