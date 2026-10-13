import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const BASE=process.env.BASE??'http://127.0.0.1:3432',browser=await chromium.launch();
try{const host=await browser.newContext({viewport:{width:1440,height:1000}}),guest=await browser.newContext({viewport:{width:390,height:844}});
async function api(method,path,data){const r=await host.request.fetch(BASE+path,{method,headers:{Origin:BASE},data});const b=await r.json();assert.ok(r.ok(),JSON.stringify(b));return b;}
await api('POST','/api/v1/host/login',{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD});
const e=await api('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Devices browser check',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});
await api('POST',`/api/v1/host/events/${e.id}/items`,{requestId:randomUUID(),title:'Device prize',openingMinor:10000});let w=await api('GET',`/api/v1/host/events/${e.id}`);await api('PATCH',`/api/v1/host/events/${e.id}`,{revision:w.event.revision,status:'live'});
const staff=await host.newPage(),page=await guest.newPage();await staff.goto(BASE+`/studio/${e.id}?mode=live`);await page.goto(BASE+'/e/'+w.event.code);
await expect.poll(async()=>(await api('GET',`/api/v1/host/events/${e.id}/devices`)).totals.devices).toBe(1);
await page.evaluate(()=>dispatchEvent(new ErrorEvent('error',{message:'Controlled compatibility report'})));
await expect(staff.locator('.dv-problems')).toContainText('An error on their phone',{timeout:12000});
await expect(staff.locator('.dv-problems')).toContainText('Controlled compatibility report');
await mkdir('.shots/compatibility',{recursive:true});await staff.screenshot({path:'.shots/compatibility/devices-1440.png',fullPage:true});
await page.getByLabel('Your name').fill('Device UI');await page.getByLabel('Business name').fill('Local test');await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.lc-hit').click();await page.locator('.pa-actionbar').getByRole('button',{name:'Bid $100',exact:true}).click();await page.locator('.sheet-foot button').click();await expect(page.getByRole('heading',{name:'Bid placed',exact:true})).toBeVisible();await page.waitForTimeout(1000);
const d=await api('GET',`/api/v1/host/events/${e.id}/devices`);assert.equal(d.problems.filter(p=>p.check==='bid-sheet').length,0,'successful receipt must not generate a false missing-Bid-button alert');
console.log('PASS Devices UI: real device registration, error report appears in Live, successful bid generates no false health alert');
}finally{await browser.close();}
