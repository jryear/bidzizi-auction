// Snapshot only an owned disposable loopback rehearsal. Never provider state.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {userInfo} from 'node:os';
import {createHash} from 'node:crypto';
import pg from 'pg';
const path=process.argv[2],d=JSON.parse(await readFile(path,'utf8'));
if(d.scope!=='disposable local synthetic event rehearsal'||d.origin!=='http://127.0.0.1:43981'||
  dirname(d.sourceRoot)!==dirname(path)||!Number.isInteger(d.port)||d.port<=1024||d.port===5432)throw Error('Owned rehearsal descriptor required');
process.kill(d.runtimePid,0);process.kill(d.postgresPid,0);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const client=new pg.Client({host:'127.0.0.1',port:d.port,user:userInfo().username,database:'bz_test_integrated_v1'});
try{
  await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity=(await client.query('SELECT current_database() AS database')).rows[0];
  if(identity.database!=='bz_test_integrated_v1')throw Error('Unexpected rehearsal database');
  const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const preservedTables={};
  for(const {tablename:table} of tables){
    if(!/^bz_[a-z_]+$/.test(table))throw Error('Unexpected rehearsal relation');
    const row=(await client.query(`SELECT count(*)::int AS count,COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text AS bytes FROM ${table} t`)).rows[0];
    preservedTables[table]={count:row.count,sha256:sha(row.bytes)};
  }
  const dump=join(dirname(path),'REHEARSAL_DATA.dump');
  execFileSync('/opt/homebrew/opt/postgresql@18/bin/pg_dump',['--data-only','--format=custom','--no-owner','--no-privileges',
    '--host','127.0.0.1','--port',String(d.port),'--username',userInfo().username,'--dbname','bz_test_integrated_v1',
    '--snapshot',snapshot,'--file',dump],{stdio:'pipe'});
  await chmod(dump,0o600);await client.query('COMMIT');
  const restore=join(dirname(path),'RESTORE.json');
  await writeFile(restore,JSON.stringify({...d,preservedTables,dumpSha256:sha(await readFile(dump))},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({restore,sourceCommit:d.sourceCommit,tables:Object.fromEntries(Object.entries(preservedTables).map(([name,v])=>[name,v.count]))}));
}finally{await client.end();}
