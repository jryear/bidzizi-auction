// Pure negative source controls. Never starts an app, database or browser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSource} from './source-oracle.mjs';
import {frozenEntryGroups,validateAcceptedEntryReceipt} from './rebind-accepted.mjs';
import {assertRecordedBirth} from './lifecycle.mjs';
import {resolve,join} from 'node:path';
const b=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url))),m=JSON.parse(await readFile(new URL('./HISTORICAL_MANIFEST.json',import.meta.url))),g=JSON.parse(await readFile(new URL('./GROUPS.json',import.meta.url)));
const good={historicalArchiveSHA256:m.historicalArchiveSHA256,importedHistoricalSHA256:m.rootImportSHA256,immutableCurrentApplicationSHA256:b.immutableCurrentApplicationSHA256,acceptedApplicationSHA256:b.acceptedEntry?.acceptedApplicationSHA256||null,protected009SHA256:b.protected009SHA256,entryTaskSHA256:b.new36IDContract.sha256,entryEvidenceSHA256:b.entryEvidenceSHA256,retainedHistoricalHelpersSHA256:b.retainedHistoricalHelpersSHA256,kernelSHA256:b.kernel.sha256,kernelVersion:b.kernel.version};
validateSource(good,b,m,g);let rejected=0;
for(const key of ['historicalArchiveSHA256','importedHistoricalSHA256','immutableCurrentApplicationSHA256','protected009SHA256','retainedHistoricalHelpersSHA256','entryEvidenceSHA256'])for(const path of Object.keys(good[key])){
 const broken=structuredClone(good);broken[key][path]='0'.repeat(64);assert.throws(()=>validateSource(broken,b,m,g),assert.AssertionError);rejected++;
}
for(const key of ['entryTaskSHA256','kernelSHA256','kernelVersion']){const broken=structuredClone(good);broken[key]='wrong';assert.throws(()=>validateSource(broken,b,m,g),assert.AssertionError);rejected++;}
for(const change of [x=>x.groups.pop(),x=>x.groups[0].timeout++,x=>x.groups[0].argv[2]='wrong',x=>x.groups[0].assertions[0]='wrong',x=>x.standalonePrefixExactlyEqual=false]){const broken=structuredClone(g);change(broken);assert.throws(()=>validateSource(good,b,m,broken),assert.AssertionError);rejected++;}
// Synthetic semantic controls for the two finite review findings. They are not
// accepted application evidence and never invoke rebind, probes or services.
const taskText=await readFile(join(resolve(process.env.VERIFY_ROOT||process.cwd()),b.new36IDContract.path),'utf8'),entryGroups=frozenEntryGroups(taskText,b),revision='1'.repeat(40);
const receipt={schema:2,head:revision,verdict:'supported',task_id:b.new36IDContract.id,spec_sha256:b.new36IDContract.sha256,base_ref:b.selectedProductBase,verifier_sha256:b.kernel.sha256,verifier_version:b.kernel.version,dirty_before_log:false,reasons:[],source_binding:{base:{commit:b.selectedProductBase},candidate:{commit:revision},candidate_snapshot:true,clean_before:true,unchanged_after:true},candidate_checks:entryGroups.map((g,i)=>({name:g.name,kind:g.kind,expected_exit:0,passed:true,harness_error:false,exit:0,failed_assertions:[],assertion_result:{protocol:1,check:g.name,phase:'candidate',run_id:(i+1).toString(16).padStart(32,'0'),assertions:g.assertions.map(id=>({id,status:'pass',detail:'Synthetic validator control only'}))}}))};
validateAcceptedEntryReceipt(receipt,revision,b,taskText);let receiptRejected=0;
const rejectReceipt=change=>{const bad=structuredClone(receipt);change(bad);assert.throws(()=>validateAcceptedEntryReceipt(bad,revision,b,taskText),assert.AssertionError);receiptRejected++;};
for(let i=0;i<entryGroups.length;i++){
 rejectReceipt(x=>{x.candidate_checks[i].name='arbitrary '+i;x.candidate_checks[i].assertion_result.check='arbitrary '+i;});
 rejectReceipt(x=>x.candidate_checks[i].assertion_result.check='wrong');
 rejectReceipt(x=>x.candidate_checks[i].assertion_result.run_id='not-a-run-id');
 for(let j=0;j<entryGroups[i].assertions.length;j++)rejectReceipt(x=>x.candidate_checks[i].assertion_result.assertions[j].id='arbitrary_'+i+'_'+j);
 rejectReceipt(x=>x.candidate_checks[i].assertion_result.assertions.push(x.candidate_checks[i].assertion_result.assertions[0]));
}
for(const change of [x=>x.candidate_checks.pop(),x=>x.candidate_checks.push(x.candidate_checks[0]),x=>x.candidate_checks.reverse(),x=>x.candidate_checks[1].assertion_result.run_id=x.candidate_checks[0].assertion_result.run_id,x=>x.candidate_checks[0].assertion_result.phase='base',x=>x.candidate_checks[0].assertion_result.protocol=2,x=>x.head='2'.repeat(40),x=>x.base_ref='2'.repeat(40),x=>x.spec_sha256='wrong',x=>x.task_id='wrong',x=>x.source_binding.candidate.commit='2'.repeat(40),x=>x.source_binding.unchanged_after=false,x=>x.verdict='contradicted'])rejectReceipt(change);
const p={pid:42,birth:'exact recorded birth'};assert.equal(assertRecordedBirth(p,p.birth,true),true);assert.equal(assertRecordedBirth(p,null,false),false);
let lifecycleRejected=0;
for(const args of [[p,'reused different birth',true],[p,'reused different birth',false],[p,null,true],[{...p,birth:null},null,false]]){assert.throws(()=>assertRecordedBirth(...args),/HARNESS99/);lifecycleRejected++;}
console.log(JSON.stringify({pureControlOnly:true,appOrDBOrBrowser:false,positiveControl:true,rejected,receiptRejected,lifecycleRejected,sourceGuaranteesWeakened:0,acceptedEvidenceProduced:false}));
