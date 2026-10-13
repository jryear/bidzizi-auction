#!/usr/bin/env node
// Locks down the Items workspace's pure rules: category tidying, spreadsheet paste and bulk photo matching. No server needed.
//   node tests/v1/items-logic.mjs
import assert from "node:assert/strict";
import { canonicalCategory, orderedCategories, sameCategory, tidyCategory } from "../../src/lib/categories.ts";
import { draftsFrom, guessColumns, looksLikeRows, moneyCell, parseTable } from "../../src/lib/items-paste.ts";
import { matchPhotos } from "../../src/lib/photo-match.ts";

const cases = [];
const check = (name, fn) => cases.push([name, fn]);

check("categories: tidy, compare without case, keep the existing spelling", () => {
  assert.equal(tidyCategory("  Food \t &  drink "), "Food & drink");
  assert.ok(sameCategory("TRAVEL", " travel"));
  assert.equal(canonicalCategory("travel ", ["Travel", "Dining"]), "Travel");
  assert.equal(canonicalCategory("Wellness", ["Travel"]), "Wellness");
  assert.equal(canonicalCategory("   ", ["Travel"]), "");
});
check("categories: stored order first, then unlisted ones in item order", () => {
  assert.deepEqual(orderedCategories(["Wellness", "Travel"], [{ category: "Dining", position: 2 }, { category: "Travel", position: 0 }, { category: "Art", position: 1 }]),
    ["Wellness", "Travel", "Art", "Dining"]);
});

check("paste: a Google Sheets copy with a header and a quoted multi-line cell", () => {
  const text = 'Item\tStarting bid\tCategory\tDonated by\tDescription\r\nWeekend cabin\t$400\tTravel\tJuniper Cabins\t"Two nights.\nSleeps four, ""pet friendly"""\r\nChef\'s table\t325.50\tDining\tHarbor Kitchen\t\r\n\r\n';
  const rows = parseTable(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][4], 'Two nights.\nSleeps four, "pet friendly"');
  const g = guessColumns(rows);
  assert.equal(g.header, true);
  assert.deepEqual(g.columns, ["title", "openingMinor", "category", "donor", "description"]);
  const d = draftsFrom(rows, g.columns, g.header);
  assert.deepEqual(d.map(x => [x.title, x.openingMinor, x.category, x.donor, x.problems.length]), [["Weekend cabin", 40_000, "Travel", "Juniper Cabins", 0], ["Chef's table", 32_550, "Dining", "Harbor Kitchen", 0]]);
});
check("paste: retail value is never taken for the starting bid", () => {
  const rows = parseTable("Lot #\tItem\tRetail value\tOpening bid\n1\tSpa day\t$300\t$120\n2\tGolf for four\t$800\t$350");
  const g = guessColumns(rows);
  assert.deepEqual(g.columns, ["skip", "title", "skip", "openingMinor"]);
  assert.deepEqual(draftsFrom(rows, g.columns, true).map(d => d.openingMinor), [12_000, 35_000]);
});
check("paste: no header, columns guessed from their contents", () => {
  const rows = parseTable("Weekend cabin\tTravel\t400\tJuniper Cabins\nCoffee for a year\tFood & drink\t200\tHarbor Roasters\nCity bike\tTravel\t250\tSpoke & Chain\nWine tasting\tFood & drink\t$150\tCellar 9");
  const g = guessColumns(rows);
  assert.equal(g.header, false);
  assert.deepEqual(g.columns, ["title", "category", "openingMinor", "donor"]);
});
check("paste: plain CSV, and problems are explained per row", () => {
  const rows = parseTable('Title,Start\n"Signed print, framed",200\n,50\nMystery box,free');
  const d = draftsFrom(rows, guessColumns(rows).columns, true);
  assert.equal(d[0].title, "Signed print, framed"); assert.deepEqual(d[0].problems, []);
  assert.deepEqual(d[1].problems, ["Needs a title"]);
  assert.deepEqual(d[2].problems, ['"free" isn\'t an amount']);
});
check("paste: money cells and row detection", () => {
  assert.equal(moneyCell("$1,250"), 125_000); assert.equal(moneyCell("USD 300"), 30_000); assert.equal(moneyCell("12.345"), null); assert.equal(moneyCell("ten"), null);
  assert.equal(looksLikeRows("Weekend cabin"), false); assert.equal(looksLikeRows("A\t1"), true); assert.equal(looksLikeRows("A\nB"), true);
});

const items = ["Weekend cabin in Big Bear", "Chef's table dinner for six", "Coffee for a year", "Restored city bicycle", "Fresh flowers monthly", "Coffee tasting class", "Golf for four",
  "Spa day", "Yoga pass", "Wine tasting", "Signed print", "Brand photography session"]
  .map((title, position) => ({ id: `i${position + 1}`, title, position, hasPhoto: position === 1 }));
check("photos by name: item numbers, title words, and camera names left alone", () => {
  const names = ["07.jpg", "lot-3-coffee.JPG", "bicycle_final.png", "IMG_4821.jpeg", "DSC_0012.jpg", "big-bear-cabin.webp", "coffee.jpg", "flowers (1).jpg"];
  assert.deepEqual(matchPhotos(names, items, "name"), ["i7", "i3", "i4", null, null, "i1", null, "i5"]);
});
check("photos by order: natural file order onto items without photos first", () => {
  assert.deepEqual(matchPhotos(["10.jpg", "2.jpg", "1.jpg"], items, "order"), ["i4", "i3", "i1"]);
});
check("photos: one photo per item, even when names repeat", () => {
  const out = matchPhotos(["spa-day.jpg", "spa day 2.jpg"], items, "name");
  assert.equal(out.filter(x => x === "i8").length, 1);
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
