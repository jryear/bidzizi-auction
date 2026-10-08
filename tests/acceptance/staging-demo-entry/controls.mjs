// Causal controls run only in disposable copies; no source or shared fixture mutation.
import assert from 'node:assert/strict';
import {mkdtemp,cp,symlink,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {safeDetail} from './sanitize.mjs';
const root=resolve(process.cwd()),node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
const mode=process.argv[2];if(!['preparation','candidate'].includes(mode))throw Error('Exact controls mode required');
await mkdir('/tmp/task-root',{recursive:true});const scratch=await mkdtemp('/tmp/task-root/demo009-controls-');
const run=(path,args)=>spawnSync(node,['tests/acceptance/staging-demo-entry/run.mjs',...args],{cwd:path,encoding:'utf8',timeout:240_000,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:'/tmp/task-root',LANG:'en_US.UTF-8',NEXT_TELEMETRY_DISABLED:'1'}});
async function copy(name){const p=join(scratch,name);await mkdir(p);for(const dir of ['src','public','migrations','tests','docs','tasks'])await cp(join(root,dir),join(p,dir),{recursive:true});for(const file of ['package.json','pnpm-lock.yaml','tsconfig.json','next-env.d.ts','next.config.ts','.gitignore'])await cp(join(root,file),join(p,file));await symlink(join(root,'node_modules'),join(p,'node_modules'));const git=spawnSync('/usr/bin/git',['init','-q'],{cwd:p});assert.equal(git.status,0);assert.equal(spawnSync('/usr/bin/git',['add','.'],{cwd:p}).status,0);assert.equal(spawnSync('/usr/bin/git',['-c','user.name=Control','-c','user.email=control@example.invalid','commit','-qm','Disposable control'],{cwd:p}).status,0);return p;}
const results=[];
try{
 const p=await copy('original');let r=run(p,['wrong']);assert.equal(r.status,99);results.push({id:'WRONG_MODE',status:99});
 const secret='q'.repeat(43);assert.equal(safeDetail('bz_session='+secret).includes(secret),false);assert.equal(safeDetail('malformed '+secret).includes(secret),false);results.push({id:'FAILURE_DETAIL_REDACTED',status:'pass'});
 const missing=await copy('missing');await rm(join(missing,'tests/acceptance/staging-manual-bid/fixtures.mjs'));r=run(missing,['0']);assert.equal(r.status,99);results.push({id:'MISSING_DEPENDENCY',status:99});
 const drop=await copy('dropped');const file=join(drop,'tests/acceptance/staging-demo-entry/CHECKS.json'),d=JSON.parse(await readFile(file));d.groups[0].ids.pop();await writeFile(file,JSON.stringify(d));r=run(drop,['0']);assert.equal(r.status,99);results.push({id:'DROPPED_ASSERTION',status:99});
 if(mode==='candidate'){
  const mutant=await copy('positive-mutant'),path=join(mutant,'src/server/demo-entry.ts'),text=await readFile(path,'utf8');assert.ok(text.includes('demoEntry: true'),'Known reached positive mutation anchor');await writeFile(path,text.replace('demoEntry: true','demoEntry: false'));
  r=run(mutant,['0']);assert.equal(r.status,1,'Wrong successful discovery packet must fail fixed native oracle');assert.match(r.stdout,/DISCOVERY_PRIVATE.*"status":"fail"/);results.push({id:'WRONG_DISCOVERY_PACKET',status:1});
 }
 await writeFile(join(scratch,'CONTROL_RECEIPT.json'),JSON.stringify({mode,results},null,2)+'\n');console.log('CONTROL_RECEIPT '+join(scratch,'CONTROL_RECEIPT.json'));
}catch(e){console.error(safeDetail(e.stack));process.exitCode=99;}
