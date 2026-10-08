// Preparation only: real disposable endpoint controls, never gate/application GREEN.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {withFixture,HarnessError,evidenceExit} from '../staging-manual-bid/harness.mjs';
import {prepareManualReceiptReadiness} from './readiness.mjs';
import {manualDriverSource} from './loader.mjs';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex'),startedMs=Date.now();
assert.ok(!process.env.NODE_OPTIONS&&!process.env.WELCOME_READINESS_CONTROL,'No undeclared loader/control environment');
const plan=JSON.parse(await readFile(new URL('./EXECUTION_SUPERSESSION.json',import.meta.url),'utf8')),maps=async()=>Object.fromEntries(await Promise.all(plan.successorChain.map(async p=>[p,hash(await readFile(join(root,p)))]))),before=await maps();
await mkdir('/tmp/task-root',{recursive:true});const output=await mkdtemp('/tmp/task-root/welcome-readiness-v2-controls-'),results=[],records=[];
const nativeLog=console.log;console.log=(...values)=>{if(typeof values[0]==='string'&&values[0].startsWith('MANUAL_RECEIPT_READINESS '))records.push(JSON.parse(values[0].slice('MANUAL_RECEIPT_READINESS '.length)));nativeLog(...values);};
const original=await readFile(join(root,plan.path),'utf8');assert.equal(hash(manualDriverSource(original,'acceptance')),plan.executedSHA256);assert.equal(manualDriverSource(original,'adversarial'),original);assert.equal(manualDriverSource(original,'list'),original);
for(const [control,source] of [['MISSING_ANCHOR',original.replace(plan.original,'')],['DUPLICATE_ANCHOR',original+plan.original]]){let actualExit=0,detail='';try{manualDriverSource(source,'acceptance');}catch(e){actualExit=e.message.startsWith('HARNESS99')?99:1;detail=e.message;}assert.equal(actualExit,99);results.push({control,actualExit,expectedExit:99,detail,gateProof:false});}
for(const control of ['REFERENCE','WRONG_STATUS','MISSING_ROUTE','HANG']){
 let actualExit=0,detail='',servedSource=null;const started=Date.now(),recordStart=records.length;
 await withFixture(async f=>{
  const route=join(f.scratch,'app/src/app/api/bidder/events/[eventId]/lots/[lotId]/bid-receipts/[requestId]/route.ts'),source=await readFile(route,'utf8');
  if(control==='WRONG_STATUS'){const served="export const runtime='nodejs';export async function GET(){return Response.json({error:{code:'CONTROL_WRONG_STATUS',message:'Controlled unavailable route'}},{status:503,headers:{'Cache-Control':'private, no-store'}});}\n";await writeFile(route,served);servedSource={originalSHA256:hash(source),servedSHA256:hash(served),effect:'503 from actual disposable route'};}
  if(control==='MISSING_ROUTE'){await rm(route);servedSource={originalSHA256:hash(source),servedSHA256:null,effect:'Actual disposable receipt route file absent'};}
  if(control==='HANG'){const served="export const runtime='nodejs';export async function GET(){await new Promise(()=>{});return new Response('unreachable');}\n";await writeFile(route,served);servedSource={originalSHA256:hash(source),servedSHA256:hash(served),effect:'Actual disposable route never responds'};}
  try{await prepareManualReceiptReadiness(f);}catch(e){actualExit=evidenceExit(e);detail=e.message;assert.ok(e instanceof HarnessError,'Readiness refusal keeps original HarnessError type');}
 });
 const expectedExit=control==='REFERENCE'?0:99;assert.equal(actualExit,expectedExit);assert.equal(records.length-recordStart,1);const record=records.at(-1);assert.ok(record.databaseUnchanged&&record.beforePrepareFixture,'Every endpoint control leaves all rows and short schedules untouched');
 results.push({control,expectedExit,actualExit,detail,durationMs:Date.now()-started,servedSource,readiness:record,gateProof:false});await writeFile(join(output,'PROGRESS.json'),JSON.stringify({startedMs,results},null,2)+'\n');
}
assert.deepEqual(await maps(),before);const receipt={version:2,sourceRoot:root,startedMs,endedMs:Date.now(),sourceAndHelperHashes:before,originalDriverSHA256:plan.originalSHA256,executedDriverSHA256:plan.executedSHA256,results,gateProof:false,scope:'Source-sealed standalone bootstrap controls only; no business or aggregate pass claim'};const path=join(output,'CONTROLS_RECEIPT.json');await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('WELCOME_READINESS_V2_CONTROLS '+JSON.stringify({path,sha256:hash(await readFile(path))}));
