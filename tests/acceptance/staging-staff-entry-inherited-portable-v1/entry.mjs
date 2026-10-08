// Root-only versioned declaration portability. Import the unchanged739 delegate
// in this process, retaining its signals, cleanup, argv index and original body.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {observeAliases,validateAliases} from './guard.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),root=resolve(process.env.VERIFY_ROOT||process.cwd());
const mappingURL=new URL('./ALIASES.json',import.meta.url),originalArgv=process.argv.slice(),originalResult=process.env.VERIFY_RESULT_JSON;
let output;
try{
 const index=Number(process.argv[2]);assert.equal(process.argv.length,3);assert.ok(Number.isInteger(index)&&index>=0&&index<32);
 assert.ok(originalResult&&resolve(originalResult)===originalResult,'Exact original schema2 result path');
 try{await lstat(originalResult);throw Error('Preexisting verifier result refused');}catch(error){if(error.code!=='ENOENT')throw error;}
 const mappingBytes=await readFile(mappingURL),mapping=JSON.parse(mappingBytes);
 const before=await observeAliases(root,mapping);validateAliases(before,mapping);
 await mkdir('/tmp/task-root',{recursive:true});output=await mkdtemp('/tmp/task-root/staff-entry-inherited-portable-');
 const privateResult=join(output,'UNCHANGED_DELEGATE_RESULT.json');
 process.argv=[originalArgv[0],join(root,mapping.originalDelegate),String(index)];
 process.env.VERIFY_RESULT_JSON=privateResult;
 await import(pathToFileURL(join(root,mapping.originalDelegate)).href);
 const originalExit=process.exitCode??0,after=await observeAliases(root,mapping);
 validateAliases(after,mapping);assert.deepEqual(after,before,'Alias/original identity unchanged during original group');
 assert.equal(sha(await readFile(mappingURL)),sha(mappingBytes),'Mapping unchanged during original group');
 assert.ok([0,1].includes(originalExit),'Original group must complete its own valid finite protocol');
 const bytes=await readFile(privateResult);
 // No assertion, phase, run token, status, detail or observation is rewritten.
 await writeFile(join(output,'PORTABILITY_RECEIPT.json'),JSON.stringify({version:1,index,predecessorFreeze:mapping.predecessorFreeze,originalDelegate:mapping.originalDelegate,delegateArgv:process.argv,originalExit,mappingSHA256:sha(mappingBytes),before,after,privateResult:{path:privateResult,sha256:sha(bytes)},forwardedResultSHA256:sha(bytes),observationsNormalized:false,bodyChanged:false},null,2)+'\n',{flag:'wx'});
 await writeFile(originalResult,bytes,{flag:'wx'});process.exitCode=originalExit;
 console.log('INHERITED_PORTABILITY_RECEIPT '+join(output,'PORTABILITY_RECEIPT.json'));
}catch(error){
 if(output)await writeFile(join(output,'FAILED.json'),JSON.stringify({classification:'HARNESS99',reason:error.message,terminalResult:false,observationsNormalized:false},null,2)+'\n',{flag:'wx'});
 console.error('HARNESS99 portable declaration '+error.message);process.exitCode=99;
}finally{
 process.argv=originalArgv;
 if(originalResult===undefined)delete process.env.VERIFY_RESULT_JSON;else process.env.VERIFY_RESULT_JSON=originalResult;
}
