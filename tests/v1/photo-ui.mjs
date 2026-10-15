#!/usr/bin/env node
// Browser races and visual evidence; APIs are intercepted, so this suite does not write a database.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
const BASE=process.env.BASE??'http://127.0.0.1:3421', EVENT='11111111-1111-4111-8111-111111111111';
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const iso=n=>new Date(Date.now()+n).toISOString();
const image=await sharp(Buffer.from(`<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="600" fill="#cdd9d3"/><path d="M0 410L140 160 430 450 650 130 900 400V600H0Z" fill="#708c83"/><path d="M0 500Q400 290 900 500V600H0Z" fill="#355b4e"/><rect x="640" y="285" width="150" height="150" rx="4" fill="#e3b26d"/><path d="M620 290L715 215 810 290Z" fill="#263f3c"/><rect x="685" y="350" width="45" height="85" fill="#283f3a"/><circle cx="100" cy="90" r="38" fill="#f6da91"/></svg>`)).png().toBuffer();
const replacement=await sharp({create:{width:40,height:40,channels:4,background:'#f2b632'}}).png().toBuffer();
const fixture=()=>({serverNow:iso(0),event:{id:EVENT,code:'PHOTOX',name:'Holiday Trade Show',welcome:'Good company. Great finds.',venue:'Saturn Hall',winnerInstructions:'Visit the welcome desk',coverAssetId:'asset-old',coverUrl:'/photo-old.png',coverFrame:{x:.8,y:.5,zoom:1},timezone:'America/Los_Angeles',startsAt:iso(3600000),endsAt:iso(7200000),accessEndsAt:iso(86400000),status:'draft',entryOpen:true,theme:'classic',bidMode:'fixed',tiers:[],fixedIncrementMinor:2500,donationsEnabled:false,donationDeadline:null,revision:1,phase:'upcoming',hasBids:false,isPractice:true,archivedAt:null,bidderDisplay:'anonymous',accentColor:null},items:[{id:'item-1',position:0,title:'A weekend in the woods',short:'Two nights, a little closer to nature.',description:'A peaceful cabin weekend for two.',category:'Travel',donor:'Juniper',imageAssetId:'asset-old',imageUrl:'/photo-old.png',imageFrame:{x:.8,y:.5,zoom:1},openingMinor:10000,incrementOverrideMinor:null,opensAt:null,closesAt:null,effectiveOpensAt:iso(3600000),effectiveClosesAt:iso(7200000),ready:true,revision:1,phase:'scheduled',currentMinor:null,bidCount:0,minimumNextMinor:10000,leader:null,bids:[],award:null,withdrawn:false,withdrawalMessage:'',hasBids:false}],participants:[],activity:[],pledges:[],recipients:[],sponsors:[{id:'sponsor-1',name:'Juniper',url:'',logoAssetId:'asset-old',logoUrl:'/photo-old.png'}]});
// The Studio canvas renders a server guest snapshot; project the fixture the way the preview endpoint would.
const preview=d=>({serverNow:d.serverNow,preview:true,me:{id:'preview',displayName:'A guest',businessName:'Your Business',canBid:true,pledges:[],bidderNumber:0,winnerInstructions:''},
 event:{id:d.event.id,code:d.event.code,name:d.event.name,welcome:d.event.welcome,venue:d.event.venue,timezone:d.event.timezone,theme:d.event.theme,bidderDisplay:d.event.bidderDisplay,coverUrl:d.event.coverUrl,coverFrame:d.event.coverFrame,
  startsAt:d.event.startsAt,endsAt:d.event.endsAt,accessEndsAt:d.event.accessEndsAt,entryOpen:true,phase:'upcoming',categories:[],sponsors:d.sponsors.map(s=>({name:s.name,url:s.url,logoUrl:s.logoUrl})),accentColor:null,donations:{enabled:false,open:false,deadline:null,capMinor:1000000,recipients:[]}},
 items:d.items.map(i=>({id:i.id,position:i.position,title:i.title,short:i.short,description:i.description,category:i.category,donor:i.donor,withdrawn:false,withdrawalMessage:'',bidHistory:[],imageUrl:i.imageUrl,imageFrame:i.imageFrame,
  openingMinor:i.openingMinor,opensAt:i.effectiveOpensAt,closesAt:i.effectiveClosesAt,phase:'scheduled',currentMinor:null,bidCount:0,leader:null,minimumNextMinor:i.openingMinor,incrementMinor:2500,watching:false,myHighestMinor:null,myBidCount:0,award:null}))});
const browser=await chromium.launch();let count=0,failed=0;
async function check(name,run){
 if(process.env.ONLY&&!name.includes(process.env.ONLY))return;
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),data=fixture(),writes=[],errors=[];
 const controls={patch:async()=>{},upload:async()=>{},rejectNext:false};let uploads=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/photo-*.png',r=>r.fulfill({contentType:'image/png',body:r.request().url().includes('old')?image:replacement}));
 await page.route('**/api/**',async r=>{
  const req=r.request(),path=new URL(req.url()).pathname;
  if(path.endsWith('/telemetry'))return r.fulfill({status:202,json:{ok:true}});
  if(req.method()==='GET'&&path.endsWith('/preview'))return r.fulfill({json:preview(data)});
  if(req.method()==='GET')return r.fulfill({json:structuredClone(data)});
  if(path.endsWith('/assets')){const n=++uploads;await controls.upload(n);return r.fulfill({status:201,json:{id:'asset-'+n,url:'/photo-'+n+'.png'}});}
  const body=req.postDataJSON();writes.push({path,...body});await controls.patch(body);
  if(controls.rejectNext){controls.rejectNext=false;return r.fulfill({status:503,json:{error:{message:'Please retry'}}});}
  if(req.method()==='PATCH'){
   const target=path.endsWith('/'+EVENT)?data.event:data.items[0];
   if(body.revision!==target.revision)return r.fulfill({status:409,json:{error:{message:'Revision conflict'}}});
   Object.assign(target,body,{revision:target.revision+1});
   if('coverAssetId'in body){target.coverUrl=body.coverAssetId?'/photo-'+body.coverAssetId.replace('asset-','')+'.png':null;if(!('coverFrame'in body))target.coverFrame={x:.5,y:.5,zoom:1};}
   if('imageAssetId'in body){target.imageUrl=body.imageAssetId?'/photo-'+body.imageAssetId.replace('asset-','')+'.png':null;if(!('imageFrame'in body))target.imageFrame={x:.5,y:.5,zoom:1};}
   return r.fulfill({json:{ok:true,revision:target.revision}});
  }
  if(body.sponsors)data.sponsors=body.sponsors.map((s,i)=>({...s,id:'sponsor-'+i,logoUrl:s.logoAssetId?'/photo-'+s.logoAssetId.replace('asset-','')+'.png':null}));
  return r.fulfill({json:{ok:true}});
 });
 try{await page.goto(BASE+'/studio/'+EVENT);await page.locator('.device-screen [data-guest-screen]').waitFor();await run({page,data,writes,controls});assert.deepEqual(errors,[]);count++;console.log('ok   '+name);}
 catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}
 finally{await ctx.close();}
}
const pick=async(page)=>page.locator('.device-screen .ph-drop input[type=file]').first().setInputFiles({name:'photo.png',mimeType:'image/png',buffer:replacement});
try{
 if(process.env.CAPTURE_ONLY){
  await check('matching desktop and phone photo evidence',async({page})=>{
   const out=process.env.SHOTS??'.shots/images/after';await mkdir(out,{recursive:true});
   await page.screenshot({path:out+'/welcome-1440.png',fullPage:false,animations:"disabled"});
   if(!process.env.BASELINE_ONLY){await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();await page.screenshot({path:out+'/adjust-1440.png',fullPage:false,animations:"disabled"});}
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/welcome-390.png',fullPage:false,animations:"disabled"});
   await page.setViewportSize({width:1440,height:1000});await page.locator('.inav-row').first().click();await page.screenshot({path:out+'/item-1440.png',fullPage:false,animations:"disabled"});
  });
 }else{
 // The saved frame's point sits right of centre: the photo is shifted left inside its box, and still covers it.
 const shifted=async loc=>loc.evaluate(img=>{const i=img.getBoundingClientRect(),b=img.parentElement.getBoundingClientRect();return {left:i.left-b.left,covers:i.left<=b.left+1&&i.right>=b.right-1&&i.top<=b.top+1&&i.bottom>=b.bottom-1};});
 await check('saved frame reaches the cover and item hero',async({page})=>{
  const cover=await shifted(page.locator('.ehero-media[data-photo-frame] > img'));assert.ok(cover.covers);
  await page.locator('.inav-row').click();await page.locator('.hero[data-photo-frame] > img').waitFor();
  const hero=await shifted(page.locator('.hero[data-photo-frame] > img'));assert.ok(hero.left<-1&&hero.covers,JSON.stringify(hero));
 });
 await check('zoom autosaves from the in-place editor and the strips show other shapes',async({page,data})=>{
  await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();await page.locator('[data-preview-device] [data-frame-editor]').waitFor();
  assert.equal(await page.locator('.fe-strip').count(),3);
  const slider=page.getByRole('slider',{name:'Zoom'});await slider.focus();await slider.press('End');
  await expect.poll(()=>data.event.coverFrame.zoom).toBe(4);await expect(page.locator('.save')).toHaveText('Saved');
  await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('[data-frame-editor]')).toHaveCount(0);
 });
 await check('failed framing save keeps the confirmed frame and saves on the next change',async({page,data,controls})=>{
  await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();controls.rejectNext=true;
  const slider=page.getByRole('slider',{name:'Zoom'});await slider.focus();await slider.press('End');
  await page.getByText('The framing wasn’t saved',{exact:false}).waitFor();assert.equal(data.event.coverFrame.zoom,1);
  await slider.press('ArrowLeft');await expect.poll(()=>data.event.coverFrame.zoom).toBeGreaterThan(3);
 });
 await check('confirmed image stays visible until the replacement PATCH succeeds',async({page,controls,writes})=>{
  const hold=gate();controls.patch=async()=>hold.promise;await pick(page);await expect.poll(()=>writes.length).toBe(1);
  await expect(page.locator('.ehero-media > img')).toHaveAttribute('src','/photo-old.png');hold.resolve();
  await expect(page.locator('.ehero-media > img')).toHaveAttribute('src','/photo-1.png');
 });
 await check('failed replacement retains the photo and can retry',async({page,controls,data})=>{
  controls.rejectNext=true;await pick(page);await page.locator('.photo-error').waitFor();assert.equal(data.event.coverAssetId,'asset-old');
  await expect(page.locator('.ehero-media > img')).toHaveAttribute('src','/photo-old.png');await page.locator('.photo-error button').click();
  await expect.poll(()=>data.event.coverAssetId).toBe('asset-2');
 });
 await check('removing a photo during upload cannot restore it',async({page,controls,data,writes})=>{
  const hold=gate(),started=gate();controls.upload=async()=>{started.resolve();await hold.promise;};await pick(page);await started.promise;
  await page.getByRole('button',{name:'Remove cover photo',exact:true}).click();await expect.poll(()=>data.event.coverAssetId).toBe(null);hold.resolve();
  await page.waitForTimeout(150);assert.equal(writes.filter(w=>w.coverAssetId?.startsWith('asset-')).length,0);
 });
 await check('removing a photo cancels a pending framing edit without a false save failure',async({page,data,writes})=>{
  await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();
  await page.locator('[data-frame-editor]').focus();await page.keyboard.press('+');
  await expect(page.locator('.save')).toHaveText('Unsaved changes');
  await page.getByRole('button',{name:'Remove cover photo',exact:true}).click();
  await expect.poll(()=>data.event.coverAssetId).toBe(null);await expect(page.locator('.save')).toHaveText('Saved');
  await expect(page.locator('[data-frame-editor]')).toHaveCount(0);
  await page.waitForTimeout(700);assert.equal(writes.filter(w=>'coverFrame'in w&&w.coverAssetId===undefined).length,0);
 });
 await check('newer photo wins when two uploads finish out of order',async({page,controls,data})=>{
  const hold=gate(),started=gate();controls.upload=async n=>{if(n===1){started.resolve();await hold.promise;}};
  await pick(page);await started.promise;await pick(page);await expect.poll(()=>data.event.coverAssetId).toBe('asset-2');hold.resolve();
  await page.waitForTimeout(150);assert.equal(data.event.coverAssetId,'asset-2');
 });
 await check('leaving the photo editor ignores unfinished upload completion',async({page,controls,writes})=>{
  const hold=gate(),started=gate();controls.upload=async()=>{started.resolve();await hold.promise;};await pick(page);await started.promise;
  await page.locator('.inav-row').click();hold.resolve();await page.waitForTimeout(150);assert.equal(writes.length,0);
 });
 await check('canvas accepts a pasted image',async({page,data})=>{
  await page.locator('.ph-drop').first().evaluate((el,bytes)=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'pasted.png',{type:'image/png'}));el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},replacement.toString('base64'));
  await expect.poll(()=>data.event.coverAssetId).toBe('asset-1');
 });
 await check('failed sponsor upload save retains confirmed logo and retries',async({page,controls,data})=>{
  await page.locator('.ol-row').filter({hasText:'Sponsors'}).click();controls.rejectNext=true;
  await page.locator('.logo-tile input').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:replacement});
  await page.locator('.logo-retry').waitFor();await expect(page.locator('.lt-hit img')).toHaveAttribute('src','/photo-old.png');
  await page.locator('.logo-retry').click();await expect.poll(()=>data.sponsors[0].logoAssetId).toBe('asset-2');
 });
 }
}finally{await browser.close();}
console.log(`\n${count}/${count+failed} passed`);process.exitCode=failed?1:0;
