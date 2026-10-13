#!/usr/bin/env node
// Connected image positioning and immutable-asset guarantees. Disposable local DB only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3421';
const browser = await chromium.launch(), staff = await browser.newContext(), guest = await browser.newContext();
let total = 0;
async function call(ctx, method, path, data, status = 200) {
  const r = await ctx.request.fetch(BASE + path, { method, headers: { Origin: BASE }, data });
  const body = await r.json(); assert.equal(r.status(), status, JSON.stringify(body)); return body;
}
async function check(name, run) { await run(); console.log('ok   '+name); total++; }
try {
  await call(staff, 'POST', '/api/v1/host/login', { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });
  const e = await call(staff, 'POST', '/api/v1/host/events', { requestId: randomUUID(), name: 'Photo verification', startsAt: new Date(Date.now()-60000).toISOString(), endsAt: new Date(Date.now()+3600000).toISOString() }, 201);
  const item = await call(staff, 'POST', `/api/v1/host/events/${e.id}/items`, { requestId: randomUUID(), title: 'Photo prize', openingMinor: 10000 }, 201);
  const w = () => call(staff, 'GET', `/api/v1/host/events/${e.id}`);
  const pe = async fields => call(staff, 'PATCH', `/api/v1/host/events/${e.id}`, { revision: (await w()).event.revision, ...fields });
  const pi = async fields => call(staff, 'PATCH', `/api/v1/host/items/${item.id}`, { revision: (await w()).items[0].revision, ...fields });
  const png = await sharp({ create: { width: 400, height: 200, channels: 4, background: '#2266aa80' } }).png().toBuffer();
  const upload = await staff.request.post(BASE+'/api/v1/host/assets', { headers: { Origin: BASE, 'Content-Type': 'image/png' }, data: png });
  assert.equal(upload.status(), 201); const asset = await upload.json();
  await check('existing/new references default to center', async () => {
    const d = await w(); assert.deepEqual(d.event.coverFocal, {x:.5,y:.5}); assert.deepEqual(d.items[0].imageFocal, {x:.5,y:.5});
  });
  await check('cover and item positions save atomically with their asset and reach all snapshots', async () => {
    await pe({coverAssetId:asset.id,coverFocal:{x:.2,y:.8},status:'live'});
    await pi({imageAssetId:asset.id,imageFocal:{x:.9,y:.1}});
    const d = await w(), snap = await call(guest,'GET',`/api/v1/e/${d.event.code}`), stage = await call(staff,'GET',`/api/v1/host/events/${e.id}/stage`);
    assert.deepEqual(snap.event.coverFocal,{x:.2,y:.8}); assert.deepEqual(snap.items[0].imageFocal,{x:.9,y:.1});
    assert.deepEqual(stage.items[0].imageFocal,{x:.9,y:.1});
    const home = await call(staff,'GET','/api/v1/host/events'); assert.deepEqual(home.events.find(x=>x.id===e.id).coverFocal,{x:.2,y:.8});
  });
  await check('server rejects malformed and out-of-range positions without changing revisions', async () => {
    for (const point of [{x:-.1,y:.5},{x:.5,y:1.1},{x:'0.5',y:.5},{x:.5},null,[]]) {
      const d=await w();
      await call(staff,'PATCH',`/api/v1/host/events/${e.id}`,{revision:d.event.revision,coverFocal:point},400);
      await call(staff,'PATCH',`/api/v1/host/items/${item.id}`,{revision:d.items[0].revision,imageFocal:point},400);
      const after=await w();assert.equal(after.event.revision,d.event.revision);assert.equal(after.items[0].revision,d.items[0].revision);
    }
  });
  await check('duplication preserves position but later adjustments are independent', async () => {
    const copy=await call(staff,'POST',`/api/v1/host/events/${e.id}/duplicate`,{requestId:randomUUID()},201);
    const d=await call(staff,'GET',`/api/v1/host/events/${copy.id}`);
    assert.deepEqual(d.event.coverFocal,{x:.2,y:.8});assert.deepEqual(d.items[0].imageFocal,{x:.9,y:.1});
    await call(staff,'PATCH',`/api/v1/host/events/${copy.id}`,{revision:d.event.revision,coverFocal:{x:0,y:0}});
    await call(staff,'PATCH',`/api/v1/host/items/${d.items[0].id}`,{revision:d.items[0].revision,imageFocal:{x:1,y:1}});
    const original=await w(); assert.deepEqual(original.event.coverFocal,{x:.2,y:.8});assert.deepEqual(original.items[0].imageFocal,{x:.9,y:.1});
  });
  await check('stale photo writes cannot overwrite a newer removal, even with a fresh revision', async () => {
    await pe({coverAssetId:null}); await pi({imageAssetId:null});const d=await w();
    await call(staff,'PATCH',`/api/v1/host/events/${e.id}`,{revision:d.event.revision,coverExpectedAssetId:asset.id,coverAssetId:asset.id},409);
    await call(staff,'PATCH',`/api/v1/host/items/${item.id}`,{revision:d.items[0].revision,imageExpectedAssetId:asset.id,imageAssetId:asset.id},409);
    assert.deepEqual(d.event.coverFocal,{x:.5,y:.5});assert.deepEqual(d.items[0].imageFocal,{x:.5,y:.5});
  });
  await check('replacement resets position while immutable bytes retain transparency', async () => {
    await pe({coverAssetId:asset.id});await pi({imageAssetId:asset.id});const d=await w();
    assert.deepEqual(d.event.coverFocal,{x:.5,y:.5});assert.deepEqual(d.items[0].imageFocal,{x:.5,y:.5});
    const response=await guest.request.get(BASE+asset.url);assert.equal(response.status(),200);
    const meta=await sharp(await response.body()).metadata();assert.equal(meta.hasAlpha,true);assert.equal(meta.width,400);assert.equal(meta.height,200);
  });
  await check('guest cannot update staff photo positioning', async () => {
    await call(guest,'PATCH',`/api/v1/host/items/${item.id}`,{revision:1,imageFocal:{x:0,y:0}},401);
  });
  await check('connected Studio uploads and adjusts photos through desktop and phone controls', async () => {
    const page=await staff.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width:1440,height:1000});await page.goto(BASE+`/studio/${e.id}?mode=setup`);
    await page.getByRole('button',{name:'Adjust photo',exact:true}).click();
    await page.getByRole('slider',{name:'Photo focus horizontal'}).focus();await page.getByRole('slider',{name:'Photo focus horizontal'}).press('Home');
    await expect.poll(async()=>(await w()).event.coverFocal.x).toBe(0);
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Replace photo',exact:true}).click();
    await (await chooser).setFiles({name:'replacement.png',mimeType:'image/png',buffer:png});
    await expect.poll(async()=>(await w()).event.coverAssetId).not.toBe(asset.id);
    assert.deepEqual((await w()).event.coverFocal,{x:.5,y:.5});
    await page.getByRole('button',{name:'Adjust photo',exact:true}).click();
    await mkdir('.shots/images/connected',{recursive:true});await page.screenshot({path:'.shots/images/connected/studio-1440.png'});
    await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Edit',exact:true}).click();
    if (await page.getByRole('button',{name:'Adjust photo',exact:true}).getAttribute('aria-expanded') === 'false') await page.getByRole('button',{name:'Adjust photo',exact:true}).click();
    await page.getByRole('slider',{name:'Photo focus vertical'}).focus();await page.getByRole('slider',{name:'Photo focus vertical'}).press('End');
    await expect.poll(async()=>(await w()).event.coverFocal.y).toBe(1);
    await page.screenshot({path:'.shots/images/connected/studio-edit-390.png'});
    assert.deepEqual(errors,[]);await page.close();
  });
  console.log(`\n${total}/${total} passed`);
} finally { await browser.close(); }
