// Safari-engine pass of what the second pass added: Member ID identity, watching, search, maximum, larger text.
// Run: URL=http://127.0.0.1:4322/ node evidence/webkit-foundation.mjs   (iPhone 13 emulation; not real iOS hardware)
import { webkit, devices } from '../../../node_modules/@playwright/test/index.mjs';
const OUT = new URL('./shots/', import.meta.url).pathname;
const b = await webkit.launch();
const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(e.message));
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const go = (h) => p.evaluate((x) => { location.hash = x; }, h);
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
await p.goto(process.env.URL || 'http://127.0.0.1:4321/'); await p.waitForSelector('#view h1');

await go('#/lots'); await p.waitForSelector('.card');
check('pill nav shows four sections', (await p.locator('.pillnav .tab').count()) === 4);
await p.tap('.watch[data-watch="coffee"]');
check('watch toggles', (await p.getAttribute('.watch[data-watch="coffee"]', 'aria-pressed')) === 'true');
await p.fill('input[data-search]', 'coffee');
check('search narrows lots', (await p.locator('.card').count()) === 1);
await p.screenshot({ path: OUT + 'wk-p2-1-lots.png' });
await p.fill('input[data-search]', '');
await go('#/watching'); await p.waitForSelector('.watching');
check('Watching lists the watched lot', (await p.locator('.watching .row').count()) === 1);
await p.screenshot({ path: OUT + 'wk-p2-2-watching.png' });

await go('#/lot/cabin'); await p.waitForSelector('.detail');
check('lot page has BidZizi header', (await p.locator('.topbar .wordmark').innerText()) === 'BidZizi');
await p.tap('[data-key="cta"]'); await p.waitForSelector('#f-phone');
await p.fill('#f-phone', '5550100142'); await p.tap('[data-action="id-phone"]');
await p.fill('#f-code', '123456'); await p.tap('[data-action="id-code"]');
await p.waitForSelector('#f-member');
await p.fill('#f-biz', ''); await p.fill('#f-member', 'DEMO-1');
await p.tap('[data-action="id-who"]');
check('Member ID with no business is refused', /alone isn't enough/.test(await p.locator('#id-err').innerText()));
await p.screenshot({ path: OUT + 'wk-p2-3-memberid-refused.png' });
await p.fill('#f-biz', 'Juniper Studio'); await p.tap('[data-action="id-who"]'); await p.waitForSelector('#amt');
await p.tap('[data-action="close-sheet"]'); await p.waitForSelector('#sheet', { state: 'hidden' });

await p.tap('[data-action="max"]'); await p.waitForSelector('#mx');
await p.fill('#mx', '500'); await p.tap('#cta'); await p.waitForSelector('.confirm');
check('Confirm disabled until ticked', await p.locator('[data-action="mx-save"]').isDisabled());
await p.tap('[data-key="mx-ack"]');
await p.screenshot({ path: OUT + 'wk-p2-4-max-confirm.png' });
await p.tap('[data-action="mx-save"]'); await p.waitForSelector('.result.t-ink', { timeout: 6000 });
check('maximum saved only after confirmation, placed no bid', /placed no bid/.test(await p.locator('#sheet').innerText()));
await p.tap('[data-action="close-sheet"]'); await p.waitForSelector('#sheet', { state: 'hidden' });

await go('#/event'); await p.waitForSelector('.eventinfo');
await p.tap('[data-action="appearance"]'); await p.waitForSelector('.seg2');
await p.tap('[data-k="text"][data-v="large"]');
await p.waitForFunction(() => document.documentElement.dataset.text === 'large');
await p.tap('[data-action="close-sheet"]'); await p.waitForSelector('#sheet', { state: 'hidden' });
for (const h of ['#/lots', '#/watching', '#/bids', '#/event', '#/lot/dinner']) {
  await go(h); await p.waitForSelector('main'); await p.waitForTimeout(250);
  check(`no horizontal overflow with larger text: ${h}`, !(await overflow()));
}
await p.screenshot({ path: OUT + 'wk-p2-5-large-detail.png' });
check('no console errors', errs.length === 0, errs.join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await b.close(); process.exit(failed ? 1 : 0);
