// Independent red-team counterexample promoted into the protected packet.
import assert from 'node:assert/strict';
import { chromium,expect } from '@playwright/test';
import { withFixture,HarnessError,ApplicationFailure,evidenceExit,browserFailure } from './harness.mjs';
import { configuration,ids,login,create,read,mutate,compact,uuid,lot,assertStoredDraft } from './protocol.mjs';

const wait=ms=>new Promise(done=>setTimeout(done,ms));
let groups=0;
const passed=label=>{ groups++; console.log(`PASS ${groups}: ${label}`); };

try {
  await withFixture(async f=>{
    await f.initialize();
    const saturn=await login(f),pine=await login(f,'staff-pine');
    const first=await create(f,saturn,'Saturn initial review event');
    const held=await create(f,saturn,'Saturn delayed private review event');
    const other=await create(f,pine,'Pine authorized review event',ids.pine);
    let browser;
    try { browser=await chromium.launch({headless:true}); }
    catch { throw new HarnessError('Installed Chromium is unavailable for tenant race evidence.'); }
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage(),pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    let release;
    try {
      await page.goto(`${f.origin}/admin?event=${first.draft.event.id}`,{waitUntil:'domcontentloaded',timeout:20_000});
      const admin=page.frameLocator('iframe[title="BidZizi admin workspace"]');
      await admin.getByLabel('Test account',{exact:true}).selectOption('staff-saturn');
      await admin.getByRole('button',{name:'Sign in',exact:true}).click();
      await expect(admin.locator('[data-event="name"]')).toHaveValue(first.draft.event.name);

      const releaseResponse=new Promise(done=>{ release=done; });
      let arrived,delivered;
      const responseArrived=new Promise(done=>{ arrived=done; });
      const responseDelivered=new Promise(done=>{ delivered=done; });
      let captured=false;
      await page.route(`**/api/admin/events/${held.draft.event.id}`,async route=>{
        if (captured || route.request().method()!=='GET') return route.continue();
        captured=true;
        // Capture while Saturn is still authorized. A later forbidden request
        // would not challenge this stale private-content response vulnerability.
        const response=await route.fetch();
        assert.equal(response.status(),200);
        assert.equal((await response.json()).draft.event.id,held.draft.event.id);
        arrived();
        await releaseResponse;
        await route.fulfill({response});
        delivered();
      });
      await admin.getByRole('button',{name:/^Event studio/}).click();
      await admin.getByRole('button',{name:/Saturn delayed private review event/}).click();
      await Promise.race([responseArrived,wait(15_000).then(()=>{ throw new ApplicationFailure('Authorized delayed GET did not arrive within the evidence deadline.'); })]);
      assert.equal(await admin.locator('[data-event="name"]').isDisabled(),true,'Pending event load must lock editing.');
      await page.keyboard.press('Escape');
      await admin.getByRole('button',{name:'Sign out',exact:true}).click();
      await expect(admin.getByRole('heading',{name:'Choose a test account',exact:true})).toBeVisible();
      await admin.getByLabel('Test account',{exact:true}).selectOption('staff-pine');
      await admin.getByRole('button',{name:'Sign in',exact:true}).click();
      await expect(admin.locator('[data-event="name"]')).toHaveValue(other.draft.event.name);
      release();
      await Promise.race([responseDelivered,wait(15_000).then(()=>{ throw new ApplicationFailure('Held authorized response was not delivered within the evidence deadline.'); })]);
      await wait(750);
      await expect(admin.locator('[data-event="name"]')).toHaveValue(other.draft.event.name);
      await expect(admin.locator('#org-name')).toHaveText('Pine Street Exchange');
      const preview=admin.frameLocator('#bidder-frame');
      await expect(preview.locator('h1')).toContainText(other.draft.event.name);
      assert.ok(!(await admin.locator('body').innerText()).includes(held.draft.event.name),'Late Saturn response cannot repopulate Pine shell.');
      passed('Previously authorized Saturn response cannot overwrite Pine editor, organization or actual A preview after logout/sign-in.');

      const canary='<img src=x onerror="window.__redteamExecuted=true">';
      const current=await read(f,pine,other.draft.event.id),edited=compact(current);
      edited.event.name=canary; edited.event.welcome=canary;
      edited.lots=[{...lot(canary),description:canary,includes:[canary],fine:canary,image:'assets/lots/cabin.jpg'}];
      const result=await mutate(f,pine,`/api/admin/events/${other.draft.event.id}`,'PUT',{expectedRevision:current.revision,requestId:uuid(),draft:edited});
      assert.equal(result.status,200);
      await assertStoredDraft(f,other.draft.event.id,edited);
      await page.reload({waitUntil:'domcontentloaded'});
      await expect(admin.locator('[data-event="name"]')).toHaveValue(canary);
      await expect(preview.locator('h1')).toContainText(canary);
      const adminFrame=page.frames().find(frame=>frame.url().includes('/staging-admin/'));
      const previewFrame=page.frames().find(frame=>frame.url().includes('/staging-bidder-preview/'));
      assert.ok(adminFrame && previewFrame);
      assert.equal(await adminFrame.evaluate(()=>Boolean(window.__redteamExecuted)),false);
      assert.equal(await previewFrame.evaluate(()=>Boolean(window.__redteamExecuted)),false);
      assert.equal(await adminFrame.locator('img[src="x"]').count(),0);
      assert.equal(await previewFrame.locator('img[src="x"]').count(),0);
      assert.deepEqual(pageErrors,[]);
      passed('Hostile stored title/welcome remain literal text in editor and A preview, and complete JSON equals direct SQL storage.');

      const restarted=await f.alternative();
      const durable=await restarted.request(`/api/admin/events/${other.draft.event.id}`,{cookie:pine.cookie});
      assert.equal(durable.status,200);
      assert.deepEqual(compact(durable.data.draft),edited);
      await assertStoredDraft(f,other.draft.event.id,edited);
      passed('Complete submitted event/lot data survive a Next process restart using the prior server-held session.');
    } catch (failure) { throw browserFailure(failure,'tenant race and stored-text browser checks'); }
    finally { release?.(); await context.close(); await browser.close(); }
  },configuration);
  assert.equal(groups,3,'Every frozen tenant race/storage group must finish.');
  console.log('3 independent context-race groups passed.');
} catch (failure) {
  console.error(`${failure instanceof HarnessError ? 'HARNESS' : failure instanceof ApplicationFailure ? 'APPLICATION' : 'FAIL'}: ${failure.message}`);
  process.exitCode=evidenceExit(failure);
}
