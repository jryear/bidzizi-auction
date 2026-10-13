import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const BASE=process.env.ITEMS_BASE??'http://127.0.0.1:3423', out='docs/plans/images/items-study';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();let total=0;
try{
 for(const flow of ['automatic','drafts']){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/?flow='+flow);await expect(page.locator('.row:not(.header)')).toHaveCount(30);
  await page.screenshot({path:`${out}/${flow}-1440.png`,fullPage:false});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${flow}-initial-390.png`,fullPage:false});await page.setViewportSize({width:1440,height:1000});
  await page.locator('#event-mode').selectOption('live');await page.getByRole('button',{name:'＋ Add item',exact:true}).click();
  await page.getByLabel('Item name',{exact:true}).fill('Unfinished cabin package');
  await page.getByLabel('Donor',{exact:true}).fill('Updated donor');
  await page.keyboard.press('Escape');await page.locator('#search').fill('Unfinished cabin');
  await expect(page.locator('.row:not(.header)')).toHaveCount(1);
  await expect(page.locator('.availability')).toHaveText('Draft');
  await page.getByRole('button',{name:'Guest preview ↗'}).click();
  await expect(page.locator('.guestcard').filter({hasText:'Unfinished cabin'})).toHaveCount(0);
  await page.getByRole('button',{name:'Back to items'}).click();
  await expect(page.locator('#search')).toHaveValue('Unfinished cabin');
  await page.getByRole('button',{name:'Unfinished cabin package',exact:false}).click();await page.reload();
  await expect(page.getByLabel('Item name',{exact:true})).toHaveValue('Unfinished cabin package');
  await expect(page.getByLabel('Donor',{exact:true})).toHaveValue('Updated donor');
  await page.screenshot({path:`${out}/${flow}-editor-1440.png`,fullPage:false});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${flow}-draft-editor-390.png`,fullPage:false});await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Add to event',exact:true}).click();
  await expect(page.locator('.availability').filter({hasText:'In the event'})).toHaveCount(27);
  await page.getByRole('button',{name:'Guest preview ↗'}).click();await expect(page.locator('.guestcard').filter({hasText:'Unfinished cabin'})).toHaveCount(1);
  await page.getByRole('button',{name:'Back to items'}).click();
  await page.locator('#missing').check();assert.ok(await page.locator('.thumb.empty').count()>0);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${out}/${flow}-390.png`,fullPage:false});
  const first=page.locator('.itemname').first();await first.click();
  await expect(page.getByLabel('Item photo')).toBeAttached();
  await page.screenshot({path:`${out}/${flow}-editor-390.png`,fullPage:false});
  await page.keyboard.press('Escape');
  await page.locator('#missing').uncheck();
  if(flow==='drafts'){
   await page.getByRole('button',{name:/^Drafts/}).click();await expect(page.locator('.row:not(.header)')).toHaveCount(4);
   await page.locator('[data-select]').first().check();await page.getByRole('button',{name:'Add to event',exact:true}).click();
   await expect(page.locator('.row:not(.header)')).toHaveCount(3);
  }
  await page.getByRole('button',{name:'Add several',exact:true}).click();await page.getByLabel('Your rows').fill('Tea hamper\t50\tFood & drink\tJuniper\nBad amount\tnope');
  await page.getByRole('button',{name:'Review rows'}).click();await expect(page.locator('#confirm-rows')).toBeDisabled();
  await page.getByLabel('Your rows').fill('Tea hamper\t50\tFood & drink\tJuniper');await page.getByRole('button',{name:'Review rows'}).click();
  await page.getByRole('button',{name:'Add 1 drafts',exact:true}).click();await page.locator('#search').fill('Tea hamper');
  await expect(page.locator('.itemname')).toHaveCount(1);
  assert.deepEqual(errors,[]);total++;console.log('PASS '+flow+': live creation, draft recovery, reload, guest visibility, filters, bulk review, phone and desktop; no page errors');
  await ctx.close();
 }
}finally{await browser.close();}
console.log(`${total}/2 creation flows passed`);
