// State + actions. Everything persists to this browser's localStorage only (key eventstudio1.v1).
// Nothing here talks to a server, a database, an SMS provider or a payment service.
import { seedState, newEvent, newLot, validateLot, validateWindow, validateEventName, uid, NOW, defaultDisplay, fingerprint, analyze, windowOf, smsChecks, dollars, lotNo, nextEligible } from './model.js';

export const KEY = 'eventstudio1.v1';
export const flags = { saveOk: true };
let loadNote = '';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedState();
    const s = JSON.parse(raw);
    if (s?.v === 1 && s.events && Array.isArray(s.order)) {
      s.order = s.order.filter((id) => s.events[id]);
      s.ui = { preview: false, rule: 'first', play: false, notes: false, simFail: false, ...s.ui };
      for (const ev of Object.values(s.events)) { ev.ui = { clock: 'before', screen: 'welcome', slide: 'welcome', ...ev.ui }; ev.review ??= { previewed: false, reviewedAt: null, fingerprint: null }; }
      return s;
    }
  } catch { /* corrupt or blocked storage: fall through to a fresh seed, and say so */ }
  loadNote = 'Saved data could not be read, so the example events were restored.';
  return seedState();
}

export let state = load();
export const takeLoadNote = () => { const n = loadNote; loadNote = ''; return n; };
export const transient = { applying: {}, undo: null, lastDup: { id: '', at: 0 }, simTick: 0 };
const subs = new Set();
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
let queued = null;
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; } }
/** main:true re-renders the page body; main:false refreshes only the chrome, checklist counts and preview (typing keeps focus). */
export function commit({ main = true } = {}) {
  flags.saveOk = persist();
  queued = { main: main || !!queued?.main };
  queueMicrotask(() => { if (!queued) return; const o = queued; queued = null; subs.forEach((f) => f(o)); });
}
export function reloadFromStorage() { state = load(); subs.forEach((f) => f({ main: true, external: true })); }
export function resetAll() { state = seedState(); transient.undo = null; commit(); }

export const orderedEvents = () => state.order.map((id) => state.events[id]);
export const getEvent = (id) => state.events[id] || null;
const clone = (o) => JSON.parse(JSON.stringify(o));
const touched = (ev) => { ev.updatedAt = NOW; };

// ---- undo (one level, in memory: a reload forgets it, and the toast says nothing after that) ----
function rememberForUndo(ev, label) { transient.undo = { evId: ev.id, label, snap: clone(ev) }; }
export function undo() {
  const u = transient.undo; if (!u || !state.events[u.evId]) return false;
  state.events[u.evId] = u.snap; transient.undo = null; commit(); return true;
}

// ---- events -------------------------------------------------------------------------------
export function createEvent(name, date) {
  const err = validateEventName(name, orderedEvents());
  if (err) return { ok: false, error: err };
  const ev = newEvent(name, { date });
  state.events[ev.id] = ev; state.order.unshift(ev.id);
  commit();
  return { ok: true, id: ev.id };
}
export function setEventName(evId, name) {
  const ev = getEvent(evId), err = validateEventName(name, orderedEvents(), evId);
  if (err) return err;
  ev.name = name.trim(); commit({ main: false }); return '';
}

/** Generic draft edit. Details autosave locally; there is no separate Save step for them. */
export function edit(evId, fn, opts) { const ev = getEvent(evId); if (!ev) return; fn(ev); touched(ev); commit(opts); }

// ---- lots ---------------------------------------------------------------------------------
export function saveLot(evId, draft) {
  const ev = getEvent(evId), errs = validateLot(draft);
  if (Object.keys(errs).length) return { ok: false, errors: errs };
  const i = ev.lots.findIndex((l) => l.id === draft.id);
  const clean = { ...draft, title: draft.title.trim(), short: draft.short.trim(), description: draft.description.trim() };
  if (i >= 0) ev.lots[i] = clean; else ev.lots.push(clean);
  touched(ev); commit(); return { ok: true, lot: clean };
}
export function duplicateLot(evId, lotId) {
  const ev = getEvent(evId), src = ev.lots.find((l) => l.id === lotId); if (!src) return null;
  // Repeated clicks within half a second are one intention, not two copies.
  const now = Date.now(); if (transient.lastDup.id === lotId && now - transient.lastDup.at < 500) return { skipped: true };
  transient.lastDup = { id: lotId, at: now };
  rememberForUndo(ev, 'duplicate');
  const copy = newLot(ev, { ...clone(src), id: uid('lot'), title: src.title.length > 130 ? src.title : `${src.title} (copy)` });
  copy.number = ev.lots.reduce((m, l) => Math.max(m, l.number), 0) + 1;
  ev.lots.push(copy); touched(ev); commit(); return { lot: copy };
}
export function deleteLots(evId, ids) {
  const ev = getEvent(evId); rememberForUndo(ev, 'delete');
  const n = ev.lots.length; ev.lots = ev.lots.filter((l) => !ids.includes(l.id)); touched(ev); commit(); return n - ev.lots.length;
}
export function bulkSet(evId, ids, patch) {
  const ev = getEvent(evId); rememberForUndo(ev, 'bulk');
  let n = 0; ev.lots.forEach((l) => { if (ids.includes(l.id)) { Object.assign(l, patch); n++; } }); touched(ev); commit(); return n;
}
export const assignAllUnassigned = (evId, windowId) => { const ev = getEvent(evId); return bulkSet(evId, ev.lots.filter((l) => !windowOf(ev, l)).map((l) => l.id), { windowId }); };

// ---- categories ---------------------------------------------------------------------------
export function addCategory(evId, name) {
  const ev = getEvent(evId), n = name.trim();
  if (!n) return 'Name the category.';
  if (n.length > 40) return 'Keep it under 40 characters.';
  if (ev.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return `“${n}” already exists.`;
  ev.categories.push({ id: uid('cat'), name: n }); touched(ev); commit(); return '';
}
export function renameCategory(evId, id, name) {
  const ev = getEvent(evId), n = name.trim();
  if (!n) return 'Name the category.';
  if (ev.categories.some((c) => c.id !== id && c.name.toLowerCase() === n.toLowerCase())) return `“${n}” already exists.`;
  ev.categories.find((c) => c.id === id).name = n; touched(ev); commit({ main: false }); return '';
}
export function deleteCategory(evId, id) {
  const ev = getEvent(evId); rememberForUndo(ev, 'category');
  ev.categories = ev.categories.filter((c) => c.id !== id); ev.lots.forEach((l) => { if (l.categoryId === id) l.categoryId = null; }); touched(ev); commit();
}

// ---- windows ------------------------------------------------------------------------------
export function saveWindow(evId, draft) {
  const ev = getEvent(evId), errs = validateWindow(draft);
  if (Object.keys(errs).length) return { ok: false, errors: errs };
  const clean = { ...draft, name: draft.name.trim() }, i = ev.windows.findIndex((w) => w.id === draft.id);
  if (i >= 0) ev.windows[i] = clean; else ev.windows.push(clean);
  touched(ev); commit(); return { ok: true, window: clean };
}
export function deleteWindow(evId, id) {
  const ev = getEvent(evId); rememberForUndo(ev, 'window');
  const n = ev.lots.filter((l) => l.windowId === id).length;
  ev.windows = ev.windows.filter((w) => w.id !== id); ev.lots.forEach((l) => { if (l.windowId === id) l.windowId = null; }); touched(ev); commit(); return n;
}
/** Set exactly which lots are in a window. A lot has one window (S1), so picking it moves it. */
export function setWindowLots(evId, windowId, ids) {
  const ev = getEvent(evId); rememberForUndo(ev, 'assign');
  ev.lots.forEach((l) => { if (ids.includes(l.id)) l.windowId = windowId; else if (l.windowId === windowId) l.windowId = null; });
  touched(ev); commit();
}

// ---- sponsors, increments, donations, access ---------------------------------------------
export function addSponsor(evId, name) {
  const ev = getEvent(evId), n = name.trim();
  if (!n) return 'Enter the sponsor’s name.';
  if (ev.sponsors.some((s) => s.name.toLowerCase() === n.toLowerCase())) return `“${n}” is already listed.`;
  ev.sponsors.push({ id: uid('sp'), name: n }); touched(ev); commit(); return '';
}
export function removeSponsor(evId, id) { const ev = getEvent(evId); rememberForUndo(ev, 'sponsor'); ev.sponsors = ev.sponsors.filter((s) => s.id !== id); ev.lots.forEach((l) => { if (l.sponsorId === id) l.sponsorId = null; }); touched(ev); commit(); }
export function setIncrement(evId, cents) { const ev = getEvent(evId); ev.increment = { amount: cents, confirmed: false }; touched(ev); commit({ main: false }); }
export function confirmIncrement(evId) { const ev = getEvent(evId); if (ev.increment.amount >= 100) { ev.increment.confirmed = true; touched(ev); commit(); } }

// ---- displays: draft vs applied -----------------------------------------------------------
export function applyDisplays(evId) {
  const ev = getEvent(evId); if (transient.applying[evId] && !transient.applying[evId].result) return false; // repeated clicks while an apply is pending do nothing; a failed one can be retried
  transient.applying[evId] = { startedAt: Date.now(), result: null };
  commit();
  const snapshot = clone(ev.displays.draft), fail = state.ui.simFail;
  setTimeout(() => {
    const t = transient.applying[evId]; if (!t) return;
    if (fail) transient.applying[evId] = { result: 'failed' };
    else { const e = getEvent(evId); if (e) { e.displays.applied = snapshot; e.displays.appliedAt = NOW; delete transient.applying[evId]; } }
    commit();
  }, 900);
  return true;
}
export function dismissApplyResult(evId) { delete transient.applying[evId]; commit(); }
export function discardDisplayDraft(evId) { const ev = getEvent(evId); ev.displays.draft = ev.displays.applied ? clone(ev.displays.applied) : defaultDisplay(); commit(); }

// ---- SMS (simulated) ----------------------------------------------------------------------
export const renderTemplate = (ev, text) => text.replaceAll('{code}', '482913').replaceAll('{event}', ev.name).replaceAll('{lot}', '03').replaceAll('{amount}', dollars(nextEligible(10000, 15000, ev.increment.amount)));
export function simulateTestMessage(evId, key) {
  const ev = getEvent(evId), t = ev.sms.templates[key];
  ev.sms.log.unshift({ id: uid('m'), at: NOW, kind: t.label, to: '(555) 010-0142', text: renderTemplate(ev, t.text) });
  ev.sms.log = ev.sms.log.slice(0, 20); ev.sms.tested = true; touched(ev); commit();
}

// ---- readiness review (a local stamp, not an approval) -----------------------------------
export function markReviewed(evId) {
  const ev = getEvent(evId), a = analyze(ev); if (!a.ready) return false;
  ev.review.reviewedAt = NOW; ev.review.fingerprint = fingerprint(ev); commit(); return true;
}
export const reviewState = (ev) => (!ev.review.reviewedAt ? 'never' : ev.review.fingerprint === fingerprint(ev) ? 'current' : 'stale');
export { smsChecks, lotNo };
