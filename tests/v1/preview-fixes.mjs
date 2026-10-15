// Local regression and before/after capture for the six preview review fixes.
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { database, appServer, client, must } from '../contract/lib/stack.mjs';
const cleanups = [], onExit = fn => cleanups.push(fn);
const phase = process.env.PHASE ?? 'after';
const dir = `docs/plans/preview-attach-review/fixes/${phase}`;
await mkdir(dir, {recursive:true});
const iso = n => new Date(Date.now()+n).toISOString();
try {
  const {dbUrl,email,password} = await database(onExit);
  const {base} = await appServer(onExit,dbUrl);
  const staff=client(base), guest=client(base), rival=client(base);
  must(await staff('POST','/api/v1/host/login',{email,password}),'login');
  const e=must(await staff('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Holiday Trade Show',startsAt:iso(-60000),endsAt:iso(10800000)}),'event');
  let ws=must(await staff('GET',`/api/v1/host/events/${e.id}`),'workspace');
  must(await staff('PATCH',`/api/v1/host/events/${e.id}`,{revision:ws.event.revision,welcome:'Bid on donated trade from Saturn members. Every dollar stays in the network.',venue:'Pasadena Convention Center',bidderDisplay:'anonymous'}),'details');
  async function upload(file) {
    const cookie=staff.cookies().map(c=>`${c.name}=${c.value}`).join('; ');
    const r=await fetch(`${base}/api/v1/host/assets`,{method:'POST',headers:{origin:base,cookie,'content-type':'image/webp'},body:await readFile(file)});
    if(!r.ok)throw Error(`upload ${r.status}`);return(await r.json()).id;
  }
  const items=[];
  for(const [title,openingMinor,category,donor,file] of [
    ['Cabin weekend',40000,'Travel','Juniper Cabins','cabin'],["Chef’s table for six",32500,'Dining','Harbor Kitchen','dinner'],['Coffee for a year',15000,'Dining','Harbor Roasters','coffee'],['Spa day',12000,'Wellness','Lumen Spa',null]]) {
    items.push(must(await staff('POST',`/api/v1/host/events/${e.id}/items`,{requestId:randomUUID(),title,openingMinor,category,donor,short:`A gift from ${donor}`,description:`${title}, donated for the show. Contact the provider to arrange your visit.`,...(file?{imageAssetId:await upload(`public/hero/${file}.webp`)}:{})}),'item').id);
  }
  must(await staff('PUT',`/api/v1/host/events/${e.id}/sponsors`,{sponsors:[{name:'Saturn Barter',url:'saturnbarter.com'},{name:'Pasadena Chamber'}]}),'sponsors');
  must(await staff('POST',`/api/v1/host/events/${e.id}/recipients`,{name:'Red Cross',description:'Disaster relief, accepts any trade.'}),'recipient');
  ws=must(await staff('GET',`/api/v1/host/events/${e.id}`),'workspace');
  must(await staff('PATCH',`/api/v1/host/events/${e.id}`,{revision:ws.event.revision,status:'live'}),'live');
  const code=ws.event.code;
  must(await rival('POST',`/api/v1/e/${code}/join`,{requestId:randomUUID(),displayName:'Alice Rival',businessName:'Juniper Rival Co'}),'rival');
  must(await rival('POST',`/api/v1/e/${code}/bid`,{requestId:randomUUID(),itemId:items[0],amountMinor:40000}),'rival bid');
  must(await guest('POST',`/api/v1/e/${code}/join`,{requestId:randomUUID(),displayName:'A guest',businessName:'Your Business'}),'guest');
  // Hide the first photographed item so the tag and toolbar share a realistic crowded card.
  ws=must(await staff('GET',`/api/v1/host/events/${e.id}`),'workspace');
  const hidden=ws.items.find(i=>i.id===items[1]);
  must(await staff('PATCH',`/api/v1/host/items/${hidden.id}`,{revision:hidden.revision,ready:false}),'hide');
  const browser=await chromium.launch();onExit(()=>browser.close());
  const sc=await browser.newContext({viewport:{width:1440,height:1000}});await sc.addCookies(staff.cookies());
  const sp=await sc.newPage(), errors=[], requests=[];
  sp.on('pageerror',e=>errors.push(e.message));
  sp.on('request',r=>{if(new URL(r.url()).pathname===`/api/v1/host/events/${e.id}/preview`)requests.push(Date.now());});
  const measures=[];
  for(const width of [390,1440]) {
    await sp.setViewportSize({width,height:width===390?844:1000});
    for(const [name,screen] of [['notice','items'],['hidden-tools','items'],['welcome-photo','join'],['phone-space','join']]) {
      await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=${screen}`);
      await expect(sp.locator(`[data-preview-device] [data-guest-screen="${screen}"]`)).toBeVisible();
      await sp.evaluate(()=>document.fonts.ready); await sp.waitForTimeout(600);
      if(name==='hidden-tools') {
        const card=sp.locator(`[data-item-id="${hidden.id}"]`);
        await card.evaluate(el=>{const box=el.closest('.pa-main');box.scrollTop+=el.getBoundingClientRect().top-box.getBoundingClientRect().top;});
        await card.hover(); await sp.waitForTimeout(250);
      } else await sp.mouse.move(0,0);
      await sp.screenshot({path:`${dir}/${name}-${width}.png`});
      const geometry=await sp.evaluate(()=>{
        const rect=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
        return {device:rect('[data-preview-device]'),notice:rect('.cv-preview-notice')??rect('.cv > .cv-note'),pass:rect('.device-screen .pa-pass'),tag:rect('[data-preview-hidden] .cv-hidden-tag'),tools:rect('[data-preview-hidden] .cv-tools'),watch:rect('[data-preview-hidden] button.watch'),photo:rect('.device-screen .cover-ph'),fan:rect('.device-screen .fan')};
      });
      measures.push({name,width,...geometry});
      if(phase==='after') {
        const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y);
        if(name==='notice'&&width===1440&&geometry.device.y-geometry.notice.bottom<16)throw Error('Notice too close to frame');
        if(name==='hidden-tools'&&(overlap(geometry.tag,geometry.watch)||overlap(geometry.tools,geometry.pass)))throw Error('Editor controls overlap guest UI');
        if(name==='welcome-photo'&&overlap(geometry.photo,geometry.fan))throw Error('Photo control overlaps stack');
        if(name==='phone-space'&&width===390&&geometry.device.height<680)throw Error('Phone canvas too short');
      }
    }
  }
  if(phase==='after') {
    await sp.setViewportSize({width:390,height:844});
    await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=join`);
    await expect(sp.locator('[data-guest-screen="join"]')).toBeVisible();
    const toggle=sp.getByRole('button',{name:/Preview · Welcome/});
    await expect(sp.getByRole('tablist',{name:'Screen',exact:true})).toBeHidden();
    await toggle.click();await expect(sp.getByRole('tablist',{name:'Screen',exact:true})).toBeVisible();
    await toggle.click();await expect(sp.getByRole('tablist',{name:'Screen',exact:true})).toBeHidden();
    await sp.getByRole('tab',{name:'Edit',exact:true}).click();
    const venue=sp.locator('.rail-r').getByLabel('Venue',{exact:true});
    await venue.fill('Updated on a phone');await venue.press('Tab');
    await expect.poll(async()=>must(await staff('GET',`/api/v1/host/events/${e.id}`),'workspace').event.venue).toBe('Updated on a phone');
    await sp.getByRole('tab',{name:'Phone',exact:true}).click();
    await expect(sp.locator('[data-guest-screen="join"]')).toBeVisible();
    await sp.getByLabel('Studio mode',{exact:true}).selectOption('live');await expect(sp.locator('.live-board')).toBeVisible();
    await sp.getByRole('tab',{name:'Set up',exact:true}).click();await expect(sp.locator('[data-guest-screen="join"]')).toBeVisible();
    const device=await sp.locator('[data-preview-device]').boundingBox();
    if(device.y+device.height>845)throw Error('Phone preview extends below the viewport');
  }
  // Count actual requests across cold entry, polling and mode switches.
  await sp.setViewportSize({width:1440,height:1000});
  requests.length=0;
  await sp.goto(`${base}/studio/${e.id}?mode=live`); await expect(sp.locator('.live-board')).toBeVisible();
  await sp.waitForTimeout(6500);const live=requests.length;
  await sp.getByRole('tab',{name:/^Results/}).click();await sp.waitForTimeout(6500);const results=requests.length-live;
  await sp.getByRole('tab',{name:'Set up',exact:true}).click();await expect(sp.locator('[data-guest-shell]')).toBeVisible();
  await expect.poll(()=>requests.length).toBeGreaterThan(live+results);const setup=requests.length-live-results;
  const p=must(await staff('GET',`/api/v1/host/events/${e.id}/preview`),'preview');
  if(phase==='after') {
    if(live||results)throw Error(`Background preview reads: live=${live}, results=${results}`);
    if(p.me.bidderNumber!==0)throw Error('Preview borrowed a participant number');
    await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=event`);
    await expect(sp.locator('[data-guest-screen="event"] .sample-guest')).toHaveText('Sample guest · Bidder 00');
    await sp.locator('.sample-guest').scrollIntoViewIfNeeded();await sp.screenshot({path:`${dir}/sample-guest-1440.png`});
  }
  if(errors.length)throw Error(errors.join('; '));
  await writeFile(`${dir}/capture.json`,JSON.stringify({phase,previewRequests:{live,results,setup},previewBidderNumber:p.me.bidderNumber,measures,pageErrors:errors.length},null,2)+'\n');
  console.log(JSON.stringify({phase,previewRequests:{live,results,setup},previewBidderNumber:p.me.bidderNumber,pageErrors:errors.length},null,2));
} finally {for(const cleanup of cleanups.reverse())await cleanup();}
