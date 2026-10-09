// Read-only, post-COMMIT verification of the already-bound demonstration DB.
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
const sha=v=>createHash('sha256').update(v).digest('hex');
const clients=[];
const keyPath='/tmp/bidzizi-overnight-release-secrets/original-record-keys.json';
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
 let originalKeys=null;
 try{originalKeys=JSON.parse(await readFile(keyPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(originalKeys&&(originalKeys.projectId!==installed.projectId||originalKeys.baselineSha256!==sha(JSON.stringify(installed.allExistingAfter))))throw Error('preservation key binding');
 const preserveKeys=process.argv.includes('--preserve-existing-keys');
 if(preserveKeys&&originalKeys)throw Error('preservation keys already present');
 const capturedKeys={projectId:installed.projectId,baselineSha256:sha(JSON.stringify(installed.allExistingAfter)),tables:{}};
 const records={};for(const [table,before] of Object.entries(installed.allExistingAfter)){
  if(!/^bz_[a-z_]+$/.test(table))throw Error('relation');
  const value=table==='bz_demo_event_entries'?"to_jsonb(t)-'entry_revision'-'updated_at'-'updated_by'":'to_jsonb(t)';
  const columns=(await owner.query(`SELECT a.attname FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,n)
   JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.n`,['public.'+table])).rows.map(r=>r.attname);
  if(!columns.length||columns.some(c=>!/^[_a-z][_a-z0-9]*$/.test(c)))throw Error('primary key');
  const keyExpression='jsonb_build_object('+columns.map(c=>`'${c}',t.${c}`).join(',')+')';
  const saved=originalKeys?.tables[table];
  if(originalKeys&&(!saved||JSON.stringify(saved.columns)!==JSON.stringify(columns)||saved.keys.length!==before.count))throw Error('preservation key scope');
  const where=saved?` WHERE EXISTS(SELECT 1 FROM jsonb_array_elements($1::jsonb) k WHERE ${keyExpression}=k)`:'';
  const row=(await owner.query(`SELECT count(*)::int AS count,COALESCE(jsonb_agg(${value} ORDER BY (${value})::text),'[]'::jsonb)::text AS bytes FROM ${table} t${where}`,saved?[JSON.stringify(saved.keys)]:[])).rows[0];
  records[table]={count:row.count,sha256:sha(row.bytes)};
  if(JSON.stringify(records[table])!==JSON.stringify(before))throw Error('record drift');
  if(preserveKeys)capturedKeys.tables[table]={columns,keys:(await owner.query(`SELECT ${keyExpression} AS key FROM ${table} t`)).rows.map(r=>r.key)};
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
 if(preserveKeys){await writeFile(keyPath,JSON.stringify(capturedKeys)+'\n',{mode:0o600,flag:'wx'});await chmod(keyPath,0o600);}
 const report={checkedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),nodeVersion:process.version,
  scope:'read-only post-COMMIT verification of existing synthetic demo',projectId:installed.projectId,origin:installed.origin,
  verifiedTLS:true,existingRecordsUnchanged:true,recordComparison:originalKeys?'All original record keys; additional authorized demo records allowed.':'Complete pre-exercise tables.',records,functions,privateTables,directPrivateReadDenied,...held};
 const stdoutOnly=process.argv.includes('--stdout'),path='docs/evidence/overnight-release/ADDITIVE_READBACK.json';
 if(!stdoutOnly)await writeFile(path,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...(stdoutOnly?{readOnly:!preserveKeys,databaseReadOnly:true,receiptWritten:false,checkedAt:report.checkedAt,sourceCommit:report.sourceCommit,projectId:report.projectId,origin:report.origin,database:'bz_staging_e2e',ownerRole:'staging_e2e_owner',runtimeRole:'staging_e2e_app',verifiedTLS:true}:{path}),existingRecordsUnchanged:true,recordComparison:report.recordComparison,privatePreservationKeysCreated:preserveKeys,directPrivateReadDenied,originalGateRetained:true,functions:functions.length,privateTables:privateTables.length}));
}catch{console.error('Read-only demo installation verification failed; private inputs withheld.');process.exitCode=1;}
finally{for(const c of clients){await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}}
