// Unfrozen rehearsal successor: one shared window, exact tier rules, no groups.
import {randomUUID} from 'node:crypto';
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
 const steps=[],staff=await h.readiness(f),observations={};
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
 const steps=[],lots=[lot('below five hundred',49900),lot('at five hundred',50000),lot('at one thousand',100000),lot('at twenty five hundred',250000),lot('fixed override',20000,7500)];
 const p=await setup(f,'Known tier and phase rehearsal',3,4,lots),id=p.created.event.id;
 await h.authorize(f,id);const a=await h.login(f,'bidder-juniper'),b=await h.login(f,'bidder-harbor');
 const pre=await catalog(f,a,id);expect(pre.status===200&&pre.data.phase==='scheduled','Admitted pre-open catalog is unavailable.',pre);
 same(pre.data.catalog?.lots.map(x=>x.id),lots.map(x=>x.id),'Pre-open selected roster differs from saved selection.');
 const denied=await catalog(f,null,id);expect(denied.status===401,'Anonymous pre-open browse leaked.',denied);
 const early=await bid(f,a,id,lots[0].id,h.ids.businessA,49900);expect(early.response.status===409&&early.response.data.receipt.reason==='NOT_OPEN','Scheduled bid was accepted.',early);
 steps.push('Current private VIEW sees the selected published roster before opening and scheduled bids reject');
 await h.waitDb(f,p.opensAt,300000);
 const expectedRaise=[2500,5000,10000,25000,7500],receipts=[];
 for(let i=0;i<lots.length;i++){
  const first=await bid(f,a,id,lots[i].id,h.ids.businessA,lots[i].opening);
  expect(first.response.status===201&&first.response.data.receipt.amountMinor===lots[i].opening,'First bid did not accept exact opening.',first);
  const next=await standing(f,b,id,lots[i].id);expect(next.status===200&&next.data.standing.minimumAmountMinor===lots[i].opening+expectedRaise[i],'Tier/override minimum was not selected from current highest.',{next,lot:lots[i]});
  const stale=await bid(f,b,id,lots[i].id,h.ids.businessB,lots[i].opening+expectedRaise[i]-1);
  expect(stale.response.status===409&&stale.response.data.receipt.reason==='BELOW_MINIMUM'&&stale.response.data.receipt.amountMinor===stale.intent.amountMinor,'Stale submitted amount was upgraded or accepted.',stale);
  const excess=await bid(f,b,id,lots[i].id,h.ids.businessB,lots[i].opening+expectedRaise[i]+1);
  expect(excess.response.status===201&&excess.response.data.receipt.amountMinor===excess.intent.amountMinor,'Non-multiple eligible amount rejected.',excess);
  receipts.push({first:first.response.data.receipt,excess:excess.response.data.receipt,stale:stale.response.data.receipt});
 }
 steps.push('All first bids, four inclusive tier boundaries, fixed override, stale amount and non-multiple bid observed durably');
 const beforeClose=await h.snapshot(f);await h.waitDb(f,p.closesAt,300000);
 const late=await bid(f,a,id,lots[0].id,h.ids.businessA,99900);
 expect(late.response.status===409&&late.response.data.receipt.reason==='CLOSED','A late bid was accepted.',late);
 const closed=await standing(f,a,id,lots[0].id);expect(closed.status===200&&closed.data.standing.phase==='closed','Closed standing is not readable.',closed);
 const replay=await h.api(f,a,h.bidderPath(id,lots[0].id,'bids'),'POST',{requestId:receipts[0].first.requestId,businessId:h.ids.businessA,amountMinor:49900,rulesetId:rule});
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
export const groups=[
 {name:'Native one-window creation, rules and saved phone preview',assertions:['REHEARSAL_NATIVE_ONE_WINDOW'],run:native},
 {name:'Pre-open browse, four tiers, override, bid and close',assertions:['REHEARSAL_PHASE_TIERS_CLOSE'],run:phasesAndBids},
 {name:'Cross-date timezone denial and exact recovery',assertions:['REHEARSAL_LOCAL_TIME_RECOVERY'],run:validation},
 {name:'Held staff authority after waits',assertions:['REHEARSAL_POSTWAIT_AUTHORITY'],run:held},
 {name:'Historical USD receipt and owned recovery',assertions:['REHEARSAL_HISTORICAL_USD'],run:legacy},
 {name:'Concurrent bids, inclusive cap and held close',assertions:['REHEARSAL_CONCURRENT_CAP_CUTOFF'],run:concurrencyAndCap},
];
