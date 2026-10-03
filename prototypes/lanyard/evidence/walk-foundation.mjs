// Checks for the second pass: identity with Member ID, watching, search, event screens, private maximum.
// walk.mjs stays the untouched regression for prototype A; this file only covers what pass 2 added.
// Run (server must be up):  URL=http://127.0.0.1:4322/ node evidence/walk-foundation.mjs
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'node:fs';

const URL_ = process.env.URL || 'http://127.0.0.1:4321/';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

async function session(viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL_);
  await page.waitForSelector('#view h1');
  await fn(page);
  check(`no console errors (${viewport.width}x${viewport.height})`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
const shot = async (page, name, opts = {}) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}p2-${name}.png`, ...opts }); };
const P = (page, name) => page.locator(`[data-p="${name}"]`).first().dispatchEvent('click');
const go = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const sheetText = (page) => page.locator('#sheet').innerText();
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

// ============ identity: Saturn Barter context, Member ID, honest verification ============
await session({ width: 390, height: 844 }, async (page) => {
  await go(page, '#/lot/cabin');
  await page.waitForSelector('.detail');
  await page.click('[data-key="cta"]');
  await page.waitForSelector('#f-phone');
  check('phone step says the text is not really sent', /no text is sent/i.test(await sheetText(page)) && /simulated/i.test(await sheetText(page)));
  await page.fill('#f-phone', '5550100142');
  await page.click('[data-action="id-phone"]');
  await page.waitForSelector('#f-code');
  await page.fill('#f-code', '123456');
  check('code step labels verification as simulated, not "we sent a code"', /Verification is simulated/.test(await sheetText(page)) && !/We sent a 6-digit/.test(await sheetText(page)));
  await shot(page, '01-identity-code');
  await page.click('[data-action="id-code"]');
  await page.waitForSelector('#f-biz');
  check('identity step is under the Saturn Barter network context', /Saturn Barter/.test(await sheetText(page)));
  check('Member ID field is optional and says it is not checked', (await page.locator('#f-member').count()) === 1 && /optional/i.test(await sheetText(page)) && /not checked/i.test(await sheetText(page)));
  await shot(page, '02-identity-who-network');

  // Member ID alone must not authorize anything: with the business empty, the step does not complete
  await page.fill('#f-member', 'DEMO-7788');
  await page.fill('#f-biz', '');
  await page.click('[data-action="id-who"]');
  check('Member ID with no business is refused', /A Member ID alone isn't enough/.test(await page.locator('#id-err').innerText()) && (await page.locator('#f-biz').count()) === 1);
  check('refused identity leaves the visitor a guest', /Guest/.test(await page.locator('.chip-pass, .pass').first().innerText()));
  await shot(page, '03-memberid-alone-refused');
  await page.fill('#f-biz', 'Juniper Studio');
  await page.click('[data-action="id-who"]');
  await page.waitForSelector('#amt');
  check('with business + name the bid sheet opens (intent kept)', /Place a bid/.test(await sheetText(page)));
  check('bid sheet never shows the Member ID to other parties (attribution is business + person)', !/DEMO-7788/.test(await sheetText(page)));
  await page.click('[data-action="close-sheet"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });

  // account shows the declared Member ID with its caveat
  await page.click('.chip-pass');
  await page.waitForSelector('.idfacts');
  const acct = await sheetText(page);
  check('account shows Member ID as declared, not checked, no business access', /DEMO-7788/.test(acct) && /not checked/i.test(acct) && /no access to any business/i.test(acct));
  check('account says phone verification was simulated', /Verification was simulated/.test(acct));
  await shot(page, '04-account');
  await page.keyboard.press('Escape');
});

// ============ watching, separate from My bids ============
await session({ width: 390, height: 844 }, async (page) => {
  await go(page, '#/lots');
  await page.waitForSelector('.card');
  check('pill nav has four sections', (await page.locator('.pillnav .tab').count()) === 4);
  await page.click('.watch[data-watch="coffee"]');
  await page.click('.watch[data-watch="ceramics"]');
  check('watch button reports pressed state', (await page.getAttribute('.watch[data-watch="coffee"]', 'aria-pressed')) === 'true');
  await shot(page, '05-lots-watched');
  await page.click('.tab:has-text("Watching")');
  await page.waitForSelector('.watching');
  check('Watching lists exactly the watched lots', (await page.locator('.watching .row').count()) === 2);
  check('watching creates no bid and no attention badge', (await page.locator('.tab .dot').count()) === 0);
  await shot(page, '06-watching');
  await page.click('.tab:has-text("My bids")');
  await page.waitForSelector('.bids');
  check('My bids stays empty of watched lots', (await page.locator('.ticket').count()) === 0);
  await page.click('.tab:has-text("Watching")');
  await page.waitForSelector('.watching');
  // lot page: persistent BidZizi header and an origin-aware Back
  await page.click('.watching .row-link >> nth=0');
  await page.waitForSelector('.detail');
  check('lot page shows the BidZizi header', (await page.locator('.topbar .wordmark').innerText()) === 'BidZizi');
  check('Back is labelled for where you came from', /Watching/.test(await page.locator('.topbar .back').innerText()));
  await shot(page, '07-detail-header-watch');
  await page.evaluate(() => scrollTo(0, 900));
  check('BidZizi header stays on screen while scrolling', await page.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().top < 2));
  await page.click('.topbar .back');
  await page.waitForSelector('.watching');
  check('Back from a watched lot returns to Watching', /Watching/.test(await page.locator('h1').innerText()));
  // unwatching from the list removes it
  await page.click('.watching .watch >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('.watching .row').length === 1);
  check('unwatching removes the lot from the list', true);
  await page.reload();
  await page.waitForSelector('.watching');
  check('watched lots survive a reload', (await page.locator('.watching .row').count()) === 1);
  // placing a bid does not move a watched lot into My bids by itself, and a bid does not unwatch
  await go(page, '#/lot/ceramics');
  await page.waitForSelector('.detail');
  check('lot page toggle reflects the saved state', (await page.getAttribute('.hero .watch', 'aria-pressed')) === 'true');
});

// ============ search + filter context ============
await session({ width: 390, height: 844 }, async (page) => {
  await go(page, '#/lots');
  await page.waitForSelector('.card');
  await page.click('[data-action="cat"][data-v="Good things"]');
  await page.fill('input[data-search]', 'ceramic');
  check('search narrows the list and the count', (await page.locator('.card').count()) === 1 && /1 of 7/.test(await page.locator('#lot-count').innerText()));
  check('typing does not re-create the search field (keeps focus)', await page.evaluate(() => document.activeElement === document.querySelector('input[data-search]')));
  await shot(page, '08-search');
  await page.click('.card-link');
  await page.waitForSelector('.detail');
  await page.goBack();
  await page.waitForSelector('.card');
  check('search, filter and results survive opening a lot and Back', (await page.inputValue('input[data-search]')) === 'ceramic' && (await page.locator('.card').count()) === 1 && (await page.locator('.chip.on').innerText()) === 'Good things');
  await page.reload();
  await page.waitForSelector('.card');
  check('search and filter survive reload', (await page.inputValue('input[data-search]')) === 'ceramic');
  await page.fill('input[data-search]', 'zzzz');
  check('no matches gives a way out', (await page.locator('[data-action="clear-filters"]').count()) === 1);
  await shot(page, '09-search-empty');
  await page.click('[data-action="clear-filters"]');
  await page.waitForSelector('.card');
  check('clearing restores every lot', (await page.locator('.card').count()) === 7 && (await page.inputValue('input[data-search]')) === '');
});

// ============ event: sponsor welcome, donation, settings ============
await session({ width: 390, height: 844 }, async (page) => {
  check('entry offers the sponsor welcome', (await page.locator('[data-action="welcome"]').count()) === 1);
  await page.click('[data-action="welcome"]');
  await page.waitForSelector('#sheet[open]');
  check('sponsor welcome lists every sponsor and calls itself placeholder', (await page.locator('.donors li').count()) === 7 && /Placeholder/.test(await sheetText(page)));
  await shot(page, '10-sponsor-welcome');
  await page.goBack();
  await page.waitForSelector('#sheet', { state: 'hidden' });
  check('Back closes the welcome and stays on the entry page', (await page.locator('.entry').count()) === 1);
  await go(page, '#/event');
  await page.waitForSelector('.eventinfo');
  await shot(page, '11-event-page', { fullPage: true });
  check('Event page has event info', /Bidding closes/.test(await page.locator('.eventinfo').innerText()));
  await page.click('[data-action="welcome"]');
  await page.waitForSelector('#sheet[open]');
  check('sponsor welcome is reachable again from Event', /Welcome from our sponsors/.test(await sheetText(page)));
  await page.click('[data-action="close-sheet"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.click('[data-action="donate"]');
  await page.waitForSelector('#sheet[open]');
  const don = await sheetText(page);
  check('donation access states nothing is decided and takes no payment', /Not decided yet/.test(don) && /no amount and no payment/.test(don));
  check('donation screen has no amount field or payment control', (await page.locator('#sheet input, #sheet [data-action*="pay"]').count()) === 0);
  await shot(page, '12-donate');
  await page.click('[data-action="close-sheet"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });

  // appearance works for a guest and persists
  await page.click('[data-action="appearance"]');
  await page.waitForSelector('.seg2');
  await page.click('[data-k="text"][data-v="large"]');
  await page.waitForFunction(() => document.documentElement.dataset.text === 'large');
  check('appearance applies text size', true);
  await page.focus('[data-key="ap-motion-reduce"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduce');
  check('keyboard focus stays on the toggled option after it re-renders', await page.evaluate(() => document.activeElement?.dataset?.key === 'ap-motion-reduce'));
  await shot(page, '13-appearance-large');
  check('no horizontal overflow with larger text', !(await overflow(page)));
  await page.click('[data-action="close-sheet"]');
  await page.reload();
  await page.waitForSelector('.eventinfo');
  check('appearance survives reload', (await page.evaluate(() => document.documentElement.dataset.text)) === 'large');
  check('no horizontal overflow on Event with larger text', !(await overflow(page)));
  await go(page, '#/lots');
  await page.waitForSelector('.card');
  check('no horizontal overflow on Lots with larger text', !(await overflow(page)));
  await go(page, '#/lot/dinner');
  await page.waitForSelector('.detail');
  await shot(page, '14-detail-large-text');
  check('no horizontal overflow on a lot page with larger text', !(await overflow(page)));

  // additional users needs an identity; it routes through the identity step and back
  await go(page, '#/event');
  await page.waitForSelector('.eventinfo');
  await page.click('[data-action="users"]');
  await page.waitForSelector('#f-phone');
  check('additional users asks who you are first', /Who's bidding/.test(await sheetText(page)));
  await page.fill('#f-phone', '5550100142');
  await page.click('[data-action="id-phone"]');
  await page.fill('#f-code', '123456');
  await page.click('[data-action="id-code"]');
  await page.waitForSelector('#f-biz');
  await page.click('[data-action="id-who"]');
  await page.waitForSelector('#f-uname');
  check('after identity it continues to Additional users', /Additional users/.test(await sheetText(page)) && /can't bid/.test(await sheetText(page)));
  await page.click('[data-action="user-add"]');
  check('adding a nameless person is refused', /Enter a name/.test(await page.locator('#id-err').innerText()));
  await page.fill('#f-uname', 'Pat Morgan');
  await page.fill('#f-uphone', '5550100999');
  await page.click('[data-action="user-add"]');
  await page.waitForSelector('.people li');
  check('added person is listed as not active', /Pat Morgan/.test(await sheetText(page)) && /not active/.test(await sheetText(page)));
  await shot(page, '15-additional-users');
  await page.click('[data-action="user-remove"]');
  await page.waitForFunction(() => document.querySelectorAll('.people li').length === 0);
  check('person can be removed', true);
});

// ============ private maximum: explicit confirmation, truthful saving ============
await session({ width: 390, height: 844 }, async (page) => {
  await P(page, 'seed');
  await go(page, '#/lot/dinner');
  await page.waitForSelector('.detail');
  check('lot page offers a private maximum, labelled simulation', /private maximum · simulation/i.test(await page.locator('.maxcard').innerText()));
  await shot(page, '16-maxcard-open');
  await page.click('[data-action="max"]');
  await page.waitForSelector('#mx');
  check('maximum form says it is not a bid', /not a bid/.test(await sheetText(page)));
  await page.fill('#mx', '530');
  check('an off-step maximum is rejected', /\$25 steps/.test(await page.locator('#mx-err').innerText()));
  await page.fill('#mx', '500');
  check('a maximum below the next minimum is refused', /at least/.test(await page.locator('#mx-err').innerText()) && (await page.locator('#cta').innerText()).includes('Update to'));
  await page.fill('#mx', '600');
  await shot(page, '17-max-form');
  await page.click('#cta');
  await page.waitForSelector('.confirm');
  check('confirmation is a separate, explicit step', /Confirm your maximum/.test(await sheetText(page)));
  check('Confirm is disabled until the checkbox is ticked', await page.locator('[data-action="mx-save"]').isDisabled());
  check('confirmation says nothing will bid for you', /Nothing will bid for you/.test(await sheetText(page)));
  await shot(page, '18-max-confirm');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lanyard.v1')).server.maxes.dinner ?? null);
  check('nothing is saved before confirming', before === null);
  await page.click('[data-key="mx-ack"]');
  check('ticking enables Confirm', !(await page.locator('[data-action="mx-save"]').isDisabled()));
  await page.click('[data-action="mx-save"]');
  await page.waitForSelector('.result.t-amber');
  check('pending maximum is not shown as saved', /Not saved yet/.test(await sheetText(page)));
  await shot(page, '19-max-saving');
  await page.waitForSelector('.result.t-ink', { timeout: 5000 });
  check('saved only after the simulated server confirms', /Maximum saved/.test(await sheetText(page)) && /placed no bid/.test(await sheetText(page)));
  await shot(page, '20-max-saved');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lanyard.v1')));
  check('the maximum placed no bid', after.server.lots.dinner.bids[0].amount === 50000 && after.outbox.filter((e) => e.lotId === 'dinner').length === 0);
  await page.click('[data-key="done"]').catch(() => page.click('[data-action="close-sheet"]'));
  await page.waitForSelector('#sheet', { state: 'hidden' });
  check('lot standing is unchanged by a maximum (still outbid)', /outbid/i.test(await page.locator('.standing').innerText()));
  check('lot page shows the saved maximum', /\$600/.test(await page.locator('.maxcard').innerText()));
  await shot(page, '21-maxcard-saved');

  // offline: a maximum is not saved, and the failure is shown
  await P(page, 'online');
  await page.waitForSelector('.banner.b-off');
  await page.click('[data-action="max"]');
  await page.waitForSelector('.result');
  await page.click('[data-action="mx-change"]');
  await page.waitForSelector('#mx');
  await page.fill('#mx', '700');
  await page.click('#cta');
  await page.waitForSelector('.confirm');
  await page.click('[data-key="mx-ack"]');
  await page.click('[data-action="mx-save"]');
  await page.waitForSelector('.result.t-dashed', { timeout: 4000 });
  check('offline save is "not saved" and says the earlier maximum still stands', /wasn't saved/.test(await sheetText(page)) && /earlier \$600 maximum is still saved/.test(await sheetText(page)));
  await shot(page, '22-max-offline-failed');
  await page.click('[data-action="mx-discard"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  check('discarding restores the earlier saved maximum', /\$600/.test(await page.locator('.maxcard').innerText()));
  // removal cannot happen offline
  await page.click('[data-action="max"]');
  await page.waitForSelector('[data-action="mx-remove"]');
  await page.click('[data-action="mx-remove"]');
  check('removing while offline is refused, not faked', /offline/i.test(await page.locator('#check-note').innerText()) && (await page.locator('#sheet[open]').count()) === 1);
  await page.click('[data-action="close-sheet"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await P(page, 'online');
  await page.waitForSelector('.banner.b-off', { state: 'detached' });
  await page.click('[data-action="max"]');
  await page.click('[data-action="mx-remove"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  check('removing online removes it', /Set a maximum/.test(await page.locator('.maxcard').innerText()));

  // a maximum belongs to the person/business that set it
  await page.click('[data-action="max"]');
  await page.waitForSelector('#mx');
  await page.click('#cta');
  await page.click('[data-key="mx-ack"]');
  await page.click('[data-action="mx-save"]');
  await page.waitForSelector('.result.t-ink', { timeout: 5000 });
  await page.click('[data-action="close-sheet"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await P(page, 'signout');
  await page.waitForTimeout(300);
  check('after sign-out the previous business\'s maximum is not shown', /Set a maximum/.test(await page.locator('.maxcard').innerText()));
});

// ============ narrow phone ============
await session({ width: 360, height: 740 }, async (page) => {
  await P(page, 'seed');
  for (const h of ['#/lots', '#/watching', '#/bids', '#/event']) {
    await go(page, h); await page.waitForSelector('main'); await page.waitForTimeout(250);
    check(`no horizontal overflow at 360px: ${h}`, !(await overflow(page)));
  }
  await go(page, '#/lots'); await page.waitForSelector('.card');
  await page.click('[data-action="view"][data-v="rows"]');
  await shot(page, '23-narrow-rows-watch');
  check('no horizontal overflow at 360px: compact rows with watch buttons', !(await overflow(page)));
  await go(page, '#/lot/symphony'); await page.waitForSelector('.detail');
  await shot(page, '24-narrow-detail-header');
  check('no horizontal overflow at 360px: lot header with long business name', !(await overflow(page)));
  await go(page, '#/watching'); await page.waitForSelector('.watching');
  await page.click('.watching .row-link >> nth=0');
  await page.waitForSelector('.detail');
  check('Back label fits on one line at 360px', await page.evaluate(() => { const b = document.querySelector('.topbar .back'); return b.getBoundingClientRect().height < 56; }));
});

// ============ desktop ============
await session({ width: 1280, height: 800 }, async (page) => {
  await P(page, 'seed');
  await go(page, '#/watching');
  await page.waitForSelector('.watching');
  await shot(page, '25-desktop-watching');
  await go(page, '#/lot/cabin');
  await page.waitForSelector('.detail');
  await shot(page, '26-desktop-detail');
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
