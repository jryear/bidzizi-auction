#!/usr/bin/env node
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),startedMs=Date.now(),hash=b=>createHash('sha256').update(b).digest('hex');
try{
 if(process.argv.length!==3||!/^\d+$/.test(process.argv[2]))throw Error('Exact inherited group index required');
 const config=JSON.parse(await readFile(new URL('./INHERITED.json',import.meta.url),'utf8')),c=config.checks[Number(process.argv[2])];if(!c)throw Error('Inherited group unavailable');
 if(process.env.WELCOME_CONTROL||process.env.NODE_OPTIONS)throw Error('Inherited gate refuses undeclared control/loader environment');
 await mkdir('/tmp/task-root',{recursive:true});const output=await mkdtemp('/tmp/task-root/welcome006b-inherited-'),files=['loader.mjs','SUPERSESSION.json','INHERITED.json','inherited.mjs'],hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(new URL(p,import.meta.url)))])));
 const loader=join(root,'tests/acceptance/staging-welcome/loader.mjs'),env={...process.env,NODE_OPTIONS:'--import='+loader};
 const child=spawnSync(c.argv[0],c.argv.slice(1),{cwd:root,env,encoding:'utf8',timeout:c.timeout*1000-1000,maxBuffer:64*1024*1024});
 await writeFile(join(output,'stdout.txt'),child.stdout||'');await writeFile(join(output,'stderr.txt'),child.stderr||'');
 const receipt={version:1,startedMs,endedMs:Date.now(),index:c.index,name:c.name,argv:c.argv,phase:process.env.VERIFY_TREE,runId:process.env.VERIFY_RUN_ID,helperHashes:hashes,actualExit:child.status,sourceChanges:false,onlySupersession:'One cover-selector string; current legacy fan or approved hero cover; no phase condition; all other assertions retained'};
 await writeFile(join(output,'INHERITED_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');
 process.stdout.write(child.stdout||'');process.stderr.write(child.stderr||'');if(child.error||child.signal||![0,1].includes(child.status))throw Error('Inherited runner infrastructure/deadline/reserved exit');console.log('WELCOME_INHERITED_RECEIPT '+JSON.stringify({path:join(output,'INHERITED_RECEIPT.json'),sha256:hash(await readFile(join(output,'INHERITED_RECEIPT.json')))}));process.exitCode=child.status;
}catch(e){console.error('HARNESS99 welcome inherited '+e.message);process.exitCode=99;}
