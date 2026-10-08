import assert from 'node:assert/strict';
import {HarnessError,ApplicationFailure,browserFailure} from '../staging-workspace-entry/harness.mjs';
export function classifyError(error){
 const e=browserFailure(error);
 if(e instanceof HarnessError||e instanceof ApplicationFailure||['TimeoutError','AbortError'].includes(e?.name))return 99;
 if(e instanceof assert.AssertionError)return 1;
 // Playwright matcher failures are reached observations, distinct from action/transport deadlines.
 if(e?.name==='Error'&&e?.matcherResult&&typeof e.matcherResult==='object'&&typeof e.matcherResult.pass==='boolean')return 1;
 return 99;
}
