// Independent read-only hosted Entry render. Never creates a profile or session.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const dir='docs/evidence/overnight-release';
const binding=JSON.parse(await readFile(dir+'/ROOT_DEPLOY_READBACK.json','utf8'));
assert.equal(binding.origin,'https://staging.bidzizi.com');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
const page=await context.newPage(),requests=[],errors=[],captures=[];
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/*',async route=>{
 const request=route.request();requests.push({method:request.method(),url:request.url()});
 if(!['GET','HEAD'].includes(request.method())||!request.url().startsWith(binding.origin+'/'))return route.abort();
 await route.continue();
});
try{
 const hashes=[];
 for(const expected of binding.assets){
  const response=await context.request.get(binding.origin+expected.path);assert.equal(response.status(),200);
  const sha256=createHash('sha256').update(await response.body()).digest('hex');assert.equal(sha256,expected.sha256);
  hashes.push({path:expected.path,sha256,sourceMatches:true});
 }
 const root=await context.request.get(binding.origin+'/',{maxRedirects:0});
 assert.equal(root.status(),307);assert.equal(root.headers().location,binding.root.location);
 for(const eventId of ['990280fa-51db-47cd-aabe-5d15bf776002','9c32e7e7-cf56-4c6b-a1fb-3e31a5d009c6']){
  const response=await page.goto(binding.origin+'/events/'+eventId);assert.equal(response.status(),200);
  await page.getByRole('heading',{name:'Create your demo profile'}).waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;});
  const session=await (await context.request.get(binding.origin+'/api/session')).json();assert.equal(session.authenticated,false);
  const entry=await (await context.request.get(binding.origin+'/api/demo/events/'+eventId+'/entry')).json();
  assert.equal(entry.demoEntry,true);assert.equal(entry.eventId,eventId);
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight}));
  assert.equal(metrics.width,390);assert.equal(metrics.height,844);assert.equal(metrics.dpr,1);assert.ok(metrics.documentWidth<=390);
  const filename='ANONYMOUS_ENTRY_'+eventId.slice(0,8)+'_390.png';await page.screenshot({path:dir+'/'+filename,fullPage:true});
  captures.push({eventId,filename,metrics,authenticated:false,entryEnabled:true});
 }
 assert.equal(errors.length,0);assert.ok(requests.every(r=>['GET','HEAD'].includes(r.method)));
 const report={checkedAt:new Date().toISOString(),origin:binding.origin,announcedDeployedSource:binding.sourceCommit,
  sourceBinding:'Prior exact metadata/alias readback plus fresh matching six served interface hashes; metadata not requeried by this render probe.',
  scope:'Anonymous native Entry rendering only; no profile, sign-in, admission, bidding or private closed-state acceptance claimed.',
  readOnly:true,root:{status:root.status(),location:root.headers().location},hashes,captures,requests,errors,browserClosedInFinally:true};
 await writeFile(dir+'/ANONYMOUS_ENTRY_READBACK.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({path:dir+'/ANONYMOUS_ENTRY_READBACK.json',captures:captures.map(c=>c.filename),errors}));
}finally{await browser.close();}
