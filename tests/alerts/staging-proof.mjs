#!/usr/bin/env node
// Authorized, tiny controlled proof; never loads production or changes providers.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { providers } from '../load/staging-provider.mjs';
import { stagingTransport, STAGING_ORIGIN } from '../load/staging-transport.mjs';
import { sleep } from '../load/support.mjs';

assert.deepEqual(process.argv.slice(2), ['--staging-proof-approved', '--rules-confirmed']);
assert.match(process.version, /^v24\./);
const deployment = JSON.parse(await readFile('docs/evidence/nov19/alerts-deployment.json','utf8'));
assert.ok(deployment.aliased && deployment.productionUnchanged && deployment.productionDsnAbsent);
const orgId=randomUUID(),staffId=randomUUID(),nonce=randomBytes(6).toString('hex'),slug='nov19-alert-'+nonce;
const email='nov19-alert-'+nonce+'@example.test',password=randomBytes(32).toString('base64url'),salt=randomBytes(16);
const hash='scrypt$32768$8$1$'+salt.toString('base64url')+'$'+scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('base64url');
const evidence={startedAt:new Date().toISOString(),sourceCommit:deployment.sourceCommit,deploymentId:deployment.deploymentId,
  orgId,staffId,fixtureSlug:slug,scenarios:{},inboxProof:{confirmed:false,destination:'zackj13@gmail.com'},cleanup:{confirmed:false}};
const save=()=>writeFile('docs/evidence/nov19/alerts-staging-proof.json',JSON.stringify(evidence,null,2)+'\n');
const transport=stagingTransport({origin:STAGING_ORIGIN}),host=transport.client(),guest=transport.client();
const connections=[];let control,observer,production,eventId,browser,seeded=false;
async function api(method,path,body,call=host){const r=await call(method,path,body);assert.ok(r.status>=200&&r.status<300,`Fixture API failed (${r.status})`);return r.data;}
async function absent(ids=[]){const r=(await production.query(`SELECT (SELECT count(*)::int FROM orgs WHERE id=$1 OR slug=$2) orgs,
  (SELECT count(*)::int FROM staff WHERE id=$3 OR org_id=$1 OR email=$4) staff,
  (SELECT count(*)::int FROM events WHERE org_id=$1 OR id=ANY($5::uuid[])) events`,[orgId,slug,staffId,email,ids])).rows[0];
  assert.ok(Object.values(r).every(n=>n===0));return {at:new Date().toISOString(),readOnly:true,...r};}
async function erase(id){
  await control.query('BEGIN');
  try{
    const owned=await control.query(`SELECT e.id FROM events e JOIN orgs o ON o.id=e.org_id
      WHERE e.id=$1 AND e.org_id=$2 AND o.slug=$3 AND e.is_practice FOR UPDATE OF e`,[id,orgId,slug]);assert.equal(owned.rowCount,1);
    for(const q of ['DELETE FROM award_log WHERE item_id IN (SELECT id FROM items WHERE event_id=$1)',
      'DELETE FROM awards WHERE event_id=$1','DELETE FROM bid_receipts WHERE item_id IN (SELECT id FROM items WHERE event_id=$1)',
      'DELETE FROM rejoin_codes WHERE participant_id IN (SELECT id FROM participants WHERE event_id=$1)',
      'DELETE FROM watches WHERE item_id IN (SELECT id FROM items WHERE event_id=$1)','DELETE FROM pledges WHERE event_id=$1',
      'UPDATE standings SET current_minor=NULL,leader_id=NULL,leading_bid_id=NULL,bid_count=0,next_sequence=1 WHERE event_id=$1',
      'DELETE FROM bids WHERE event_id=$1','DELETE FROM participants WHERE event_id=$1','DELETE FROM standings WHERE event_id=$1',
      'DELETE FROM items WHERE event_id=$1','DELETE FROM sponsors WHERE event_id=$1','DELETE FROM recipients WHERE event_id=$1','DELETE FROM events WHERE id=$1'])await control.query(q,[id]);
    await control.query('COMMIT');
  }catch(e){await control.query('ROLLBACK');throw e;}
}
try{
  const provider=await providers(); evidence.binding=await provider.assertStagingDeployment(deployment.deploymentId,deployment.sourceCommit);
  control=await provider.database('staging','alert-fixture-control',false);connections.push(control);
  observer=await provider.database('staging','alert-readonly-observer',true);connections.push(observer);
  production=await provider.database('production','alert-production-absence',true);connections.push(production);
  evidence.productionAbsenceBefore=await absent();
  await save();
  // Cleanup must discover a committed fixture even if the COMMIT response is lost.
  seeded=true;
  await control.query('BEGIN');
  try{
    await control.query('INSERT INTO orgs(id,slug,name) VALUES($1,$2,$3)',[orgId,slug,'Disposable Nov19 alert proof']);
    await control.query('INSERT INTO staff(id,org_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)',[staffId,orgId,email,'Disposable alert host',hash]);
    await control.query('COMMIT');seeded=true;
  }catch(e){await control.query('ROLLBACK');throw e;}
  await save();await api('POST','/api/v1/host/login',{email,password});
  eventId=(await api('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Nov19 alert proof '+nonce,isPractice:true,
    startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+600000).toISOString()})).id;
  evidence.eventId=eventId;
  const row=(await observer.query('SELECT id,org_id,is_practice FROM events WHERE id=$1 AND org_id=$2',[eventId,orgId])).rows[0];
  assert.equal(row?.is_practice,true);evidence.databaseBinding={staging:row,production:await absent([eventId])};await save();
  const itemId=(await api('POST',`/api/v1/host/events/${eventId}/items`,{requestId:randomUUID(),title:'Isolated alert drill item',openingMinor:10000,ready:true})).id;
  const workspace=await api('GET',`/api/v1/host/events/${eventId}`);
  await api('PATCH',`/api/v1/host/events/${eventId}`,{revision:workspace.event.revision,status:'live'});
  const code=workspace.event.code,path='/api/v1/e/'+code;
  await api('POST',path+'/join',{requestId:randomUUID(),displayName:'Alert proof',businessName:'Disposable fixture'},guest);
  const requestId=randomUUID(),requestStartedAt=new Date().toISOString();
  await control.query('BEGIN');
  try{
    const pid=(await control.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await control.query('SELECT 1 FROM standings WHERE item_id=$1 FOR UPDATE',[itemId]);
    const pending=guest('POST',path+'/bid',{requestId,itemId,amountMinor:10000});pending.catch(()=>{});
    let waiting=false;
    for(let i=0;i<50;i++){
      waiting=(await observer.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT current_minor%') waiting`,[pid])).rows[0].waiting;
      if(waiting)break;await sleep(20);
    }
    assert.ok(waiting,'Observe only the owned lock wait');
    const r=await pending;assert.equal(r.status,503);assert.equal(r.data.error?.code,'UNAVAILABLE');assert.match(r.alertId??'',/^[a-f0-9]{32}$/);
    evidence.scenarios.serverFailure={requestStartedAt,responseAt:new Date().toISOString(),alertId:r.alertId,status:503,observedLockWait:true};
  }finally{await control.query('ROLLBACK');}
  const counts=(await observer.query(`SELECT (SELECT count(*)::int FROM bids WHERE event_id=$1 AND request_id=$2) bids,
    (SELECT count(*)::int FROM bid_receipts WHERE request_id=$2) receipts`,[eventId,requestId])).rows[0];
  assert.deepEqual(counts,{bids:0,receipts:0});evidence.scenarios.serverFailure.noBidOrReceiptCommitted=true;
  assert.equal((await guest('GET',path+'/receipt/'+requestId)).data.receipt,null);
  await save();console.log(JSON.stringify({phase:'server-error-triggered',...evidence.scenarios.serverFailure}));
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  // All browser requests stay on the staging origin. Stop route continuation on first challenge/block/429.
  let browserStop=null;
  page.on('response',r=>{const h=r.headers();if([403,429].includes(r.status())||h['x-vercel-mitigated']||h['x-vercel-error']){
    browserStop={status:r.status(),reason:'Platform stop'};transport.stop(browserStop);void page.close().catch(()=>{});
  }});
  await page.route('**/*',route=>{const url=new URL(route.request().url());return !transport.stopped&&url.origin===STAGING_ORIGIN?route.continue():route.abort();});
  const registered=page.waitForResponse(r=>r.url().endsWith(path+'/telemetry')&&r.request().postDataJSON()?.kind==='device');
  await page.goto(STAGING_ORIGIN+'/e/'+code);await registered;
  const errorTelemetry=page.waitForResponse(r=>r.url().endsWith(path+'/telemetry')&&r.request().postDataJSON()?.kind==='error');
  const browserOccurredAt=await page.evaluate(()=>{const at=new Date().toISOString();setTimeout(()=>{throw new Error('Nov19 controlled readiness browser error');},0);return at;});
  const errorResponse=await errorTelemetry;assert.equal(errorResponse.status(),202);
  const browserAlertId=errorResponse.headers()['x-bidzizi-alert-id'];assert.match(browserAlertId??'',/^[a-f0-9]{32}$/);
  evidence.scenarios.guestError={alertId:browserAlertId,browserOccurredAt,responseAt:new Date().toISOString(),status:202};
  assert.equal((await observer.query("SELECT count(*)::int n FROM client_reports WHERE event_id=$1 AND kind='error'",[eventId])).rows[0].n,1);
  evidence.scenarios.guestError.committed=true;await save();console.log(JSON.stringify({phase:'guest-error-triggered',...evidence.scenarios.guestError}));
  await page.getByLabel('Your name').fill('Blocking health proof');await page.getByLabel('Business name').fill('Disposable fixture');
  await page.getByRole('button',{name:'Join',exact:true}).click();await page.locator('.pa-main').waitFor();await page.locator('.lc-hit').first().click();
  const healthResponse=page.waitForResponse(r=>r.url().endsWith(path+'/telemetry')&&r.request().postDataJSON()?.check==='bid-sheet');
  await page.locator('.pa-actionbar').getByRole('button',{name:/^Bid/}).click();
  const healthOccurredAt=await page.evaluate(()=>{
    const cover=document.createElement('div');cover.id='nov19-proof-cover';cover.style.cssText='position:fixed;inset:0;z-index:2147483647;background:transparent;pointer-events:auto';
    document.body.appendChild(cover);return new Date().toISOString();
  });
  const health=await healthResponse;assert.equal(health.status(),202);const healthId=health.headers()['x-bidzizi-alert-id'];assert.match(healthId??'',/^[a-f0-9]{32}$/);
  await page.evaluate(()=>document.getElementById('nov19-proof-cover')?.remove());
  evidence.scenarios.blockingHealth={alertId:healthId,browserOccurredAt:healthOccurredAt,responseAt:new Date().toISOString(),status:202,realCoveredButtonCheck:true};
  assert.equal((await observer.query("SELECT count(*)::int n FROM client_reports WHERE event_id=$1 AND kind='health' AND check_code='bid-sheet'",[eventId])).rows[0].n,1);
  evidence.scenarios.blockingHealth.committed=true;assert.equal(browserStop,null);
  await save();console.log(JSON.stringify({phase:'blocking-health-triggered',...evidence.scenarios.blockingHealth}));
  evidence.applicationProofPassed=true;
}catch(error){evidence.failure={type:error.name,code:/^[A-Z0-9_]+$/.test(String(error.code))?error.code:null,reason:'Controlled proof failed; raw error suppressed.'};}
finally{
  await browser?.close().catch(()=>{});await control?.query('ROLLBACK').catch(()=>{});
  try{
    if(seeded){
      if(transport.stopped)await sleep(9000);
      const ownerExists=(await control.query('SELECT id FROM orgs WHERE id=$1 AND slug=$2',[orgId,slug])).rowCount===1;
      const events=(await control.query('SELECT id,is_practice FROM events WHERE org_id=$1',[orgId])).rows;
      for(const e of events){assert.equal(e.is_practice,true);if(!transport.stopped){try{await api('DELETE',`/api/v1/host/events/${e.id}`);}catch{await erase(e.id);}}else await erase(e.id);}
      if(ownerExists)await control.query('BEGIN');
      try{
        if(ownerExists){
        assert.equal((await control.query('SELECT id FROM orgs WHERE id=$1 AND slug=$2 FOR UPDATE',[orgId,slug])).rowCount,1);
        await control.query('DELETE FROM client_reports WHERE org_id=$1',[orgId]);
        await control.query('DELETE FROM staff_requests WHERE staff_id=$1',[staffId]);await control.query('DELETE FROM staff_sessions WHERE staff_id=$1',[staffId]);
        await control.query('DELETE FROM staff_password_tokens WHERE staff_id=$1 OR issued_by=$1',[staffId]);
        await control.query('DELETE FROM login_attempts WHERE email_hash=$1',[createHash('sha256').update('email:'+email).digest('hex')]);
        await control.query('DELETE FROM staff WHERE id=$1 AND org_id=$2',[staffId,orgId]);await control.query('DELETE FROM orgs WHERE id=$1 AND slug=$2',[orgId,slug]);await control.query('COMMIT');
        }
      }catch(e){await control.query('ROLLBACK');throw e;}
      const remaining=(await observer.query(`SELECT (SELECT count(*)::int FROM orgs WHERE id=$1) orgs,
        (SELECT count(*)::int FROM staff WHERE id=$2 OR org_id=$1) staff,(SELECT count(*)::int FROM events WHERE org_id=$1) events,
        (SELECT count(*)::int FROM staff_requests WHERE staff_id=$2) requests,(SELECT count(*)::int FROM staff_sessions WHERE staff_id=$2) sessions`,[orgId,staffId])).rows[0];
      assert.ok(Object.values(remaining).every(n=>n===0));evidence.cleanup={confirmed:true,at:new Date().toISOString(),stagingRemaining:remaining,productionAbsence:await absent(eventId?[eventId]:[])};
    }else evidence.cleanup={confirmed:true,reason:'No fixture transaction committed.'};
  }catch{evidence.cleanup={confirmed:false,reason:'Owned fixture cleanup needs follow-up; raw error suppressed.'};}
  for(const db of connections.reverse())await db.end().catch(()=>{});
  evidence.finishedAt=new Date().toISOString();evidence.stopCondition=transport.stopped;await save();
  console.log(JSON.stringify({phase:'proof-finished',applicationProofPassed:evidence.applicationProofPassed??false,cleanup:evidence.cleanup,inboxProofPending:true}));
}
if(evidence.failure||!evidence.cleanup.confirmed)process.exitCode=1;
