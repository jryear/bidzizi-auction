// Reviewed additive installation into the already-bound synthetic demo only.
// Default is read-only; --apply performs one atomic migration/grant transaction.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const apply=process.argv.includes('--apply'),role='staging_e2e_app',ownerRole='staging_e2e_owner';
const files=['015_staff_event_entry.sql','016_staging_staff_assets.sql','018_attendee_activity_donations.sql','019_staff_bidder_operations.sql'];
const entries=['bz_staff_event_entry_read(text,uuid)','bz_staff_event_entry_set(text,uuid,integer,boolean,uuid)',
 'bz_staff_asset_put(text,uuid,uuid,text,integer,text,bytea,integer,integer)','bz_staff_asset_recover(text,uuid,uuid)',
 'bz_staff_asset_validate(text,uuid,uuid[])','bz_staff_asset_read(text,uuid,uuid,text,uuid)',
 'bz_attendee_activity(text,uuid,text,jsonb)','bz_donation_member(text,uuid,text,jsonb)','bz_donation_staff(text,uuid,text,jsonb)',
 'bz_staff_bidder_list(text,uuid)','bz_staff_bidder_set(text,uuid,uuid,uuid,integer,text,boolean)'];
const helpers=['bz_asset_authority_mutation_gate()','bz_staff_asset_immutable()',
 'bz_activity_authority(text,uuid,boolean)','bz_activity_fresh(text,uuid,uuid,boolean)','bz_donation_eligible(uuid,uuid,uuid)'];
const privateTables=['bz_staff_event_entry_requests','bz_staff_assets','bz_attendee_watches','bz_attendee_watch_requests',
 'bz_donation_settings','bz_donation_nonprofits','bz_donation_pledges','bz_staff_bidder_controls'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let client,committed=false;
try{
 const binding=JSON.parse(await readFile('docs/evidence/overnight-release/HOSTED_BINDING_BEFORE.json','utf8'));
 if(binding.projectId!=='prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP'||binding.origin!=='https://staging.bidzizi.com'||
  binding.ownerIdentity.database!=='bz_staging_e2e'||binding.runtimeIdentity.role!==role||!binding.diagnosticSessionRevoked)throw Error('binding');
 const url=new URL((await readFile('/tmp/bidzizi-staging-e2e-secrets/owner-url','utf8')).trim());
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
 client=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:20000});
 await client.connect();await client.query(apply?'BEGIN':'BEGIN READ ONLY');await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='15s'");
 const identity=(await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
 if(identity.database!=='bz_staging_e2e'||identity.role!==ownerRole)throw Error('identity');
 const runtime=(await client.query(`SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,
  pg_has_role($1,$2,'MEMBER') AS owner_member FROM pg_roles WHERE rolname=$1`,[role,ownerRole])).rows[0];
 if(!runtime||runtime.rolsuper||runtime.rolcreaterole||runtime.rolcreatedb||runtime.rolbypassrls||runtime.owner_member)throw Error('runtime boundary');
 for(const table of Object.keys(binding.baseline)){
  if(!/^bz_[a-z_]+$/.test(table))throw Error('unexpected baseline relation');
  const row=(await client.query(`SELECT count(*)::int AS count,COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS bytes FROM ${table} t`)).rows[0];
  if(row.count!==binding.baseline[table].count||sha(row.bytes)!==binding.baseline[table].sha256)throw Error('existing records drifted');
 }
 const state=(await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bz_demo_event_entries' AND column_name='entry_revision') AS entry,
  to_regclass('public.bz_staff_assets') IS NOT NULL AS assets,to_regclass('public.bz_attendee_watches') IS NOT NULL AS activity,
  to_regclass('public.bz_staff_bidder_controls') IS NOT NULL AS bidders`)).rows[0];
 if(Object.values(state).some(Boolean))throw Error('installation already present or partial');
 const migrationSources={},sql=[];
 for(const name of files){const bytes=await readFile('migrations/'+name),source=bytes.toString();migrationSources[name]=sha(bytes);
  if(!/^BEGIN;\s/.test(source)||!(/COMMIT;\s*$/.test(source)))throw Error('migration wrapper');
  sql.push(source.replace(/^BEGIN;\s/,'').replace(/COMMIT;\s*$/,''));}
 const report={checkedAt:new Date().toISOString(),nodeVersion:process.version,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  projectId:binding.projectId,origin:binding.origin,scope:'existing synthetic demo only',identity,runtime,verifiedTLS:true,
  applied:apply,migrations:migrationSources,authority:'016 preserved; 017 explicitly held by Junior',before:binding.baseline};
 if(apply){
  execFileSync('git',['diff','--quiet','--','migrations','src','public','package.json','pnpm-lock.yaml']);
  for(const source of sql)await client.query(source);
  for(const signature of [...entries,...helpers])await client.query(`REVOKE ALL ON FUNCTION public.${signature} FROM ${role}`);
  for(const signature of entries)await client.query(`GRANT EXECUTE ON FUNCTION public.${signature} TO ${role}`);
  const functionChecks=[];
  for(const signature of [...entries,...helpers]){
   const row=(await client.query(`SELECT p.oid::regprocedure::text AS signature,r.rolname AS owner,p.prosecdef,p.proconfig,
    has_function_privilege($1,p.oid,'EXECUTE') AS runtime_execute,
    EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$2::regprocedure`,[role,'public.'+signature])).rows[0];
   if(!row||row.owner!==ownerRole||entries.includes(signature)&&!row.prosecdef||row.runtime_execute!==entries.includes(signature)||row.public_execute||
    !row.proconfig?.some(v=>v==='search_path=pg_catalog'||v==='search_path=pg_catalog, pg_temp'))throw Error('function privileges');
   functionChecks.push(row);
  }
  const tableChecks=[];
  for(const table of privateTables){const row=(await client.query(`SELECT $2::text AS name,
   has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER') AS table_access,
   has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access`,[role,'public.'+table])).rows[0];
   if(row.table_access||row.column_access)throw Error('private table privileges');tableChecks.push(row);}
  const after={};for(const table of Object.keys(binding.baseline)){
   const row=(await client.query(`SELECT count(*)::int AS count,COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS bytes FROM ${table} t`)).rows[0];
   after[table]={count:row.count,sha256:sha(row.bytes)};if(JSON.stringify(after[table])!==JSON.stringify(binding.baseline[table]))throw Error('existing records changed');}
  report.after=after;report.existingRecordsUnchanged=true;report.functions=functionChecks;report.privateTables=tableChecks;
  await client.query('COMMIT');committed=true;
 }else await client.query('ROLLBACK');
 await mkdir('docs/evidence/overnight-release',{recursive:true});
 const path='docs/evidence/overnight-release/'+(apply?'ADDITIVE_INSTALL.json':'MIGRATION_PREFLIGHT.json');
 await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({path,identity,runtime,applied:apply,migrations:migrationSources,existingRecordsUnchanged:report.existingRecordsUnchanged??null}));
}catch{console.error(committed?'Demo migration committed but receipt save failed; inspect exact database state before retry.':'Demo migration preflight/installation failed; transaction rolled back and private inputs withheld.');process.exitCode=1;}
finally{if(client){if(!committed)await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}}
