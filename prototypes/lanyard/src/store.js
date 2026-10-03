// Client state + a SIMULATED server, both persisted in this browser's localStorage.
// The client only ever renders `state.snap` (what it last heard from the server). It never shows a
// bid as accepted until the simulated server has confirmed it. Nothing here is a real backend.
import { event, lots, lotById, CLOSE_MIN, CLOCK0_MIN, rivals } from './data.js';

const KEY = 'lanyard.v1';

export const timeLabel = (m) => {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
};
const seedLots = () => Object.fromEntries(lots.map((l) => [l.id, { bids: l.history.map((h, i) => ({ id: `${l.id}-s${i}`, ...h })), added: 0 }]));
const clone = (o) => JSON.parse(JSON.stringify(o));

function fresh() {
  return {
    v: 1, t0: Date.now(), identity: null, online: true,
    server: { lots: seedLots(), keys: {}, closed: false, maxes: {} },
    snap: { asOf: timeLabel(CLOCK0_MIN), lots: seedLots(), closed: false },
    outbox: [], lastViewed: null, seq: 0, drafts: {}, flow: {},
    watch: {}, maxes: {}, mflow: {}, extra: [],
    ui: { view: 'cards', cat: 'All', sort: 'number', q: '', text: 'standard', motion: 'system' },
    sim: { next: 'accept', assumptions: true },
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.v === 1) {
      // A reload mid-flight loses the in-flight request: truthfully, its outcome is unknown.
      s.outbox.forEach((e) => { if (e.status === 'sending') { e.status = 'unconfirmed'; } });
      // State saved by the first pass lacks the newer fields: fill them in rather than discard a session.
      const d = fresh();
      s.ui = { ...d.ui, ...s.ui };
      for (const k of ['watch', 'maxes', 'mflow', 'extra']) s[k] ??= d[k];
      s.server.maxes ??= {};
      // A maximum still being saved when the page went away has an unknown outcome, like a bid.
      Object.values(s.maxes).forEach((m) => { if (m.status === 'saving') m.status = 'unconfirmed'; });
      return s;
    }
  } catch { /* fall through */ }
  return fresh();
}

export let state = load();
const subs = new Set();
let pending = false;
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
/** Write to localStorage without telling subscribers (for typing in a field that must keep focus). */
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } }
export function commit() {
  persist();
  if (!pending) { pending = true; queueMicrotask(() => { pending = false; subs.forEach((f) => f()); }); }
}
export function update(fn) { fn(state); commit(); }
export function reset() { state = fresh(); commit(); }
export const noticeHandlers = new Set();
const notice = (n) => noticeHandlers.forEach((f) => f(n));

// ---- clock -------------------------------------------------------------------------------
export const nowMin = () => CLOCK0_MIN + Math.floor((Date.now() - state.t0) / 60000);
export function timeLeft() {
  const m = Math.max(0, CLOSE_MIN - nowMin());
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `about ${h} hr ${r} min left` : `${r} min left`;
}

// ---- selectors (client view; all read the snapshot) --------------------------------------
export const isMine = (b) => !!state.identity && b.business === state.identity.business && b.person === state.identity.person;
export const snapLot = (id) => state.snap.lots[id];
export const topBid = (id) => snapLot(id).bids[0] || null;
export const totalBids = (lot) => lot.count + snapLot(lot.id).added;
export const minNext = (lot, src = state.snap) => {
  const t = src.lots[lot.id].bids[0];
  return t ? t.amount + event.increment : (lot.opening ?? event.increment);
};
export const myBestBid = (id) => snapLot(id).bids.find(isMine) || null;
export const entryFor = (id) => state.outbox.find((e) => e.lotId === id && e.status !== 'accepted') || null;
export const acceptedEntryFor = (id) => state.outbox.find((e) => e.lotId === id && e.status === 'accepted') || null;

export function lotStatus(lot) {
  const e = entryFor(lot.id), t = topBid(lot.id), closed = state.snap.closed;
  const mine = !!t && isMine(t), had = !!myBestBid(lot.id);
  const $ = (c) => `$${(c / 100).toLocaleString('en-US')}`;
  if (e?.status === 'sending') return { kind: 'sending', tone: 'amber', label: 'Sending', title: `Sending your ${$(e.amount)} bid`, sub: "Not placed yet. You aren't leading until it's confirmed.", entry: e };
  if (e?.status === 'unconfirmed') return { kind: 'unconfirmed', tone: 'hatch', label: 'Unconfirmed', title: `We couldn't confirm your ${$(e.amount)} bid`, sub: 'It may or may not have been placed. Check before bidding again.', entry: e };
  if (e?.status === 'failed') return { kind: 'notplaced', tone: 'dashed', label: 'Not placed', title: `Your ${$(e.amount)} bid wasn't placed`, sub: closed ? 'Bidding closed before this could be sent.' : e.reason === 'offline' ? 'No connection. Nothing was sent.' : e.reason === 'lost' ? 'The server never received it. Safe to try again.' : "It couldn't be sent.", entry: e };
  if (e?.status === 'rejected') return { kind: 'notplaced', tone: 'dashed', label: 'Not placed', title: `Your ${$(e.amount)} bid wasn't placed`, sub: e.reason === 'closed' ? 'Bidding closed before it arrived.' : `${e.by.business} bid ${$(e.by.amount)} first.`, entry: e };
  if (closed) {
    if (mine) return { kind: 'final-leading', tone: 'ink', label: 'You had top bid', title: 'Bidding closed. Yours was the top bid', sub: `${state.identity.business} held ${$(t.amount)} when bidding closed.` };
    if (had) return { kind: 'closed-outbid', tone: 'grey', label: 'Closed · outbid', title: 'Bidding closed. You were outbid', sub: `${t.business} held the top bid at ${$(t.amount)}.` };
    return { kind: 'closed', tone: 'grey', label: 'Closed', title: 'Bidding closed', sub: t ? `Top bid ${$(t.amount)}.` : 'No bids were placed.' };
  }
  if (mine) return { kind: 'leading', tone: 'green', label: "You're leading", title: "You're leading", sub: `${state.identity.business} holds the top bid at ${$(t.amount)}.` };
  if (had) return { kind: 'outbid', tone: 'red', label: 'Outbid', title: "You've been outbid", sub: `${t.business} leads at ${$(t.amount)}.` };
  return { kind: 'none', tone: 'none', label: '', title: '', sub: '' };
}
export const needsAttention = () => lots.filter((l) => ['outbid', 'notplaced', 'unconfirmed'].includes(lotStatus(l).kind)).length;

// ---- the simulated server ----------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const TIMEOUT_MS = 4500;

function serverTop(id) { return state.server.lots[id].bids[0] || null; }
function serverMin(lot) { const t = serverTop(lot.id); return t ? t.amount + event.increment : (lot.opening ?? event.increment); }
function serverPlace(lotId, who, amount, key) {
  const L = state.server.lots[lotId];
  const bid = { id: `${lotId}-n${++state.seq}`, business: who.business, person: who.person, amount, time: timeLabel(nowMin()) };
  L.bids.unshift(bid); L.added++;
  if (key) state.server.keys[key] = bid.id;
  return bid;
}
function serverApply(e) {
  if (state.server.keys[e.key]) return { ok: true, replay: true };
  if (state.server.closed) return { ok: false, reason: 'closed' };
  const lot = lotById(e.lotId);
  if (e.amount < serverMin(lot) || e.amount % event.increment) return { ok: false, reason: 'stale', by: serverTop(e.lotId) };
  return { ok: true, bid: serverPlace(e.lotId, e.who, e.amount, e.key) };
}

/** Pull the server's truth into the client snapshot. Only possible while online. */
export function sync({ quiet = false } = {}) {
  if (!state.online) return false;
  const before = Object.fromEntries(lots.map((l) => [l.id, topBid(l.id)]));
  const wasClosed = state.snap.closed;
  state.snap = { asOf: timeLabel(nowMin()), lots: clone(state.server.lots), closed: state.server.closed };
  // The server is authoritative: an "unconfirmed" bid it holds is simply accepted.
  state.outbox.forEach((e) => { if (e.status === 'unconfirmed' && state.server.keys[e.key]) e.status = 'accepted'; });
  if (!quiet && state.identity) {
    for (const l of lots) {
      const was = before[l.id], now = topBid(l.id);
      if (was && isMine(was) && now && !isMine(now)) notice({ kind: 'outbid', lotId: l.id, lot: l, by: now });
    }
    if (!wasClosed && state.snap.closed) notice({ kind: 'closed' });
  }
  commit();
  return true;
}

// ---- client actions -----------------------------------------------------------------------
const setEntry = (key, patch) => update((s) => { const e = s.outbox.find((x) => x.key === key); if (e) Object.assign(e, patch); });
export const pruneAccepted = () => update((s) => { s.outbox = s.outbox.filter((e) => e.status !== 'accepted'); });
export const dismissEntry = (key) => update((s) => { s.outbox = s.outbox.filter((e) => e.key !== key); });

export function placeBid(lotId, amount) {
  const key = `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  update((s) => {
    s.outbox = s.outbox.filter((e) => e.lotId !== lotId); // one active attempt per lot
    s.outbox.push({ key, lotId, amount, status: 'sending', reason: null, who: { ...s.identity } });
  });
  return transmit(key);
}
export const retryBid = (key) => { setEntry(key, { status: 'sending', reason: null, by: null }); return transmit(key); };

async function transmit(key) {
  const mode = state.online ? state.sim.next : 'offline';
  if (state.online && state.sim.next !== 'accept') update((s) => { s.sim.next = 'accept'; });
  const e = () => state.outbox.find((x) => x.key === key);
  if (!e()) return;
  if (mode === 'offline' || mode === 'not_sent') { await wait(700); return setEntry(key, { status: 'failed', reason: mode === 'offline' ? 'offline' : 'network' }); }
  if (mode === 'timeout_lost') { await wait(TIMEOUT_MS); return setEntry(key, { status: 'unconfirmed' }); }
  await wait(1300);
  if (!e()) return;
  if (mode === 'stale') { const r = rivals.find((x) => x.business !== serverTop(e().lotId)?.business) || rivals[0]; serverPlace(e().lotId, r, e().amount); }
  if (mode === 'closed') state.server.closed = true;
  const res = serverApply(e());
  if (mode === 'timeout_landed') { commit(); await wait(TIMEOUT_MS - 1300); return setEntry(key, { status: 'unconfirmed' }); }
  sync({ quiet: true });
  if (res.ok) return setEntry(key, { status: 'accepted', confirmedAt: timeLabel(nowMin()) });
  return setEntry(key, { status: 'rejected', reason: res.reason, by: res.by });
}

export async function checkStatus(key) {
  if (!state.online) return { offline: true };
  await wait(800);
  sync({ quiet: true });
  if (state.server.keys[key]) { setEntry(key, { status: 'accepted', confirmedAt: timeLabel(nowMin()) }); return { landed: true }; }
  setEntry(key, { status: 'failed', reason: 'lost' });
  return { landed: false };
}

// ---- watching (A16): a list on this device. Separate from bids: it places nothing and tells no one ----
export const isWatching = (id) => !!state.watch[id];
export const watchedLots = () => lots.filter((l) => state.watch[l.id]);
export function toggleWatch(id) { update((s) => { if (s.watch[id]) delete s.watch[id]; else s.watch[id] = true; }); return isWatching(id); }

// ---- additional users (A17): a list only; nothing is sent and nobody gains any ability ----------------
export const extraUsers = () => state.extra.filter((u) => state.identity && u.business === state.identity.business);
export function addExtraUser(name, phone) {
  update((s) => { s.extra.push({ id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, business: s.identity.business, name, phone }); });
}
export const removeExtraUser = (id) => update((s) => { s.extra = s.extra.filter((u) => u.id !== id); });

// ---- private maximum (A20): a labeled simulation. It is saved, never acted on --------------------------
// Like a bid, a maximum is "saved" only after the simulated server confirms. It places no bids.
const sameWho = (a, b) => !!a && !!b && a.business === b.business && a.person === b.person;
export const myMax = (lotId) => { const m = state.maxes[lotId]; return m && sameWho(m.who, state.identity) ? m : null; };
const setMaxRec = (lotId, patch) => update((s) => { if (s.maxes[lotId]) Object.assign(s.maxes[lotId], patch); });

export function saveMax(lotId, cents) {
  const key = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  update((s) => {
    const prev = s.maxes[lotId] && s.maxes[lotId].status === 'saved' ? { ...s.maxes[lotId], prev: null } : s.maxes[lotId]?.prev ?? null;
    s.maxes[lotId] = { key, amount: cents, status: 'saving', reason: null, who: { ...s.identity }, prev };
  });
  return transmitMax(lotId, key);
}
export const retryMax = (lotId) => { setMaxRec(lotId, { status: 'saving', reason: null }); return transmitMax(lotId, state.maxes[lotId].key); };

async function transmitMax(lotId, key) {
  const cur = () => (state.maxes[lotId]?.key === key ? state.maxes[lotId] : null);
  if (!state.online) { await wait(700); return cur() && setMaxRec(lotId, { status: 'failed', reason: 'offline' }); }
  await wait(1100);
  const m = cur(); if (!m) return;
  if (state.server.closed) return setMaxRec(lotId, { status: 'failed', reason: 'closed' });
  state.server.maxes[lotId] = { key, amount: m.amount, who: m.who };
  return setMaxRec(lotId, { status: 'saved', prev: null, confirmedAt: timeLabel(nowMin()) });
}
export async function checkMax(lotId) {
  if (!state.online) return { offline: true };
  await wait(800);
  const m = state.maxes[lotId]; if (!m) return {};
  if (state.server.maxes[lotId]?.key === m.key) { setMaxRec(lotId, { status: 'saved', prev: null, confirmedAt: timeLabel(nowMin()) }); return { landed: true }; }
  setMaxRec(lotId, { status: 'failed', reason: 'lost' });
  return { landed: false };
}
/** Drop a failed attempt: any earlier saved maximum is still what the server holds. */
export function discardMax(lotId) { update((s) => { const m = s.maxes[lotId]; if (m?.prev) s.maxes[lotId] = m.prev; else delete s.maxes[lotId]; }); }
export function removeMax(lotId) {
  if (!state.online) return { offline: true };
  update((s) => { delete s.maxes[lotId]; delete s.server.maxes[lotId]; });
  return { removed: true };
}

// ---- simulation controls (prototype-only) --------------------------------------------------
export function rivalBids(lotId) {
  const lot = lotById(lotId), t = serverTop(lotId);
  const r = rivals.find((x) => x.business !== t?.business && !(state.identity && x.business === state.identity.business)) || rivals[0];
  serverPlace(lotId, r, serverMin(lot));
  sync(); // no-op while offline: the client stays stale until it reconnects
}
export function setOnline(on) {
  const was = state.online;
  state.online = on;
  commit();
  if (on && !was) sync();
}
export function setClosed(closed) { state.server.closed = closed; sync(); commit(); }
export function signIn(identity) { update((s) => { s.identity = identity; }); }
export function signOut() { update((s) => { s.identity = null; }); }

/** Demo bidder with a bit of history in every state worth looking at. */
export function seedDemo() {
  reset();
  const who = { business: event.business, person: event.participant };
  state.identity = { ...who, phone: '•••• 0142', memberId: 'DEMO-0142' };
  serverPlace('cabin', who, 35000);                       // leading
  serverPlace('dinner', who, 47500);                      // outbid below
  serverPlace('dinner', rivals[0], 50000);
  sync({ quiet: true });
  state.outbox.push({ key: 'seed-fail', lotId: 'ceramics', amount: 12500, status: 'failed', reason: 'offline', who });
  state.outbox.push({ key: 'seed-unc', lotId: 'bicycle', amount: 30000, status: 'unconfirmed', reason: null, who });
  state.lastViewed = 'dinner';
  state.watch = { coffee: true, symphony: true };
  state.maxes.cabin = { key: 'seed-max', amount: 50000, status: 'saved', reason: null, who: { ...who }, prev: null, confirmedAt: timeLabel(nowMin()) };
  state.server.maxes.cabin = { key: 'seed-max', amount: 50000, who: { ...who } };
  commit();
}
