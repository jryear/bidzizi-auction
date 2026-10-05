// Safari-engine smoke test (iPad/Mac Safari relevance): dialogs as history entries, the preview iframe, container queries, QR.
// Usage: URL=http://127.0.0.1:4351/ node evidence/webkit-smoke.mjs
import { webkit } from '../../../node_modules/@playwright/test/index.mjs';
const URL_ = process.env.URL || 'http://127.0.0.1:4351/';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d ? '  → ' + d : ''}`); };
const b = await webkit.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL_ + '#/events'); await p.waitForSelector('.evcard');
ok('events render', (await p.locator('.evcard').count()) === 2);
await p.click('[data-key="new-event"]'); await p.waitForSelector('dialog#sheet[open]');
await p.fill('#c-name', 'Safari Test Event'); await p.click('[data-action="event-create"]'); await p.waitForFunction(() => location.hash.includes('/overview'));
ok('create event works', (await p.locator('.top-prog b').innerText()).trim() === '0 of 6');
await p.goto(URL_ + '#/e/ev-holiday/lots'); await p.waitForSelector('.lrow'); await p.click('[data-action="preview-toggle"]');
const f = p.frameLocator('#pv-frame'); await f.locator('h1').first().waitFor();
ok('preview iframe renders A markup', (await f.locator('main.entry').count()) === 1);
ok('1280px with preview docked: lots reflow, nothing under the preview', await p.evaluate(() => { const m = document.getElementById('main').getBoundingClientRect(); return [...document.querySelectorAll('#main .lrow *')].every((e) => { const r = e.getBoundingClientRect(); return !r.width || r.right <= m.right + 1; }); }));
await p.click('[data-key="add-lot"]'); await p.waitForSelector('dialog#sheet[open]'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
ok('Escape closes a sheet', (await p.locator('dialog#sheet[open]').count()) === 0);
await p.goto(URL_ + '#/e/ev-spring/access'); await p.waitForSelector('.qr');
ok('QR renders', (await p.locator('.qr path').count()) === 1);
ok('no console errors', errs.length === 0, errs.join(' | '));
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
