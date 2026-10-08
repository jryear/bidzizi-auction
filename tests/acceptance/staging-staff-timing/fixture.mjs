import { randomUUID,createHash } from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {access} from 'node:fs/promises';
import pg from 'pg';
import { configuration as acceptedConfiguration,withUI,previewUI } from '../staging-studio-composition/fixture.mjs';
import { HarnessError,ApplicationFailure,pgBin } from '../staff-drafts/harness.mjs';
import { expect,same,pick,eventKeys,lotKeys,sealed,available,acceptedTuple } from './oracles.mjs';
export { withUI,previewUI };
export const ids={saturn:'10000000-0000-4000-8000-000000000001',pine:'10000000-0000-4000-8000-000000000002',staff:'20000000-0000-4000-8000-000000000001',juniper:'20000000-0000-4000-8000-000000000003',harbor:'20000000-0000-4000-8000-000000000004',businessA:'30000000-0000-4000-8000-000000000001',businessB:'30000000-0000-4000-8000-000000000002'};
export const configuration={environment:acceptedConfiguration.environment,async initialize(config){
  await acceptedConfiguration.initialize(config);
  const entry=spawnSync(join(pgBin,'psql'),['--dbname',config.appUrl,'-v','ON_ERROR_STOP=1','-f',join(config.repo,'migrations/015_staff_event_entry.sql')],{env:config.env,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
  if(entry.error||entry.status!==0)throw new HarnessError('Disposable accepted Entry015 migration failed.');
  // Candidate-only Assets016 is real product DDL, never supplied by this
  // fixture. Base has no file and must reach the missing v2 capability.
  let assets=false;try{await access(join(config.repo,'migrations/016_staging_staff_assets.sql'));assets=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(assets){const result=spawnSync(join(pgBin,'psql'),['--dbname',config.appUrl,'-v','ON_ERROR_STOP=1','-f',join(config.repo,'migrations/016_staging_staff_assets.sql')],{env:config.env,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
   if(result.error||result.status!==0)throw new HarnessError('Disposable candidate Assets016 migration failed:99.');}
  await config.db.query(`INSERT INTO bz_businesses(id,name) VALUES($1,'Synthetic Juniper Business'),($2,'Synthetic Harbor Business');`,[ids.businessA,ids.businessB]);
  await config.db.query('INSERT INTO bz_business_person_memberships(person_id,business_id,can_bid) VALUES($1,$2,true),($3,$4,true)',[ids.juniper,ids.businessA,ids.harbor,ids.businessB]);
  await config.db.query('INSERT INTO bz_org_business_memberships(org_id,business_id) VALUES($1,$2),($1,$3)',[ids.saturn,ids.businessA,ids.businessB]);
}};
export async function login(f,account='staff-saturn') {
  const r=await f.request('/api/test-auth/login',{method:'POST',json:{account},headers:{origin:f.origin}});
  if(r.status!==200||!r.data?.person)throw new HarnessError('Required existing test-auth readiness failed.');
  const cookie=r.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new HarnessError('Test session cookie unavailable.');
  return {cookie,person:r.data.person};
}
export async function api(f,session,path,method='GET',json,corruption=null) {
  const before=await dbNow(f);
  const r=await f.request(path,{method,json,cookie:session?.cookie,headers:method==='GET'?{}:{origin:f.origin}});
  const after=await dbNow(f);
  const response={status:r.status,data:r.data,cacheControl:r.headers.get('cache-control')||'',path,method,dbTimeBracket:{before:before.toISOString(),after:after.toISOString()}};available(response,corruption);return response;
}
export async function nativeResponse(response) {
  const status=response.status();available({status,data:null,path:new URL(response.url()).pathname});
  const reply={status,data:await response.json(),path:new URL(response.url()).pathname,cacheControl:response.headers()['cache-control']||''};available(reply);return reply;
}
export async function loggedOut(f,session) {
  const hash=createHash('sha256').update(session.cookie.slice('bz_session='.length)).digest('hex');
  const select=async()=> (await f.db.query('SELECT person_id,revoked_at,expires_at,created_at FROM bz_sessions WHERE token_hash=$1',[hash])).rows[0];
  const before=await select();if(!before||before.revoked_at!==null)throw new HarnessError('Owned session must be active before logout witness.');
  const response=await api(f,session,'/api/session/logout','POST',{});expect(response.status===200,'Existing logout did not acknowledge200.',response);same(response.data,{authenticated:false,testMode:true},'Existing logout did not acknowledge anonymous state.');sealed(response);
  const after=await select();expect(!!after&&after.person_id===before.person_id&&after.created_at.getTime()===before.created_at.getTime()&&after.expires_at.getTime()===before.expires_at.getTime()&&after.revoked_at instanceof Date&&after.revoked_at.getTime()>=Date.parse(response.dbTimeBracket.before)&&after.revoked_at.getTime()<=Date.parse(response.dbTimeBracket.after),'Logout did not durably revoke the exact owned session inside DB bracket.',{before,after,response});
  // Public observation excludes cookie and token hash.
  return {response,before,after};
}
export async function proveAccepted(f,result,known,timing,version) {
  const receipt=result.response.data.receipt;sealed(result.response);acceptedTuple(receipt,known,result.response.dbTimeBracket,timing);
  const bid=(await f.db.query('SELECT * FROM bz_manual_bids WHERE actor_id=$1 AND request_id=$2',[known.actorId,known.requestId])).rows;
  expect(bid.length===1,'Known actor/request has no exact single durable bid.',{known,bid});const b=bid[0];
  const expected={id:receipt.bidId,actor_id:known.actorId,business_id:known.businessId,request_id:known.requestId,event_id:known.eventId,org_id:ids.saturn,release_id:known.releaseId,lot_id:known.lotId,amount_minor:String(known.amountMinor),ruleset_id:known.rulesetId,currency:'USD',standing_version:version,decided_at:new Date(receipt.decidedAt)};
  same(b,expected,'Full durable bid values differ from known inputs and independently bracketed generated receipt.');
  const row=(await f.db.query('SELECT * FROM bz_lot_standing WHERE release_id=$1 AND lot_id=$2',[known.releaseId,known.lotId])).rows;
  expect(row.length===1,'Known release/lot has no exact single standing.');same(row[0],{release_id:known.releaseId,lot_id:known.lotId,event_id:known.eventId,org_id:ids.saturn,ruleset_id:known.rulesetId,currency:'USD',increment_minor:'2500',amount_cap_minor:'1000000000',current_amount_minor:String(known.amountMinor),leading_business_id:known.businessId,accepted_bid_id:b.id,accepted_bid_count:version,version,updated_at:b.decided_at},'Full standing differs from independently known amount/business/count/physical target.');
  const durable=(await f.db.query('SELECT receipt,http_status FROM bz_bid_receipts WHERE actor_id=$1 AND request_id=$2',[known.actorId,known.requestId])).rows;
  expect(durable.length===1,'Known actor/request receipt missing or duplicated.');acceptedTuple(durable[0].receipt,known,result.response.dbTimeBracket,timing);same(durable[0],{receipt,http_status:201},'Original API receipt differs from durable known-input-validated receipt.');return {known,bid:b,standing:row[0],durable:durable[0]};
}
export async function readiness(f) {
  const staff=await login(f);const r=await api(f,staff,'/api/admin/events','POST',{organizationId:ids.saturn,name:'Timing existing-v1 readiness only',requestId:randomUUID()});
  if(r.status!==201||r.data?.draft?.version!==1||r.data.draft.lots.length)throw new HarnessError('Existing fresh-event API readiness failed; not capability absence.');
  const row=(await f.db.query('SELECT id,revision FROM bz_events WHERE id=$1',[r.data.draft.event.id])).rows[0];
  if(!row||row.revision!==1)throw new HarnessError('Existing draft SQL readiness failed.');return staff;
}
export async function create(f,staff,name='Timing independently created v2 event',version=2) {
  const path=version===2?'/api/v2/admin/events':'/api/admin/events';
  const r=await api(f,staff,path,'POST',{organizationId:ids.saturn,name,requestId:randomUUID()});
  expect(r.status===201&&r.data?.draft?.version===version,'Reached fresh-event version'+version+' capability is absent or incorrect.',r);sealed(r);return r.data.draft;
}
export const local=(iso,timezone='UTC')=>({startDate:iso.slice(0,10),start:iso.slice(11,16),timezone});
export function knownEvent(name='Known full synthetic timing event') {return {name,eyebrow:'Synthetic cross-date event',welcome:'Independently entered saved timing welcome.',venue:'Synthetic private venue',cover:null,timing:{startDate:'2030-01-15',start:'18:00',endDate:'2030-01-17',end:'20:00',timezone:'America/Los_Angeles'},increment:2500,sponsorsEnabled:false,sponsors:[]};}
export function lot(index,windowId=null) {return {id:randomUUID(),title:'Known timing item '+index,short:'Independent summary '+index,description:'Independent complete description '+index,category:index===2?'Food':'Travel',image:null,alt:'Independent image text '+index,opening:10000+index*100,includes:['Known included detail '+index],fine:'Known restrictions '+index,windowId};}
export function knownDraft(name) {const group={id:randomUUID(),name:'Evening across dates',startDate:'2030-01-15',start:'19:00',endDate:'2030-01-16',end:'20:00'};return {event:knownEvent(name),groups:[group],lots:[lot(1),lot(2,group.id),lot(3,group.id)]};}
export async function save(f,staff,id,revision,draft,key=randomUUID()) {const body={expectedRevision:revision,requestId:key,draft};const r=await api(f,staff,'/api/v2/admin/events/'+id,'PUT',body);expect(r.status===200,'Reached v2 Save did not durably acknowledge200.',r);sealed(r);return {response:r,body,packet:r.data.draft};}
export async function sqlEvent(f,id) {return {event:(await f.db.query('SELECT id,org_id,revision,draft,created_by,created_at,updated_at FROM bz_events WHERE id=$1',[id])).rows[0],lots:(await f.db.query('SELECT id,event_id,org_id,position,data FROM bz_lots WHERE event_id=$1 ORDER BY position',[id])).rows};}
export async function approve(f,staff,id,revision,lotIds,key=randomUUID()) {const body={expectedRevision:revision,requestId:key,lotIds};const response=await api(f,staff,'/api/v2/admin/events/'+id+'/catalog-approval','POST',body);expect(response.status===201,'Reached v2 saved-subset approval did not return201.',response);sealed(response);return {response,body,approval:response.data.approval};}
const tables=['bz_events','bz_lots','bz_catalog_approvals','bz_catalog_lots','bz_lot_standing','bz_manual_bids','bz_bid_receipts','bz_requests'];
export async function snapshot(f) {const result={};for(const t of tables)result[t]=(await f.db.query('SELECT to_jsonb(r) AS row FROM '+t+' r ORDER BY to_jsonb(r)::text')).rows.map(r=>r.row);return result;}
export async function constraints(f) {return(await f.db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('bz_lot_standing'::regclass,'bz_manual_bids'::regclass,'bz_catalog_lots'::regclass,'bz_catalog_approvals'::regclass) ORDER BY conname")).rows;}
export async function authorize(f,id) {await f.db.query('INSERT INTO bz_event_view_grants(person_id,event_id) VALUES($1,$3),($2,$3)',[ids.juniper,ids.harbor,id]);await f.db.query("INSERT INTO bz_event_bidder_admissions(person_id,event_id,access) VALUES($1,$3,'BID'),($2,$3,'BID')",[ids.juniper,ids.harbor,id]);}
export const bidderPath=(id,lotId,suffix)=>'/api/v2/bidder/events/'+id+'/lots/'+lotId+'/'+suffix;
export async function dbNow(f) {return(await f.db.query('SELECT clock_timestamp() AS at')).rows[0].at;}
export async function waitDb(f,iso,maximum=240000) {const stop=Date.now()+maximum;while(Date.now()<stop){const at=await dbNow(f);if(at.getTime()>=Date.parse(iso))return at;await new Promise(done=>setTimeout(done,200));}throw new HarnessError('Observed DB boundary was not reached within bounded deadline.');}
export async function lockedExpiry(f,session,eventId,request) {
  // Set expiry before authority locks are acquired; do not UPDATE a locked session.
  const token=session.cookie.slice('bz_session='.length),hash=createHash('sha256').update(token).digest('hex');
  const expires=(await f.db.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '8 seconds' WHERE token_hash=$1 RETURNING expires_at",[hash])).rows[0].expires_at;
  const lock=new pg.Client({connectionString:f.appUrl});await lock.connect();let released=false,pending;
  try {await lock.query('BEGIN');await lock.query('SELECT id FROM bz_events WHERE id=$1 FOR UPDATE',[eventId]);const before=await snapshot(f);pending=request();
    const limit=Date.now()+6500;let blocked=false;while(Date.now()<limit){blocked=(await f.db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query ILIKE '%bz_events%'")).rows[0].n>0;if(blocked)break;await new Promise(done=>setTimeout(done,100));}
    if(!blocked)throw new HarnessError('Request was not observed blocked on owned event row before expiry.');
    await waitDb(f,expires.toISOString(),12000);const during=await snapshot(f);same(during,before,'A held request mutated complete SQL before release.');await lock.query('COMMIT');released=true;
    const response=await pending;expect(response.status===401,'Post-wait expired session was accepted.',response);sealed(response);const after=await snapshot(f);same(after,before,'Expired held operation changed complete durable rows.');return {blocked,expiresAt:expires.toISOString(),response,before,after};
  }finally{if(!released)await lock.query('ROLLBACK').catch(()=>{});await lock.end();if(pending)await pending.catch(()=>{});}
}
export async function consumed(preview) {return preview.evaluate(async({eventKeys,lotKeys})=>{const d=await import('/staging-bidder-preview/src/data.js'),p=window.__studioPackets?.at(-1)?.payload;return {event:Object.fromEntries(eventKeys.map(k=>[k,d.event[k]])),lots:d.lots.map(l=>Object.fromEntries(lotKeys.map(k=>[k,l[k]]))),groups:d.groups,mode:p?.mode,revision:p?.revision,selectedLotId:location.hash.startsWith('#/lot/')?location.hash.slice(6):null,text:document.body.innerText,renderedGroups:[...document.querySelectorAll('[data-preview-group-id]')].map(e=>{const r=e.getBoundingClientRect(),style=getComputedStyle(e);return {id:e.dataset.previewGroupId,lotId:e.dataset.previewLotId,local:{startDate:e.querySelector('[data-schedule-start]')?.getAttribute('datetime')?.slice(0,10),start:e.querySelector('[data-schedule-start]')?.getAttribute('datetime')?.slice(11,16),endDate:e.querySelector('[data-schedule-end]')?.getAttribute('datetime')?.slice(0,10),end:e.querySelector('[data-schedule-end]')?.getAttribute('datetime')?.slice(11,16),timezone:e.querySelector('[data-schedule-timezone]')?.textContent?.trim()},text:e.innerText,visible:r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden'};})};},{eventKeys,lotKeys});}
export async function corruptReads(f,staff,eventId,approvalId,lotId) {
  // Test-admin injection only in this owned disposable DB, restored exactly.
  await authorize(f,eventId);const bidder=await login(f,'bidder-juniper'),rows=[];
  const header=(await f.db.query('SELECT event_snapshot FROM bz_catalog_approvals WHERE id=$1',[approvalId])).rows[0].event_snapshot;
  const target=(await f.db.query('SELECT snapshot FROM bz_catalog_lots WHERE approval_id=$1 AND lot_id=$2',[approvalId,lotId])).rows[0].snapshot;
  const routes=[[staff,'/api/v2/admin/events/'+eventId+'/catalog-approval'],[bidder,'/api/v2/catalog/events/'+eventId],[bidder,'/api/v2/catalog/events/'+eventId+'/lots/'+lotId]];
  const healthy=async()=>{const responses=[];for(const [session,path]of routes){const response=await api(f,session,path);expect(response.status===200,'Corruption control route must be healthy200 without exception declaration.',response);sealed(response);responses.push(response);}return responses;};
  for(const kind of ['manifest','target','marker']) {
    const saved=await snapshot(f),healthyBefore=await healthy();same(await snapshot(f),saved,'Healthy pre-injection reads changed durable SQL.');let evidence;
    try {
      if(kind==='target')await f.db.query('UPDATE bz_catalog_lots SET snapshot=$3::jsonb WHERE approval_id=$1 AND lot_id=$2',[approvalId,lotId,JSON.stringify({...target,timing:{}})]);
      else await f.db.query('UPDATE bz_catalog_approvals SET event_snapshot=$2::jsonb WHERE id=$1',[approvalId,JSON.stringify({...header,_timing:{...header._timing,...(kind==='manifest'?{initialLots:'malformed'}:{version:99})}})]);
      const corrupted=await snapshot(f),responses=[];
      for(const [session,path]of routes) {
        const response=await api(f,session,path,'GET',undefined,{kind,eventId,approvalId,lotId,applied:true});expect(response.status===503&&response.data?.error?.code==='UNAVAILABLE','Malformed '+kind+' projected fallback or partial public data.',response);sealed(response);responses.push(response);
      }
      same(await snapshot(f),corrupted,'Corruption-denial read repaired or mutated SQL.');evidence={kind,healthyBefore,responses};
    } finally {
      await f.db.query('UPDATE bz_catalog_approvals SET event_snapshot=$2::jsonb WHERE id=$1',[approvalId,JSON.stringify(header)]);
      await f.db.query('UPDATE bz_catalog_lots SET snapshot=$3::jsonb WHERE approval_id=$1 AND lot_id=$2',[approvalId,lotId,JSON.stringify(target)]);
      same(await snapshot(f),saved,'Disposable corruption control failed exact restoration.');
      const healthyAfter=await healthy();same(await snapshot(f),saved,'Healthy restored reads changed durable SQL.');if(evidence)rows.push({...evidence,healthyAfter});
    }
  }return rows;
}
export function transport(error) {if(error?.name==='TimeoutError'||error?.name==='AbortError')return new ApplicationFailure('Reached UI/API timed out; cannot prove baseline absence.');return error;}
