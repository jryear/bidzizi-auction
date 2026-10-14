// Local visual rehearsal only. Creates and drops an isolated loopback database.
// BZ_CONTRACT_PG=postgres://bz@127.0.0.1:55433/postgres node tests/v1/preview-review.mjs
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { database, appServer, client, must } from '../contract/lib/stack.mjs';
const cleanups = [], onExit = fn => cleanups.push(fn);
const dir = 'docs/plans/preview-attach-review';
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
  const browser=await chromium.launch();onExit(()=>browser.close());
  const sc=await browser.newContext({viewport:{width:1440,height:1000}});await sc.addCookies(staff.cookies());
  const gc=await browser.newContext({viewport:{width:390,height:844}});await gc.addCookies(guest.cookies());
  const fc=await browser.newContext({viewport:{width:390,height:844}});
  const sp=await sc.newPage(), gp=await gc.newPage(), fp=await fc.newPage();
  const errors=[],writes=[];sc.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));sp.on('pageerror',e=>errors.push(e.message));gp.on('pageerror',e=>errors.push(e.message));
  sc.on('request',r=>{if(r.method()!=='GET'&&/\/api\/v1\/e\/[^/]+\/(join|rejoin|bid|watch|pledge)$/.test(new URL(r.url()).pathname))writes.push(r.url());});
  const report=[];
  for(const width of [390,1440]) {
    await sp.setViewportSize({width,height:width===390?844:1000});
    for(const screen of ['join','items','item','event','give','mine']) {
      const phone=screen==='join'?fp:gp;
      await phone.goto(`${base}/e/${code}${screen==='item'?`?s=items&i=${items[1]}`:screen==='join'||screen==='items'?'':`?s=${screen}`}`);
      await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=${screen}${screen==='item'?`&item=${items[1]}`:''}`);
      await expect(sp.locator(`[data-preview-device] [data-guest-screen="${screen}"]`)).toBeVisible();
      await expect(phone.locator(`[data-guest-screen="${screen}"]`)).toBeVisible();
      await Promise.all([sp.evaluate(()=>document.fonts.ready),phone.evaluate(()=>document.fonts.ready)]);
      await sp.waitForTimeout(1400);
      await phone.waitForTimeout(200);
      await sp.screenshot({path:`${dir}/${screen}-studio-${width}.png`});
      await phone.screenshot({path:`${dir}/${screen}-guest-390.png`});
      const a=await sp.locator('[data-preview-device] .device-screen').screenshot();
      const b=await phone.screenshot();
      const am=await sharp(a).metadata(), bm=await sharp(b).metadata();
      await sharp({create:{width:am.width+bm.width+24,height:Math.max(am.height,bm.height)+48,channels:4,background:'#e9e4d9'}}).composite([
        {input:Buffer.from(`<svg width="${am.width+bm.width+24}" height="48"><text x="12" y="28" font-size="16" font-family="sans-serif">Studio canvas (${width}px viewport)</text><text x="${am.width+36}" y="28" font-size="16" font-family="sans-serif">Real guest app (390px)</text></svg>`),left:0,top:0},
        {input:a,left:0,top:48},{input:b,left:am.width+24,top:48}
      ]).png().toFile(`${dir}/${screen}-comparison-${width}.png`);
      if (width === 1440) {
        await phone.setViewportSize({width:1440,height:1000});
        await phone.waitForTimeout(200);
        const desktop = await phone.screenshot({path:`${dir}/${screen}-guest-1440.png`});
        const studio = await readFile(`${dir}/${screen}-studio-1440.png`);
        await sharp({create:{width:2904,height:1048,channels:4,background:'#e9e4d9'}}).composite([
          {input:Buffer.from('<svg width="2904" height="48"><text x="12" y="28" font-size="20" font-family="sans-serif">Studio (1440px)</text><text x="1476" y="28" font-size="20" font-family="sans-serif">Real guest app (1440px)</text></svg>'),left:0,top:0},
          {input:studio,left:0,top:48},{input:desktop,left:1464,top:48}
        ]).png().toFile(`${dir}/${screen}-workspaces-1440.png`);
        await phone.setViewportSize({width:390,height:844});
      }
      report.push({screen,studioWidth:width,canvasWidth:am.width,guestWidth:bm.width});
    }
  }
  // Exercise every guest mutation entry point without granting the preview a credential.
  await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=join`);
  await sp.locator('.device-screen').getByLabel('Your name',{exact:true}).fill('Preview only');
  await sp.locator('.device-screen').getByLabel('Business name',{exact:true}).fill('Preview business');
  await sp.locator('.device-screen').getByRole('button',{name:'Join',exact:true}).click();
  await sp.locator('.device-screen').getByRole('button',{name:'Joined on another phone?'}).click();
  await sp.locator('.device-screen').getByLabel('Rejoin code',{exact:true}).fill('ABCD1234');
  await sp.locator('.device-screen').getByRole('button',{name:'Continue',exact:true}).click();
  await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=item&item=${items[0]}`);
  await sp.locator('.device-screen button.watch').click();
  await sp.locator('.device-screen .pa-actionbar:not(.inline) button').click();
  await sp.goto(`${base}/studio/${e.id}?mode=setup&screen=give`);
  await sp.locator('.device-screen').getByRole('button',{name:/Review \$50/}).click();
  await sp.locator('.device-screen').getByRole('button',{name:'Confirm $50',exact:true}).click();
  if(writes.length)throw Error(`Guest writes: ${writes.join(', ')}`);
  if(errors.length)throw Error(`Page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({screenshots:report,guestWrites:writes.length,pageErrors:errors.length},null,2));
  await writeFile(`${dir}/capture.json`,JSON.stringify({screenshots:report,guestWrites:writes.length,pageErrors:errors.length},null,2)+'\n');
} finally {for(const cleanup of cleanups.reverse())await cleanup();}
