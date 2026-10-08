import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {negativeControls} from './controls.mjs';
import {safeErrorSite} from './oracles.mjs';

const root=resolve(process.env.VERIFY_ROOT||process.cwd()),sha=b=>createHash('sha256').update(b).digest('hex');
const safe=e=>e instanceof assert.AssertionError?'Reached declared requirement contradicted':'Infrastructure/setup/evidence unavailable ('+safeErrorSite(e).class+')';
let output,activeAssertion;
try{
 const index=process.argv[2];if(process.argv.length!==3||!['0','1','2','3','4'].includes(index))throw new Error('Exact group index required');
 for(const key of ['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE','NODE_OPTIONS'])if(process.env[key]!==undefined)throw new Error('Runtime credential/config environment is forbidden');
 const declaration=JSON.parse(await readFile(new URL('./CHECKS-v2.json',import.meta.url),'utf8')),group=declaration.groups[Number(index)];
 const phase=process.env.VERIFY_TREE||'direct',runId=process.env.VERIFY_RUN_ID||'direct';
 if(process.env.VERIFY_RESULT_JSON){if(!['base','candidate'].includes(phase)||!/^[a-f0-9]{32}$/.test(runId))throw new Error('Invalid verifier result invocation');try{await lstat(process.env.VERIFY_RESULT_JSON);throw new Error('Preexisting result refused');}catch(e){if(e.code!=='ENOENT')throw e;}}
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/staff-entry-successor-'+phase+'-');
 const revision=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000});if(revision.error||revision.status!==0)throw new Error('Exact source commit unavailable');
 const bindings=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>{try{return [p,sha(await readFile(join(root,p)))];}catch(e){if(e.code==='ENOENT')return [p,null];throw e;}})));
 const sourceHashes=await bindings(declaration.sourcePaths),helperHashes=await bindings([...declaration.helperPaths,'tests/acceptance/staging-staff-event-entry-evidence-successor/native-v3.mjs','tests/acceptance/staging-staff-event-entry-evidence-successor/run-v3.mjs']);if(Object.values(helperHashes).some(v=>v===null))throw new Error('Declared evidence closure unavailable');
 const successor=JSON.parse(await readFile(new URL('./SUCCESSOR-v2.json',import.meta.url),'utf8'));
 for(const [path,pin]of Object.entries(successor.predecessorEvidenceSHA256))if(helperHashes[path]!==pin)throw new Error('Frozen predecessor evidence changed: '+path);
 const start={commit:revision.stdout.trim(),phase,runId,group:group.name,sourceHashes,helperHashes,startedAt:new Date().toISOString()};await writeFile(join(output,'START.json'),JSON.stringify(start,null,2)+'\n',{flag:'wx'});
 const results=[];
 async function record(id,run){
  assert.equal(id,group.ids[results.length],'Exact finite assertion order');activeAssertion=id;let status='pass',observed={},errorSite;
  try{observed=(await run())??{};}catch(e){if(!(e instanceof assert.AssertionError))throw e;status='fail';errorSite=safeErrorSite(e);}
  const path=join(output,id+'.json');await writeFile(path,JSON.stringify({id,status,observed,...(errorSite?{errorSite}:{}),detail:status==='pass'?'Observed declared requirement':'Reached declared requirement contradicted'},null,2)+'\n',{flag:'wx'});
  const row={id,status,detail:status==='pass'?'Observed declared requirement':'Reached declared requirement contradicted',observation:path,sha256:sha(await readFile(path))};results.push(row);console.log('CASE_RESULT '+JSON.stringify(row));
 }
 if(index==='4')await record(group.ids[0],async()=>negativeControls());
 else{
  const {withOwnedFixture}=await import('../staging-staff-event-entry/cleanup.mjs'),{setup,login,fresh,readEntry}=await import('../staging-staff-event-entry/setup.mjs');
  await withOwnedFixture(async f=>{
   await setup(f,{legacy:index==='3'});
   const cases=index==='2'?(await import('./native-v3.mjs')).native:(await import('./api-v2.mjs'))[index==='0'?'acceptance':index==='1'?'adversarial':'regression'];
   assert.deepEqual(Object.keys(cases),group.ids,'No missing/extra/reordered executable cases');
   let absent;
   if(index!=='3'){
    const staff=await login(f),target=await fresh(f,staff),probe=await readEntry(f,staff,target.eventId);
    if(probe.status===503)throw new Error('Reached entry API cannot establish disposable readiness');
    absent=probe.status===404&&probe.data===null;
   }
   for(const id of group.ids){
    if(absent)await record(id,async()=>{assert.fail('Known inherited APIs and disposable schema reached, new staff entry endpoint absent');});
    else await record(id,()=>cases[id](f,output));
   }
  },output);
 }
 assert.deepEqual(results.map(r=>r.id),group.ids);assert.deepEqual(await bindings(declaration.sourcePaths),sourceHashes);assert.deepEqual(await bindings([...declaration.helperPaths,'tests/acceptance/staging-staff-event-entry-evidence-successor/native-v3.mjs','tests/acceptance/staging-staff-event-entry-evidence-successor/run-v3.mjs']),helperHashes);
 const exit=results.some(r=>r.status==='fail')?1:0;await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify({...start,endedAt:new Date().toISOString(),exit,classification:exit?'FINITE_REACHED_MISMATCH':'PASS',results},null,2)+'\n',{flag:'wx'});
 if(process.env.VERIFY_RESULT_JSON)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:group.name,phase,run_id:runId,assertions:results.map(({id,status,detail})=>({id,status,detail}))})+'\n',{flag:'wx'});
 console.log('STAFF_ENTRY_RECEIPT '+join(output,'RUN_RECEIPT.json'));process.exitCode=exit;
}catch(e){if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',detail:safe(e),assertion:activeAssertion||null,errorSite:safeErrorSite(e),terminalResult:false},null,2)+'\n').catch(()=>{});console.error('HARNESS99 '+safe(e));process.exitCode=99;}
