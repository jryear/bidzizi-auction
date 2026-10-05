import fs from 'node:fs';
import pg from 'pg';

// Operator-only. This command never runs inside the application or build.
if(process.env.BIDZIZI_MIGRATION_TARGET!=='br-autumn-surf-arrxv906'||!process.env.BIDZIZI_MIGRATION_URL_FILE)throw Error('Confirm the isolated staging migration target.');
const connection=new URL(fs.readFileSync(process.env.BIDZIZI_MIGRATION_URL_FILE,'utf8').trim());
if(connection.hostname!=='ep-shiny-mountain-ar1x2qwa-pooler.c-4.us-west-2.aws.neon.tech'||connection.pathname!=='/bz_staging_e2e'||connection.username!=='staging_e2e_owner')throw Error('Refusing a database outside the isolated staging boundary.');
for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])connection.searchParams.delete(key);
const client=new pg.Client({connectionString:connection.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:15000});
try{
 await client.connect();
 const role=(await client.query('SELECT current_user AS role,current_database() AS database')).rows[0];
 if(role.role!=='staging_e2e_owner'||role.database!=='bz_staging_e2e')throw Error('Unexpected migration identity.');
 await client.query(fs.readFileSync('migrations/002_staging_catalog.sql','utf8'));
 await client.query('BEGIN');
 await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM staging_e2e_app');
 await client.query('GRANT SELECT ON bz_orgs,bz_people,bz_staff_grants,bz_event_view_grants TO staging_e2e_app');
 for(const table of ['bz_orgs','bz_people','bz_staff_grants','bz_event_view_grants'])await client.query('GRANT UPDATE(lock_marker) ON '+table+' TO staging_e2e_app');
 await client.query('GRANT SELECT,INSERT ON bz_sessions TO staging_e2e_app; GRANT UPDATE(revoked_at) ON bz_sessions TO staging_e2e_app');
 await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON bz_events,bz_lots TO staging_e2e_app');
 await client.query('GRANT SELECT,INSERT ON bz_requests,bz_catalog_approvals,bz_catalog_lots TO staging_e2e_app');
 await client.query('COMMIT');
 console.log('Applied catalog002 on the approved isolated branch; runtime authority fields and approved snapshots are read-only. No viewer grants, catalog approvals, bids or production data were created.');
}catch{
 await client.query('ROLLBACK').catch(()=>{});
 console.error('Isolated catalog migration failed; database diagnostics withheld.');process.exitCode=99;
}finally{await client.end().catch(()=>{});}
