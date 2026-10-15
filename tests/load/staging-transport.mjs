import assert from 'node:assert/strict';

export const STAGING_ORIGIN = 'https://staging.bidzizi.com';
// A separate hosted driver: the local harness's loopback/database guards stay intact.
export function stagingTransport({ origin, fetcher = fetch, observe = () => {} }) {
  assert.equal(origin, STAGING_ORIGIN, 'Only the explicitly approved staging custom domain is permitted.');
  const controller = new AbortController();
  let stopped = null, requests = 0;
  function stop(reason) {
    stopped ??= { at: new Date().toISOString(), ...reason };
    controller.abort();
  }
  function client() {
    const jar = new Map();
    return async (method, path, body, kind = 'setup') => {
      assert.ok(/^\/api\/v1\/(?:host(?:\/|$)|e\/[A-HJ-NP-Z2-9]{6}(?:\/|$))/.test(path) &&
        !/[?#\\]/.test(path) && !path.includes('..'), 'Only bounded staging API paths are allowed.');
      if (stopped) throw new Error('Rehearsal stopped; no further application requests permitted.');
      const begin = performance.now();
      try {
        requests++;
        const r = await fetcher(origin + path, { method, redirect: 'manual',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          headers: { origin, 'user-agent': 'BidZizi-Nov19-Rehearsal/1.0',
            cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
            ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body) });
        const mitigated = r.headers.get('x-vercel-mitigated'), platformError = r.headers.get('x-vercel-error');
        // Any 429 stops, even if application-generated. Never retry or evade platform controls.
        if (r.status === 429 || mitigated || platformError || (r.status >= 300 && r.status < 400)) {
          stop({ kind, status: r.status, reason: r.status === 429 ? '429' : mitigated ? 'platform challenge' :
            platformError ? 'platform error/block' : 'redirect refused' });
          throw new Error('Platform stop condition.');
        }
        const raw = await r.text();
        if (!r.headers.get('content-type')?.includes('application/json') || /Vercel Security Checkpoint|verify you are human/i.test(raw)) {
          stop({ kind, status: r.status, reason: 'Non-JSON response or platform checkpoint/block' });
          throw new Error('Platform stop condition.');
        }
        const data = JSON.parse(raw);
        if (r.status === 403) {
          stop({ kind, status: 403, reason: 'Forbidden/block' });
          throw new Error('Block stop condition.');
        }
        for (const set of r.headers.getSetCookie()) {
          const [key, ...value] = set.split(';')[0].split('=');
          if (/Max-Age=0/.test(set)) jar.delete(key); else jar.set(key, value.join('='));
        }
        const id = r.headers.get('x-bidzizi-alert-id');
        const result = { status: r.status, data, alertId: /^[a-f0-9]{32}$/.test(id ?? '') ? id : null };
        observe(kind, performance.now() - begin, result, Buffer.byteLength(raw));
        return result;
      } catch {
        if (!stopped) stop({ kind, status: 0, reason: 'Transport/timeout/invalid response' });
        throw new Error('Rehearsal request stopped (safe details in stop receipt).');
      }
    };
  }
  return { client, stop, get stopped() { return stopped; }, get requests() { return requests; } };
}
