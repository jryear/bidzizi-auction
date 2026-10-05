import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {withFixture,HarnessError,ApplicationFailure,browserFailure} from './harness.mjs';
import {ids,uuid,approvalPath,audiencePath,lotPath,phaseFunction,login,mutate,create,saved,compact,completeLot,eventFields,
  completeEvent,body,expectedSnapshot,approve,assertApprovalSQL,audience,error,noStore,assertNoPrivateLot,phaseBoundaries,
  futureFields,openFields,transitionFields,direct,sealedError} from './protocol.mjs';

let groups=0;
const pass=label=>{groups++;console.log('PASS '+groups+': '+label);};
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function approvalExists(f,staff,event){
  const r=await f.request(approvalPath(event),{cookie:staff.cookie});
  assert.equal(r.status,200,'Catalog approval read API must exist; missing404 is finite feature-absent RED.');noStore(r);
  assert.equal(r.data.approval,null);
}
async function waitPhase(f,viewer,x,selected,target,deadline){
  while(Date.now()<deadline){
    const r=await audience(f,viewer,x.packet.event.id,null,x.packet,selected);
    if(r.data.phase===target)return r;
    await sleep(200);
  }
  throw new ApplicationFailure('Reached catalog did not reach '+target+' by its real DB-clock deadline.');
}
async function acceptance(f){
  const staff=await login(f),juniper=await login(f,'bidder-juniper');
  const x=await completeEvent(f,staff,await futureFields(f)),selected=[x.last.id,x.first.id];
  await approvalExists(f,staff,x.packet.event.id);
  error(await f.request(audiencePath(x.packet.event.id),{cookie:juniper.cookie}),403,'FORBIDDEN');
  await f.grantViewer(ids.juniper,x.packet.event.id);
  error(await f.request(audiencePath(x.packet.event.id),{cookie:juniper.cookie}),404,'NOT_FOUND');
  const approved=await approve(f,staff,x.packet,selected);
  await assertApprovalSQL(f,x.packet,selected,approved.approval);
  assert.deepEqual(approved.approval.snapshot.lots.map(l=>l.number),['01','03'],'Saved lot numbers survive subset approval.');
  const a=await audience(f,juniper,x.packet.event.id,'scheduled',x.packet,selected);
  assert.deepEqual(a.data.schedule,{opensAt:approved.approval.opensAt,closesAt:approved.approval.closesAt});
  sealedError(await f.request(lotPath(x.packet.event.id,x.first.id),{cookie:juniper.cookie}),409,'CATALOG_NOT_OPEN',x.packet);
  pass('Saved selected fields/order/provider/sponsors match complete SQL snapshots; allowed welcome omits all unopened catalog rows.');

  const before=await f.publicationRows(x.packet.event.id);
  const edited=compact(x.packet);edited.event.name='LATER PRIVATE DRAFT';edited.event.welcome='Later draft welcome';
  edited.event.sponsors=[{name:'Later draft sponsor',logo:'table'}];edited.event.date='2031-02-12';
  edited.lots.reverse();edited.lots[0].description='Later private description';edited.lots[0].image='assets/lots/flowers.jpg';
  const newer=await saved(f,staff,x.packet,edited);
  const retry=await mutate(f,staff,approvalPath(x.packet.event.id),'POST',approved.payload);
  assert.equal(retry.status,201);assert.deepEqual(retry.data,approved.response.data);
  const permutation=await mutate(f,staff,approvalPath(x.packet.event.id),'POST',{...approved.payload,lotIds:[x.first.id,x.last.id]});
  assert.equal(permutation.status,201);assert.deepEqual(permutation.data,approved.response.data);
  const read=await f.request(approvalPath(x.packet.event.id),{cookie:staff.cookie});
  assert.deepEqual(read.data,approved.response.data);
  await assertApprovalSQL(f,x.packet,selected,approved.approval);
  const after=await f.publicationRows(x.packet.event.id);
  assert.deepEqual(after.approvals,before.approvals);assert.deepEqual(after.lots,before.lots);
  assert.equal(after.receipts.length,before.receipts.length+1,'Later draft save adds one receipt; approval retries add none.');
  await audience(f,juniper,x.packet.event.id,'scheduled',x.packet,selected);
  error(await mutate(f,staff,approvalPath(x.packet.event.id),'POST',body(newer,selected)),409,'CATALOG_APPROVAL_EXISTS');
  await f.restart();
  assert.deepEqual((await f.request(approvalPath(x.packet.event.id),{cookie:staff.cookie})).data,approved.response.data);
  await audience(f,juniper,x.packet.event.id,'scheduled',x.packet,selected);
  pass('Later draft edits, reordered selections and process restart cannot change the one immutable approval; exact retries recover its receipt.');

  await browserApproval(f,staff);
  pass('Staff cannot review unsaved edits; unconfirmed/lost-response approval retains one key and one durable release; phone A welcome omits unopened rows.');

  const t=await transitionFields(f),clock=await completeEvent(f,staff,t.fields),clockIDs=[clock.first.id,clock.last.id];
  const clockApproval=await approve(f,staff,clock.packet,clockIDs);
  assert.equal(clockApproval.approval.opensAt,t.opensAt);assert.equal(clockApproval.approval.closesAt,t.closesAt);
  await f.grantViewer(ids.juniper,clock.packet.event.id);
  await phaseBoundaries(f);
  await audience(f,juniper,clock.packet.event.id,'scheduled',clock.packet,clockIDs);
  const deadline=Date.now()+175_000;
  await waitPhase(f,juniper,clock,clockIDs,'open',deadline);
  await direct(f,juniper,clock.packet,clockIDs,clock.last.id,'open');
  await browserCatalog(f,clock,clockIDs);
  await waitPhase(f,juniper,clock,clockIDs,'closed',deadline);
  const closed=await audience(f,juniper,clock.packet.event.id,'closed',clock.packet,clockIDs);
  await browserCatalog(f,clock,clockIDs,'closed');
  assert.equal(closed.data.biddingEnabled,false);
  await direct(f,juniper,clock.packet,clockIDs,clock.last.id,'closed');
  const afterClose=await mutate(f,staff,approvalPath(clock.packet.event.id),'POST',clockApproval.payload);
  assert.equal(afterClose.status,201);assert.deepEqual(afterClose.data,clockApproval.response.data);
  await assertApprovalSQL(f,clock.packet,clockIDs,clockApproval.approval);
  const closedRows=await f.publicationRows(clock.packet.event.id);
  await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
  error(await mutate(f,staff,approvalPath(clock.packet.event.id),'POST',clockApproval.payload),403,'FORBIDDEN');
  assert.deepEqual(await f.publicationRows(clock.packet.event.id),closedRows);
  await f.db.query('UPDATE bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
  pass('Real database clock changes scheduled to open to closed without a cron/client clock; inclusive/exclusive predicate and post-close read-only receipt are retained.');
}
async function browserApproval(f,staff){
  const x=await completeEvent(f,staff,await futureFields(f));
  let browser;try{browser=await chromium.launch({headless:true});}catch{throw new HarnessError('Chromium unavailable.');}
  const contexts=[];
  try{
    const c=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(c);
    const page=await c.newPage();await page.goto(f.origin+'/admin?event='+x.packet.event.id);
    const admin=page.frameLocator('iframe[title="BidZizi admin workspace"]');
    await admin.getByRole('combobox',{name:'Test account',exact:true}).selectOption('staff-saturn');
    await admin.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(admin.locator('[data-event="name"]')).toHaveValue(x.packet.event.name);
    await admin.getByRole('link',{name:/^Lots/}).click();
    await admin.getByRole('checkbox',{name:'Select lot 01',exact:true}).check();
    await admin.getByRole('checkbox',{name:'Select lot 03',exact:true}).check();
    await admin.getByRole('link',{name:'Event',exact:true}).click();
    await admin.locator('[data-event="name"]').fill('UNSAVED browser-only name');
    await admin.getByRole('link',{name:/^Lots/}).click();
    await expect(admin.getByRole('button',{name:'Review catalog',exact:true})).toBeDisabled();
    page.on('dialog',dialog=>dialog.accept());
    await page.reload();
    await expect(admin.locator('[data-event="name"]')).toHaveValue(x.packet.event.name);
    await admin.getByRole('link',{name:/^Lots/}).click();
    await admin.getByRole('checkbox',{name:'Select lot 01',exact:true}).check();
    await admin.getByRole('checkbox',{name:'Select lot 03',exact:true}).check();
    await admin.getByRole('button',{name:'Review catalog',exact:true}).click();
    const dialog=admin.getByRole('dialog',{name:'Review catalog',exact:true});
    await expect(dialog.getByText(x.first.title,{exact:true})).toBeVisible();
    await expect(dialog.getByText(x.last.title,{exact:true})).toBeVisible();
    assert.ok(!(await dialog.innerText()).includes(x.unselected.title));
    let submitted,posts=0;const attempts=[];
    const beforeApproval=await f.publicationRows(x.packet.event.id);
    await page.route('**/api/admin/events/*/catalog-approval',async route=>{
      if(route.request().method()!=='POST')return route.continue();
      submitted=route.request().postDataJSON();attempts.push(submitted);posts++;
      assert.deepEqual(Object.keys(submitted).sort(),['expectedRevision','requestId','lotIds'].sort());
      if(posts===1)return route.abort('failed');
      if(posts===2){const response=await route.fetch();assert.equal(response.status(),201);return route.abort('failed');}
      return route.continue();
    });
    await dialog.getByRole('button',{name:'Approve catalog',exact:true}).click();
    await expect(admin.locator('#catalog-approval')).toHaveText('Approval not confirmed');
    assert.deepEqual(await f.publicationRows(x.packet.event.id),beforeApproval);
    await admin.getByRole('button',{name:'Retry approval',exact:true}).click();
    await expect(admin.locator('#catalog-approval')).toHaveText('Approval not confirmed');
    assert.equal((await f.publicationRows(x.packet.event.id)).approvals.length,1);
    await admin.getByRole('button',{name:'Retry approval',exact:true}).click();
    await expect(admin.locator('#catalog-approval')).toHaveText('Approved');
    assert.equal(attempts.length,3);assert.deepEqual(attempts[0],attempts[1]);assert.deepEqual(attempts[1],attempts[2]);
    const afterApproval=await f.publicationRows(x.packet.event.id);
    assert.equal(afterApproval.approvals.length,1);assert.equal(afterApproval.receipts.length,beforeApproval.receipts.length+1);
    assert.equal(submitted.expectedRevision,x.packet.revision);
    assert.deepEqual([...submitted.lotIds].sort(),[x.first.id,x.last.id].sort());
    const r=await f.request(approvalPath(x.packet.event.id),{cookie:staff.cookie});
    assert.equal(r.status,200);
    await assertApprovalSQL(f,x.packet,[x.first.id,x.last.id],r.data.approval);
    await f.grantViewer(ids.juniper,x.packet.event.id);
    const phone=await browser.newContext({viewport:{width:390,height:844}});contexts.push(phone);
    const v=await phone.newPage();await v.addInitScript(()=>{Date.now=()=>Date.UTC(2200,0,1);});
    await v.goto(f.origin+'/events/'+x.packet.event.id);
    await v.getByRole('combobox',{name:'Test account',exact:true}).selectOption('bidder-juniper');
    await v.getByRole('button',{name:'Sign in',exact:true}).click();
    const frame=v.frameLocator('iframe[title="BidZizi event"]');
    await expect(frame.locator('h1')).toContainText(x.packet.event.name);
    await expect(frame.getByText(x.packet.event.welcome,{exact:true})).toBeVisible();
    for(const sponsor of x.packet.event.sponsors)await expect(frame.getByText(sponsor.name,{exact:true}).first()).toBeVisible();
    await expect(v.locator('[data-catalog-phase]')).toHaveAttribute('data-catalog-phase','scheduled');
    const text=await frame.locator('body').innerText();
    assert.ok(!text.includes(x.first.title)&&!text.includes(x.last.title)&&!text.includes(x.unselected.title));
    assert.equal(await frame.locator('a[href*="/lot/"]').count(),0);
    assert.equal(await frame.locator('[data-action="bid"]:not([disabled])').count(),0);
  }catch(e){throw browserFailure(e);}
  finally{for(const c of contexts)await c.close();await browser.close();}
}
async function browserCatalog(f,x,selected,phase='open',account='bidder-juniper'){
  let browser;try{browser=await chromium.launch({headless:true});}catch{throw new HarnessError('Chromium unavailable.');}
  const c=await browser.newContext({viewport:{width:390,height:844}});
  try{
    const page=await c.newPage();await page.goto(f.origin+'/events/'+x.packet.event.id);
    await page.getByRole('combobox',{name:'Test account',exact:true}).selectOption(account);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    const frame=page.frameLocator('iframe[title="BidZizi event"]');
    await expect(page.locator('[data-catalog-phase]')).toHaveAttribute('data-catalog-phase',phase);
    await frame.getByRole('link',{name:'Browse the lots',exact:true}).click();
    for(const l of [x.first,x.last])await expect(frame.getByText(l.title,{exact:true}).first()).toBeVisible();
    assert.ok(!(await frame.locator('body').innerText()).includes(x.unselected.title));
    await frame.locator('a[href="#/lot/'+x.last.id+'"]').first().click();
    const detail=frame.locator('main[data-lot="'+x.last.id+'"]');
    await expect(detail.locator('h1')).toHaveText(x.last.title);
    await expect(detail.locator('.sponsor-line b')).toHaveText(x.packet.org.name);
    await expect(detail.locator('.sponsor-line .cat')).toHaveText(x.last.category);
    await expect(detail.getByText(x.last.description,{exact:true})).toBeVisible();
    await expect(detail.getByText(x.last.fine,{exact:true})).toBeVisible();
    for(const included of x.last.includes)await expect(detail.getByText(included,{exact:true})).toBeVisible();
    await expect(detail.locator('.hero img')).toHaveAttribute('src',new RegExp(x.last.image.replaceAll('.','\\.')));
    assert.equal(await frame.locator('[data-action="bid"]:not([disabled])').count(),0);
    assert.ok(!(await detail.innerText()).includes('[object Object]'));
    await frame.getByRole('button',{name:'Back to Lots',exact:true}).click();
    await expect(frame.getByText(x.last.title,{exact:true}).first()).toBeVisible();
    assert.ok(selected.includes(x.last.id));
  }catch(e){throw browserFailure(e);}
  finally{await c.close();await browser.close();}
}
async function adversarial(f){
  const staff=await login(f),pine=await login(f,'staff-pine'),juniper=await login(f,'bidder-juniper'),harbor=await login(f,'bidder-harbor');
  const x=await completeEvent(f,staff,await futureFields(f)),selected=[x.first.id,x.last.id];
  await approvalExists(f,staff,x.packet.event.id);
  sealedError(await f.request(approvalPath(x.packet.event.id)),401,'UNAUTHENTICATED',x.packet);
  for(const actor of [pine,juniper,harbor])sealedError(await f.request(approvalPath(x.packet.event.id),{cookie:actor.cookie}),403,'FORBIDDEN',x.packet);
  const other=await completeEvent(f,pine,await futureFields(f),ids.pine);
  const sameOrg=await completeEvent(f,staff,await futureFields(f));
  const baseline=await f.publicationRows(x.packet.event.id),payload=body(x.packet,selected);
  error(await f.request(approvalPath(x.packet.event.id),{method:'POST',json:payload,headers:{origin:f.origin}}),401,'UNAUTHENTICATED');
  for(const actor of [pine,juniper,harbor])error(await mutate(f,actor,approvalPath(x.packet.event.id),'POST',payload),403,'FORBIDDEN');
  assert.deepEqual(await f.publicationRows(x.packet.event.id),baseline);
  await f.grantViewer(ids.juniper,x.packet.event.id);
  error(await mutate(f,juniper,approvalPath(x.packet.event.id),'POST',payload),403,'FORBIDDEN');
  const invalid=[];
  invalid.push({...payload,lotIds:[]},{...payload,lotIds:[x.first.id,x.first.id]},{...payload,lotIds:[uuid()]},
    {...payload,snapshot:expectedSnapshot(x.packet,selected)},{...payload,opensAt:'2000-01-01T00:00:00Z'},
    {...payload,local:{date:'2030-01-15',start:'18:00',end:'20:00',timezone:'UTC'}});
  invalid.push({...payload,lotIds:[other.first.id]},{...payload,lotIds:[sameOrg.first.id]});
  for(const bad of invalid)error(await mutate(f,staff,approvalPath(x.packet.event.id),'POST',bad),400,'VALIDATION');
  error(await mutate(f,staff,approvalPath(x.packet.event.id),'POST',body(x.packet,[x.unselected.id])),400,'CATALOG_INCOMPLETE');
  error(await f.request(approvalPath(x.packet.event.id),{method:'POST',json:payload,cookie:staff.cookie,headers:{origin:'https://hostile.example'}}),403,'FORBIDDEN');
  error(await f.request(approvalPath(x.packet.event.id),{method:'POST',json:payload,cookie:staff.cookie,headers:{origin:f.origin,'content-type':'text/plain'}}),400,'VALIDATION');
  assert.deepEqual(await f.publicationRows(x.packet.event.id),baseline);
  pass('Staff grant, saved selection, window assignment, exact Origin/JSON and compact whitelist reject forged/incomplete approvals without writes.');

  const edited=compact(x.packet);edited.event.welcome='A newer saved welcome';
  const newer=await saved(f,staff,x.packet,edited);
  const beforeStale=await f.publicationRows(x.packet.event.id);
  error(await mutate(f,staff,approvalPath(x.packet.event.id),'POST',payload),409,'REVISION_CONFLICT');
  assert.deepEqual(await f.publicationRows(x.packet.event.id),beforeStale);
  const outcomes=await Promise.all([uuid(),uuid()].map(key=>mutate(f,staff,approvalPath(x.packet.event.id),'POST',body(newer,selected,key))));
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[201,409]);
  const winner=outcomes.find(r=>r.status===201),loser=outcomes.find(r=>r.status===409);
  error(loser,409,'CATALOG_APPROVAL_EXISTS');
  await assertApprovalSQL(f,newer,selected,winner.data.approval);
  sealedError(await f.request(approvalPath(x.packet.event.id)),401,'UNAUTHENTICATED',newer);
  for(const actor of [pine,juniper,harbor])sealedError(await f.request(approvalPath(x.packet.event.id),{cookie:actor.cookie}),403,'FORBIDDEN',newer);
  assert.equal((await f.publicationRows(x.packet.event.id)).approvals.length,1);
  for(const change of ['missing-description','unassigned-window']){
    const separate=await completeEvent(f,staff,await futureFields(f));
    const fields=compact(separate.packet);
    if(change==='missing-description')fields.lots[0].description='';
    else fields.lots[0].windowId=null;
    const current=await saved(f,staff,separate.packet,fields),before=await f.publicationRows(current.event.id);
    error(await mutate(f,staff,approvalPath(current.event.id),'POST',body(current,[separate.first.id])),400,'CATALOG_INCOMPLETE');
    assert.deepEqual(await f.publicationRows(current.event.id),before);
  }
  pass('Stale saved revision cannot approve; two different approval requests yield exactly one immutable catalog and one conflict.');

  for(const [date,start,end,zone] of [['2030-01-15','18:00','20:00','America/Los_Angeles'],['2030-07-15','18:00','20:00','America/Los_Angeles'],['2030-01-15','18:00','20:00','Asia/Kolkata']]){
    const z=await completeEvent(f,staff,eventFields(date,start,end,zone));
    const out=await approve(f,staff,z.packet,[z.first.id]);
    const expected=zone==='Asia/Kolkata'?['2030-01-15T12:30:00.000Z','2030-01-15T14:30:00.000Z']:
      date.includes('-07-')?['2030-07-16T01:00:00.000Z','2030-07-16T03:00:00.000Z']:['2030-01-16T02:00:00.000Z','2030-01-16T04:00:00.000Z'];
    assert.deepEqual([out.approval.opensAt,out.approval.closesAt],expected);
    await assertApprovalSQL(f,z.packet,[z.first.id],out.approval);
  }
  for(const fields of [eventFields('2026-03-08','02:30','04:00','America/Los_Angeles'),eventFields('2026-11-01','01:30','03:00','America/Los_Angeles'),
    eventFields('2026-03-08','00:30','02:30','America/Los_Angeles'),
    eventFields('2026-11-01','00:30','01:30','America/Los_Angeles'),
    eventFields('2030-01-15','20:00','18:00','UTC'),eventFields('2030-01-15','18:00','18:00','UTC')]){
    const bad=await completeEvent(f,staff,fields),before=await f.publicationRows(bad.packet.event.id);
    error(await mutate(f,staff,approvalPath(bad.packet.event.id),'POST',body(bad.packet,[bad.first.id])),400,'VALIDATION');
    assert.deepEqual(await f.publicationRows(bad.packet.event.id),before);
  }
  for(const [key,value,code] of [['date','2030-02-30','VALIDATION'],['timezone','Mars/Olympus','VALIDATION'],['start','','CATALOG_INCOMPLETE']]){
    const corrupt=await completeEvent(f,staff,await futureFields(f));
    // Independent storage-corruption probe; never relax the existing Save API.
    await f.db.query('UPDATE bz_events SET draft=jsonb_set(draft,ARRAY[$1],to_jsonb($2::text)),revision=revision+1 WHERE id=$3',[key,value,corrupt.packet.event.id]);
    const current=(await f.request('/api/admin/events/'+corrupt.packet.event.id,{cookie:staff.cookie})).data.draft;
    const before=await f.publicationRows(current.event.id);
    error(await mutate(f,staff,approvalPath(current.event.id),'POST',body(current,[corrupt.first.id])),400,code);
    assert.deepEqual(await f.publicationRows(current.event.id),before);
  }
  for(const [kind,key,value] of [['event','name',''],['event','welcome',''],['event','increment',null],['lot','title',''],['lot','category',''],['lot','opening',0]]){
    const incomplete=await completeEvent(f,staff,await futureFields(f)),fields=compact(incomplete.packet);
    if(kind==='event')fields.event[key]=value;else fields.lots[0][key]=value;
    const current=await saved(f,staff,incomplete.packet,fields),before=await f.publicationRows(current.event.id);
    error(await mutate(f,staff,approvalPath(current.event.id),'POST',body(current,[incomplete.first.id])),400,'CATALOG_INCOMPLETE');
    assert.deepEqual(await f.publicationRows(current.event.id),before);
  }
  const dbDate=await f.dbNow();
  const yesterday=new Date(dbDate.getTime()-86400000).toISOString().slice(0,10);
  const alreadyClosed=await completeEvent(f,staff,eventFields(yesterday,'00:00','23:59','UTC'));
  const beforeClosed=await f.publicationRows(alreadyClosed.packet.event.id);
  error(await mutate(f,staff,approvalPath(alreadyClosed.packet.event.id),'POST',body(alreadyClosed.packet,[alreadyClosed.first.id])),409,'WINDOW_CLOSED');
  assert.deepEqual(await f.publicationRows(alreadyClosed.packet.event.id),beforeClosed);
  await phaseBoundaries(f);
  pass('Independent PST/PDT/half-hour UTC oracles agree; gaps, folds and reversed windows reject atomically; exact boundary predicate is inclusive/open and exclusive/close.');

  const atomic=await completeEvent(f,staff,await futureFields(f)),atomicBody=body(atomic.packet,[atomic.first.id,atomic.last.id]);
  const beforeFailure=await f.publicationRows(atomic.packet.event.id);
  await f.rejectCatalogInserts(true,atomic.last.id);
  try{error(await mutate(f,staff,approvalPath(atomic.packet.event.id),'POST',atomicBody),503,'UNAVAILABLE');}
  finally{await f.rejectCatalogInserts(false);}
  assert.deepEqual(await f.publicationRows(atomic.packet.event.id),beforeFailure);
  const recovered=await mutate(f,staff,approvalPath(atomic.packet.event.id),'POST',atomicBody);
  assert.equal(recovered.status,201);await assertApprovalSQL(f,atomic.packet,atomicBody.lotIds,recovered.data.approval);
  const replay=await mutate(f,staff,approvalPath(atomic.packet.event.id),'POST',atomicBody);
  assert.deepEqual(replay.data,recovered.data);
  error(await mutate(f,staff,approvalPath(atomic.packet.event.id),'POST',{...atomicBody,lotIds:[atomic.first.id]}),409,'IDEMPOTENCY_CONFLICT');
  await assert.rejects(f.runtimeDB.query('UPDATE bz_catalog_approvals SET source_revision=source_revision+1 WHERE event_id=$1',[atomic.packet.event.id]),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('DELETE FROM bz_catalog_lots WHERE event_id=$1',[atomic.packet.event.id]),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('UPDATE bz_event_view_grants SET active=true'),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('UPDATE bz_people SET active=true'),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query("UPDATE bz_orgs SET name='Forged provider'"),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('UPDATE bz_staff_grants SET active=true'),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('DELETE FROM bz_staff_grants'),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('DELETE FROM bz_people'),e=>e.code==='42501');
  await assert.rejects(f.runtimeDB.query('INSERT INTO bz_event_view_grants(person_id,event_id,active) VALUES($1,$2,true)',[ids.harbor,atomic.packet.event.id]),e=>e.code==='42501');
  await f.runtimeDB.query('UPDATE bz_people SET lock_marker=NOT lock_marker WHERE id=$1',[ids.staff]);
  pass('Independent mid-transaction database failure leaves no approval/rows/receipt; retry recovers once, and runtime cannot mutate approved records or viewer authority.');

  const priorAuthority=await f.publicationRows(atomic.packet.event.id);
  await f.db.query('UPDATE bz_staff_grants SET active=false WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
  error(await f.request(approvalPath(atomic.packet.event.id),{cookie:staff.cookie}),403,'FORBIDDEN');
  error(await mutate(f,staff,approvalPath(atomic.packet.event.id),'POST',atomicBody),403,'FORBIDDEN');
  assert.deepEqual(await f.publicationRows(atomic.packet.event.id),priorAuthority);
  await f.db.query('UPDATE bz_staff_grants SET active=true WHERE person_id=$1 AND org_id=$2',[ids.staff,ids.saturn]);
  await f.db.query('UPDATE bz_people SET active=false WHERE id=$1',[ids.staff]);
  error(await f.request(approvalPath(atomic.packet.event.id),{cookie:staff.cookie}),401,'UNAUTHENTICATED');
  error(await mutate(f,staff,approvalPath(atomic.packet.event.id),'POST',atomicBody),401,'UNAUTHENTICATED');
  await f.db.query('UPDATE bz_people SET active=true WHERE id=$1',[ids.staff]);
  const expiring=await login(f);
  await f.db.query('UPDATE bz_sessions SET expires_at=clock_timestamp()-interval \'1 second\' WHERE token_hash=encode(sha256($1::bytea),\'hex\')',[Buffer.from(expiring.cookie.split('=')[1])]);
  error(await f.request(approvalPath(atomic.packet.event.id),{cookie:expiring.cookie}),401,'UNAUTHENTICATED');
  error(await mutate(f,expiring,approvalPath(atomic.packet.event.id),'POST',atomicBody),401,'UNAUTHENTICATED');
  assert.deepEqual(await f.publicationRows(atomic.packet.event.id),priorAuthority);
  await f.grantViewer(ids.juniper,atomic.packet.event.id);
  await audience(f,juniper,atomic.packet.event.id,'scheduled',atomic.packet,atomicBody.lotIds,
    {headers:{'x-clock':'2200-01-01','x-person-id':ids.staff,'x-role':'staff','x-member-id':'SATURN'}});
  const spoof=await f.request(audiencePath(atomic.packet.event.id)+'?now=2200-01-01T00:00:00Z&phase=open',{cookie:juniper.cookie});
  assert.equal(spoof.status,200);assert.equal(spoof.data.phase,'scheduled');assert.equal(spoof.data.catalog,null);
  sealedError(await f.request(lotPath(atomic.packet.event.id,atomic.first.id),{cookie:juniper.cookie,headers:{'x-clock':'2200-01-01'}}),409,'CATALOG_NOT_OPEN',atomic.packet);
  sealedError(await f.request(audiencePath(atomic.packet.event.id)),401,'UNAUTHENTICATED',atomic.packet);
  sealedError(await f.request(lotPath(atomic.packet.event.id,atomic.first.id)),401,'UNAUTHENTICATED',atomic.packet);
  const pineApproval=await approve(f,pine,other.packet,[other.first.id,other.last.id]);
  await assertApprovalSQL(f,other.packet,[other.first.id,other.last.id],pineApproval.approval,ids.outsider);
  await f.grantViewer(ids.harbor,other.packet.event.id);
  await audience(f,harbor,other.packet.event.id,'scheduled',other.packet,[other.first.id,other.last.id]);
  for(const actor of [staff,pine,harbor])sealedError(await f.request(audiencePath(atomic.packet.event.id),{cookie:actor.cookie}),403,'FORBIDDEN',atomic.packet);
  sealedError(await f.request(lotPath(atomic.packet.event.id,atomic.first.id),{cookie:harbor.cookie}),403,'FORBIDDEN',atomic.packet);
  await f.grantViewer(ids.juniper,atomic.packet.event.id,false);
  error(await f.request(audiencePath(atomic.packet.event.id),{cookie:juniper.cookie}),403,'FORBIDDEN');
  error(await f.request(lotPath(atomic.packet.event.id,atomic.first.id),{cookie:juniper.cookie}),403,'FORBIDDEN');
  await f.grantViewer(ids.juniper,atomic.packet.event.id);
  await f.db.query('UPDATE bz_people SET active=false WHERE id=$1',[ids.juniper]);
  error(await f.request(audiencePath(atomic.packet.event.id),{cookie:juniper.cookie}),401,'UNAUTHENTICATED');
  await f.db.query('UPDATE bz_people SET active=true WHERE id=$1',[ids.juniper]);
  await f.db.query('UPDATE bz_sessions SET expires_at=clock_timestamp()-interval \'1 second\' WHERE person_id=$1',[ids.juniper]);
  error(await f.request(audiencePath(atomic.packet.event.id),{cookie:juniper.cookie}),401,'UNAUTHENTICATED');
  pass('Viewer authority is event-specific and current; staff/member/header identity never grants it, revoked/expired/inactive people lose audience access, and client clock hints expose no rows.');

  const viewer=await login(f,'bidder-juniper');
  const live=await completeEvent(f,staff,await openFields(f)),liveIDs=[live.first.id,live.last.id];
  const liveApproval=await approve(f,staff,live.packet,liveIDs);await f.grantViewer(ids.juniper,live.packet.event.id);
  await audience(f,viewer,live.packet.event.id,'open',live.packet,liveIDs);
  sealedError(await f.request(lotPath(live.packet.event.id,live.unselected.id),{cookie:viewer.cookie}),404,'NOT_FOUND',live.packet);
  sealedError(await f.request(lotPath(live.packet.event.id,other.first.id),{cookie:viewer.cookie}),404,'NOT_FOUND',other.packet);
  const functionDefinition=(await f.db.query('SELECT pg_get_functiondef($1::regprocedure) AS value',[phaseFunction])).rows[0].value;
  await f.db.query("CREATE OR REPLACE FUNCTION public.bz_catalog_phase(opens_at timestamptz,closes_at timestamptz,at_time timestamptz) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT 'scheduled'::text $$");
  try{
    const beforeCanary=await f.dbNow();
    const controlled=await f.request(audiencePath(live.packet.event.id),{cookie:viewer.cookie});
    const afterCanary=await f.dbNow();
    assert.equal(controlled.status,200);noStore(controlled);
    assert.equal(controlled.data.phase,'scheduled');assert.equal(controlled.data.catalog,null);
    assert.equal(controlled.data.biddingEnabled,false);
    assert.ok(Date.parse(controlled.data.serverNow)>=beforeCanary.getTime()-1&&Date.parse(controlled.data.serverNow)<=afterCanary.getTime()+1);
    assert.deepEqual(controlled.data.schedule,{opensAt:liveApproval.approval.opensAt,closesAt:liveApproval.approval.closesAt});
    for(const hidden of [live.first,live.last,live.unselected])assertNoPrivateLot(controlled,hidden);
    sealedError(await f.request(lotPath(live.packet.event.id,live.first.id),{cookie:viewer.cookie}),409,'CATALOG_NOT_OPEN',live.packet);
  }finally{await f.db.query(functionDefinition);}
  await audience(f,viewer,live.packet.event.id,'open',live.packet,liveIDs);
  // The fixture preload advances app-only Date by365days, crossing tomorrow's
  // window. It never changes PostgreSQL time or any public/product clock switch.
  await f.restart({skew:true});
  const skewProbe=await f.request('/api/session',{cookie:viewer.cookie});
  assert.ok(Math.abs(Number(skewProbe.headers.get('x-fixed-app-clock-skew-ms'))-365*86400000)<10,'Skew must reach the actual HTTP worker.');
  await audience(f,viewer,atomic.packet.event.id,'scheduled',atomic.packet,atomicBody.lotIds);
  sealedError(await f.request(lotPath(atomic.packet.event.id,atomic.first.id),{cookie:viewer.cookie}),409,'CATALOG_NOT_OPEN',atomic.packet);
  await f.restart();
  const pineLive=await completeEvent(f,pine,await openFields(f),ids.pine);
  const pineLiveApproval=await approve(f,pine,pineLive.packet,[pineLive.first.id,pineLive.last.id]);
  await assertApprovalSQL(f,pineLive.packet,[pineLive.first.id,pineLive.last.id],pineLiveApproval.approval,ids.outsider);
  await f.grantViewer(ids.harbor,pineLive.packet.event.id);
  await audience(f,harbor,pineLive.packet.event.id,'open',pineLive.packet,[pineLive.first.id,pineLive.last.id]);
  await browserCatalog(f,pineLive,[pineLive.first.id,pineLive.last.id],'open','bidder-harbor');
  pass('API and direct-lot route consume the exact-boundary DB phase predicate; skewed app Date and forged browser time cannot replace DB time or expose future/unselected rows.');

  await audienceAccountRace(f,staff);
  pass('A clears a previously authorized audience response after logout/account switch rather than adopting old event content.');
}
async function audienceAccountRace(f,staff){
  const x=await completeEvent(f,staff,await openFields(f)),selected=[x.first.id,x.last.id];
  await approve(f,staff,x.packet,selected);await f.grantViewer(ids.juniper,x.packet.event.id);
  const harbor=await login(f,'bidder-harbor');
  error(await f.request(audiencePath(x.packet.event.id),{cookie:harbor.cookie}),403,'FORBIDDEN');
  let browser;try{browser=await chromium.launch({headless:true});}catch{throw new HarnessError('Chromium unavailable.');}
  const c=await browser.newContext({viewport:{width:390,height:844}});
  let release;
  try{
    const page=await c.newPage();await page.goto(f.origin+'/events/'+x.packet.event.id);
    await page.getByRole('combobox',{name:'Test account',exact:true}).selectOption('bidder-juniper');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    const frame=page.frameLocator('iframe[title="BidZizi event"]');
    await expect(frame.locator('h1')).toContainText(x.packet.event.name);
    const releasePromise=new Promise(done=>{release=done;});
    let arrived,delivered;const arrivedPromise=new Promise(done=>{arrived=done;}),deliveredPromise=new Promise(done=>{delivered=done;});
    let captured=false;
    await page.route('**'+audiencePath(x.packet.event.id),async route=>{
      if(captured||route.request().method()!=='GET')return route.continue();captured=true;
      const response=await route.fetch();assert.equal(response.status(),200);
      assert.equal((await response.json()).event.id,x.packet.event.id);arrived();await releasePromise;
      await route.fulfill({response});delivered();
    });
    await page.getByRole('button',{name:'Refresh event',exact:true}).click();
    await Promise.race([arrivedPromise,sleep(15_000).then(()=>{throw new ApplicationFailure('Audience refresh did not reach captured authorized response.');})]);
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.getByRole('combobox',{name:'Test account',exact:true}).selectOption('bidder-harbor');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Event access unavailable',exact:true})).toBeVisible();
    release();await Promise.race([deliveredPromise,sleep(15_000).then(()=>{throw new ApplicationFailure('Held audience response was not delivered.');})]);await sleep(750);
    await expect(page.getByRole('heading',{name:'Event access unavailable',exact:true})).toBeVisible();
    assert.ok(!(await page.locator('body').innerText()).includes(x.first.title));
    const frames=page.frames().filter(frame=>frame.url().includes('staging-bidder'));
    for(const current of frames)assert.ok(!(await current.locator('body').innerText()).includes(x.packet.event.name),'Old authorized A content cannot survive account switch.');
  }catch(e){throw browserFailure(e);}
  finally{release?.();await c.close();await browser.close();}
}
export async function run(mode){
  if(!['acceptance','adversarial'].includes(mode))throw new HarnessError('Evidence mode must be acceptance or adversarial.');
  await withFixture(async f=>{
    const probe=await f.request(approvalPath('30000000-0000-4000-8000-000000000001'));
    if(process.env.VERIFY_TREE==='base'&&probe.status!==404)throw new HarnessError('Baseline must fail finitely on the absent catalog API404, not unrelated app behavior.');
    assert.equal(probe.status,401,'Catalog API missing404 is ordinary feature-absent RED; implemented anonymous request must be401.');
    await (mode==='acceptance'?acceptance:adversarial)(f);
  });
  assert.equal(groups,mode==='acceptance'?4:7,'Every fixed assertion group must complete.');
  console.log(groups+' independent catalog '+mode+' groups completed.');
}
