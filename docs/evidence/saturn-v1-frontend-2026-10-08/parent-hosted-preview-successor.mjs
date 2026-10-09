import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
const source=process.argv[2];
assert.match(source??'',/^[0-9a-f]{40}$/);
const origin='https://staging.bidzizi.com',eventId='990280fa-51db-47cd-aabe-5d15bf776002';
const dir=new URL('.',import.meta.url).pathname+'hosted-preview-successor-'+source.slice(0,7);
await mkdir(dir,{recursive:true});
const require=createRequire('/Users/jryear/orca/workspaces/integration/saturn-v1-member-ui/package.json');
const {chromium}=require('@playwright/test');
const expected={
  '/staging-bidder-preview/styles.css':'779ce573f2d26c47bea51278ddf5c2f57bd834f8855bd3e841dc399728ee2fb0',
  '/staging-bidder-preview/src/views.js':'dfa0d2c1e25215a1d8e53378fa39d2d5241a2433673aedc32db5a1cd4b6bc5b4'
};
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1120},deviceScaleFactor:1}),page=await context.newPage();
page.setDefaultTimeout(10000);
const checks=[],errors=[],served=[],images=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('/assets/'))images.push({path:u.pathname,status:r.status()});});
let metrics,logoutStatus,loggedIn=false,failure;
try {
  for(const [path,sha256] of Object.entries(expected)){
    const r=await context.request.get(origin+path);assert.equal(r.status(),200);
    const actual=createHash('sha256').update(await r.body()).digest('hex');
    assert.equal(actual,sha256);served.push({path,sha256:actual,status:r.status()});
  }
  checks.push('Actual served two-file repair hashes match exact dbf2e8f source');
  const login=await context.request.post(origin+'/api/test-auth/login',{data:{account:'staff-saturn'},headers:{origin}});
  assert.equal(login.status(),200);loggedIn=true;
  await page.goto(origin+`/admin?event=${eventId}&tab=lots`);
  const admin=page.frameLocator('iframe[title="BidZizi admin workspace"]');
  await admin.locator('.inventory').waitFor();
  if(!await admin.locator('#bidder-frame').isVisible())await admin.locator('#preview-toggle').click();
  await admin.locator('[data-preview-mode="saved"]').click();
  assert.equal(await admin.locator('[data-preview-mode="saved"]').getAttribute('aria-pressed'),'true');
  const preview=await (await admin.locator('#bidder-frame').elementHandle()).contentFrame();
  assert.ok(preview);
  await preview.waitForURL(/\/staging-bidder-preview\/index.html/);
  await admin.getByRole('button',{name:'Selected lot',exact:true}).click();
  await preview.waitForURL(/#\/lot\//);
  await preview.locator('.preview-stub').waitFor();
  await preview.locator('img').first().evaluate(i=>Promise.race([i.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('visible hero decode timeout')),5000))]));
  await preview.locator('.preview-stub').evaluate(async el=>{await document.fonts.ready;el.scrollIntoView({block:'center'});});
  metrics=await preview.locator('.preview-stub').evaluate(el=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};
    const amount=el.querySelector('.amt.xl'),range=document.createRange();range.selectNodeContents(amount);
    const button=document.querySelector('.ab-row .btn');
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,
      amount:amount.innerText,fontSize:getComputedStyle(amount).fontSize,text:rect(range),main:rect(el.querySelector('.stub-main')),side:rect(el.querySelector('.stub-side')),
      previewOnly:button.disabled&&button.innerText==='Preview only',images:[...document.images].map(i=>({path:new URL(i.src).pathname,complete:i.complete,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight}))};
  });
  assert.equal(metrics.width,340);assert.equal(metrics.documentWidth,340);
  assert.equal(metrics.amount,'T$25.01');assert.equal(metrics.fontSize,'34px');
  assert.ok(metrics.text.right<metrics.side.left);assert.equal(metrics.previewOnly,true);
  assert.ok(metrics.images.some(i=>i.complete&&i.naturalWidth===1000));
  checks.push('Actual normal saved Selected lot at340 retains exact25.01 and clears BIDS column');
  checks.push('Decoded hosted private cabin photo and disabled preview control remain');
  const path=dir+'/desktop-saved-selected-repaired.png';await page.screenshot({path});
  const png=await readFile(path);assert.equal(png.readUInt32BE(16),1440);assert.equal(png.readUInt32BE(20),1120);
  assert.deepEqual(errors,[]);
}catch(error){failure=String(error);}
finally{
  if(loggedIn){const r=await context.request.post(origin+'/api/session/logout',{data:{},headers:{origin}}).catch(()=>null);logoutStatus=r?.status();}
  await context.close();await browser.close();
  await writeFile(dir+'/PARENT_HOSTED_PREVIEW_READBACK.json',JSON.stringify({source,origin,eventId,kind:'ACTUAL_HOSTED_SAVED_PREVIEW_SUCCESSOR_READ_ONLY',sourceBinding:'Backend verified exact READY announcement plus actual served repair hashes',runtime:process.version,served,checks,metrics,images,errors,logoutStatus,failure,scope:'Fresh own synthetic staff session only; no fixture/grant edits; contexts closed'},null,2));
}
if(failure)throw Error(failure);
assert.equal(logoutStatus,200);
console.log(JSON.stringify({source,dir,checks,amount:metrics.amount,width:metrics.width,logoutStatus,errors}));
