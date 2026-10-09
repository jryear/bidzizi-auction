// Read-only, post-COMMIT verification of the already-bound demonstration DB.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const sha=v=>createHash('sha256').update(v).digest('hex');
const clients=[];
try{
 const installed=JSON.parse(await readFile('docs/evidence/overnight-release/ADDITIVE_INSTALL.json','utf8'));
 if(!installed.applied||!installed.existingRecordsUnchanged||installed.projectId!=='prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP'||installed.origin!=='https://staging.bidzizi.com'||installed.identity.database!=='bz_staging_e2e'||installed.identity.role!=='staging_e2e_owner')throw Error('binding');
 for(const [file,hash] of Object.entries(installed.migrations)){
  if(!/^0(?:15|16|18|19)_[a-z_]+\.sql$/.test(file)||sha(await readFile('migrations/'+file))!==hash)throw Error('migration source');
 }
 async function connect(file,role){
  const url=new URL((await readFile('/tmp/bidzizi-staging-e2e-secrets/'+file,'utf8')).trim());
  for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])url.searchParams.delete(key);
  const c=new pg.Client({connectionString:url.href,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:15000});
  await c.connect();clients.push(c);
  const identity=(await c.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  if(identity.database!=='bz_staging_e2e'||identity.role!==role)throw Error('identity');
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');return c;
 }
 const owner=await connect('owner-url','staging_e2e_owner');
 const records={};for(const [table,before] of Object.entries(installed.allExistingAfter)){
  if(!/^bz_[a-z_]+$/.test(table))throw Error('relation');
  const value=table==='bz_demo_event_entries'?"to_jsonb(t)-'entry_revision'-'updated_at'-'updated_by'":'to_jsonb(t)';
  const row=(await owner.query(`SELECT count(*)::int AS count,COALESCE(jsonb_agg(${value} ORDER BY (${value})::text),'[]'::jsonb)::text AS bytes FROM ${table} t`)).rows[0];
  records[table]={count:row.count,sha256:sha(row.bytes)};
  if(JSON.stringify(records[table])!==JSON.stringify(before))throw Error('record drift');
 }
 const functions=[];for(const expected of installed.functions){
  const row=(await owner.query(`SELECT p.oid::regprocedure::text AS signature,r.rolname AS owner,p.prosecdef,p.proconfig,
   has_function_privilege('staging_e2e_app',p.oid,'EXECUTE') AS runtime_execute,
   EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
   FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$1::regprocedure`,[expected.signature])).rows[0];
  if(JSON.stringify(row)!==JSON.stringify(expected))throw Error('function drift');functions.push(row);
 }
 const held=(await owner.query("SELECT to_regprocedure('public.bz_asset_authority_mutation_gate()') IS NOT NULL AS original_gate_retained")).rows[0];
 if(!held.original_gate_retained)throw Error('held authority successor');
 const runtime=await connect('runtime-url','staging_e2e_app');
 const privateTables=[];for(const expected of installed.privateTables){
  const row=(await runtime.query(`SELECT $1::text AS name,
   has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER') AS table_access,
   has_any_column_privilege(current_user,$1,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access`,[expected.name])).rows[0];
  if(JSON.stringify(row)!==JSON.stringify(expected))throw Error('table privilege drift');privateTables.push(row);
 }
 let directPrivateReadDenied=false;
 try{await runtime.query('SELECT * FROM public.bz_donation_pledges LIMIT 1');}catch(e){if(e.code==='42501')directPrivateReadDenied=true;else throw e;}
 if(!directPrivateReadDenied)throw Error('private read');
 const report={checkedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),nodeVersion:process.version,
  scope:'read-only post-COMMIT verification of existing synthetic demo',projectId:installed.projectId,origin:installed.origin,
  verifiedTLS:true,existingRecordsUnchanged:true,records,functions,privateTables,directPrivateReadDenied,...held};
 const stdoutOnly=process.argv.includes('--stdout'),path='docs/evidence/overnight-release/ADDITIVE_READBACK.json';
 if(!stdoutOnly)await writeFile(path,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...(stdoutOnly?{readOnly:true,receiptWritten:false,checkedAt:report.checkedAt,sourceCommit:report.sourceCommit,projectId:report.projectId,origin:report.origin,database:'bz_staging_e2e',ownerRole:'staging_e2e_owner',runtimeRole:'staging_e2e_app',verifiedTLS:true}:{path}),existingRecordsUnchanged:true,directPrivateReadDenied,originalGateRetained:true,functions:functions.length,privateTables:privateTables.length}));
}catch{console.error('Read-only demo installation verification failed; private inputs withheld.');process.exitCode=1;}
finally{for(const c of clients){await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}}
