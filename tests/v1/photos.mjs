#!/usr/bin/env node
// Connected photo framing ({ x, y, zoom }) and immutable-asset guarantees. Disposable local DB only.
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
  const C = {x:.5,y:.5,zoom:1};
  await check('existing/new references default to the centred cover fit', async () => {
    const d = await w(); assert.deepEqual(d.event.coverFrame, C); assert.deepEqual(d.items[0].imageFrame, C);
  });
  await check('cover and item frames save atomically with their asset and reach all snapshots', async () => {
    await pe({coverAssetId:asset.id,coverFrame:{x:.2,y:.8,zoom:1.5},status:'live'});
    await pi({imageAssetId:asset.id,imageFrame:{x:.9,y:.1,zoom:2}});
    const d = await w(), snap = await call(guest,'GET',`/api/v1/e/${d.event.code}`), stage = await call(staff,'GET',`/api/v1/host/events/${e.id}/stage`);
    assert.deepEqual(snap.event.coverFrame,{x:.2,y:.8,zoom:1.5}); assert.deepEqual(snap.items[0].imageFrame,{x:.9,y:.1,zoom:2});
    assert.deepEqual(stage.items[0].imageFrame,{x:.9,y:.1,zoom:2});
    const home = await call(staff,'GET','/api/v1/host/events'); assert.deepEqual(home.events.find(x=>x.id===e.id).coverFrame,{x:.2,y:.8,zoom:1.5});
  });
  await check('server rejects malformed and out-of-range frames without changing revisions', async () => {
    for (const frame of [{x:-.1,y:.5,zoom:1},{x:.5,y:1.1,zoom:1},{x:'0.5',y:.5,zoom:1},{x:.5,y:.5},{x:.5,y:.5,zoom:.9},{x:.5,y:.5,zoom:4.01},{x:.5,y:.5,zoom:'2'},null,[]]) {
      const d=await w();
      await call(staff,'PATCH',`/api/v1/host/events/${e.id}`,{revision:d.event.revision,coverFrame:frame},400);
      await call(staff,'PATCH',`/api/v1/host/items/${item.id}`,{revision:d.items[0].revision,imageFrame:frame},400);
      await call(staff,'PATCH',`/api/v1/host/events/${e.id}/items`,{changes:[{id:item.id,imageFrame:frame}]},400);
      const after=await w();assert.equal(after.event.revision,d.event.revision);assert.equal(after.items[0].revision,d.items[0].revision);
    }
  });
  await check('an older Studio tab moving the focal point keeps the zoom', async () => {
    await pi({imageFocal:{x:.3,y:.4}});
    assert.deepEqual((await w()).items[0].imageFrame,{x:.3,y:.4,zoom:2});
    await call(staff,'PATCH',`/api/v1/host/items/${item.id}`,{revision:(await w()).items[0].revision,imageFocal:{x:2,y:0}},400);
    await pi({imageFrame:{x:.9,y:.1,zoom:2}});
  });
  await check('duplication preserves frames but later adjustments are independent', async () => {
    const copy=await call(staff,'POST',`/api/v1/host/events/${e.id}/duplicate`,{requestId:randomUUID()},201);
    const d=await call(staff,'GET',`/api/v1/host/events/${copy.id}`);
    assert.deepEqual(d.event.coverFrame,{x:.2,y:.8,zoom:1.5});assert.deepEqual(d.items[0].imageFrame,{x:.9,y:.1,zoom:2});
    await call(staff,'PATCH',`/api/v1/host/events/${copy.id}`,{revision:d.event.revision,coverFrame:{x:0,y:0,zoom:4}});
    await call(staff,'PATCH',`/api/v1/host/items/${d.items[0].id}`,{revision:d.items[0].revision,imageFrame:{x:1,y:1,zoom:1}});
    const original=await w(); assert.deepEqual(original.event.coverFrame,{x:.2,y:.8,zoom:1.5});assert.deepEqual(original.items[0].imageFrame,{x:.9,y:.1,zoom:2});
  });
  await check('stale photo writes cannot overwrite a newer removal, even with a fresh revision', async () => {
    await pe({coverAssetId:null}); await pi({imageAssetId:null});const d=await w();
    await call(staff,'PATCH',`/api/v1/host/events/${e.id}`,{revision:d.event.revision,coverExpectedAssetId:asset.id,coverAssetId:asset.id},409);
    await call(staff,'PATCH',`/api/v1/host/items/${item.id}`,{revision:d.items[0].revision,imageExpectedAssetId:asset.id,imageAssetId:asset.id},409);
    await call(staff,'PATCH',`/api/v1/host/items/${item.id}`,{revision:d.items[0].revision,imageExpectedAssetId:asset.id,imageFrame:{x:0,y:0,zoom:3}},409);
    const bulk=await call(staff,'PATCH',`/api/v1/host/events/${e.id}/items`,{changes:[{id:item.id,imageAssetId:asset.id,imageFrame:C,imageExpectedAssetId:asset.id}]});
    assert.equal(bulk.skipped.length,1,'a tray placement whose target changed is skipped');
    const after=await w();assert.deepEqual(after.event.coverFrame,C);assert.deepEqual(after.items[0].imageFrame,C);assert.equal(after.items[0].imageAssetId,null);
  });
  await check('replacement resets the frame while immutable bytes retain transparency', async () => {
    await pe({coverAssetId:asset.id});await pi({imageAssetId:asset.id});const d=await w();
    assert.deepEqual(d.event.coverFrame,C);assert.deepEqual(d.items[0].imageFrame,C);
    const response=await guest.request.get(BASE+asset.url);assert.equal(response.status(),200);
    const meta=await sharp(await response.body()).metadata();assert.equal(meta.hasAlpha,true);assert.equal(meta.width,400);assert.equal(meta.height,200);
  });
  await check('guest cannot update staff photo framing', async () => {
    await call(guest,'PATCH',`/api/v1/host/items/${item.id}`,{revision:1,imageFrame:{x:0,y:0,zoom:2}},401);
    await call(guest,'PATCH',`/api/v1/host/events/${e.id}`,{revision:1,coverFrame:{x:0,y:0,zoom:2}},401);
  });
  await check('connected Studio frames, replaces and re-frames photos in place on the phone at 1440 and 390', async () => {
    const page=await staff.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width:1440,height:1000});await page.goto(BASE+`/studio/${e.id}?mode=setup`);
    await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();
    const editor=page.locator('[data-preview-device] [data-frame-editor]');await editor.waitFor();
    const zoom=page.getByRole('slider',{name:'Zoom'});await zoom.focus();await zoom.press('End');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect.poll(async()=>(await w()).event.coverFrame.zoom).toBe(4);
    await expect(editor).toHaveCount(0);
    const chooser=page.waitForEvent('filechooser');await page.locator('.ehero > .ph-drop').getByRole('button',{name:'Replace',exact:true}).click();
    await (await chooser).setFiles({name:'replacement.png',mimeType:'image/png',buffer:png});
    await expect.poll(async()=>(await w()).event.coverAssetId).not.toBe(asset.id);
    assert.deepEqual((await w()).event.coverFrame,C);
    await mkdir('.shots/images/connected',{recursive:true});
    await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Edit',exact:true}).click();
    await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();
    await editor.waitFor();await zoom.focus();for (let n=0;n<10;n++) await zoom.press('ArrowRight');
    const b=await page.locator('[data-frame-window]').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+60,{steps:6});await page.mouse.up();
    await page.screenshot({path:'.shots/images/connected/studio-frame-390.png'});
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect.poll(async()=>(await w()).event.coverFrame).toEqual(C);
    await page.getByRole('button',{name:'Adjust photo',exact:true}).first().click();await editor.waitFor();
    await zoom.focus();for (let n=0;n<10;n++) await zoom.press('ArrowRight');
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2+60,{steps:6});await page.mouse.up();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect.poll(async()=>(await w()).event.coverFrame.y).toBeLessThan(.5);
    assert.ok((await w()).event.coverFrame.zoom>1);
    assert.deepEqual(errors,[]);await page.close();
  });
  console.log(`\n${total}/${total} passed`);
} finally { await browser.close(); }
