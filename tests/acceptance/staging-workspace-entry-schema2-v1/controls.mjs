// Pure negative controls; fabricated fixtures below exercise receipt validation only.
// They are not application cases, execution attestation, or kernel completion.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateUI,commandRows,protocolResult,strictJSON,InvalidEvidence} from './validate.mjs';
const cfg=JSON.parse(await readFile(new URL('./CHECKS.json',import.meta.url),'utf8')),c=cfg.checks[0],controls=[];
const plan=JSON.parse(await readFile(new URL('../staging-workspace-entry/CASE_PLAN.json',import.meta.url),'utf8'));
const make=()=>{
 const results=plan.cases.filter(x=>x.mode===c.mode).map(x=>({id:x.id,expectedBaseExit:x.expectedBaseExit,actualExit:x.expectedBaseExit,durationMs:10,message:'pure fixture observation',classification:'ACTUAL_APPLICATION_BASE_CHARACTERIZATION'}));
 const receipt={version:4,mode:c.mode,plannedSourceCommit:plan.sourceCommit,actualSourceCommit:'fixture-commit',sourceCommit:'fixture-commit',verifyTree:'base',parentVerificationTree:'base',mutant:null,kernelInvokedByRunner:false,actualSourceHashes:{'source':'hash'},currentEvidenceHashes:{'grader':'hash'},casePlanSHA256:'planhash',durationMs:100,actualExit:1,results};
 const ctx={plan,commit:'fixture-commit',phase:'base',runId:'a'.repeat(32),sourceHashes:{'source':'hash'},evidenceHashes:{'grader':'hash'},planHash:'planhash',elapsedMs:100,exit:1,receiptPath:'/fixture/unique/RUN_RECEIPT.json',stdout:results.map(x=>'CASE_RESULT '+JSON.stringify(x)+'\n').join('')+'RUN_RECEIPT /fixture/unique/RUN_RECEIPT.json\n'};
 return {receipt,ctx};
};
const reject=(id,mutate)=>{
 const f=make();mutate(f);
 let error;try{const rows=validateUI(f.receipt,c,f.ctx);protocolResult(c,f.ctx,rows);}catch(e){error=e;}
 assert.ok(error instanceof InvalidEvidence,id+' must reject');controls.push({id,expected:'rejected',observed:'rejected',reason:error.message});
};
const f=make(),rows=validateUI(f.receipt,c,f.ctx),terminal=protocolResult(c,f.ctx,rows);
assert.equal(terminal.assertions.length,6);assert.deepEqual(rows.filter(x=>x.status==='fail').map(x=>x.id).sort(),c.baseline_failures.toSorted());controls.push({id:'COMPLETE_NATIVE_RECEIPT',expected:'accepted',observed:'accepted',fixtureOnly:true});
reject('PARTIAL_RECEIPT',f=>f.receipt.results.pop());
reject('DUPLICATE_CASE_ID',f=>f.receipt.results[1].id=f.receipt.results[0].id);
reject('UNKNOWN_CASE_ID',f=>f.receipt.results[1].id='UNDECLARED');
reject('HARNESS99_CASE',f=>f.receipt.results[1].actualExit=99);
reject('HARNESS99_AGGREGATE',f=>{f.receipt.actualExit=99;f.ctx.exit=99;});
reject('SOURCE_COMMIT_MISMATCH',f=>f.receipt.actualSourceCommit='stale');
reject('SOURCE_HASH_MISMATCH',f=>f.receipt.actualSourceHashes.source='stale');
reject('EVIDENCE_HASH_MISMATCH',f=>f.receipt.currentEvidenceHashes.grader='stale');
reject('STALE_PHASE',f=>f.receipt.verifyTree='candidate');
reject('MUTANT_RECEIPT',f=>f.receipt.mutant='DROP_CONTEXT_EPOCH');
reject('UNKNOWN_LOGGED_CASE',f=>f.ctx.stdout+='CASE_RESULT {"id":"unknown"}\n');
reject('OUTPUT_PATH_REUSE_MISMATCH',f=>f.ctx.receiptPath='/different/RUN_RECEIPT.json');
reject('AGGREGATE_EXIT_DISAGREEMENT',f=>f.ctx.exit=0);
reject('STALE_RUN_ID',f=>f.ctx.runId='old-run');
reject('STALE_NATIVE_DURATION',f=>f.receipt.durationMs=999999);
reject('UNEXPECTED_BASE_FAILURE_DECLARATION',f=>f.receipt.results[1].expectedBaseExit=1);
// Unexpected observed failures retain exact native assertions; the kernel compares exact baseline failures.
const u=make();u.receipt.results[1].actualExit=1;u.ctx.stdout=u.receipt.results.map(x=>'CASE_RESULT '+JSON.stringify(x)+'\n').join('')+'RUN_RECEIPT '+u.ctx.receiptPath+'\n';
const ur=validateUI(u.receipt,c,u.ctx);assert.notDeepEqual(ur.filter(x=>x.status==='fail').map(x=>x.id).sort(),c.baseline_failures.toSorted());controls.push({id:'UNEXPECTED_FAILURE_PRESERVED_FOR_EXACT_KERNEL_BASELINE',expected:'finite fail retained',observed:'finite fail retained',failedIds:ur.filter(x=>x.status==='fail').map(x=>x.id)});
const cmd=cfg.checks[2],good={exit:0,stdout:Array.from({length:7},(_,i)=>'PASS '+(i+1)+': fixture '+i).join('\n')+'\n'+cmd.marker+'\n',stderr:'',phase:'candidate'};
assert.equal(commandRows(cmd,good)[0].status,'pass');controls.push({id:'COARSE_COMMAND_COMPLETE',expected:'accepted',observed:'accepted',fixtureOnly:true});
for(const [id,change] of [['MARKER_WITH_NONZERO',{exit:1}],['MISSING_TERMINAL_MARKER',{stdout:'PASS 1: fixture\n'}],['MODULE_ERROR',{stderr:'ERR_MODULE_NOT_FOUND'}],['SYNTAX_ERROR',{stderr:'SyntaxError'}],['DEADLINE_ERROR',{stderr:'TimeoutError: timed out'}],['REGRESSION_BASE_FAILURE',{exit:1,phase:'base',stderr:'FAIL: finite'}],['PARTIAL_COMMAND_COUNT',{stdout:'PASS 1: fixture\n'+cmd.marker+'\n'}]]){
 assert.throws(()=>commandRows(cmd,{...good,...change}),InvalidEvidence);controls.push({id,expected:'rejected',observed:'rejected',fixture:change});
}
const finite=commandRows(cmd,{exit:1,stdout:'',stderr:'AssertionError [ERR_ASSERTION]: finite invariant assertion',phase:'candidate'});assert.equal(finite[0].status,'fail');controls.push({id:'FINITE_REGRESSION_CANDIDATE_FAILURE',expected:'fail assertion retained',observed:'fail assertion retained'});
assert.throws(()=>strictJSON('{"actualExit":0,"actualExit":1}'),InvalidEvidence);controls.push({id:'DUPLICATE_NATIVE_JSON_KEY',expected:'rejected',observed:'rejected'});
assert.throws(()=>strictJSON('{"results":['),SyntaxError);controls.push({id:'MALFORMED_NATIVE_JSON',expected:'rejected',observed:'rejected'});
const executedEvidenceHashes={};for(const file of ['adapter.mjs','validate.mjs','controls.mjs','CHECKS.json'])executedEvidenceHashes[file]=createHash('sha256').update(await readFile(new URL('./'+file,import.meta.url))).digest('hex');
const result={version:1,executedEvidenceHashes,classification:'PURE_ADAPTER_CONTROL_EVIDENCE_ONLY',count:controls.length,passed:controls.length,controls};
const target=process.argv[2];if(target)await writeFile(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
