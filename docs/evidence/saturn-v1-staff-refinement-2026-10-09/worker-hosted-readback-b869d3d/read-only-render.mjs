import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Owned external browser only. Real hosted DTOs/assets; candidate mode changes CSS
// responses only. No fixture, profile, grant, event, bid or pledge writes.
const require = createRequire('/Users/jryear/orca/workspaces/integration/saturn-v1-member-ui/package.json');
const {chromium} = require('@playwright/test');
const mode = process.argv[2] || 'before';
const candidate = mode!=='before' && mode!=='deployed';
const deployedSource = mode==='deployed' ? process.argv[3] : null;
const focusedOnly = process.argv[4]==='focused';
if(mode==='deployed')assert.match(deployedSource||'',/^[0-9a-f]{40}$/,'Exact announced deployed source required');
const origin = 'https://staging.bidzizi.com';
const primary = '990280fa-51db-47cd-aabe-5d15bf776002';
const short = '9c32e7e7-cf56-4c6b-a1fb-3e31a5d009c6';
const root = new URL('.', import.meta.url).pathname;
const repo = new URL('../../../', import.meta.url).pathname;
const out = root + mode + (deployedSource?'-'+deployedSource.slice(0,7)+'-'+new Date().toISOString().replaceAll(/[:.]/g,'-'):'');
await mkdir(out, {recursive:true});
const hash = value => createHash('sha256').update(value).digest('hex');
const source = execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const css = await readFile(repo+'public/staging-admin/studio.css','utf8');
const moduleCSS = await readFile(repo+'src/features/staging-display-results/display-results.module.css','utf8');
const report = {mode,source,runtime:process.version,origin,startedAt:new Date().toISOString(),
  probeSHA256:hash(await readFile(new URL(import.meta.url))),
  ownHead:source,productCandidate:'34b0932741231841b3007c5656680e575797ee0a',deployedSource,
  sourceFields:'source and ownHead identify this evidence checkout; deployedSource is the separately announced actual release',
  kind:candidate?'CANDIDATE_CSS_INTERCEPTION_REAL_HOSTED_DTOS':'REAL_HOSTED_READ_ONLY_RENDER',
  cssHash:hash(css),moduleHash:hash(moduleCSS),served:[],compiledCSS:[],rows:[],checks:[],errors:[],blockedWrites:[],interceptions:[]};
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:1440,height:1120},deviceScaleFactor:1});
const page = await context.newPage();
page.setDefaultTimeout(18000);
page.on('pageerror', e=>report.errors.push(e.message));
const observedCSS=[];
page.on('response',response=>{
  const path=new URL(response.url()).pathname;
  if(mode==='deployed' && path.startsWith('/_next/') && path.endsWith('.css'))observedCSS.push((async()=>{
    const body=await response.body();
    if(body.toString().includes('display-results-module'))report.compiledCSS.push({path,status:response.status(),sha256:hash(body)});
  })().catch(error=>report.errors.push('CSS observation: '+error.message)));
});
await context.route('**/*', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  if (!['GET','HEAD'].includes(request.method()) && !['/api/test-auth/login','/api/session/logout'].includes(path)) {
    report.blockedWrites.push({method:request.method(),path});
    return route.abort('blockedbyclient');
  }
  if (candidate && path==='/staging-admin/studio.css') {
    report.interceptions.push({path,hash:hash(css)});
    return route.fulfill({status:200,contentType:'text/css',body:css});
  }
  // Module names are taken from the unchanged real compiled stylesheet. Preserve
  // the entire fetched stylesheet and append only the scoped candidate CSS.
  if (candidate && path.startsWith('/_next/') && path.endsWith('.css')) {
    const response = await route.fetch(), body = await response.text();
    const mapping = {};
    for (const token of body.matchAll(/\.([\w-]*display-results[\w-]*__([A-Za-z]\w*))/g)) mapping[token[2]]=token[1];
    if (mapping.board) {
      const transformed=moduleCSS.replace(/\.([A-Za-z]\w*)/g,(token,name)=>mapping[name]?'.'+mapping[name]:token);
      report.interceptions.push({path,baseHash:hash(body),mapping,candidateHash:hash(moduleCSS)});
      return route.fulfill({response,body:body+'\n'+transformed});
    }
    return route.fulfill({response,body});
  }
  return route.continue();
});

async function readyImages(frame) {
  await frame.waitForFunction(()=>[...document.images].filter(i=>{
    const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
  }).every(i=>i.complete&&i.naturalWidth>0),{timeout:12000});
}
async function capture(view,width,frame,eventId,position='top') {
  await frame.evaluate(()=>document.fonts.ready);
  await readyImages(frame);
  const metrics=await frame.evaluate(()=>{
    const rect=e=>e?{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}:null;
    const main=document.querySelector('#main')||document.querySelector('main');
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,
      documentScrollTop:document.documentElement.scrollTop,main:main?{...rect(main),scrollTop:main.scrollTop,scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,scrollWidth:main.scrollWidth,clientWidth:main.clientWidth}:null,
      chrome:{sidebar:rect(document.querySelector('.studio-sidebar')),top:rect(document.querySelector('.top')),bar:rect(document.querySelector('.bar')),hero:rect(document.querySelector('header[class*="hero"]')),notice:rect(document.querySelector('[class*="notice"]'))},
      firstWork:rect(document.querySelector('.lot-row')||document.querySelector('.staff-row')||document.querySelector('tbody tr')||document.querySelector('article')),
      state:document.querySelector('main')?.dataset.state,
      amounts:[...document.querySelectorAll('[data-current-amount],.staff-amount,.lot-amount')].map(e=>e.textContent),
      text:main?.innerText,title:document.querySelector('#event-title,h1')?.innerText,
      images:[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).map(i=>({path:new URL(i.src).pathname,width:i.naturalWidth,height:i.naturalHeight})),
      classes:[...document.querySelectorAll('main,header,h1,dl,article')].map(e=>e.className)};
  });
  assert.equal(metrics.width,width);assert.equal(metrics.dpr,1);assert.ok(metrics.documentWidth<=width);
  if(metrics.main)assert.ok(metrics.main.scrollWidth<=metrics.main.clientWidth+1);
  const file=`${view}-${width}-${position}.png`;
  await page.screenshot({path:out+'/'+file});
  const png=await readFile(out+'/'+file);
  report.rows.push({view,eventId,position,metrics,path:out+'/'+file,png:{width:png.readUInt32BE(16),height:png.readUInt32BE(20),sha256:hash(png)}});
  console.log(JSON.stringify({mode,view,width,position,main:metrics.main,firstWork:metrics.firstWork}));
}
let logoutStatus;
try {
  const initial=await context.request.get(origin+'/api/session');
  assert.equal((await initial.json()).authenticated,false);
  assert.equal((await context.request.post(origin+'/api/test-auth/login',{data:{account:'staff-saturn'},headers:{origin}})).status(),200);
  for(const path of ['/staging-admin/studio.css','/staging-admin/studio.js']) {
    const response=await context.request.get(origin+path);assert.equal(response.status(),200);
    report.served.push({path,sha256:hash(await response.body())});
    if(mode==='deployed'&&path.endsWith('studio.css'))assert.equal(report.served.at(-1).sha256,hash(css));
  }
  for (const width of mode.startsWith('focused')||focusedOnly?[]:[1440,390,360]) {
    await page.setViewportSize({width,height:width===1440?1120:844});
    for (const view of ['lots','event','bidders','donations']) {
      await page.goto(`${origin}/admin?event=${primary}&tab=${view}`);
      const frame=await page.locator('iframe[title="BidZizi admin workspace"]').elementHandle().then(e=>e.contentFrame());
      await frame.locator('#event-title').waitFor();
      if(view==='bidders'||view==='donations')await frame.locator('#operations-status').filter({hasText:'Confirmed staff read'}).waitFor();
      await frame.locator('#main').evaluate(e=>e.scrollTop=0);
      await capture(view,width,frame,primary);
      if(mode==='deployed'&&width!==1440)assert.equal(await frame.locator('#main').evaluate(e=>e.clientHeight),379);
      const main=frame.locator('#main');
      await main.evaluate(e=>e.scrollTop=e.scrollHeight);
      const scroll=await main.evaluate(e=>({scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}));
      assert.ok(scroll.scrollHeight<=scroll.clientHeight+1||scroll.scrollTop>0);
      report.checks.push({view,width,nativeMainScroll:scroll});
      if(width===390 && (view==='lots'||view==='donations'))await capture(view,width,frame,primary,'bottom');
    }
    for (const view of ['results','display']) {
      await page.goto(`${origin}/events/${short}/${view}`);
      await page.locator('main[data-state="current"]').waitFor();
      if(mode==='deployed'&&width!==1440)assert.equal(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontSize),'32px');
      await capture(view,width,page,short);
      const amounts=await page.locator('[data-current-amount]').allTextContents();
      assert.deepEqual(amounts,['T$62.03','T$250.00']);
      assert.match(await page.locator('main').innerText(),/Closed · recorded standing/);
      report.checks.push({view,width,closedExactAmounts:amounts});
      if(width!==1440){await page.locator(view==='results'?'tbody tr':'article').first().scrollIntoViewIfNeeded();await capture(view,width,page,short,'work');}
    }
  }
  // Focus, native Back/reload, real open standing, dated transport failure and
  // anonymous denial are presentation checks. Only the GET transport failure
  // below is injected; it is never relabeled as a server outage or revocation.
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${origin}/admin?event=${primary}&tab=lots`);
  let frame=await page.locator('iframe[title="BidZizi admin workspace"]').elementHandle().then(e=>e.contentFrame());
  await frame.locator('#event-title').waitFor();
  await frame.locator('#catalog-approval').filter({hasText:'Approved'}).waitFor();
  const search=frame.locator('.inventory-search input');
  await search.fill('Cabin');
  assert.equal(await frame.locator('.lot-row').count(),1);
  await search.fill('');
  await search.focus();await page.keyboard.press('Tab');
  const focus=await frame.evaluate(()=>{
    const e=document.activeElement,r=e.getBoundingClientRect(),main=document.querySelector('#main').getBoundingClientRect();
    return {tag:e.tagName,type:e.type,outline:getComputedStyle(e).outlineColor,outlineWidth:getComputedStyle(e).outlineWidth,
      visible:r.top>=main.top&&r.bottom<=main.bottom+1,scrollTop:document.querySelector('#main').scrollTop};
  });
  assert.equal(focus.type,'checkbox');assert.equal(focus.outlineWidth,'3px');assert.ok(focus.visible);
  report.checks.push({keyboardFocusBeforeScroll:focus});
  await page.keyboard.press('PageDown');
  await frame.waitForFunction(top=>document.querySelector('#main').scrollTop>top,focus.scrollTop,{timeout:3000});
  const keyboardScroll=await frame.locator('#main').evaluate(e=>e.scrollTop);
  assert.ok(keyboardScroll>focus.scrollTop);
  report.checks.push({keyboardFocus:focus,pageDownMainScroll:keyboardScroll,filter:'Cabin local filter restored without save'});
  await capture('keyboard-focus',390,frame,primary,'work');
  const touch=await frame.locator('.tabs a,.bar-actions .btn').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>({text:e.textContent,height:e.getBoundingClientRect().height})));
  report.checks.push({touchTargets:touch});
  if(candidate||mode==='deployed')assert.ok(touch.every(e=>e.height>=44));
  await frame.getByRole('link',{name:'Recorded standing',exact:true}).click();
  await page.locator('main[data-state="current"]').waitFor();
  const primaryAmounts=await page.locator('[data-current-amount]').allTextContents();
  const primaryDTO=await (await context.request.get(`${origin}/api/admin/events/${primary}/results`)).json();
  const dtoAmounts=primaryDTO.lots.map(row=>'T$'+(row.standing.currentAmountMinor/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  assert.deepEqual(primaryAmounts,dtoAmounts);
  report.checks.push({primaryOpenRead:{serverNow:primaryDTO.serverNow,phase:primaryDTO.phase,
    amountsMinor:primaryDTO.lots.map(row=>row.standing.currentAmountMinor),amounts:primaryAmounts}});
  assert.equal(primaryDTO.phase,'open');
  await page.getByText('open · confirmed staff read',{exact:true}).waitFor();
  await capture('primary-open-results',390,page,primary);
  await page.reload();await page.locator('main[data-state="current"]').waitFor();
  assert.deepEqual(await page.locator('[data-current-amount]').allTextContents(),primaryAmounts);
  await page.goBack();
  frame=await page.locator('iframe[title="BidZizi admin workspace"]').elementHandle().then(e=>e.contentFrame());
  await frame.locator('#event-title').waitFor();assert.match(await frame.locator('#event-title').innerText(),/Saturn V1 Demo/);
  await page.reload();
  frame=await page.locator('iframe[title="BidZizi admin workspace"]').elementHandle().then(e=>e.contentFrame());
  await frame.locator('.lot-row').first().waitFor();
  report.checks.push({nativeNavigation:'Studio to exact primary results; reload amounts unchanged; Back and Studio reload retain same event'});
  await page.goto(`${origin}/events/${short}/results`);
  await page.locator('main[data-state="current"]').waitFor();
  const resultPath=`**/api/admin/events/${short}/results`;
  await page.route(resultPath,r=>r.abort('failed'));
  await page.getByRole('button',{name:'Refresh standing',exact:true}).click();
  await page.getByText('Refresh failed. Any retained amounts are from the dated, last confirmed read.').waitFor();
  assert.equal(await page.locator('[data-current-amount][data-stale="true"]').count(),2);
  assert.ok(await page.getByRole('button',{name:'Download CSV',exact:true}).isDisabled());
  await page.locator('tbody tr').first().scrollIntoViewIfNeeded();
  await capture('stale-results',390,page,short,'work');
  await page.unroute(resultPath);
  await page.getByRole('button',{name:'Refresh standing',exact:true}).click();
  await page.locator('main[data-state="current"]').waitFor();
  assert.deepEqual(await page.locator('[data-current-amount]').allTextContents(),['T$62.03','T$250.00']);
  report.checks.push({stale:'Injected GET failure retains dated exact amounts, marks both stale, disables CSV; explicit retry restores current'});
  // No cookie/session mutation is needed to inspect real denied rendering.
  const anon=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const denied=await anon.newPage();
  if(candidate)await anon.route('**/_next/**/*.css',async route=>{
    const response=await route.fetch(),body=await response.text(),mapping={};
    for(const token of body.matchAll(/\.([\w-]*display-results[\w-]*__([A-Za-z]\w*))/g))mapping[token[2]]=token[1];
    const transformed=mapping.board?moduleCSS.replace(/\.([A-Za-z]\w*)/g,(t,n)=>mapping[n]?'.'+mapping[n]:t):'';
    await route.fulfill({response,body:body+'\n'+transformed});
  });
  await denied.goto(`${origin}/events/${short}/display`);
  await denied.locator('main[data-state="denied"]').waitFor();
  assert.equal(await denied.locator('article,[data-current-amount]').count(),0);
  assert.ok(await denied.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await denied.screenshot({path:out+'/denied-display-390.png'});
  report.checks.push({denied:'Fresh anonymous browser real access refusal; no private rows or amounts; no overflow'});
  await anon.close();
  await Promise.all(observedCSS);
  if(mode==='deployed'){assert.deepEqual(report.interceptions,[]);assert.ok(report.compiledCSS.length>0);}
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.blockedWrites,[]);
} catch(error) {
  report.failure=String(error);process.exitCode=1;
  await page.screenshot({path:out+'/failure.png'}).catch(()=>{});
} finally {
  const response=await context.request.post(origin+'/api/session/logout',{data:{},headers:{origin}}).catch(()=>null);
  logoutStatus=response?.status();
  await context.close();await browser.close();
  report.logoutStatus=logoutStatus;report.cleanup='Owned context and browser closed; no app/database/harness started';
  report.completedAt=new Date().toISOString();
  await writeFile(out+'/RENDER_RECEIPT.json',JSON.stringify(report,null,2));
}
assert.equal(logoutStatus,200);
console.log(JSON.stringify({mode,rows:report.rows.length,failure:report.failure,errors:report.errors,logoutStatus}));
