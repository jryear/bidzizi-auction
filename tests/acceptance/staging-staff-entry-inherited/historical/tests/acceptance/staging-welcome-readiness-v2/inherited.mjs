// Only the inherited manual acceptance boundary uses this bootstrap successor.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),startedMs=Date.now(),hash=b=>createHash('sha256').update(b).digest('hex');let output;
const need=(ok,why)=>{if(!ok)throw Error(why);};
const maps=async ps=>Object.fromEntries(await Promise.all([...new Set(ps)].sort().map(async p=>[p,hash(await readFile(join(root,p)))])));
try{
 need(process.argv.length===3&&process.argv[2]==='4','Only unchanged inherited manual acceptance index4');need(!process.env.NODE_OPTIONS&&!process.env.WELCOME_CONTROL&&!process.env.WELCOME_READINESS_CONTROL,'Gate refuses control/loader environment');
 const config=JSON.parse(await readFile(join(root,'tests/acceptance/staging-welcome/INHERITED.json'),'utf8')),c=config.checks[4],plan=JSON.parse(await readFile(new URL('./EXECUTION_SUPERSESSION.json',import.meta.url),'utf8'));
 need(JSON.stringify(c.argv)===JSON.stringify(plan.originalNestedArgv)&&c.timeout===600&&JSON.stringify(c.assertions)===JSON.stringify(['COMMAND_03_COMPLETED']),'Exact original manual boundary');
 const files=plan.successorChain,helperHashes=await maps(files),commit=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/welcome-readiness-v2-inherited-');
 const child=spawnSync(c.argv[0],c.argv.slice(1),{cwd:root,env:{...process.env,NODE_OPTIONS:'--import='+join(root,'tests/acceptance/staging-welcome-readiness-v2/loader.mjs')},encoding:'utf8',timeout:c.timeout*1000-(Date.now()-startedMs)-1000,maxBuffer:64*1024*1024});
 await writeFile(join(output,'stdout.txt'),child.stdout||'',{flag:'wx'});await writeFile(join(output,'stderr.txt'),child.stderr||'',{flag:'wx'});
 need(!child.error&&!child.signal&&[0,1].includes(child.status),'Inherited runtime/deadline/reserved exit99');
 const references=(child.stdout||'').split('\n').filter(x=>x.startsWith('SCHEMA2_V2_BOUND_RECEIPT '));need(references.length===1,'One original schema2 receipt');const reference=JSON.parse(references[0].slice('SCHEMA2_V2_BOUND_RECEIPT '.length));need(reference.sha256===hash(await readFile(reference.path)),'Original schema2 receipt byte binding');
 const original=JSON.parse(await readFile(reference.path,'utf8')),legacy=original.delegatedV1Receipt;need(legacy.sha256===hash(await readFile(legacy.path)),'Original delegated receipt byte binding');const nativeStdout=join(dirname(legacy.path),'stdout.txt'),log=await readFile(nativeStdout,'utf8');
 const lineage=log.split('\n').filter(x=>x.startsWith('MANUAL_RECEIPT_READY_LINEAGE ')).map(x=>JSON.parse(x.slice('MANUAL_RECEIPT_READY_LINEAGE '.length))),readiness=log.split('\n').filter(x=>x.startsWith('MANUAL_RECEIPT_READINESS ')).map(x=>JSON.parse(x.slice('MANUAL_RECEIPT_READINESS '.length)));
 need(lineage.length===1&&lineage[0].originalSHA256===plan.originalSHA256&&lineage[0].executedSHA256===plan.executedSHA256,'Exact single runtime bootstrap lineage');
 if(child.status===0)need(readiness.length===7&&readiness.every(r=>r.status==='ready'&&r.response?.status===401&&r.databaseUnchanged&&r.beforePrepareFixture&&r.startedMs>=startedMs&&r.endedMs<=Date.now()),'Every original acceptance fixture consumed real startup401 before clock allocation');
 need(JSON.stringify(await maps(files))===JSON.stringify(helperHashes)&&spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim()===commit,'Successor lineage/source unchanged');
 const receipt={version:1,startedMs,endedMs:Date.now(),commit,sourceRoot:root,phase:process.env.VERIFY_TREE,runId:process.env.VERIFY_RUN_ID,helperHashes,originalArgv:c.argv,actualExit:child.status,originalReceipt:reference,nativeStdout:{path:nativeStdout,sha256:hash(log)},lineage,readiness,businessAssertionsRetired:0,deadlineSeconds:600};const path=join(output,'INHERITED_RECEIPT.json');await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 process.stdout.write(child.stdout||'');process.stderr.write(child.stderr||'');console.log('WELCOME_READINESS_V2_INHERITED_RECEIPT '+JSON.stringify({path,sha256:hash(await readFile(path))}));process.exitCode=child.status;
}catch(e){if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:e.message,startedMs,endedMs:Date.now(),terminalResultEmitted:false},null,2)+'\n',{flag:'wx'});console.error('HARNESS99 welcome readinessv2 '+e.message+(output?' output='+output:''));process.exitCode=99;}
