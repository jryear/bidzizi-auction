import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile, access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export class HarnessError extends Error {}
export class ApplicationFailure extends Error {}
// A reachable application error/timeout is a candidate failure. It cannot prove
// feature absence on a baseline; mark that baseline unverifiable, never valid RED.
export function evidenceExit(error) {
  if (error instanceof HarnessError) return 99;
  if (error instanceof ApplicationFailure && process.env.VERIFY_TREE === 'base') return 99;
  return 1;
}
function timedOut(error) { return error?.name === 'TimeoutError' || error?.name === 'AbortError'; }
export function browserFailure(error, operation) {
  if (timedOut(error)) return new ApplicationFailure(`Reached application did not complete ${operation} before its deadline.`);
  if (/browser.*closed|target.*closed|page.*closed|crash|disconnected|net::ERR_(?:CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|NAME_NOT_RESOLVED)/i.test(error?.message || '')) return new HarnessError(`Browser/network infrastructure unavailable during ${operation}.`);
  return error;
}
export const node24 = '/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
export const pgBin = '/opt/homebrew/opt/postgresql@18/bin';
const repo = resolve(process.env.VERIFY_ROOT || process.cwd());

async function port() {
  return new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once('error', error => reject(new HarnessError(`Loopback port allocation failed: ${error.code}`)));
    socket.listen(0, '127.0.0.1', () => {
      const value = socket.address().port;
      socket.close(error => error ? reject(new HarnessError('Port release failed.')) : resolvePort(value));
    });
  });
}

// Never forward DATABASE_URL, .env credentials, provider tokens, VERCEL variables,
// or inherited application flags into a disposable test app.
function isolatedEnv(extra = {}) {
  return {
    PATH: `${join(node24, '..')}:${pgBin}:/usr/bin:/bin`,
    HOME: process.env.HOME || tmpdir(), TMPDIR: tmpdir(), LANG: 'en_US.UTF-8',
    NEXT_TELEMETRY_DISABLED: '1', ...extra,
  };
}

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd:repo, env:isolatedEnv(), encoding:'utf8', timeout:60_000,
    maxBuffer:2 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    throw new HarnessError(`Disposable setup command failed (${binary.split('/').at(-1)}; ${result.error?.code || result.status}).`);
  }
  return result.stdout;
}

export async function request(origin, path, { method='GET', json, headers={}, cookie } = {}) {
  let response,text;
  try {
    response = await fetch(`${origin}${path}`, {
      method, redirect:'manual', signal:AbortSignal.timeout(20_000),
      headers:{ ...(json === undefined ? {} : { 'content-type':'application/json' }), ...headers, ...(cookie ? { cookie } : {}) },
      ...(json === undefined ? {} : { body:JSON.stringify(json) }),
    });
    text=await response.text();
  } catch (error) {
    if (timedOut(error)) throw new ApplicationFailure('Reached test application did not complete an HTTP response within 20 seconds.');
    throw new HarnessError(`Test HTTP request unavailable (${error.name}).`);
  }
  if (response.status === 500) throw new ApplicationFailure('Reached test application returned HTTP 500.');
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status:response.status, headers:response.headers, data, text };
}

async function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  await Promise.race([
    new Promise(done => child.once('exit',done)),
    new Promise(done => setTimeout(done,5_000)),
  ]);
  if (child.exitCode === null) { try { process.kill(-child.pid,'SIGKILL'); } catch {} }
}

export async function withFixture(run, configuration) {
  const environmentFiles=(await readdir(repo)).filter(name=>/^\.env(?:\.|$)/.test(name) && name!=='.env.example');
  if (environmentFiles.length) throw new HarnessError('Refusing a tree containing runtime .env files; independent evidence must not auto-load credentials.');
  for (const binary of [node24, `${pgBin}/initdb`, `${pgBin}/pg_ctl`, `${pgBin}/psql`]) {
    try { await access(binary); } catch { throw new HarnessError('Required local PostgreSQL18/Node24 executable is unavailable.'); }
  }
  // Darwin's PostgreSQL Unix-socket path limit is shorter than its default TMPDIR.
  const scratch = await mkdtemp(join('/tmp',`bz-staff-${process.env.VERIFY_TREE || 'manual'}-`));
  const cluster = join(scratch,'cluster'), socket = join(scratch,'socket'), passwordFile = join(scratch,'pw');
  const adminPassword = randomBytes(24).toString('hex'), appPassword = randomBytes(24).toString('hex');
  const dbPort = await port(), appPort = await port(), origin = `http://127.0.0.1:${appPort}`;
  const adminConnection = { host:'127.0.0.1', port:dbPort, database:'postgres', user:'evidence_admin', password:adminPassword };
  const dbName = `bz_test_${randomBytes(6).toString('hex')}`, appUser = `app_${randomBytes(6).toString('hex')}`;
  const appUrl = `postgresql://${appUser}:${appPassword}@127.0.0.1:${dbPort}/${dbName}`;
  let started=false, app, admin;
  const additional=[];
  try {
    await mkdir(socket);
    await writeFile(passwordFile,adminPassword,{ mode:0o600 });
    command(`${pgBin}/initdb`,['-D',cluster,'-U','evidence_admin','--encoding=UTF8','--no-locale','--auth=scram-sha-256','--pwfile',passwordFile]);
    command(`${pgBin}/pg_ctl`,['-D',cluster,'-l',join(scratch,'postgres.log'),'-o',`-h 127.0.0.1 -p ${dbPort} -k ${socket}`,'-w','start']);
    started=true;
    admin = new pg.Client(adminConnection);
    try { await admin.connect(); await admin.query('SELECT 1'); } catch { throw new HarnessError('Disposable PostgreSQL connection failed.'); }
    try {
      await admin.query(`CREATE ROLE ${appUser} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
      await admin.query(`CREATE DATABASE ${dbName} OWNER ${appUser}`);
      await admin.end();
      admin = new pg.Client({ ...adminConnection, database:dbName });
      await admin.connect();
    } catch { throw new HarnessError('Disposable database allocation/connection failed.'); }

    async function startApp(overrides={}) {
      const listener = overrides.port || appPort, baseOrigin = `http://127.0.0.1:${listener}`;
      const env = isolatedEnv(configuration.environment({ appUrl, origin:baseOrigin, ...overrides }));
      const child = spawn(node24,['--require',process.argv[2],join(repo,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(listener)],{
        cwd:repo,env,detached:true,stdio:['ignore','pipe','pipe'],
      });
      let output='',responseTimedOut=false;
      child.stdout.on('data',data=>{ output=(output+data).slice(-20_000); });
      child.stderr.on('data',data=>{ output=(output+data).slice(-20_000); });
      child.on('error',()=>{});
      const deadline=Date.now()+60_000;
      while (Date.now()<deadline) {
        if (child.exitCode!==null) throw new HarnessError(`Next test service exited before readiness (${child.exitCode}).`);
        let response;
        try {
          response=await fetch(`${baseOrigin}/`,{ signal:AbortSignal.timeout(3_000) });
        } catch (error) { if (timedOut(error)) responseTimedOut=true; }
        if (response) {
          if (response.status >= 500) {
            await killTree(child);
            throw new ApplicationFailure(`Reached test application returned HTTP ${response.status} during startup.`);
          }
          return { child,origin:baseOrigin,env };
        }
        await new Promise(done=>setTimeout(done,300));
      }
      await writeFile(join(scratch,`next-${listener}.log`),output);
      await killTree(child);
      if (responseTimedOut) throw new ApplicationFailure('Next process accepted requests but failed to respond within its startup deadline.');
      throw new HarnessError('Next test service remained unreachable within 60 seconds.');
    }

    // Exercise infrastructure even on frozen base. Missing application routes
    // are ordinary RED; unavailable local infrastructure is reserved exit99.
    app=await startApp();
    const fixture={
      repo,scratch,origin,appUrl,db:admin,
      request:(path,options)=>request(origin,path,options),
      async initialize() { await configuration.initialize({ repo,appUrl,origin,db:admin,env:app.env,command }); },
      async rejectLotWrites(reject) {
        if (reject) await admin.query(`
          CREATE FUNCTION evidence_reject_lot_write() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'INDEPENDENT_STAFF_WRITE_REJECT'; END $$;
          CREATE TRIGGER evidence_lot_write_rejected BEFORE INSERT OR UPDATE ON bz_lots
          FOR EACH ROW EXECUTE FUNCTION evidence_reject_lot_write();
        `);
        else await admin.query('DROP TRIGGER IF EXISTS evidence_lot_write_rejected ON bz_lots; DROP FUNCTION IF EXISTS evidence_reject_lot_write();');
      },
      async alternative(overrides={}) {
        // Next dev has a per-tree lock: replace only this harness's own process.
        await killTree(app.child);
        const value=await startApp({ ...overrides,port:await port() });
        additional.push(value.child);
        app=value;
        return { ...value,request:(path,options)=>request(value.origin,path,options) };
      },
    };
    return await run(fixture);
  } finally {
    for (const child of additional.reverse()) await killTree(child);
    await killTree(app?.child);
    if (admin) { try { await admin.end(); } catch {} }
    if (started) { try { command(`${pgBin}/pg_ctl`,['-D',cluster,'-m','immediate','-w','stop']); } catch {} }
    await rm(scratch,{ recursive:true,force:true });
  }
}
