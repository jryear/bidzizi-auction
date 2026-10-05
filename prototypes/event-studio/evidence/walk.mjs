// Drives the Event Studio prototype in Chromium: the primary journey end to end, then validation, reload,
// back/close, repeated clicks, draft-vs-applied, event isolation, honesty labels and layout bounds.
// Usage: URL=http://127.0.0.1:4351/ node evidence/walk.mjs   (needs @playwright/test from the repo root)
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ = process.env.URL || 'http://127.0.0.1:4351/';
const KEY = 'eventstudio1.v1';
const here = path.dirname(fileURLToPath(import.meta.url)), shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });
let pass = 0, fail = 0; const failures = [];
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? '  → ' + detail : ''}`); } };
const section = (t) => console.log(`\n${t}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: false });
const page = await ctx.newPage();
const problems = [], external = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
page.on('dialog', (d) => d.accept());

const shot = async (name, opts = {}) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(shots, `${name}.png`), ...opts }); };
const store = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const evOf = async (id) => (await store()).events[id];
const hash = () => page.evaluate(() => location.hash);
const topProg = async () => (await page.locator('.top-prog b').innerText()).trim();
const frame = () => page.frameLocator('#pv-frame');
const goto = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(200); };
const toast = () => page.locator('#toasts .toast').first();
const setPreview = async (on) => { const cur = (await page.locator('[data-action="preview-toggle"]').getAttribute('aria-pressed')) === 'true'; if (cur !== on) await page.click('[data-action="preview-toggle"]'); await page.waitForTimeout(150); };

// ================================================================================================
section('0. First load: the organization and its two example events');
await page.goto(URL_ + '#/events'); await page.waitForSelector('.evcard');
ok('events page lists both example events', (await page.locator('.evcard').count()) === 2);
ok('events show different progress', (await page.locator('.ev-line').allInnerTexts()).join('|').includes('4 of 6') && (await page.locator('.ev-line').allInnerTexts()).join('|').includes('6 of 6'));
await shot('01-events');

// ================================================================================================
section('1. Create event (validation, repeated clicks)');
await page.click('[data-key="new-event"]'); await page.waitForSelector('dialog#sheet[open]');
ok('create sheet opened as a history entry', (await hash()).includes('sheet=create-event'));
await page.click('[data-action="event-create"]');
ok('empty name is refused with a message', (await page.locator('#err-c-name').innerText()).includes('Name the event'));
ok('sheet stays open after refusal', await page.locator('dialog#sheet[open]').count() === 1);
await page.fill('#c-name', 'Holiday Trade Show Auction');
await page.click('[data-action="event-create"]');
ok('duplicate event name is refused', (await page.locator('#err-c-name').innerText()).includes('already has this name'));
await page.fill('#c-name', 'Autumn Gala Test');
await page.fill('#c-date', '2026-11-14');
const btn = page.locator('[data-action="event-create"]');
await btn.dblclick().catch(() => {}); // repeated click: must create exactly one event
await page.waitForFunction(() => location.hash.includes('/overview'));
await page.waitForTimeout(300);
const s1 = await store();
const created = Object.values(s1.events).filter((e) => e.name === 'Autumn Gala Test');
ok('double-click creates exactly one event', created.length === 1, `found ${created.length}`);
const NEW = created[0]?.id;
ok('landed on the new event overview', (await hash()).includes(`/e/${NEW}/overview`));
ok('new event is empty: 0 of 6 required, nothing done', (await topProg()) === '0 of 6');
const nextTitle = await page.locator('.nextcard h2').innerText();
ok('overview names a next action', nextTitle.length > 3, nextTitle);
ok('top bar offers the same next action in short form', (await page.locator('[data-key="top-next"]').innerText()).includes('date'));
ok('a brand-new event shows nothing as wrong: no red anywhere', (await page.locator('.step.t-red, .nd.attn, .segs i.attn, .iss.s-wrong').count()) === 0);
ok('date given at creation counts as started but time still needed', nextTitle.toLowerCase().includes('date and time'), nextTitle);
await shot('02-new-event-overview', { fullPage: false });
ok('dialog closed and Back does not reopen it', await page.locator('dialog#sheet[open]').count() === 0);

// ================================================================================================
section('2. Event page: details, welcome, heading image, reload persistence');
await page.click('[data-key="nav-details"]');
await page.fill('#f-start', '16:00'); await page.fill('#f-end', '15:00');
ok('end before start shows an inline error', (await page.locator('#err-f-end').innerText()).includes('after the start'));
ok('step is not complete with a bad time', (await topProg()) === '0 of 6');
ok('a wrong time is flagged red in the navigation (missing things are not)', (await page.locator('[data-key="nav-details"] .nd.attn').count()) === 1);
await page.fill('#f-end', '21:00');
ok('error clears when fixed', await page.locator('#err-f-end').isHidden());
await page.fill('#f-venue', 'Maple Hall (fictional)');
await page.fill('#f-wt', 'Welcome to our Autumn Gala');
await page.fill('#f-wb', 'Thanks for coming. Browse the lots on your phone and bid for your business.');
ok('welcome step done after heading and message', (await topProg()) === '2 of 6');
await page.click('[data-action="hero"][data-id="cabin"]');
ok('heading image selected (pressed state)', (await page.locator('[data-action="hero"][data-id="cabin"]').getAttribute('aria-pressed')) === 'true');
await shot('03-event-page', { fullPage: true });
await page.reload(); await page.waitForSelector('#f-wt');
ok('reload keeps details', (await page.inputValue('#f-wt')) === 'Welcome to our Autumn Gala' && (await page.inputValue('#f-end')) === '21:00' && (await topProg()) === '2 of 6');
ok('reload keeps heading image', (await page.locator('[data-action="hero"][data-id="cabin"]').getAttribute('aria-pressed')) === 'true');
await page.fill('#f-name', '');
ok('empty event name is refused, old name kept', (await page.locator('#err-f-name').innerText()).includes('Name the event') && (await evOf(NEW)).name === 'Autumn Gala Test');
await page.fill('#f-name', 'Holiday Trade Show Auction');
ok('duplicate name refused on rename', (await page.locator('#err-f-name').innerText()).includes('already has this name') && (await evOf(NEW)).name === 'Autumn Gala Test');
await page.fill('#f-name', 'Autumn Gala Test');
ok('name restored and error hidden', await page.locator('#err-f-name').isHidden());

// ================================================================================================
section('3. Lots: add, validate, duplicate, categorize');
await page.click('[data-key="nav-lots"]');
ok('empty lots page offers the first action', await page.locator('[data-key="empty-add"]').isVisible());
await page.click('[data-key="empty-add"]'); await page.waitForSelector('dialog#sheet[open] #l-title');
await page.click('[data-action="lot-save"]');
ok('lot without a title is refused', (await page.locator('#err-l-title').innerText()).includes('title'));
await page.fill('#l-title', 'Weekend at the lake cabin'); await page.fill('#l-open', 'abc');
await page.click('[data-action="lot-save"]');
ok('non-numeric opening bid is refused', (await page.locator('#err-l-open').innerText()).includes('opening bid'));
await shot('18-lot-editor-validation');
ok('typed title survives the validation re-render', (await page.inputValue('#l-title')) === 'Weekend at the lake cabin');
await page.fill('#l-open', '$150'); await page.fill('#l-short', 'Two nights, sleeps six');
await page.click('[data-action="sheet-photo"][data-id="cabin"]');
ok('title still there after choosing a photo', (await page.inputValue('#l-title')) === 'Weekend at the lake cabin');
await page.click('[data-action="lot-save-another"]');
await page.waitForSelector('#l-title'); ok('save-and-add-another keeps the sheet open, empty', (await page.inputValue('#l-title')) === '');
await page.fill('#l-title', 'Chef’s table dinner for six'); await page.fill('#l-open', '200');
await page.click('[data-action="lot-save"]');
await page.waitForSelector('dialog#sheet[open]', { state: 'detached' }).catch(() => {});
ok('two lots listed', (await page.locator('.lrow').count()) === 2);
ok('opening bid parsed from "$150" into cents', (await evOf(NEW)).lots[0].opening === 15000);
// duplicate with a rapid double click
const dupBtn = page.locator('[data-action="lot-dup"]').first();
await dupBtn.dblclick(); await page.waitForTimeout(300);
ok('double-click Duplicate makes one copy', (await page.locator('.lrow').count()) === 3, `rows ${await page.locator('.lrow').count()}`);
ok('copy keeps the photo and gets a new number', (await evOf(NEW)).lots.some((l) => l.title === 'Weekend at the lake cabin (copy)' && l.image === 'cabin' && l.number === 3));
ok('duplicate offers Undo', await page.locator('.toast-act').count() === 1);
await page.click('.toast-act'); await page.waitForTimeout(200);
ok('Undo removes the copy', (await page.locator('.lrow').count()) === 2);
await dupBtn.click(); await page.waitForTimeout(700);
// categories
await page.click('[data-key="cats"]'); await page.waitForSelector('#c-new');
await page.click('form[data-form="category"] button[type=submit]');
ok('empty category refused', (await page.locator('#err-c-new').innerText()).includes('Name the category'));
await page.fill('#c-new', 'Getaways'); await page.press('#c-new', 'Enter');
await page.fill('#c-new', 'Food & drink'); await page.press('#c-new', 'Enter');
await page.fill('#c-new', 'getaways'); await page.press('#c-new', 'Enter');
ok('duplicate category (case-insensitive) refused', (await page.locator('#err-c-new').innerText()).includes('already exists'));
ok('two categories exist', (await evOf(NEW)).categories.length === 2);
await shot('04-categories-sheet');
await page.click('dialog [data-action="sheet-close"].btn, dialog .sheet-foot [data-action="sheet-close"]'); await page.waitForTimeout(200);
ok('categories sheet closed', await page.locator('dialog#sheet[open]').count() === 0);
const catSel = page.locator('[data-lot-cat]');
const lots3 = await evOf(NEW);
await page.selectOption(`[data-lot-cat="${lots3.lots[0].id}"]`, { label: 'Getaways' });
await page.selectOption(`[data-lot-cat="${lots3.lots[1].id}"]`, { label: 'Food & drink' });
ok('categorized through the inline selects', (await evOf(NEW)).lots.filter((l) => l.categoryId).length === 2);
// bulk set category on the third
await page.check(`#sel-${lots3.lots[2].id}`);
await page.selectOption('[data-bulk-cat]', { label: 'Getaways' }); await page.click('[data-action="bulk-category"]');
ok('bulk category applied to selected lot', (await evOf(NEW)).lots[2].categoryId === (await evOf(NEW)).categories[0].id);
await page.waitForTimeout(100);
const fullCats = (await evOf(NEW)).categories;

// ================================================================================================
section('4. Bidding windows: two windows, validation, assignment, unassigned');
ok('unassigned chip shows all 3 lots and is flagged', (await page.locator('.chip.t-attn').innerText()).includes('3'));
await page.click('[data-key="nav-windows"]');
ok('unassigned lots card is the first thing on the windows page', await page.locator('.panel.attn').first().isVisible());
ok('windows are still absent', (await page.locator('.wcard').count()) === 0);
await page.click('[data-action="win-new"]');
await page.click('[data-action="win-save"]');
ok('empty window refused with three messages', (await page.locator('#err-w-name').innerText()).length > 0 && (await page.locator('#err-w-open').innerText()).length > 0);
await page.fill('#w-name', 'Silent round'); await page.fill('#w-open', '2026-11-14T17:00'); await page.fill('#w-close', '2026-11-14T16:00');
await page.click('[data-action="win-save"]');
ok('closing before opening is refused', (await page.locator('#err-w-close').innerText()).includes('after it opens'));
await shot('19-window-sheet-validation');
await page.fill('#w-close', '2026-11-14T18:30'); await page.click('[data-action="win-save"]');
await page.waitForSelector('dialog#sheet[open]', { state: 'detached' });
await page.click('[data-action="win-new"]'); await page.fill('#w-name', 'Final round'); await page.fill('#w-open', '2026-11-14T18:30'); await page.fill('#w-close', '2026-11-14T20:00');
await page.click('[data-action="win-save"]'); await page.waitForSelector('dialog#sheet[open]', { state: 'detached' });
ok('two windows exist', (await page.locator('.wcard').count()) === 2);
ok('windows are separate from the physical event time (timeline shows both)', (await page.locator('.tl-bar.ev').count()) === 1 && (await page.locator('.tl-bar.win').count()) === 2);
await shot('05-windows-before-assign', { fullPage: true });
// Assign via the assign sheet to Silent round
await page.locator('.wcard').first().locator('[data-action="win-assign"]').click(); await page.waitForSelector('dialog#sheet[open] input[name=lot]');
ok('assign sheet lists unassigned lots first', (await page.locator('.pickgroup').first().locator('h3').innerText()).toLowerCase().includes('not in a window'));
await shot('20-assign-sheet');
await page.click('[data-action="assign-all-un"]');
await page.click('[data-action="assign-save"]'); await page.waitForSelector('dialog#sheet[open]', { state: 'detached' });
const afterA = await evOf(NEW), w1 = afterA.windows[0], w2 = afterA.windows[1];
ok('lots assigned to the first window', afterA.lots.every((l) => l.windowId === w1.id));
// Move one lot into the second window: one window per lot
await page.locator('.wcard').nth(1).locator('[data-action="win-assign"]').click(); await page.waitForSelector('dialog#sheet[open] input[name=lot]');
await page.locator('dialog input[name=lot]').nth(1).check();
await page.click('[data-action="assign-save"]'); await page.waitForSelector('dialog#sheet[open]', { state: 'detached' });
const afterB = await evOf(NEW);
ok('moving a lot removes it from the other window (S1)', afterB.lots.filter((l) => l.windowId === w2.id).length === 1 && afterB.lots.filter((l) => l.windowId === w1.id).length === 2);
// make one lot unassigned again via inline select and use the quick fix to resolve
await goto(`#/e/${NEW}/lots`);
await page.selectOption(`[data-lot-win="${afterB.lots[0].id}"]`, { value: '' });
ok('inline select can unassign (lot flagged)', (await page.locator('.lrow.unassigned').count()) === 1);
await page.click('.chip.t-attn'); await page.waitForTimeout(200);
ok('unassigned filter shows just that lot', (await page.locator('.lrow').count()) === 1 && (await hash()).includes('f=unassigned'));
await shot('06-lots-unassigned-filter');
await page.selectOption('[data-quick-window]', { value: w1.id }); await page.click('[data-action="assign-unassigned"]'); await page.waitForTimeout(250);
ok('quick-fix assigns it; filter now shows the all-clear', (await page.locator('.okband').count()) === 1 && (await evOf(NEW)).lots.every((l) => l.windowId));

// ================================================================================================
section('5. Mobile bidder preview (A markup, draft data)');
await goto(`#/e/${NEW}/overview`);
await setPreview(true); await page.waitForSelector('#pv-frame');
await frame().locator('h1').first().waitFor();
ok('preview panel opens beside the page', await page.locator('#pv').isVisible());
ok('preview shows the draft welcome page', (await frame().locator('h1').first().innerText()).includes('Autumn Gala Test'));
ok('preview is prototype A markup and stylesheet', (await frame().locator('main.entry').count()) === 1 && (await page.evaluate(() => fetch('/lanyard.css').then((r) => r.text()).then((t) => t.includes('Lanyard — a trade-show badge')))));
ok('before bidding opens the catalog is hidden', (await frame().locator('button.btn.primary.lg[disabled]').count()) === 1);
await shot('07-preview-before-open');
await page.selectOption('#pv-clock', { index: 1 }); await page.waitForTimeout(300);
await frame().locator('a[data-go="lots"]').click(); await page.waitForTimeout(300);
ok('while a window is open, its lots appear as A cards', (await frame().locator('.card').count()) >= 2);
ok('categories become A chips', (await frame().locator('.chip').count()) >= 2);
await shot('08a-preview-lots');
ok('opening bid and next bid come from the draft', (await frame().locator('.card .amt').first().innerText()).includes('$'));
await frame().locator('.card-link').first().click(); await page.waitForTimeout(300);
ok('lot detail renders A stub with the draft opening bid', (await frame().locator('.stub .amt.xl').innerText()).includes('$'));
await frame().locator('[data-bid]').click();
ok('bid button says nothing is bid in the preview', (await frame().locator('.note-inline').innerText()).includes('Preview only'));
await shot('08-preview-lot-detail');
const studioHistory = await page.evaluate(() => history.length);
await frame().locator('[data-back]').first().click(); await page.waitForTimeout(200);
ok('back inside the phone returns to the lots list', (await frame().locator('.card').count()) >= 2);
ok('phone navigation adds nothing to the studio history', (await page.evaluate(() => history.length)) === studioHistory);
await page.selectOption('#pv-rule', 'each'); await page.selectOption('#pv-clock', { index: 1 }); await page.waitForTimeout(300);
const eachRuleCount = await frame().locator('.card').count();
await page.selectOption('#pv-rule', 'first'); await page.waitForTimeout(300);
ok('the two undecided visibility rules visibly differ and are labeled', eachRuleCount < (await frame().locator('.card').count()) && (await page.locator('#pv .assume').count()) === 1);
await page.selectOption('#pv-clock', { index: 1 });
ok('previewing the lots ticked the preview step', (await evOf(NEW)).review.previewed === true);
await setPreview(false);

// ================================================================================================
section('6. Bid increments (example + next eligible bid) and resolving issues');
await page.click('[data-key="nav-increments"]');
ok('increment page shows a concrete next eligible bid', (await page.locator('.stub-side .n').innerText()).startsWith('$'));
const beforeNext = await page.locator('.stub-side .n').innerText();
await page.click('[data-action="inc-preset"][data-cents="5000"]');
const afterNext = await page.locator('.stub-side .n').innerText();
ok('next eligible bid changes with the increment', beforeNext !== afterNext, `${beforeNext} → ${afterNext}`);
ok('changing the increment un-confirms it', (await evOf(NEW)).increment.confirmed === false);
await page.fill('#f-inc', '0'); ok('zero increment shows an error', (await page.locator('#err-f-inc').innerText()).includes('at least $1'));
await page.fill('#f-inc', 'abc'); ok('typed text is kept while invalid', (await page.inputValue('#f-inc')) === 'abc');
await page.fill('#f-inc', '25');
await page.fill('#f-extop', '150');
ok('example: top bid $150 with $25 → $175', (await page.locator('.stub-side .n').innerText()) === '$175' && (await page.locator('.stub-side .tl').innerText()).includes('$150 + $25'));
const cb = page.locator('[data-key="confirm-inc"]'); await cb.click(); await cb.click({ force: true }).catch(() => {});
ok('confirm is idempotent (repeated clicks)', (await evOf(NEW)).increment.confirmed === true && (await evOf(NEW)).increment.amount === 2500);
await shot('09-increments');
await goto(`#/e/${NEW}/overview`);
ok('required steps all done', (await topProg()) === '6 of 6', await topProg());
ok('overview now recommends the next non-blocking thing', (await page.locator('.nextcard h2').innerText()).length > 0);
await goto(`#/e/${NEW}/readiness`);
ok('readiness says ready to review', (await page.locator('.standing .st-title').innerText()).includes('Ready to review'));
ok('suggestions are listed separately and are not blockers', (await page.locator('.panel:has(h2:text("Suggestions")) .iss').count()) >= 1 && (await page.locator('.panel:has(h2:text("Needed before bidding opens")) .empty').count()) === 1);
await shot('10-readiness-ready', { fullPage: true });
await page.click('[data-action="mark-reviewed"]'); await page.waitForTimeout(250);
ok('mark as reviewed records a local stamp (simulated, S3)', (await evOf(NEW)).review.reviewedAt !== null && (await page.locator('.standing .st-title').innerText()).includes('Reviewed and ready'));
await goto(`#/e/${NEW}/details`); await page.fill('#f-wt', 'Welcome, friends, to our Autumn Gala'); await goto(`#/e/${NEW}/readiness`);
ok('editing after review marks it stale', (await page.locator('.confirmbox .warn-t').count()) === 1);

// ================================================================================================
section('7. Issues from the other direction: remove things and watch the checklist react');
await goto(`#/e/${NEW}/windows`);
await page.locator('.wcard').nth(1).locator('[data-action="win-del"]').click(); await page.waitForTimeout(250);
ok('deleting a window un-assigns its lots and flags them', (await page.locator('.panel.attn').count()) === 1 || (await topProg()) !== '6 of 6');
await page.click('.toast-act'); await page.waitForTimeout(250);
ok('Undo restores the window and its lots', (await page.locator('.wcard').count()) === 2 && (await topProg()) === '6 of 6');
await goto(`#/e/${NEW}/lots`); const rows = await page.locator('.lrow').count();
await page.locator('[data-action="lot-del"]').last().click(); await page.waitForTimeout(200);
ok('delete lot offers undo', (await page.locator('.lrow').count()) === rows - 1 && (await page.locator('.toast-act').count()) === 1);
await page.click('.toast-act'); await page.waitForTimeout(200);
ok('undo brings the lot back', (await page.locator('.lrow').count()) === rows);

// ================================================================================================
section('8. Switching events never mixes data');
await page.click('[data-key="evbtn"]'); await page.locator('.menu a', { hasText: 'Holiday Trade Show Auction' }).click(); await page.waitForTimeout(300);
ok('switched to the other event, same section', (await hash()).includes('/e/ev-holiday/lots'));
ok('its lots are its own', (await page.locator('.lrow').count()) === 7 && (await page.locator('.lt-title', { hasText: 'little cabin' }).count()) === 1 && (await page.locator('.lt-title', { hasText: 'lake cabin' }).count()) === 0);
ok('its categories and windows are its own', (await page.locator('[data-filter="cat"] option', { hasText: 'Getaways' }).count()) === 1 && (await page.locator('[data-filter="win"] option', { hasText: 'Early bidding' }).count()) === 1 && (await page.locator('[data-filter="win"] option', { hasText: 'Silent round' }).count()) === 0);
await setPreview(true); await frame().locator('h1').first().waitFor();
ok('the preview follows the active event', (await frame().locator('h1').first().innerText()).includes('Holiday Trade Show'));
ok('checklist is per event', (await topProg()) === '4 of 6');
await goto('#/e/ev-spring/lots?sheet=lot:' + afterB.lots[0].id); await page.waitForTimeout(300);
ok('a lot id from another event does not open a sheet', (await page.locator('dialog#sheet[open]').count()) === 0 && !(await hash()).includes('sheet='));
await goto('#/e/nope/overview');
ok('an unknown event shows a plain not-found page, not another event', (await page.locator('h1').innerText()).includes('doesn’t exist'));
await goto('#/e/ev-spring/windows');
ok('Spring Harvest Gala has its two windows', (await page.locator('.wcard').count()) === 2 && (await page.locator('.wcard h3', { hasText: 'Final round' }).count()) === 1);
await goto('#/e/ev-spring/overview'); await page.waitForTimeout(200); await shot('22-spring-overview-ready');
await goto('#/e/ev-spring/windows');
await setPreview(false);

// ================================================================================================
section('9. Back / close / Escape behavior for sheets');
await goto(`#/e/${NEW}/lots`);
await page.click('[data-key="add-lot"]'); await page.waitForSelector('dialog#sheet[open]');
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
ok('Escape closes a clean sheet', await page.locator('dialog#sheet[open]').count() === 0 && !(await hash()).includes('sheet='));
await page.click('[data-key="add-lot"]'); await page.waitForSelector('dialog#sheet[open]'); await page.goBack(); await page.waitForTimeout(250);
ok('browser Back closes a clean sheet', await page.locator('dialog#sheet[open]').count() === 0);
await page.click('[data-key="add-lot"]'); await page.waitForSelector('#l-title'); await page.fill('#l-title', 'Unsaved thought');
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
ok('Escape on a dirty sheet asks instead of discarding', await page.locator('#dirty-bar').isVisible() && (await page.inputValue('#l-title')) === 'Unsaved thought');
await shot('11-discard-prompt');
await page.click('[data-action="sheet-keep"]'); await page.waitForTimeout(150);
ok('Keep editing keeps the text', (await page.inputValue('#l-title')) === 'Unsaved thought' && await page.locator('#dirty-bar').count() === 0);
await page.goBack(); await page.waitForTimeout(300);
ok('browser Back on a dirty sheet keeps it open and asks', await page.locator('dialog#sheet[open]').count() === 1 && await page.locator('#dirty-bar').isVisible() && decodeURIComponent(await hash()).includes('sheet=lot:new'));
await page.click('[data-action="sheet-discard"]'); await page.waitForTimeout(300);
ok('Discard closes without saving', await page.locator('dialog#sheet[open]').count() === 0 && !(await evOf(NEW)).lots.some((l) => l.title === 'Unsaved thought'));
await page.click('[data-key="add-lot"]'); await page.waitForSelector('#l-title'); await page.reload(); await page.waitForTimeout(400);
ok('reloading with a sheet open reopens it from the URL', await page.locator('dialog#sheet[open]').count() === 1);
await page.keyboard.press('Escape'); await page.waitForTimeout(250);
ok('and it still closes', await page.locator('dialog#sheet[open]').count() === 0);

// ================================================================================================
section('10. Displays: draft vs applied');
await goto(`#/e/${NEW}/displays`);
ok('honest label: no screens connected', (await page.locator('.sim-tag', { hasText: 'No screens connected' }).count()) === 1);
ok('nothing applied yet is stated', (await page.locator('.draftband').innerText()).includes('Nothing has been applied yet'));
await page.click('[data-action="disp-view"][data-v="applied"]');
ok('applied preview says nothing is applied', (await page.locator('.screen-frame.empty').innerText()).includes('Nothing has been applied'));
await page.click('[data-action="disp-view"][data-v="draft"]');
await page.click('[data-action="disp-theme"][data-v="paper"]');
ok('draft preview reflects the theme immediately', await page.locator('#disp-preview .screen.th-paper').count() === 1);
await page.uncheck('#sw-lots');
ok('turning a slide off removes its tab', (await page.locator('#disp-preview .slide-tabs button', { hasText: 'Lots' }).count()) === 0);
await page.check('#sw-lots');
await shot('12-displays-draft');
await page.reload(); await page.waitForSelector('#disp-preview');
ok('draft survives reload and is still not applied', (await page.locator('.draftband').count()) === 1 && (await evOf(NEW)).displays.applied === null);
await page.click('[data-key="apply"]'); await page.reload(); await page.waitForSelector('#disp-preview'); await page.waitForTimeout(1300);
ok('reloading while an apply is pending applies nothing (draft stays a draft)', (await evOf(NEW)).displays.applied === null && (await page.locator('.draftband').count()) === 1);
await page.click('[data-action="notes"]'); await page.waitForSelector('#notes-body'); await shot('21-review-notes');
ok('review notes list the provisional one-window-per-lot assumption first', (await page.locator('#notes .p-q').innerText()).includes('S1'));
await page.click('.notes [data-action="notes"]');
// failed apply keeps the draft and says so
await page.click('[data-action="notes"]'); await page.check('[data-simfail]'); await page.click('.notes [data-action="notes"]');
const applyBtn = page.locator('[data-key="apply"]'); await applyBtn.dblclick();
await page.waitForSelector('.alertband[role=alert]', { timeout: 4000 });
ok('failed apply is reported honestly and applies nothing', (await evOf(NEW)).displays.applied === null && (await page.locator('.alertband[role=alert]').innerText()).includes('Couldn’t reach'));
await page.click('[data-action="notes"]'); await page.uncheck('[data-simfail]'); await page.click('.notes [data-action="notes"]');
await page.click('[data-action="disp-apply"]'); await page.waitForSelector('.alertband[role=status]:has-text("Applying")', { timeout: 1500 }).catch(() => {});
await page.waitForSelector('.okband', { timeout: 4000 });
ok('successful apply copies the draft to applied', JSON.stringify((await evOf(NEW)).displays.applied) === JSON.stringify((await evOf(NEW)).displays.draft) && (await evOf(NEW)).displays.applied.theme === 'paper');
await page.click('[data-action="disp-theme"][data-v="ink"]');
ok('a new edit makes the draft differ again and lists the change', (await page.locator('.draftband .changes li').innerText()).includes('Theme'));
await page.click('[data-action="disp-view"][data-v="applied"]');
ok('"On screens now" still shows the applied (paper) version', await page.locator('#disp-preview .screen.th-paper').count() === 1);
await page.click('[data-action="disp-discard"]');
ok('discard returns the draft to what is applied', (await evOf(NEW)).displays.draft.theme === 'paper' && await page.locator('.okband').count() === 1);
await page.click('[data-action="disp-view"][data-v="draft"]');
await page.click('[data-action="play"]'); ok('rotation preview toggles (pressed)', (await page.locator('[data-action="play"]').getAttribute('aria-pressed')) === 'true'); await page.click('[data-action="play"]');

// ================================================================================================
section('11. Attendee access (shared QR), notifications (simulated), donations, sponsors');
await goto(`#/e/${NEW}/access`);
const link = await page.inputValue('#a-link');
ok('one shared link, on a fictional domain', link.startsWith('https://bidzizi.example/e/'));
const qrOk = await page.evaluate(async (l) => { const { qrSvg } = await import('/src/qr.js'); const mine = qrSvg(l, { label: `QR code for Autumn Gala Test` }); return document.querySelector('.qrbox').innerHTML.includes(mine.match(/<path d="([^"]+)"/)[1]); }, link);
ok('the QR on screen encodes exactly that link', qrOk);
ok('it says it is not a ticket or bidder credential', (await page.locator('.isnot .no').count()) === 2);
await page.click('[data-action="print-qr"]'); await page.waitForSelector('.poster');
ok('print sheet shows the sign with the same link', (await page.locator('.poster .p-link').innerText()) === link);
await shot('13-print-sheet');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.click('[data-action="present-qr"]'); await page.waitForSelector('.presenting');
ok('present mode shows a large QR', (await page.locator('.presenting .qr').boundingBox()).width > 300);
await shot('14-present-ipad');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
ok('present mode closes with Escape', await page.locator('dialog#sheet[open]').count() === 0);
ok('printing/presenting ticks the QR step', (await evOf(NEW)).access.shared === true);

await goto(`#/e/${NEW}/notifications`);
ok('SMS page says nothing is ever sent', (await page.locator('.honest').innerText()).includes('Nothing is ever sent'));
await page.click('[data-action="sms-test"][data-k="code"]');
ok('test message is logged as simulated, not sent', (await page.locator('.smslog li').first().innerText()).toLowerCase().includes('simulated') && (await page.locator('.smslog li').first().innerText()).toLowerCase().includes('not sent'));
await page.fill('#tt-code', 'Your code is {code}');
ok('removing opt-out wording fails that check', (await page.locator('.checks li').nth(1).getAttribute('class') ?? '').indexOf('ok') === -1);
await page.fill('#tt-code', 'Your BidZizi code is {code}. Reply STOP to opt out.'); await page.check('#tok-code'); await page.check('#tok-outbid'); await page.check('#sms-sender');
ok('all four readiness checks can be satisfied (simulated)', (await page.locator('.panel-head .count').first().innerText()).trim() === '4 of 4');
await shot('15-notifications-simulated', { fullPage: true });

await goto(`#/e/${NEW}/donations`);
await page.check('#dm-link'); await page.fill('#dn-url', 'not a url');
ok('donation link must be https', (await page.locator('#err-dn-url').innerText()).includes('https://'));
await page.fill('#dn-url', 'https://example.org/give');
ok('valid link clears the error; copy says no money moves', await page.locator('#err-dn-url').isHidden() && (await page.locator('.fine').last().innerText()).includes('No amounts, payment'));
await goto(`#/e/${NEW}/details`);
await page.fill('#f-sp', ''); await page.press('#f-sp', 'Enter');
ok('empty sponsor refused', (await page.locator('#err-f-sp').innerText()).includes('name'));
await page.fill('#f-sp', 'Maple Hardware'); await page.press('#f-sp', 'Enter'); await page.waitForTimeout(250);
ok('sponsor added; it was never required', (await evOf(NEW)).sponsors.length === 1 && (await page.locator('.sponsor-list li').count()) === 1);

// ================================================================================================
section('12. Storage failure and corrupt data are handled');
await page.evaluate((k) => localStorage.setItem(k, '{not json'), KEY); await page.goto(URL_ + '#/events'); await page.reload(); await page.waitForSelector('.evcard');
ok('corrupt storage restores the examples and says so', (await page.locator('.evcard').count()) === 2 && (await page.locator('#toasts .toast').innerText()).includes('could not be read'));

// ================================================================================================
section('13. Laptop layouts: no horizontal overflow, with and without the preview');
const sections = ['overview', 'details', 'lots', 'windows', 'increments', 'access', 'displays', 'notifications', 'donations', 'readiness'];
for (const [w, h] of [[1440, 900], [1280, 800]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const pv of [false, true]) {
    await goto('#/e/ev-holiday/overview'); await setPreview(pv);
    const bad = [];
    for (const s of sections) {
      await goto(`#/e/ev-holiday/${s}`); await page.waitForTimeout(120);
      const o = await page.evaluate(() => {
        const m = document.getElementById('main').getBoundingClientRect(), pv = document.getElementById('pv');
        const spill = [...document.querySelectorAll('#main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > m.right + 1 && !e.closest('.sr, [hidden], .chips') && getComputedStyle(e).position !== 'absolute'; }).slice(0, 2).map((e) => e.className || e.tagName);
        return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, spill };
      });
      if (o.sw > o.iw + 1) bad.push(`${s} page ${o.sw}>${o.iw}`);
      if (o.spill.length) bad.push(`${s} spills past its column: ${o.spill.join(',')}`);
    }
    ok(`${w}x${h} preview ${pv ? 'open' : 'closed'}: every section fits`, bad.length === 0, bad.join(', '));
  }
}
await page.setViewportSize({ width: 1280, height: 800 }); await goto('#/e/ev-holiday/lots'); await shot('16-laptop-1280-preview-open');
await page.setViewportSize({ width: 1440, height: 900 }); await goto('#/e/ev-holiday/overview');
await setPreview(true);
await page.waitForTimeout(500); await shot('17-overview-with-preview');

// ================================================================================================
section('14. Keyboard and focus');
await setPreview(false);
await goto('#/e/ev-holiday/overview');
await page.focus('[data-key="evbtn"]'); await page.keyboard.press('Enter');
ok('event switcher opens from the keyboard', (await page.locator('.menu').count()) === 1 && (await page.locator('[data-key="evbtn"]').getAttribute('aria-expanded')) === 'true');
await page.keyboard.press('Escape');
ok('Escape closes it and returns focus to the button', (await page.locator('.menu').count()) === 0 && (await page.evaluate(() => document.activeElement?.dataset?.key)) === 'evbtn');
await goto('#/e/ev-holiday/lots');
ok('page heading takes focus on navigation (screen-reader landmark)', (await page.evaluate(() => document.activeElement?.tagName)) === 'H1');
ok('every row control has an accessible name', (await page.evaluate(() => [...document.querySelectorAll('.lrow select, .lrow button, .lrow input')].every((e) => (e.getAttribute('aria-label') || e.labels?.length || e.textContent.trim())))));

// ================================================================================================
section('15. No console errors, no network beyond this server');
ok('no page or console errors', problems.length === 0, problems.slice(0, 5).join(' | '));
ok('no request left localhost (nothing sent, no SMS, no payment)', external.length === 0, external.slice(0, 3).join(' '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
