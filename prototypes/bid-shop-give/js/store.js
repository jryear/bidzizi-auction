// SYNTHETIC, browser-local store for the Bid · Shop · Give prototype. Nothing here is operational truth:
// no API calls, no database. It simulates the decisions the spec gives the server (BID_SHOP_GIVE.md) closely
// enough to feel the states: stock, per-guest limits, receipts for retried requests, staff status changes.

const KEY = "bsg-proto-v3";
const START = Date.now();

const auctions = [
  { title: "Lakeside cabin weekend", category: "Travel", donor: "Pine Ridge Rentals", short: "Two nights for four, firewood included.", openingMinor: 40000, photo: "cabin" },
  { title: "Coffee for a year", category: "Food & drink", donor: "Ember Roasters", short: "A bag of fresh beans every month.", openingMinor: 15000, photo: "coffee" },
  { title: "Hand-thrown dinnerware set", category: "Home", donor: "Clayworks Studio", short: "Service for six in winter glaze.", openingMinor: 20000, photo: "ceramics" },
  { title: "Chef's table for six", category: "Experiences", donor: "Juniper Kitchen", short: "Seven courses in the kitchen.", openingMinor: 50000, photo: "dinner" },
  { title: "Winter wreath subscription", category: "Home", donor: "Fern & Stem", short: "A fresh wreath each December.", openingMinor: 8000, photo: "flowers" },
  { title: "Commuter e-bike", category: "Experiences", donor: "Spoke & Chain", short: "Tuned, fitted and delivered.", openingMinor: 90000, photo: "bicycle" },
];
const shop = [
  { title: "Holiday gift box", category: "Gifts", donor: "Saturn Market", short: "Local jam, shortbread, cocoa and a card.", priceMinor: 4000, quantity: 20, remaining: 12, limit: 2, pickup: "Gift table by the entrance, until 8 PM", art: "gift", tint: "#B8432F" },
  { title: "Winter blend, 12 oz", category: "Food & drink", donor: "Ember Roasters", short: "Roasted this week. Whole bean.", priceMinor: 1800, quantity: 40, remaining: 31, limit: 4, pickup: "Ember Roasters booth, table 6", art: "bag", tint: "#5B3A29" },
  { title: "Hand-poured candle trio", category: "Home", donor: "Wick & Ember", short: "Cedar, clove and orange peel.", priceMinor: 3200, quantity: 12, remaining: 1, limit: null, pickup: "Gift table by the entrance, until 8 PM", art: "candle", tint: "#C98A2E" },
  { title: "Glazed ornament set", category: "Gifts", donor: "Clayworks Studio", short: "Four hand-glazed ornaments in a box.", priceMinor: 2400, quantity: 15, remaining: 7, limit: 2, pickup: "Clayworks booth, table 2", art: "ornament", tint: "#2F5D62" },
  { title: "Cookie tin", category: "Food & drink", donor: "Juniper Kitchen", short: "Two dozen, baked the morning of the show.", priceMinor: 1500, quantity: 30, remaining: 18, limit: null, pickup: "Juniper Kitchen booth, table 9", art: "tin", tint: "#7A2E3B" },
  { title: "Mini table wreath", category: "Home", donor: "Fern & Stem", short: "Fir, eucalyptus and dried citrus.", priceMinor: 2800, quantity: 5, remaining: 0, limit: 1, pickup: "Fern & Stem booth, table 4", art: "wreath", tint: "#2E5233" },
];
const people = [
  { id: "p-me", name: "Jo Park", business: "Park & Co" },
  { id: "p-2", name: "Dana Reyes", business: "Reyes Design" },
  { id: "p-3", name: "Sam Ortiz", business: "Ortiz Supply" },
  { id: "p-4", name: "Priya Shah", business: "Shah Dental" },
  { id: "p-5", name: "Lee Adams", business: "Harbor LLC" },
  { id: "p-6", name: "Mo Chen", business: "Chen Realty" },
];

let seq = 0;
const uid = p => `${p}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const minutesAgo = m => START - m * 60_000;

function fresh() {
  seq = 0;
  const items = [
    ...auctions.map((a, i) => ({ id: `a${i + 1}`, kind: "auction", number: i + 1, ready: true, ...a, increment: a.openingMinor >= 50000 ? 5000 : 2500 })),
    ...shop.map((s, i) => ({ id: `s${i + 1}`, kind: "shop", number: auctions.length + i + 1, ready: true, ...s })),
  ];
  const bids = [
    { id: "b1", itemId: "a1", who: "p-2", amountMinor: 40000, at: minutesAgo(26) },
    { id: "b2", itemId: "a1", who: "p-3", amountMinor: 42500, at: minutesAgo(20) },
    { id: "b3", itemId: "a2", who: "p-2", amountMinor: 15000, at: minutesAgo(18) },
    { id: "b4", itemId: "a4", who: "p-3", amountMinor: 50000, at: minutesAgo(12) },
    { id: "b5", itemId: "a3", who: "p-me", amountMinor: 20000, at: minutesAgo(9) },
    { id: "b6", itemId: "a2", who: "p-me", amountMinor: 17500, at: minutesAgo(7) },
    { id: "b7", itemId: "a2", who: "p-4", amountMinor: 20000, at: minutesAgo(3) },
  ];
  // Seed purchases so sold counts reconcile: quantity = remaining + sum(non-cancelled purchases).
  const purchases = [];
  const buyers = ["p-2", "p-3", "p-4", "p-5", "p-6"];
  for (const it of items.filter(i => i.kind === "shop")) {
    let sold = it.quantity - it.remaining, k = 0;
    const got = {};
    while (sold > 0) {
      const who = buyers[k++ % buyers.length];
      const room = (it.limit ?? 99) - (got[who] ?? 0);
      if (room <= 0) continue;
      const q = Math.min(sold, room, 1 + (k % 2));
      got[who] = (got[who] ?? 0) + q;
      purchases.push({ id: uid("pu"), itemId: it.id, who, quantity: q, unitMinor: it.priceMinor, status: k % 3 === 0 ? "paid" : k % 5 === 0 ? "picked_up" : "committed", at: minutesAgo(40 - k * 2 - Number(it.id.slice(1))) });
      sold -= q;
    }
  }
  purchases.push({ id: uid("pu"), itemId: "s2", who: "p-me", quantity: 2, unitMinor: 1800, status: "committed", at: minutesAgo(5) });
  items.find(i => i.id === "s2").remaining -= 2;
  return {
    v: 3,
    event: { name: "Holiday Trade Show", code: "VAADXS", venue: "Saturn Hall", endsAt: START + (2 * 60 + 58) * 60_000, startsAt: START - 70 * 60_000 },
    windowOpen: true,
    fault: null, // "lose-response": the next guest confirm commits but the response is lost
    items, bids, purchases,
    pledges: [{ id: "pl1", who: "p-2", recipientId: "r1", amountMinor: 10000, at: minutesAgo(15) }],
    recipients: [{ id: "r1", name: "Harbor Food Bank", blurb: "Holiday meals for 400 families." }, { id: "r2", name: "Northside Youth Club", blurb: "Winter break programs for kids 8–14." }],
    people, receipts: {}, log: [], watching: ["a4"],
  };
}

let state = load();
const subs = new Set();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s.v === 3) return s; } } catch { /* storage unavailable */ }
  return fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } }
function emit() { save(); subs.forEach(f => f()); }

export const store = {
  get: () => state,
  subscribe: f => (subs.add(f), () => subs.delete(f)),
  reset() { state = fresh(); emit(); },
  set(patch) { state = { ...state, ...patch }; emit(); },
};

export const ME = "p-me";
export const person = id => state.people.find(p => p.id === id);
export const money = m => `$${(m / 100).toLocaleString("en-US", { minimumFractionDigits: m % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------- derived reads
export function standing(item) {
  const bids = state.bids.filter(b => b.itemId === item.id).sort((a, b) => b.amountMinor - a.amountMinor);
  const top = bids[0] ?? null;
  const next = top ? top.amountMinor + item.increment : item.openingMinor;
  return { top, count: bids.length, next, leaderIsMe: top?.who === ME, mine: bids.filter(b => b.who === ME) };
}
export const live = p => p.status !== "cancelled";
export function held(itemId, who = ME) { return state.purchases.filter(p => p.itemId === itemId && p.who === who && live(p)).reduce((s, p) => s + p.quantity, 0); }
export function sold(itemId) { return state.purchases.filter(p => p.itemId === itemId && live(p)).reduce((s, p) => s + p.quantity, 0); }
export function canBuyUpTo(item) {
  const room = item.limit == null ? Infinity : item.limit - held(item.id);
  return Math.max(0, Math.min(item.remaining, room));
}
export const myPurchases = () => state.purchases.filter(p => p.who === ME).sort((a, b) => b.at - a.at);
export const myPledges = () => state.pledges.filter(p => p.who === ME).sort((a, b) => b.at - a.at);
export const itemById = id => state.items.find(i => i.id === id);

// ---------------------------------------------------------------- simulated server decisions
const wait = ms => new Promise(r => setTimeout(r, ms));
const hash = o => JSON.stringify(o);

/** Buy: lock stock → receipt check → window → per-guest limit (inside the lock) → stock → insert. */
export async function buy(itemId, quantity, requestId) {
  await wait(650);
  const payload = hash({ itemId, quantity });
  const prior = state.receipts[requestId];
  if (prior) return prior.payload === payload ? prior.receipt : { accepted: false, reason: "CONFLICT" };
  const item = itemById(itemId);
  let receipt;
  if (!item || !item.ready) receipt = { accepted: false, reason: "NOT_AVAILABLE" };
  else if (!state.windowOpen) receipt = { accepted: false, reason: "CLOSED" };
  else if (item.limit != null && held(itemId) + quantity > item.limit) receipt = { accepted: false, reason: "LIMIT_REACHED", left: Math.max(0, item.limit - held(itemId)) };
  else if (quantity > item.remaining) receipt = { accepted: false, reason: item.remaining ? "NOT_ENOUGH" : "SOLD_OUT", left: item.remaining };
  else {
    const p = { id: uid("pu"), itemId, who: ME, quantity, unitMinor: item.priceMinor, status: "committed", at: Date.now(), requestId };
    state = { ...state, purchases: [...state.purchases, p], items: state.items.map(i => i.id === itemId ? { ...i, remaining: i.remaining - quantity } : i) };
    receipt = { accepted: true, purchaseId: p.id, quantity, amountMinor: quantity * item.priceMinor };
  }
  state = { ...state, receipts: { ...state.receipts, [requestId]: { payload, receipt } } };
  const lose = state.fault === "lose-response";
  if (lose) state = { ...state, fault: null };
  emit();
  if (lose) throw new Error("connection lost");
  return receipt;
}
/** Asking again with the same request id returns the original decision. */
export async function receiptOf(requestId) { await wait(500); return state.receipts[requestId]?.receipt ?? null; }

export async function bid(itemId, amountMinor, requestId) {
  await wait(600);
  const prior = state.receipts[requestId];
  if (prior) return prior.receipt;
  const item = itemById(itemId), s = standing(item);
  let receipt;
  if (!state.windowOpen) receipt = { accepted: false, reason: "CLOSED" };
  else if (s.leaderIsMe) receipt = { accepted: false, reason: "ALREADY_LEADING" };
  else if (amountMinor < s.next) receipt = { accepted: false, reason: "BELOW_MINIMUM", next: s.next };
  else {
    state = { ...state, bids: [...state.bids, { id: uid("b"), itemId, who: ME, amountMinor, at: Date.now() }] };
    receipt = { accepted: true, amountMinor };
  }
  state = { ...state, receipts: { ...state.receipts, [requestId]: { receipt } } };
  emit();
  return receipt;
}

export async function pledge(recipientId, amountMinor, requestId) {
  await wait(600);
  const prior = state.receipts[requestId];
  if (prior) return prior.receipt;
  state = { ...state, pledges: [...state.pledges, { id: uid("pl"), who: ME, recipientId, amountMinor, at: Date.now() }] };
  const receipt = { accepted: true };
  state = { ...state, receipts: { ...state.receipts, [requestId]: { receipt } } };
  emit();
  return receipt;
}

export function watch(itemId, on) {
  state = { ...state, watching: on ? [...new Set([...state.watching, itemId])] : state.watching.filter(i => i !== itemId) };
  emit();
}

// ---------------------------------------------------------------- simulated other guests
export function rush() {
  let { items, purchases } = state;
  for (const it of items.filter(i => i.kind === "shop" && i.remaining > 0)) {
    const who = people[1 + Math.floor(Math.random() * (people.length - 1))].id;
    const q = Math.min(it.remaining, 1 + Math.floor(Math.random() * 2), it.limit ?? 3);
    purchases = [...purchases, { id: uid("pu"), itemId: it.id, who, quantity: q, unitMinor: it.priceMinor, status: "committed", at: Date.now() }];
    items = items.map(i => i.id === it.id ? { ...i, remaining: i.remaining - q } : i);
  }
  const open = state.items.filter(i => i.kind === "auction");
  const target = open[Math.floor(Math.random() * open.length)], s = standing(target);
  const bids = [...state.bids, { id: uid("b"), itemId: target.id, who: "p-5", amountMinor: s.next, at: Date.now() }];
  state = { ...state, items, purchases, bids };
  emit();
}

// ---------------------------------------------------------------- staff
export const TRANSITIONS = { committed: ["paid", "cancelled"], paid: ["picked_up", "cancelled"], picked_up: [], cancelled: [] };
export function setStatus(purchaseId, to) {
  const p = state.purchases.find(x => x.id === purchaseId);
  if (!p || !TRANSITIONS[p.status].includes(to)) return false; // repeated or illegal change: no-op
  const items = to === "cancelled" ? state.items.map(i => i.id === p.itemId ? { ...i, remaining: i.remaining + p.quantity } : i) : state.items;
  state = { ...state, items, purchases: state.purchases.map(x => x.id === purchaseId ? { ...x, status: to } : x), log: [...state.log, { purchaseId, from: p.status, to, at: Date.now() }] };
  emit();
  return true;
}
export function updateItem(id, patch) {
  state = { ...state, items: state.items.map(i => {
    if (i.id !== id) return i;
    const next = { ...i, ...patch };
    if ("quantity" in patch && i.kind === "shop") next.remaining = Math.max(0, patch.quantity - sold(i.id));
    return next;
  }) };
  emit();
}
export function addItem(fields) {
  const number = Math.max(...state.items.map(i => i.number)) + 1;
  const base = { id: uid(fields.kind === "shop" ? "s" : "a"), number, ready: false, category: "", donor: "", short: "", ...fields };
  if (fields.kind === "shop") Object.assign(base, { remaining: fields.quantity, art: "gift", tint: "#6B5B95", pickup: fields.pickup ?? "" });
  else Object.assign(base, { increment: 2500 });
  state = { ...state, items: [...state.items, base] };
  emit();
  return base;
}
export function invariants() {
  const out = [];
  for (const it of state.items.filter(i => i.kind === "shop")) {
    if (it.quantity !== it.remaining + sold(it.id)) out.push(`${it.title}: stock does not add up`);
    if (it.limit != null) for (const p of people) if (held(it.id, p.id) > it.limit) out.push(`${it.title}: ${p.name} is over the limit`);
  }
  return out;
}
