#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
const BASE=process.env.BASE??'http://127.0.0.1:3432';let count=0;
for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
 const host=await browser.newContext(),ctx=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),page=await ctx.newPage();
 async function api(method,path,data){const r=await host.request.fetch(BASE+path,{method,headers:{Origin:BASE},data});const b=await r.json();assert.ok(r.ok(),JSON.stringify(b));return b;}
 await api('POST','/api/v1/host/login',{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD});
 const event=await api('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Simple mode '+engine.name(),startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
 const item=await api('POST',`/api/v1/host/events/${event.id}/items`,{requestId:randomUUID(),title:'Cabin weekend',openingMinor:10000});
 await api('POST',`/api/v1/host/events/${event.id}/recipients`,{name:'Local nonprofit'});
 let w=await api('GET',`/api/v1/host/events/${event.id}`);await api('PATCH',`/api/v1/host/events/${event.id}`,{revision:w.event.revision,status:'live'});
 const url=BASE+'/e/'+w.event.code+'/simple';const response=await page.goto(url);assert.ok(response.headers()['content-security-policy'].includes("script-src 'none'"));assert.equal(await page.locator('script').count(),0);
 await page.getByLabel('Your name').fill('Simple guest');await page.getByLabel('Business name').fill('Local test');await page.getByRole('button',{name:'Join',exact:true}).click();await expect(page.locator('.identity')).toHaveText('Simple guest · Local test');
 await page.getByRole('link',{name:'Cabin weekend',exact:true}).click();
 const form=page.locator('article form'),payload={};for(const name of ['action','requestId','itemId','amount'])payload[name]=await form.locator(`[name=${name}]`).inputValue();
 await page.getByRole('button',{name:'Bid $100',exact:true}).click();await expect(page.getByRole('heading',{name:'Bid recorded',exact:true})).toBeVisible();
 const replay=await ctx.request.post(url,{headers:{Origin:BASE},form:payload,maxRedirects:0});assert.equal(replay.status(),303);
 const receipt=await ctx.request.get(BASE+replay.headers().location);assert.match(await receipt.text(),/Bid recorded/);
 w=await api('GET',`/api/v1/host/events/${event.id}`);assert.equal(w.items[0].bidCount,1);
 await page.getByRole('link',{name:'My bids',exact:true}).click();await expect(page.getByText('You are leading',{exact:true})).toBeVisible();
 const rival=await browser.newContext();
 let rr=await rival.request.post(BASE+`/api/v1/e/${w.event.code}/join`,{headers:{Origin:BASE},data:{requestId:randomUUID(),displayName:'Rival',businessName:'Other business'}});assert.equal(rr.status(),201);
 rr=await rival.request.post(BASE+`/api/v1/e/${w.event.code}/bid`,{headers:{Origin:BASE},data:{requestId:randomUUID(),itemId:item.id,amountMinor:12500}});assert.equal(rr.status(),201);
 await page.reload();await expect(page.getByText('You were outbid',{exact:true})).toBeVisible();await expect(page.locator('article strong')).toHaveText('$125');
 const foreignReceipt=await rival.request.get(url+'?receipt='+payload.requestId);assert.ok(!(await foreignReceipt.text()).includes('<h2>Bid recorded</h2>'));
 await page.getByRole('link',{name:'Donate',exact:true}).click();const donation={};for(const name of ['action','requestId','recipientId','amount'])donation[name]=await page.locator(`form [name=${name}]`).inputValue();
 await page.getByRole('button',{name:'Record donation',exact:true}).click();await expect(page.getByRole('heading',{name:'Donation recorded',exact:true})).toBeVisible();
 assert.equal((await ctx.request.post(url,{headers:{Origin:BASE},form:donation,maxRedirects:0})).status(),303);
 w=await api('GET',`/api/v1/host/events/${event.id}`);assert.equal(w.pledges.length,1);
 const missing=randomUUID();await page.goto(url+`?receipt=${missing}&item=${item.id}&amount=10000`);await expect(page.getByRole('heading',{name:'Bid not confirmed',exact:true})).toBeVisible();
 assert.equal(await page.locator('input[name=requestId]').inputValue(),missing);await expect(page.getByRole('button',{name:'Retry same bid',exact:true})).toBeVisible();assert.equal(await page.getByRole('button',{name:/^Bid \$/}).count(),0);
 const token=await api('POST',`/api/v1/host/events/${event.id}/participants/${w.participants[0].id}/rejoin`,{});
 const moved=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const p=await moved.newPage();await p.goto(url);await p.getByText('Joined on another phone?',{exact:true}).click();await p.getByLabel('Rejoin code').fill(token.code);await p.getByRole('button',{name:'Continue',exact:true}).click();await expect(p.locator('.identity')).toHaveText('Simple guest · Local test');
 assert.equal((await ctx.request.post(url,{headers:{Origin:'https://evil.example'},form:payload,maxRedirects:0})).status(),403);
 await mkdir('.shots/compatibility',{recursive:true});await p.screenshot({path:`.shots/compatibility/${engine.name()}-simple-390.png`});
 await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:`.shots/compatibility/${engine.name()}-simple-1440.png`});
 count++;console.log(`PASS ${engine.name()} JavaScript disabled: join, detail, bid receipt/replay, My bids, donation replay, uncertain recovery, rejoin and CSRF; no duplicate bids or pledges`);
}finally{await browser.close();}}
console.log(`${count}/2 simple-mode journeys passed`);
