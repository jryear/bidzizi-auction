import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { HarnessError,pgBin } from './staff-proof-harness.mjs';

export const ids = {
  saturn:'10000000-0000-4000-8000-000000000001',
  pine:'10000000-0000-4000-8000-000000000002',
  staff:'20000000-0000-4000-8000-000000000001',
  outsider:'20000000-0000-4000-8000-000000000002',
};
export const uuid = () => randomUUID();
export const configuration = {
  environment({ appUrl,origin,production=false,disabled=false,customPreview=false,unsafeOrigin=false,unsafeDatabase=false }) {
    return {
      DATABASE_URL:unsafeDatabase ? appUrl.replace('/bz_test_','/unscoped_') : appUrl,
      APP_ORIGIN:customPreview || unsafeOrigin ? 'https://staging.bidzizi.com' : origin,
      BIDZIZI_STAGING_TEST_AUTH:disabled ? 'false' : 'true',
      BIDZIZI_LOCAL_TEST_DATABASE:'true',
      BIDZIZI_APP_MODE:production || customPreview ? 'staging' : 'local-test',
      ...(production || customPreview ? { VERCEL:'1',VERCEL_ENV:production ? 'production' : 'preview',VERCEL_URL:'evidence.vercel.app' } : {}),
    };
  },
  async initialize({ repo,appUrl,db,env }) {
    const migration=join(repo,'migrations/001_staging_staff.sql');
    try { await access(migration); }
    catch { assert.fail('Staff schema migration is absent on this tree.'); }
    const migrated=spawnSync(join(pgBin,'psql'),['--dbname',appUrl,'-v','ON_ERROR_STOP=1','-f',migration],{
      env,encoding:'utf8',timeout:30_000,maxBuffer:1024*1024,
    });
    if (migrated.error) throw new HarnessError(`Migration runner unavailable (${migrated.error.code}).`);
    assert.equal(migrated.status,0,'Application migration must execute successfully in the disposable database.');
    await db.query(await readFile(join(repo,'tests/acceptance/staff-drafts/seed.sql'),'utf8'));
  },
};
export function noStore(response) {
  assert.match(response.headers.get('cache-control') || '',/no-store/i,'Private data must be uncached.');
}
export function error(response,status,code) {
  assert.equal(response.status,status,`Expected HTTP ${status} (${code}), got ${response.status}.`);
  assert.equal(response.data?.error?.code,code);
  noStore(response);
  assert.ok(typeof response.data.error.message === 'string');
  assert.doesNotMatch(response.text,/postgres(?:ql)?:|password|token_hash|\.neon\.tech|stack|SELECT |INSERT /i,'Errors must not expose internal credentials or SQL.');
}
export async function login(f,account='staff-saturn') {
  const response=await f.request('/api/test-auth/login',{ method:'POST',json:{account},headers:{origin:f.origin} });
  assert.equal(response.status,200,'Seeded test staff login must exist and succeed.');
  noStore(response);
  const raw=response.headers.get('set-cookie') || '';
  assert.match(raw,/bz_session=/);
  assert.match(raw,/HttpOnly/i);
  assert.match(raw,/SameSite=Lax/i);
  const cookie=raw.split(';')[0];
  const token=cookie.slice(cookie.indexOf('=')+1);
  assert.match(token,/^[A-Za-z0-9_-]{43}$/,'Cookie must encode a 32-byte opaque token; generator security is a separate implementation review.');
  return { cookie,token,account };
}
export function mutate(f,session,path,method,json,extra={}) {
  return f.request(path,{ method,json,cookie:session.cookie,headers:{ origin:f.origin,...extra } });
}
export async function create(f,session,name='Evidence event',organizationId=ids.saturn,requestId=uuid()) {
  const response=await mutate(f,session,'/api/admin/events','POST',{ organizationId,name,requestId });
  assert.equal(response.status,201,'Authorized staff can create an organization-owned draft.');
  noStore(response);
  assert.equal(response.data.draft.org.id,organizationId);
  assert.equal(response.data.draft.event.name,name);
  assert.ok(Number.isInteger(response.data.draft.revision));
  return { response,draft:response.data.draft,requestId };
}
export function compact(packet) {
  const event=Object.fromEntries(['name','eyebrow','welcome','venue','cover','date','start','end','timezone','increment','sponsorsEnabled','sponsors'].map(k=>[k,packet.event[k]]));
  const lots=packet.lots.map(l=>Object.fromEntries(['id','title','short','description','category','image','alt','opening','includes','fine','windowId'].map(k=>[k,l[k]])));
  return { event,lots };
}
export function lot(title='New lot') {
  return { id:uuid(),title,short:'',description:'',category:'',image:null,alt:'',opening:null,includes:[],fine:'',windowId:null };
}
export async function update(f,session,packet,draft,requestId=uuid()) {
  const body={ expectedRevision:packet.revision,requestId,draft };
  const response=await mutate(f,session,`/api/admin/events/${packet.event.id}`,'PUT',body);
  assert.equal(response.status,200,'Authorized draft save must succeed.');
  noStore(response);
  return { response,body,draft:response.data.draft };
}
export async function read(f,session,eventId) {
  const response=await f.request(`/api/admin/events/${eventId}`,{cookie:session.cookie});
  assert.equal(response.status,200); noStore(response);
  return response.data.draft;
}
export async function storedEvent(f,eventId) {
  return {
    events:(await f.db.query('SELECT * FROM bz_events WHERE id=$1 ORDER BY id',[eventId])).rows,
    lots:(await f.db.query('SELECT * FROM bz_lots WHERE event_id=$1 ORDER BY position,id',[eventId])).rows,
    requests:(await f.db.query('SELECT * FROM bz_requests ORDER BY actor_id,operation,request_id')).rows,
  };
}
export async function assertStoredDraft(f,eventId,expected) {
  const events=await f.db.query('SELECT draft FROM bz_events WHERE id=$1',[eventId]);
  const lots=await f.db.query('SELECT position,data FROM bz_lots WHERE event_id=$1 ORDER BY position',[eventId]);
  assert.equal(events.rows.length,1);
  assert.deepEqual(events.rows[0].draft,expected.event,'Complete event JSON must match durable SQL storage.');
  assert.deepEqual(lots.rows.map(row=>row.position),expected.lots.map((_,index)=>index),'Lot positions must remain contiguous in submitted order.');
  assert.deepEqual(lots.rows.map(row=>row.data),expected.lots,'Complete compact lot data must match durable SQL storage in submitted order.');
}
