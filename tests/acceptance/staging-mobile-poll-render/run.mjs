import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dependencies,parentHTML,HarnessError,root,withUI,until,refresh,openLot} from './harness.mjs';
import {EVENT,LOT,PERSON,OTHER} from './fixtures.mjs';
const mode=process.argv[2];
const names={acceptance:'Mobile unchanged polling preserves DOM and editing',regression:'Changed catalog standing closure and receipt recovery',adversarial:'Context races denied access and stale transitions'};
const rows=[];
function clean(ui){assert.deepEqual(ui.errors,[],'No page errors or unrecognized source/API requests.');assert.deepEqual(ui.foreign,[],'No foreign-origin requests.');}
async function record(id,fn){
 try{await fn();rows.push({id,status:'pass',detail:'Observed in a fresh 390x844 browser-local context.'});}
 catch(e){if(e instanceof HarnessError)throw e;if(e.name!=='AssertionError')throw new HarnessError(id+': '+e.message);rows.push({id,status:'fail',detail:e.message.slice(0,1000)});}
}
async function expectEventually(fn,message,ms=4000){assert.ok(await until(fn,ms),message);}
async function pin(ui,name,input){
 await ui.frame.evaluate(({name,input})=>{window.__pins[name]={main:document.querySelector('#view main'),image:document.querySelector('#view img'),nav:document.querySelector('#tabbar').firstElementChild,input:input?document.querySelector(input):null,stamp:document.querySelector('.catalog-asof time')?.dateTime};},{name,input});
}
async function nodes(ui,name){return ui.frame.evaluate(name=>{const p=window.__pins[name];return {main:p.main===document.querySelector('#view main'),image:p.image===document.querySelector('#view img'),nav:p.nav===document.querySelector('#tabbar').firstElementChild,stampAdvanced:p.stamp!==document.querySelector('.catalog-asof time')?.dateTime};},name);}
async function editor(ui,name,selector){return ui.frame.evaluate(({name,selector})=>{const el=document.querySelector(selector);return {same:window.__pins[name].input===el,focused:document.activeElement===el,value:el?.value,selection:[el?.selectionStart,el?.selectionEnd]};},{name,selector});}
async function autoPoll(ui){
 const n=ui.hits.filter(x=>x.kind==='catalog').length;
 await expectEventually(()=>ui.hits.filter(x=>x.kind==='catalog').length>n,'Visible authenticated page must keep its periodic refresh.',6500);
 await ui.page.waitForTimeout(150);
}
async function acceptance(engine,browser,html){
 await withUI(browser,html,async ui=>{
  await pin(ui,'welcome');await autoPoll(ui);const welcome=await nodes(ui,'welcome');
  await ui.frame.locator('a[href="#/lots"]').first().click();
  await ui.frame.locator('[data-search]').fill('dinner');
  await ui.frame.locator('[data-search]').evaluate(el=>{el.focus();el.setSelectionRange(2,2);});
  await pin(ui,'search','[data-search]');await autoPoll(ui);
  const search=await nodes(ui,'search'),searchEdit=await editor(ui,'search','[data-search]');
  await ui.frame.locator('.card-link').first().click();
  await expectEventually(()=>ui.frame.locator('.catalog-footer [data-action="bid"]:not([disabled])').count(),'Fresh standing must enable local bid review.');
  await ui.frame.locator('.catalog-footer [data-action="bid"]').click();
  await ui.frame.locator('#amt').fill('125');await ui.frame.locator('#amt').evaluate(el=>{el.focus();el.setSelectionRange(1,1);});
  await pin(ui,'review','#amt');await autoPoll(ui);
  const review=await nodes(ui,'review'),reviewEdit=await editor(ui,'review','#amt');
  await record(engine+'-idle-nodes',async()=>{
   for(const [scene,observed]of Object.entries({welcome,search,review})){assert.deepEqual(observed,{main:true,image:true,nav:true,stampAdvanced:true},scene+' must retain main/image/nav and update authoritative timestamp in place.');}
   clean(ui);
  });
  await record(engine+'-search-editor',async()=>{assert.deepEqual(searchEdit,{same:true,focused:true,value:'dinner',selection:[2,2]},'Unchanged poll must retain the search node, value, focus and caret.');clean(ui);});
  await record(engine+'-review-editor',async()=>{assert.deepEqual(reviewEdit,{same:true,focused:true,value:'125',selection:[1,1]},'Unchanged poll must retain bid review amount node, value, focus and caret.');clean(ui);});
  await ui.frame.evaluate(()=>{window.__messages=[];});
  await refresh(ui);
  const messages=await ui.frame.evaluate(()=>window.__messages);
  await record(engine+'-single-publication',async()=>{
   assert.equal(messages.filter(m=>m.type==='audience-catalog').length,1,'A successful parent refresh publishes one catalog message.');
   assert.equal(messages.filter(m=>m.type==='bidder-context').length,1,'A successful parent refresh publishes one context message.');clean(ui);
  });
 });
}
async function regression(engine,browser,html){
 await record(engine+'-changed-catalog',()=>withUI(browser,html,async ui=>{
  await ui.frame.locator('a[href="#/lots"]').first().click();await ui.frame.locator('[data-search]').fill('dinner');
  await ui.frame.locator('[data-search]').evaluate(el=>{el.focus();el.setSelectionRange(2,2);});
  ui.f.packet.catalog.lots[0].title='Changed dinner title';ui.f.packet.catalog.lots[0].opening=15000;
  await refresh(ui);
  assert.match(await ui.frame.locator('.card-title').textContent(),/Changed dinner title/);
  assert.match(await ui.frame.locator('.card-numbers').textContent(),/150/);
  assert.equal(await ui.frame.locator('[data-search]').inputValue(),'dinner','A changed lot must preserve the user query.');
  clean(ui);
 }));
 await record(engine+'-changed-standing',()=>withUI(browser,html,async ui=>{
  await openLot(ui);ui.f.standing.currentAmountMinor=17500;ui.f.standing.minimumAmountMinor=20000;ui.f.standing.version=1;ui.f.standing.acceptedBidCount=1;ui.f.standing.leadingBusiness={id:OTHER,name:'Current other business'};
  await refresh(ui);await expectEventually(async()=>/Current other business/.test(await ui.frame.locator('.catalog-standing').textContent()),'Changed standing must show current leader.');
  assert.match(await ui.frame.locator('.catalog-standing').textContent(),/175/);
  assert.match(await ui.frame.locator('.catalog-amount-note').textContent(),/200/);
  assert.equal(await ui.frame.locator('.catalog-footer [data-action="bid"]').isEnabled(),true);
  ui.f.context.businesses[0].canBid=false;await refresh(ui);
  assert.equal(await ui.frame.locator('.catalog-footer [data-action="bid"]').isDisabled(),true,'Changed canBid=false must disable bid control.');
  assert.match(await ui.frame.locator('.catalog-footer').textContent(),/not enabled/i);clean(ui);
 }));
 await record(engine+'-offline-reconnect',()=>withUI(browser,html,async ui=>{
  await openLot(ui);const previous=await ui.frame.locator('[data-standing-as-of]').getAttribute('data-standing-as-of');
  await ui.context.setOffline(true);await expectEventually(()=>ui.frame.locator('.catalog-footer [data-action="bid"]').isDisabled(),'Offline must disable bidding.');
  assert.equal(await ui.frame.locator('[data-standing-as-of]').getAttribute('data-standing-as-of'),previous,'Offline retains last confirmed standing time.');
  assert.match(await ui.frame.locator('.catalog-standing').textContent(),/last confirmed|out of date|offline/i);
  ui.f.standing.currentAmountMinor=15000;ui.f.standing.minimumAmountMinor=17500;ui.f.standing.version=1;ui.f.standing.acceptedBidCount=1;ui.f.standing.leadingBusiness={id:OTHER,name:'Reconnect leader'};
  await ui.context.setOffline(false);
  await expectEventually(async()=>/Reconnect leader/.test(await ui.frame.locator('.catalog-standing').textContent()),'Online refresh must adopt newly confirmed standing.');
  assert.equal(await ui.frame.locator('.catalog-footer [data-action="bid"]').isEnabled(),true);clean(ui);
 }));
 await record(engine+'-phase-closure',()=>withUI(browser,html,async ui=>{
  await openLot(ui);ui.f.packet.phase='closed';ui.f.standing.phase='closed';ui.f.standing.canBid=false;await refresh(ui);
  await expectEventually(async()=>/Bidding closed/.test(await ui.frame.locator('.catalog-footer').textContent()),'Server closure must render immediately.');
  assert.equal(await ui.frame.locator('.catalog-footer [data-action="bid"]').isDisabled(),true);
  assert.match(await ui.frame.locator('.banner.b-closed').textContent(),/closed/i);
  await autoPoll(ui);assert.ok(await ui.page.evaluate(()=>window.__timeouts.includes(30000)),'Closed phase retains thirty-second polling policy.');
  clean(ui);
 }));
 await record(engine+'-receipt-recovery',()=>withUI(browser,html,async ui=>{
  await openLot(ui);await ui.frame.locator('.catalog-footer [data-action="bid"]').click();await ui.frame.locator('#amt').fill('125');
  await ui.frame.locator('#sheet [data-action="place"]').click();
  await expectEventually(async()=>await ui.frame.locator('#sheet').getAttribute('data-bid-state')==='unconfirmed','Lost transport must show unconfirmed rather than accepted.');
  assert.equal(await ui.frame.locator('#sheet .result.t-green').count(),0);
  const original=structuredClone(ui.f.intent);assert.equal(original.amountMinor,12500);
  await refresh(ui);assert.equal(await ui.frame.locator('#sheet').getAttribute('data-bid-state'),'unconfirmed','Polling cannot invent an accepted receipt.');
  ui.f.receiptStatus=200;await ui.frame.locator('#sheet [data-action="check"]').click();
  await expectEventually(async()=>await ui.frame.locator('#sheet').getAttribute('data-bid-state')==='accepted','Owned confirmed receipt must recover accepted state.');
  assert.equal(await ui.frame.locator('[data-owned-request]').getAttribute('data-owned-request'),original.requestId);
  assert.equal(ui.hits.filter(x=>x.kind==='bid').length,1,'Receipt recovery never submits a second bid.');clean(ui);
 }));
}
async function adversarial(engine,browser,html){
 await record(engine+'-context-generation',()=>withUI(browser,html,async ui=>{
  await openLot(ui);ui.f.standing.currentAmountMinor=90000;ui.f.standing.leadingBusiness={id:OTHER,name:'Obsolete response sentinel'};
  const old=ui.hold('standing');await refresh(ui);await expectEventually(()=>old.seen,'Old standing request must be held.');
  ui.f.context.businesses[0].canBid=false;ui.f.standing.currentAmountMinor=10000;ui.f.standing.leadingBusiness=null;ui.f.standing.canBid=false;
  await refresh(ui);old.release();await ui.page.waitForTimeout(160);
  assert.doesNotMatch(await ui.frame.locator('#view').textContent(),/Obsolete response sentinel/,'A response from the previous authority generation is discarded.');
  assert.equal(await ui.frame.locator('.catalog-footer [data-action="bid"]').isDisabled(),true);clean(ui);
 }));
 await record(engine+'-parent-sequence',()=>withUI(browser,html,async ui=>{
  await openLot(ui);const oldCatalog=ui.hold('catalog'),oldContext=ui.hold('context');await refresh(ui);
  await expectEventually(()=>oldCatalog.seen&&oldContext.seen,'Old parent response pair must be held.');
  ui.f.context.person={id:OTHER,name:'New actor sentinel'};await refresh(ui);
  oldCatalog.release();oldContext.release();await ui.page.waitForTimeout(160);
  assert.equal(await ui.page.locator('[data-bidder-person]').getAttribute('data-bidder-person'),OTHER,'Latest parent context wins over captured older response.');
  assert.match(await ui.frame.locator('.catalog-footer').textContent(),/New actor sentinel/);
  assert.doesNotMatch(await ui.frame.locator('.catalog-footer').textContent(),/Local test person/);clean(ui);
 }));
 await record(engine+'-logout-race',()=>withUI(browser,html,async ui=>{
  const oldCatalog=ui.hold('catalog'),oldContext=ui.hold('context');await refresh(ui);
  await expectEventually(()=>oldCatalog.seen&&oldContext.seen,'Old logged-in responses must be held.');
  await ui.page.getByRole('button',{name:'Sign out',exact:true}).click();
  assert.equal(await ui.page.locator('iframe').count(),0,'Logout immediately unmounts private content.');
  oldCatalog.release();oldContext.release();await ui.page.waitForTimeout(160);
  assert.equal(await ui.page.locator('iframe').count(),0,'Old responses must not restore private content after logout.');clean(ui);
 }));
 await record(engine+'-401-private-unmount',()=>withUI(browser,html,async ui=>{
  ui.f.catalogStatus=401;await refresh(ui);
  assert.equal(await ui.page.locator('iframe').count(),0,'Current catalog 401 unmounts private content.');
  assert.match(await ui.page.locator('[role="alert"]').textContent(),/Sign in/);clean(ui);
 }));
 await record(engine+'-stale-error',()=>withUI(browser,html,async ui=>{
  await openLot(ui);const previous=await ui.frame.locator('[data-standing-as-of]').getAttribute('data-standing-as-of');
  ui.f.catalogStatus=503;await refresh(ui);
  assert.equal(await ui.frame.locator('.catalog-footer [data-action="bid"]').isDisabled(),true,'Failed parent refresh marks retained view stale and disables bid.');
  assert.equal(await ui.frame.locator('[data-standing-as-of]').getAttribute('data-standing-as-of'),previous);
  assert.match(await ui.frame.locator('.catalog-standing').textContent(),/last confirmed|out of date|offline/i);
  assert.equal(await ui.frame.locator('.result.t-green').count(),0);clean(ui);
 }));
}
async function main(){
 if(!names[mode])throw new HarnessError('Mode must be acceptance, regression or adversarial.');
 if(mode==='regression')await record('authority-source-identity',async()=>{
  const binding=JSON.parse(fs.readFileSync(new URL('./authority-source.json',import.meta.url),'utf8'));
  for(const [file,hash]of Object.entries(binding))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'Unchanged authority/server source: '+file);
 });
 const {webkit,chromium}=dependencies(),html=parentHTML();
 for(const [engine,launcher]of [['webkit',webkit],['chromium',chromium]]){
  let browser;try{browser=await launcher.launch({headless:true});}catch(e){throw new HarnessError(engine+' launch unavailable: '+e.message);}
  try{await ({acceptance,regression,adversarial})[mode](engine,browser,html);}finally{await browser.close();}
 }
 const result={protocol:1,check:names[mode],phase:process.env.VERIFY_TREE||'candidate',run_id:process.env.VERIFY_RUN_ID||'manual',assertions:rows};
 if(process.env.VERIFY_RESULT_JSON)fs.writeFileSync(process.env.VERIFY_RESULT_JSON,JSON.stringify(result)+'\n');
 console.log(JSON.stringify(result));process.exitCode=rows.some(x=>x.status==='fail')?1:0;
}
main().catch(e=>{console.error(JSON.stringify({harness_error:e.message}));process.exitCode=99;});
