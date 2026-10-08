import assert from 'node:assert/strict';
import {commandRows} from '../staging-workspace-entry-schema2-v1/validate.mjs';
const c={assertions:['UNCHANGED_COMMAND'],mode:'adapter',index:0,marker:'COMPLETE',count:1};
const semantic='PASS meaningful observation\nCOMPLETE\n';
assert.equal(commandRows(c,{exit:0,stdout:semantic,stderr:'',phase:'candidate'})[0].status,'pass');
const provenance='STUDIO_INHERITED_SUCCESSOR {"path":"tests/acceptance/staging-workspace-entry/harness.mjs"}\n';
assert.throws(()=>commandRows(c,{exit:0,stdout:provenance+semantic,stderr:'',phase:'candidate'}));
for(const error of ['HARNESS99','ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','Cannot find module','Cannot find package','SyntaxError','ReferenceError','TypeError','INTERNAL DEADLINE','ETIMEDOUT','TimeoutError','AbortError','timed out','exceeded deadline','setup failed','ENOENT']){
 assert.throws(()=>commandRows(c,{exit:0,stdout:semantic,stderr:error,phase:'candidate'}),error);
 assert.throws(()=>commandRows(c,{exit:0,stdout:error+'\n'+semantic,stderr:'',phase:'candidate'}),error);
}
assert.throws(()=>commandRows(c,{exit:0,stdout:semantic+'COMPLETE\n',stderr:'',phase:'candidate'}));
assert.throws(()=>commandRows(c,{exit:0,stdout:'COMPLETE\n',stderr:'',phase:'candidate'}));
console.log(JSON.stringify({status:'TRUE_ERROR_AND_MARKER_CONTROLS_PASS',frozenClassifierImported:true,trueErrorsRejectedBothStreams:16,benignProducerProblemReproduced:true,classifierModified:false,runtimeStarted:false}));
