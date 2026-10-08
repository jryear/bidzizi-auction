// Operator-only installer. This revision deliberately permits owned disposable local DBs only.
// No shared/provider install is authorized by the local demo implementation.
import fs from 'node:fs';
import pg from 'pg';
let client;
const requireFact=x=>{if(!x)throw Error('Disposable operator boundary refused.');};
try{
 const file=process.env.BIDZIZI_MIGRATION_URL_FILE,runtime=process.env.BIDZIZI_DEMO_RUNTIME_ROLE,event=process.env.BIDZIZI_DEMO_EVENT_ID;
 requireFact(process.env.BIDZIZI_MIGRATION_TARGET==='local-demo-only'&&file&&runtime&&event);
 const stat=fs.lstatSync(file);requireFact(stat.isFile()&&(stat.mode&0o077)===0);
 const connection=new URL(fs.readFileSync(file,'utf8').trim());
 requireFact(['postgres:','postgresql:'].includes(connection.protocol)&&connection.hostname==='127.0.0.1'&&Number(connection.port)>1024&&Number(connection.port)!==5432&&/^\/bz_test_[a-z0-9_]+$/.test(connection.pathname)&&/^migration_[a-f0-9]+$/.test(connection.username)&&connection.password&&!connection.search);
 requireFact(/^runtime_[a-f0-9]+$/.test(runtime)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(event));
 client=new pg.Client({connectionString:connection.toString(),ssl:false,connectionTimeoutMillis:5000,query_timeout:5000});await client.connect();
 const identity=(await client.query('SELECT current_user role,current_database() database')).rows[0];requireFact(identity.role===connection.username&&'/'+identity.database===connection.pathname);
 const role=(await client.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1',[runtime])).rows[0];requireFact(role&&Object.values(role).every(v=>v===false));
 const bound=(await client.query('SELECT e.org_id,p.is_test FROM bz_events e JOIN bz_people p ON p.id=e.created_by WHERE e.id=$1',[event])).rows[0];requireFact(bound&&bound.is_test===true);
 await client.query(fs.readFileSync(new URL('../migrations/009_demo_attendee_entry.sql',import.meta.url),'utf8'));
 await client.query('BEGIN');
 await client.query('REVOKE ALL ON bz_demo_event_entries,bz_demo_entry_slots FROM '+runtime);
 await client.query('GRANT SELECT ON bz_demo_event_entries TO '+runtime);
 for(const signature of ['bz_demo_begin(uuid,uuid,text)','bz_demo_enroll(uuid,uuid,text,text,text,text,text,text)','bz_demo_acknowledge(uuid,uuid,text)'])await client.query('GRANT EXECUTE ON FUNCTION '+signature+' TO '+runtime);
 const prior=(await client.query('SELECT org_id,enabled FROM bz_demo_event_entries WHERE event_id=$1 FOR UPDATE',[event])).rows[0];requireFact(!prior||(prior.org_id===bound.org_id&&prior.enabled));
 if(!prior)await client.query('INSERT INTO bz_demo_event_entries(event_id,org_id,enabled) VALUES($1,$2,true)',[event,bound.org_id]);
 for(const table of ['bz_demo_entry_slots','bz_people','bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_view_grants','bz_event_bidder_admissions','bz_staff_grants']){
  for(const privilege of table==='bz_demo_entry_slots'?['SELECT','INSERT','UPDATE','DELETE']:['INSERT','DELETE'])requireFact((await client.query('SELECT has_table_privilege($1,$2,$3) allowed',[runtime,table,privilege])).rows[0].allowed===false);
 }
 await client.query('COMMIT');console.log(JSON.stringify({scope:'owned-disposable-local-demo',migration:'009_demo_attendee_entry.sql',eventId:event,entryEnabled:true,authorityWrites:'bounded definer only',providerEffects:false}));
}catch{await client?.query('ROLLBACK').catch(()=>{});console.error('Local demo installer refused or failed; connection values and diagnostics withheld.');process.exitCode=99;}
finally{await client?.end().catch(()=>{});}
