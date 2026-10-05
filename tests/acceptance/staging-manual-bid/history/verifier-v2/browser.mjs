// Actual A iframe and controls; no app-owned expected-answer helpers.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {HarnessError,browserFailure,ApplicationFailure} from './harness.mjs';
export {expect};
export async function withBrowser(f,run){
  let browser;
  try{browser=await chromium.launch({headless:true});}
  catch{throw new HarnessError('Installed independent Chromium is unavailable.');}
  const contexts=[];
  async function signed(account='bidder-juniper',{skewMs=0}={}){
    const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);
    if(skewMs)await context.addInitScript(offset=>{
      const RealDate=Date;
      function SkewDate(...args){
        if(new.target===undefined)return new RealDate(RealDate.now()+offset).toString();
        return Reflect.construct(RealDate,args.length?args:[RealDate.now()+offset],new.target);
      }
      Object.defineProperties(SkewDate,Object.getOwnPropertyDescriptors(RealDate));
      Object.defineProperty(SkewDate,'now',{
        ...Object.getOwnPropertyDescriptor(RealDate,'now'),value:function now(){return RealDate.now()+offset;},
      });
      globalThis.Date=SkewDate;
    },skewMs);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${f.origin}/events/${f.fixtures.event}`,{waitUntil:'domcontentloaded',timeout:20_000});
    await expect(page.getByText('Staging test',{exact:true})).toBeVisible();
    await page.getByRole('combobox',{name:'Test account',exact:true}).selectOption(account);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    const frame=page.frameLocator('iframe[title="BidZizi event"]');
    await expect(frame.locator('h1')).toContainText(f.approvedEvent.name);
    return {context,page,frame,errors,account};
  }
  try{return await run({signed,browser});}
  catch(e){throw browserFailure(e);}
  finally{for(const c of contexts)await c.close();await browser.close();}
}
export async function openLot(ui,f,lot=f.fixtures.lotA){
  const detail=ui.frame.locator(`main[data-lot="${lot}"]`);
  if(await detail.isVisible())return;
  const welcome=ui.frame.getByRole('link',{name:'Browse the lots',exact:true});
  if(await welcome.count())await welcome.click();
  else await ui.frame.locator('a[href="#/lots"]').first().click();
  await ui.frame.locator(`a[href="#/lot/${lot}"]`).first().click();
  await expect(ui.frame.locator(`main[data-lot="${lot}"]`)).toBeVisible();
}
export async function review(ui,amountMinor,business='Juniper Studio',person='Test Juniper Bidder'){
  await ui.frame.locator('[data-action="bid"]').first().click();
  const dialog=ui.frame.locator('dialog#sheet');
  await expect(dialog).toBeVisible();
  await dialog.locator('#amt').fill((amountMinor/100).toFixed(2));
  await expect(dialog).toContainText(business);
  await expect(dialog).toContainText(person);
  const dollars=amountMinor/100,display=Number.isInteger(dollars)?String(dollars):dollars.toFixed(2);
  await expect(dialog.locator('[data-action="place"]')).toHaveText(`Place $${display} bid`);
  return dialog;
}
export async function confirm(dialog){await dialog.locator('[data-action="place"]').click();}
export async function httpPacket(response){
  const text=await response.text();
  return {status:response.status(),headers:new Headers(response.allHeaders?await response.allHeaders():response.headers()),text,data:JSON.parse(text)};
}
export async function unconfirmed(dialog){
  await expect(dialog).toContainText(/couldn't confirm|not confirmed|could not confirm/i);
  await expect(dialog).toHaveAttribute('data-bid-state','unconfirmed');
  assert.equal(await dialog.locator('.result.t-green').count(),0,'Unconfirmed UI cannot assert acceptance.');
}
export function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
export async function bounded(promise,label,ms=15_000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ApplicationFailure(label+' missed its independent deadline.')),ms);})]);}
  finally{clearTimeout(timer);}
}
