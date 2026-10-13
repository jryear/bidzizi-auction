#!/usr/bin/env node
// Locks down what a participant sees first for an item (Zack, passthrough 1). Pure logic, no server needed.
//   node tests/v1/display-logic.mjs
import assert from "node:assert/strict";
import { headline, nextBid, standingKey } from "../../src/lib/display.ts";

const base = { phase: "open", currentMinor: null, openingMinor: 10_000, minimumNextMinor: 10_000, leader: null, myBidCount: 0, myHighestMinor: null, award: null };
const cases = [];
const check = (name, fn) => cases.push([name, fn]);

check("no bids: starting amount, Bid at the opening", () => {
  assert.deepEqual(headline(base), { label: "Starting bid", amountMinor: 10_000, yours: false });
  assert.equal(nextBid(base), 10_000);
});
check("saved item with no bids shows the starting amount", () => {
  assert.equal(headline({ ...base, watching: true }).amountMinor, 10_000);
});
check("bids by others: the current top bid", () => {
  const it = { ...base, currentMinor: 15_000, minimumNextMinor: 17_500, leader: { isMe: false } };
  assert.deepEqual(headline(it), { label: "Top bid", amountMinor: 15_000, yours: false });
});
check("leading: your bid is the top bid, no bid button", () => {
  const it = { ...base, currentMinor: 15_000, minimumNextMinor: 17_500, leader: { isMe: true }, myBidCount: 1, myHighestMinor: 15_000 };
  assert.equal(standingKey(it), "leading");
  assert.deepEqual(headline(it), { label: "Your bid is the top bid", amountMinor: 15_000, yours: true });
  assert.equal(nextBid(it), null);
});
check("outbid: leads with the current top bid and Bid $X, never your losing bid", () => {
  const it = { ...base, currentMinor: 20_000, minimumNextMinor: 22_500, leader: { isMe: false }, myBidCount: 1, myHighestMinor: 17_500 };
  assert.equal(standingKey(it), "outbid");
  const h = headline(it);
  assert.equal(h.amountMinor, 20_000);
  assert.equal(h.yours, false);
  assert.notEqual(h.amountMinor, it.myHighestMinor);
  assert.equal(nextBid(it), 22_500);
});
check("won: the winning amount, yours", () => {
  const it = { ...base, phase: "closed", currentMinor: 30_000, leader: { isMe: true }, myBidCount: 2, award: { status: "assigned", amountMinor: 30_000, isMe: true } };
  assert.equal(standingKey(it), "won");
  assert.deepEqual(headline(it), { label: "You won at", amountMinor: 30_000, yours: true });
  assert.equal(nextBid(it), null);
});
check("closed, someone else won: the final bid, not yours", () => {
  const it = { ...base, phase: "closed", currentMinor: 30_000, leader: { isMe: false }, myBidCount: 1, myHighestMinor: 25_000, award: null };
  assert.equal(standingKey(it), "lost");
  assert.deepEqual(headline(it), { label: "Final bid", amountMinor: 30_000, yours: false });
});
check("withdrawn: no bid button, whatever the standing", () => {
  const it = { ...base, phase: "closed", withdrawn: true, currentMinor: 12_000, leader: { isMe: true }, myBidCount: 1 };
  assert.equal(standingKey(it), "withdrawn");
  assert.equal(nextBid(it), null);
});
check("voided: staff removed your only bid, you can bid again", () => {
  const it = { ...base, bidHistory: [{ isMe: true, voided: true }] };
  assert.equal(standingKey(it), "voided");
  assert.equal(nextBid(it), 10_000);
});
check("unconfirmed always wins over standing", () => {
  const it = { ...base, currentMinor: 20_000, leader: { isMe: false }, myBidCount: 1 };
  assert.equal(standingKey(it, true), "unconfirmed");
  assert.equal(nextBid(it, true), null);
});

let failed = 0;
for (const [name, fn] of cases) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
