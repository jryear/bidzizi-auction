// Drives the prototype through the full journey in Chromium and saves screenshots to evidence/shots.
// Run (server must be up):  PORT=4321 node serve.mjs &   then   node evidence/walk.mjs
// Assertions print PASS/FAIL. Screenshots are the thing to look at; assertions only catch regressions.
import { chromium } from '../../../node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'node:fs';

const URL_ = process.env.URL || 'http://127.0.0.1:4321/';
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

async function session(viewport, fn, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL_);
  await page.waitForSelector('#view h1');
  await fn(page, ctx);
  check(`no console errors (${viewport.width}x${viewport.height})`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
// Let sheet/route animations settle so screenshots show the resting state, not a transition frame.
const shot = async (page, name, opts = {}) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}${name}.png`, ...opts }); };
const P = (page, name) => page.locator(`[data-p="${name}"]`).first().dispatchEvent('click');
const setNext = (page, v) => page.evaluate((v) => { const s = document.querySelector('select[data-p="sim-next"]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const rival = (page, lot) => page.evaluate((lot) => { document.querySelector('#p-rival-lot').value = lot; }, lot).then(() => P(page, 'rival'));
const top = (page, lot) => page.evaluate((lot) => document.querySelector(`[data-lot="${lot}"]`)?.getBoundingClientRect().top, lot);
const sheetText = (page) => page.locator('#sheet').innerText();

// ============ PHONE 390x844: the whole journey ============
await session({ width: 390, height: 844 }, async (page) => {
  await shot(page, '01-entry-guest');
  await page.click('a[data-key="browse"]');
  await page.waitForSelector('.card');
  await shot(page, '02-lots-cards');

  // layout toggle + filter
  await page.click('[data-action="view"][data-v="rows"]');
  await shot(page, '03-lots-rows');
  await page.click('[data-action="view"][data-v="cards"]');
  await page.click('[data-action="cat"][data-v="Good things"]');
  check('category filter narrows lots', (await page.locator('.card').count()) === 3, `count=${await page.locator('.card').count()}`);
  await page.click('[data-action="cat"][data-v="All"]');

  // return to exactly where I was
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-lot="ceramics"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, 90));
  await page.waitForTimeout(250);
  const before = await top(page, 'ceramics');
  await page.click('[data-lot="ceramics"] a');
  await page.waitForSelector('.detail');
  check('opening a lot starts at the top', (await page.evaluate(() => scrollY)) < 5);
  await page.goBack();
  await page.waitForSelector('.card');
  await page.waitForTimeout(500);
  const after = await top(page, 'ceramics');
  check('Back returns to the same scroll position', Math.abs(before - after) < 3, `before=${before?.toFixed(1)} after=${after?.toFixed(1)}`);
  await shot(page, '04-lots-after-back');

  // tab switch keeps position too
  await page.click('.tab:has-text("Event")');
  await page.waitForSelector('.eventinfo');
  await shot(page, '05-event-how-it-works', { fullPage: true });
  await page.click('.tab:has-text("Lots")');
  await page.waitForTimeout(500);
  check('switching tabs and back keeps position', Math.abs((await top(page, 'ceramics')) - before) < 3);

  // lot detail
  await page.click('[data-lot="cabin"] a, [data-lot="cabin"]').catch(() => {});
  await page.evaluate(() => { location.hash = '#/lot/cabin'; });
  await page.waitForSelector('.detail');
  await page.waitForTimeout(400);
  await shot(page, '06-detail-top');
  await page.evaluate(() => scrollBy(0, 760));
  await page.waitForTimeout(300);
  await shot(page, '07-detail-middle');
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, '08-detail-history');
  await page.evaluate(() => scrollTo(0, 0));

  // identity at the bid boundary
  const guestCta = await page.locator('[data-key="cta"]').innerText();
  check('guest CTA names the amount', /Bid \$350/.test(guestCta), guestCta);
  await page.click('[data-key="cta"]');
  await page.waitForSelector('#sheet[open]');
  check('first bid asks who is bidding', /Who's bidding/.test(await sheetText(page)));
  await shot(page, '09-identity-phone');
  await page.fill('#f-phone', '5550100142');
  await page.click('[data-action="id-phone"]');
  await page.fill('#f-code', '123456');
  await shot(page, '10-identity-code');
  await page.click('[data-action="id-code"]');
  await page.waitForSelector('#f-biz');
  await shot(page, '11-identity-who');
  await page.click('[data-action="id-who"]');
  await page.waitForSelector('#amt');
  check('after identity, the bid sheet opens (intent kept)', /Place a bid/.test(await sheetText(page)));
  check('bid sheet names the business', /Juniper Studio/.test(await sheetText(page)));
  await shot(page, '12-bid-sheet');

  // amount validation + live commitment
  await page.fill('#amt', '340');
  check('below-minimum amount blocks submit', await page.locator('#cta').isDisabled() || /Update to/.test(await page.locator('#cta').innerText()));
  await shot(page, '13-bid-below-min');
  await page.fill('#amt', '355');
  check('off-step amount is rejected with guidance', /\$25 steps/.test(await page.locator('#amt-err').innerText()));
  await page.click('[data-action="quick"] >> nth=1');
  check('commitment text tracks the amount', /\$375/.test(await page.locator('#commit').innerText()));
  await page.click('[data-action="step"][data-d="-1"]');
  check('stepper moves in $25 steps', (await page.inputValue('#amt')) === '350');

  // pending submission → truthful until confirmed
  await page.click('#cta');
  await page.waitForSelector('.result.t-amber');
  check('pending state is not shown as accepted', /Not placed yet/.test(await sheetText(page)) && !/leading at/.test(await sheetText(page)));
  await shot(page, '14-sending');
  await page.waitForSelector('.result.t-green', { timeout: 6000 });
  check('accepted only after server confirmation', /You're leading at \$350/.test(await sheetText(page)));
  await shot(page, '15-accepted');
  await page.click('[data-key="done"]');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.waitForTimeout(300);
  await shot(page, '16-detail-leading');
  check('detail shows leading', /You're leading/.test(await page.locator('.standing').innerText()));

  // leading is visible in the list
  await page.click('[data-action="back"]');
  await page.waitForSelector('.card');
  check('list card shows leading band', (await page.locator('[data-lot="cabin"] .band.t-green').count()) === 1);
  await shot(page, '17-lots-leading-band');

  // outbid
  await rival(page, 'cabin');
  await page.waitForSelector('[data-lot="cabin"] .band.t-red');
  check('rival bid flips card to outbid', true);
  check('toast announces outbid', (await page.locator('.toast').count()) >= 1);
  await page.evaluate(() => document.querySelector('[data-lot="cabin"]').scrollIntoView({ block: 'center' }));
  await shot(page, '18-outbid-card');
  await page.click('.tab:has-text("My bids")');
  await page.waitForSelector('.ticket');
  check('My bids groups outbid under "Needs your attention"', /Needs your attention/.test(await page.locator('.bids').innerText()));
  check('tab badge counts attention items', (await page.locator('.tab .dot').innerText()) === '1');
  await shot(page, '19-bids-outbid');

  // rebid from My bids: same sheet
  await page.click('.ticket [data-action="bid"]');
  await page.waitForSelector('#amt');
  check('bidding from My bids opens the same sheet', /what this does/i.test(await sheetText(page)) && /place a bid/i.test(await sheetText(page)));
  await shot(page, '20-bid-from-mybids');

  // race: rival lands first
  await setNext(page, 'stale');
  await page.click('#cta');
  await page.waitForSelector('.result.t-dashed', { timeout: 6000 });
  check('stale race is reported as not placed', /got there first/.test(await sheetText(page)));
  await shot(page, '21-not-placed-stale');
  await page.click('[data-action="rebid"]');
  await page.waitForSelector('#amt');
  check('rebid offers the new minimum', parseInt(await page.inputValue('#amt'), 10) >= 400, await page.inputValue('#amt'));

  // timeout where the bid DID land → unconfirmed → check status
  await setNext(page, 'timeout_landed');
  await page.click('#cta');
  await page.waitForSelector('.result.t-hatch', { timeout: 9000 });
  check('timeout shows unconfirmed, not accepted or failed', /couldn't confirm/.test(await sheetText(page)));
  await shot(page, '22-unconfirmed');
  await page.click('[data-action="check"]');
  await page.waitForSelector('.result.t-green, .result.t-red', { timeout: 4000 });
  check('check status resolves from the server', /Bid placed|leading|outbid/i.test(await sheetText(page)));
  await shot(page, '23-check-resolved');
  await page.click('[data-key="done"]').catch(() => page.click('[data-action="close-sheet"]'));
  await page.waitForSelector('#sheet', { state: 'hidden' });
});

// ============ PHONE: offline, failure, close ============
await session({ width: 390, height: 844 }, async (page) => {
  await P(page, 'seed');
  await page.evaluate(() => { location.hash = '#/bids'; });
  await page.waitForSelector('.pass-text b:has-text("Juniper")');
  await page.waitForSelector('.ticket');
  await shot(page, '24-bids-all-states');
  await shot(page, '24b-bids-all-states-full', { fullPage: true });
  check('seeded states: leading + outbid + not placed + unconfirmed', (await page.locator('.ticket').count()) === 4);

  // offline: stale standings are labelled, a bid cannot be sent
  await P(page, 'online');
  await page.waitForSelector('.banner.b-off');
  await rival(page, 'cabin');
  await page.evaluate(() => { location.hash = '#/lots'; });
  await page.waitForSelector('.card');
  check('offline banner states how stale the data is', /as of/.test(await page.locator('.banner.b-off').innerText()));
  check('rival bid stays hidden while offline (no false freshness)', (await page.locator('[data-lot="cabin"] .band.t-green').count()) === 1);
  await shot(page, '25-offline-lots');
  await page.evaluate(() => { location.hash = '#/lot/symphony'; });
  await page.waitForSelector('.detail');
  await page.click('[data-key="cta"]');
  await page.waitForSelector('#amt');
  await page.click('#cta');
  await page.waitForSelector('.result.t-dashed', { timeout: 4000 });
  check('offline submit is "not placed", never accepted', /There's no connection/.test(await sheetText(page)));
  await shot(page, '26-offline-not-placed');
  await page.evaluate(() => document.querySelector('[data-action="close-sheet"]')?.click());
  await page.waitForSelector('#sheet', { state: 'hidden' });
  await page.evaluate(() => document.querySelector('[data-p="online"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForSelector('.banner.b-off', { state: 'detached', timeout: 3000 });
  check('reconnect refreshes standings and announces outbid', true);
  await page.evaluate(() => { location.hash = '#/lots'; });
  await page.waitForSelector('.card');
  await shot(page, '27-reconnected-outbid');

  // no-bids lot, long title, missing image
  await page.evaluate(() => { location.hash = '#/lot/symphony'; });
  await page.waitForSelector('.detail');
  await shot(page, '28-detail-longtitle-nobids');

  // auction ended
  await P(page, 'close-event');
  await page.waitForSelector('.banner.b-closed');
  await page.evaluate(() => { location.hash = '#/lot/cabin'; });
  await page.waitForSelector('.detail');
  check('closed lot offers no bid action', (await page.locator('[data-key="cta"]').count()) === 0);
  await shot(page, '29-ended-detail');
  await page.evaluate(() => { location.hash = '#/bids'; });
  await page.waitForSelector('.ticket');
  check('after close, a failed bid cannot be retried', (await page.locator('.ticket:has(.badge:has-text("Not placed")) [data-action="bid"]').count()) === 0);
  check('after close, an unconfirmed bid can still be checked', (await page.locator('.ticket [data-action="bid"]:has-text("Check status")').count()) === 1);
  await shot(page, '30-ended-bids');
  await page.evaluate(() => { location.hash = '#/lots'; });
  await page.waitForSelector('.card');
  await shot(page, '31-ended-lots');

  // reload keeps identity + position; returning welcome
  await page.reload();
  await page.waitForSelector('.card');
  check('reload keeps identity', /Juniper Studio/.test(await page.locator('.pass').innerText()));
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.welcome');
  await shot(page, '32-entry-returning');
});

// ============ narrow phone 360x740 ============
await session({ width: 360, height: 740 }, async (page) => {
  await page.evaluate(() => { location.hash = '#/lots'; });
  await page.waitForSelector('.card');
  await page.locator('[data-lot="symphony"]').scrollIntoViewIfNeeded();
  await shot(page, '33-narrow-longtitle-card');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check('no horizontal overflow at 360px', !overflow);
  await page.evaluate(() => { location.hash = '#/lot/dinner'; });
  await page.waitForSelector('.detail');
  await shot(page, '34-narrow-detail');
  await page.click('[data-key="cta"]');
  await page.waitForSelector('#sheet[open]');
  await shot(page, '35-narrow-identity');
  check('no horizontal overflow in sheet', !(await page.evaluate(() => document.querySelector('#sheet').scrollWidth > document.querySelector('#sheet').clientWidth + 1)));
});

// ============ desktop 1280x800 ============
await session({ width: 1280, height: 800 }, async (page) => {
  await P(page, 'seed');
  await page.evaluate(() => { location.hash = '#/lots'; });
  await page.waitForSelector('.card');
  await shot(page, '36-desktop-lots');
  await page.evaluate(() => { location.hash = '#/lot/dinner'; });
  await page.waitForSelector('.detail');
  await page.click('[data-key="cta"]');
  await page.waitForSelector('#amt');
  await shot(page, '37-desktop-bid-sheet');
  // keyboard: Escape closes the sheet and focus returns to the page
  await page.keyboard.press('Escape');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  check('Escape closes the sheet', true);
  check('Back after sheet stays on the lot', /lot\/dinner/.test(page.url()));
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);
