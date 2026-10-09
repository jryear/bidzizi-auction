// Separately named 017 successor: committed-state semantics, not the 016 queue oracle.
// Copied local harness and unchanged relevant regressions from committed asset-authority.mjs.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { createServer, createConnection } from 'node:net';
import pg from 'pg';

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const loaded = new Map();
const sha = value => createHash('sha256').update(value).digest('hex');
loaded.set(relative(repo,fileURLToPath(import.meta.url)),sha(readFileSync(fileURLToPath(import.meta.url))));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/server/')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(pathToFileURL(join(repo, 'src')).href)) {
      const path = fileURLToPath(url);
      loaded.set(relative(repo, path), sha(readFileSync(path)));
    }
    return next(url, context);
  },
});
const auth = await import('../../src/server/auth.ts');
const staff = await import('../../src/server/staff.ts');
const assets = await import('../../src/server/staff-assets.ts');
const catalog = await import('../../src/server/catalog.ts');
const bids = await import('../../src/server/manual-bids.ts');
const { emptyEvent } = await import('../../src/server/draft.ts');
const { emptyTradeEvent } = await import('../../src/server/timing.ts');
const person = '20000000-0000-4000-8000-000000000001';
const person2 = '20000000-0000-4000-8000-000000000002';
const org = '10000000-0000-4000-8000-000000000001';
const org2 = '10000000-0000-4000-8000-000000000002';
const event = '30000000-0000-4000-8000-000000000001';
const event2 = '30000000-0000-4000-8000-000000000002';
const token = 'a'.repeat(43), hash = createHash('sha256').update(token).digest('hex');
const token2 = 'b'.repeat(43), hash2 = createHash('sha256').update(token2).digest('hex');
const bytes = Buffer.from('524946460400000057454250', 'hex');
const requestId = randomUUID();
const putSQL = 'SELECT public.bz_staff_asset_put($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value';
const putArgs = (key = randomUUID(), e = event, h = hash) => [h,e,key,'image/webp',12,sha(bytes),bytes,1,1];
const pause = ms => new Promise(r => setTimeout(r,ms));
const root = await mkdtemp(join(tmpdir(),'bz-asset-scope-'));
const cluster = join(root,'cluster');
const receipt = { sourceRoot: repo, gitHead: execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
  nodeVersion:process.version, developmentOnly: true, cases: [], witnesses: [], cleanup: {} };
const clients = [];
const pools = new Set();
const originalPoolConnect = pg.Pool.prototype.connect;
pg.Pool.prototype.connect = function(...args) { pools.add(this);return originalPoolConnect.apply(this,args); };
let started = false, admin, seedAsset, postgresPid;
const pgBin = '/opt/homebrew/opt/postgresql@18/bin';
const portServer = createServer();
await new Promise(r => portServer.listen(0,'127.0.0.1',r));
const port = portServer.address().port;
await new Promise(r => portServer.close(r));
const connection = {host:'127.0.0.1',port,database:'bz_test_asset_repair',user:process.env.USER};
async function connect(runtime = false) {
  const c = new pg.Client({...connection, ...(runtime ? {user:'asset_runtime',password:'disposable-only'} : {})});
  await c.connect(); clients.push(c);
  await c.query("SET statement_timeout='8s'");
  return c;
}
function request(body, t = token, method = 'PUT') {
  return new Request('http://127.0.0.1:43871/test', {method: body === undefined ? 'GET' : method,
    headers:{host:'127.0.0.1:43871',origin:'http://127.0.0.1:43871',cookie:'bz_session='+t,'content-type':'application/json'},
    ...(body === undefined ? {} : {body:JSON.stringify(body)})});
}
async function waitFor(pid, fragment) {
  const end = Date.now()+2500;
  while(Date.now()<end) {
    const row=(await admin.query(`SELECT pid,query,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE pid=$1`,[pid])).rows[0];
    if(row?.wait_event_type==='Lock' && (!fragment || row.query.includes(fragment))) {
      const locks=(await admin.query(`SELECT locktype,mode,granted,relation::regclass::text AS relation,
        classid::text,objid::text,objsubid,transactionid::text FROM pg_locks WHERE pid=$1 ORDER BY locktype,granted`,[pid])).rows;
      receipt.witnesses.push({...row,locks});return {...row,locks};
    }
    await pause(10);
  }
  assert.fail('Expected controlled lock wait for PID '+pid+' '+fragment);
}
async function pid(c) {return (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;}
async function reset() {
  await admin.query('UPDATE bz_sessions SET revoked_at=NULL,expires_at=clock_timestamp()+interval \'1 hour\'');
  await admin.query('UPDATE bz_staff_grants SET active=true');
  await admin.query('UPDATE bz_event_view_grants SET active=true');
}
async function waitAny(fragment) {
  const end=Date.now()+2500;
  while(Date.now()<end) {
    const r=await admin.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
      AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE $1`,['%'+fragment+'%']);
    if(r.rows[0])return waitFor(r.rows[0].pid,fragment);
    await pause(10);
  }
  assert.fail('Required application wait was not reached: '+fragment);
}
async function latePut() {
  const blocker=await connect(), runtime=await connect(true), key='development-late-insert:'+randomUUID();
  await admin.query(`CREATE FUNCTION development_insert_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('${key}',0)); RETURN NEW; END $$;
    CREATE TRIGGER development_insert_wait BEFORE INSERT ON bz_staff_assets FOR EACH ROW EXECUTE FUNCTION development_insert_wait()`);
  const req=randomUUID();
  await admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE token_hash=$1",[hash]);
  await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  await runtime.query('BEGIN');const rp=await pid(runtime);
  const pending=runtime.query(putSQL,putArgs(req));
  try {
    await waitFor(rp,'bz_staff_asset_put');
    while((await admin.query('SELECT expires_at<=clock_timestamp() AS expired FROM bz_sessions WHERE token_hash=$1',[hash])).rows[0].expired!==true)await pause(15);
    await blocker.query('COMMIT');const value=(await pending).rows[0].value;
    assert.deepEqual(value,{error:'DENIED'});await runtime.query('COMMIT');
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets WHERE request_id=$1',[req])).rows[0].n,0,
      'Direct SQL COMMIT after late DENIED must retain zero inserted assets');
  } finally {await blocker.query('ROLLBACK');await pending.catch(()=>{});await runtime.query('ROLLBACK');
    await admin.query('DROP TRIGGER development_insert_wait ON bz_staff_assets; DROP FUNCTION development_insert_wait()');}
}
async function denialReentry() {
  const calls=[];
  const client={query:async(sql)=>{calls.push(sql);return {rows:[{value:{error:'DENIED'}}]};}};
  for(const run of [()=>assets.recoverAssetMeta(client,request(),event,requestId),
    ()=>assets.validateAssetRefs(client,request(),event,{event:{cover:'asset:'+seedAsset},lots:[]})]) {
    calls.length=0;await assert.rejects(run);
    assert.ok(calls.length<=2,'Nested DENIED may classify the session without reloading staff organizations');
    for(const sql of calls)assert.doesNotMatch(sql,/\bFOR\s+(?:SHARE|UPDATE|KEY\s+SHARE|NO\s+KEY\s+UPDATE)\b|pg_advisory|LOCK\s+TABLE/i,
      'Nested DENIED must not enter a locking authority tier');
  }
}
async function denialHttpStatus() {
  await admin.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[person,org]);
  await assert.rejects(assets.recoverStaffAsset(request(),event,requestId),error=>error.status===404&&error.code==='ASSET_UNAVAILABLE');
  await reset();await admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[hash]);
  await assert.rejects(assets.recoverStaffAsset(request(),event,requestId),error=>error.status===401&&error.code==='UNAUTHENTICATED');
  await assert.rejects(assets.readStaffAsset(request(),event,seedAsset,'saved',null),error=>error.status===401&&error.code==='UNAUTHENTICATED');
}
async function oldCookiePersonMutation(kind) {
  const revoker=await connect();await revoker.query('BEGIN');const rp=await pid(revoker);
  // Pause the actual application's SELECT after PostgreSQL acquired its person
  // SHARE lock. The competitor uses ordinary raw SQL with no cooperative gate.
  const originalQuery=pg.Client.prototype.query;
  let release, reached;
  const held=new Promise(r=>{release=r;});
  const selected=new Promise(r=>{reached=r;});
  pg.Client.prototype.query=function(...args) {
    const pending=originalQuery.apply(this,args);
    if(typeof args[0]==='string'&&args[0].startsWith('SELECT id,name FROM bz_people WHERE alias=')&&args[1]?.[0]==='staff-saturn') {
      return pending.then(async result=>{
        const lp=(await originalQuery.call(this,'SELECT pg_backend_pid() AS pid')).rows[0].pid;
        reached(lp);await held;return result;
      });
    }
    return pending;
  };
  const loggingIn=auth.login(request({account:'staff-saturn'},token,'POST'))
    .then(response=>({response}),error=>({state:error.code,message:error.message}));
  let mutating;
  try {
    const lp=await Promise.race([selected,pause(2500).then(()=>assert.fail('Actual login never acquired the person lock'))]);
    const sql=kind==='update'?'UPDATE bz_people SET active=false WHERE id=$1':'DELETE FROM bz_people WHERE id=$1';
    mutating=revoker.query(sql,[person]).then(result=>({rowCount:result.rowCount}),error=>({state:error.code,message:error.message}))
      .then(async result=>{await revoker.query('ROLLBACK');return result;});
    const wait=await waitFor(rp,kind==='update'?'UPDATE bz_people':'DELETE FROM bz_people');
    assert.ok(wait.blockers.includes(lp),'Raw mutation must be blocked by the actual login transaction');
    release();
    const [loginResult,mutationResult]=await Promise.all([loggingIn,mutating]);
    receipt.witnesses.push({stage:'old-cookie-login-person-'+kind,loginPid:lp,revokerPid:rp,
      login:{status:loginResult.response?.status,state:loginResult.state,message:loginResult.message},mutation:mutationResult});
    assert.ok(![loginResult.state,mutationResult.state].includes('40P01'),
      'Actual old-cookie login/person '+kind+' deadlocked: '+JSON.stringify({login:loginResult.state,mutation:mutationResult.state}));
    assert.equal(loginResult.response?.status,200,JSON.stringify(loginResult));
    // Existing session/event FKs reject person DELETE; that is not a deadlock.
    if(kind==='delete')assert.equal(mutationResult.state,'23503',JSON.stringify(mutationResult));
    else assert.equal(mutationResult.rowCount,1,JSON.stringify(mutationResult));
    assertRowWait(wait,lp);
    const body=await loginResult.response.json();
    assert.equal(body.authenticated,true);assert.equal(body.person.id,person);
    assert.deepEqual(body.staffOrganizations.map(o=>o.id),[org,org2]);
    const cookie=loginResult.response.headers.get('set-cookie');
    assert.match(cookie,/; Path=\/; HttpOnly; SameSite=Lax; Max-Age=28800$/);
    const newHash=auth.sessionHash(new Request('http://127.0.0.1:43871/test',{headers:{cookie}}));
    assert.ok(newHash&&newHash!==hash);
    assert.notEqual((await admin.query('SELECT revoked_at FROM bz_sessions WHERE token_hash=$1',[hash])).rows[0].revoked_at,null);
    const session=(await admin.query('SELECT person_id,revoked_at,expires_at>clock_timestamp() AS current FROM bz_sessions WHERE token_hash=$1',[newHash])).rows[0];
    assert.deepEqual(session,{person_id:person,revoked_at:null,current:true});
    assert.equal((await admin.query('SELECT active FROM bz_people WHERE id=$1',[person])).rows[0].active,true);
  } finally {
    release();pg.Client.prototype.query=originalQuery;
    await Promise.allSettled([loggingIn,mutating]);await revoker.query('ROLLBACK');
  }
}
async function failedLoginRollback() {
  const variants=[{name:'invalid-account',account:'not-an-account',status:400},
    {name:'missing-person',account:'bidder-unlisted',status:403},
    {name:'inactive-person',account:'staff-pine',status:403,column:'active'},
    {name:'non-test-person',account:'staff-pine',status:403,column:'is_test'}];
  for(const {name,account,status,column} of variants) {
    if(column)await admin.query('UPDATE bz_people SET '+column+'=false WHERE id=$1',[person2]);
    try {
      const before=(await admin.query('SELECT * FROM bz_sessions ORDER BY token_hash')).rows;
      await assert.rejects(auth.login(request({account},token,'POST')),error=>error.status===status,
        name+' must preserve its existing rejection');
      assert.deepEqual((await admin.query('SELECT * FROM bz_sessions ORDER BY token_hash')).rows,before,
        name+' must roll back old-session revocation and create no new session');
      const current=await auth.getSession(request());
      assert.equal(current.status,200);assert.equal((await current.json()).person.id,person);
      receipt.witnesses.push({stage:'failed-login-'+name,status,sessionsUnchanged:true});
    } finally {if(column)await admin.query('UPDATE bz_people SET '+column+'=true WHERE id=$1',[person2]);}
  }
}
async function expiryWaits() {
  for(const stage of ['event','request','quota','image','recovery','save']) {
    await reset();const blocker=await connect(),runtime=await connect(true),key=randomUUID();
    await blocker.query('BEGIN');
    if(stage==='event')await blocker.query('SELECT id FROM bz_events WHERE id=$1 FOR UPDATE',[event]);
    else if(stage==='image')await blocker.query('SELECT id FROM bz_staff_assets WHERE id=$1 FOR UPDATE',[seedAsset]);
    else await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[
      stage==='quota'?'bz-asset-quota:'+org:stage==='save'?person+':save:'+event+':'+key:
        'bz-asset-request:'+person+':'+event+':'+(stage==='recovery'?requestId:key)]);
    const expires=(await admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE token_hash=$1 RETURNING expires_at",[hash])).rows[0].expires_at;
    await runtime.query('BEGIN');const rp=await pid(runtime);let pending;
    const before=(await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets')).rows[0].n;
    try {
      if(stage==='save') {
        const row=(await admin.query('SELECT revision,draft FROM bz_events WHERE id=$1',[event])).rows[0];
        pending=staff.saveEvent(request({expectedRevision:row.revision,requestId:key,draft:{event:row.draft,lots:[]}}),event)
          .then(r=>({status:r.status}),e=>({status:e.status}));
        await waitAny('pg_advisory_xact_lock');
      } else {
        pending=runtime.query(stage==='image'?'SELECT * FROM bz_staff_asset_read($1,$2,$3,$4,$5)':stage==='recovery'?
          'SELECT bz_staff_asset_recover($1,$2,$3) AS value':putSQL,
          stage==='image'?[hash,event,seedAsset,'saved',null]:stage==='recovery'?[hash,event,requestId]:putArgs(key))
          .then(r=>({rows:r.rows}),e=>({state:e.code}));
        await waitFor(rp,'bz_staff_asset_');
      }
      while((await admin.query('SELECT clock_timestamp() AS at')).rows[0].at<=expires)await pause(15);
      await blocker.query('COMMIT');const result=await pending;
      if(stage==='save')assert.equal(result.status,401);
      else if(stage==='image')assert.equal(result.state,'PBA02');
      else assert.deepEqual(result.rows[0].value,{error:'DENIED'});
      await runtime.query(result.state?'ROLLBACK':'COMMIT');
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets')).rows[0].n,before);
      receipt.witnesses.push({stage:'expiry-'+stage,expiredAt:expires.toISOString(),result});
    } finally {await blocker.query('ROLLBACK');await pending?.catch(()=>{});await runtime.query('ROLLBACK');}
  }
}
async function replayAndBoundaries() {
  const c=await connect(true),before=(await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets')).rows[0].n;
  const first=(await c.query(putSQL,putArgs(requestId))).rows[0].value;
  assert.equal(first.replayed,true);assert.equal(first.asset.ref,'asset:'+seedAsset);
  const recovered=(await c.query('SELECT bz_staff_asset_recover($1,$2,$3) AS value',[hash,event,requestId])).rows[0].value;
  assert.deepEqual(recovered.asset,first.asset);
  const args=putArgs(requestId);args[5]='f'.repeat(64);
  assert.deepEqual((await c.query(putSQL,args)).rows[0].value,{error:'CONFLICT'});
  assert.deepEqual((await c.query('SELECT bz_staff_asset_recover($1,$2,$3) AS value',[hash2,event,requestId])).rows[0].value,{error:'MISSING'});
  assert.deepEqual((await c.query('SELECT bz_staff_asset_validate($1,$2,$3::uuid[]) AS value',[hash,event2,[seedAsset]])).rows[0].value,{error:'INVALID'});
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets')).rows[0].n,before);
  await admin.query("UPDATE bz_events SET draft=jsonb_set(draft,'{cover}','null') WHERE id=$1",[event]);
  await assert.rejects(c.query('SELECT * FROM bz_staff_asset_read($1,$2,$3,$4,$5)',[hash,event,seedAsset,'saved',null]),e=>e.code==='PBA03',
    'Null cover must not disclose an unreferenced asset');
  await admin.query("UPDATE bz_events SET draft=jsonb_set(draft,'{cover}',to_jsonb($1::text)) WHERE id=$2",['asset:'+seedAsset,event]);
}
async function legacyEntryAndIdentity() {
  const c=await connect(true);await c.query('BEGIN');
  const actor=await auth.identity(c,request());assert.equal(actor.person.id,person);
  assert.deepEqual(actor.organizations.map(o=>o.id),[org,org2],'Equal-name organizations use deterministic ID order');
  const locks=(await c.query(`SELECT relation::regclass::text AS relation,mode FROM pg_locks
    WHERE pid=pg_backend_pid() AND locktype='relation' AND mode='RowShareLock'`)).rows;
  for(const relation of ['bz_sessions','bz_people','bz_staff_grants','bz_orgs'])assert.ok(locks.some(l=>l.relation===relation),
    'Legacy identity must retain '+relation+' row-lock authority');
  await c.query('COMMIT');
  const key=randomUUID();const sql='SELECT bz_staff_event_entry_set($1,$2,$3,$4,$5) AS value';
  const first=(await c.query(sql,[hash,event,0,true,key])).rows[0].value;
  assert.equal(first.entry.enabled,true);
  const replay=(await c.query(sql,[hash,event,0,true,key])).rows[0].value;
  assert.equal(replay.replayed,true);assert.equal(replay.entry.entryRevision,first.entry.entryRevision);
  await admin.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[person,org]);
  assert.deepEqual((await c.query(sql,[hash,event,0,true,key])).rows[0].value,{error:'FORBIDDEN'});
}
async function completeEvent(trade = true) {
  const e=randomUUID(),lotId=randomUUID();
  const now=(await admin.query('SELECT clock_timestamp() AS at')).rows[0].at;
  const next=new Date(now.getTime()+86400000).toISOString().slice(0,10);
  const fields=trade?{...emptyTradeEvent('Trade development'),welcome:'Synthetic rehearsal',
    timing:{startDate:next,start:'10:00',endDate:next,end:'11:00',timezone:'UTC'}}:
    {...emptyEvent('Legacy development'),welcome:'Legacy USD fixture',date:now.toISOString().slice(0,10),start:'00:00',end:'23:59',timezone:'UTC',increment:2500};
  await admin.query('INSERT INTO bz_events(id,org_id,created_by,draft) VALUES($1,$2,$3,$4)',[e,org,person,JSON.stringify(fields)]);
  let image=null;
  if(trade) {
    image=(await admin.query(putSQL,putArgs(randomUUID(),e))).rows[0].value.asset.ref;
    fields.cover=image;fields.coverAlt='Development image';
    await admin.query('UPDATE bz_events SET draft=$1 WHERE id=$2',[JSON.stringify(fields),e]);
  }
  const lot={id:lotId,title:'Synthetic item',short:'',description:'Test item',category:'Test',image,alt:trade?'Development item':'',opening:2500,includes:[],fine:'',
    ...(trade?{fixedRaiseMinor:null}:{windowId:'main'})};
  await admin.query('INSERT INTO bz_lots(id,event_id,org_id,position,data) VALUES($1,$2,$3,0,$4)',[lotId,e,org,JSON.stringify(lot)]);
  return {e,lotId,image};
}
const person3='20000000-0000-4000-8000-000000000003';
const org3='10000000-0000-4000-8000-000000000003';
const event3='30000000-0000-4000-8000-000000000003';
const token3='c'.repeat(43),hash3=sha(token3);
async function seedDisjoint() {
  await admin.query("INSERT INTO bz_orgs(id,name,initials) VALUES($1,'Disjoint','D')",[org3]);
  await admin.query("INSERT INTO bz_people(id,alias,name,is_test) VALUES($1,'scope-only','Independent',true)",[person3]);
  await admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$2)',[person3,org3]);
  await admin.query("INSERT INTO bz_sessions(token_hash,person_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[hash3,person3]);
  await admin.query('INSERT INTO bz_events(id,org_id,created_by,draft) VALUES($1,$2,$3,$4)',[event3,org3,person3,JSON.stringify(emptyEvent('Independent'))]);
}
function assertNoGlobal(wait) {
  assert.ok(!wait.locks.some(l=>l.locktype==='advisory'&&l.classid===receipt.gate.classid&&l.objid===receipt.gate.objid),
    '017 must not acquire the old global gate');
}
function assertRowWait(wait,blocker) {
  assert.ok(wait.blockers.includes(blocker),'Wait must bind to actual authority holder');
  assert.ok(wait.locks.some(l=>!l.granted&&['transactionid','tuple'].includes(l.locktype)),
    'Authority conflict must be an ordinary row/transaction wait');
  assertNoGlobal(wait);
}
async function saved(e=event,t=token) {
  const row=(await admin.query('SELECT revision,draft FROM bz_events WHERE id=$1',[e])).rows[0];
  const response=await staff.saveEvent(request({expectedRevision:row.revision,requestId:randomUUID(),draft:{event:row.draft,lots:[]}},t),e);
  assert.equal(response.status,200);return response;
}
async function uploaded(e=event3,t=token3) {
  const sharp=(await import('sharp')).default;
  const png=await sharp({create:{width:2,height:2,channels:3,background:{r:20,g:80,b:120}}}).png().toBuffer();
  const response=await assets.uploadStaffAsset(new Request('http://127.0.0.1:43871/test',{
    method:'POST',headers:{host:'127.0.0.1:43871',origin:'http://127.0.0.1:43871',cookie:'bz_session='+t,
      'content-type':'image/png','x-bidzizi-request-id':randomUUID()},body:png}),e);
  assert.equal(response.status,201);assert.match((await response.json()).asset.ref,/^asset:/);
}
async function scopeInstallation() {
  assert.equal((await admin.query("SELECT to_regprocedure('bz_asset_authority_mutation_gate()') AS gate")).rows[0].gate,null);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('bz_asset_session_gate','bz_asset_person_gate','bz_asset_staff_grant_gate','bz_asset_view_grant_gate','bz_asset_org_gate')")).rows[0].n,0);
  const original=readFileSync(join(repo,'migrations/016_staging_staff_assets.sql'),'utf8');
  const successor=readFileSync(join(repo,'migrations/017_asset_authority_scope.sql'),'utf8');
  for(const name of ['put','recover','read']) {
    const regex=new RegExp('CREATE (?:OR REPLACE )?FUNCTION public.bz_staff_asset_'+name+'\\([\\s\\S]*?\\nEND \\$\\$;');
    const expected=original.match(regex)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')
      .replace(" PERFORM pg_advisory_xact_lock_shared(hashtextextended('bz-asset-authority:v1',0));\n",'');
    assert.equal(successor.match(regex)[0],expected,'Only global gate acquisition may change the 016 '+name+' definition');
    const fn=(await admin.query("SELECT proowner::regrole::text AS owner,prosecdef,proconfig,has_function_privilege('asset_runtime',oid,'EXECUTE') AS runtime_execute FROM pg_proc WHERE proname=$1",['bz_staff_asset_'+name])).rows[0];
    assert.equal(fn.owner,connection.user);assert.equal(fn.prosecdef,true);assert.equal(fn.runtime_execute,true);
    assert.deepEqual(fn.proconfig,['search_path=pg_catalog, pg_temp']);
    assert.equal((await admin.query("SELECT has_function_privilege('public',oid,'EXECUTE') AS permitted FROM pg_proc WHERE proname=$1",['bz_staff_asset_'+name])).rows[0].permitted,false);
  }
  assert.equal((await admin.query("SELECT has_table_privilege('asset_runtime','bz_staff_assets','SELECT,INSERT,UPDATE,DELETE') AS permitted")).rows[0].permitted,false);
  for(const path of ['migrations/016_staging_staff_assets.sql','tests/development/asset-authority.mjs']) {
    const base=execFileSync('git',['show','b07c535c39b55e3c1b10082c224aa70799dd3eb8:'+path],{cwd:repo});
    assert.equal(sha(readFileSync(join(repo,path))),sha(base),'Preserve original '+path);
  }
}
async function zeroRowVsSaveUpload() {
  const blocker=await connect(),raw=await connect(),key=randomUUID();
  await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[person+':save:'+event+':'+key]);
  const row=(await admin.query('SELECT revision,draft FROM bz_events WHERE id=$1',[event])).rows[0];
  const saving=staff.saveEvent(request({expectedRevision:row.revision,requestId:key,draft:{event:row.draft,lots:[]}}),event);
  try {
    const wait=await waitAny('pg_advisory_xact_lock');assertNoGlobal(wait);
    await raw.query('BEGIN');await raw.query("SET LOCAL statement_timeout='1500ms'");
    const result=await raw.query('UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',['f'.repeat(64)]);
    assert.equal(result.rowCount,0,'Raw zero-row UPDATE must finish while Save retains authority');
    await saved(event2);await uploaded(event2,token);
    await saved(event3,token3);await uploaded();
    assert.equal((await raw.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory'")).rows[0].n,0);
    await blocker.query('COMMIT');assert.equal((await saving).status,200);
    receipt.witnesses.push({stage:'raw-zero-row-held-vs-save-upload',rowCount:0,rawTransactionHeld:true});
  } finally {await blocker.query('ROLLBACK');await raw.query('ROLLBACK');await saving.catch(()=>{});}
}
async function unrelatedAuthorities() {
  const variants=[['session','UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hash]],
    ['person','UPDATE bz_people SET active=false WHERE id=$1',[person]],
    ['grant','UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[person,org]],
    ['grant-delete','DELETE FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2',[person,org]],
    ['org','UPDATE bz_orgs SET name=\'Held name\' WHERE id=$1',[org]],
    ['view','UPDATE bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[person,event]]];
  for(const [name,sql,args]of variants) {
    const raw=await connect();await raw.query('BEGIN');
    try {
      assert.equal((await raw.query(sql,args)).rowCount,1);
      await saved(event3,token3);await uploaded();
      receipt.witnesses.push({stage:'unrelated-'+name,save:200,upload:201,rawTransactionHeld:true});
    } finally {await raw.query('ROLLBACK');}
  }
}
async function authorityMutationRaces() {
  const variants=[['session-update','UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hash]],
    ['session-delete','DELETE FROM bz_sessions WHERE token_hash=$1',[hash]],
    ['session-token','UPDATE bz_sessions SET token_hash=$1 WHERE token_hash=$2',['e'.repeat(64),hash]],
    ['session-actor','UPDATE bz_sessions SET person_id=$1 WHERE token_hash=$2',[person3,hash]],
    ['person-active','UPDATE bz_people SET active=false WHERE id=$1',[person]],
    ['person-test','UPDATE bz_people SET is_test=false WHERE id=$1',[person]],
    ['grant-update','UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[person,org]],
    ['grant-delete','DELETE FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2',[person,org]],
    ['grant-org','UPDATE bz_staff_grants SET org_id=$1 WHERE person_id=$2 AND org_id=$3',[org3,person,org]]];
  for(const [name,sql,args]of variants)for(const commit of [false,true]) {
    const raw=await connect(),reader=await connect(true);const key=randomUUID();
    await raw.query('BEGIN');assert.equal((await raw.query(sql,args)).rowCount,1);
    await reader.query('BEGIN');const rp=await pid(raw),cp=await pid(reader);
    const pending=reader.query(putSQL,putArgs(key)).then(r=>({value:r.rows[0].value}),e=>({state:e.code}));
    try {
      const wait=await waitFor(cp,'bz_staff_asset_put');assertRowWait(wait,rp);
      assert.ok(!wait.locks.some(l=>l.relation==='bz_events'),'Initial authority wait must precede event acquisition');
      await raw.query(commit?'COMMIT':'ROLLBACK');const result=await pending;
      assert.equal(result.state,undefined,JSON.stringify(result));
      if(commit)assert.deepEqual(result.value,{error:'DENIED'},name+' committed mutation must deny');
      else assert.ok(result.value.asset,name+' rollback must restore authority');
      await reader.query('COMMIT');
      if(commit) {
        assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets WHERE request_id=$1',[key])).rows[0].n,0);
        const fresh=(await reader.query('SELECT bz_staff_asset_recover($1,$2,$3) AS value',[hash,event,requestId])).rows[0].value;
        assert.deepEqual(fresh,{error:'DENIED'});
      }
      receipt.witnesses.push({stage:name,commit,result});
    } finally {
      await raw.query('ROLLBACK');await pending;await reader.query('ROLLBACK');
      await admin.query('UPDATE bz_people SET active=true,is_test=true WHERE id=$1',[person]);
      await admin.query('DELETE FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2',[person,org3]);
      await admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$2) ON CONFLICT(person_id,org_id) DO UPDATE SET active=true',[person,org]);
      await admin.query('DELETE FROM bz_sessions WHERE token_hash=$1',['e'.repeat(64)]);
      await admin.query("INSERT INTO bz_sessions(token_hash,person_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour') ON CONFLICT(token_hash) DO UPDATE SET person_id=EXCLUDED.person_id,revoked_at=NULL,expires_at=EXCLUDED.expires_at",[hash,person]);
    }
  }
}
async function logoutRace() {
  const holder=await connect(true);await holder.query('BEGIN');await auth.staff(holder,request());const hp=await pid(holder);
  const loggingOut=auth.logout(request({},token,'POST'));
  try {
    const wait=await waitAny('UPDATE bz_sessions');assertRowWait(wait,hp);
    await saved(event3,token3);await uploaded();
    await holder.query('COMMIT');const response=await loggingOut;
    assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
    assert.deepEqual((await admin.query(putSQL,putArgs())).rows[0].value,{error:'DENIED'});
  } finally {await holder.query('ROLLBACK');await loggingOut.catch(()=>{});}
}
async function heldAuthorityVsEvent() {
  const holder=await connect(true),eventHolder=await connect(),raw=await connect();
  await holder.query('BEGIN');await auth.staff(holder,request());
  await eventHolder.query('BEGIN');await eventHolder.query('SELECT id FROM bz_events WHERE id=$1 FOR UPDATE',[event]);
  const row=(await admin.query('SELECT revision,draft FROM bz_events WHERE id=$1',[event])).rows[0];
  const saving=staff.saveEvent(request({expectedRevision:row.revision,requestId:randomUUID(),draft:{event:row.draft,lots:[]}}),event);
  await raw.query('BEGIN');const rp=await pid(raw);
  let revoking;
  try {
    const eventWait=await waitAny('SELECT id,org_id,revision');assertNoGlobal(eventWait);
    assert.ok(eventWait.blockers.includes(await pid(eventHolder)));
    revoking=raw.query('UPDATE bz_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[hash]);
    const authorityWait=await waitFor(rp,'UPDATE');assertNoGlobal(authorityWait);
    assert.ok(authorityWait.blockers.includes(await pid(holder)));
    // Event release lets the already-authorized Save finish; the raw revoker
    // still waits for the independent authority holder, not any global barrier.
    await eventHolder.query('COMMIT');assert.equal((await saving).status,200);
    await holder.query('COMMIT');await revoking;await raw.query('COMMIT');
    assert.deepEqual((await admin.query(putSQL,putArgs())).rows[0].value,{error:'DENIED'});
  } finally {await eventHolder.query('ROLLBACK');await holder.query('ROLLBACK');await Promise.allSettled([saving,revoking]);await raw.query('ROLLBACK');}
}
async function repeatableCommittedRevocation() {
  const reader=await connect(true),key=randomUUID();await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await reader.query('SELECT active FROM bz_staff_grants WHERE person_id=$1 AND org_id=$2',[person,org]);
  await admin.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[person,org]);
  try {
    await assert.rejects(reader.query(putSQL,putArgs(key)),error=>error.code==='40001');
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets WHERE request_id=$1',[key])).rows[0].n,0);
  } finally {await reader.query('ROLLBACK');}
}
async function publishedViewRaces() {
  const {e,lotId,image}=await completeEvent();
  const response=await catalog.approveTradeCatalog(request({expectedRevision:1,requestId:randomUUID(),lotIds:[lotId]},token,'POST'),e);
  assert.equal(response.status,201);const approval=(await response.json()).approval;
  await admin.query('INSERT INTO bz_event_view_grants(person_id,event_id) VALUES($1,$2)',[person,e]);
  for(const del of [false,true])for(const commit of [false,true]) {
    const raw=await connect(),reader=await connect(true);await raw.query('BEGIN');
    await raw.query(del?'DELETE FROM bz_event_view_grants WHERE person_id=$1 AND event_id=$2':'UPDATE bz_event_view_grants SET active=false WHERE person_id=$1 AND event_id=$2',[person,e]);
    await reader.query('BEGIN');const cp=await pid(reader),rp=await pid(raw);
    const pending=reader.query('SELECT * FROM bz_staff_asset_read($1,$2,$3,$4,$5)',[hash,e,image.slice(6),'published',approval.id])
      .then(r=>({rows:r.rows}),err=>({state:err.code}));
    try {
      assertRowWait(await waitFor(cp,'bz_staff_asset_read'),rp);
      await raw.query(commit?'COMMIT':'ROLLBACK');const result=await pending;
      if(commit)assert.equal(result.state,'PBA03');else assert.deepEqual(result.rows[0].bytes,bytes);
      await reader.query(result.state?'ROLLBACK':'COMMIT');
    } finally {await raw.query('ROLLBACK');await pending;await reader.query('ROLLBACK');
      await admin.query('INSERT INTO bz_event_view_grants(person_id,event_id) VALUES($1,$2) ON CONFLICT(person_id,event_id) DO UPDATE SET active=true',[person,e]);}
  }
}
async function authorityWaitExpiry() {
  const raw=await connect(),reader=await connect(true),key=randomUUID();
  await admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE token_hash=$1",[hash]);
  await raw.query('BEGIN');await raw.query('SELECT id FROM bz_people WHERE id=$1 FOR UPDATE',[person]);
  await reader.query('BEGIN');const cp=await pid(reader),rp=await pid(raw);
  const pending=reader.query(putSQL,putArgs(key));
  try {
    assertRowWait(await waitFor(cp,'bz_staff_asset_put'),rp);
    while(!(await admin.query('SELECT expires_at<=clock_timestamp() AS expired FROM bz_sessions WHERE token_hash=$1',[hash])).rows[0].expired)await pause(15);
    await raw.query('ROLLBACK');assert.deepEqual((await pending).rows[0].value,{error:'DENIED'});
    await reader.query('COMMIT');
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_staff_assets WHERE request_id=$1',[key])).rows[0].n,0);
  } finally {await raw.query('ROLLBACK');await pending.catch(()=>{});await reader.query('ROLLBACK');}
}
async function publicationExpiry() {
  const {e,lotId}=await completeEvent(),key='scope-publication:'+randomUUID(),requestKey=randomUUID();
  await admin.query(`CREATE FUNCTION scope_publication_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('${key}',0)); RETURN NEW; END $$;
    CREATE TRIGGER scope_publication_wait BEFORE INSERT ON bz_catalog_lots FOR EACH ROW EXECUTE FUNCTION scope_publication_wait()`);
  const blocker=await connect();await blocker.query('BEGIN');
  await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  const expires=(await admin.query("UPDATE bz_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE token_hash=$1 RETURNING expires_at",[hash])).rows[0].expires_at;
  const pending=catalog.approveTradeCatalog(request({expectedRevision:1,requestId:requestKey,lotIds:[lotId]},token,'POST'),e)
    .then(response=>({status:response.status}),error=>({status:error.status}));
  try {
    await waitAny('INSERT INTO bz_catalog_lots');
    while((await admin.query('SELECT clock_timestamp() AS at')).rows[0].at<=expires)await pause(15);
    await blocker.query('COMMIT');assert.equal((await pending).status,401);
    for(const table of ['bz_catalog_approvals','bz_catalog_lots'])assert.equal((await admin.query('SELECT count(*)::int AS n FROM '+table+' WHERE event_id=$1',[e])).rows[0].n,0);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM bz_requests WHERE request_id=$1',[requestKey])).rows[0].n,0);
  } finally {await blocker.query('ROLLBACK');await pending;
    await admin.query('DROP TRIGGER scope_publication_wait ON bz_catalog_lots; DROP FUNCTION scope_publication_wait()');}
}
async function historicalQueueObservation() {
  // Record the obsolete assertion as FAIL, separately from successor cases.
  // This is an explicit guarantee difference, never a passing 016 certificate.
  const holder=await connect(true),raw=await connect();
  await holder.query('BEGIN');await auth.identity(holder,request());
  await raw.query('BEGIN');const rp=await pid(raw);
  const pending=raw.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[person,org]);
  try {
    const wait=await waitFor(rp,'UPDATE');assertRowWait(wait,await pid(holder));
    const historicalBeforeTuple=!wait.locks.some(l=>l.locktype==='tuple'||(l.locktype==='transactionid'&&!l.granted));
    assert.equal(historicalBeforeTuple,false,'017 must expose the changed row-lock boundary');
    receipt.historicalAssertions=[{source:'tests/development/asset-authority.mjs',
      cases:['queued-grant-legacy-holder','mutation-before-tuple-coverage'],
      assertion:'BEFORE STATEMENT raw revoker must gate before tuple acquisition',result:'FAIL',
      reason:'017 removes the global statement gate; revoker waits on the held grant tuple'}];
  } finally {await holder.query('COMMIT');await pending;await raw.query('ROLLBACK');}
}
const cases={
  'scope-installation':scopeInstallation,'zero-row-vs-save-upload':zeroRowVsSaveUpload,
  'unrelated-authorities':unrelatedAuthorities,'authority-update-delete-commit-rollback':authorityMutationRaces,
  'logout-race':logoutRace,'held-authority-vs-event':heldAuthorityVsEvent,
  'old-cookie-login-person-update':()=>oldCookiePersonMutation('update'),
  'old-cookie-login-person-delete':()=>oldCookiePersonMutation('delete'),
  'failed-login-rollback':failedLoginRollback,'post-wait-expiry':expiryWaits,
  'late-put-direct-commit':latePut,'denied-reentry':denialReentry,'denial-http-status':denialHttpStatus,
  'replay-and-image-boundaries':replayAndBoundaries,'legacy-identity-and-entry':legacyEntryAndIdentity,
  'repeatable-committed-revocation':repeatableCommittedRevocation,'published-view-update-delete':publishedViewRaces,
  'authority-wait-expiry':authorityWaitExpiry,'publication-expiry':publicationExpiry,
  'historical-queue-observation':historicalQueueObservation,
};
try {
  await mkdir(cluster);
  execFileSync(join(pgBin,'initdb'),['-D',cluster,'-A','trust','--no-locale','-E','UTF8'],{stdio:'pipe'});
  execFileSync(join(pgBin,'pg_ctl'),['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'-w','start'],{stdio:'pipe'});started=true;
  postgresPid=Number((await readFile(join(cluster,'postmaster.pid'),'utf8')).split('\n')[0]);
  admin=new pg.Client({...connection,database:'postgres'});await admin.connect();
  await admin.query('CREATE DATABASE bz_test_asset_repair');await admin.end();admin=await connect();
  receipt.postgresVersion=(await admin.query('SELECT version() AS value')).rows[0].value;
  await admin.query("CREATE ROLE asset_runtime LOGIN PASSWORD 'disposable-only'");
  for(const path of ['001_staging_staff.sql','002_staging_catalog.sql','003_staging_manual_bid.sql','009_demo_attendee_entry.sql','015_staff_event_entry.sql','016_staging_staff_assets.sql','017_asset_authority_scope.sql']) {
    const source=await readFile(join(repo,'migrations',path));loaded.set('migrations/'+path,sha(source));await admin.query(source.toString());
  }
  await admin.query(`GRANT USAGE ON SCHEMA public TO asset_runtime;
    GRANT SELECT,INSERT,UPDATE,DELETE ON bz_events,bz_lots TO asset_runtime;
    GRANT SELECT,INSERT ON bz_requests,bz_catalog_approvals,bz_catalog_lots TO asset_runtime;
    GRANT SELECT ON bz_orgs,bz_people,bz_staff_grants,bz_event_view_grants TO asset_runtime;
    GRANT UPDATE(lock_marker) ON bz_orgs,bz_people,bz_staff_grants,bz_event_view_grants TO asset_runtime;
    GRANT SELECT,INSERT,UPDATE ON bz_sessions TO asset_runtime;
    GRANT EXECUTE ON FUNCTION bz_staff_asset_put(text,uuid,uuid,text,integer,text,bytea,integer,integer),
      bz_staff_asset_recover(text,uuid,uuid),bz_staff_asset_validate(text,uuid,uuid[]),bz_staff_asset_read(text,uuid,uuid,text,uuid) TO asset_runtime`);
  await admin.query('GRANT EXECUTE ON FUNCTION bz_staff_event_entry_read(text,uuid),bz_staff_event_entry_set(text,uuid,integer,boolean,uuid) TO asset_runtime');
  for(const table of ['bz_businesses','bz_business_person_memberships','bz_org_business_memberships','bz_event_bidder_admissions'])
    await admin.query('GRANT SELECT,UPDATE(lock_marker) ON '+table+' TO asset_runtime');
  await admin.query('GRANT SELECT,INSERT,UPDATE ON bz_lot_standing TO asset_runtime; GRANT SELECT,INSERT ON bz_manual_bids,bz_bid_receipts TO asset_runtime');
  receipt.gate=(await admin.query(`WITH k AS (SELECT hashtextextended('bz-asset-authority:v1',0) AS value)
    SELECT ((value>>32)&4294967295)::text AS classid,(value&4294967295)::text AS objid FROM k`)).rows[0];
  await admin.query('INSERT INTO bz_orgs(id,name,initials) VALUES($1,\'Same name\',\'SN\'),($2,\'Same name\',\'SN\')',[org,org2]);
  await admin.query(`INSERT INTO bz_people(id,alias,name,is_test) VALUES($1,'staff-saturn','Staff',true),($2,'staff-pine','Staff Two',true)`,[person,person2]);
  await admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$3),($2,$3)',[person,person2,org]);
  await admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$3),($2,$3)',[person,person2,org2]);
  await admin.query("INSERT INTO bz_sessions(token_hash,person_id,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",[hash,person,hash2,person2]);
  await admin.query('INSERT INTO bz_events(id,org_id,created_by,draft) VALUES($1,$3,$4,$5),($2,$3,$4,$5)',[event,event2,org,person,JSON.stringify(emptyEvent('Development'))]);
  await admin.query('INSERT INTO bz_event_view_grants(person_id,event_id) VALUES($1,$2)',[person,event]);
  seedAsset=(await admin.query(putSQL,putArgs(requestId))).rows[0].value.asset.ref.slice(6);
  await admin.query("UPDATE bz_events SET draft=jsonb_set(jsonb_set(draft,'{cover}',to_jsonb($1::text)),'{coverAlt}','\"Development image\"') WHERE id=$2",['asset:'+seedAsset,event]);
  Object.assign(process.env,{BIDZIZI_APP_MODE:'local-test',BIDZIZI_STAGING_TEST_AUTH:'true',BIDZIZI_LOCAL_TEST_DATABASE:'true',APP_ORIGIN:'http://127.0.0.1:43871',
    DATABASE_URL:`postgres://asset_runtime:disposable-only@127.0.0.1:${port}/bz_test_asset_repair`});
  await seedDisjoint();
  const selected=process.argv[2];
  if(selected && !cases[selected])throw new Error('Unknown case '+selected);
  for(const [name,run] of Object.entries(cases))if(!selected||selected===name) {
    await reset();
    try {await run();receipt.cases.push({name,result:'PASS'});console.log('PASS '+name);}
    catch(e){receipt.cases.push({name,result:'FAIL',message:e.message});console.error('FAIL '+name+': '+e.message);
      process.exitCode=['57014','08006','ECONNREFUSED','ETIMEDOUT'].includes(e.code)?99:1;}
  }
} catch(e) {console.error(e);receipt.setupError=e.message;process.exitCode=99;}
finally {
  await Promise.allSettled([...pools].map(p=>p.end()));
  await Promise.allSettled(clients.map(c=>c.end()));
  if(started)execFileSync(join(pgBin,'pg_ctl'),['-D',cluster,'-m','fast','-w','stop'],{stdio:'pipe'});
  receipt.cleanup={clusterStopped:started,postgresPid,port,clusterRemoved:false,portClosed:false,processAbsent:false};
  if(postgresPid)try {process.kill(postgresPid,0);process.exitCode=1;}
  catch(error){if(error.code!=='ESRCH')throw error;receipt.cleanup.processAbsent=true;}
  receipt.cleanup.portClosed=await new Promise(resolve=>{
    const socket=createConnection({host:'127.0.0.1',port});
    socket.on('connect',()=>{socket.destroy();resolve(false);});
    socket.on('error',error=>{socket.destroy();resolve(error.code==='ECONNREFUSED');});
    socket.setTimeout(500,()=>{socket.destroy();resolve(false);});
  });
  if(!receipt.cleanup.portClosed)process.exitCode=1;
  await rm(cluster,{recursive:true,force:true});receipt.cleanup.clusterRemoved=true;
  const sourceBefore=Object.fromEntries(loaded);
  receipt.sourceBefore=sourceBefore;receipt.sourceAfter=Object.fromEntries(Object.keys(sourceBefore).map(p=>[p,sha(readFileSync(join(repo,p)))]));
  assert.deepEqual(receipt.sourceAfter,receipt.sourceBefore,'Source changed during observation');
  await writeFile(join(root,'RESULT.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Receipt '+join(root,'RESULT.json'));
}
