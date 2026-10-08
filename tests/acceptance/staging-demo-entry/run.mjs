import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {safeDetail} from './sanitize.mjs';

const root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex');
let output;
try{
 const index=process.argv[2];if(process.argv.length!==3||!['0','1','2'].includes(index))throw Error('Exact group index0/1/2 required');
 for(const k of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS'])if(process.env[k]!==undefined)throw Error('Undeclared environment '+k);
 const {groups,runGroup}=await import('./cases.mjs');
 const g=groups[+index],phase=process.env.VERIFY_TREE||'direct',runId=process.env.VERIFY_RUN_ID||'direct';
 const declaration=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8'));
 assert.deepEqual(g,declaration.groups[+index]);
 if(process.env.VERIFY_RESULT_JSON){
  if(!['base','candidate'].includes(phase)||!/^[a-f0-9]{32}$/.test(runId))throw Error('Invalid schema2 invocation');
  try{await lstat(process.env.VERIFY_RESULT_JSON);throw Error('Preexisting result refused');}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/demo009-'+phase+'-');
 const git=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000});if(git.status!==0)throw Error('Source binding unavailable');
 const sourcePaths=declaration.sourcePaths,helperPaths=declaration.helperPaths;
 const bindings=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>{try{return [p,hash(await readFile(join(root,p)))];}catch(e){if(e.code==='ENOENT')return [p,null];throw e;}})));
 const start={commit:git.stdout.trim(),phase,runId,group:g.name,root,output,startedAt:new Date().toISOString(),sourceHashes:await bindings(sourcePaths),helperHashes:await bindings(helperPaths)};
 await writeFile(join(output,'START.json'),JSON.stringify(start,null,2)+'\n',{flag:'wx'});
 const results=[];
 await runGroup(+index,async(id,run,initial={})=>{
  if(id!==g.ids[results.length])throw Error('Missing/duplicate/reordered native assertion');
  let status='pass',detail='Observed native requirement',observed=initial;
  try{observed=(await run())??initial;}catch(e){if(!(e instanceof assert.AssertionError))throw e;status='fail';detail=safeDetail(e.message);}
  const observation=join(output,id+'.json');await writeFile(observation,JSON.stringify({id,status,observed,detail},null,2)+'\n',{flag:'wx'});
  const row={id,status,detail,observation,sha256:hash(await readFile(observation))};results.push(row);console.log('CASE_RESULT '+JSON.stringify(row));
 },output);
 assert.deepEqual(results.map(r=>r.id),g.ids,'Complete fixed assertion set');
 assert.deepEqual(await bindings(sourcePaths),start.sourceHashes,'Source unchanged');assert.deepEqual(await bindings(helperPaths),start.helperHashes,'Evidence unchanged');
 const exit=results.some(r=>r.status==='fail')?1:0;
 const receipt={...start,endedAt:new Date().toISOString(),exit,classification:exit?'FINITE_REACHED_MISMATCH':'PASS',results};
 await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(process.env.VERIFY_RESULT_JSON)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:g.name,phase,run_id:runId,assertions:results.map(({id,status,detail})=>({id,status,detail}))})+'\n',{flag:'wx'});
 console.log('DEMO009_RECEIPT '+join(output,'RUN_RECEIPT.json'));process.exitCode=exit;
}catch(e){if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',error:safeDetail(e.stack),terminalResult:false},null,2)+'\n').catch(()=>{});console.error('HARNESS99 '+safeDetail(e.stack));process.exitCode=99;}
