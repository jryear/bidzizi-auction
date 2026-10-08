import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {configuration as inherited,must,product} from '../staging-studio-composition/fixture.mjs';
import {flush,checklist} from '../staging-studio-composition/observe.mjs';
import {HarnessError,pgBin} from '../staff-drafts/harness.mjs';
import {ids} from '../staff-drafts/protocol.mjs';

export const configuration={...inherited,async initialize(context){
  await inherited.initialize(context);
  const path=join(context.repo,'migrations/015_staff_event_entry.sql');
  try{await readFile(path);}catch(error){if(error.code==='ENOENT')return;throw new HarnessError('Entry successor migration cannot be read.');}
  const r=spawnSync(join(pgBin,'psql'),['--dbname',context.appUrl,'-v','ON_ERROR_STOP=1','-f',path],
    {env:context.env,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
  must(!r.error&&r.status===0,'Disposable entry successor migration failed.');
}};
const path=id=>'/api/admin/events/'+id+'/entry';
async function api(ui,id){
  const before=+(await ui.f.db.query('SELECT clock_timestamp() t')).rows[0].t;
  const r=await ui.context.request.get(ui.f.origin+path(id));
  product(![500,503].includes(r.status()),'Current entry API is not ready.',{status:r.status()});
  const after=+(await ui.f.db.query('SELECT clock_timestamp() t')).rows[0].t;
  let data;try{data=await r.json();}catch{data=null;}
  return {status:r.status(),data,cacheControl:r.headers()['cache-control']||'',
    hasSetCookie:!!r.headers()['set-cookie'],clock:{before,after}};
}
async function sql(ui,id,ledger=false){
  const entry=(await ui.f.db.query('SELECT to_jsonb(e) data FROM bz_demo_event_entries e WHERE event_id=$1',[id])).rows.map(r=>r.data);
  return {entry,ledger:ledger?(await ui.f.db.query('SELECT * FROM bz_staff_event_entry_requests WHERE event_id=$1 ORDER BY actor_id,request_id',[id])).rows:[]};
}
async function dom(ui){
  const {admin}=ui,panel=admin.locator('[data-event-entry]');
  const buttons={};
  for(const [key,name] of Object.entries({enable:'Enable event entry',disable:'Disable event entry',check:'Check entry update',copy:'Copy event link'})){
    const button=panel.getByRole('button',{name,exact:true}),count=await button.count();
    const states=await Promise.all((await button.all()).map(async item=>!await item.isDisabled()));
    buttons[key]={count,enabled:states.some(Boolean),states};
  }
  const link=panel.getByLabel('Event link',{exact:true}),count=await link.count();
  return {checklist:await checklist(ui.frame),panelCount:await panel.count(),
    panelState:await panel.count()===1?await panel.getAttribute('data-entry-state'):null,
    buttons,link:{count,value:count===1?await link.inputValue():null}};
}
async function state(ui,id,ledger=false){return {api:await api(ui,id),sql:await sql(ui,id,ledger),dom:await dom(ui)};}
async function hit(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new HarnessError('Entry request interception did not reach its declared seam.')),8000))]);}finally{clearTimeout(timer);}}

// Called inside the original presentation case after its seven raw checklist
// captures. No old row is replaced, normalized or passed to a fabricated oracle.
export async function entryObservations(ui){
  const {admin,frame,page,f}=ui,id=new URL(page.url()).searchParams.get('event'),route=await frame.evaluate(()=>location.hash);
  product(!!id,'Studio successor has no current staff-created event identity.');
  const initialAPI=await api(ui,id),initialSQL=await sql(ui,id);
  const result={id,origin:f.origin,actorId:ids.staff,organizationId:ids.saturn,
    initial:{api:initialAPI,sql:initialSQL},requests:[]};
  // An independently reached missing new route is a finite availability failure.
  // Keep the real unavailable access rows on d631 and continue old amount checks.
  if(initialAPI.status===404&&initialAPI.data===null)return result;
  let revoked=false,release;
  try{
    await admin.locator('[data-tab="event"]').click();await flush(frame);
    // A present new panel may still be awaiting its ordinary initial GET.
    // Observe its declared confirmed state before judging native availability.
    if(await admin.locator('[data-event-entry]').count()===1){
      await admin.locator('[data-event-entry][data-entry-state="disabled"]').waitFor();await flush(frame);
    }
    result.initial.dom=await dom(ui);
    if(result.initial.dom.panelCount!==1||!result.initial.dom.buttons.enable.enabled)return result;
    let reached;const held=new Promise(done=>reached=done),gate=new Promise(done=>release=done);ui.release=release;
    await page.route('**'+path(id),async intercepted=>{
      if(intercepted.request().method()!=='POST')return intercepted.continue();
      result.requests.push(intercepted.request().postDataJSON());
      if(result.requests.length===1){reached();await gate;const committed=await intercepted.fetch();
        result.lostResponseStatus=committed.status();await intercepted.abort();}
      else await intercepted.continue();
    });
    const panel=admin.locator('[data-event-entry]');
    await panel.getByRole('button',{name:'Enable event entry',exact:true}).click();await hit(held);
    await admin.locator('[data-event-entry][data-entry-state="saving"]').waitFor();await flush(frame);
    result.saving=await state(ui,id);release();ui.release=null;
    await admin.locator('[data-event-entry][data-entry-state="uncertain"]').waitFor();await flush(frame);
    result.uncertain=await state(ui,id,true);
    await panel.getByRole('button',{name:'Check entry update',exact:true}).click();
    await admin.locator('[data-event-entry][data-entry-state="enabled"]').waitFor();await flush(frame);
    result.enabled=await state(ui,id,true);await page.unrouteAll({behavior:'wait'});
    await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);revoked=true;
    const denied=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path(id));
    await panel.getByRole('button',{name:'Disable event entry',exact:true}).click();
    const response=await denied;result.deniedMutationStatus=response.status();
    await admin.locator('[data-setup-step="access"]').filter({hasText:/denied|forbidden|expired|blocked|not permitted|not authorized|unavailable|could not|not confirmed/i}).waitFor();
    await flush(frame);
    result.denied=await state(ui,id,true);
    return result;
  }finally{
    release?.();ui.release=null;await page.unrouteAll({behavior:'wait'});
    if(revoked)await f.db.query('UPDATE bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
    // Restore the original case's actual editor context so its amount challenge
    // executes unchanged; this does not alter its native Back/Forward evidence.
    await page.reload({waitUntil:'domcontentloaded'});
    await admin.locator('#catalog-approval').filter({hasText:/^Approved$/}).waitFor();
    if(route.startsWith('#/lots')){await admin.locator('[data-tab="lots"]').click();const lot=route.split('/')[2];
      if(lot)await admin.locator('[data-action="edit-lot"][data-id="'+lot+'"]').click();}
    else await admin.locator('[data-tab="event"]').click();
    await flush(frame);
  }
}
