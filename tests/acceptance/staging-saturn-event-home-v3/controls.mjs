#!/usr/bin/env node
import assert from 'node:assert/strict';
import {validate,InvalidEvidence} from './validate.mjs';
const c={name:'control',kind:'acceptance',assertions:['A','B']},binding={check:'control',phase:'base',runId:'0'.repeat(32),commit:'a'.repeat(40),sourceHashes:{source:'b'.repeat(64)},helperHashes:{helper:'c'.repeat(64)},startedMs:1,endedMs:4},receipt={version:1,...binding,mode:'acceptance',startedMs:2,endedMs:3,actualExit:1,results:[{id:'A',actualExit:0,detail:'actual',durationMs:1},{id:'B',actualExit:1,detail:'finite',durationMs:1}]};
assert.deepEqual(validate(receipt,c,binding,1).map(r=>r.status),['pass','fail']);
const mutations=[r=>r.results.pop(),r=>r.results[1].id='A',r=>r.runId='wrong',r=>r.commit='wrong',r=>r.helperHashes={},r=>r.sourceHashes={},r=>r.endedMs=0,r=>r.actualExit=99,r=>r.results[1].actualExit=99,r=>r.actualExit=0,r=>r.results.reverse(),r=>r.results[0].durationMs=-1];
for(const mutate of mutations){const r=structuredClone(receipt);mutate(r);assert.throws(()=>validate(r,c,binding,1),InvalidEvidence);}
console.log('13 Saturn005 receipt controls passed: one finite RED reference plus twelve malformed/stale/incomplete/source/exit rejections.');
const {classifyError}=await import('./classify.mjs');
const {HarnessError,ApplicationFailure}=await import('../staging-workspace-entry/harness.mjs');
assert.equal(classifyError(new assert.AssertionError({message:'finite assertion'})),1);
const matcher=new Error('reached matcher');matcher.matcherResult={pass:false};assert.equal(classifyError(matcher),1);
for(const e of [new HarnessError('missing dependency'),new ApplicationFailure('HTTP500'),Object.assign(new Error('deadline'),{name:'TimeoutError',matcherResult:{pass:false}}),Object.assign(new Error('aborted'),{name:'AbortError'}),new Error('unexpected callback')])assert.equal(classifyError(e),99);
console.log('7 error-classification controls passed: finiteassertion/matcher1, infrastructure/HTTP500/actiontimeout/abort/unexpected99.');

assert.equal(classifyError(Object.assign(new Error('Target page, context or browser has been closed'),{matcherResult:{pass:false}})),99);
console.log('Closedbrowser error with matcher metadata remains99.');
