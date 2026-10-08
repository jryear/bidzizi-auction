import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {HarnessError} from '../staging-catalog/harness.mjs';
import {meta,hash,assetUUID} from './oracles.mjs';
import {create,completeLot,openFields,save,compact,reload,login} from './protocol.mjs';
export async function ui(f,actor,viewport={width:1440,height:1000}){
 let browser;try{const pending=chromium.launch({headless:true,timeout:8000});f.owned.pendingBrowsers.push(pending);browser=await pending;if(f.owned.cancelled){await browser.close();throw new HarnessError('Owned browser launch was cancelled:99.');}}catch{throw new HarnessError('Independent Chromium is unavailable:99.');}
 f.owned.browsers.push(browser);const context=await browser.newContext({viewport});
 if(actor){const [name,value]=actor.cookie.split('=');await context.addCookies([{name,value,url:f.origin,httpOnly:true,sameSite:'Lax'}]);}
 const page=await context.newPage();return {browser,context,page,studio:page.frameLocator('iframe[title="BidZizi admin workspace"]')};
}
async function healthReady(locator){try{await locator.waitFor({state:'visible',timeout:15000});}catch{throw new HarnessError('Existing native staff/010 runtime did not become available:99.');}}
async function settledImage(locator){const end=Date.now()+5000;while(Date.now()<end){if(await locator.count()&&await locator.first().evaluate(i=>i.complete&&i.naturalWidth>0))return;await new Promise(r=>setTimeout(r,50));}assert.fail('Rendered asset never loaded real decoded pixels.');}
export async function uploadInput(f,native,label,file,event){
 const input=native.studio.getByLabel(label,{exact:true});assert.equal(await input.count(),1,'A real accessible native file input is required: '+label);
 const response=native.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/admin/events/'+event+'/assets',{timeout:15000});
 await input.setInputFiles(join(f.repo,'tests/acceptance/staging-staff-assets/fixtures',file.name));
 const r=await response;assert.equal(r.status(),201);const body=await r.json(),a=meta(body,event,body.asset?.requestId);return a;
}
export async function composeNative(f,actor,files,fields,record){
 const n=await ui(f,actor);await n.page.goto(f.origin+'/admin');await healthReady(n.studio.locator('[data-action="new-event"]'));
 await n.studio.locator('[data-action="new-event"]').click();await n.studio.locator('#new-event-name').fill('Synthetic ASSETS native staff auction');
 await n.studio.locator('#new-event-format').selectOption('historical');
 const creation=n.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/events'&&r.request().method()==='POST');
 await n.studio.locator('[data-action="create-event"]').click();const made=await creation;assert.equal(made.status(),201);const event=(await made.json()).draft.event.id;
 await n.studio.locator('[data-tab="event"]').click();
 for(const key of ['date','start','end'])await n.studio.locator('[data-event="'+key+'"]').fill(fields[key]);
 await n.studio.locator('[data-event="timezone"]').selectOption(fields.timezone);await n.studio.locator('[data-event="increment"]').fill('25');
 await n.studio.locator('[data-event="welcome"]').fill('Synthetic saved welcome with real uploaded assets.');
 const cover=await uploadInput(f,n,'Upload event photo',files.cover,event);await n.studio.getByLabel('Event photo description',{exact:true}).fill('Synthetic red and blue event cover');
 await n.studio.locator('[data-event="sponsorsEnabled"]').check();await n.studio.locator('[data-action="add-sponsor"]').click();
 await n.studio.locator('[data-sponsor="0"]').fill('Synthetic cobalt sponsor');
 const sponsor=await uploadInput(f,n,'Upload sponsor 1 logo',files.sponsor,event);await n.studio.getByLabel('Sponsor 1 logo description',{exact:true}).fill('Synthetic transparent cobalt sponsor logo');
 await n.studio.locator('[data-tab="lots"]').click();await n.studio.locator('[data-action="add-lot"]').click();
 for(const [key,value] of Object.entries({title:'Synthetic marigold item',description:'A complete synthetic item with a real uploaded photo.',category:'Good things',opening:'25'}))await n.studio.locator('[data-lot="'+key+'"]').fill(value);
 const item=await uploadInput(f,n,'Upload item photo',files.item,event);
 if(!await n.studio.locator('[data-lot="alt"]').isVisible())await n.studio.locator('#editor details summary').click();
 await n.studio.locator('[data-lot="alt"]').fill('Synthetic marigold item photograph');
 await n.studio.locator('#select-all').check();await n.studio.locator('[data-action="assign-window"]').click();await n.studio.locator('[data-action="apply-window"]').click();
 const saving=n.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/events/'+event&&r.request().method()==='PUT');
 await n.studio.locator('#save-draft').click();const saved=await saving;assert.equal(saved.status(),200);const packet=(await saved.json()).draft;
 assert.equal(packet.event.cover,cover.ref);assert.equal(packet.event.sponsors[0].logo,sponsor.ref);assert.equal(packet.lots[0].image,item.ref);
 await n.page.reload();await healthReady(n.studio.locator('[data-preview-mode="saved"]'));await n.studio.locator('[data-preview-mode="saved"]').click();
 const preview=n.studio.frameLocator('#bidder-frame');await settledImage(preview.locator('img[alt="Synthetic red and blue event cover"]'));
 await settledImage(preview.locator('img[alt="Synthetic transparent cobalt sponsor logo"]'));
 await n.studio.locator('[data-action="preview-route"][data-path="/lots"]').click();await settledImage(preview.locator('img[alt="Synthetic marigold item photograph"]'));
 await f.capture(n.page,'native-saved-A-desktop');await f.capture(n.studio.locator('#bidder-frame'),'native-saved-A-phone-frame');
 const loaded=await preview.locator('img').evaluateAll(rows=>rows.map(i=>({src:i.getAttribute('src'),alt:i.alt,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight})));
 record({stage:'native-create-upload-save-reload',event,revision:packet.revision,refs:[cover.ref,sponsor.ref,item.ref],loaded});
 await n.studio.locator('[data-tab="lots"]').click();await n.studio.locator('#select-all').check();await n.studio.locator('#review-catalog').click();
 const published=n.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/events/'+event+'/catalog-approval'&&r.request().method()==='POST');
 await n.studio.locator('[data-action="approve-catalog"]').click();const approved=await published;assert.equal(approved.status(),201);const approval=(await approved.json()).approval;
 return {packet,approval,assets:{cover,sponsor,item},native:n};
}
export async function board(f,actor,event,imageRef,record,label='010-board'){
 const n=await ui(f,actor,{width:390,height:844});await n.page.goto(f.origin+'/events/'+event+'/display');
 await healthReady(n.page.locator('main[data-private-board="display"]'));
 const end=Date.now()+12000;while(Date.now()<end&&!['current','denied','error'].includes(await n.page.locator('main').getAttribute('data-state')))await new Promise(r=>setTimeout(r,50));
 assert.equal(await n.page.locator('main').getAttribute('data-state'),'current','010 parser must accept the actual authorized projection.');
 const image=n.page.locator('img').filter({hasNot:n.page.locator('[hidden]')});
 if(imageRef)await settledImage(n.page.locator('img[src*="'+imageRef.replace('asset:','')+'"]'));
 const images=await image.evaluateAll(rows=>rows.map(i=>({src:i.getAttribute('src'),alt:i.alt,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight})));
 assert.ok(images.some(i=>i.naturalWidth>0));await f.capture(n.page,label);record({stage:label,images,state:await n.page.locator('main').getAttribute('data-state')});return n;
}
export async function generationRaces(f,actor,file,record){
 const a=await create(f,actor,'Synthetic delayed upload target A'),lots=[completeLot('First synthetic target'),completeLot('Second synthetic target','dinner')];
 let p=await save(f,actor,a,{event:await openFields(f),lots}),other=await create(f,actor,'Synthetic delayed upload target B');
 for(const kind of ['item-target','event','actor']){
   const n=await ui(f,actor);const assetRequests=[];n.page.on('request',r=>{if(r.url().includes('/assets'))assetRequests.push([r.method(),r.url()]);});await n.page.goto(f.origin+'/admin?event='+p.event.id+'&lot='+lots[0].id);
   let release,committed,error,done,started=false;const hold=new Promise(r=>release=r),finished=new Promise(r=>done=r);
   await n.page.route('**/api/admin/events/'+p.event.id+'/assets',async route=>{
     started=true;try{const response=await route.fetch();assert.equal(response.status(),201);const body=await response.json();committed=meta(body,p.event.id,body.asset?.requestId);await hold;await route.fulfill({response});}
     catch(e){error=e;await route.abort().catch(()=>{});}finally{done();}
   });
   try{
     await n.studio.locator('[data-tab="lots"]').click();await n.studio.locator('[data-action="edit-lot"][data-id="'+lots[0].id+'"]').click();
     const input=n.studio.getByLabel('Upload item photo',{exact:true});assert.equal(await input.count(),1);await input.setInputFiles(join(f.repo,'tests/acceptance/staging-staff-assets/fixtures',file.name));
     const deadline=Date.now()+10000;while(!committed&&!error&&Date.now()<deadline)await new Promise(r=>setTimeout(r,30));if(error)throw error;assert.ok(committed,`A held late response needs an actual commit witness (route started: ${started}; asset requests: ${JSON.stringify(assetRequests)}; notice: ${await n.studio.locator('#draft-notice').innerText()}).`);
     if(kind==='item-target'){await n.studio.locator('[data-action="edit-lot"][data-id="'+lots[1].id+'"]').click();await n.studio.locator('[data-lot="short"]').fill('Current target changed while upload reply was held.');}
     if(kind==='event'){await n.studio.locator('[data-action="events"]').click();await n.studio.locator('[data-action="switch-event"][data-id="'+other.event.id+'"]').click();await n.studio.getByRole('heading',{name:'Synthetic delayed upload target B',exact:true}).waitFor();await n.studio.locator('[data-tab="event"]').click();await n.studio.locator('[data-event="welcome"]').fill('Current event changed while old upload reply was held.');}
     if(kind==='actor'){const outsider=await login(f,'staff-pine'),[name,value]=outsider.cookie.split('=');await n.context.addCookies([{name,value,url:f.origin,httpOnly:true,sameSite:'Lax'}]);}
     release();await finished;if(error)throw error;await new Promise(r=>setTimeout(r,300));
     if(kind==='actor'){
       const end=Date.now()+5000;while(Date.now()<end&&await n.studio.locator('#editor img[src*="'+assetUUID(committed.ref)+'"]').count())await new Promise(r=>setTimeout(r,50));
       assert.equal(await n.studio.locator('#editor img[src*="'+assetUUID(committed.ref)+'"]').count(),0,'A different current actor cannot attach the late staff response.');
       assert.equal((await reload(f,actor,p.event.id)).lots[0].image,lots[0].image);
     }else{
       const event=kind==='event'?other.event.id:p.event.id;
       const saveReply=n.page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/admin/events/'+event);
       await n.studio.locator('#save-draft').click();const saved=await saveReply;assert.equal(saved.status(),200);const value=(await saved.json()).draft;
       if(kind==='event')assert.equal(value.event.cover,null);else{assert.deepEqual(value.lots.map(l=>l.image),lots.map(l=>l.image));p=value;}
       assert.ok(!JSON.stringify(value).includes(committed.ref),'Changed context must drop the late attachment.');
     }
     record({stage:'late-upload-'+kind,durableButUnattachedRef:committed.ref,lateResponseCannotChangeNewContext:true});
   }finally{release?.();if(started)await finished;await n.browser.close();}
 }
}
export async function parserDenialControls(f,viewer,event,record){
 for(const kind of ['supplied-remote-image','wrong-approval-context']){
   const n=await ui(f,viewer);await n.page.route('**/api/catalog/events/'+event,async route=>{
     const actual=await route.fetch(),body=await actual.json();assert.equal(actual.status(),200);assert.ok(body.catalog?.lots.length);
     if(kind==='supplied-remote-image')body.catalog.lots[0].image='https://foreign.invalid/executing.svg';
     else body.assetContext={version:1,approvalId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
     await route.fulfill({response:actual,json:body});
   });
   await n.page.goto(f.origin+'/events/'+event+'/display');await healthReady(n.page.locator('main[data-private-board="display"]'));
   const end=Date.now()+10000;while(Date.now()<end&&!['error','denied'].includes(await n.page.locator('main').getAttribute('data-state')))await new Promise(r=>setTimeout(r,50));
   assert.equal(await n.page.locator('main').getAttribute('data-state'),'error');assert.equal(await n.page.locator('img').count(),0);
   record({stage:'010-parser-control',kind,invalidPayloadCleared:true});await n.browser.close();
 }
}
