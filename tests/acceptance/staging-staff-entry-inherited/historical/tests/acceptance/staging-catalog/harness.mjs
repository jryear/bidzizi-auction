import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile,readdir,access,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import pg from 'pg';

export class HarnessError extends Error {}
export class ApplicationFailure extends Error {}
export const node24='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
const pgBin='/opt/homebrew/opt/postgresql@18/bin';
const repo=resolve(process.env.VERIFY_ROOT||process.cwd());
const timeoutError=e=>['TimeoutError','AbortError'].includes(e?.name);
export function evidenceExit(e){
  return e instanceof HarnessError || (e instanceof ApplicationFailure && process.env.VERIFY_TREE==='base') ? 99 : 1;
}
export function browserFailure(e){
  if(timeoutError(e))return new ApplicationFailure('Reached browser application exceeded its response deadline.');
  if(/browser.*closed|target.*closed|crash|disconnected|net::ERR_(?:CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|NAME_NOT_RESOLVED)/i.test(e?.message||''))return new HarnessError('Browser or loopback network unavailable.');
  return e;
}
function env(extra={}){
  return {PATH:join(node24,'..')+':'+pgBin+':/usr/bin:/bin',HOME:process.env.HOME||'/tmp/task-root',
    TMPDIR:'/tmp/task-root',LANG:'en_US.UTF-8',NEXT_TELEMETRY_DISABLED:'1',...extra};
}
function command(binary,args,extra={}){
  const r=spawnSync(binary,args,{cwd:repo,env:env(),encoding:'utf8',timeout:60_000,maxBuffer:2*1024*1024,...extra});
  if(r.error||r.status!==0)throw new HarnessError('Disposable setup failed: '+binary.split('/').at(-1)+' ('+(r.error?.code||r.status)+').');
  return r.stdout;
}
async function port(){
  return new Promise((done,reject)=>{
    const s=createServer();
    s.once('error',()=>reject(new HarnessError('Loopback port allocation unavailable.')));
    s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(new HarnessError('Port release failed.')):done(p));});
  });
}
async function stop(child){
  if(!child||child.exitCode!==null)return;
  try{process.kill(-child.pid,'SIGTERM');}catch{}
  await Promise.race([new Promise(done=>child.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);
  if(child.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{}}
}
export async function request(origin,path,{method='GET',json,cookie,headers={}}={}){
  let response,text;
  try{
    response=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(20_000),
      headers:{...(json===undefined?{}:{'content-type':'application/json'}),...headers,...(cookie?{cookie}:{})},
      ...(json===undefined?{}:{body:JSON.stringify(json)})});
    text=await response.text();
  }catch(e){
    if(timeoutError(e))throw new ApplicationFailure('Reached API exceeded its HTTP deadline.');
    throw new HarnessError('Loopback API transport unavailable ('+e.name+').');
  }
  if(response.status===500)throw new ApplicationFailure('Reached API returned HTTP500.');
  let data;try{data=JSON.parse(text);}catch{data=null;}
  return {status:response.status,headers:response.headers,text,data};
}
export async function withFixture(run){
  let files;try{files=await readdir(repo);}catch{throw new HarnessError('Evidence tree unavailable.');}
  if(files.some(n=>/^\.env(?:\.|$)/.test(n)&&n!=='.env.example'))throw new HarnessError('Runtime .env files forbidden in disposable evidence tree.');
  for(const bin of [node24,pgBin+'/initdb',pgBin+'/pg_ctl',pgBin+'/psql']){
    try{await access(bin);}catch{throw new HarnessError('Node24/PostgreSQL18 executable unavailable.');}
  }
  await mkdir('/tmp/task-root',{recursive:true});
  const scratch=await mkdtemp('/tmp/task-root/bz-cat-'),cluster=join(scratch,'pg'),socket=join(scratch,'s');
  const passwordFile=join(scratch,'pw'),dbPort=await port();
  const suffix=randomBytes(6).toString('hex'),dbName='bz_test_'+suffix;
  const migrator='migration_'+suffix,runtime='runtime_'+suffix;
  const adminPassword=randomBytes(24).toString('hex'),migrationPassword=randomBytes(24).toString('hex'),runtimePassword=randomBytes(24).toString('hex');
  const connection={host:'127.0.0.1',port:dbPort,user:'evidence_admin',password:adminPassword,database:'postgres'};
  const migrationUrl='postgresql://'+migrator+':'+migrationPassword+'@127.0.0.1:'+dbPort+'/'+dbName;
  const runtimeUrl='postgresql://'+runtime+':'+runtimePassword+'@127.0.0.1:'+dbPort+'/'+dbName;
  let admin,runtimeDB,app,started=false;
  const children=[];
  try{
    await mkdir(socket);await writeFile(passwordFile,adminPassword,{mode:0o600});
    command(pgBin+'/initdb',['-D',cluster,'-U','evidence_admin','--encoding=UTF8','--no-locale','--auth=scram-sha-256','--pwfile',passwordFile]);
    command(pgBin+'/pg_ctl',['-D',cluster,'-l',join(scratch,'pg.log'),'-o','-h 127.0.0.1 -p '+dbPort+' -k '+socket,'-w','start']);started=true;
    admin=new pg.Client(connection);
    try{
      await admin.connect();
      await admin.query("CREATE ROLE "+migrator+" LOGIN PASSWORD '"+migrationPassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
      await admin.query("CREATE ROLE "+runtime+" LOGIN PASSWORD '"+runtimePassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
      await admin.query('CREATE DATABASE '+dbName+' OWNER '+migrator);
      await admin.query('REVOKE ALL ON DATABASE '+dbName+' FROM PUBLIC');
      await admin.query('GRANT CONNECT ON DATABASE '+dbName+' TO '+runtime);
      await admin.end();admin=new pg.Client({...connection,database:dbName});await admin.connect();
    }catch{throw new HarnessError('Disposable DB/role allocation unavailable.');}
    await admin.query('ALTER SCHEMA public OWNER TO '+migrator+'; REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    for(const name of ['001_staging_staff.sql','002_staging_catalog.sql']){
      const file=join(repo,'migrations',name);
      try{await access(file);}catch{if(name.startsWith('001_'))assert.fail('Existing staff migration is absent.');else continue;}
      const r=spawnSync(pgBin+'/psql',['--dbname',migrationUrl,'-v','ON_ERROR_STOP=1','-f',file],
        {cwd:repo,env:env(),encoding:'utf8',timeout:30_000,maxBuffer:1024*1024});
      if(r.error)throw new HarnessError('Migration runner unavailable ('+r.error.code+').');
      assert.equal(r.status,0,'Candidate migration must execute successfully.');
    }
    await admin.query(await readFile(join(repo,'tests/acceptance/staging-catalog/seed.sql'),'utf8'));
    await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO '+runtime);
    const tables=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);
    for(const name of ['bz_orgs','bz_people','bz_staff_grants','bz_event_view_grants']){
      if(tables.includes(name)){
        await admin.query('GRANT SELECT ON '+name+' TO '+runtime);
        const marker=(await admin.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='lock_marker'",[name])).rows.length;
        if(marker)await admin.query('GRANT UPDATE(lock_marker) ON '+name+' TO '+runtime);
      }
    }
    for(const name of ['bz_events','bz_lots'])await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON '+name+' TO '+runtime);
    for(const name of ['bz_requests','bz_catalog_approvals','bz_catalog_lots']){
      if(tables.includes(name))await admin.query('GRANT SELECT,INSERT ON '+name+' TO '+runtime);
    }
    await admin.query('GRANT SELECT,INSERT ON bz_sessions TO '+runtime+'; GRANT UPDATE(revoked_at) ON bz_sessions TO '+runtime);
    runtimeDB=new pg.Client({connectionString:runtimeUrl});
    try{await runtimeDB.connect();await runtimeDB.query('SELECT 1');}catch{throw new HarnessError('Disposable runtime connection unavailable.');}
    async function start(skew=false){
      const p=await port(),origin='http://127.0.0.1:'+p;
      const child=spawn(node24,[...(skew?['--require',join(repo,'tests/acceptance/staging-catalog/app-clock-skew.cjs')]:[]),join(repo,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(p)],
        {cwd:repo,env:env({DATABASE_URL:runtimeUrl,APP_ORIGIN:origin,BIDZIZI_STAGING_TEST_AUTH:'true',
          BIDZIZI_LOCAL_TEST_DATABASE:'true',BIDZIZI_APP_MODE:'local-test'}),detached:true,stdio:['ignore','pipe','pipe']});
      children.push(child);let output='',timedOut=false;
      child.stdout.on('data',d=>{output=(output+d).slice(-20000);});child.stderr.on('data',d=>{output=(output+d).slice(-20000);});child.on('error',()=>{});
      const deadline=Date.now()+60_000;
      while(Date.now()<deadline){
        if(child.exitCode!==null)throw new HarnessError('Next exited before readiness.');
        let response;try{response=await fetch(origin+'/',{signal:AbortSignal.timeout(3000)});}catch(e){if(timeoutError(e))timedOut=true;}
        if(response){
          if(response.status>=500)throw new ApplicationFailure('Next returned HTTP'+response.status+' during readiness.');
          if(skew && Math.abs(Number(response.headers.get('x-fixed-app-clock-skew-ms'))-365*86400000)>10)throw new HarnessError('App-only Date probe did not reach the HTTP worker.');
          return {origin,child};
        }
        await new Promise(done=>setTimeout(done,200));
      }
      await writeFile(join(scratch,'next.log'),output);
      if(timedOut)throw new ApplicationFailure('Reached Next process missed readiness deadline.');
      throw new HarnessError('Next remained unreachable.');
    }
    app=await start();
    const fixture={
      repo,scratch,db:admin,runtimeDB,runtimeRole:runtime,migratorRole:migrator,
      get origin(){return app.origin;},
      request:(path,options)=>request(app.origin,path,options),
      async restart({skew=false}={}){await stop(app.child);app=await start(skew);},
      async dbNow(){return (await admin.query('SELECT clock_timestamp() AS value')).rows[0].value;},
      async grantViewer(person,event,active=true){
        await admin.query('INSERT INTO bz_event_view_grants(person_id,event_id,active) VALUES($1,$2,$3) ON CONFLICT(person_id,event_id) DO UPDATE SET active=EXCLUDED.active',[person,event,active]);
      },
      async publicationRows(event){
        return {approvals:(await admin.query('SELECT * FROM bz_catalog_approvals WHERE event_id=$1 ORDER BY id',[event])).rows,
          lots:(await admin.query('SELECT * FROM bz_catalog_lots WHERE event_id=$1 ORDER BY position,lot_id',[event])).rows,
          receipts:(await admin.query('SELECT * FROM bz_requests ORDER BY actor_id,operation,request_id')).rows};
      },
      async rejectCatalogInserts(on,lotId){
        if(on){
          assert.match(lotId,/^[0-9a-f-]{36}$/);
          await admin.query("CREATE FUNCTION evidence_catalog_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.lot_id='"+lotId+"'::uuid THEN RAISE EXCEPTION 'FIXED_CATALOG_WRITE_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER evidence_catalog_rejected BEFORE INSERT ON bz_catalog_lots FOR EACH ROW EXECUTE FUNCTION evidence_catalog_reject();");
        }
        else await admin.query('DROP TRIGGER IF EXISTS evidence_catalog_rejected ON bz_catalog_lots; DROP FUNCTION IF EXISTS evidence_catalog_reject();');
      },
    };
    return await run(fixture);
  }finally{
    for(const child of children.reverse())await stop(child);
    if(runtimeDB){try{await runtimeDB.end();}catch{}}
    if(admin){try{await admin.end();}catch{}}
    if(started){try{command(pgBin+'/pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);}catch{}}
    await rm(scratch,{recursive:true,force:true});
  }
}
