import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { configuration as staffConfiguration, compact } from '../staff-drafts/protocol.mjs';
import { HarnessError,ApplicationFailure,browserFailure,pgBin } from '../staff-drafts/harness.mjs';
import { flush } from './observe.mjs';
import { ownedBrowser,refreshOwned,verifyGone } from './cleanup.mjs';
export const must=(value,message)=>{if(!value)throw new HarnessError(message);};
export const product=(value,message,observation={})=>{if(!value){const error=new ApplicationFailure(message);error.observation=observation;throw error;}};
export const configuration={
  environment:staffConfiguration.environment,
  async initialize({repo,appUrl,db,env}) {
    for(const name of ['001_staging_staff.sql','002_staging_catalog.sql','003_staging_manual_bid.sql','009_demo_attendee_entry.sql']) {
      const r=spawnSync(join(pgBin,'psql'),['--dbname',appUrl,'-v','ON_ERROR_STOP=1','-f',join(repo,'migrations',name)],
        {env,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
      must(!r.error&&r.status===0,'Disposable accepted migration failed: '+name);
    }
    await db.query(await readFile(join(repo,'tests/acceptance/staff-drafts/seed.sql'),'utf8'));
  },
};
export async function sql(f,id) {
  const e=(await f.db.query('SELECT revision,draft FROM bz_events WHERE id=$1',[id])).rows[0];
  product(e,'Created test event is missing from SQL.',{eventId:id,eventPresent:!!e});
  return {revision:e.revision,event:e.draft,lots:(await f.db.query('SELECT data FROM bz_lots WHERE event_id=$1 ORDER BY position',[id])).rows.map(r=>r.data)};
}
export async function apiDraft(ui,id) {
  const response=await ui.context.request.get(ui.f.origin+'/api/admin/events/'+id);
  product(response.status()===200,'Confirmed draft API returned an unexpected status.',{status:response.status()});
  const body=await response.json();product(body.draft?.event.id===id,'Malformed confirmed draft packet.',{body});return body.draft;
}
export async function withUI(f,fn) {
  let browser,context,ui,browserOwned;
  try {
    browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1120}});
    await context.addInitScript(()=>{window.__studioPackets=[];addEventListener('message',e=>{
      if(e.origin===location.origin&&e.source===parent&&e.data?.type==='staff-draft-preview')window.__studioPackets.push(e.data);
    });});
    const page=await context.newPage();page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(20000);
    browserOwned=ownedBrowser();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(f.origin+'/admin',{waitUntil:'domcontentloaded'});
    const admin=page.frameLocator('iframe[title="BidZizi admin workspace"]');
    await admin.locator('#test-account').selectOption('staff-saturn');
    await admin.locator('[data-action="test-signin"]').click();
    await admin.locator('#events-title').waitFor();
    const currentFrame=()=>page.frames().find(fr=>fr.url().includes('/staging-admin/index.html'));
    must(currentFrame(),'Admin frame is absent.');
    // Full-page reloads replace the child Frame; resolve each observation afresh.
    const frame={evaluate:(...args)=>{const value=currentFrame();must(value,'Admin frame became unavailable.');return value.evaluate(...args);}};
    ui={f,page,context,admin,frame,errors,release:null,capture:label=>f.capture?.(ui,label)};
    await fn(ui);product(errors.length===0,'Browser runtime errors: '+errors.join(';'),{errors});
  } catch(error) {
    const classified=browserFailure(error,'required Studio fixture operation');
    if(ui&&classified instanceof ApplicationFailure){
      classified.observation={...classified.observation,reason:classified.message,errors:ui.errors,
        source:'Reached required inherited UI/API operation; not an absent-feature RED.'};
      await ui.capture('REACHED_PRODUCT_FAILURE').catch(()=>{});
    }
    throw classified;
  } finally {
    ui?.release?.();
    try{if(ui)await ui.page.unrouteAll({behavior:'wait'});if(browserOwned)browserOwned=refreshOwned(browserOwned);}
    finally{try{if(context)await context.close();}finally{if(browser)await browser.close();}}
    if(browserOwned){const cleanup=await verifyGone(browserOwned);f.browserCleanup=cleanup;}
  }
}
export async function createUI(ui,name='Studio independent synthetic event') {
  ui.enteredName=name;
  const {admin,frame}=ui;
  await admin.locator('[data-action="new-event"]').click();
  await admin.locator('#new-event-name').fill(name);
  const created=ui.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/admin/events');
  await admin.locator('[data-action="create-event"]').click();
  const response=await created;product(response.status()===201,'UI valid event creation did not return durable201.',{status:response.status()});
  const {draft}=await response.json();product(draft?.event.id&&draft.lots.length===0,'UI create did not return an empty saved event.',{draft});
  await admin.locator('#event-title').waitFor();await admin.locator('#catalog-approval').filter({hasText:/^Not approved$/}).waitFor();await flush(frame);return draft;
}
export async function saveUI(ui) {
  const response=ui.page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/admin\/events\/[^/]+$/.test(new URL(r.url()).pathname));
  await ui.admin.locator('#save-draft').click();
  const actual=await response;product(actual.status()===200,'UI valid draft save did not return durable200.',{status:actual.status()});
  const {draft}=await actual.json();product(draft?.event.id,'Malformed saved API packet.',{draft});
  await ui.admin.locator('#saved').filter({hasText:/^Saved$/}).waitFor();await flush(ui.frame);return draft;
}
export const titles=['Private synthetic cabin stay with a long readable title for the full catalog row, including arrival and departure details',
  'Private synthetic coffee workshop for an entire team with additional details that must remain readable in the catalog'];
export async function composeUI(ui) {
  const {admin,frame}=ui;
  const event={name:ui.enteredName,eyebrow:'Synthetic member auction',welcome:'Synthetic welcome saved through the staff interface.',
    venue:'Synthetic private venue',cover:'assets/lots/cabin.jpg',date:'2030-01-15',start:'18:00',end:'20:00',
    timezone:'America/Los_Angeles',increment:2500,sponsorsEnabled:false,sponsors:[]};
  for(const key of ['name','eyebrow','welcome','venue','date','start','end'])await admin.locator('[data-event="'+key+'"]').fill(event[key]);
  await admin.locator('[data-event="timezone"]').selectOption(event.timezone);
  await admin.locator('[data-event="increment"]').fill('25.00');
  await admin.locator('[data-event="sponsorsEnabled"]').uncheck();
  await admin.locator('[data-action="image"][data-target="event"]').click();
  await admin.locator('[data-action="choose-image"][data-image="'+event.cover+'"]').click();
  await admin.locator('[data-tab="lots"]').click();
  const lots=[];
  for(let i=0;i<2;i++) {
    await admin.locator('[data-action="add-lot"]').click();
    const id=new URL(ui.page.url()).searchParams.get('lot');product(!!id,'New item has no durable editor route identity.');
    const lot={id,title:titles[i],short:'Synthetic catalog summary.',description:'Synthetic item description entered by staff.',
      category:i?'Food & drink':'Getaways',image:'assets/lots/'+(i?'coffee':'cabin')+'.jpg',alt:'Staff-entered synthetic photograph '+(i+1),
      opening:i?23456:12345,includes:['First included synthetic detail','Second included synthetic detail'],fine:'Private synthetic item restrictions.',windowId:'main'};
    for(const key of ['title','short','description','category'])await admin.locator('[data-lot="'+key+'"]').fill(lot[key]);
    await admin.locator('[data-lot="opening"]').fill(i?'234.56':'123.45');
    await admin.locator('[data-action="image"][data-target="lot"]').click();
    await admin.locator('[data-action="choose-image"][data-image="'+lot.image+'"]').click();
    await admin.locator('#editor details summary').click();
    await admin.locator('[data-lot="alt"]').fill(lot.alt);await admin.locator('[data-lot="includes"]').fill(lot.includes.join('\n'));
    await admin.locator('[data-lot="fine"]').fill(lot.fine);lots.push(lot);
  }
  await admin.locator('#select-all').check();await admin.locator('[data-action="assign-window"]').click();
  await admin.locator('[data-action="apply-window"]').click();await flush(frame);
  ui.entered={event,lots};return structuredClone(ui.entered);
}
export async function previewUI(ui) {
  if(!await ui.admin.locator('#bidder-frame').isVisible())await ui.admin.locator('#preview-toggle').click();
  const preview=ui.page.frames().find(fr=>fr.url().includes('/staging-bidder-preview/index.html'));must(preview,'Actual A preview frame is absent.');
  await preview.waitForFunction(()=>window.__studioPackets?.length>0);return preview;
}
export const expected = packet => compact(packet);
export function expectedPreview(entered,id) {
  // Explicit accepted A normalization for this fixture's2030-01-15 Pacific date;
  // all entered item fields and unchanged event fields remain independently bound.
  return {event:{...entered.event,id,orgId:'10000000-0000-4000-8000-000000000001',date:'January 15',timezone:'PST'},
    lots:entered.lots.map(l=>structuredClone(l)),labels:{opens:'6:00 PM',closes:'8:00 PM',host:'Saturn Barter'}};
}
