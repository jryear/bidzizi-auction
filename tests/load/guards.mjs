import assert from 'node:assert/strict';
import { localConfig } from './support.mjs';
const valid = { BASE: 'http://127.0.0.1:3469', BIDZIZI_DATABASE_URL: 'postgres://bz@127.0.0.1:55469/bz_test_load', BIDZIZI_APP_MODE: 'local' };
assert.equal(localConfig(valid).base, valid.BASE);
for (const BASE of [undefined, 'https://staging.bidzizi.com', 'https://app.bidzizi.com', 'http://localhost:3469', 'http://127.0.0.1:80', 'http://127.0.0.1:3469/path', 'http://user:pass@127.0.0.1:3469', 'http://127.0.0.1:3469?redirect=hosted'])
  assert.throws(() => localConfig({ ...valid, BASE }));
for (const BIDZIZI_DATABASE_URL of [undefined, 'postgres://bz@host.neon.tech/db', 'postgres://bz@127.0.0.1:55469/production', 'postgres://bz@127.0.0.1:5432/bz_test_load?host=remote', 'postgres://bz@localhost:55469/bz_test_load'])
  assert.throws(() => localConfig({ ...valid, BIDZIZI_DATABASE_URL }));
assert.throws(() => localConfig({ ...valid, VERCEL: '1' }));
assert.throws(() => localConfig({ ...valid, BIDZIZI_APP_MODE: 'production' }));
console.log('PASS local load target guards (no network access).');
