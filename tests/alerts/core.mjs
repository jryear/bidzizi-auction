import assert from 'node:assert/strict';
import { alertConfig, createAlertSender } from '../../src/server/v1/alert-core.ts';

const dsn = 'https://' + 'a'.repeat(32) + '@o123.ingest.us.sentry.io/456';
const env = { VERCEL: '1', BIDZIZI_APP_MODE: 'production', APP_ORIGIN: 'https://staging.bidzizi.com', BIDZIZI_SENTRY_DSN: dsn };
assert.equal(alertConfig({}), null);
assert.equal(alertConfig({ ...env, BIDZIZI_SENTRY_DSN: undefined }), null);
for (const field of [{ APP_ORIGIN: 'https://evil.test' }, { VERCEL: undefined }, { BIDZIZI_APP_MODE: 'preview' },
  { BIDZIZI_ALERT_TEST_RECEIVER: 'http://127.0.0.1:9999/envelope' }]) assert.equal(alertConfig({ ...env, ...field }), null);
for (const value of [dsn.replace('https:', 'http:'), dsn.replace('sentry.io', 'sentry.io.evil.test'), dsn + '?secret=abc',
  dsn.replace('/456', '/456/other'), dsn.replace('@', ':password@')]) assert.equal(alertConfig({ ...env, BIDZIZI_SENTRY_DSN: value }), null);
assert.equal(alertConfig(env).environment, 'staging');
assert.equal(alertConfig({ ...env, APP_ORIGIN: 'https://app.bidzizi.com' }).environment, 'production');
const local = { BIDZIZI_APP_MODE: 'local', APP_ORIGIN: 'http://127.0.0.1:3469', BIDZIZI_ALERT_TEST_RECEIVER: 'http://127.0.0.1:3470/envelope' };
assert.equal(alertConfig(local).environment, 'local');
assert.equal(alertConfig({ ...local, VERCEL: '1' }), null);
assert.equal(alertConfig({ ...local, BIDZIZI_ALERT_TEST_RECEIVER: 'https://hosted.test/envelope' }), null);
assert.equal(alertConfig({ ...local, BIDZIZI_ALERT_TEST_RECEIVER: undefined, BIDZIZI_SENTRY_DSN: dsn }), null);

let time = 1_000_000, sequence = 0, calls = [], notices = [];
const opts = { now: () => time, id: () => (++sequence).toString(16).padStart(32, '0'),
  log: n => notices.push(n), deliver: async (event, signal) => { calls.push({ event, signal }); return new Response('{}', { status: 200, headers: { date: new Date(time).toUTCString() } }); } };
const sender = createAlertSender(alertConfig(env), opts);
const secret = 'password=sensitive-person@example.test token=do-not-send SELECT * FROM staff https://provider.test/?key=secret';
const job = sender.prepare({ category: 'guest-blocked', check: 'client-error', browser: 'Safari', message: secret, detail: secret, error: new Error(secret), headers: { cookie: secret } });
assert.ok(job);
assert.equal(calls.length, 0, 'Preparing/scheduling never sends inside application transaction');
assert.equal(sender.prepare({ category: 'guest-blocked', check: 'client-error' }), null, 'Pending job deduplicates');
await Promise.all([job.run(), job.run()]);
assert.equal(calls.length, 1, 'Job dispatch is once-only even if invoked twice');
const event = calls[0].event;
assert.deepEqual(Object.keys(event).sort(), ['environment','event_id','extra','fingerprint','level','logger','message','platform','release','tags','timestamp'].sort());
assert.deepEqual(event.tags, { category: 'guest-blocked', check: 'client-error', browser: 'Safari' });
assert.ok(!JSON.stringify(calls[0].event).includes(secret) && !JSON.stringify(calls[0].event).includes(dsn));
assert.ok(!JSON.stringify(notices).includes(secret) && !JSON.stringify(notices).includes(dsn));

assert.equal(notices[0].status, 'accepted');
assert.equal(sender.prepare({ category: 'server-failure', check: 'arbitrary' }), null);
assert.equal(sender.prepare({ category: 'device', check: 'client-error' }), null);
assert.equal(sender.prepare({ category: 'server-failure', check: 'client-error' }), null);
time += 60_001;
const repeat = sender.prepare({ category: 'guest-blocked', check: 'client-error', browser: secret });
await repeat.run();
assert.equal(calls[1].event.tags.browser, 'unknown');

const bounded = createAlertSender(alertConfig(env), { ...opts, maxEntries: 2, maxPending: 2 });
const a = bounded.prepare({ category: 'server-failure', check: 'api-request' });
const b = bounded.prepare({ category: 'server-failure', check: 'framework-request' });
assert.equal(bounded.prepare({ category: 'guest-blocked', check: 'bid-sheet' }), null, 'Pending work bounded');
await Promise.all([a.run(), b.run()]);
const c = bounded.prepare({ category: 'guest-blocked', check: 'bid-sheet' });
assert.equal(bounded.stats().recent, 2, 'Dedup entries bounded'); c.cancel();
assert.equal(bounded.stats().pending, 0); await c.run();

let attempts = 0;
const failing = createAlertSender(alertConfig(env), { ...opts, deliver: async () => { attempts++; throw new Error(secret); } });
await failing.prepare({ category: 'server-failure', check: 'api-request' }).run();
assert.equal(attempts, 2, 'Only one retry');
assert.equal(failing.stats().pending, 0);
assert.ok(failing.prepare({ category: 'server-failure', check: 'api-request' }), 'Failed delivery can retry on later incident');
assert.equal(notices.at(-1).status, 'failed');

let rateCalls = 0;
const rate = createAlertSender(alertConfig(env), { ...opts, deliver: async () => { rateCalls++; return new Response('', { status: 429 }); } });
await rate.prepare({ category: 'server-failure', check: 'api-request' }).run();
assert.equal(rateCalls, 1); assert.equal(rate.prepare({ category: 'guest-blocked', check: 'client-error' }), null);
time += 60_001; assert.ok(rate.prepare({ category: 'guest-blocked', check: 'client-error' }));

const slow = createAlertSender(alertConfig(env), { ...opts, timeoutMs: 20, deliver: async (_event, signal) => new Promise((_, reject) => {
  const keepAlive = setTimeout(() => reject(new Error('test deadline')), 1000);
  signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(new Error(secret)); }, { once: true });
}) });
const start = performance.now(); await slow.prepare({ category: 'server-failure', check: 'api-request' }).run();
assert.ok(performance.now() - start < 500, 'Timeout/retry bounded');
assert.equal(createAlertSender(null, opts).prepare({ category: 'server-failure', check: 'api-request' }), null);
console.log('PASS alert core: target/config guards, strict field allowlist/redaction, deferred send, first delivery, deduplication/expiry/eviction/pending bounds, once-only dispatch, failure retry, provider backoff, timeout, disarmed mode. No network access.');
