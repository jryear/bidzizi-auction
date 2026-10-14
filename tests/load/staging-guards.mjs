import assert from 'node:assert/strict';
import { stagingTransport, STAGING_ORIGIN } from './staging-transport.mjs';

let fetches = 0;
const fake = async () => { fetches++; return Response.json({ ok: true }); };
for (const origin of ['https://app.bidzizi.com', STAGING_ORIGIN + '/', 'http://staging.bidzizi.com', 'https://staging.bidzizi.com.evil.test'])
  assert.throws(() => stagingTransport({ origin, fetcher: fake }));
const t = stagingTransport({ origin: STAGING_ORIGIN, fetcher: fake });
for (const path of ['https://app.bidzizi.com/api/v1/host/events', '//app.bidzizi.com', '/api/v1/host/../events', '/api/v1/host/events?next=x'])
  await assert.rejects(t.client()('POST', path, {}));
assert.equal(fetches, 0);
for (const response of [
  () => new Response('challenge', { status: 429 }),
  () => new Response('challenge', { headers: { 'x-vercel-mitigated': 'challenge' } }),
  () => new Response('Vercel Security Checkpoint', { status: 403, headers: { 'content-type': 'text/html' } }),
  () => new Response('', { status: 307, headers: { location: 'https://app.bidzizi.com' } }),
  () => Response.json({}, { status: 403 }),
  () => new Response('bad', { headers: { 'x-vercel-error': 'BLOCKED' } }),
]) {
  let calls = 0;
  const guarded = stagingTransport({ origin: STAGING_ORIGIN, fetcher: async () => { calls++; return response(); } });
  await assert.rejects(guarded.client()('GET', '/api/v1/e/ABCDEF'));
  assert.ok(guarded.stopped);
  await assert.rejects(guarded.client()('GET', '/api/v1/e/ABCDEF'));
  assert.equal(calls, 1, 'No request after stop');
}
const normal = stagingTransport({ origin: STAGING_ORIGIN, fetcher: async () => Response.json({ receipt: { accepted: false, reason: 'CLOSED' } }, { status: 409 }) });
assert.equal((await normal.client()('POST', '/api/v1/e/ABCDEF/bid', {})).status, 409);
assert.equal(normal.stopped, null);
console.log('Staging guards passed: exact origin, paths, redirect refusal, challenge/block/429 stop, no retries, legitimate bid rejection. No network requests.');
