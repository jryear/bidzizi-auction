// Evidence adapter pure validity checks. A native receipt is mandatory for UI RED.
import assert from 'node:assert/strict';
export class InvalidEvidence extends Error {}
const need=(ok,reason)=>{if(!ok)throw new InvalidEvidence(reason);};
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
const integer=n=>Number.isInteger(n)&&n>=0;
export function completeRows(rows,ids){
 need(Array.isArray(rows),'missing result array');
 need(rows.length===ids.length,'partial/extra result array');
 need(new Set(rows.map(x=>x?.id)).size===ids.length,'duplicate result IDs');
 need(same([...rows.map(x=>x?.id)].sort(),[...ids].sort()),'unknown/missing result IDs');
 need(rows.every(x=>[0,1].includes(x.actualExit)&&integer(x.durationMs)&&typeof x.message==='string'),'harness/nonfinite/malformed case');
 return rows.map(x=>({id:x.id,status:x.actualExit===0?'pass':'fail',detail:x.message}));
}
export function validateUI(receipt,c,ctx){
 need(receipt&&receipt.version===4&&receipt.mode===c.mode,'native version/mode mismatch');
 need(receipt.mutant===null,'mutant receipt is not gate evidence');
 need(receipt.plannedSourceCommit===ctx.plan.sourceCommit,'planned source binding mismatch');
 need(receipt.actualSourceCommit===ctx.commit&&receipt.sourceCommit===ctx.commit,'actual source commit mismatch');
 need(receipt.verifyTree===ctx.phase&&receipt.parentVerificationTree===ctx.phase,'phase mismatch');
 need(receipt.kernelInvokedByRunner===false,'unexpected runner kernel claim');
 need(same(receipt.actualSourceHashes,ctx.sourceHashes),'current source bytes mismatch');
 need(same(receipt.currentEvidenceHashes,ctx.evidenceHashes),'current evidence bytes mismatch');
 need(receipt.casePlanSHA256===ctx.planHash,'plan hash mismatch');
 need(integer(receipt.durationMs)&&receipt.durationMs<=ctx.elapsedMs+2000,'invalid native duration');
 const rows=completeRows(receipt.results,c.assertions);
 const planned=new Map(ctx.plan.cases.filter(x=>x.mode===c.mode).map(x=>[x.id,x.expectedBaseExit]));
 need(receipt.results.every(x=>planned.get(x.id)===x.expectedBaseExit),'native expectation mismatch');
 need(receipt.results.every(x=>x.classification==='ACTUAL_APPLICATION_'+ctx.phase.toUpperCase()+'_CHARACTERIZATION'),'native classification mismatch');
 const aggregate=rows.some(x=>x.status==='fail')?1:0;
 need(receipt.actualExit===aggregate&&ctx.exit===aggregate,'native aggregate/exit mismatch');
 const logged=ctx.stdout.split('\n').filter(x=>x.startsWith('CASE_RESULT ')).map(x=>{try{return JSON.parse(x.slice(12));}catch{throw new InvalidEvidence('malformed case log');}});
 need(same(logged,receipt.results),'native case log/receipt mismatch');
 need(ctx.stdout.split('\n').filter(x=>x.startsWith('RUN_RECEIPT ')).length===1&&ctx.stdout.includes('RUN_RECEIPT '+ctx.receiptPath+'\n'),'receipt output allocation mismatch');
 return rows;
}
export function validateSyntax(receipt,c,ctx){
 need(receipt?.version===4&&receipt.mode==='syntax','syntax native receipt missing');
 need(receipt.actualNodeVersion==='v24.4.1'&&receipt.actualNodeRuntime===ctx.runtime,'syntax runtime mismatch');
 need(receipt.sourceCommit===ctx.commit&&receipt.parentVerificationTree===ctx.phase,'syntax source/phase mismatch');
 need(receipt.sourcePath===ctx.sourcePath&&receipt.sourceSHA256===ctx.sourceHash&&receipt.syntaxEvidenceSHA256===ctx.syntaxHash,'syntax bytes mismatch');
 need(receipt.classification==='ACTUAL_APPLICATION_'+ctx.phase.toUpperCase()+'_SYNTAX','syntax classification mismatch');
 need(integer(receipt.durationMs)&&receipt.durationMs<=ctx.elapsedMs+2000&&receipt.expectedBaseExit===0,'syntax duration/expectation mismatch');
 need([0,1].includes(ctx.exit)&&receipt.actualExit===ctx.exit,'syntax exit mismatch');
 need(ctx.exit===0?receipt.stderr==='':typeof receipt.stderr==='string'&&receipt.stderr.includes('SyntaxError'),'syntax failure was not a finite source parse defect');
 const logged=ctx.stdout.split('\n').filter(x=>x.startsWith('CASE_RESULT '));
 need(logged.length===1&&same(JSON.parse(logged[0].slice(12)),receipt),'syntax logged receipt mismatch');
 return [{id:c.assertions[0],status:ctx.exit===0?'pass':'fail',detail:'Native Node24 parse receipt, current source hash and exit agree.'}];
}
export function commandRows(c,{exit,stdout,stderr,phase}){
 need([0,1].includes(exit),'command harness/reserved/nonfinite exit');
 const output=stdout+'\n'+stderr;
 need(!/HARNESS|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find (?:module|package)|SyntaxError|ReferenceError|TypeError|INTERNAL.*DEADLINE|ETIMEDOUT|TimeoutError|AbortError|timed out|exceeded.*(?:seconds|deadline)|setup failed|ENOENT/i.test(output),'command setup/import/runtime/deadline failure');
 if(exit===1){
  need(phase==='candidate'&&/(?:AssertionError|ERR_ASSERTION)/.test(output),'unclassified command failure or unexpected baseline RED');
  return [{id:c.assertions[0],status:'fail',detail:'Original command produced a finite assertion failure; no per-case receipt is claimed.'}];
 }
 if(c.marker){
  need(stdout.split('\n').filter(x=>x===c.marker).length===1&&stdout.trimEnd().split('\n').at(-1)===c.marker,'missing/duplicate/nonterminal completion marker');
  const pass=stdout.split('\n').filter(x=>x.startsWith('PASS '));
  need(pass.length===c.count,'terminal marker lacks exact completion count');
  if(!['selector','adapter'].includes(c.mode)&&c.index!==13)
   need(pass.every((x,i)=>x.startsWith('PASS '+(i+1)+': ')),'nonsequential completion counts');
  need(new Set(pass).size===pass.length,'duplicate completion lines');
 }
 return [{id:c.assertions[0],status:'pass',detail:c.marker?'Original command exit0 and exact terminal marker/count observed: '+c.marker:'External TypeScript command exit0 observed; no per-case execution receipt exists.'}];
}
export function protocolResult(c,ctx,rows){
 need(['base','candidate'].includes(ctx.phase)&&/^[a-f0-9]{32}$/.test(ctx.runId),'invalid schema2 invocation');
 need(rows.length===c.assertions.length&&new Set(rows.map(x=>x.id)).size===rows.length&&same(rows.map(x=>x.id).sort(),[...c.assertions].sort()),'incomplete terminal assertions');
 const code=rows.some(x=>x.status==='fail')?1:0;
 need(code===ctx.exit,'terminal aggregate disagreement');
 return {protocol:1,check:c.name,phase:ctx.phase,run_id:ctx.runId,assertions:rows};
}
export function strictJSON(text){
 const parsed=JSON.parse(text),tokens=text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)||[],stack=[];
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(t==='{'||t==='[')stack.push(t==='{'?new Set():null);
  else if(t==='}'||t===']')stack.pop();
  else if(t.startsWith('"')&&tokens[i+1]===':'){
   const key=JSON.parse(t),keys=stack.at(-1);need(keys instanceof Set&&!keys.has(key),'duplicate native JSON key');keys.add(key);
  }
 }
 return parsed;
}
