import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {withAssetsFixture} from './fixture.mjs';
import * as cases from './cases.mjs';
import {concurrency} from './concurrency.mjs';
import {controls} from './controls.mjs';
import {hash} from './oracles.mjs';
import {decoderBinding} from './dependency-binding.mjs';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),phase=process.env.VERIFY_TREE||'author-diagnostic';
const config=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8'));
const index=Number(process.argv[2]),check=config.checks[index];let output,observations=[],commit,sourceBefore,evidenceBefore;
const map=async(paths,nullable=false)=>Object.fromEntries(await Promise.all(paths.map(async p=>{try{return [p,hash(await readFile(join(root,p)))];}catch(e){if(nullable&&e.code==='ENOENT')return [p,null];throw e;}})));
try{
 assert.ok(Number.isInteger(index)&&check,'An exact suite index is required.');
 const binding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url),'utf8'));
 const productPaths=[...new Set([...binding.sourcePaths,...binding.candidatePaths])];
 sourceBefore=await map(productPaths,true);evidenceBefore=await map(binding.evidencePaths);
 if(phase==='base')for(const [p,sha] of Object.entries(binding.released375SourceSHA256))if(sourceBefore[p]!==sha)throw new Error('Frozen base product differs from reviewed375; rebind required: '+p);
 commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 await mkdir('/tmp/bz-assets-evidence',{recursive:true});output=await mkdtemp('/tmp/bz-assets-evidence/'+phase+'-');
 const start={check:check.name,id:check.id,phase,runId:process.env.VERIFY_RUN_ID||randomUUID(),commit,root,sourceBefore,evidenceBefore,node:process.execPath,nodeSHA256:hash(await readFile(process.execPath)),linkedDependencies:await decoderBinding(root),startedAt:new Date().toISOString()};
 await writeFile(join(output,'START.json'),JSON.stringify(start,null,2)+'\n');
 const record=row=>{observations.push(row);console.log('ASSETS_OBSERVATION '+JSON.stringify(row));};
 const suite=({...cases,concurrency,controls})[check.suite];let mismatch,suiteEntered=false;
 try{
   if(check.suite==='controls'){suiteEntered=true;await suite(null,record);}
   else await withAssetsFixture(async f=>{f.capture=async(target,label)=>{const path=join(output,label+'.png');await target.screenshot({path});record({stage:'actual-native-screenshot',path,sha256:hash(await readFile(path))});};suiteEntered=true;await suite(f,record);},output);
 }catch(e){if(!(e instanceof assert.AssertionError)||!suiteEntered)throw e;mismatch=e;}
 // Complete terminal protocol is emitted only for one actually reached
 // aggregate outcome. Its first mismatch is recorded; later stages remain
 // unexecuted. No synthetic passing rows are manufactured after dependency loss.
 assert.equal(execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),commit);
 assert.deepEqual(await map(productPaths,true),sourceBefore);assert.deepEqual(await map(binding.evidencePaths),evidenceBefore);
 assert.deepEqual(await decoderBinding(root),start.linkedDependencies,'Evidence decoder bytes changed during verification.');
 const result={id:check.id,status:mismatch?'fail':'pass',detail:mismatch?mismatch.message:'All ordered outcome observations completed with owned fixture cleanup.'};
 const receipt={...start,endedAt:new Date().toISOString(),classification:mismatch?'FINITE_REACHED_MISMATCH':'PASS',exit:mismatch?1:0,assertions:[result],observations,afterSource:sourceBefore,ownedServicesStopped:true};
 await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');
 if(process.env.VERIFY_RESULT_JSON)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:check.name,phase,run_id:start.runId,assertions:[result]})+'\n',{flag:'wx'});
 console.log('ASSETS_BOUND_RECEIPT '+JSON.stringify({path:join(output,'RUN_RECEIPT.json'),exit:receipt.exit}));process.exitCode=receipt.exit;
}catch(e){
 // Missing dependency, fixture setup/migration, browser/DB transport, unknown
 // exception and uncontrolled timeout are99. They produce no terminal result.
 if(output)await writeFile(join(output,'HARNESS99.json'),JSON.stringify({phase,check:check?.name,reason:e.message,observations,terminalResultEmitted:false},null,2)+'\n').catch(()=>{});
 console.error('ASSETS_HARNESS99 '+e.message+(output?' receipt='+output:''));process.exitCode=99;
}
