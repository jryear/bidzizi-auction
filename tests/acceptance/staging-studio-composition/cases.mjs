import { randomUUID } from 'node:crypto';
import { ids, login } from '../staff-drafts/protocol.mjs';
import { withUI,createUI,composeUI,saveUI,sql,previewUI,closePreviewUI,must,product,expected,expectedPreview } from './fixture.mjs';
import * as observe from './observe.mjs';
import * as oracle from './oracles.mjs';

export async function presentation(f,record) {
  await withUI(f,async ui=>{
    const {admin,frame,page}=ui,created=await createUI(ui),empty=await observe.checklist(frame);
    await composeUI(ui);const saved=await saveUI(ui),complete=await observe.checklist(frame);
    const catalog=[];
    for(const width of [1440,1280]){await page.setViewportSize({width,height:width===1440?1120:800});await observe.flush(frame);
      catalog.push(await observe.composition(frame,Object.fromEntries(saved.lots.map(l=>[l.id,l.title]))));}
    await record('STUDIO_CATALOG_COMPOSITION',catalog,oracle.composition,ui);
    const phones=[];
    for(const width of [1440,1280,390]){
      await page.setViewportSize({width,height:width===1440?1120:width===1280?800:844});
      const preview=await previewUI(ui),routes=[];
      await admin.locator('[data-preview-mode="saved"]').click();
      for(const path of ['/','/lots','/lot/'+saved.lots[1].id]){
        const action=path.startsWith('/lot/')?'[data-action="preview-lot"]':'[data-action="preview-route"][data-path="'+path+'"]';
        await admin.locator(action).last().click();await preview.waitForFunction(path=>location.hash==='#'+path,path);routes.push(path);
      }
      await preview.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await observe.flush(preview);
      const info=await observe.phone(admin,preview),p=await observe.packet(preview);
      phones.push({...info,routes,lotId:saved.lots[1].id,mode:p.mode,
        scrolled:await preview.evaluate(()=>scrollY>0&&scrollY+innerHeight>=document.documentElement.scrollHeight-2)});
      await recordScreen(ui,'phone-'+width);
    }
    await record('STUDIO_NATIVE_A_PHONE',phones,oracle.phone,ui);
    await page.setViewportSize({width:1440,height:1120});
    await closePreviewUI(ui);
    await admin.locator('[data-lot="description"]').fill('');await observe.flush(frame);
    const working=await observe.checklist(frame);await saveUI(ui);
    await admin.locator('[data-tab="event"]').click();await observe.flush(frame);const incomplete=await observe.checklist(frame);
    // A missing new setup control is an observed finite mismatch, not a locator timeout.
    const action=admin.locator('[data-setup-step="items"] button:not([disabled]),[data-setup-step="items"] a[href]').first();
    incomplete.actionReached=false;
    if(await action.count()){await action.click();await observe.flush(frame);incomplete.actionReached=
      await admin.locator('[data-lot="title"]').count()===1&&await admin.locator('[data-lot="title"]').inputValue()===saved.lots[1].title&&
      await admin.locator('[data-lot="description"]').inputValue()===''&&await frame.evaluate(()=>document.activeElement?.matches('[data-lot="description"]'));}
    await admin.locator('[data-tab="lots"]').click();await admin.locator('[data-action="edit-lot"][data-id="'+saved.lots[1].id+'"]').click();
    await admin.locator('[data-lot="description"]').fill('Synthetic complete description restored.');const restored=await saveUI(ui);
    const approval=await ui.context.request.post(f.origin+'/api/admin/events/'+saved.event.id+'/catalog-approval',
      {headers:{origin:f.origin},data:{expectedRevision:restored.revision,requestId:randomUUID(),lotIds:restored.lots.map(l=>l.id)}});
    product(approval.status()===201,'Independent valid saved catalog approval fixture did not commit.',{status:approval.status()});
    let releaseApproval;const approvalBarrier=new Promise(done=>releaseApproval=done);ui.release=releaseApproval;
    await page.route('**/api/admin/events/'+saved.event.id+'/catalog-approval',async route=>{
      if(route.request().method()!=='GET')return route.continue();await approvalBarrier;
      await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Approval read not confirmed.'}})});
    });
    await page.reload({waitUntil:'domcontentloaded'});await admin.locator('#catalog-approval').filter({hasText:/Checking approval/}).waitFor();
    const pending=await observe.checklist(frame);releaseApproval();ui.release=null;
    await admin.locator('#catalog-approval').filter({hasText:/^Approval unavailable$/}).waitFor();await observe.flush(frame);
    const failed=await observe.checklist(frame);await page.unrouteAll({behavior:'wait'});
    await page.reload({waitUntil:'domcontentloaded'});await admin.locator('#catalog-approval').filter({hasText:/^Approved$/}).waitFor();
    await observe.flush(frame);const approved=await observe.checklist(frame);
    await record('STUDIO_SAVED_SETUP_TRUTH',[empty,complete,working,incomplete,pending,failed,approved],oracle.checklist,ui);
    const invalid=[];
    for(const selector of ['[data-lot="opening"]','[data-event="increment"]']){
      if(selector.includes('data-event'))await admin.locator('[data-tab="event"]').click();
      const field=admin.locator(selector);await field.fill('12.345');let puts=0;
      const count=r=>{if(r.method()==='PUT'&&new URL(r.url()).pathname==='/api/admin/events/'+saved.event.id)puts++;};page.on('request',count);
      await admin.locator('#save-draft').click();await observe.flush(frame);
      const error=await observe.invalid(frame,selector);error.puts=puts;
      await field.fill('25.00');await observe.flush(frame);const cleared=await observe.invalid(frame,selector);
      error.cleared=!cleared.invalid&&!cleared.error;invalid.push(error);page.off('request',count);
    }
    await record('STUDIO_AMOUNT_FIELD_ASSOCIATION',invalid,oracle.invalid,ui);
  });
}

export async function preservation(f,record) {
  await withUI(f,async ui=>{
    const {admin,frame,page}=ui,emptyHome=await admin.locator('.events-empty').count()===1;
    await admin.locator('[data-action="new-event"]').click();await admin.locator('[data-action="create-event"]').click();
    const create=await admin.locator('#new-event-name').evaluate(e=>({invalid:e.getAttribute('aria-invalid')==='true',
      linked:(e.getAttribute('aria-describedby')||'').split(/\s+/).includes('new-event-error'),focused:document.activeElement===e}));
    await admin.locator('#new-event-name').fill('Temporary valid name');const createCleared=await admin.locator('#new-event-name').getAttribute('aria-invalid')!=='true'&&
      await admin.locator('#new-event-error').innerText()==='';
    await admin.locator('#new-event-name').press('Escape');const escapeReturned=await frame.evaluate(()=>!document.querySelector('#modal').open&&document.activeElement?.dataset.action==='new-event');
    const created=await createUI(ui),entered=await composeUI(ui),saved=await saveUI(ui),stored=await sql(f,saved.event.id);
    await admin.locator('[data-lot-select="'+saved.lots[0].id+'"]').check();
    const before=await frame.evaluate(()=>[...document.querySelectorAll('[data-lot-select]')].map(e=>[e.dataset.lotSelect,e.checked]));
    await admin.locator('[data-action="edit-lot"][data-id="'+saved.lots[1].id+'"]').click();await observe.flush(frame);
    await record('STUDIO_SELECTED_ROW',{before,after:await frame.evaluate(()=>[...document.querySelectorAll('[data-lot-select]')].map(e=>[e.dataset.lotSelect,e.checked])),
      current:await frame.evaluate(()=>[...document.querySelectorAll('[data-action="edit-lot"][aria-current="true"]')].map(e=>e.dataset.id)),
      second:saved.lots[1].id,editor:await admin.locator('[data-lot="title"]').inputValue(),expected:saved.lots[1].title},oracle.selected,ui);
    await page.reload({waitUntil:'domcontentloaded'});await admin.locator('[data-lot="title"]').waitFor();
    const preview=await previewUI(ui);await observe.flush(preview);const p=await observe.packet(preview);
    await record('STUDIO_CREATE_SAVE_RELOAD',{id:saved.event.id,createdEmpty:created.lots.length===0,initialRevision:created.revision,saved,
      expected:entered,api:expected(saved),expectedPreview:expectedPreview(entered,saved.event.id),sql:stored,reloadTitle:await admin.locator('#event-title').innerText(),
      reloadValue:await admin.locator('[data-lot="title"]').inputValue(),preview:p},oracle.persistence,ui);
    const start=await sql(f,saved.event.id),edit='Private working edit only';
    await admin.locator('[data-lot="title"]').fill(edit);await admin.locator('[data-preview-mode="saved"]').click();await observe.flush(preview);
    const savedView=await observe.packet(preview);await admin.locator('[data-preview-mode="working"]').click();await observe.flush(preview);
    const workingView=await observe.packet(preview),label=await admin.locator('#preview-mode-label').innerText();
    await admin.locator('[data-action="add-lot"]').click();await admin.locator('[data-preview-mode="saved"]').click();await observe.flush(frame);
    const workingEntry=structuredClone(entered);workingEntry.lots[1].title=edit;
    await record('STUDIO_SAVED_WORKING_SEPARATION',{id:saved.event.id,revision:saved.revision,
      expectedSavedPreview:expectedPreview(entered,saved.event.id),expectedWorkingPreview:expectedPreview(workingEntry,saved.event.id),
      saved:savedView,working:workingView,label,edit,before:start,after:await sql(f,saved.event.id),
      newDisabled:await admin.locator('#editor [data-action="preview-lot"]').isDisabled(),help:await admin.locator('#lot-preview-help').innerText()},oracle.savedWorking,ui);
    // Explicitly reload original saved state before the native history/geometry challenge.
    await page.reload({waitUntil:'domcontentloaded'});await admin.locator('#event-title').waitFor();
    await admin.locator('[data-action="events-home"]').click();await admin.locator('#events-title').waitFor();
    await admin.locator('[data-action="switch-event"][data-id="'+saved.event.id+'"]').click();await admin.locator('#event-title').waitFor();
    await page.goBack();await admin.locator('#events-title').waitFor();const backHome=true;
    await page.goForward();await admin.locator('#event-title').waitFor();const forwardEvent=await admin.locator('#event-title').innerText()===saved.event.name;
    await admin.locator('[data-tab="lots"]').click();await page.setViewportSize({width:390,height:844});
    await closePreviewUI(ui);
    const narrow=[];for(const key of ['title','short','description','category','opening'])narrow.push(await observe.reachable(admin.locator('[data-lot="'+key+'"]')));
    await admin.locator('[data-tab="event"]').click();narrow.push(await observe.reachable(admin.locator('[data-event="increment"]')));
    await record('STUDIO_EMPTY_NAVIGATION_NARROW',{empty:emptyHome,createInvalid:create.invalid,createLinked:create.linked,createFocused:create.focused,
      createCleared,escapeReturned,backHome,forwardEvent,narrow,overflow:await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)},oracle.navigation,ui);
  });
}

export async function recovery(f,record) {
  await withUI(f,async ui=>{
    const {admin,frame,page}=ui;await createUI(ui);const entered=await composeUI(ui),saved=await saveUI(ui),id=saved.event.id;
    await closePreviewUI(ui);
    const path='**/api/admin/events/'+id,before=await sql(f,id);let heldRequest,posts=0,release;
    const barrier=new Promise(done=>release=done);ui.release=release;
    await page.route(path,async route=>{if(route.request().method()!=='PUT')return route.continue();posts++;heldRequest=route.request().postDataJSON();await barrier;await route.continue();});
    const heldExpected=structuredClone(entered),heldTitle='Private held Save title';heldExpected.lots[1].title=heldTitle;
    await admin.locator('[data-lot="title"]').fill(heldTitle);await admin.locator('#save-draft').click();
    await admin.locator('#saved').filter({hasText:/^Saving…$/}).waitFor();must(heldRequest,'Held request was not observed.');
    const locked=await frame.evaluate(()=>[...document.querySelectorAll('[data-lot],[data-event],[data-action="add-lot"],[data-action="duplicate-lot"],[data-action="image"]')].every(e=>e.disabled));
    const during=await sql(f,id),status=await admin.locator('#saved').innerText();
    await admin.locator('[data-action="events-home"]').click();await observe.flush(frame);
    const cancelledLeave=await admin.locator('#event-title').count()===1&&new URL(page.url()).searchParams.get('event')===id;
    release();ui.release=null;await admin.locator('#saved').filter({hasText:/^Saved$/}).waitFor();await page.unrouteAll({behavior:'wait'});
    const heldSQL=await sql(f,id),heldPreview=await previewUI(ui);await admin.locator('[data-preview-mode="saved"]').click();
    await heldPreview.waitForFunction(revision=>window.__studioPackets?.at(-1)?.payload?.revision===revision&&window.__studioPackets.at(-1).payload.mode==='saved',heldSQL.revision);
    await record('STUDIO_HELD_SAVE_LOCKS',{id,request:heldRequest,expected:heldExpected,changedTitle:heldTitle,locked,status,before,during,posts,cancelledLeave,after:heldSQL,
      preview:await observe.packet(heldPreview),expectedPreview:expectedPreview(heldExpected,id)},oracle.held,ui);
    const startRevision=(await sql(f,id)).revision,requests=[];let lostResponse;
    await page.route(path,async route=>{if(route.request().method()!=='PUT')return route.continue();requests.push(route.request().postDataJSON());
      if(requests.length===1){lostResponse=await route.fetch();product(lostResponse.status()===200,'Lost Save control requires actual committed200.',{status:lostResponse.status()});await route.abort();}
      else await route.continue();});
    const lostExpected=structuredClone(heldExpected),lostTitle='Private lost committed title';lostExpected.lots[1].title=lostTitle;
    await admin.locator('[data-lot="title"]').fill(lostTitle);await admin.locator('#save-draft').click();
    await admin.locator('#saved').filter({hasText:/not confirmed/i}).waitFor();
    const uncertain=await admin.locator('#saved').innerText(),lostLocked=await admin.locator('[data-lot="title"]').isDisabled(),committed=await sql(f,id);
    await admin.locator('#save-draft').click();await admin.locator('#saved').filter({hasText:/^Saved$/}).waitFor();
    await page.unrouteAll({behavior:'wait'});const retrySQL=await sql(f,id),preview=await previewUI(ui);await observe.flush(preview);
    const requestCount=(await f.db.query('SELECT count(*)::int n FROM bz_requests WHERE actor_id=$1 AND operation=$2 AND request_id=$3',
      [ids.staff,'save:'+id,requests[0].requestId])).rows[0].n;
    await admin.locator('[data-preview-mode="saved"]').click();
    await preview.waitForFunction(revision=>window.__studioPackets?.at(-1)?.payload?.revision===revision&&window.__studioPackets.at(-1).payload.mode==='saved',retrySQL.revision);
    await record('STUDIO_LOST_SAVE_EXACT_RETRY',{id,requests,expected:lostExpected,changedTitle:lostTitle,locked:lostLocked,uncertain,startRevision,sql:committed,retrySQL,requestCount,
      status:await admin.locator('#saved').innerText(),preview:await observe.packet(preview),expectedPreview:expectedPreview(lostExpected,id)},oracle.lost,ui);
    const consumed=await observe.packet(preview);
    await preview.evaluate(()=>postMessage({type:'staff-draft-preview',payload:{org:{id:'spoof',name:'spoof'},event:{id:'spoof',name:'SPOOF PRIVATE'},lots:[],mode:'working'}},location.origin));
    await observe.flush(preview);const spoofIgnored=JSON.stringify((await observe.packet(preview)).titles)===JSON.stringify(consumed.titles)&&
      (await observe.packet(preview)).eventId===consumed.eventId;
    const foreign=await login(f,'staff-pine'),denied=await f.request('/api/admin/events/'+id,{cookie:foreign.cookie});
    const preBlock=await sql(f,id);await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
    await admin.locator('[data-lot="title"]').fill('Blocked edit');await admin.locator('#save-draft').click();
    await admin.locator('#saved').filter({hasText:/blocked/i}).waitFor();
    const blocked=await admin.locator('#saved').innerText()==='Save blocked',blockedLocked=await admin.locator('[data-lot="title"]').isDisabled(),noWrite=JSON.stringify(preBlock)===JSON.stringify(await sql(f,id));
    await admin.locator('[data-action="signout"]').first().click();await admin.locator('#test-account').waitFor();
    await record('STUDIO_AUTH_PREVIEW_ISOLATION',{blocked,blockedLocked,noWrite,foreignDenied:[403,404].includes(denied.status),spoofIgnored,
      privateCleared:await admin.locator('#event-title,#bidder-frame,[data-lot]').count()===0},oracle.isolation,ui);
  });
}
// Capture labels are owned by the runner, outside source and shared staging.
async function recordScreen(ui,label){if(ui.capture)await ui.capture(label);}

export const groups=[
  {name:'Reviewed Studio catalog composition, native A phone and truthful saved setup',kind:'acceptance',timeout:300,run:presentation,
    assertions:['STUDIO_CATALOG_COMPOSITION','STUDIO_NATIVE_A_PHONE','STUDIO_SAVED_SETUP_TRUTH','STUDIO_AMOUNT_FIELD_ASSOCIATION']},
  {name:'Fresh staff creation, durable edits, selected row, preview separation and navigation',kind:'regression',timeout:300,run:preservation,
    assertions:['STUDIO_SELECTED_ROW','STUDIO_CREATE_SAVE_RELOAD','STUDIO_SAVED_WORKING_SEPARATION','STUDIO_EMPTY_NAVIGATION_NARROW']},
  {name:'Held and lost Save, exact durable retry and authority isolation',kind:'adversarial',timeout:300,run:recovery,
    assertions:['STUDIO_HELD_SAVE_LOCKS','STUDIO_LOST_SAVE_EXACT_RETRY','STUDIO_AUTH_PREVIEW_ISOLATION']},
];
