import assert from 'node:assert/strict';
import {runCumulative,cumulativeExit} from './cumulative-catalog.mjs';
class HarnessError extends Error{};class ApplicationFailure extends Error{};
const missing=()=>Object.assign(new Error('fixed missing dependency'),{code:'ERR_MODULE_NOT_FOUND'});
const harness={HarnessError,ApplicationFailure};let checks=0;
for(const tree of ['base','candidate']){
 for(const [error,expected]of[[new HarnessError('setup'),99],[missing(),99],[new ApplicationFailure('reached app'),tree==='base'?99:1],[new Error('fixed ordinary assertion'),1]]){
  assert.equal(cumulativeExit(error,{originalTree:tree,...harness}),expected);checks++;
 }
 for(const mode of ['acceptance','adversarial']){
  let calls=0;const expected=mode==='acceptance'?4:7;
  process.env.VERIFY_TREE=tree;
  const exit=await runCumulative(mode,{originalTree:tree,importHarness:async()=>harness,importChecks:async()=>({async run(actual){assert.equal(actual,mode);assert.equal(process.env.VERIFY_TREE,'cumulative-catalog');for(let i=0;i<expected;i++)calls++;assert.equal(calls,expected);}})});
  assert.equal(exit,0);assert.equal(calls,expected);assert.equal(process.env.VERIFY_TREE,tree);checks++;
 }
 process.env.VERIFY_TREE=tree;
 for(const [error,expected]of[[new HarnessError('fixed infra99'),99],[new ApplicationFailure('fixed reached app'),tree==='base'?99:1],[new Error('fixed nonzero assertion'),1]]){
  const code=await runCumulative('acceptance',{originalTree:tree,importHarness:async()=>harness,importChecks:async()=>({run:async()=>{throw error;}})});
  assert.equal(code,expected);assert.equal(process.env.VERIFY_TREE,tree);checks++;
 }
 let imported=false;
 const invalid=await runCumulative('unknown',{originalTree:tree,importHarness:async()=>{imported=true;return harness;}});
 assert.equal(invalid,99);assert.equal(imported,false);assert.equal(process.env.VERIFY_TREE,tree);checks++;
}
delete process.env.VERIFY_TREE;
assert.equal(await runCumulative('adversarial',{originalTree:undefined,importHarness:async()=>harness,importChecks:async()=>({run:async()=>{}})}),0);
assert.equal(Object.hasOwn(process.env,'VERIFY_TREE'),false);checks++;
console.log(JSON.stringify({pure_checks:checks,scope:'Classification/context controls only; mock fixed4/7 invocation counts do not prove product groups.'}));
