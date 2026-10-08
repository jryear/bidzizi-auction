import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dependencies,parentHTML,HarnessError,root,withUI,until,refresh,openLot} from '../staging-mobile-poll-render/harness.mjs';
import {LOT,PERSON,BUSINESS,OTHER} from '../staging-mobile-poll-render/fixtures.mjs';
const mode=process.argv[2],rows=[];
const names={'reviewed-regression':'Reviewed multi-lot and business attribution transitions','reviewed-adversarial':'Reviewed open review safety and delayed receipt ownership'};
const LOT_B='20000000-0000-4000-8000-000000000001',LOT_C='20000000-0000-4000-8000-000000000002';
const BUSINESS_B='20000000-0000-4000-8000-000000000003',BUSINESS_C='20000000-0000-4000-8000-000000000004';
function clean(ui){assert.deepEqual(ui.errors,[],'No page errors or unknown source/API requests.');assert.deepEqual(ui.foreign,[],'No foreign-origin requests.');}
async function record(id,fn){
 try{await fn();rows.push({id,status:'pass',detail:'Reviewed transition observed in a fresh 390x844 browser-local context.'});}
 catch(e){if(e instanceof HarnessError)throw e;if(e.name!=='AssertionError')throw new HarnessError(id+': '+e.message);rows.push({id,status:'fail',detail:e.message.slice(0,1000)});}
}
async function eventually(fn,message,ms=4000){assert.ok(await until(fn,ms),message);}
async function review(ui){
 await openLot(ui);await ui.frame.locator('.catalog-footer [data-action="bid"]').click();
 await ui.frame.locator('#amt').fill('125');
 await ui.frame.locator('#amt').evaluate(el=>{el.focus();el.setSelectionRange(1,1);});
 assert.equal(await ui.frame.locator('#sheet [data-action="place"]').isEnabled(),true,'The initial reviewed amount must be submit-enabled.');
}
async function catalogRows(ui){return ui.frame.locator('#lotlist .card').evaluateAll(cards=>cards.map(card=>({
 id:card.getAttribute('data-lot'),href:card.querySelector('.card-link')?.getAttribute('href'),
 image:card.querySelector('.card-media img')?.getAttribute('src'),alt:card.querySelector('.card-media img')?.getAttribute('alt'),
 title:card.querySelector('.card-title')?.textContent,short:card.querySelector('.card-short')?.textContent,
})));}
function expected(lots){return lots.map(l=>({id:l.id,href:'#/lot/'+l.id,image:'/staging-bidder-preview/'+l.image,alt:l.alt,title:l.title,short:l.short}));}
async function reviewedRegression(engine,browser,html){
 await record(engine+'-multi-lot-transitions',()=>withUI(browser,html,async ui=>{
  const a=structuredClone(ui.f.packet.catalog.lots[0]);
  const b={...structuredClone(a),id:LOT_B,number:'02',title:'Inserted coffee lot',short:'Coffee detail remains attributed to lot B',image:'assets/lots/coffee.jpg',alt:'Coffee photo belongs to lot B',description:'Description belongs to inserted lot B'};
  const c={...structuredClone(a),id:LOT_C,number:'03',title:'Inserted flowers lot',short:'Flowers detail belongs to lot C',image:'assets/lots/flowers.jpg',alt:'Flowers photo belongs to lot C'};
  await ui.frame.locator('a[href="#/lots"]').first().click();
  ui.f.packet.catalog.lots=[a,b];await refresh(ui);
  assert.deepEqual(await catalogRows(ui),expected([a,b]),'Two lots must have correct order, link, image, alt and text.');
  const changedB={...b,title:'Updated coffee lot B',short:'Changed text for B',image:'assets/lots/ceramics.jpg',alt:'Updated ceramics photo belongs to B'};
  ui.f.packet.catalog.lots=[c,a,changedB];await refresh(ui);
  assert.deepEqual(await catalogRows(ui),expected([c,a,changedB]),'Insertion/reordering must not attach another lot image/link/text to a retained card.');
  ui.f.packet.catalog.lots=[changedB,c];await refresh(ui);
  assert.deepEqual(await catalogRows(ui),expected([changedB,c]),'Removal and reorder must remove obsolete links and retain the correct lot content.');
  assert.equal(await ui.frame.locator(`#lotlist a[href="#/lot/${LOT}"]`).count(),0,'Removed lot A must not retain a link.');
  await ui.frame.locator(`#lotlist a[href="#/lot/${LOT_B}"]`).click();
  assert.equal(await ui.frame.locator('#view main').getAttribute('data-lot'),LOT_B,'The current card link must navigate to the same lot.');
  assert.equal(await ui.frame.locator('.d-title').textContent(),changedB.title);
  assert.equal(await ui.frame.locator('.hero img').getAttribute('src'),'/staging-bidder-preview/'+changedB.image);
  assert.equal(await ui.frame.locator('.hero img').getAttribute('alt'),changedB.alt);
  assert.match(await ui.frame.locator('#view main').textContent(),/Description belongs to inserted lot B/);
  assert.equal(ui.hits.filter(x=>x.kind==='bid').length,0);clean(ui);
 }));
 await record(engine+'-business-membership-attribution',()=>withUI(browser,html,async ui=>{
  await review(ui);
  const retained={id:BUSINESS,name:'Renamed retained business',canBid:true},other={id:BUSINESS_B,name:'Earlier eligible business B',canBid:true};
  ui.f.context.businesses=[other,retained];await refresh(ui);
  assert.match(await ui.frame.locator('.catalog-footer').textContent(),/Renamed retained business/,'Existing identity remains selected while that membership is still present.');
  assert.match(await ui.frame.locator('#sheet .forbiz').textContent(),/Renamed retained business/);
  assert.doesNotMatch(await ui.frame.locator('#sheet .commit-box').textContent(),/Earlier eligible business B/);
  ui.f.context.businesses=[{id:BUSINESS_C,name:'View-only business C',canBid:false},{id:BUSINESS_B,name:'Replacement eligible business B',canBid:true}];
  ui.f.context.person.name='Updated attribution person';await refresh(ui);
  assert.match(await ui.frame.locator('.catalog-footer').textContent(),/Replacement eligible business B.*Updated attribution person/);
  assert.match(await ui.frame.locator('#sheet .forbiz').textContent(),/Replacement eligible business B.*Updated attribution person/);
  assert.match(await ui.frame.locator('#sheet .commit-box').textContent(),/Replacement eligible business B/);
  assert.match(await ui.frame.locator('#sheet .commit-box').textContent(),/Updated attribution person/);
  assert.doesNotMatch(await ui.frame.locator('#sheet .commit-box').textContent(),/Renamed retained business|View-only business C|Local test person/);
  assert.equal(await ui.frame.locator('#amt').inputValue(),'125','Membership replacement retains the typed review amount.');
  assert.equal(await ui.frame.locator('#sheet [data-action="place"]').isEnabled(),true);
  assert.equal(ui.hits.filter(x=>x.kind==='bid').length,0,'Changing attribution does not submit a bid.');clean(ui);
 }));
}
async function reviewedAdversarial(engine,browser,html){
 await record(engine+'-open-review-safety',async()=>{
  for(const transition of ['permission','closed','stale','offline'])await withUI(browser,html,async ui=>{
   await review(ui);
   if(transition==='permission'){ui.f.context.businesses[0].canBid=false;await refresh(ui);}
   if(transition==='closed'){
    // Real context DTO also sets canBid=false when database phase is closed.
    ui.f.packet.phase='closed';ui.f.standing.phase='closed';ui.f.standing.canBid=false;ui.f.context.businesses[0].canBid=false;await refresh(ui);
   }
   if(transition==='stale'){ui.f.catalogStatus=503;await refresh(ui);}
   if(transition==='offline')await ui.context.setOffline(true);
   await eventually(()=>ui.frame.locator('#sheet [data-action="place"]').isDisabled(),transition+' must disable the open review submit control.');
   assert.equal(await ui.frame.locator('#sheet').evaluate(d=>d.open),true,transition+' retains the review dialog.');
   assert.equal(await ui.frame.locator('#sheet').getAttribute('data-bid-state'),'review');
   assert.equal(await ui.frame.locator('#amt').inputValue(),'125',transition+' retains the entered amount.');
   assert.match(await ui.frame.locator('#amt-err').textContent(),/Reconnect|not available/i,transition+' supplies a safe review status.');
   assert.equal(ui.hits.filter(x=>x.kind==='bid').length,0,transition+' does not submit or retry a bid.');
   assert.equal(await ui.frame.locator('#sheet .result.t-green').count(),0);clean(ui);
  });
 });
 await record(engine+'-held-receipt-actor-change',()=>withUI(browser,html,async ui=>{
  await review(ui);await ui.frame.locator('#sheet [data-action="place"]').click();
  await eventually(async()=>await ui.frame.locator('#sheet').getAttribute('data-bid-state')==='unconfirmed','Lost transport must first become unconfirmed.');
  const intent=structuredClone(ui.f.intent);assert.equal(intent.amountMinor,12500);
  ui.f.receiptStatus=200;const held=ui.hold('receipt');
  try{
   await ui.frame.locator('#sheet [data-action="check"]').click();
   await eventually(()=>held.seen,'The original receipt response must be captured before actor change.');
   assert.equal(held.body.receipt.actorId,PERSON);assert.equal(held.body.receipt.requestId,intent.requestId);
   ui.f.context.person={id:OTHER,name:'Replacement actor sentinel'};await refresh(ui);
   assert.equal(await ui.frame.locator('#sheet').evaluate(d=>d.open),false,'Actor change closes the old actor review/recovery sheet.');
   held.release();await ui.page.waitForTimeout(180);
   assert.equal(await ui.frame.locator('#sheet').evaluate(d=>d.open),false,'A late old actor receipt cannot reopen the sheet.');
   assert.equal(await ui.frame.locator('[data-owned-request]').count(),0,'A late old actor receipt cannot create accepted UI.');
   assert.equal(await ui.frame.locator('#sheet .result.t-green').count(),0);
   assert.match(await ui.frame.locator('.catalog-footer').textContent(),/Replacement actor sentinel/);
   assert.equal(ui.hits.filter(x=>x.kind==='receipt').length,1,'Only the captured original receipt lookup occurs.');
   assert.equal(ui.hits.filter(x=>x.kind==='bid').length,1,'Actor change and late receipt do not submit a second bid.');clean(ui);
  }finally{held.release();}
 }));
}
async function main(){
 if(!names[mode])throw new HarnessError('Mode must be reviewed-regression or reviewed-adversarial.');
 if(mode==='reviewed-regression')await record('predecessor-evidence-identity',async()=>{
  const binding=JSON.parse(fs.readFileSync(new URL('./predecessor-binding.json',import.meta.url),'utf8'));
  for(const [file,hash]of Object.entries(binding))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'Predecessor stays byte-for-byte: '+file);
 });
 const {webkit,chromium}=dependencies(),html=parentHTML();
 for(const [engine,launcher]of [['webkit',webkit],['chromium',chromium]]){
  let browser;try{browser=await launcher.launch({headless:true});}catch(e){throw new HarnessError(engine+' unavailable: '+e.message);}
  try{await (mode==='reviewed-regression'?reviewedRegression:reviewedAdversarial)(engine,browser,html);}finally{await browser.close();}
 }
 const result={protocol:1,check:names[mode],phase:process.env.VERIFY_TREE||'candidate',run_id:process.env.VERIFY_RUN_ID||'manual',assertions:rows};
 if(process.env.VERIFY_RESULT_JSON)fs.writeFileSync(process.env.VERIFY_RESULT_JSON,JSON.stringify(result)+'\n');
 console.log(JSON.stringify(result));process.exitCode=rows.some(row=>row.status==='fail')?1:0;
}
main().catch(e=>{console.error(JSON.stringify({harness_error:e.message}));process.exitCode=99;});
