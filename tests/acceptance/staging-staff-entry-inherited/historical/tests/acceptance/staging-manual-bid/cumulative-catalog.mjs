// Additive003 cumulative entry. Original002 assertions/harness remain byte-exact.
const valid=['acceptance','adversarial'];
export function cumulativeExit(error,{originalTree,HarnessError,ApplicationFailure}){
 if(['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(error?.code))return 99;
 if(HarnessError&&error instanceof HarnessError)return 99;
 if(ApplicationFailure&&error instanceof ApplicationFailure&&originalTree==='base')return 99;
 return 1;
}
export async function runCumulative(mode,{originalTree=process.env.VERIFY_TREE,
 importHarness=()=>import('../staging-catalog/harness.mjs'),
 importChecks=()=>import('../staging-catalog/checks.mjs')}={}){
 let harness;
 const prior=process.env.VERIFY_TREE;
 if(!valid.includes(mode)){console.error('HARNESS: Cumulative catalog mode must be acceptance or adversarial.');return 99;}
 // Explicit cumulative context bypasses only002's one-time absent-feature base preflight.
 // Its unmodified run() still enforces implemented anonymous401 and every fixed4/7 group.
 process.env.VERIFY_TREE='cumulative-catalog';
 try{harness=await importHarness();const {run}=await importChecks();await run(mode);return 0;}
 catch(error){console.error((['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(error?.code)?'HARNESS dependency':error?.constructor?.name||'FAIL')+': '+error.message);
  return cumulativeExit(error,{originalTree,HarnessError:harness?.HarnessError,ApplicationFailure:harness?.ApplicationFailure});}
 finally{if(prior===undefined)delete process.env.VERIFY_TREE;else process.env.VERIFY_TREE=prior;}
}
// Pure controls may import this wrapper without starting application fixtures.
import {pathToFileURL} from 'node:url';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 process.exitCode=await runCumulative(process.argv[2]);
