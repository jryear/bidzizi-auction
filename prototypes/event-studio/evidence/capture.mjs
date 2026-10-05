import {chromium,expect} from '../../../node_modules/@playwright/test/index.mjs';
import {mkdirSync} from 'node:fs';
const base=process.env.URL||'http://127.0.0.1:4340/event-studio/';
const out=new URL('./shots/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  for(const [route,title,name] of [['windows','Bidding windows','10-two-bidding-windows'],['overview','Event overview','11-event-overview'],['presentation','Event presentation','12-event-presentation']]){
    await page.goto(base+'#/holiday/'+route);await expect(page.locator('#main h1')).toHaveText(title);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+name+'.png'});
  }
  await page.goto(base+'#/holiday/lots');await expect(page.locator('#main h1')).toHaveText('Lots');await page.locator('#select-visible').check();await expect(page.locator('.bulk')).toBeVisible();await page.screenshot({path:out+'01-workspace-bulk-desktop.png'});
}finally{await browser.close();}
