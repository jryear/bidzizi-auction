import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

// Read-only independent hosted UI inspection. The only POSTs create and close
// this browser's fresh synthetic staff session; no fixture or grant is changed.
const require = createRequire('/Users/jryear/orca/workspaces/integration/saturn-v1-member-ui/package.json');
const {chromium} = require('@playwright/test');
const origin = 'https://staging.bidzizi.com';
const source = 'fe1300920351ba398673d4ca4f25ce2aea6b9f80';
const eventId = '9c32e7e7-cf56-4c6b-a1fb-3e31a5d009c6';
const dir = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:1});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], rows = [];
page.on('pageerror', error => errors.push(error.message));
let logoutStatus;
try {
  const initial = await context.request.get(origin + '/api/session');
  assert.equal(initial.status(), 200);
  assert.equal((await initial.json()).authenticated, false);
  const login = await context.request.post(origin + '/api/test-auth/login', {
    data:{account:'staff-saturn'}, headers:{origin}
  });
  assert.equal(login.status(), 200);
  for (const view of ['results', 'display']) {
    await page.goto(`${origin}/events/${eventId}/${view}`);
    await page.locator('main[data-state="current"]').waitFor();
    for (const width of [390, 1440]) {
      await page.setViewportSize({width,height:width===390?844:1120});
      const target = view==='results' ? page.locator('tbody tr').first() : page.locator('article').first();
      if (width===390) await target.scrollIntoViewIfNeeded();
      else await page.evaluate(() => scrollTo(0,0));
      // Lazy images outside the viewport are deliberately excluded from decode.
      await page.waitForFunction(() => [...document.images].filter(i => {
        const r=i.getBoundingClientRect(); return r.bottom>0 && r.top<innerHeight;
      }).every(i => i.complete && i.naturalWidth>0));
      await page.locator('main[data-state="current"]').waitFor();
      const metrics = await page.evaluate(() => ({
        width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
        documentWidth:document.documentElement.scrollWidth,scrollY,
        state:document.querySelector('main').dataset.state,
        amounts:[...document.querySelectorAll('[data-current-amount]')].map(e=>e.textContent),
        text:document.querySelector('main').innerText,
        images:[...document.images].map(i=>({path:new URL(i.src).pathname,
          complete:i.complete,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight}))
      }));
      assert.equal(metrics.state,'current');
      assert.equal(metrics.width,width);
      assert.equal(metrics.dpr,1);
      assert.ok(metrics.documentWidth<=width);
      assert.ok(metrics.amounts.includes('T$62.03') && metrics.amounts.includes('T$250.00'));
      assert.match(metrics.text,/Closed/);
      const path=`${dir}parent-fe13009-short-${view}-${width}.png`;
      await page.screenshot({path});
      const png=await readFile(path);
      rows.push({view,metrics,path,png:{width:png.readUInt32BE(16),height:png.readUInt32BE(20)},sha256:createHash('sha256').update(png).digest('hex')});
    }
  }
  assert.deepEqual(errors,[]);
} finally {
  const response=await context.request.post(origin+'/api/session/logout',{headers:{origin}}).catch(()=>null);
  logoutStatus=response?.status();
  await context.close();
  await browser.close();
}
assert.equal(logoutStatus,200);
await writeFile(dir+'PARENT_HOSTED_CLOSED_READBACK.json',JSON.stringify({
  kind:'INDEPENDENT_READ_ONLY_REAL_HOSTED_RENDER',source,eventId,origin,
  runtime:process.version,rows,errors,logoutStatus,
  sourceBinding:'Backend exact deployment and contemporaneous canonical main readback; no new deployment claimed',
  cleanup:'Fresh no-cookie synthetic staff session logged out; browser closed; no fixture or grant writes'
},null,2));
console.log(JSON.stringify({source,eventId,rows:rows.map(({view,metrics,png})=>({view,width:metrics.width,state:metrics.state,amounts:metrics.amounts,png})),errors,logoutStatus}));
