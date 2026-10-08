import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {HarnessError} from '../staging-catalog/harness.mjs';
import {withOwnedFixture} from './cleanup.mjs';
import {functions} from './protocol.mjs';
const migration='migrations/016_staging_staff_assets.sql';
export async function withAssetsFixture(run,output){
 const owned={connections:[],browsers:[],pendingBrowsers:[],cancelled:false,pgPid:null,appPort:null,scratch:null};let result;
 const closeExtras=async()=>{
   owned.cancelled=true;await bounded(Promise.allSettled(owned.pendingBrowsers),10000);
   await bounded(Promise.all(owned.browsers.map(b=>b.isConnected()?b.close():Promise.resolve())),10000);
   await bounded(Promise.all(owned.connections.map(c=>c.end())),5000);
 };
 try{return await withOwnedFixture(async f=>{
   owned.scratch=f.scratch;owned.appPort=Number(new URL(f.origin).port);owned.pgPid=Number((await readFile(join(f.scratch,'pg/postmaster.pid'),'utf8')).split('\n')[0]);
   f.connect=async()=>{if(owned.cancelled)throw new HarnessError('Owned connection allocation cancelled:99.');const p=f.db.connectionParameters;const c=new pg.Client({host:p.host,port:p.port,user:p.user,password:p.password,database:p.database,connectionTimeoutMillis:5000});owned.connections.push(c);await c.connect();if(owned.cancelled){await c.end();throw new HarnessError('Owned connection allocation cancelled:99.');}return c;};
   f.owned=owned;
   // Existing001/002 and synthetic authority seed are allocated by the unchanged
   // historical harness. All further statements operate only on its random DB.
   const db=(await f.db.query('SELECT current_database() AS name')).rows[0].name;
   if(!/^bz_test_[a-f0-9]{12}$/.test(db)||!/^migration_[a-f0-9]{12}$/.test(f.migratorRole)||!/^runtime_[a-f0-9]{12}$/.test(f.runtimeRole))throw new HarnessError('Disposable schema/role identity not proven.');
   for(const file of ['migrations/003_staging_manual_bid.sql','migrations/009_demo_attendee_entry.sql','migrations/015_staff_event_entry.sql']){
     await f.db.query('SET ROLE '+f.migratorRole);try{await f.db.query(await readFile(join(f.repo,file),'utf8'));}finally{await f.db.query('RESET ROLE');}
   }
   for(const t of ['bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_bidder_admissions'])await f.db.query('GRANT SELECT,UPDATE(lock_marker) ON public.'+t+' TO '+f.runtimeRole);
   await f.db.query('GRANT SELECT,INSERT,UPDATE ON public.bz_lot_standing TO '+f.runtimeRole);
   await f.db.query('GRANT SELECT,INSERT ON public.bz_manual_bids,public.bz_bid_receipts TO '+f.runtimeRole);
   await f.db.query('GRANT SELECT ON public.bz_demo_event_entries TO '+f.runtimeRole);
   for(const signature of ['public.bz_demo_begin(uuid,uuid,text)','public.bz_demo_enroll(uuid,uuid,text,text,text,text,text,text)','public.bz_demo_acknowledge(uuid,uuid,text)'])await f.db.query('GRANT EXECUTE ON FUNCTION '+signature+' TO '+f.runtimeRole);
   for(const signature of ['public.bz_staff_event_entry_read(text,uuid)','public.bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)'])await f.db.query('GRANT EXECUTE ON FUNCTION '+signature+' TO '+f.runtimeRole);
   let exists=false;try{await access(join(f.repo,migration));exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
   f.migrationPresent=exists;
   // Never supply substitute ASSETS DDL/functions on the release baseline.
   // Candidate migration must create its own objects. Role names are portable;
   // concrete staging role grants remain a separate reviewed operator action.
   const definitions=()=>f.db.query("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.oid::regprocedure::text").then(r=>r.rows);
   f.inheritedSqlBefore=await definitions();
   // Disposable adversarial default grants must be neutralized by candidate
   // creation itself; setup never repairs PUBLIC/runtime asset ACLs afterward.
   if(exists){await f.db.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+f.migratorRole+' IN SCHEMA public GRANT ALL ON TABLES TO '+f.runtimeRole+',PUBLIC');}
   const permissionSnapshot=async()=>({
     relations:(await f.db.query("SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') AND c.relname<>'bz_staff_assets' ORDER BY c.relname")).rows,
     columns:(await f.db.query("SELECT c.relname,a.attnum,a.attname,a.attacl::text AS acl FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'bz_staff_assets' AND c.relkind IN ('r','p','v','m','S','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum")).rows,
     defaults:(await f.db.query("SELECT pg_get_userbyid(d.defaclrole) AS owner,n.nspname,d.defaclobjtype,d.defaclacl::text AS acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY owner,n.nspname,d.defaclobjtype")).rows,
     memberships:(await f.db.query("SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY role,member,grantor")).rows,
     roles:(await f.db.query('SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles ORDER BY rolname')).rows,
   });
   f.inheritedPermissionBefore=await permissionSnapshot();
   if(exists){await f.db.query('SET ROLE '+f.migratorRole);try{await f.db.query(await readFile(join(f.repo,migration),'utf8'));}finally{await f.db.query('RESET ROLE');}}
   f.inheritedPermissionAfter=await permissionSnapshot();
   const afterDefinitions=await definitions();f.inheritedSqlAfter=afterDefinitions.filter(row=>f.inheritedSqlBefore.some(old=>old.signature===row.signature));
   const table=(await f.db.query("SELECT to_regclass('public.bz_staff_assets') AS value")).rows[0].value;
   // No asset table grant/revoke here: evidence must observe candidate ACLs,
   // never repair an insecure migration before checking it.
   for(const signature of functions){const row=(await f.db.query('SELECT to_regprocedure($1) AS value',[signature])).rows[0];
     if(row.value)await f.db.query('GRANT EXECUTE ON FUNCTION '+signature+' TO '+f.runtimeRole);}
   f.sqlRuntime=async(text,values=[])=>{await f.runtimeDB.query('BEGIN');try{const r=await f.runtimeDB.query(text,values);await f.runtimeDB.query('COMMIT');return r;}
     catch(e){await f.runtimeDB.query('ROLLBACK').catch(()=>{});throw e;}};
   try{result=await run(f);return result;}finally{
     for(const b of owned.browsers)if(b.isConnected())await b.close();
     for(const c of owned.connections)await c.end();
   }
 },output,{onInterrupt:closeExtras});}finally{
   // The scoped registry verifies owned app/PG identities before removal;
   // close explicitly tracked extra clients/browser before its callback exits.
   // OWNED_SERVICES.json proves detached groups/listeners, not only ports.
   for(const b of owned.browsers)if(b.isConnected())await b.close().catch(()=>{});
   for(const c of owned.connections)await c.end().catch(()=>{});
   if(owned.scratch){let present=false;try{await access(owned.scratch);present=true;}catch(e){if(e.code!=='ENOENT')throw e;}
     if(present)throw new HarnessError('Owned disposable cluster directory survived cleanup.');}
 }
}
export async function bounded(promise,ms=8000){
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new HarnessError('Uncontrolled concurrency deadline:99.')),ms);})]);}finally{clearTimeout(timer);}
}
export async function waitBlocked(f,match,ms=2500){
 const end=Date.now()+ms;while(Date.now()<end){const rows=(await f.db.query("SELECT pid,query,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'")).rows;
   const row=rows.find(match);if(row)return row;await new Promise(resolve=>setTimeout(resolve,20));}
 throw new HarnessError('Required controlled DB lock wait was not witnessed:99.');
}
