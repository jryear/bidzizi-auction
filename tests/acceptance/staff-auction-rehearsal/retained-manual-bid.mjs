// Execute the unchanged 7+21 manual-bid scenarios on VERIFY_ROOT, sequentially.
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,lstat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),sha=b=>createHash('sha256').update(b).digest('hex');let output;
try{
 const mode=process.argv[2],count={acceptance:7,adversarial:21}[mode];if(!count)throw Error('Exact retained manual-bid mode required.');
 const phase=process.env.VERIFY_TREE||'direct',runId=process.env.VERIFY_RUN_ID||'direct';
 if(process.env.VERIFY_RESULT_JSON){if(!['base','candidate'].includes(phase)||!/^[a-f0-9]{32}$/.test(runId))throw Error('Invalid schema2 invocation.');try{await lstat(process.env.VERIFY_RESULT_JSON);throw Error('Result exists.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const files=['tests/acceptance/staging-manual-bid/driver.mjs','tests/acceptance/staging-manual-bid/harness.mjs','tests/acceptance/staging-manual-bid/fixtures.mjs','tests/acceptance/staff-auction-rehearsal/manual-probes-successor.mjs','tests/acceptance/staff-auction-rehearsal/manual-bound-successor.mjs'];
 const hashes=Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await readFile(join(root,p)))]))),commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 await mkdir('/tmp/bz-retained-bids',{recursive:true});output=await mkdtemp('/tmp/bz-retained-bids/'+phase+'-');
 const {cases}=await import('./manual-probes-successor.mjs'),{withBidFixture}=await import('../staging-manual-bid/driver.mjs');
 const selected=cases.filter(c=>c.mode===mode),passes=[];if(selected.length!==count)throw Error('Inherited named scenario set is incomplete.');
 for(const probe of selected){await withBidFixture(probe.run,probe.scenario);passes.push(probe.id);console.log('PASS '+passes.length+': '+probe.id+' '+probe.name);}
 await writeFile(join(output,'RAW_LOG.txt'),passes.map((id,i)=>'PASS '+(i+1)+': '+id).join('\n')+'\n',{flag:'wx'});
 if(passes.length!==count||new Set(passes).size!==count)throw Error('Inherited scenario count/identity incomplete.');
 const after=Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await readFile(join(root,p)))])));
 if(JSON.stringify(after)!==JSON.stringify(hashes)||execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==commit)throw Error('Inherited source/evidence changed during execution.');
 const id=mode==='acceptance'?'RETAINED_MANUAL_BID_ACCEPTANCE':'RETAINED_MANUAL_BID_ADVERSARIAL',check=mode==='acceptance'?'Retained manual-bid acceptance on actual candidate':'Retained manual-bid adversarial on actual candidate';
 await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify({phase,runId,commit,mode,passes,rawLogSHA256:sha(await readFile(join(output,'RAW_LOG.txt'))),exit:0},null,2)+'\n');
 if(process.env.VERIFY_RESULT_JSON)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check,phase,run_id:runId,assertions:[{id,status:'pass',detail:`All ${count} named inherited scenarios passed in order with truthful current-standing successor oracle.`}]})+'\n',{flag:'wx'});
 console.log('RETAINED_MANUAL_BID_RECEIPT '+output);
}catch(e){if(output)await writeFile(join(output,'HARNESS99.json'),JSON.stringify({error:e.message,terminalResult:false})+'\n').catch(()=>{});console.error('RETAINED_MANUAL_BID_HARNESS99 '+e.stack);process.exitCode=99;}
