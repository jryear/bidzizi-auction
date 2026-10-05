import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '../../../node_modules/@playwright/test/index.mjs';

const url = process.env.URL || 'http://127.0.0.1:4331/';
const shots = new URL('./shots/', import.meta.url);
let browser;
try {
  await mkdir(shots, { recursive: true });
  browser = await chromium.launch();
} catch (error) {
  console.error('Infrastructure failure: ' + error.message);
  process.exit(99);
}
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], failedAssets = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failedAssets.push(response.url());
});
const preview = page.frameLocator('#bidder-frame');
let count = 0;
const pass = name => { count++; console.log('PASS ' + name); };
try {
  try { await page.goto(url); }
  catch (error) { console.error('Infrastructure failure: preview unavailable: ' + error.message); process.exitCode = 99; }
  if (process.exitCode === 99) throw new Error('Preview unavailable');
  await expect(page.getByRole('heading', { name: 'Event details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Welcome', exact: true }).click();
  await expect(preview.locator('h1')).toContainText('Holiday Trade Show');
  await page.evaluate(() => document.fonts.ready);
  await preview.locator('img').first().evaluate(image => image.decode());
  await page.screenshot({ path: new URL('event-desktop.png', shots).pathname });
  pass('worktree event screen and actual A welcome renderer load');

  await page.getByRole('link', { name: 'Lots 6', exact: true }).click();
  await page.getByRole('button', { name: 'View in preview ↗', exact: true }).click();
  await expect(preview.locator('h1')).toContainText('A little cabin.');
  await preview.locator('img').first().evaluate(image => image.decode());
  await page.screenshot({ path: new URL('lots-desktop.png', shots).pathname });
  await page.locator('#select-all').check();
  await page.getByRole('button', { name: 'Assign auction window →', exact: true }).click();
  await page.getByRole('button', { name: 'Assign to 6 lots', exact: true }).click();
  await page.getByRole('button', { name: /^Review schedule/ }).click();
  await expect(page.getByRole('button', { name: 'Schedule catalog →', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Fix', exact: true }).click();
  await page.locator('[data-lot="description"]').fill('A fictional year of seasonal flower arrangements.');
  await page.getByRole('button', { name: /^Review schedule/ }).click();
  await expect(page.getByRole('button', { name: 'Schedule catalog →', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Schedule catalog →', exact: true }).click();
  await expect(page.locator('#release-status')).toHaveText('Scheduled');
  pass('bulk schedule, missing-content fix, and local catalog approval');

  await page.getByRole('button', { name: 'Audience view', exact: true }).click();
  await expect(preview.locator('.studio-wait')).toBeVisible();
  await expect(preview.locator('.studio-wait')).toContainText('The catalog will appear when bidding begins.');
  await page.screenshot({ path: new URL('scheduled-hidden.png', shots).pathname });
  await page.locator('#clock').selectOption('open');
  await expect(preview.locator('.studio-wait')).toHaveCount(0);
  await expect(page.locator('#release-status')).toHaveText('Bidding open');
  const originalTitle = await preview.locator('h1').innerText();
  await page.locator('[data-lot="title"]').fill('Changed working draft');
  await expect(preview.locator('h1')).toHaveText(originalTitle);
  await page.getByRole('button', { name: 'Working draft', exact: true }).click();
  await expect(preview.locator('h1')).toHaveText('Changed working draft');
  await page.getByRole('button', { name: 'Audience view', exact: true }).click();
  await page.locator('#clock').selectOption('closed');
  await expect(page.locator('#release-status')).toHaveText('Bidding closed');
  await expect(preview.locator('.closed-note')).toHaveText('Bidding closed');
  pass('hidden/open/closed audience states and approved-copy isolation');

  await page.getByText('Simulation tools', { exact: true }).click();
  await page.getByRole('button', { name: 'Interrupt the next save', exact: true }).click();
  await page.locator('[data-lot="short"]').fill('Recovery check');
  await expect(page.locator('#saved')).toContainText('Unsaved edits');
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('#saved')).toContainText('Saved on this device');
  await page.locator('#lot-search').fill('flowers');
  await page.reload();
  await expect(page.locator('[data-lot="short"]')).toHaveValue('Recovery check');
  await expect(page.locator('#lot-search')).toHaveValue('flowers');
  pass('save interruption, retry, reload, and search recovery');

  await page.getByRole('button', { name: 'Choose organization', exact: true }).click();
  await page.getByRole('button', { name: /Pine Street Exchange/ }).click();
  await page.getByRole('link', { name: 'Lots 0', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No lots yet', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose organization', exact: true }).click();
  await page.getByRole('button', { name: /Saturn Barter/ }).click();
  await expect(page.locator('#event-title')).toHaveText('Holiday Trade Show');
  await expect(page.locator('#lot-count')).toHaveText('6');
  pass('separate fictional organization drafts');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Working draft', exact: true }).click();
  await page.getByRole('button', { name: 'Welcome', exact: true }).click();
  await expect(preview.locator('h1')).toContainText('Holiday Trade Show');
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    previewBottom: document.querySelector('.preview').getBoundingClientRect().bottom,
    footerTop: document.querySelector('.simulation').getBoundingClientRect().top,
  }));
  assert.ok(bounds.scrollWidth <= bounds.width, JSON.stringify(bounds));
  assert.ok(bounds.previewBottom <= bounds.footerTop, JSON.stringify(bounds));
  await page.screenshot({ path: new URL('event-laptop.png', shots).pathname });
  assert.deepEqual(errors, [], 'JavaScript page errors');
  assert.deepEqual(failedAssets, [], 'Failed application assets');
  pass('laptop preview fits, all resources load, and no JavaScript page errors');
  console.log(`${count} browser journey checks passed. Disposable browser fixtures only; not a contract verdict.`);
} catch (error) {
  console.error(error.stack || error.message);
  if (process.exitCode !== 99) process.exitCode = 1;
} finally {
  await browser.close();
}
