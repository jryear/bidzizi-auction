import fs from 'node:fs';
import pg from 'pg';

// Operator-only, synthetic setup. Never called by the application or build.
const suffix = (prefix,n) => prefix + String(n).padStart(12,'0');
const org = n => suffix('10000000-0000-4000-8000-',n);
const person = n => suffix('20000000-0000-4000-8000-',n);
const business = n => suffix('30000000-0000-4000-8000-',n);
const organizations = [[org(1),'Saturn Barter','SB'],[org(2),'Pine Street Exchange','PE']];
const people = [
 ['staff-saturn','Test Saturn Staff'],['staff-pine','Test Pine Staff'],
 ['bidder-juniper','Test Juniper Bidder'],['bidder-harbor','Test Harbor Bidder'],
 ['bidder-juniper-coworker','Test Juniper Coworker'],['bidder-member','Test Member Only'],
 ['bidder-viewer','Test View Only'],['bidder-unlisted','Test Unlisted Person'],
 ['bidder-pine','Test Pine Bidder'],['bidder-bid-only','Test Bid Only'],
].map(([alias,name],i)=>[person(i+1),alias,name]);
const businesses = [[business(1),'Juniper Studio'],[business(2),'Harbor Company'],[business(3),'Pine Company']];
const memberships = [[3,1],[4,2],[5,1],[6,1],[7,1],[9,3],[10,1]].map(([p,b])=>[person(p),business(b)]);
const networks = [[org(1),business(1)],[org(1),business(2)],[org(2),business(3)]];
const grants = [[person(1),org(1)],[person(2),org(2)]];
let client;
const added={organizations:0,people:0,businesses:0,memberships:0,networks:0,staffGrants:0};
function requireFact(value) { if(!value)throw Error('Synthetic setup conflicts with existing rows; refusing to replace authority.'); }
try {
 const file=process.env.BIDZIZI_MIGRATION_URL_FILE;
 requireFact(process.env.BIDZIZI_MIGRATION_TARGET==='br-autumn-surf-arrxv906'&&file);
 requireFact((fs.statSync(file).mode&0o077)===0);
 const connection=new URL(fs.readFileSync(file,'utf8').trim());
 requireFact(connection.hostname==='ep-shiny-mountain-ar1x2qwa-pooler.c-4.us-west-2.aws.neon.tech'&&connection.pathname==='/bz_staging_e2e'&&connection.username==='staging_e2e_owner');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])connection.searchParams.delete(key);
 client=new pg.Client({connectionString:connection.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:15000});
 await client.connect();
 const identity=(await client.query('SELECT current_user AS role,current_database() AS database')).rows[0];
 requireFact(identity.role==='staging_e2e_owner'&&identity.database==='bz_staging_e2e');
 await client.query(fs.readFileSync('migrations/003_staging_manual_bid.sql','utf8'));
 await client.query('BEGIN');
 for(const [id,name,initials] of organizations) {
  const rows=(await client.query('SELECT id,name,initials FROM bz_orgs WHERE id=$1 OR name=$2 FOR UPDATE',[id,name])).rows;
  requireFact(rows.length===0||(rows.length===1&&rows[0].id===id&&rows[0].name===name&&rows[0].initials===initials));
  if(!rows.length){await client.query('INSERT INTO bz_orgs(id,name,initials) VALUES($1,$2,$3)',[id,name,initials]);added.organizations++;}
 }
 for(const [id,alias,name] of people) {
  const rows=(await client.query('SELECT id,alias,name,active,is_test FROM bz_people WHERE id=$1 OR alias=$2 FOR UPDATE',[id,alias])).rows;
  requireFact(rows.length===0||(rows.length===1&&rows[0].id===id&&rows[0].alias===alias&&rows[0].name===name&&rows[0].active&&rows[0].is_test));
  if(!rows.length){await client.query('INSERT INTO bz_people(id,alias,name,active,is_test) VALUES($1,$2,$3,true,true)',[id,alias,name]);added.people++;}
 }
 for(const [id,name] of businesses) {
  const rows=(await client.query('SELECT id,name,active FROM bz_businesses WHERE id=$1 OR name=$2 FOR UPDATE',[id,name])).rows;
  requireFact(rows.length===0||(rows.length===1&&rows[0].id===id&&rows[0].name===name&&rows[0].active));
  if(!rows.length){await client.query('INSERT INTO bz_businesses(id,name,active) VALUES($1,$2,true)',[id,name]);added.businesses++;}
 }
 for(const [p,b] of memberships) {
  const rows=(await client.query('SELECT active,can_bid FROM bz_business_person_memberships WHERE person_id=$1 AND business_id=$2 FOR UPDATE',[p,b])).rows;
  requireFact(rows.length===0||(rows.length===1&&rows[0].active&&rows[0].can_bid));
  if(!rows.length){await client.query('INSERT INTO bz_business_person_memberships(person_id,business_id,active,can_bid) VALUES($1,$2,true,true)',[p,b]);added.memberships++;}
 }
 for(const [o,b] of networks) {
  const rows=(await client.query('SELECT active FROM bz_org_business_memberships WHERE org_id=$1 AND business_id=$2 FOR UPDATE',[o,b])).rows;
  requireFact(rows.length===0||(rows.length===1&&rows[0].active));
  if(!rows.length){await client.query('INSERT INTO bz_org_business_memberships(org_id,business_id,active) VALUES($1,$2,true)',[o,b]);added.networks++;}
 }
 for(const [p,o] of grants) {
  const rows=(await client.query('SELECT active FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2 FOR UPDATE',[p,o])).rows;
  requireFact(rows.length===0||(rows.length===1&&rows[0].active));
  if(!rows.length){await client.query('INSERT INTO bz_staff_grants(person_id,org_id,active) VALUES($1,$2,true)',[p,o]);added.staffGrants++;}
 }
 const m=(await client.query('SELECT person_id,business_id,active,can_bid FROM bz_business_person_memberships WHERE person_id=ANY($1::uuid[]) FOR UPDATE',[people.map(p=>p[0])])).rows;
 requireFact(m.length===memberships.length&&m.every(row=>row.active&&row.can_bid&&memberships.some(([p,b])=>row.person_id===p&&row.business_id===b)));
 const n=(await client.query('SELECT org_id,business_id,active FROM bz_org_business_memberships WHERE business_id=ANY($1::uuid[]) FOR UPDATE',[businesses.map(b=>b[0])])).rows;
 requireFact(n.length===networks.length&&n.every(row=>row.active&&networks.some(([o,b])=>row.org_id===o&&row.business_id===b)));
 const g=(await client.query('SELECT person_id,org_id,active FROM bz_staff_grants WHERE person_id=ANY($1::uuid[]) FOR UPDATE',[people.map(p=>p[0])])).rows;
 requireFact(g.length===grants.length&&g.every(row=>row.active&&grants.some(([p,o])=>row.person_id===p&&row.org_id===o)));
 const runtime=(await client.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname='staging_e2e_app'")).rows[0];
 requireFact(runtime&&Object.values(runtime).every(value=>value===false));
 await client.query('GRANT SELECT ON bz_businesses,bz_business_person_memberships,bz_org_business_memberships,bz_event_bidder_admissions TO staging_e2e_app');
 for(const table of ['bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_bidder_admissions'])await client.query('GRANT UPDATE(lock_marker) ON '+table+' TO staging_e2e_app');
 await client.query('GRANT SELECT,INSERT,UPDATE ON bz_lot_standing TO staging_e2e_app');
 await client.query('GRANT SELECT,INSERT ON bz_manual_bids,bz_bid_receipts TO staging_e2e_app');
 await client.query('COMMIT');
 console.log(JSON.stringify({target:'br-autumn-surf-arrxv906',migration:'003_staging_manual_bid.sql',syntheticMissingRowsInserted:added,existingRowsReplaced:false,eventAdmissionsCreated:false,bidsCreated:false,runtimeAuthorityFields:'read-only'}));
} catch {
 await client?.query('ROLLBACK').catch(()=>{});
 console.error('HARNESS: Isolated synthetic manual-bid setup failed; diagnostics and connection values withheld.');
 process.exitCode=99;
} finally {await client?.end().catch(()=>{});}
