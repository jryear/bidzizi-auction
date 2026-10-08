// One original A07/A08 causal preparation; original whole acceptance runner is retained.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {withBidFixture,evidenceExit} from '../staging-manual-bid/driver.mjs';
import {boundCases} from '../staging-manual-bid/bound-probes.mjs';
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),hash=b=>createHash('sha256').update(b).digest('hex'),startedMs=Date.now(),control=process.argv[3]||'REFERENCE';
assert.ok(process.argv.length<=4&&process.argv[2]==='acceptance'&&['REFERENCE','BUSINESS_MISMATCH'].includes(control));assert.equal(process.env.NODE_OPTIONS,'--import='+join(root,'tests/acceptance/staging-welcome-readiness-v2/loader.mjs'));assert.equal(process.env.VERIFY_TREE,'candidate','Direct business failure classification remains original candidate mode');
const plan=JSON.parse(await readFile(new URL('./EXECUTION_SUPERSESSION.json',import.meta.url),'utf8')),maps=async()=>Object.fromEntries(await Promise.all(plan.successorChain.map(async p=>[p,hash(await readFile(join(root,p)))]))),before=await maps();
await mkdir('/tmp/task-root',{recursive:true});const output=await mkdtemp('/tmp/task-root/welcome-readiness-v2-case-'),events=[],sourceControls=[],readiness=[];
const nativeLog=console.log;console.log=(...values)=>{if(typeof values[0]==='string'&&values[0].startsWith('MANUAL_RECEIPT_READINESS '))readiness.push(JSON.parse(values[0].slice('MANUAL_RECEIPT_READINESS '.length)));nativeLog(...values);};
const launch=chromium.launch.bind(chromium);chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);browser.newContext=async(...options)=>{
  const context=await newContext(...options),newPage=context.newPage.bind(context);context.newPage=async(...pageOptions)=>{
   const page=await newPage(...pageOptions),pageId=events.filter(e=>e.type==='page').length;events.push({type:'page',pageId,ms:Date.now()-startedMs});
   if(control==='BUSINESS_MISMATCH')await page.route('**/staging-catalog/bidding.js',async route=>{const response=await route.fetch(),source=await response.text(),anchor=":'Outbid')";assert.equal(source.split(anchor).length,2,'Single business-standing presentation anchor');const served=source.replace(anchor,":'CONTROL wrong standing')");sourceControls.push({path:'/staging-catalog/bidding.js',originalSHA256:hash(source),servedSHA256:hash(served),gateProof:false});await route.fulfill({response,body:served});});
   page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.includes('/bid-receipts/'))events.push({type:'receiptRequest',pageId,ms:Date.now()-startedMs,path,method:r.method()});});
   page.on('response',async r=>{const path=new URL(r.url()).pathname;if(path.includes('/bid-receipts/')){const event={type:'receiptResponse',pageId,ms:Date.now()-startedMs,path,status:r.status()};events.push(event);try{event.data=await r.json();}catch{event.bodyUnavailable=true;}}});
   page.on('framenavigated',frame=>{const event={type:'navigation',pageId,ms:Date.now()-startedMs,path:new URL(frame.url()).pathname,main:frame===page.mainFrame()};events.push(event);frame.evaluate(()=>performance.timeOrigin).then(t=>event.timeOrigin=t,()=>event.identityUnavailable=true);});
   return page;
  };return context;
 };return browser;
};
let actualExit=0,error=null;const probe=boundCases.find(p=>p.id==='BID-A07/A08');assert.ok(probe);
try{await withBidFixture(probe.run,probe.scenario);}catch(e){actualExit=evidenceExit(e);error={name:e.name,message:e.message};}
assert.deepEqual(await maps(),before);assert.equal(readiness.length,1);assert.ok(readiness[0].status==='ready'&&readiness[0].response.status===401&&readiness[0].databaseUnchanged&&readiness[0].beforePrepareFixture);const expectedExit=control==='REFERENCE'?0:1;assert.equal(actualExit,expectedExit,'Original direct business assertion retains designated finite result');
const receipt={version:2,sourceRoot:root,startedMs,endedMs:Date.now(),control,actualExit,expectedExit,error,sourceAndHelperHashes:before,originalDriverSHA256:plan.originalSHA256,executedDriverSHA256:plan.executedSHA256,originalCaseId:probe.id,originalScenario:probe.scenario,readiness,events,sourceControls,gateProof:false,wholeSevenCaseWrapperExecuted:false,scope:'One unchanged original case through actual acceptance-mode loader, not full command or application GREEN; original5s matcher and classifier unchanged'};const path=join(output,'CASE_RECEIPT.json');await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log('WELCOME_READINESS_V2_CASE '+JSON.stringify({path,sha256:hash(await readFile(path)),actualExit,control}));
