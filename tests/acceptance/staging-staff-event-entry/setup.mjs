import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {compact,lot} from '../staff-drafts/protocol.mjs';
import {HarnessError} from '../staging-manual-bid/harness.mjs';
import {prepareFixture,ids} from '../staging-manual-bid/fixtures.mjs';
export {ids};
export const entryPath=id=>'/api/admin/events/'+id+'/entry';
export const demoPath=id=>'/api/demo/events/'+id;
export const profile={name:'Synthetic Entry Ada',businessName:'Synthetic Entry Studio',memberId:'SYNTHETIC-ENTRY-ONLY'};
export const cookie=r=>r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
export const hashSession=s=>createHash('sha256').update(s.token).digest('hex');
export const post=(f,path,json,session)=>f.request(path,{method:'POST',json,cookie:session?.cookie,headers:{origin:f.origin}});
export async function login(f,account='staff-saturn'){
 const r=await post(f,'/api/test-auth/login',{account});assert.equal(r.status,200,'Inherited synthetic staff sign-in must be available');
 const c=cookie(r),token=c.split('=')[1];assert.match(token,/^[A-Za-z0-9_-]{43}$/);return {cookie:c,token,personId:r.data.person.id};
}
export async function fresh(f,staff,name='Entry evidence '+randomUUID()){
 const r=await post(f,'/api/admin/events',{organizationId:ids.saturn,name,requestId:randomUUID()},staff);
 assert.equal(r.status,201,'Target event must be created through real staff persistence');
 const eventId=r.data.draft.event.id;assert.notEqual(eventId,ids.event);
 assert.equal((await f.db.query('SELECT count(*) n FROM bz_demo_event_entries WHERE event_id=$1',[eventId])).rows[0].n,'0','No operator SQL target entry fixture');
 return {eventId,name,draft:r.data.draft};
}
export const readEntry=(f,staff,eventId)=>f.request(entryPath(eventId),{cookie:staff.cookie});
export const setEntry=(f,staff,eventId,expectedEntryRevision,enabled,requestId=randomUUID())=>post(f,entryPath(eventId),{expectedEntryRevision,enabled,requestId},staff);
export async function slot(f,eventId){
 const entryId=randomUUID(),r=await post(f,demoPath(eventId)+'/begin',{entryId});assert.equal(r.status,200);
 return {entryId,cookie:cookie(r),eventId};
}
export const enroll=(f,s,claims=profile)=>post(f,demoPath(s.eventId)+'/enroll',{entryId:s.entryId,...claims},{cookie:s.cookie});
export const ack=(f,s,privateCookie)=>post(f,demoPath(s.eventId)+'/acknowledge',{entryId:s.entryId},{cookie:privateCookie});
export async function publishThroughStaff(f,staff,t){
 // Inherited synthetic ruleset fixture, not a financial/timing policy decision.
 // An unapproved fresh event truthfully has no current bidder context. For cases
 // requiring that context, save/approve via real staff APIs; never target SQL.
 const draft=compact(t.draft),now=await f.dbNow(),open=new Date((Math.floor(now.getTime()/86400000)+1)*86400000+12*3600000);
 Object.assign(draft.event,{welcome:'Synthetic entry recovery event',date:open.toISOString().slice(0,10),start:'12:00',end:'13:00',timezone:'UTC',increment:2500});
 const item=lot('Synthetic entry recovery item');Object.assign(item,{description:'Synthetic entry-only acceptance item',category:'Synthetic',opening:10000,windowId:'main'});draft.lots=[item];
 const saved=await f.request('/api/admin/events/'+t.eventId,{method:'PUT',json:{expectedRevision:t.draft.revision,requestId:randomUUID(),draft},cookie:staff.cookie,headers:{origin:f.origin}});assert.equal(saved.status,200,'Fresh context target saved through staff API');
 const approved=await post(f,'/api/admin/events/'+t.eventId+'/catalog-approval',{expectedRevision:saved.data.draft.revision,requestId:randomUUID(),lotIds:[item.id]},staff);assert.equal(approved.status,201,'Fresh context target approved through staff API');
 t.draft=saved.data.draft;
}
export async function snapshot(f,eventId){
 const values={};
 for(const t of ['bz_catalog_approvals','bz_catalog_lots','bz_event_view_grants','bz_event_bidder_admissions','bz_demo_entry_slots','bz_lot_standing','bz_manual_bids'])values[t]=(await f.db.query('SELECT row_to_json(t) v FROM public.'+t+' t WHERE event_id=$1 ORDER BY row_to_json(t)::text',[eventId])).rows;
 values.bz_bid_receipts=(await f.db.query("SELECT row_to_json(t) v FROM public.bz_bid_receipts t WHERE receipt->>'eventId'=$1::text ORDER BY row_to_json(t)::text",[eventId])).rows;
 for(const t of ['bz_sessions','bz_people','bz_businesses','bz_staff_grants','bz_business_person_memberships','bz_org_business_memberships'])values[t]=(await f.db.query('SELECT row_to_json(t) v FROM public.'+t+' t ORDER BY row_to_json(t)::text')).rows;
 values.draft=(await f.db.query('SELECT revision,draft FROM bz_events WHERE id=$1',[eventId])).rows;
 return values;
}
export async function stored(f,eventId,proof){
 const result={entryRows:(await f.db.query('SELECT * FROM bz_demo_event_entries WHERE event_id=$1',[eventId])).rows,ledgerRows:(await f.db.query('SELECT * FROM bz_staff_event_entry_requests WHERE event_id=$1 ORDER BY actor_id,request_id',[eventId])).rows};
 if(proof){result.sqlTimeMatches={entry:(await f.db.query('SELECT updated_at=$2::timestamptz matches FROM bz_demo_event_entries WHERE event_id=$1',[eventId,proof.entry.updatedAt])).rows[0]?.matches,operation:(await f.db.query('SELECT applied_at=$4::timestamptz matches FROM bz_staff_event_entry_requests WHERE actor_id=$1 AND event_id=$2 AND request_id=$3',[proof.actorId,eventId,proof.operation.requestId,proof.operation.appliedAt])).rows[0]?.matches};}
 return result;
}
export async function setup(f,{legacy=false}={}){
 assert.equal((await f.request('/api/session')).status,200,'Inherited API connectivity must succeed before finite route absence');
 for(const name of ['009_demo_attendee_entry.sql','015_staff_event_entry.sql']){
  const file=join(f.repo,'migrations',name);try{await access(file);}catch(e){if(name.startsWith('015_')&&e.code==='ENOENT')continue;throw new HarnessError('Required inherited schema file unavailable');}
  try{
   if(name.startsWith('015_')){
    f.inheritedFunctions=(await f.db.query("SELECT p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid::regprocedure::text")).rows;
    // Disposable negative fixture: prove the migration removes inherited defaults
    // rather than relying on a clean cluster's accidentally empty table ACL.
    await f.db.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+f.migratorRole+' IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO '+f.runtimeRole);
    await f.db.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+f.migratorRole+' IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO PUBLIC');
   }
   await f.db.query('SET ROLE '+f.migratorRole);await f.db.query(await readFile(file,'utf8'));
  }
  catch{throw new HarnessError('Disposable migration/setup failed; this cannot prove behavioral RED');}
  finally{
   await f.db.query('RESET ROLE');
   if(name.startsWith('015_')){
    await f.db.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+f.migratorRole+' IN SCHEMA public REVOKE ALL ON TABLES FROM '+f.runtimeRole);
    await f.db.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+f.migratorRole+' IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC');
   }
  }
 }
 await f.db.query('GRANT SELECT ON public.bz_demo_event_entries TO '+f.runtimeRole);
 for(const sig of ['bz_demo_begin(uuid,uuid,text)','bz_demo_enroll(uuid,uuid,text,text,text,text,text,text)','bz_demo_acknowledge(uuid,uuid,text)','bz_staff_event_entry_read(text,uuid)','bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)']){
  const exists=(await f.db.query('SELECT to_regprocedure($1) v',['public.'+sig])).rows[0].v;
  if(exists)await f.db.query('GRANT EXECUTE ON FUNCTION public.'+sig+' TO '+f.runtimeRole);
 }
 assert.equal((await f.runtimeDB.query('SELECT current_user u')).rows[0].u,f.runtimeRole);
 if(legacy){await prepareFixture(f,{phase:'open'});await f.db.query('INSERT INTO bz_demo_event_entries(event_id,org_id,enabled) VALUES($1,$2,true)',[ids.event,ids.saturn]);}
}
export async function queued(f,sql,params,run,change){
 const lock=await f.privilegedConnection();await lock.query('BEGIN');await lock.query(sql,params);const pending=run();
 try{
  const deadline=Date.now()+10_000;let observed=false;
  while(Date.now()<deadline){if((await f.db.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'",[f.runtimeRole])).rows.length){observed=true;break;}await new Promise(r=>setTimeout(r,20));}
  if(!observed)throw new HarnessError('Expected database wait was not observed');
  await change(lock);await lock.query('COMMIT');return await pending;
 }finally{await lock.query('ROLLBACK').catch(()=>{});await lock.end();await pending.catch(()=>{});}
}
