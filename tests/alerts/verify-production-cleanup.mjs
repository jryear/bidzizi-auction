#!/usr/bin/env node
// Independent read-only verification after the rehearsal. No API writes or application traffic.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { providers } from '../load/staging-provider.mjs';

const input = JSON.parse(await readFile('docs/evidence/nov19/alerts-production-proof.json', 'utf8'));
assert.ok(input.finishedAt && input.cleanup.confirmed);
assert.match(input.fixtureSlug, /^nov19-alert-[a-f0-9]{12}$/);
const email = 'nov19-alert-' + input.fixtureSlug.slice('nov19-alert-'.length) + '@example.test';
const emailHash = createHash('sha256').update('email:' + email).digest('hex');
const eventIds = input.eventId ? [input.eventId] : [];
const p = await providers(), result = { verifiedAt: new Date().toISOString(), readOnly: true, targets: {} };
for (const label of ['staging', 'production']) {
  const db = await p.database(label, 'independent-cleanup-' + label, true);
  try {
    const row = (await db.query(`SELECT
      (SELECT count(*)::int FROM orgs WHERE id=$1 OR slug=$2) orgs,
      (SELECT count(*)::int FROM staff WHERE id=$3 OR org_id=$1 OR email=$4) staff,
      (SELECT count(*)::int FROM events WHERE org_id=$1 OR id=ANY($5::uuid[])) events,
      (SELECT count(*)::int FROM items WHERE org_id=$1 OR event_id=ANY($5::uuid[])) items,
      (SELECT count(*)::int FROM participants WHERE event_id=ANY($5::uuid[])) participants,
      (SELECT count(*)::int FROM bids WHERE event_id=ANY($5::uuid[])) bids,
      (SELECT count(*)::int FROM standings WHERE event_id=ANY($5::uuid[])) standings,
      (SELECT count(*)::int FROM staff_requests WHERE staff_id=$3) staff_requests,
      (SELECT count(*)::int FROM staff_sessions WHERE staff_id=$3) staff_sessions,
      (SELECT count(*)::int FROM staff_password_tokens WHERE staff_id=$3 OR issued_by=$3) staff_password_tokens,
      (SELECT count(*)::int FROM client_reports WHERE org_id=$1 OR staff_id=$3 OR event_id=ANY($5::uuid[])) client_reports,
      (SELECT count(*)::int FROM login_attempts WHERE email_hash=$6) login_attempts`,
    [input.orgId, input.fixtureSlug, input.staffId, email, eventIds, emailHash])).rows[0];
    assert.ok(Object.values(row).every(x => x === 0), 'Owned fixtures must be absent');
    result.targets[label] = row;
  } finally { await db.end(); }
}
result.confirmed = true;
await writeFile('docs/evidence/nov19/alerts-production-cleanup-proof.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
