import assert from 'node:assert/strict';
export class InvalidEvidence extends Error{}
export const need=(ok,why)=>{if(!ok)throw new InvalidEvidence(why);};
const same=(a,b)=>{try{assert.deepEqual(a,b);return true;}catch{return false;}};
export function validate(receipt,c,binding,exit){
 need(receipt?.version===1&&receipt.check===c.name&&receipt.phase===binding.phase&&receipt.runId===binding.runId&&receipt.commit===binding.commit&&receipt.mode===c.kind,'Invocation/source/mode binding mismatch');
 need(same(receipt.sourceHashes,binding.sourceHashes)&&same(receipt.helperHashes,binding.helperHashes),'Source/helper byte binding mismatch');
 need(receipt.startedMs>=binding.startedMs&&receipt.endedMs>=receipt.startedMs&&receipt.endedMs<=binding.endedMs,'Receipt freshness mismatch');
 need([0,1].includes(exit)&&receipt.actualExit===exit,'Reserved exit/aggregate mismatch');
 need(Array.isArray(receipt.results)&&same(receipt.results.map(r=>r.id),c.assertions),'Incomplete/duplicate/out-of-order assertion set');
 need(receipt.results.every(r=>[0,1].includes(r.actualExit)&&typeof r.detail==='string'&&Number.isFinite(r.durationMs)&&r.durationMs>=0),'Malformed finite assertion observations');
 need(exit===(receipt.results.some(r=>r.actualExit===1)?1:0),'Assertion aggregate disagreement');
 return receipt.results.map(r=>({id:r.id,status:r.actualExit===0?'pass':'fail',detail:r.detail}));
}
