#!/usr/bin/env node
// Connected modal, viewport and lost-response regressions. Use only a disposable local database.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, webkit, expect } from '@playwright/test';
const BASE=process.env.BASE??'http://127.0.0.1:3431';
await mkdir('.shots/compatibility',{recursive:true});
let total=0;
for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{
  const staff=await browser.newContext(),ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  async function call(method,path,data){const r=await staff.request.fetch(BASE+path,{method,headers:{Origin:BASE},data});const b=await r.json();assert.ok(r.ok(),JSON.stringify(b));return b;}
  await call('POST','/api/v1/host/login',{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD});
  const e=await call('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Sheet '+engine.name(),startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
  const item=await call('POST',`/api/v1/host/events/${e.id}/items`,{requestId:randomUUID(),title:'Cabin weekend',openingMinor:10000});
  let w=await call('GET',`/api/v1/host/events/${e.id}`);await call('PATCH',`/api/v1/host/events/${e.id}`,{revision:w.event.revision,status:'live'});
  await page.goto(BASE+'/e/'+w.event.code);await page.getByLabel('Your name').fill('Sheet test');await page.getByLabel('Business name').fill('Local test');await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.pa-main').waitFor();
  await page.locator('.lc-hit').first().click();
  const open=page.locator('.pa-actionbar').getByRole('button',{name:/^Bid/});await open.click();
  const sheet=page.getByRole('dialog',{name:'Place a bid'});await expect(sheet).toBeVisible();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'bid-title');
  await page.keyboard.press('Shift+Tab');await expect(sheet.getByRole('button',{name:/^Bid \$/})).toBeFocused();
  await page.keyboard.press('Tab');await expect(sheet.getByRole('button',{name:'Close',exact:true})).toBeFocused();
  assert.equal(await page.locator('.pa-main').getAttribute('aria-hidden'),'true');
  const tappable=async()=>sheet.locator('.sheet-foot button').evaluate(el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return b.width>40&&b.height>30&&b.y>=0&&b.bottom<=innerHeight&&(hit===el||el.contains(hit));});
  assert.equal(await tappable(),true);
  await page.screenshot({path:`.shots/compatibility/${engine.name()}-sheet-390.png`});
  await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await expect(open).toBeFocused();
  assert.equal(await page.locator('.pa-main').getAttribute('aria-hidden'),null);
  await page.setViewportSize({width:390,height:420});await open.click();assert.equal(await tappable(),true);await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:1000});await open.click();assert.equal(await tappable(),true);
  await page.screenshot({path:`.shots/compatibility/${engine.name()}-sheet-1440.png`});await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await open.click();
  let release;const pending=new Promise(resolve=>release=resolve);
  await page.route('**/api/v1/e/*/bid',async route=>{await pending;await route.fetch();await route.abort();});
  await sheet.getByRole('button',{name:/^Bid \$/}).click();await expect(sheet.getByText('Sending…',{exact:true})).toBeVisible();
  await page.keyboard.press('Tab');assert.equal(await sheet.evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await expect(sheet).toBeVisible();release();
  await expect(page.getByRole('button',{name:'Check status',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Check status',exact:true}).click();await expect(page.getByRole('heading',{name:'Bid placed',exact:true})).toBeVisible();
  w=await call('GET',`/api/v1/host/events/${e.id}`);assert.equal(w.items[0].bidCount,1);assert.equal(w.items[0].currentMinor,10000);
  await page.getByRole('button',{name:'Done',exact:true}).click();assert.deepEqual(errors,[]);total++;
  console.log(`PASS ${engine.name()}: visible/tappable at 390×844, 390×420 and 1440×1000; focus, inert background, Escape, sending and lost-response receipt recovery; exactly one bid`);
 }finally{await browser.close();}
}
console.log(`${total}/2 engines passed`);
