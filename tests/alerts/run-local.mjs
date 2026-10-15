#!/usr/bin/env node
// Owns a loopback envelope receiver; the existing runner owns disposable DB/app cleanup.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const events = [];
let failing = false;
const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && ['/mode/fail', '/mode/ok'].includes(request.url)) {
    failing = request.url.endsWith('/fail'); response.end('ok'); return;
  }
  if (request.method === 'GET' && request.url === '/events') {
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(events)); return;
  }
  if (request.method !== 'POST' || request.url !== '/envelope') { response.writeHead(404).end(); return; }
  try {
    let body = ''; for await (const part of request) { body += part; assert.ok(body.length < 20_000); }
    const [header, item, payload] = body.trim().split('\n');
    const event = JSON.parse(payload);
    assert.equal(JSON.parse(header).event_id, event.event_id); assert.equal(JSON.parse(item).type, 'event'); if (JSON.parse(item).length !== undefined) assert.equal(JSON.parse(item).length, Buffer.byteLength(payload));
    events.push({ receivedAt: new Date().toISOString(), event, simulatedStatus: failing ? 503 : 200 });
    assert.ok(events.length <= 100);
    response.writeHead(failing ? 503 : 200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ id: event.event_id }));
  } catch { response.writeHead(400).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const appFiles = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' }).trim().split('\n').concat(['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','next.config.ts','tsconfig.json','vercel.json','postcss.config.mjs']).sort();
const manifest = Object.fromEntries(await Promise.all(appFiles.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])));
try {
  for (const suite of ['core', 'sdk']) execFileSync(process.execPath, [`tests/alerts/${suite}.mjs`], { stdio: 'inherit' });
  const child = spawn(process.execPath, ['tests/load/run-local.mjs', '--checks-only'], {
    env: { ...process.env, NOV19_ALERT_CHECKS: '1', BIDZIZI_ALERT_TEST_RECEIVER: `http://127.0.0.1:${port}/envelope`,
      ALERT_RECEIVER: `http://127.0.0.1:${port}` }, stdio: 'inherit' });
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(exit, 0, 'Disposable alert integration/regression checks');
  const current = Object.fromEntries(await Promise.all(appFiles.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])));
  assert.deepEqual(current, manifest, 'Application source must not change while tests run');
  const bundleFiles = execFileSync('rg', ['--files', '.next/static', '-g', '*.js'], { encoding: 'utf8' }).trim().split('\n');
  for (const p of bundleFiles) assert.ok(!/BIDZIZI_SENTRY_DSN|sentry_key=|BidZizi alert /.test(await readFile(p,'utf8')), 'Server alert credentials/transport must not enter client bundles');
  await writeFile('docs/evidence/nov19/alerts-validation.json', JSON.stringify({ passed: true, validatedAt: new Date().toISOString(),
    appDigest: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), manifest,
    checks: ['alert core unit tests','actual Sentry SDK privacy/delivery tests','typecheck','production build','local alert integration/receiver failure','compatibility','55/55 journey','Chromium/WebKit bid-sheet','Chromium/WebKit simple mode','8/8 telemetry','Chromium/WebKit poor-network','client-bundle isolation'],
    clientBundlesScanned: bundleFiles.length }, null, 2) + '\n');
} finally { await new Promise(resolve => server.close(resolve)); }
