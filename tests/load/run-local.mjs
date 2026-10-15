#!/usr/bin/env node
// Owns one disposable cluster and production server. Stops both even when a check fails.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { sleep } from './support.mjs';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24.');
assert.equal(execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(), '12.4.2');
const pgBin = process.env.LOAD_PG_BIN ?? '/opt/homebrew/opt/postgresql@18/bin';
const appPort = Number(process.env.LOAD_APP_PORT ?? 3469), pgPort = Number(process.env.LOAD_PG_PORT ?? 55469);
assert.notEqual(appPort, pgPort, 'App and database need distinct dedicated ports.');
for (const port of [appPort, pgPort]) {
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
  await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', () => reject(new Error(`Port ${port} is occupied; select a dedicated port.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const directory = await mkdtemp(join(tmpdir(), 'bz-nov19-'));
const env = { ...process.env, BIDZIZI_APP_MODE: 'local', BASE: `http://127.0.0.1:${appPort}`,
  APP_ORIGIN: `http://127.0.0.1:${appPort}`, BIDZIZI_DATABASE_URL: `postgres://bz@127.0.0.1:${pgPort}/bz_test_nov19`,
  BIDZIZI_STAFF_PASSWORD: randomBytes(24).toString('hex'), HOST_EMAIL: 'readiness@example.test', NEXT_TELEMETRY_DISABLED: '1' };
env.HOST_PASSWORD = env.BIDZIZI_STAFF_PASSWORD;
delete env.VERCEL;
let app, pgStarted = false, current;
async function run(command, args, extra = {}) {
  const child = spawn(command, args, { env: { ...env, ...extra }, stdio: 'inherit' }); current = child;
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  current = null; assert.equal(exit, 0, `Failed: ${command} ${args.join(' ')}`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { current?.kill(signal); app?.kill(signal); process.exitCode = 1; });
try {
  await run(process.execPath, ['tests/load/guards.mjs']);
  await run(process.execPath, ['tests/load/cpu-check.mjs']);
  await run(join(pgBin, 'initdb'), ['-D', directory, '-U', 'bz', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  await run(join(pgBin, 'pg_ctl'), ['-D', directory, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${pgPort} -k ${directory} -c shared_preload_libraries=pg_stat_statements`, '-w', 'start']);
  pgStarted = true;
  await run(join(pgBin, 'createdb'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'bz', 'bz_test_nov19']);
  await run(join(pgBin, 'psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'bz', '-d', 'bz_test_nov19', '-c', 'CREATE EXTENSION pg_stat_statements']);
  await run(process.execPath, ['scripts/prod-migrate.mjs']);
  await run(process.execPath, ['scripts/provision-staff.mjs', '--org', 'readiness', '--org-name', 'Disposable readiness', '--email', env.HOST_EMAIL, '--name', 'Local readiness']);
  await run('pnpm', ['typecheck']); await run('pnpm', ['build']);
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(appPort)], { env, stdio: 'inherit' });
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null || app.signalCode !== null) throw new Error('Production server exited during startup.');
    if (await fetch(env.BASE + '/join').then(r => r.ok).catch(() => false)) break;
    assert.ok(i < 99, 'Production server did not become ready.'); await sleep(200);
  }
  env.LOAD_APP_PID = String(app.pid);
  env.LOAD_PG_PID = (await readFile(join(directory, 'postmaster.pid'), 'utf8')).split('\n')[0];
  if (!process.argv.includes('--checks-only')) {
    for (const phones of [50, 150, 300]) {
      console.log(`Starting full local workload: ${phones} phones`);
      await run(process.execPath, ['tests/load/local.mjs'], { PHONES: String(phones), LOAD_LABEL: process.env.LOAD_LABEL ?? 'baseline' });
    }
  }
  if (process.env.NOV19_ALERT_CHECKS === '1') await run(process.execPath, ['tests/alerts/journey.mjs']);
  await run('pnpm', ['compat']);
  for (const suite of ['journey', 'bid-sheet', 'simple-ui', 'compat-api']) await run(process.execPath, [`tests/v1/${suite}.mjs`]);
  await run(process.execPath, ['tests/load/resilience.mjs']);
} finally {
  if (app && app.exitCode === null && app.signalCode === null) { app.kill('SIGTERM'); await new Promise(resolve => app.once('exit', resolve)); }
  if (pgStarted) await run(join(pgBin, 'pg_ctl'), ['-D', directory, '-m', 'fast', '-w', 'stop']);
  await rm(directory, { recursive: true, force: true });
  console.log('Owned app and disposable Postgres stopped; temporary cluster removed.');
}
