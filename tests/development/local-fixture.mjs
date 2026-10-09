// Disposable per-process PostgreSQL fixture, never a provider/shared database.
import { registerHooks } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import pg from 'pg';

export const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)));
registerHooks({resolve(specifier, context, next) {
  if (specifier === 'server-only') return {url:'data:text/javascript,export{}',shortCircuit:true};
  if(specifier.startsWith('.') && context.parentURL?.includes('/src/server/')) {
    const url=new URL(specifier+'.ts',context.parentURL);
    if(existsSync(fileURLToPath(url))) return next(url.href,context);
  }
  return next(specifier,context);
}});
const pools=new Set(), connect=pg.Pool.prototype.connect;
pg.Pool.prototype.connect=function(...args){pools.add(this);return connect.apply(this,args);};
export const sha = value => createHash('sha256').update(value).digest('hex');
export async function localFixture(name, migrations) {
  if(!/^bz_test_[a-z_]+$/.test(name)) throw Error('Disposable database name required');
  const root=await mkdtemp(join(tmpdir(),name+'-')), cluster=join(root,'cluster');
  const pgBin='/opt/homebrew/opt/postgresql@18/bin';
  const portServer=createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));
  const port=portServer.address().port;await new Promise(r=>portServer.close(r));
  let started=false,admin,pid;
  const clients=new Set(),report={name,root,node:process.version,cases:[],source:{},cleanup:{}};
  const user=userInfo().username;
  async function client(runtime=false) {
    const c=new pg.Client({host:'127.0.0.1',port,database:name,user:runtime?'fixture_runtime':user,
      ...(runtime?{password:'disposable-only'}:{}),query_timeout:6000});
    await c.connect();await c.query("SET statement_timeout='5s'");clients.add(c);return c;
  }
  async function close() {
    await Promise.allSettled([...pools].map(p=>p.end()));
    await Promise.allSettled([...clients].map(c=>c.end()));
    if(admin)await admin.end().catch(()=>{});
    if(started)execFileSync(join(pgBin,'pg_ctl'),['-D',cluster,'-m','fast','-w','stop'],{stdio:'pipe'});
    let absent=true;if(pid)try{process.kill(pid,0);absent=false;}catch(e){if(e.code!=='ESRCH')throw e;}
    await rm(cluster,{recursive:true,force:true});report.cleanup={stopped:started,pid,processAbsent:absent,clusterRemoved:true};
    await writeFile(join(root,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
    if(!absent)throw Error('Owned fixture process remains');
    console.log('Receipt '+join(root,'RESULT.json'));
  }
  try {
    execFileSync(join(pgBin,'initdb'),['-D',cluster,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe',env:{...process.env,LC_ALL:'C',LANG:'C'}});
    execFileSync(join(pgBin,'pg_ctl'),['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start'],{stdio:'pipe'});started=true;
    pid=Number((await readFile(join(cluster,'postmaster.pid'),'utf8')).split('\n')[0]);
    admin=new pg.Client({host:'127.0.0.1',port,database:'postgres',user});await admin.connect();
    await admin.query('CREATE DATABASE '+name);await admin.end();admin=await client();
    report.postgres=(await admin.query('SELECT version() AS version')).rows[0].version;
    for(const file of migrations) {
      const bytes=readFileSync(join(repo,'migrations',file));report.source['migrations/'+file]=sha(bytes);await admin.query(bytes.toString());
    }
    await admin.query("CREATE ROLE fixture_runtime LOGIN PASSWORD 'disposable-only'; GRANT USAGE ON SCHEMA public TO fixture_runtime");
    await admin.query(`GRANT SELECT ON bz_orgs,bz_people,bz_staff_grants,bz_event_view_grants,
      bz_businesses,bz_business_person_memberships,bz_org_business_memberships,bz_event_bidder_admissions TO fixture_runtime;
      GRANT SELECT,INSERT,UPDATE ON bz_sessions TO fixture_runtime;
      GRANT SELECT,INSERT,UPDATE,DELETE ON bz_events,bz_lots TO fixture_runtime;
      GRANT SELECT,INSERT ON bz_requests,bz_catalog_approvals,bz_catalog_lots,bz_manual_bids,bz_bid_receipts TO fixture_runtime;
      GRANT SELECT,INSERT,UPDATE ON bz_lot_standing TO fixture_runtime`);
    // PostgreSQL row SHARE locks need UPDATE privilege on at least one column.
    // Use the established harmless lock_marker column, never authority columns.
    await admin.query(`GRANT UPDATE(lock_marker) ON bz_orgs,bz_people,bz_staff_grants,bz_event_view_grants,
      bz_businesses,bz_business_person_memberships,bz_org_business_memberships,bz_event_bidder_admissions TO fixture_runtime`);
    Object.assign(process.env,{BIDZIZI_APP_MODE:'local-test',BIDZIZI_STAGING_TEST_AUTH:'true',BIDZIZI_LOCAL_TEST_DATABASE:'true',
      APP_ORIGIN:'http://127.0.0.1:43877',DATABASE_URL:`postgres://fixture_runtime:disposable-only@127.0.0.1:${port}/${name}`});
    return {admin,client,close,report,root,port};
  }catch(error){report.setupError=error.message;await close();throw error;}
}
export function request(token, value, method='POST') {
  return new Request('http://127.0.0.1:43877/test',{method:value===undefined?'GET':method,
    headers:{host:'127.0.0.1:43877',origin:'http://127.0.0.1:43877',...(token?{cookie:'bz_session='+token}:{}),'content-type':'application/json'},
    ...(value===undefined?{}:{body:JSON.stringify(value)})});
}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function waitOn(client,fragment) {
  const until=Date.now()+2500;
  while(Date.now()<until){const rows=(await client.query("SELECT query,wait_event_type FROM pg_stat_activity WHERE query LIKE $1 AND wait_event_type='Lock'",['%'+fragment+'%'])).rows;
    if(rows.length)return rows;await sleep(10);}
  throw Error('Expected database wait was not witnessed');
}
export function sourceHash(path){return sha(readFileSync(join(repo,path)));}
