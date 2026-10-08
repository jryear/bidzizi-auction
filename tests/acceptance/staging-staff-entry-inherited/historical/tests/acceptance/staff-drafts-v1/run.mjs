import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium,expect } from '@playwright/test';
import { withFixture,HarnessError } from './harness.mjs';
import { configuration,ids,uuid,noStore,error,login,mutate,create,compact,lot,update,read } from './protocol.mjs';

const mode=process.argv[2];
if (!['acceptance','adversarial'].includes(mode)) { console.error('Evidence mode must be acceptance or adversarial.'); process.exit(99); }
let count=0;
function passed(label) { count++; console.log(`PASS ${count}: ${label}`); }

async function acceptance(f) {
  const initial=await f.request('/api/session');
  assert.equal(initial.status,200,'Session API exists.');
  assert.deepEqual(initial.data,{ authenticated:false,testMode:true }); noStore(initial);
  await f.initialize();
  const staff=await login(f);
  const session=await f.request('/api/session',{cookie:staff.cookie});
  assert.equal(session.data.authenticated,true);
  assert.equal(session.data.testMode,true);
  assert.equal(session.data.person.id,ids.staff);
  assert.deepEqual(session.data.staffOrganizations.map(o=>o.id),[ids.saturn]);
  const storedSession=await f.db.query('SELECT token_hash,person_id FROM bz_sessions WHERE person_id=$1',[ids.staff]);
  assert.ok(storedSession.rows.some(r=>r.token_hash===createHash('sha256').update(staff.token).digest('hex')));
  assert.ok(storedSession.rows.every(r=>r.token_hash!==staff.token));
  passed('Clearly test-mode session derives person and organization grants from PostgreSQL; opaque cookie is stored only hashed.');

  const created=await create(f,staff);
  const again=await mutate(f,staff,'/api/admin/events','POST',{ organizationId:ids.saturn,name:'Evidence event',requestId:created.requestId });
  assert.equal(again.status,201); assert.deepEqual(again.data,created.response.data);
  error(await mutate(f,staff,'/api/admin/events','POST',{organizationId:ids.saturn,name:'Changed create payload',requestId:created.requestId}),409,'IDEMPOTENCY_CONFLICT');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_events WHERE id=$1',[created.draft.event.id])).rows[0].n,1);
  passed('Create retry returns one durable event and identical receipt.');

  const incomplete=compact(created.draft);
  incomplete.event.name='Saved event'; incomplete.event.welcome='Welcome to the test auction.';
  incomplete.event.increment=null; incomplete.event.date=''; incomplete.event.start=''; incomplete.event.end='';
  incomplete.lots=[lot('First incomplete lot'),lot('Second incomplete lot')];
  const saved=await update(f,staff,created.draft,incomplete,created.requestId);
  assert.equal(saved.draft.revision,created.draft.revision+1);
  assert.ok(Number.isFinite(Date.parse(saved.draft.savedAt)));
  assert.equal(saved.draft.lots.length,2);
  assert.ok(saved.draft.lots.every(l=>l.provider==='Saturn Barter' && l.current===0 && l.count===0 && l.history.length===0));
  const dbEvent=(await f.db.query('SELECT revision,draft,org_id FROM bz_events WHERE id=$1',[saved.draft.event.id])).rows[0];
  const dbLots=await f.db.query('SELECT id,org_id,position,data FROM bz_lots WHERE event_id=$1 ORDER BY position',[saved.draft.event.id]);
  assert.equal(dbEvent.revision,saved.draft.revision); assert.equal(dbEvent.org_id,ids.saturn);
  assert.equal(dbLots.rows.length,2);
  assert.deepEqual(dbLots.rows.map(r=>r.id),incomplete.lots.map(l=>l.id));
  assert.ok(dbLots.rows.every(r=>r.org_id===ids.saturn));
  const freshSession=await login(f);
  assert.deepEqual(await read(f,freshSession,saved.draft.event.id),saved.draft);
  passed('Incomplete event and lot drafts persist atomically; an independent session reads the same DB-confirmed revision.');

  const reordered=compact(saved.draft); reordered.lots.reverse();
  const next=await update(f,staff,saved.draft,reordered);
  assert.deepEqual(next.draft.lots.map(l=>l.id),reordered.lots.map(l=>l.id));
  const retry=await mutate(f,staff,`/api/admin/events/${saved.draft.event.id}`,'PUT',saved.body);
  assert.equal(retry.status,200); assert.deepEqual(retry.data,saved.response.data);
  assert.deepEqual(await read(f,staff,saved.draft.event.id),next.draft,'Old retry must not revert later saved work.');
  const changed=structuredClone(saved.body); changed.draft.event.name='Same key changed payload';
  error(await mutate(f,staff,`/api/admin/events/${saved.draft.event.id}`,'PUT',changed),409,'IDEMPOTENCY_CONFLICT');
  error(await mutate(f,staff,`/api/admin/events/${saved.draft.event.id}`,'PUT',{...saved.body,requestId:uuid()}),409,'REVISION_CONFLICT');
  passed('Ordered lots, idempotent recovery, changed-key rejection, and stale revision conflict preserve later edits.');

  await browserJourney(f,next.draft);
}

async function browserJourney(f,packet) {
  let browser;
  try { browser=await chromium.launch({headless:true}); }
  catch { throw new HarnessError('Installed Chromium is unavailable for independent browser evidence.'); }
  const contexts=[];
  try {
    async function signedPage() {
      const context=await browser.newContext({viewport:{width:1440,height:1000}}); contexts.push(context);
      const page=await context.newPage();
      try { await page.goto(`${f.origin}/admin`,{waitUntil:'domcontentloaded',timeout:20_000}); }
      catch { throw new HarnessError('Browser could not reach the local application.'); }
      const admin=page.frameLocator('iframe[title="BidZizi admin workspace"]');
      await expect(admin.getByText(/Test accounts|Test sign-in|Staging test|Test mode/i).first()).toBeVisible();
      await admin.getByLabel('Test account',{exact:true}).selectOption('staff-saturn');
      await admin.getByRole('button',{name:'Sign in',exact:true}).click();
      await expect(admin.locator('[data-event="name"]')).toHaveValue(packet.event.name);
      return { page,admin,context };
    }
    const {page,admin}=await signedPage();
    const renamed='Browser saved event';
    await admin.locator('[data-event="name"]').fill(renamed);
    await admin.locator('[data-event="welcome"]').fill('Browser saved welcome.');
    await admin.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect(admin.locator('#saved')).toHaveText('Saved');
    const check=await login(f), persisted=await read(f,check,packet.event.id);
    assert.equal(persisted.event.name,renamed);
    assert.equal(persisted.event.welcome,'Browser saved welcome.');
    const preview=admin.frameLocator('#bidder-frame');
    await expect(preview.locator('h1')).toContainText(renamed);
    await expect(admin.locator('#preview-mode-label')).toContainText('Saved draft');
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(admin.locator('[data-event="name"]')).toHaveValue(renamed);
    // Independent browser storage is empty; the server session/database supplies this draft.
    packet.event.name=renamed;
    const second=await signedPage();
    await expect(second.admin.locator('[data-event="welcome"]')).toHaveValue('Browser saved welcome.');
    passed('Actual A saved-draft preview and a new browser context show server-persisted event edits.');

    let pauseWrites=true;
    await page.route('**/api/admin/events/*',async route=>{
      if (pauseWrites && route.request().method()==='PUT') return route.abort('failed');
      await route.continue();
    });
    await admin.locator('[data-event="name"]').fill('Recovered event');
    await admin.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect(admin.locator('#saved')).toContainText('Save not confirmed');
    assert.equal((await read(f,check,packet.event.id)).event.name,renamed);
    await expect(preview.locator('h1')).toContainText(renamed,'Saved preview must retain confirmed content during failure.');
    pauseWrites=false;
    await admin.getByRole('button',{name:'Retry save',exact:true}).click();
    await expect(admin.locator('#saved')).toHaveText('Saved');
    assert.equal((await read(f,check,packet.event.id)).event.name,'Recovered event');
    passed('Failed save stays unconfirmed, preserves edits and saved preview, then retries to one durable save.');

    await second.admin.locator('[data-event="name"]').fill('Stale browser edit');
    await second.admin.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect(second.admin.getByText('This draft changed in another session.',{exact:true})).toBeVisible();
    assert.equal((await read(f,check,packet.event.id)).event.name,'Recovered event');
    await second.admin.getByRole('button',{name:'Reload saved draft',exact:true}).click();
    const confirmation=second.admin.getByRole('dialog');
    if (await confirmation.count()) await confirmation.getByRole('button',{name:'Reload saved draft',exact:true}).click();
    await expect(second.admin.locator('[data-event="name"]')).toHaveValue('Recovered event');
    passed('Stale browser save shows a conflict; explicit reload recovers the authoritative revision without overwrite.');

    // Lose an acknowledgement after the transaction commits. A retry must reuse
    // its request key, recover the receipt, and never perform a second revision.
    await page.unroute('**/api/admin/events/*');
    let loseAcknowledgement=true;
    await page.route('**/api/admin/events/*',async route=>{
      if (loseAcknowledgement && route.request().method()==='PUT') {
        loseAcknowledgement=false;
        await route.fetch();
        return route.abort('failed');
      }
      await route.continue();
    });
    const beforeLost=await read(f,check,packet.event.id);
    await admin.locator('[data-event="name"]').fill('Lost response event');
    await admin.getByRole('button',{name:'Save draft',exact:true}).click();
    await expect(admin.locator('#saved')).toContainText('Save not confirmed');
    const committed=await read(f,check,packet.event.id);
    assert.equal(committed.event.name,'Lost response event');
    assert.equal(committed.revision,beforeLost.revision+1);
    await admin.getByRole('button',{name:'Retry save',exact:true}).click();
    await expect(admin.locator('#saved')).toHaveText('Saved');
    assert.equal((await read(f,check,packet.event.id)).revision,committed.revision);
    passed('Lost response after commit stays unconfirmed, and retry recovers its existing receipt without another revision.');

    await page.unroute('**/api/admin/events/*');
    const beforeOutage=await read(f,check,packet.event.id);
    const beforeRows=await f.db.query('SELECT revision,draft FROM bz_events WHERE id=$1',[packet.event.id]);
    const beforeLotRows=await f.db.query('SELECT id,position,data FROM bz_lots WHERE event_id=$1 ORDER BY position',[packet.event.id]);
    await admin.locator('[data-event="name"]').fill('Database recovery event');
    await admin.getByRole('link',{name:/^Lots/}).click();
    const savedHeading=await preview.locator('h1').innerText();
    await admin.getByLabel('Description',{exact:true}).fill('Database rollback description.');
    await f.rejectLotWrites(true);
    try {
      const responsePromise=page.waitForResponse(response=>response.request().method()==='PUT' && response.url().includes('/api/admin/events/'));
      await admin.getByRole('button',{name:'Save draft',exact:true}).click();
      const failedResponse=await responsePromise;
      assert.equal(failedResponse.status(),503);
      assert.doesNotMatch(await failedResponse.text(),/INDEPENDENT_STAFF_WRITE_REJECT|postgres|\.neon\.tech|SELECT |INSERT /i);
      await expect(admin.locator('#saved')).toContainText('Save not confirmed');
      assert.deepEqual((await f.db.query('SELECT revision,draft FROM bz_events WHERE id=$1',[packet.event.id])).rows,beforeRows.rows);
      assert.deepEqual((await f.db.query('SELECT id,position,data FROM bz_lots WHERE event_id=$1 ORDER BY position',[packet.event.id])).rows,beforeLotRows.rows);
      await expect(preview.locator('h1')).toHaveText(savedHeading);
    } finally { await f.rejectLotWrites(false); }
    await admin.getByRole('button',{name:'Retry save',exact:true}).click();
    await expect(admin.locator('#saved')).toHaveText('Saved');
    assert.equal((await read(f,check,packet.event.id)).event.name,'Database recovery event');
    passed('Real database transaction rejection cannot appear Saved or leave partial rows; restored database plus retry persists the retained draft.');
  } finally { for (const context of contexts) await context.close(); await browser.close(); }
}

async function adversarial(f) {
  await f.initialize();
  const staff=await login(f), outsider=await login(f,'staff-pine'), bidder=await login(f,'bidder-juniper');
  const created=await create(f,staff,'Private staff draft');
  const eventId=created.draft.event.id, path=`/api/admin/events/${eventId}`;
  error(await f.request('/api/admin/events'),401,'UNAUTHENTICATED');
  error(await f.request(path,{cookie:'bz_session=forged',headers:{'x-person-id':ids.staff,'x-role':'staff'}}),401,'UNAUTHENTICATED');
  error(await f.request(path,{cookie:outsider.cookie}),403,'FORBIDDEN');
  error(await f.request(path,{cookie:bidder.cookie}),403,'FORBIDDEN');
  error(await mutate(f,bidder,'/api/admin/events','POST',{ organizationId:ids.saturn,name:'Forged',requestId:uuid(),role:'staff',memberId:'SATURN' }),403,'FORBIDDEN');
  const outsiderList=await f.request('/api/admin/events',{cookie:outsider.cookie});
  assert.equal(outsiderList.status,200); assert.ok(!outsiderList.data.events.some(e=>e.id===eventId));
  const before=(await f.db.query('SELECT count(*)::int n FROM bz_events')).rows[0].n;
  error(await mutate(f,outsider,'/api/admin/events','POST',{organizationId:ids.saturn,name:'Wrong org',requestId:uuid()}),403,'FORBIDDEN');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_events')).rows[0].n,before);
  passed('Anonymous/forged/member-only identity and another tenant cannot read, list, or write staff drafts.');

  const body={expectedRevision:created.draft.revision,requestId:uuid(),draft:compact(created.draft)};
  error(await f.request(path,{method:'PUT',json:body,cookie:staff.cookie,headers:{origin:'https://hostile.example'}}),403,'FORBIDDEN');
  error(await f.request(path,{method:'PUT',json:body,cookie:staff.cookie}),403,'FORBIDDEN');
  error(await f.request(path,{method:'PUT',json:body,cookie:staff.cookie,headers:{origin:f.origin,'content-type':'text/plain'}}),400,'VALIDATION');
  error(await f.request('/api/test-auth/login',{method:'POST',json:{account:'staff-saturn'},headers:{origin:'https://hostile.example'}}),403,'FORBIDDEN');
  assert.equal((await read(f,staff,eventId)).revision,created.draft.revision);
  passed('Login and authenticated writes enforce same-origin JSON; rejected CSRF does not change data.');

  const injected=structuredClone(body); injected.draft.event.orgId=ids.pine;
  error(await mutate(f,staff,path,'PUT',injected),400,'VALIDATION');
  const negative=structuredClone(body); negative.draft.lots=[lot()]; negative.draft.lots[0].opening=-1;
  error(await mutate(f,staff,path,'PUT',negative),400,'VALIDATION');
  const fractional=structuredClone(negative); fractional.draft.lots[0].opening=1.5;
  error(await mutate(f,staff,path,'PUT',fractional),400,'VALIDATION');
  const spoofed=structuredClone(body); spoofed.draft.lots=[{...lot(),provider:'Pine Street Exchange',count:10,history:[{amount:5000}]}];
  error(await mutate(f,staff,path,'PUT',spoofed),400,'VALIDATION');
  const duplicate=structuredClone(body); const same=lot(); duplicate.draft.lots=[same,structuredClone(same)];
  error(await mutate(f,staff,path,'PUT',duplicate),400,'VALIDATION');
  const oversized=structuredClone(body);
  oversized.draft.lots=Array.from({length:75},()=>({...lot('Valid draft lot'),description:'x'.repeat(1000)}));
  assert.ok(Buffer.byteLength(JSON.stringify(oversized))>64*1024);
  error(await mutate(f,staff,path,'PUT',oversized),400,'VALIDATION');
  const beforeBad=await f.db.query('SELECT revision FROM bz_events WHERE id=$1',[eventId]);
  assert.equal(beforeBad.rows[0].revision,created.draft.revision);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM bz_lots WHERE event_id=$1',[eventId])).rows[0].n,0);
  passed('Unknown ownership/history fields, invalid minor units, and duplicate lot identities reject atomically.');

  const a=compact(created.draft), b=compact(created.draft);
  a.event.name='Concurrent A'; b.event.name='Concurrent B';
  const concurrent=await Promise.all([a,b].map(draft=>mutate(f,staff,path,'PUT',{expectedRevision:created.draft.revision,requestId:uuid(),draft})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const fresh=await read(f,staff,eventId);
  assert.equal(fresh.revision,created.draft.revision+1);
  assert.ok(['Concurrent A','Concurrent B'].includes(fresh.event.name));
  passed('Concurrent stale writers yield one durable revision and one conflict.');

  const ownLot=lot('Tenant A lot');
  const own=await update(f,staff,fresh,{...compact(fresh),lots:[ownLot]});
  const pineCreated=await create(f,outsider,'Tenant B draft',ids.pine);
  const reparent={...compact(pineCreated.draft),lots:[{...ownLot,title:'Stolen lot'}]};
  const theft=await mutate(f,outsider,`/api/admin/events/${pineCreated.draft.event.id}`,'PUT',{expectedRevision:pineCreated.draft.revision,requestId:uuid(),draft:reparent});
  assert.ok([400,403,409].includes(theft.status),'Existing lot ID must not be reparented to another event/tenant.');
  assert.equal((await read(f,staff,eventId)).lots[0].title,'Tenant A lot');
  assert.equal((await read(f,outsider,pineCreated.draft.event.id)).lots.length,0);
  passed('Composite tenant ownership prevents lot reparenting across organizations.');

  await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
  error(await f.request(path,{cookie:staff.cookie}),403,'FORBIDDEN');
  error(await mutate(f,staff,path,'PUT',own.body),403,'FORBIDDEN');
  error(await mutate(f,staff,'/api/admin/events','POST',{organizationId:ids.saturn,name:'Private staff draft',requestId:created.requestId}),403,'FORBIDDEN');
  passed('Revoked staff grant is checked on reads, writes, and idempotent replay.');
  await f.db.query('UPDATE bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
  await f.db.query('UPDATE bz_people SET active=false WHERE id=$1',[ids.staff]);
  error(await f.request(path,{cookie:staff.cookie}),401,'UNAUTHENTICATED');
  await f.db.query('UPDATE bz_people SET active=true WHERE id=$1',[ids.staff]);
  const loggedOut=await mutate(f,staff,'/api/session/logout','POST',{});
  assert.equal(loggedOut.status,200);
  error(await f.request(path,{cookie:staff.cookie}),401,'UNAUTHENTICATED');
  await f.db.query('UPDATE bz_sessions SET expires_at=now()-interval \'1 second\' WHERE person_id=$1',[ids.outsider]);
  error(await f.request(`/api/admin/events/${pineCreated.draft.event.id}`,{cookie:outsider.cookie}),401,'UNAUTHENTICATED');
  passed('Person revocation, logout, and expiry invalidate existing server sessions.');

  const activeStaff=await login(f);
  assert.equal((await f.request(path,{cookie:activeStaff.cookie})).status,200);
  const disabled=await f.alternative({disabled:true});
  const off=await disabled.request('/api/session',{cookie:activeStaff.cookie});
  assert.deepEqual(off.data,{authenticated:false,testMode:false});
  error(await disabled.request(path,{cookie:activeStaff.cookie}),401,'UNAUTHENTICATED');
  const disabledLogin=await disabled.request('/api/test-auth/login',{method:'POST',json:{account:'staff-saturn'},headers:{origin:disabled.origin}});
  assert.ok([403,503].includes(disabledLogin.status));
  const production=await f.alternative({production:true});
  const denied=await production.request('/api/session',{cookie:activeStaff.cookie});
  assert.deepEqual(denied.data,{authenticated:false,testMode:false});
  const productionLogin=await production.request('/api/test-auth/login',{method:'POST',json:{account:'staff-saturn'},headers:{origin:production.origin}});
  assert.ok([403,503].includes(productionLogin.status));
  error(await production.request(path,{cookie:activeStaff.cookie}),401,'UNAUTHENTICATED');
  const custom=await f.alternative({customPreview:true});
  const customSession=await custom.request('/api/session',{cookie:activeStaff.cookie});
  assert.deepEqual(customSession.data,{authenticated:false,testMode:false});
  error(await custom.request(path,{cookie:activeStaff.cookie}),401,'UNAUTHENTICATED');
  const customLogin=await custom.request('/api/test-auth/login',{method:'POST',json:{account:'staff-saturn'},headers:{origin:'https://staging.bidzizi.com','x-forwarded-host':'evidence.vercel.app'}});
  assert.ok([403,503].includes(customLogin.status));
  passed('Flag-off, production, and custom-domain Preview contexts deny test login and existing staff sessions; forwarded host cannot enable them.');

  for (const invalid of [{unsafeOrigin:true},{unsafeDatabase:true}]) {
    const local=await f.alternative(invalid);
    const localSession=await local.request('/api/session',{cookie:activeStaff.cookie});
    assert.deepEqual(localSession.data,{authenticated:false,testMode:false});
    error(await local.request(path,{cookie:activeStaff.cookie}),401,'UNAUTHENTICATED');
    const localLogin=await local.request('/api/test-auth/login',{method:'POST',json:{account:'staff-saturn'},headers:{origin:local.origin}});
    assert.ok([403,503].includes(localLogin.status));
  }
  passed('Local auth requires both a loopback origin and explicitly disposable bz_test_* database; valid prior staff cookies cannot bypass either.');
}

try {
  await withFixture(mode==='acceptance' ? acceptance : adversarial,configuration);
  console.log(`${count} independent ${mode} groups passed.`);
} catch (failure) {
  console.error(`${failure instanceof HarnessError ? 'HARNESS' : 'FAIL'}: ${failure.message}`);
  process.exitCode=failure instanceof HarnessError ? 99 : 1;
}
