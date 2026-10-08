import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pngSize} from '../staging-saturn-event-home-v3/render-validate.mjs';
import {fixture,readPacket,receipt,login,ids,compact,completeLot,saved,mutate,uuid,assertApprovalSQL,approve} from '../staging-workspace-entry/fixtures.mjs';
import {browserFixture,expect,deferred,bounded,taskFrameFlush} from '../staging-workspace-entry/browser.mjs';
import {savedPreview as preview,waitActualBidder} from '../staging-saturn-event-home-v3/preview-readiness.mjs';
import {installControl} from './source-controls.mjs';

export const copyFields=['title','short','description','category','image','alt','opening','includes','fine'];
const copyValues=lot=>Object.fromEntries(copyFields.map(k=>[k,structuredClone(lot[k])]));
const copyButton=ui=>ui.admin.getByRole('button',{name:'Duplicate lot',exact:true});
export async function requireCopy(ui){assert.equal(await copyButton(ui).count(),1,'DUPLICATE_CONTROL_MISSING: selected lot has one useful Duplicate lot action');}
async function lots(ui,id){await ui.admin.getByRole('link',{name:/^Lots/}).click();await ui.admin.locator('[data-action="edit-lot"][data-id="'+id+'"]').click();await expect(ui.admin.locator('.lot-row.active')).toHaveAttribute('data-id',id);await expect(ui.admin.locator('[data-lot="title"]')).toBeVisible();await taskFrameFlush(ui,'Selected current lot editor ready');}
async function dispatchCopy(ui){await ui.frame.evaluate(()=>{const el=document.querySelector('[data-action="duplicate-lot"]');if(!el?.isConnected)throw Error('Current live Duplicate action missing');el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
async function working(ui){
 const actual=await waitActualBidder(ui),sequence=await actual.frame.evaluate(()=>window.__workspacePackets.length);await ui.admin.locator('[data-preview-mode="working"]').click();
 await expect.poll(()=>actual.frame.evaluate(()=>window.__workspacePackets.length)).toBeGreaterThan(sequence);
 await expect.poll(()=>actual.frame.evaluate(()=>window.__workspacePackets.at(-1)?.payload?.mode)).toBe('working');
 return actual.frame.evaluate(()=>structuredClone(window.__workspacePackets.at(-1).payload));
}
async function savedMode(ui){const actual=await waitActualBidder(ui),sequence=await actual.frame.evaluate(()=>window.__workspacePackets.length);await ui.admin.locator('[data-preview-mode="saved"]').click();await expect.poll(()=>actual.frame.evaluate(()=>window.__workspacePackets.length)).toBeGreaterThan(sequence);await expect.poll(()=>actual.frame.evaluate(()=>window.__workspacePackets.at(-1)?.payload?.mode)).toBe('saved');}
async function open(f,x,fn,options={}){
 await browserFixture(f,x.packet,async ui=>{await expect(ui.admin.locator('#saved')).toHaveText('Saved');await expect(ui.admin.locator('#catalog-approval')).not.toHaveText('Checking approval…');await fn(ui);},
  {...options,holdApproval:async ui=>{
   if(options.runtimeChallenge)await ui.page.route('**/api/admin/events/'+x.packet.event.id,async route=>{
    if(route.request().method()!=='GET')return route.continue();const response=await route.fetch(),body=await response.json();
    assert.equal(response.status(),200);Object.assign(body.draft.lots[1],{count:17,current:8700,history:[{amount:8700,person:'source-only'}],standing:{leader:'source-only'},approvalId:'SOURCE_APPROVED_ONLY',publicationState:'SOURCE_PUBLISHED_ONLY',sourceOnlyOpaque:'NEVER COPY UNKNOWN FIELD',provider:'SOURCE ONLY BUSINESS',logo:'source-only-logo'});
    await route.fulfill({response,json:body});
   });
   if(process.env.EVENT_PREPARATION_CONTROL)await installControl(ui,process.env.EVENT_PREPARATION_CONTROL);
  }});
}
async function newCopy(ui,before,source){
 await requireCopy(ui);assert.ok(await copyButton(ui).isEnabled(),'Editable selected lot can be duplicated');await copyButton(ui).click();
 await expect(ui.admin.locator('#saved')).toHaveText('Unsaved edits');const packet=await working(ui),oldIds=new Set(before.lots.map(l=>l.id)),added=packet.lots.filter(l=>!oldIds.has(l.id));
 assert.equal(packet.event.id,before.event.id,'Duplicate remains in current event');assert.equal(packet.lots.length,before.lots.length+1,'One intended copy added');assert.equal(added.length,1,'Exactly one fresh identity');
 const copy=added[0];assert.match(copy.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,'Copy receives a fresh UUID');
 assert.deepEqual(Object.keys(copy).sort(),[...copyFields,'id','number','provider','logo','count','current','history','windowId'].sort(),'Explicit allowlist: no unrecognized source property carried over');
 assert.equal(copy.number,String(before.lots.length+1).padStart(2,'0'),'Copy receives its generated appended catalog number');assert.equal(copy.provider,before.org.name,'Provider derives from current event organization');assert.equal(copy.logo,'saturn','Copy receives current generated provider mark');
 assert.equal(new Set(packet.lots.map(l=>l.id)).size,packet.lots.length,'No repeated identity');assert.deepEqual(copyValues(copy),copyValues(source),'Only intended selected source content is copied');
 assert.equal(copy.windowId,null,'Copy receives no assigned auction window');assert.equal(copy.count,0,'No source bid count copied');assert.equal(copy.current,0,'No source current standing copied');assert.deepEqual(copy.history,[],'No source bid history copied');
 for(const forbidden of ['standing','approvalId','publicationState','approved','published','bids'])assert.equal(Object.hasOwn(copy,forbidden),false,'No source runtime/publication property: '+forbidden);
 assert.deepEqual(packet.lots.filter(l=>oldIds.has(l.id)),before.lots,'Every original lot stays unchanged');
 assert.equal(new URL(ui.page.url()).searchParams.get('lot'),copy.id,'Copy becomes the selected editable lot');await expect(ui.admin.locator('[data-lot="title"]')).toHaveValue(copy.title);
 return {packet,copy};
}
async function screenshots(ui,out,name){
 const images=[],copyId=new URL(ui.page.url()).searchParams.get('lot'),title=await ui.admin.locator('[data-lot="title"]').inputValue();assert.ok(copyId,'Rendered screenshots bind selected copy route');
 for(const [suffix,viewport] of [['desktop',{width:1440,height:900}],['laptop',{width:1280,height:800}],['phone',{width:390,height:844}]]){
  await ui.page.setViewportSize(viewport);if(suffix==='phone'&&await ui.admin.locator('#preview-toggle').getAttribute('aria-pressed')==='true')await ui.admin.locator('.preview-close').click();await taskFrameFlush(ui,'Actual '+suffix+' render');assert.equal(await ui.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Outer '+suffix+' viewport has no overflow');
  const field=ui.admin.locator('[data-lot="title"]');await expect(field).toHaveValue(title);await field.scrollIntoViewIfNeeded();const editor=await ui.frame.evaluate(()=>{const r=document.querySelector('[data-lot="title"]').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight}};});assert.ok(editor.width>=44&&editor.height>=24&&editor.left>=-1&&editor.right<=editor.viewport.width+1&&editor.top>=-1&&editor.bottom<=editor.viewport.height+1,'Selected copy title is actually reachable within '+suffix+' editor viewport '+JSON.stringify(editor));assert.equal(new URL(ui.page.url()).searchParams.get('lot'),copyId);
  const path=join(out,name+'-'+suffix+'.png');await ui.page.screenshot({path,scale:'css'});const bytes=await readFile(path);images.push({scene:suffix,path,copyId,title,editor,actualViewport:await ui.page.evaluate(()=>({width:innerWidth,height:innerHeight})),dimensions:pngSize(bytes),sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await ui.admin.locator('#preview-toggle').click();const actual=await waitActualBidder(ui);const element=await actual.frame.frameElement(),path=join(out,name+'-saved-a-phone.png');
 try{assert.equal(await element.getAttribute('id'),'bidder-frame');const viewport=await actual.frame.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.ok(viewport.width>=300&&viewport.width<=430,'Actual saved A phone width');assert.equal(viewport.overflow,false);await element.screenshot({path,scale:'css'});const bytes=await readFile(path);images.push({scene:'saved-a-phone',path,actualViewport:viewport,dimensions:pngSize(bytes),sha256:createHash('sha256').update(bytes).digest('hex'),actualFrameURL:actual.frame.url(),parentFrameURL:actual.admin.url()});}finally{await element.dispose();}
 await writeFile(join(out,'RENDERED_IMAGES.json'),JSON.stringify(images,null,2)+'\n');
}
export const cases={
 async DUPLICATE_EDIT_SAVE_RELOAD_PREVIEW(f,out){
  const x=await fixture(f,'006 copy edit persisted A',{approved:true}),source=x.packet.lots[1],beforePublication=await f.publicationRows(x.packet.event.id);
  await open(f,x,async ui=>{
   await lots(ui,source.id);const {copy}=await newCopy(ui,x.packet,source);
   assert.deepEqual(await readPacket(f,x.actor,x.packet.event.id),x.packet,'Copy action performs no durable save');await savedMode(ui);await preview(ui,x.packet,{render:false});
   await ui.admin.locator('[data-lot="title"]').fill('006 Edited intended copy');await ui.admin.locator('[data-lot="short"]').fill('006 Edited copy summary');await ui.admin.locator('[data-lot="description"]').fill('006 Edited copy persisted description');
   await ui.admin.locator('[data-lot="category"]').fill('006 Copy category');await ui.admin.locator('[data-lot="opening"]').fill('42.75');await ui.admin.locator('details.disclosure').evaluate(el=>el.open=true);
   await ui.admin.locator('[data-lot="includes"]').fill('Copy included one\nCopy included two');await ui.admin.locator('[data-lot="fine"]').fill('006 Copy details');await ui.admin.locator('[data-lot="alt"]').fill('006 Copy photo description');
   await ui.admin.locator('#save-draft').click();await expect(ui.admin.locator('#saved')).toHaveText('Saved');const persisted=await readPacket(f,x.actor,x.packet.event.id),savedCopy=persisted.lots.find(l=>l.id===copy.id);
   assert.equal(persisted.revision,x.packet.revision+1);assert.ok(savedCopy);assert.deepEqual(copyValues(savedCopy),{title:'006 Edited intended copy',short:'006 Edited copy summary',description:'006 Edited copy persisted description',category:'006 Copy category',image:source.image,alt:'006 Copy photo description',opening:4275,includes:['Copy included one','Copy included two'],fine:'006 Copy details'});
   assert.equal(savedCopy.windowId,null);assert.deepEqual(persisted.lots.filter(l=>l.id!==copy.id),x.packet.lots);await assertApprovalSQL(f,x.packet,[x.packet.lots[0].id],x.approval);
   const afterPublication=await f.publicationRows(x.packet.event.id);assert.deepEqual(afterPublication.approvals,beforePublication.approvals);assert.deepEqual(afterPublication.lots,beforePublication.lots);
   await ui.page.reload({waitUntil:'domcontentloaded'});await expect(ui.admin.locator('[data-lot="title"]')).toHaveValue(savedCopy.title);await expect(ui.admin.locator('#saved')).toHaveText('Saved');assert.equal(new URL(ui.page.url()).searchParams.get('lot'),copy.id);
   await preview(ui,persisted);await screenshots(ui,out,'duplicate-saved');await writeFile(join(out,'DUPLICATE_PERSISTED.json'),JSON.stringify({eventId:persisted.event.id,copyId:copy.id,packet:persisted,approvedCatalogUnchanged:true},null,2)+'\n');
  });
 },
 async DUPLICATE_RETRY_ONCE(f){
  const x=await fixture(f,'006 retry intended copy');await open(f,x,async ui=>{
   await lots(ui,x.packet.lots[0].id);const {copy}=await newCopy(ui,x.packet,x.packet.lots[0]);await ui.admin.locator('[data-lot="title"]').fill('006 Intended retry copy');await savedMode(ui);const attempts=[];
   await ui.page.route('**/api/admin/events/'+x.packet.event.id,async route=>{if(route.request().method()!=='PUT')return route.continue();attempts.push(route.request().postDataJSON());if(attempts.length===1){const response=await route.fetch();assert.equal(response.status(),200);return route.abort('failed');}return route.continue();});
   await ui.admin.locator('#save-draft').evaluate(el=>{el.click();el.click();});await expect(ui.admin.locator('#saved')).toHaveText('Save not confirmed');assert.equal(attempts.length,1,'One first Save despite repeated click');await requireCopy(ui);assert.ok(await copyButton(ui).isDisabled(),'Unresolved Save disables duplicate');
   await dispatchCopy(ui);await taskFrameFlush(ui,'Unresolved copy guard');const unchanged=await working(ui);assert.equal(unchanged.lots.length,x.packet.lots.length+1);assert.equal(unchanged.lots.filter(l=>l.id===copy.id).length,1);await savedMode(ui);await preview(ui,x.packet,{render:false});
   const committed=await readPacket(f,x.actor,x.packet.event.id);assert.equal(committed.lots.filter(l=>l.id===copy.id).length,1);assert.equal(committed.lots.length,x.packet.lots.length+1);
   await ui.admin.locator('#save-draft').click();await expect(ui.admin.locator('#saved')).toHaveText('Saved');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1],'Same operation UUID and complete body retained for retry');const r=await receipt(f,attempts[0].requestId);assert.deepEqual(r.response.draft,committed);
   assert.deepEqual(await readPacket(f,x.actor,x.packet.event.id),committed);assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_lots WHERE id=$1',[copy.id])).rows[0].n,1);assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_requests WHERE operation=$1 AND request_id=$2',['save:'+x.packet.event.id,attempts[0].requestId])).rows[0].n,1);
   await ui.page.reload({waitUntil:'domcontentloaded'});await expect(ui.admin.locator('[data-lot="title"]')).toHaveValue('006 Intended retry copy');await preview(ui,committed);
  });
 },
 async DUPLICATE_SELECTED_ALLOWLIST(f){
  const x=await fixture(f,'006 selected allowlist source');await open(f,x,async ui=>{
   await lots(ui,x.packet.lots[1].id);await ui.admin.locator('[data-lot="title"]').fill('006 Selected unsaved source');await ui.admin.locator('[data-lot="short"]').fill('006 Source latest unsaved short');
   const before=await working(ui);assert.equal(before.lots[1].count,17,'Independent runtime sentinel reaches real source');assert.equal(before.lots[1].current,8700);assert.deepEqual(before.lots[1].history,[{amount:8700,person:'source-only'}]);
   const {copy,packet}=await newCopy(ui,before,before.lots[1]);assert.equal(copy.title,'006 Selected unsaved source');assert.equal(copy.short,'006 Source latest unsaved short');
   await ui.admin.locator('details.disclosure').evaluate(el=>el.open=true);await ui.admin.locator('[data-lot="includes"]').fill('006 Copy owns includes');const after=await working(ui);assert.deepEqual(after.lots.find(l=>l.id===before.lots[1].id).includes,before.lots[1].includes,'Nested source includes are not shared');assert.equal(packet.lots.filter(l=>l.id===copy.id).length,1);
   assert.deepEqual(await readPacket(f,x.actor,x.packet.event.id),x.packet,'Working source edits and copy remain local until Save');
  },{runtimeChallenge:true});
 },
 async DUPLICATE_PENDING_CAPACITY(f){
  const x=await fixture(f,'006 pending duplicate guards');await open(f,x,async ui=>{
   await lots(ui,x.packet.lots[0].id);await requireCopy(ui);await ui.admin.locator('[data-lot="title"]').fill('006 Pending source edit');const arrived=deferred(),release=deferred();
   await ui.page.route('**/api/admin/events/'+x.packet.event.id,async route=>{if(route.request().method()!=='PUT')return route.continue();arrived.resolve();await release.promise;return route.abort('failed');});
   try{await ui.admin.locator('#save-draft').click();await bounded(arrived.promise,'Actual held Save');assert.ok(await copyButton(ui).isDisabled(),'Pending Save disables Duplicate');await dispatchCopy(ui);await taskFrameFlush(ui,'Pending duplicate adversary');assert.equal((await working(ui)).lots.length,x.packet.lots.length);release.resolve();await expect(ui.admin.locator('#saved')).toHaveText('Save not confirmed');assert.ok(await copyButton(ui).isDisabled());}finally{release.resolve();}
  });
  const full=await fixture(f,'006 hundred lot capacity');const draft=compact(full.packet);draft.lots=Array.from({length:100},(_,i)=>({...completeLot('006 capacity '+i,'coffee'),windowId:null}));full.packet=await saved(f,full.actor,full.packet,draft);
  await open(f,full,async ui=>{await lots(ui,full.packet.lots[99].id);await requireCopy(ui);const enabled=await copyButton(ui).isEnabled();if(enabled)await copyButton(ui).click();else await dispatchCopy(ui);await taskFrameFlush(ui,'Capacity programmatic duplicate');if(enabled){await expect(ui.admin.locator('#toast')).toContainText('100');assert.equal(await ui.admin.locator('#toast').getAttribute('aria-live'),'polite','Capacity denial is announced');}assert.equal((await working(ui)).lots.length,100);assert.deepEqual(await readPacket(f,full.actor,full.packet.event.id),full.packet);});
 },
 async DUPLICATE_AUTHORITY_IMMUTABLE(f){
  const own=await fixture(f,'006 Saturn bounded duplicate'),foreign=await fixture(f,'006 Pine foreign lot',{account:'staff-pine',organization:ids.pine});foreign.approval=(await approve(f,foreign.actor,foreign.packet,[foreign.packet.lots[0].id])).approval;const before=await readPacket(f,foreign.actor,foreign.packet.event.id);
  const denied=await f.request('/api/admin/events/'+foreign.packet.event.id,{cookie:own.actor.cookie});assert.equal(denied.status,403);
  const body=compact(own.packet);body.lots.push({...compact(foreign.packet).lots[0]});const deniedId=await mutate(f,own.actor,'/api/admin/events/'+own.packet.event.id,'PUT',{requestId:uuid(),expectedRevision:own.packet.revision,draft:body});assert.equal(deniedId.status,400,'Existing validation rejects foreign lot identity in this event');
  const deniedEvent=await mutate(f,own.actor,'/api/admin/events/'+foreign.packet.event.id,'PUT',{requestId:uuid(),expectedRevision:before.revision,draft:compact(before)});assert.equal(deniedEvent.status,403);assert.deepEqual(await readPacket(f,foreign.actor,foreign.packet.event.id),before);await assertApprovalSQL(f,foreign.packet,[foreign.packet.lots[0].id],foreign.approval,ids.outsider);assert.deepEqual(await readPacket(f,own.actor,own.packet.event.id),own.packet);
  await open(f,own,async ui=>{await lots(ui,own.packet.lots[0].id);await requireCopy(ui);await ui.page.goto(f.origin+'/admin?event='+foreign.packet.event.id,{waitUntil:'domcontentloaded'});await expect(ui.admin.locator('#events-home')).toBeVisible();assert.equal(await copyButton(ui).count(),0,'Unauthorized event cannot expose duplicate editor');assert.ok(!(await ui.admin.locator('body').innerText()).includes(foreign.packet.event.name));});
 },
 async DUPLICATE_APPROVAL_LOCKS(f){
  const x=await fixture(f,'006 approval duplicate guards');await open(f,x,async ui=>{
   await lots(ui,x.packet.lots[0].id);await requireCopy(ui);await working(ui);await ui.admin.getByRole('checkbox',{name:'Select lot 01',exact:true}).check();await ui.admin.getByRole('button',{name:'Review catalog',exact:true}).click();
   const arrived=deferred(),release=deferred(),attempts=[];let approval;
   await ui.page.route('**/api/admin/events/'+x.packet.event.id+'/catalog-approval',async route=>{if(route.request().method()!=='POST')return route.continue();attempts.push(route.request().postDataJSON());if(attempts.length>1)return route.continue();arrived.resolve();await release.promise;const response=await route.fetch();assert.equal(response.status(),201);approval=(await response.json()).approval;return route.abort('failed');});
   const observe=async label=>{assert.ok(await copyButton(ui).isDisabled(),label+' disables Duplicate');await dispatchCopy(ui);await taskFrameFlush(ui,label+' duplicate adversary');const actual=await waitActualBidder(ui),packet=await actual.frame.evaluate(()=>window.__workspacePackets.at(-1)?.payload);assert.equal(packet.mode,'working');assert.equal(packet.lots.length,x.packet.lots.length,label+' cannot add a copy');assert.deepEqual(await readPacket(f,x.actor,x.packet.event.id),x.packet);};
   try{await ui.admin.locator('[data-action="approve-catalog"]').click();await bounded(arrived.promise,'Actual held catalog approval');await observe('Pending approval');release.resolve();await expect(ui.admin.locator('#catalog-approval')).toHaveText('Approval not confirmed');await observe('Uncertain approval');await assertApprovalSQL(f,x.packet,[x.packet.lots[0].id],approval);
    await ui.page.keyboard.press('Escape');await taskFrameFlush(ui,'Close uncertain approval dialog');await ui.admin.locator('[data-action="retry-approval"]').click();await expect(ui.admin.locator('#catalog-approval')).toHaveText('Approved');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);await requireCopy(ui);assert.ok(await copyButton(ui).isEnabled(),'Confirmed approval outcome releases duplicate edit lock');await assertApprovalSQL(f,x.packet,[x.packet.lots[0].id],approval);
   }finally{release.resolve();}
  });
 }
};
