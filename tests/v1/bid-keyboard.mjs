import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const BASE=process.env.BASE??'http://127.0.0.1:3412';
const browser=await chromium.launch();
try {
 const host=await browser.newContext();
 const login=await host.request.post(BASE+'/api/v1/host/login',{headers:{Origin:BASE},data:{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD}});assert.ok(login.ok());
 const events=await (await host.request.get(BASE+'/api/v1/host/events')).json();const event=events.events.find(e=>e.coverUrl&&e.stage==='running');assert.ok(event,'Seed shots.mjs first');
 const page=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();await page.goto(`${BASE}/e/${event.code}`);await page.getByLabel('Your name').fill('Keyboard rehearsal');await page.getByLabel('Business name').fill('Local test');await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.pass').waitFor();await page.locator('.participant-item-open').first().click();const bid=page.getByRole('button',{name:'Bid',exact:true});await bid.click();
 const sheet=page.getByRole('dialog',{name:'Place a bid'});await sheet.waitFor();assert.equal(await sheet.getByRole('button',{name:'Close',exact:true}).evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Shift+Tab');assert.match(await page.evaluate(()=>document.activeElement.textContent),/^Bid \$/);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Close');await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});assert.equal(await bid.evaluate(el=>el===document.activeElement),true);
 await bid.click();await sheet.waitFor();let release;await page.route('**/api/v1/e/*/bid',route=>new Promise(resolve=>{release=()=>{route.abort();resolve();};}));await sheet.getByRole('button',{name:/^Bid \$/}).click();await page.getByText('Sending…',{exact:true}).waitFor();await page.keyboard.press('Tab');assert.equal(await sheet.evaluate(el=>el.contains(document.activeElement)),true);await page.keyboard.press('Escape');assert.equal(await sheet.count(),1);release();await sheet.getByRole('button',{name:'Check status',exact:true}).waitFor();await sheet.getByRole('button',{name:'Close',exact:true}).click();
 console.log('PASS bid keyboard: initial focus, forward/backward focus containment, Escape, focus restoration and sending-state focus containment; no bid sent');
} finally {await browser.close();}
