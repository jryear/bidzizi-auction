// Root invokes only AFTER exact Entry36 SUPPORTED and fresh source review GO.
// Records bytes from that committed candidate; no merge/reset/product mutation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),sha=b=>createHash('sha256').update(b).digest('hex');
// Read only the exact frozen task's simple JSON-compatible scalar/array lines.
// Unsupported/duplicate declarations are refused rather than inferred.
export function frozenEntryGroups(taskText,binding){
 assert.equal(sha(taskText),binding.new36IDContract.sha256,'Exact frozen task bytes');
 const field=(text,key)=>{const rows=[...text.matchAll(new RegExp('^'+key+' = (.+)$','gm'))];assert.equal(rows.length,1,'One exact frozen '+key);return JSON.parse(rows[0][1]);};
 const [header,...blocks]=taskText.split(/^\[\[checks\]\]\r?$/m);
 assert.equal(field(header,'id'),binding.new36IDContract.id,'Exact frozen task identity');
 assert.equal(blocks.length,9,'Exact nine frozen groups');
 const groups=blocks.map(block=>({name:field(block,'name'),kind:field(block,'kind'),assertions:field(block,'assertions')}));
 assert.equal(new Set(groups.map(g=>g.name)).size,9);
 const ids=groups.flatMap(g=>g.assertions);assert.equal(ids.length,36);assert.equal(new Set(ids).size,36);
 return groups;
}
export function validateAcceptedEntryReceipt(receipt,revision,binding,taskText){
 const groups=frozenEntryGroups(taskText,binding);
 assert.equal(receipt.schema,2);assert.equal(receipt.head,revision,'Actual kernel receipt exact source');
 assert.equal(receipt.verdict,'supported','Actual kernel supported verdict');
 assert.equal(receipt.task_id,binding.new36IDContract.id,'Actual frozen015 task receipt');
 assert.equal(receipt.spec_sha256,binding.new36IDContract.sha256,'Exact frozen015 contract bytes');
 assert.equal(receipt.base_ref,binding.selectedProductBase,'Actual trusted015 base');
 assert.equal(receipt.verifier_sha256,binding.kernel.sha256);assert.equal(receipt.verifier_version,binding.kernel.version);
 assert.equal(receipt.dirty_before_log,false);assert.deepEqual(receipt.reasons,[]);
 assert.equal(receipt.source_binding.base.commit,binding.selectedProductBase);
 assert.equal(receipt.source_binding.candidate.commit,revision);
 for(const key of ['candidate_snapshot','clean_before','unchanged_after'])assert.equal(receipt.source_binding[key],true,'Actual clean source binding '+key);
 assert.ok(Array.isArray(receipt.candidate_checks));assert.equal(receipt.candidate_checks.length,groups.length);
 assert.deepEqual(receipt.candidate_checks.map(c=>c.name),groups.map(g=>g.name),'All exact frozen group names/order');
 const runIDs=[];
 receipt.candidate_checks.forEach((check,index)=>{
  const expected=groups[index],result=check.assertion_result;
  assert.equal(check.kind,expected.kind);assert.equal(check.expected_exit,0);
  assert.equal(check.passed,true);assert.equal(check.harness_error,false);assert.equal(check.exit,0);assert.deepEqual(check.failed_assertions,[]);
  assert.deepEqual(Object.keys(result).sort(),['protocol','check','phase','run_id','assertions'].sort());
  assert.equal(result.protocol,1);assert.equal(result.phase,'candidate');assert.equal(result.check,expected.name);
  assert.match(result.run_id,/^[a-f0-9]{32}$/);runIDs.push(result.run_id);
  assert.ok(Array.isArray(result.assertions));assert.equal(result.assertions.length,expected.assertions.length);
  assert.deepEqual(result.assertions.map(row=>row.id).sort(),expected.assertions.slice().sort(),'Exact frozen assertion IDs for '+expected.name);
  assert.equal(new Set(result.assertions.map(row=>row.id)).size,expected.assertions.length);
  assert.ok(result.assertions.every(row=>row.status==='pass'&&typeof row.detail==='string'));
 });
 assert.equal(new Set(runIDs).size,groups.length,'Distinct actual check invocation run IDs');
 return true;
}
async function main(){
const revision=process.argv[2],receiptPath=process.argv[3],reviewPath=process.argv[4];
if(process.argv.length!==5||!(/^[a-f0-9]{40}$/).test(revision||'')||!receiptPath||!reviewPath)throw Error('Exact accepted Entry commit, SUPPORTED receipt and fresh GO source-review paths required');
const bindingPath=new URL('./SOURCE_BINDING.json',import.meta.url),binding=JSON.parse(await readFile(bindingPath));
assert.equal(binding.entrySuccessorExecutionHold,false,'Root-supplied exact successor freeze/task and independent review required; execution remains held');
const command=args=>{const r=spawnSync('/usr/bin/git',args,{cwd:root,encoding:'utf8',timeout:5000});if(r.error||r.status!==0)throw Error('Git source binding unavailable');return r.stdout.trim();};
assert.equal(command(['rev-parse','HEAD']),revision);assert.equal(command(['status','--porcelain','--untracked-files=no']),'','Committed clean product/evidence tree required');
const receiptBytes=await readFile(receiptPath),reviewBytes=await readFile(reviewPath),receipt=JSON.parse(receiptBytes),review=JSON.parse(reviewBytes);
// Use actual semantic fields, never substring matches in an error/history body.
validateAcceptedEntryReceipt(receipt,revision,binding,await readFile(join(root,binding.new36IDContract.path),'utf8'));
const reviewCommits=['candidate','candidateCommit','commit','acceptedCommit'].filter(k=>typeof review[k]==='string').map(k=>review[k]);
assert.ok(reviewCommits.length>0&&reviewCommits.every(commit=>commit===revision),'Fresh independent review exact source');
const reviewVerdict=typeof review.verdict==='string'?review.verdict:review.status;
assert.ok(typeof reviewVerdict==='string'&&/^(?:GO(?:_|$)|SOURCE_GO(?:_|$))/.test(reviewVerdict),'Fresh independent source GO verdict');
for(const [p,h] of Object.entries(binding.immutableCurrentApplicationSHA256))assert.equal(sha(await readFile(join(root,p))),h,'Preserved current immutable source '+p);
for(const [p,h] of Object.entries(binding.entryEvidenceSHA256))assert.equal(sha(await readFile(join(root,p))),h,'Exact reviewed Entry freeze evidence '+p);
const paths=command(['ls-files','src','public','migrations','scripts','vendor']).split('\n').filter(Boolean),acceptedApplicationSHA256=Object.fromEntries(await Promise.all(paths.sort().map(async p=>[p,sha(await readFile(join(root,p)))])));
binding.acceptedEntry={commit:revision,completionReceipt:{path:resolve(receiptPath),sha256:sha(receiptBytes)},sourceReview:{path:resolve(reviewPath),sha256:sha(reviewBytes)},acceptedApplicationSHA256};binding.status='REBOUND_REQUIRES_INDEPENDENT_STATIC_REVIEW_AND_TRUSTED_FREEZE';
await writeFile(bindingPath,JSON.stringify(binding,null,2)+'\n');console.log(JSON.stringify({status:binding.status,acceptedEntry:revision,applicationPaths:paths.length,productMutated:false}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
