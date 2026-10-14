import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
export function localConfig(env = process.env) {
  let origin, database;
  try { origin = new URL(env.BASE); database = new URL(env.BIDZIZI_DATABASE_URL); }
  catch { throw new Error('Explicit BASE and disposable BIDZIZI_DATABASE_URL are required.'); }
  assert.ok(origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && Number(origin.port) > 1024 &&
    origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password,
  'Local load requires an explicit http://127.0.0.1:<port> origin. Hosted targets are forbidden.');
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol) && database.hostname === '127.0.0.1' &&
    Number(database.port) > 1024 && /^\/bz_test_[a-z0-9_]+$/.test(database.pathname) && !database.search && !database.hash,
  'Local load requires a loopback disposable bz_test_* database on a dedicated port.');
  assert.equal(env.BIDZIZI_APP_MODE, 'local', 'Explicit local mode is required.');
  assert.ok(!env.VERCEL, 'Hosted environment forbidden.');
  return { base: origin.origin, database: database.toString() };
}

export function client(base, observe = () => {}) {
  const jar = new Map();
  return async (method, path, body, kind = 'setup') => {
    const begin = performance.now();
    try {
      const response = await fetch(base + path, { method, redirect: 'manual', signal: AbortSignal.timeout(15_000),
        headers: { origin: base, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      for (const set of response.headers.getSetCookie()) {
        const [key, ...value] = set.split(';')[0].split('=');
        if (/Max-Age=0/.test(set)) jar.delete(key); else jar.set(key, value.join('='));
      }
      const data = await response.json();
      observe(kind, performance.now() - begin, response.status, data, Number(response.headers.get('content-length')) || Buffer.byteLength(JSON.stringify(data)));
      return { status: response.status, data };
    } catch {
      observe(kind, performance.now() - begin, 0, {}, 0);
      throw new Error(`Request failed: ${kind} ${method} (transport, timeout or invalid response).`);
    }
  };
}

export function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted.length ? Number(sorted[Math.ceil(sorted.length * p) - 1].toFixed(2)) : null;
  return { count: sorted.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? null };
}

// Read-only HTTP handshake before any API mutation: a private random fixture must be
// visible through this app. This catches a loopback server pointed at a different DB.
export async function verifyDatabaseTarget(db, base) {
  const id = randomUUID(), name = 'Readiness database handshake ' + randomUUID();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = [...randomBytes(6)].map(byte => alphabet[byte % alphabet.length]).join('');
  const inserted = await db.query(`INSERT INTO events(id,org_id,created_by,join_code,name,status,is_practice,starts_at,ends_at,access_ends_at)
    SELECT $1,org_id,id,$2,$3,'live',true,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours'
    FROM staff WHERE email=$4 RETURNING id`, [id, code, name, process.env.HOST_EMAIL]);
  assert.equal(inserted.rowCount, 1, 'Local disposable staff fixture required.');
  try {
    const response = await fetch(base + '/api/v1/e/' + code, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200, 'Loopback app does not serve the specified disposable database.');
    const snapshot = await response.json(); assert.equal(snapshot.event.id, id); assert.equal(snapshot.event.name, name);
  } finally { await db.query('DELETE FROM events WHERE id=$1 AND is_practice AND name=$2', [id, name]); }
}
