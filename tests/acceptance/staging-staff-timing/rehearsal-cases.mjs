// Unfrozen rehearsal successor: one shared window, exact tier rules, no groups.
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect as pwExpect} from '@playwright/test';
import pg from 'pg';
import * as h from './fixture.mjs';
import {expect,same,sealed} from './oracles.mjs';
import {HarnessError} from '../staff-drafts/harness.mjs';
const rule='saturn-trade-tiered-v1';
const denomination='SATURN_TRADE_DOLLAR_SYNTHETIC_V1';
const tiers=[{belowMinor:50000,raiseMinor:2500},{belowMinor:100000,raiseMinor:5000},{belowMinor:250000,raiseMinor:10000},{belowMinor:null,raiseMinor:25000}];
const done=(steps,observations)=>({completed:true,steps:steps.map(name=>({name,pass:true})),observations});
const utc=n=>new Date(n).toISOString();
function endpoints(start,end){return {startDate:start.slice(0,10),start:start.slice(11,16),endDate:end.slice(0,10),end:end.slice(11,16),timezone:'UTC'};}
function event(name,timing){return {name,eyebrow:'Synthetic Saturn rehearsal',welcome:'Private synthetic trade-dollar auction.',venue:'Synthetic venue',cover:null,timing,rules:{rulesetId:rule,denomination,scale:100,amountCapMinor:1000000000,tiers},sponsorsEnabled:false,sponsors:[]};}
function lot(name,opening,fixedRaiseMinor=null){return {id:randomUUID(),title:name,short:'Synthetic '+name,description:'A complete synthetic item for '+name,category:'Trade',image:null,alt:'',opening,includes:['Synthetic inclusion'],fine:'No payment or settlement.',fixedRaiseMinor};}
async function setup(f,name,openOffsetMinutes=3,durationMinutes=2,lots=[lot('first item',2500)]){
 const staff=await h.readiness(f),created=await h.create(f,staff,name),now=await h.dbNow(f);
 const start=Math.ceil(now.getTime()/60000)*60000+openOffsetMinutes*60000;
 const opensAt=utc(start),closesAt=utc(start+durationMinutes*60000),draft={event:event(name,endpoints(opensAt,closesAt)),lots};
 const saved=await h.save(f,staff,created.event.id,created.revision,draft);
 same(saved.packet.event.timing,draft.event.timing,'Saved local endpoints differ.');
 const sql=await h.sqlEvent(f,created.event.id);
 expect(sql.event.revision===saved.packet.revision,'Saved revision is not durable.',{sql,saved});
 const before=await h.dbNow(f);
 if(before.getTime()>=start-30000)throw new HarnessError('Fixture scheduling margin expired before publication; no behavioral result.');
 const approval=await h.approve(f,staff,created.event.id,saved.packet.revision,lots.map(x=>x.id));
 return {staff,created,saved,approval,draft,lots,opensAt,closesAt};
}
async function catalog(f,person,eventId){return h.api(f,person,'/api/v2/catalog/events/'+eventId);}
async function standing(f,person,eventId,lotId){return h.api(f,person,h.bidderPath(eventId,lotId,'standing'));}
async function bid(f,person,eventId,lotId,businessId,amountMinor,requestId=randomUUID()){
 const intent={requestId,businessId,amountMinor,rulesetId:rule};
 return {intent,response:await h.api(f,person,h.bidderPath(eventId,lotId,'bids'),'POST',intent)};
}
async function native(f){
 const steps=[],staff=await h.readiness(f),observations={};await h.create(f,staff,'Native v2 capability probe');
 await h.withUI(f,async ui=>{
  await ui.admin.locator('[data-action="new-event"]').click();
  await ui.admin.locator('#new-event-name').fill('Native one-window rehearsal');
  const pending=ui.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v2/admin/events');
  await ui.admin.locator('[data-action="create-event"]').click();
  const reply=await h.nativeResponse(await pending),created=reply.data.draft;
  expect(reply.status===201&&created?.version===2&&created.lots.length===0,'Native new event is not empty version-2 preparation.',reply);
  steps.push('Native staff created a fresh private version-2 event');
  const known=event('Native one-window rehearsal',{startDate:'2030-01-15',start:'18:00',endDate:'2030-01-17',end:'20:00',timezone:'America/Los_Angeles'});
  for(const key of ['startDate','start','endDate','end'])await ui.admin.locator('[data-event="timing.'+key+'"]').fill(known.timing[key]);
  await ui.admin.locator('[data-event="timing.timezone"]').selectOption(known.timing.timezone);
  const ruleText=await ui.admin.locator('[data-bid-policy]').innerText();
  for(const amount of ['$25','$50','$100','$250','$500','$1,000','$2,500'])expect(ruleText.includes(amount),'Staff cannot review the approved tier '+amount,{ruleText});
  await ui.admin.locator('[data-tab="lots"]').click();await ui.admin.locator('[data-action="add-lot"]').click();
  await ui.admin.locator('[data-lot="title"]').fill('Native synthetic item');
  await ui.admin.locator('[data-lot="description"]').fill('Synthetic item with one shared event window.');
  await ui.admin.locator('[data-lot="category"]').fill('Trade');
  await ui.admin.locator('[data-lot="opening"]').fill('25.00');
  const saving=ui.page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/v2/admin/events/'+created.event.id);
  await ui.admin.locator('#save-draft').click();const saved=await h.nativeResponse(await saving);
  expect(saved.status===200&&saved.data.draft?.version===2,'Native Save was not durable.',saved);
  await ui.page.reload({waitUntil:'domcontentloaded'});await ui.admin.locator('[data-preview-mode="saved"]').click();
  const preview=ui.admin.frameLocator('#bidder-frame'),text=await preview.locator('body').innerText();
  expect(text.includes('Native synthetic item')&&text.includes('America/Los_Angeles')&&text.includes('2030'),'Saved phone preview omits confirmed item or explicit timing.',{text});
  await ui.capture('REHEARSAL_NATIVE_SAVED_PHONE');
  observations.native={eventId:created.event.id,savedRevision:saved.data.draft.revision,policyText:ruleText,previewText:text};
  steps.push('Native explicit dates, timezone, rules and one item saved and appeared in the phone preview');
 });return done(steps,observations);
}
async function phasesAndBids(f){
 const steps=[],lots=[lot('one minor below five hundred',49999),lot('at five hundred',50000),lot('one minor below one thousand',99999),lot('at one thousand',100000),lot('one minor below twenty five hundred',249999),lot('at twenty five hundred',250000),lot('fixed override',20000,7500)];
 const p=await setup(f,'Known tier and phase rehearsal',3,6,lots),id=p.created.event.id;
 await h.authorize(f,id);const a=await h.login(f,'bidder-juniper'),b=await h.login(f,'bidder-harbor');
 const pre=await catalog(f,a,id);expect(pre.status===200&&pre.data.phase==='scheduled','Admitted pre-open catalog is unavailable.',pre);
 same(pre.data.catalog?.lots.map(x=>x.id),lots.map(x=>x.id),'Pre-open selected roster differs from saved selection.');
 const denied=await catalog(f,null,id);expect(denied.status===401,'Anonymous pre-open browse leaked.',denied);
 const early=await bid(f,a,id,lots[0].id,h.ids.businessA,49999);expect(early.response.status===409&&early.response.data.receipt.reason==='NOT_OPEN','Scheduled bid was accepted.',early);
 steps.push('Current private VIEW sees the selected published roster before opening and scheduled bids reject');
 await h.waitDb(f,p.opensAt,300000);
 const expectedRaise=[2500,5000,5000,10000,10000,25000,7500],receipts=[];
 for(let i=0;i<lots.length;i++){
  const first=await bid(f,a,id,lots[i].id,h.ids.businessA,lots[i].opening);
  expect(first.response.status===201&&first.response.data.receipt.amountMinor===lots[i].opening,'First bid did not accept exact opening.',first);
  const next=await standing(f,b,id,lots[i].id);expect(next.status===200&&next.data.standing.minimumAmountMinor===lots[i].opening+expectedRaise[i],'Tier/override minimum was not selected from current highest.',{next,lot:lots[i]});
  const previouslyEnteredSufficient={requestId:randomUUID(),businessId:h.ids.businessA,amountMinor:lots[i].opening+7*expectedRaise[i]+3,rulesetId:rule};
  const stale=await bid(f,b,id,lots[i].id,h.ids.businessB,lots[i].opening+expectedRaise[i]-1);
  expect(stale.response.status===409&&stale.response.data.receipt.reason==='BELOW_MINIMUM'&&stale.response.data.receipt.amountMinor===stale.intent.amountMinor,'Stale submitted amount was upgraded or accepted.',stale);
  const excess=await bid(f,b,id,lots[i].id,h.ids.businessB,lots[i].opening+3*expectedRaise[i]+1);
  expect(excess.response.status===201&&excess.response.data.receipt.amountMinor===excess.intent.amountMinor,'Non-multiple eligible amount rejected.',excess);
  if(i===0){const sufficient=await h.api(f,a,h.bidderPath(id,lots[i].id,'bids'),'POST',previouslyEnteredSufficient);
   expect(sufficient.status===201&&sufficient.data.receipt.amountMinor===previouslyEnteredSufficient.amountMinor,'Previously entered but still sufficient amount was incorrectly rejected or upgraded.',sufficient);
   receipts.push({first:first.response.data.receipt,excess:excess.response.data.receipt,stale:stale.response.data.receipt,sufficient:sufficient.data.receipt});}
  else receipts.push({first:first.response.data.receipt,excess:excess.response.data.receipt,stale:stale.response.data.receipt});
 }
 steps.push('All first bids, exact 49,999/50,000, 99,999/100,000 and 249,999/250,000 boundaries, fixed override, insufficient and still sufficient stale amounts, and tier-skipping bids observed durably');
 const beforeClose=await h.snapshot(f);await h.waitDb(f,p.closesAt,300000);
 const late=await bid(f,a,id,lots[0].id,h.ids.businessA,99900);
 expect(late.response.status===409&&late.response.data.receipt.reason==='CLOSED','A late bid was accepted.',late);
 const closed=await standing(f,a,id,lots[0].id);expect(closed.status===200&&closed.data.standing.phase==='closed','Closed standing is not readable.',closed);
 const replay=await h.api(f,a,h.bidderPath(id,lots[0].id,'bids'),'POST',{requestId:receipts[0].first.requestId,businessId:h.ids.businessA,amountMinor:49999,rulesetId:rule});
 same(replay.data.receipt,receipts[0].first,'Accepted receipt changed after close.');
 const afterClose=await h.snapshot(f);expect(afterClose.bz_manual_bids.length===beforeClose.bz_manual_bids.length,'Late bid added an accepted SQL row.');
 steps.push('DB close rejects new bid, retains standing and recovers original accepted receipt');
 return done(steps,{publication:p.approval.approval.id,roster:lots.map(x=>x.id),pre,early,receipts,late,closed,replay});
}
async function validation(f){
 const steps=[],staff=await h.readiness(f),created=await h.create(f,staff,'Pacific timing validation'),id=created.event.id;
 const known=event('Pacific timing validation',{startDate:'2030-01-15',start:'18:00',endDate:'2030-01-17',end:'20:00',timezone:'America/Los_Angeles'}),items=[lot('Pacific synthetic lot',2500)];
 const saved=await h.save(f,staff,id,created.revision,{event:known,lots:items});
 const bad=[
  {startDate:'2027-03-14',start:'02:30',endDate:'2027-03-14',end:'04:00',timezone:'America/Los_Angeles'},
  {startDate:'2027-11-07',start:'01:30',endDate:'2027-11-07',end:'03:00',timezone:'America/Los_Angeles'},
  {startDate:'2030-01-17',start:'20:00',endDate:'2030-01-15',end:'18:00',timezone:'America/Los_Angeles'},
 ];
 for(const timing of bad){const before=await h.snapshot(f),reply=await h.api(f,staff,'/api/v2/admin/events/'+id,'PUT',{expectedRevision:saved.packet.revision,requestId:randomUUID(),draft:{event:{...known,timing},lots:items}});expect(reply.status===400,'DST gap/fold or reversed dates accepted.',reply);same(await h.snapshot(f),before,'Invalid local input mutated SQL.');}
 steps.push('Nonexistent, ambiguous and reversed cross-date local times reject atomically');
 const beforeRetry=await h.snapshot(f),retry=await h.api(f,staff,'/api/v2/admin/events/'+id,'PUT',saved.body);same(retry.data,saved.response.data,'Exact Save response changed.');same(await h.snapshot(f),beforeRetry,'Exact Save replay changed SQL.');
 const changed=await h.api(f,staff,'/api/v2/admin/events/'+id,'PUT',{...saved.body,draft:{event:{...known,name:'changed'},lots:items}});expect(changed.status===409&&changed.data.error.code==='IDEMPOTENCY_CONFLICT','Changed same-key Save did not conflict.',changed);
 const approval=await h.approve(f,staff,id,saved.packet.revision,items.map(x=>x.id));
 same(approval.approval.opensAt,'2030-01-16T02:00:00.000Z','Pacific start inverse differs.');same(approval.approval.closesAt,'2030-01-18T04:00:00.000Z','Pacific end inverse differs.');
 steps.push('Exact Save/approval recovery and independent Pacific cross-date UTC instants');
 return done(steps,{bad,retry,changed,approval:approval.approval});
}
async function held(f){
 const steps=[],staff=await h.readiness(f),created=await h.create(f,staff,'Held current authority'),id=created.event.id;
 const draft={event:event('Held current authority',{startDate:'2030-01-15',start:'18:00',endDate:'2030-01-17',end:'20:00',timezone:'America/Los_Angeles'}),lots:[lot('held item',2500)]};
 const saved=await h.save(f,staff,id,created.revision,draft),body={expectedRevision:saved.packet.revision,requestId:randomUUID(),draft:{...draft,event:{...draft.event,name:'held edit'}}};
 const saveWait=await h.lockedExpiry(f,staff,id,()=>h.api(f,staff,'/api/v2/admin/events/'+id,'PUT',body));
 const fresh=await h.login(f),approvalBody={expectedRevision:saved.packet.revision,requestId:randomUUID(),lotIds:draft.lots.map(x=>x.id)};
 const publishWait=await h.lockedExpiry(f,fresh,id,()=>h.api(f,fresh,'/api/v2/admin/events/'+id+'/catalog-approval','POST',approvalBody));
 steps.push('Held Save and initial publication recheck expired staff authority after event-lock wait');
 return done(steps,{saveWait,publishWait});
}
async function legacy(f){
 const steps=[],staff=await h.readiness(f),created=await h.create(f,staff,'Historical USD compatibility',1),id=created.event.id;
 const now=await h.dbNow(f),start=Math.ceil(now.getTime()/60000)*60000+120000,end=start+120000;
 const shift=new Date(end).getUTCDate()!==new Date(start).getUTCDate()?12*3600000:0;
 const startLocal=new Date(start-shift),endLocal=new Date(end-shift),timezone=shift?'Etc/GMT+12':'UTC';
 const fields={name:'Historical USD compatibility',eyebrow:'Synthetic legacy fixture',welcome:'Historical receipt stays USD.',venue:'Synthetic venue',cover:null,date:startLocal.toISOString().slice(0,10),start:startLocal.toISOString().slice(11,16),end:endLocal.toISOString().slice(11,16),timezone,increment:2500,sponsorsEnabled:false,sponsors:[]};
 const item={...h.lot(1),windowId:'main',opening:2500};
 const saved=await h.api(f,staff,'/api/admin/events/'+id,'PUT',{expectedRevision:created.revision,requestId:randomUUID(),draft:{event:fields,lots:[item]}});
 expect(saved.status===200,'Legacy v1 Save changed.',saved);
 const approval=await h.api(f,staff,'/api/admin/events/'+id+'/catalog-approval','POST',{expectedRevision:saved.data.draft.revision,requestId:randomUUID(),lotIds:[item.id]});
 expect(approval.status===201,'Legacy pre-opening approval changed.',approval);
 await h.authorize(f,id);await h.waitDb(f,utc(start),240000);
 const bidder=await h.login(f,'bidder-juniper'),intent={requestId:randomUUID(),businessId:h.ids.businessA,amountMinor:2500,rulesetId:'staging-usd-manual-v1'},route='/api/bidder/events/'+id+'/lots/'+item.id;
 const first=await h.api(f,bidder,route+'/bids','POST',intent);
 expect(first.status===201&&first.data.receipt.currency==='USD'&&first.data.receipt.rulesetId==='staging-usd-manual-v1','Legacy accepted receipt was reinterpreted as trade dollars.',first);
 const before=await h.snapshot(f),replay=await h.api(f,bidder,route+'/bids','POST',intent);
 same(replay.data.receipt,first.data.receipt,'Historical USD receipt changed on retry.');same(await h.snapshot(f),before,'Historical receipt retry mutated SQL.');
 const lookup=await h.api(f,bidder,route+'/bid-receipts/'+intent.requestId);
 same(lookup.data.receipt,first.data.receipt,'Historical USD owned lookup changed.');
 steps.push('Pre-opening v1 publication, accepted USD bid and immutable historical receipt remain exact');
 return done(steps,{approval:approval.data.approval,first:first.data.receipt,replay:replay.data.receipt,lookup:lookup.data.receipt});
}
async function concurrencyAndCap(f){
 const steps=[],lots=[lot('near inclusive cap',999999000),lot('concurrent lot',2500),lot('no bid lot',2500)],p=await setup(f,'Concurrent cutoff and cap',2,3,lots),id=p.created.event.id;
 await h.authorize(f,id);const a=await h.login(f,'bidder-juniper'),b=await h.login(f,'bidder-harbor');
 await h.waitDb(f,p.opensAt,240000);
 const high=await bid(f,a,id,lots[0].id,h.ids.businessA,999999000);
 expect(high.response.status===201,'First near-cap amount was rejected.',high);
 const cap=await standing(f,b,id,lots[0].id);
 expect(cap.status===200&&cap.data.standing.minimumAmountMinor===null&&cap.data.standing.canBid===false,'Minimum beyond cap was displayed as eligible.',cap);
 const noRoom=await bid(f,b,id,lots[0].id,h.ids.businessB,1000000000);
 expect(noRoom.response.status===409&&noRoom.response.data.receipt.reason==='AMOUNT_LIMIT','An amount below beyond-cap minimum was accepted.',noRoom);
 const aboveCap=await bid(f,b,id,lots[0].id,h.ids.businessB,1000000001);
 expect(aboveCap.response.status===400,'Cap plus one minor unit was accepted.',aboveCap);
 steps.push('Inclusive cap and no valid next raise are reflected in server standing');
 const racing=await Promise.all([bid(f,a,id,lots[1].id,h.ids.businessA,2500),bid(f,b,id,lots[1].id,h.ids.businessB,2500)]);
 same(racing.map(x=>x.response.status).sort(),[201,409],'Concurrent first bids did not serialize to one acceptance and one stale rejection.');
 const accepted=racing.find(x=>x.response.status===201),rejected=racing.find(x=>x.response.status===409);
 expect(rejected.response.data.receipt.reason==='BELOW_MINIMUM'&&rejected.response.data.receipt.amountMinor===2500,'Concurrent stale amount changed or was accepted.',racing);
 const sql=(await f.db.query('SELECT amount_minor::text FROM bz_manual_bids WHERE release_id=$1 AND lot_id=$2',[p.approval.approval.id,lots[1].id])).rows;
 same(sql,[{amount_minor:'2500'}],'Concurrent lot produced multiple accepted SQL bids.');
 steps.push('Two concurrent private first bids serialize to one durable acceptance and unchanged stale intent');
 const blocker=new pg.Client({connectionString:f.appUrl});await blocker.connect();let pending,released=false;
 try {
  await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2 FOR UPDATE',[p.approval.approval.id,lots[1].id]);
  const other=accepted.intent.businessId===h.ids.businessA?b:a,otherBusiness=accepted.intent.businessId===h.ids.businessA?h.ids.businessB:h.ids.businessA;
  pending=bid(f,other,id,lots[1].id,otherBusiness,5000);
  const deadline=Date.now()+10000;let blocked=false;
  while(Date.now()<deadline){const rows=(await f.db.query("SELECT query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows;blocked=rows.some(row=>row.blockers?.length&&/bz_lot_standing/i.test(row.query));if(blocked)break;await new Promise(resolve=>setTimeout(resolve,50));}
  if(!blocked)throw new HarnessError('Actual lot-lock wait was not observed; no cutoff assertion.');
  await h.waitDb(f,p.closesAt,360000);await blocker.query('COMMIT');released=true;
  const late=await pending;expect(late.response.status===409&&late.response.data.receipt.reason==='CLOSED'&&late.response.data.receipt.amountMinor===5000,'Held bid crossed close but committed accepted or changed amount.',late);
  const closedNoBid=await standing(f,a,id,lots[2].id);
  expect(closedNoBid.status===200&&closedNoBid.data.standing.phase==='closed'&&closedNoBid.data.standing.currentAmountMinor===null&&closedNoBid.data.standing.acceptedBidCount===0,'Closed no-bid lot lacks truthful readable standing.',closedNoBid);
  steps.push('Observed lot-lock wait crosses DB close, rejects exact late amount and leaves no-bid standing readable');
  return done(steps,{cap,noRoom,racing,acceptedSQL:sql,late:late.response.data.receipt,closedNoBid:closedNoBid.data.standing});
 } finally {if(!released)await blocker.query('ROLLBACK').catch(()=>{});await blocker.end();if(pending)await pending.catch(()=>{});}
}
async function nativeJourney(f){
 const steps=[],observations={},staff=await h.readiness(f);await h.create(f,staff,'Native journey v2 capability probe');
 await h.withUI(f,async ui=>{
  await ui.admin.locator('[data-action="new-event"]').click();await ui.admin.locator('#new-event-name').fill('Complete synthetic rehearsal');
  const createdPending=ui.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v2/admin/events');
  await ui.admin.locator('[data-action="create-event"]').click();const created=await h.nativeResponse(await createdPending);
  expect(created.status===201&&created.data.draft?.version===2,'Native event creation did not persist new versioned preparation.',created);
  const id=created.data.draft.event.id,now=await h.dbNow(f),start=Math.ceil(now.getTime()/60000)*60000+5*60000,end=start+3*60000;
  const timing=endpoints(utc(start),utc(end));
  await ui.admin.locator('[data-tab="event"]').click();
  expect(await ui.admin.locator('[data-event="timing.timezone"]').inputValue()==='America/Los_Angeles','New event did not default to Pacific IANA timezone.');
  for(const key of ['startDate','start','endDate','end'])await ui.admin.locator('[data-event="timing.'+key+'"]').fill(timing[key]);
  await ui.admin.locator('[data-event="timing.timezone"]').selectOption('UTC');
  await ui.admin.locator('[data-event="welcome"]').fill('Synthetic private two-attendee auction.');
  await ui.admin.locator('[data-tab="lots"]').click();
  const itemIds=[];
  for(const [name,file] of [['Marigold synthetic item','item.webp'],['Red synthetic no-bid item','cover-exif.jpg']]){
   await ui.admin.locator('[data-action="add-lot"]').click();
   const current=new URL(ui.page.url()).searchParams.get('lot');
   expect(!!current,'New item has no stable saved identity.');itemIds.push(current);
   await ui.admin.locator('[data-lot="title"]').fill(name);await ui.admin.locator('[data-lot="description"]').fill('Synthetic photographed item for local rehearsal.');
   await ui.admin.locator('[data-lot="category"]').fill('Trade');await ui.admin.locator('[data-lot="opening"]').fill('25.00');
   const uploaded=ui.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/admin/events/'+id+'/assets');
   await ui.admin.getByLabel('Upload item photo',{exact:true}).setInputFiles(join(f.repo,'tests/acceptance/staging-staff-assets/fixtures',file));
   const asset=await uploaded;expect(asset.status()===201,'Native item upload failed.',{status:asset.status(),name});
   if(!await ui.admin.locator('[data-lot="alt"]').isVisible())await ui.admin.locator('#editor details summary').click();
   await ui.admin.locator('[data-lot="alt"]').fill('Synthetic '+name+' photograph');
  }
  const savePending=ui.page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/v2/admin/events/'+id);
  await ui.admin.locator('#save-draft').click();const saved=await h.nativeResponse(await savePending);
  expect(saved.status===200&&saved.data.draft.lots.length===2&&saved.data.draft.lots.every(l=>l.image?.startsWith('asset:')),'Saved native roster lacks both durable photos.',saved);
  await ui.page.reload({waitUntil:'domcontentloaded'});await ui.admin.locator('[data-preview-mode="saved"]').click();
  await ui.admin.locator('[data-action="preview-route"][data-path="/lots"]').click();
  const preview=ui.admin.frameLocator('#bidder-frame');await pwExpect(preview.getByText('Marigold synthetic item')).toBeVisible();
  await ui.capture('REHEARSAL_STAFF_SAVED_PHONE');steps.push('Staff created, uploaded both photos, saved and inspected native phone preview');
  await ui.admin.locator('[data-tab="lots"]').click();await ui.admin.locator('#select-all').check();await ui.admin.locator('#review-catalog').click();
  const publishPending=ui.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v2/admin/events/'+id+'/catalog-approval');
  await ui.admin.locator('[data-action="approve-catalog"]').click();const published=await h.nativeResponse(await publishPending);
  expect(published.status===201&&published.data.approval.snapshot.lots.length===2,'Native publication did not freeze the selected saved roster.',published);
  if((await h.dbNow(f)).getTime()>=start)throw new HarnessError('Native rehearsal publication missed future opening; no behavioral receipt.');
  await ui.admin.locator('[data-tab="event"]').click();const panel=ui.admin.locator('[data-event-entry]');await pwExpect(panel).toHaveAttribute('data-entry-state','disabled');
  await panel.getByRole('button',{name:'Enable event entry',exact:true}).click();await pwExpect(panel).toHaveAttribute('data-entry-state','enabled');
  const link=await panel.getByLabel('Event link',{exact:true}).inputValue();expect(link===f.origin+'/events/'+id,'Staff shared link differs from event identity.',{link,id});
  const qr=join(f.scratch,'rehearsal-qr.png');await panel.getByRole('img',{name:'Event entry QR code',exact:true}).screenshot({path:qr});
  const decoded=spawnSync('/usr/bin/xcrun',['swift',fileURLToPath(new URL('../staging-staff-event-entry/decode-qr.swift',import.meta.url)),qr],{cwd:f.repo,encoding:'utf8',timeout:45000,maxBuffer:128*1024,env:{PATH:'/usr/bin:/bin',HOME:f.scratch,TMPDIR:f.scratch,CLANG_MODULE_CACHE_PATH:join(f.scratch,'clang-cache'),SWIFT_MODULECACHE_PATH:join(f.scratch,'swift-cache')}});
  if(decoded.error||decoded.status===99)throw new HarnessError('Independent QR pixel decoder unavailable.');expect(decoded.status===0&&decoded.stdout.trim()===link,'Rendered QR pixels do not decode to the actual event URL.',{status:decoded.status,decoded:decoded.stdout});
  observations.share={link,approvalId:published.data.approval.id,qrMatches:true};steps.push('Staff published before opening, enabled Entry and shared exact link/decoded QR');
  const browser=ui.context.browser(),attendees=[];
  try {
   for(const [name,business] of [['Synthetic Ada','Synthetic Ada Trade'],['Synthetic Ben','Synthetic Ben Trade']]){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();attendees.push({context,page,name,business});
    await page.goto(link,{waitUntil:'domcontentloaded'});await pwExpect(page.getByRole('heading',{name:'Create your demo profile'})).toBeVisible();
    await page.getByLabel('Your name',{exact:true}).fill(name);await page.getByLabel('Business name',{exact:true}).fill(business);await page.getByLabel('Member ID',{exact:true}).fill('SYNTHETIC-'+name.split(' ')[1].toUpperCase());
    await page.getByRole('button',{name:'Enter demo event',exact:true}).click();await pwExpect(page.locator('[data-catalog-phase]')).toBeVisible();
    const session=await page.request.get(f.origin+'/api/session');attendees.at(-1).identity=(await session.json()).person.id;
    attendees.at(-1).frame=page.frameLocator('iframe[title="BidZizi event"]');
    const browse=attendees.at(-1).frame.locator('[data-action="browse"]');if(await browse.count())await browse.click();
    await pwExpect(attendees.at(-1).frame.locator('[data-lot]').first()).toBeVisible();
    await page.screenshot({path:join(f.scratch,'attendee-'+attendees.length+'-scheduled.png')});
   }
   expect(attendees[0].identity!==attendees[1].identity,'Two private phone contexts collapsed to one identity.');
   await attendees[0].page.reload({waitUntil:'domcontentloaded'});const browseAgain=attendees[0].frame.locator('[data-action="browse"]');if(await browseAgain.count())await browseAgain.click();await pwExpect(attendees[0].frame.locator('[data-lot]').first()).toBeVisible();
   await panel.getByRole('button',{name:'Disable event entry',exact:true}).click();await pwExpect(panel).toHaveAttribute('data-entry-state','disabled');
   const blockedEntry=await f.request('/api/demo/events/'+id+'/begin',{method:'POST',json:{entryId:randomUUID()},headers:{origin:f.origin}});
   expect(blockedEntry.status>=400&&blockedEntry.status<500,'Disabled Entry admitted a new attendee.',{status:blockedEntry.status});
   await pwExpect(attendees[0].frame.locator('[data-lot]').first()).toBeVisible();
   await panel.getByRole('button',{name:'Enable event entry',exact:true}).click();await pwExpect(panel).toHaveAttribute('data-entry-state','enabled');
   steps.push('Two distinct private attendees browsed before opening and survived reload; Entry disable blocked new admission without removing existing VIEW, then re-enabled');
   await h.waitDb(f,utc(start),420000);
   async function place(attendee,amount){
    const frame=attendee.frame;await frame.locator('body').evaluate(()=>{location.hash='#/lots';});await frame.locator('a[href="#/lot/'+itemIds[0]+'"]').first().click();
    await pwExpect(frame.locator('[data-action="bid"]')).toBeEnabled();await frame.locator('[data-action="bid"]').click();
    await frame.locator('#amt').fill((amount/100).toFixed(2));
    const pending=attendee.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v2/bidder/events/'+id+'/lots/'+itemIds[0]+'/bids');
    await frame.locator('[data-action="place"]').click();const reply=await pending,body=await reply.json();
    expect(reply.status()===201&&body.receipt.amountMinor===amount,'Native bid did not durably accept the exact reviewed amount.',{status:reply.status(),body});
    const rows=(await f.db.query('SELECT amount_minor::text FROM bz_manual_bids WHERE actor_id=$1 AND request_id=$2',[attendee.identity,body.receipt.requestId])).rows;
    same(rows,[{amount_minor:String(amount)}],'Native acceptance lacks one exact SQL bid.');
    return body.receipt;
   }
   const editing=attendees[1].frame;await editing.locator('body').evaluate(()=>{location.hash='#/lots';});
   await editing.locator('a[href="#/lot/'+itemIds[0]+'"]').first().click();await editing.locator('[data-action="bid"]').click();
   await editing.locator('#amt').fill('50.00');
   await editing.locator('#amt').evaluate(input=>{input.focus();input.setSelectionRange(2,2);window.__rehearsalEditingInput=input;});
   const a=await place(attendees[0],2500);await attendees[0].frame.locator('[data-action="close-sheet"]').first().click();
   await pwExpect(editing.locator('.lbl-min')).toContainText(/50(?:\.00)?/, {timeout:20000});
   const preserved=await editing.locator('#amt').evaluate(input=>({same:window.__rehearsalEditingInput===input,focused:document.activeElement===input,value:input.value,start:input.selectionStart,end:input.selectionEnd}));
   expect(preserved.same&&preserved.focused&&preserved.value==='50.00'&&preserved.start===2&&preserved.end===2,'Polling replaced active mobile bid input or lost its value/focus/caret.',preserved);
   const bPending=attendees[1].page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v2/bidder/events/'+id+'/lots/'+itemIds[0]+'/bids');
   await editing.locator('[data-action="place"]').click();const bResponse=await bPending,bData=await bResponse.json();
   expect(bResponse.status()===201&&bData.receipt.amountMinor===5000,'Active edited bid did not submit its exact reviewed amount.',{status:bResponse.status(),bData});
   const b=bData.receipt;await editing.locator('[data-action="close-sheet"]').first().click();
   await attendees[0].page.reload({waitUntil:'domcontentloaded'});const again=await place(attendees[0],7500);
   steps.push('Two phones bid, outbid and rebid; server polling changed minimum while preserving the active input node, focus, value and caret');
   await editing.locator('body').evaluate(()=>{location.hash='#/lots';});await editing.locator('a[href="#/lot/'+itemIds[0]+'"]').first().click();
   await editing.locator('[data-action="bid"]').click();await editing.locator('#amt').fill('100.00');
   let lostIntent,lostReceipt;
   await attendees[1].page.route('**/api/v2/bidder/events/'+id+'/lots/'+itemIds[0]+'/bids',async route=>{
    lostIntent=route.request().postDataJSON();const committed=await route.fetch();lostReceipt=(await committed.json()).receipt;await route.abort('failed');
   },{times:1});
   await editing.locator('[data-action="place"]').click();
   await pwExpect(editing.locator('[data-action="check"]')).toBeVisible({timeout:20000});
   expect(lostReceipt?.status==='accepted'&&lostReceipt.requestId===lostIntent?.requestId&&lostReceipt.amountMinor===10000,'Lost response lacked a committed exact bid witness.',{lostIntent,lostReceipt});
   const committedRows=(await f.db.query('SELECT amount_minor::text FROM bz_manual_bids WHERE actor_id=$1 AND request_id=$2',[attendees[1].identity,lostReceipt.requestId])).rows;
   same(committedRows,[{amount_minor:'10000'}],'Lost response request did not commit exactly one original bid.');
   await editing.locator('[data-action="check"]').click();await pwExpect(editing.locator('[data-owned-request="'+lostReceipt.requestId+'"]')).toBeVisible();
   const recovered=await editing.locator('[data-owned-request="'+lostReceipt.requestId+'"]').getAttribute('data-owned-request');
   same(recovered,lostReceipt.requestId,'UI recovered a different bid request after response loss.');
   observations.lostResponse={requestId:lostReceipt.requestId,amountMinor:lostReceipt.amountMinor,sqlRows:committedRows.length};
   steps.push('Server committed a bid whose phone response was lost; the uncertain UI recovered the original request and receipt');
   await h.waitDb(f,utc(end),420000);await attendees[0].page.reload({waitUntil:'domcontentloaded'});
   await pwExpect(attendees[0].page.locator('[data-catalog-phase]')).toHaveAttribute('data-catalog-phase','closed');
   const currentCookie=(await attendees[0].context.cookies()).find(c=>c.name==='bz_session');
   expect(!!currentCookie,'Private attendee session disappeared before closed standing.');
   const closed=await h.api(f,{cookie:'bz_session='+currentCookie.value},h.bidderPath(id,itemIds[1],'standing'));
   expect(closed.status===200&&closed.data.standing.phase==='closed'&&closed.data.standing.acceptedBidCount===0,'Closed no-bid lot is not readable.',closed);
   observations.attendees={ids:attendees.map(x=>x.identity),first:a,outbid:b,rebid:again,activeEdit:preserved,closedNoBid:closed.data.standing};
   await attendees[0].page.screenshot({path:join(f.scratch,'attendee-closed.png')});steps.push('Closed catalog retained final standing and no-bid lot without award finalization');
  } finally {for(const attendee of attendees)await attendee.context.close();}
 });return done(steps,observations);
}
async function publicationBoundary(f){
 const steps=[],observations={},staff=await h.readiness(f);
 const prepare=async(name)=>{
  const created=await h.create(f,staff,name),now=await h.dbNow(f);
  const start=Math.ceil(now.getTime()/60000)*60000+3*60000;
  const opensAt=utc(start),closesAt=utc(start+30*60000),item=lot(name,2500);
  const saved=await h.save(f,staff,created.event.id,created.revision,{event:event(name,endpoints(opensAt,closesAt)),lots:[item]});
  return {id:created.event.id,revision:saved.packet.revision,item,opensAt};
 };
 const early=await prepare('Atomic delayed publication');
 const advisory=91872411,blocker=new pg.Client({connectionString:f.appUrl});await blocker.connect();
 let pending,released=false,installed=false;
 const body={expectedRevision:early.revision,requestId:randomUUID(),lotIds:[early.item.id]};
 try{
  await f.db.query(`CREATE FUNCTION public.bz_test_deferred_publication_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(${advisory}); RETURN NEW; END $$`);
  await f.db.query('CREATE CONSTRAINT TRIGGER bz_test_publication_commit_wait AFTER INSERT ON public.bz_catalog_approvals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.bz_test_deferred_publication_wait()');installed=true;
  await blocker.query('SELECT pg_advisory_lock($1)',[advisory]);
  pending=h.api(f,staff,'/api/v2/admin/events/'+early.id+'/catalog-approval','POST',body);
  pending.catch(()=>{});
  const limit=Date.now()+15000;let waiting=false;
  while(Date.now()<limit){const rows=(await f.db.query("SELECT wait_event_type,query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'")).rows;
   waiting=rows.some(row=>row.wait_event_type==='Lock'&&/COMMIT/i.test(row.query));if(waiting)break;await new Promise(resolve=>setTimeout(resolve,50));}
  if(!waiting)throw new HarnessError('Deferred COMMIT advisory wait was not independently observed:99.');
  expect((await h.dbNow(f)).getTime()<Date.parse(early.opensAt),'The purported authorized decision was not observed before opening.');
  const invisible=(await f.db.query('SELECT count(*)::int AS n FROM bz_catalog_approvals WHERE event_id=$1',[early.id])).rows[0].n;
  expect(invisible===0,'Uncommitted approval was visible to a separate connection.');
  await h.waitDb(f,early.opensAt,300000);await blocker.query('SELECT pg_advisory_unlock($1)',[advisory]);released=true;
  const completed=await pending;expect(completed.status===201,'Pre-opening authorized publication did not commit after opening.',completed);
  const rows=await f.db.query('SELECT (SELECT count(*)::int FROM bz_catalog_approvals WHERE event_id=$1) AS approvals,(SELECT count(*)::int FROM bz_catalog_lots WHERE event_id=$1) AS lots,(SELECT count(*)::int FROM bz_requests WHERE request_id=$2) AS receipts,(SELECT approved_at FROM bz_catalog_approvals WHERE event_id=$1) AS decision_at',[early.id,body.requestId]);
  const committed=rows.rows[0];expect(committed.decision_at instanceof Date&&committed.decision_at.getTime()<Date.parse(early.opensAt),'Final recorded DB decision was not strictly before opening.',committed);
  same({approvals:committed.approvals,lots:committed.lots,receipts:committed.receipts},{approvals:1,lots:1,receipts:1},'Approval, immutable selected lot and receipt did not commit atomically.');
  const replay=await h.api(f,staff,'/api/v2/admin/events/'+early.id+'/catalog-approval','POST',body);
  expect(replay.status===201,'Exact committed publication was not recoverable after opening.',replay);
  same(replay.data,completed.data,'Post-cutoff recovery changed the original publication receipt.');
  observations.delayedCommit={opensAt:early.opensAt,waitObserved:waiting,invisibleBeforeRelease:invisible,committedAfterOpening:rows.rows[0],receipt:completed.data};
  steps.push('Final pre-opening authorization may finish atomic COMMIT and exact recovery after opening');
 } finally {
  if(!released)await blocker.query('SELECT pg_advisory_unlock($1)',[advisory]).catch(()=>{});
  await blocker.end();if(pending)await pending.catch(()=>{});
  if(installed)await f.db.query('DROP TRIGGER bz_test_publication_commit_wait ON public.bz_catalog_approvals').catch(()=>{});
  await f.db.query('DROP FUNCTION IF EXISTS public.bz_test_deferred_publication_wait()').catch(()=>{});
 }
 const late=await prepare('Fresh queued publication after opening'),lock=new pg.Client({connectionString:f.appUrl});await lock.connect();let fresh,releasedLate=false;
 try{
  await lock.query('BEGIN');await lock.query('SELECT id FROM bz_events WHERE id=$1 FOR UPDATE',[late.id]);
  fresh=h.api(f,staff,'/api/v2/admin/events/'+late.id+'/catalog-approval','POST',{expectedRevision:late.revision,requestId:randomUUID(),lotIds:[late.item.id]});
  fresh.catch(()=>{});
  const limit=Date.now()+15000;let waiting=false;while(Date.now()<limit){const rows=(await f.db.query("SELECT query,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows;
   waiting=rows.some(row=>row.blockers?.length&&/bz_events/i.test(row.query));if(waiting)break;await new Promise(resolve=>setTimeout(resolve,50));}
  if(!waiting)throw new HarnessError('Fresh publication event-lock wait was not witnessed:99.');
  await h.waitDb(f,late.opensAt,300000);await lock.query('COMMIT');releasedLate=true;
  const denied=await fresh;expect(denied.status===409,'Fresh publication decision at/after opening was accepted.',denied);
  const after=(await f.db.query('SELECT count(*)::int AS n FROM bz_catalog_approvals WHERE event_id=$1',[late.id])).rows[0].n;
  expect(after===0,'Rejected fresh publication left a committed approval.');
  observations.freshAfterWait={opensAt:late.opensAt,lockObserved:waiting,status:denied.status,approvalRows:after};
  steps.push('Fresh publication decision after an event-lock wait crossing opening rejects without a snapshot');
 }finally{if(!releasedLate)await lock.query('ROLLBACK').catch(()=>{});await lock.end();if(fresh)await fresh.catch(()=>{});}
 return done(steps,observations);
}
export const groups=[
 {name:'Native one-window creation, rules and saved phone preview',assertions:['REHEARSAL_NATIVE_ONE_WINDOW'],run:native},
 {name:'Pre-open browse, four tiers, override, bid and close',assertions:['REHEARSAL_PHASE_TIERS_CLOSE'],run:phasesAndBids},
 {name:'Cross-date timezone denial and exact recovery',assertions:['REHEARSAL_LOCAL_TIME_RECOVERY'],run:validation},
 {name:'Held staff authority after waits',assertions:['REHEARSAL_POSTWAIT_AUTHORITY'],run:held},
 {name:'Historical USD receipt and owned recovery',assertions:['REHEARSAL_HISTORICAL_USD'],run:legacy},
 {name:'Concurrent bids, inclusive cap and held close',assertions:['REHEARSAL_CONCURRENT_CAP_CUTOFF'],run:concurrencyAndCap},
 {name:'Native staff, Entry, two phones and closed standing',assertions:['REHEARSAL_NATIVE_COMPLETE_JOURNEY'],run:nativeJourney},
 {name:'Publication decision cutoff, delayed commit and exact recovery',assertions:['REHEARSAL_PUBLICATION_DECISION_ATOMIC'],run:publicationBoundary},
];
