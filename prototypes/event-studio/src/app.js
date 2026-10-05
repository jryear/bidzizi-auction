// Event Studio controller: hash routing, shell, sheets as history entries, delegated events, preview wiring.
import * as S from './store.js';
import { state, getEvent, orderedEvents, commit, edit, transient } from './store.js';
import { displaySlides, analyze, sectionStatus, unassigned, previewData, clockOptions, newLot, validateLot, validateWindow, toCents, dollars, lotNo, plural, ORG, NOW_LABEL, eventLink, uid, validWindows, windowOf, validUrl, fmtDT, TZ, PHOTOS, photoSrc } from './model.js';
import { esc, icon, badge, circle, toast, ASSUME, simTag } from './ui.js';
import { href, SECTIONS, sectionLabel, progressSegments } from './views-common.js';
import * as Core from './views-core.js';
import * as Lots from './views-lots.js';
import * as Ev from './views-event.js';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#main'), sideEl = $('#side'), topEl = $('#top'), pvEl = $('#pv'), sheetEl = $('#sheet'), notesEl = $('#notes');
const view = { evId: null, sel: new Set(), search: '', incRaw: null, extopRaw: null, exLot: null, dispView: 'draft', play: false, flash: null, menu: false };
let route = { kind: 'events', q: new URLSearchParams() };
let sheet = null;           // the open sheet's runtime state
let afterPop = null;        // one-shot callback after a history.back() we triggered
let playTimer = null, lastPreviewEv = null, pvReady = false;

// ---- routing -------------------------------------------------------------------------------------
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/events';
  const [path, qstr = ''] = h.split('?'), q = new URLSearchParams(qstr), parts = path.split('/').filter(Boolean);
  if (parts[0] === 'e' && parts[1]) return getEvent(parts[1]) ? { kind: 'event', evId: parts[1], section: SECTIONS.some((s) => s.id === parts[2]) ? parts[2] : 'overview', q } : { kind: 'missing', evId: parts[1], q };
  return { kind: 'events', q };
}
const hashWithout = (key) => { const [p, qs = ''] = (location.hash.replace(/^#/, '') || '/events').split('?'), q = new URLSearchParams(qs); q.delete(key); const s = q.toString(); return `#${p}${s ? '?' + s : ''}`; };
const withSheet = (spec) => { const [p, qs = ''] = (location.hash.replace(/^#/, '') || '/events').split('?'), q = new URLSearchParams(qs); q.set('sheet', spec); return `#${p}?${q}`; };
const curEv = () => (route.kind === 'event' ? getEvent(route.evId) : null);
export const go = (hash) => { location.hash = hash; };

function onRoute({ popped = false } = {}) {
  const prev = route, was = sheet;
  route = parseHash();
  const switched = (prev.kind === 'event' ? prev.evId : null) !== (route.kind === 'event' ? route.evId : null);
  if (switched) resetView(route.kind === 'event' ? route.evId : null);
  // A sheet with unsaved changes is not closed by Back: put it back and ask.
  const want = route.q.get('sheet');
  if (popped && was?.dirty && !was.discarding && (!want || want !== was.spec)) { history.pushState({ sh: 1 }, '', withSheet(was.spec)); route = parseHash(); was.confirmClose = true; renderSheet(); announce('You have unsaved changes. Keep editing or discard them.'); return; }
  render({ main: true, routeChanged: switched || prev.section !== route.section || prev.kind !== route.kind });
  syncSheet();
  if (popped && afterPop) { const f = afterPop; afterPop = null; f(); }
}
function resetView(evId) {
  Object.assign(view, { evId, sel: new Set(), search: '', incRaw: null, extopRaw: null, exLot: null, dispView: 'draft', play: false, flash: null, menu: false });
  clearInterval(playTimer); playTimer = null;
}
const announce = (t) => { $('#live').textContent = ''; setTimeout(() => ($('#live').textContent = t), 20); };

// ---- rendering -----------------------------------------------------------------------------------
function captureFocus() {
  const a = document.activeElement; if (!a || a === document.body) return null;
  const key = a.id ? `#${a.id}` : a.dataset?.key ? `[data-key="${a.dataset.key}"]` : null; if (!key) return null;
  const root = a.closest('dialog') ? 'dialog' : a.closest('#main') ? '#main' : a.closest('#pv') ? '#pv' : a.closest('#top') ? '#top' : a.closest('#side') ? '#side' : a.closest('#notes') ? '#notes' : null;
  return root ? { root, key, s: a.selectionStart, e: a.selectionEnd } : null;
}
function restoreFocus(f) {
  if (!f) return; const el = $(`${f.root} ${f.key}`) || $(f.key); if (!el || el === document.activeElement) return;
  el.focus({ preventScroll: true }); try { if (f.s != null && el.setSelectionRange) el.setSelectionRange(f.s, f.e); } catch { /* not a text field */ }
}

function sideHtml(ev, a) {
  const brand = `<div class="brand-row"><a class="brand" href="#/events" aria-label="BidZizi Event Studio, all events">BidZizi</a><span class="brand-sub">Event Studio</span></div>`;
  const org = `<div class="orgpass">${circle(ORG.name, 38, true)}<span class="pass-text"><b>${esc(ORG.name)}</b><small>Staff view · simulated</small></span></div>`;
  if (!ev) return `${brand}${org}<nav aria-label="Studio"><a class="nav-i on" href="#/events" aria-current="page">${icon('folder')}<span>Events</span></a></nav>${sideFoot()}`;
  const groups = []; SECTIONS.forEach((s) => { let g = groups.find((x) => x.name === s.group); if (!g) groups.push((g = { name: s.group, items: [] })); g.items.push(s); });
  const un = unassigned(ev).length;
  const item = (s) => {
    const st = sectionStatus(a, s.id), nb = a.steps.filter((x) => x.section === s.id).reduce((n, x) => n + (x.tier === 'optional' && !x.started ? 0 : x.blockers.filter((b) => b.wrong).length), 0);
    const mark = s.id === 'readiness' ? (a.ready ? `<i class="nd done" aria-label="Ready">${icon('check', 'sm')}</i>` : a.wrong.length ? `<i class="nd attn" aria-label="${a.wrong.length} to fix">${a.wrong.length}</i>` : `<i class="nd count" aria-label="${a.blockers.length} left to do">${a.blockers.length}</i>`)
      : st === 'done' ? `<i class="nd done" aria-label="Done">${icon('check', 'sm')}</i>` : st === 'attention' ? `<i class="nd attn" aria-label="${nb || 1} need attention">${nb || '!'}</i>` : st === 'todo' ? '<i class="nd todo" aria-label="Not started"></i>' : '';
    const extra = s.id === 'lots' && un ? `<span class="nav-tag" title="${un} lots not in a bidding window">${un} unassigned</span>` : '';
    return `<a class="nav-i${route.section === s.id ? ' on' : ''}" href="${href(ev.id, s.id)}" ${route.section === s.id ? 'aria-current="page"' : ''} data-key="nav-${s.id}">${icon(s.ic)}<span>${s.label}</span>${extra}${mark}</a>`;
  };
  return `${brand}${org}
  <div class="evswitch"><button type="button" class="evbtn" data-action="menu" aria-haspopup="true" aria-expanded="${view.menu}" data-key="evbtn"><span class="lbl">Event</span><b>${esc(ev.name)}</b>${icon('chevron', 'sm')}</button>
    ${view.menu ? `<div class="menu" role="menu" aria-label="Switch event">${orderedEvents().map((e) => `<a role="menuitem" class="${e.id === ev.id ? 'cur' : ''}" href="${href(e.id, route.section)}" ${e.id === ev.id ? 'aria-current="true"' : ''}>${esc(e.name)}${e.id === ev.id ? icon('check', 'sm') : ''}</a>`).join('')}<hr><a role="menuitem" href="#/events">All events</a><button type="button" role="menuitem" data-action="event-new">${icon('plus', 'sm')} Create event</button></div>` : ''}</div>
  <nav aria-label="Event sections">${groups.map((g) => `<div class="nav-g">${g.name ? `<p class="nav-h">${g.name}</p>` : ''}${g.items.map(item).join('')}</div>`).join('')}</nav>${sideFoot()}`;
}
const sideFoot = () => `<div class="side-foot"><button type="button" class="btn-link light" data-action="notes" data-key="notes-btn">${icon('flag', 'sm')} Review notes</button><p>Prototype · fictional data · ${esc(NOW_LABEL)}</p></div>`;

function topHtml(ev, a) {
  if (!ev) return '';
  const nx = a.next, first = nx && (nx.issues.find((i) => i.sev === 'blocker') || nx.issues[0]), fix = first?.fix || (nx ? { section: nx.section, q: '' } : null);
  const nextBtn = nx ? (fix.section === 'preview' ? `<button type="button" class="btn sm primary" data-action="preview-open" data-key="top-next" title="${esc(nx.title)}">${esc(nx.short)}</button>` : `<a class="btn sm primary" href="${href(ev.id, fix.section, fix.q)}" data-key="top-next" title="${esc(nx.title)}">${esc(nx.short)}</a>`) : `<a class="btn sm quiet" href="${href(ev.id, 'readiness')}" data-key="top-next">Review readiness</a>`;
  return `<div class="top-in"><a class="top-prog" href="${href(ev.id, 'overview')}" aria-label="Setup progress: ${a.doneReq} of ${a.required.length} required steps done. Open checklist."><span class="lbl">Setup</span><span class="segs">${a.required.map((s) => `<i class="${s.done ? 'done' : s.status === 'attention' ? 'attn' : ''}"></i>`).join('')}</span><b>${a.doneReq} of ${a.required.length}</b></a>
    <div class="top-next"><span class="top-nl">${nx ? (nx.tier === 'required' ? 'Next' : 'Recommended') : 'All steps done'}</span>${nextBtn}</div>
    <div class="top-act"><span class="saved${S.flags.saveOk ? '' : ' bad'}" role="status">${S.flags.saveOk ? `${icon('check', 'sm')} Saved in this browser` : `${icon('alert', 'sm')} Not saved: storage unavailable`}</span><button type="button" class="btn sm quiet" data-action="preview-toggle" aria-pressed="${state.ui.preview}" aria-controls="pv" data-key="pv-btn">${icon('phone', 'sm')} Bidder preview</button></div></div>`;
}

function pageHtml(ev, a) {
  if (route.kind === 'events') return Ev.eventsList(orderedEvents());
  if (route.kind === 'missing') return `<div class="empty big"><h1 tabindex="-1" data-key="h1">That event doesn’t exist</h1><p>No event has the address “${esc(route.evId)}”. Nothing from another event is shown in its place.</p><div><a class="btn primary" href="#/events">Back to all events</a></div></div>`;
  switch (route.section) {
    case 'details': return Core.details(ev);
    case 'lots': return Lots.lots(ev, route.q, view);
    case 'windows': return Lots.windows(ev);
    case 'increments': return Core.increments(ev, view.exLot, view.extopRaw, view.incRaw);
    case 'access': return Ev.access(ev);
    case 'displays': return Ev.displays(ev, view);
    case 'notifications': return Ev.notifications(ev, S.renderTemplate);
    case 'donations': return Ev.donations(ev);
    case 'readiness': return Core.readiness(ev, a);
    default: return Core.overview(ev, a);
  }
}

function renderMain({ routeChanged = false } = {}) {
  const ev = curEv(), a = ev ? analyze(ev) : null, f = captureFocus(), sy = window.scrollY;
  main.innerHTML = pageHtml(ev, a);
  if (routeChanged) { window.scrollTo(0, 0); const h = $('h1', main); h?.focus({ preventScroll: true }); } else { window.scrollTo(0, sy); restoreFocus(f); }
  const target = route.q.get('at') ? $(`#sec-${route.q.get('at')}`) : view.flash ? $(`[data-lot="${view.flash}"]`) : null;
  if (target && (routeChanged || view.flash)) { target.scrollIntoView({ block: 'center' }); target.classList.add('flash'); view.flash = null; }
  document.title = ev ? `${sectionLabel(route.section)} · ${ev.name} · Event Studio` : route.kind === 'missing' ? 'Event not found · Event Studio' : 'Events · Event Studio';
  if (route.kind === 'event' && route.section === 'displays') setupPlay();
}
function renderChrome() {
  const ev = curEv(), a = ev ? analyze(ev) : null, f = captureFocus();
  sideEl.innerHTML = sideHtml(ev, a); topEl.innerHTML = topHtml(ev, a); topEl.hidden = !ev;
  document.body.dataset.pv = ev && state.ui.preview ? 'open' : 'closed';
  restoreFocus(f);
}

function render({ main: m = true, routeChanged = false } = {}) {
  renderChrome();
  if (m) renderMain({ routeChanged });
  renderPreview();
  renderNotes();
  const dp = $('#disp-preview'); if (dp && !m && curEv()) dp.innerHTML = Ev.displayPreview(curEv(), view);
}

// ---- bidder preview (an iframe that reuses prototype A's own stylesheet) -----------------------------------
function renderPreview() {
  const ev = curEv();
  if (!ev || !state.ui.preview) { pvEl.innerHTML = ''; pvEl.hidden = true; lastPreviewEv = null; pvReady = false; return; }
  pvEl.hidden = false;
  const fresh = lastPreviewEv !== ev.id || !$('iframe', pvEl);
  const data = previewData(ev, state.ui.rule), f = captureFocus();
  const opts = clockOptions(ev);
  const ctl = `<div class="pv-ctl"><div class="field"><label for="pv-clock">Pretend it’s…</label><select id="pv-clock" data-clock>${opts.map((o) => `<option value="${o.id}"${o.id === data.clock ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
    <div class="field"><label for="pv-rule">Lots in later windows ${ASSUME_BTN('S2')}</label><select id="pv-rule" data-rule><option value="first"${state.ui.rule === 'first' ? ' selected' : ''}>Catalog opens with the first window</option><option value="each"${state.ui.rule === 'each' ? ' selected' : ''}>Each lot appears when its window opens</option></select><p class="hint">Undecided. Both are examples, not rules.</p></div></div>`;
  const note = `<p class="pv-note" id="pv-note">${data.hiddenCount ? `${icon('alert', 'sm')} ${plural(data.hiddenCount, 'lot')} hidden from bidders: not in a bidding window.` : ev.lots.length ? `${icon('check', 'sm')} Every lot is in a window.` : 'No lots yet.'}${!data.catalogOpen && ev.lots.length && data.totalAssigned ? ' Before bidding opens, bidders see only the welcome page.' : ''}</p>`;
  if (fresh) {
    pvEl.innerHTML = `<div class="pv-head"><div><h2>Bidder preview</h2><p>Phone · your draft, not published</p></div><button type="button" class="x" data-action="preview-close" aria-label="Close preview">${icon('close')}</button></div><div id="pv-ctl-host">${ctl}</div>
      <div class="phone"><iframe id="pv-frame" src="preview.html" title="Mobile bidder preview" width="390" height="780"></iframe></div><div id="pv-note-host">${note}</div>`;
    pvReady = false; lastPreviewEv = ev.id;
  } else { $('#pv-ctl-host', pvEl).innerHTML = ctl; $('#pv-note-host', pvEl).innerHTML = note; restoreFocus(f); }
  postPreview(fresh);
}
const ASSUME_BTN = (id) => `<button type="button" class="assume" data-assume aria-expanded="false" aria-label="Assumption ${id}: ${esc(ASSUME[id][0])}">${id}</button><span class="assume-note" hidden><b>Assumption ${id} · ${esc(ASSUME[id][0])}.</b> ${esc(ASSUME[id][1])}</span>`;
function postPreview(reset = false) {
  const ev = curEv(), fr = $('#pv-frame'); if (!ev || !fr?.contentWindow || (!pvReady && !reset)) return;
  fr.contentWindow.postMessage({ type: 'data', data: previewData(ev, state.ui.rule), reset }, location.origin);
}
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || !e.data) return;
  if (e.data.type === 'ready') { pvReady = true; postPreview(true); }
  if (e.data.type === 'screen' && ['lots', 'lot'].includes(e.data.name)) { const ev = curEv(); if (ev && previewData(ev, state.ui.rule).lots.length && !ev.review.previewed) { ev.review.previewed = true; commit({ main: false }); } }
});

// ---- review notes rail -----------------------------------------------------------------------------------
function renderNotes() {
  notesEl.hidden = !state.ui.notes; document.body.dataset.notes = state.ui.notes ? 'open' : 'closed';
  if (!state.ui.notes) { notesEl.innerHTML = ''; return; }
  if (notesEl.dataset.built === '1' && $('#notes-body', notesEl)) { return; }
  notesEl.dataset.built = '1';
  notesEl.innerHTML = `<div class="n-head"><span class="p-tag">Prototype only</span><button type="button" class="x light" data-action="notes" aria-label="Close review notes">${icon('close')}</button></div><h2>Review notes</h2>
    <p class="p-lede">Browser-local simulation with fictional data. Nothing is saved to a server, sent, published or charged.</p>
    <div id="notes-body"><h3>Controls</h3>
      <label class="p-check"><input type="checkbox" data-markers ${state.ui.markers === false ? '' : 'checked'}> Show assumption markers (S1–S12)</label>
      <label class="p-check"><input type="checkbox" data-simfail ${state.ui.simFail ? 'checked' : ''}> Make the next display Apply fail</label>
      <button type="button" data-action="reset-all" class="danger">Reset all prototype data…</button>
      <h3>Provisional assumption to review first</h3><p class="p-q"><b>S1 · One bidding window per lot.</b><span> Provisional so staff can assign lots simply. Whether a lot can be in several windows, relisted, or rescheduled after approval is undecided and not simulated.</span></p>
      <h3>Open decisions</h3><dl class="p-assume">${Object.entries(ASSUME).map(([k, [t, x]]) => `<div><dt><b>${k}</b> ${esc(t)}</dt><dd>${esc(x)}</dd></div>`).join('')}</dl>
      <h3>Not simulated</h3><ul class="p-list"><li>Real payment, donations, or money movement</li><li>Sending any SMS</li><li>Real screens, devices or a deployed event link</li><li>Staff sign-in, roles, approval and publish</li><li>Bidding itself (see prototype A)</li></ul>
      <h3>Prototype facts</h3><p class="p-fine">Clock fixed at ${esc(NOW_LABEL)} ${TZ}. Storage key <code>${S.KEY}</code>. Photos and lot copy adapted from prototype A’s fixtures; image licensing unverified.</p></div>`;
}

// ---- sheets ---------------------------------------------------------------------------------------------------
function buildSheet(ev, spec) {
  const [kind, id] = spec.split(':');
  if (kind === 'lot') { if (id === 'new') return { spec, kind, isNew: true, draft: newLot(ev, { openingRaw: '100' }) }; const l = ev.lots.find((x) => x.id === id); return l ? { spec, kind, isNew: false, draft: { ...l, openingRaw: String(l.opening / 100) } } : null; }
  if (kind === 'window') { if (id === 'new') return { spec, kind, isNew: true, draft: { id: uid('win'), name: '', opens: '', closes: '' } }; const w = ev.windows.find((x) => x.id === id); return w ? { spec, kind, isNew: false, draft: { ...w } } : null; }
  if (kind === 'assign') { const w = ev.windows.find((x) => x.id === id); return w ? { spec, kind, win: w, picked: new Set(ev.lots.filter((l) => l.windowId === w.id).map((l) => l.id)) } : null; }
  if (['categories', 'print', 'present'].includes(kind)) return { spec, kind };
  return null;
}
function syncSheet() {
  const ev = curEv(), spec = route.q.get('sheet');
  if (spec === 'create-event') { if (sheet?.spec !== spec) sheet = { spec, kind: 'create-event', draft: { name: '', date: '' }, errs: {} }; return openDialog(); }
  if (!spec || !ev) { if (sheet) closeDialog(); return; }
  if (sheet?.spec === spec && sheet.evId === ev.id) return openDialog();
  const s = buildSheet(ev, spec);
  if (!s) { closeDialog(); history.replaceState(null, '', hashWithout('sheet')); toast('That item isn’t in this event.', { tone: 'red' }); return; }
  sheet = { ...s, evId: ev.id, errs: {}, dirty: false, confirmClose: false }; openDialog();
}
function sheetHtml() {
  const ev = curEv(); if (!sheet) return '';
  switch (sheet.kind) {
    case 'create-event': return Lots.sheetCreateEvent(sheet.draft, sheet.errs);
    case 'lot': return Lots.sheetLot(ev, sheet.draft, sheet.errs, sheet);
    case 'window': return Lots.sheetWindow(ev, sheet.draft, sheet.errs, sheet);
    case 'assign': return Lots.sheetAssign(ev, ev.windows.find((w) => w.id === sheet.win.id) || sheet.win, sheet.picked);
    case 'categories': return Lots.sheetCategories(ev, sheet.err, sheet.rowErr);
    case 'print': return Ev.sheetPrint(ev);
    case 'present': return Ev.sheetPresent(ev);
    default: return '';
  }
}
function syncDraft() {
  // Keep what is typed when the sheet re-renders (validation, discard prompt, photo pick).
  if (sheet.kind === 'lot' && $('#lot-form')) sheet.draft = readLot();
  else if (sheet.kind === 'window' && $('#win-form')) { const f = formData('#win-form'); sheet.draft = { ...sheet.draft, name: f.name ?? '', opens: f.opens ?? '', closes: f.closes ?? '' }; }
  else if (sheet.kind === 'create-event' && $('#ev-form')) { const f = formData('#ev-form'); sheet.draft = { name: f.name ?? '', date: f.date ?? '' }; }
}
function renderSheet(sync = true) { if (!sheet) return; if (sync) syncDraft(); const f = captureFocus(), sc = $('.sheet-scroll', sheetEl)?.scrollTop || 0; sheetEl.innerHTML = sheetHtml(); sheetEl.dataset.kind = sheet.kind; const s2 = $('.sheet-scroll', sheetEl); if (s2) s2.scrollTop = sc; restoreFocus(f); }
function openDialog() {
  renderSheet();
  if (!sheetEl.open) { sheetEl.showModal(); document.documentElement.classList.add('sheet-open'); const first = $('[data-key="first"], input:not([type=hidden]):not([readonly]), textarea, h2[tabindex]', sheetEl); (sheet.kind === 'present' ? $('[data-key="stop"]', sheetEl) : $('input[type=text], input[type=date], input[type=datetime-local], textarea, input[type=checkbox]', sheetEl) || first)?.focus(); }
}
function closeDialog() { if (sheetEl.open) sheetEl.close(); document.documentElement.classList.remove('sheet-open'); sheetEl.innerHTML = ''; sheet = null; }
function openSheet(spec) { history.pushState({ sh: 1 }, '', withSheet(spec)); onRoute(); }
function closeSheet({ force = false, then = null } = {}) {
  if (!sheet) return;
  if (!force && sheet.dirty) { sheet.confirmClose = true; renderSheet(); announce('You have unsaved changes. Keep editing or discard them.'); return; }
  sheet.discarding = true;
  if (history.state?.sh) { afterPop = then; history.back(); } else { history.replaceState(null, '', hashWithout('sheet')); onRoute(); then?.(); }
}
sheetEl.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl && sheet?.kind !== 'present') closeSheet(); });

// ---- form helpers -------------------------------------------------------------------------------------------------
const formData = (id) => Object.fromEntries(new FormData($(id)));
function showFieldError(id, msg) { const el = $(`#err-${id}`); if (!el) return; el.textContent = msg || ''; el.hidden = !msg; const inp = $(`#${id}`); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); } }
const setPath = (o, path, v) => { const k = path.split('.'); let t = o; while (k.length > 1) t = t[k.shift()]; t[k[0]] = v; };

function readLot() {
  const f = formData('#lot-form'), d = sheet.draft;
  return { ...d, title: f.title ?? '', short: f.short ?? '', description: f.description ?? '', categoryId: f.categoryId || null, windowId: f.windowId || null, sponsorId: f.sponsorId || null, opening: toCents(f.opening ?? ''), openingRaw: f.opening ?? '' };
}
function saveLotSheet(another = false) {
  const draft = readLot(), ev = curEv(), r = S.saveLot(ev.id, { ...draft, openingRaw: undefined });
  if (!r.ok) { sheet.draft = draft; sheet.errs = r.errors; renderSheet(); const first = ['title', 'opening', 'short', 'description'].find((k) => r.errors[k]); $({ title: '#l-title', opening: '#l-open', short: '#l-short', description: '#l-desc' }[first])?.focus(); announce(Object.values(r.errors)[0]); return; }
  toast(sheet.isNew ? `Added Lot ${lotNo(r.lot.number)}.` : `Saved Lot ${lotNo(r.lot.number)}.`);
  view.flash = r.lot.id;
  if (another) { sheet.draft = newLot(curEv(), { openingRaw: '100' }); sheet.errs = {}; sheet.dirty = false; sheet.isNew = true; renderSheet(false); $('#l-title')?.focus(); return; }
  closeSheet({ force: true });
}
function saveWindowSheet() {
  const f = formData('#win-form'), draft = { ...sheet.draft, name: f.name ?? '', opens: f.opens ?? '', closes: f.closes ?? '' }, r = S.saveWindow(sheet.evId, draft);
  if (!r.ok) { sheet.draft = draft; sheet.errs = r.errors; renderSheet(); $(`#${r.errors.name ? 'w-name' : r.errors.opens ? 'w-open' : 'w-close'}`)?.focus(); announce(Object.values(r.errors)[0]); return; }
  toast(`${sheet.isNew ? 'Added' : 'Saved'} “${r.window.name}”.`); closeSheet({ force: true });
}

// ---- actions ----------------------------------------------------------------------------------------------------------
const evId = () => route.evId;
const selected = () => [...view.sel];
function undoToast(msg) { toast(msg, { action: { label: 'Undo', run: () => { S.undo() && toast('Undone.'); } } }); }

const actions = {
  menu() { view.menu = !view.menu; renderChrome(); if (view.menu) $('.menu a', sideEl)?.focus(); },
  notes() { state.ui.notes = !state.ui.notes; commit({ main: false }); if (!state.ui.notes) $('[data-key="notes-btn"]')?.focus(); },
  'preview-toggle'() { state.ui.preview = !state.ui.preview; commit({ main: false }); },
  'preview-open'() { state.ui.preview = true; commit({ main: false }); setTimeout(() => $('#pv-clock')?.focus(), 30); },
  'preview-close'() { state.ui.preview = false; commit({ main: false }); $('[data-key="pv-btn"]')?.focus(); },
  'reset-all'() { if (!confirm('Reset every event and setting in this prototype to the starting examples?')) return; S.resetAll(); state.ui.notes = true; history.replaceState(null, '', '#/events'); onRoute(); toast('Prototype data reset.'); },
  hero(t) { edit(evId(), (e) => { e.details.heroImage = t.dataset.id || null; }); },
  'sponsor-remove'(t) { const ev = curEv(), s = ev.sponsors.find((x) => x.id === t.dataset.id); S.removeSponsor(ev.id, t.dataset.id); undoToast(`Removed ${s?.name}.`); },
  'confirm-increment'() { S.confirmIncrement(evId()); toast(`Confirmed ${dollars(curEv().increment.amount)} increments.`); },
  'inc-preset'(t) { view.incRaw = null; S.setIncrement(evId(), Number(t.dataset.cents)); renderMain(); },
  'mark-reviewed'() { if (S.markReviewed(evId())) toast('Marked as reviewed. Nothing was published or sent.'); },
  'assign-unassigned'(t) { const sel = t.closest('.quickfix, .alertband, section')?.querySelector('select[data-quick-window]') || $('select[data-quick-window]'); const w = curEv().windows.find((x) => x.id === sel?.value); if (!w) return toast('Choose a window first.', { tone: 'red' }); const n = S.assignAllUnassigned(evId(), w.id); undoToast(`${plural(n, 'lot')} assigned to “${w.name}”.`); },
  // lots
  'lot-new'() { openSheet('lot:new'); }, 'lot-edit'(t) { openSheet(`lot:${t.dataset.id}`); },
  'lot-dup'(t) { const r = S.duplicateLot(evId(), t.dataset.id); if (!r || r.skipped) return; view.flash = r.lot.id; undoToast(`Duplicated as Lot ${lotNo(r.lot.number)}.`); renderMain(); },
  'lot-del'(t) { const ev = curEv(), l = ev.lots.find((x) => x.id === t.dataset.id); S.deleteLots(ev.id, [t.dataset.id]); view.sel.delete(t.dataset.id); undoToast(`Deleted Lot ${lotNo(l.number)}.`); },
  'lot-save'() { saveLotSheet(false); }, 'lot-save-another'() { saveLotSheet(true); },
  'sheet-photo'(t) { const d = readLot(); d.image = t.dataset.id || null; sheet.draft = d; sheet.dirty = true; renderSheet(); },
  'bulk-window'() { const v = $('[data-bulk-win]').value; if (!v) return toast('Choose a window first.', { tone: 'red' }); const w = curEv().windows.find((x) => x.id === v); const n = S.bulkSet(evId(), selected(), { windowId: v === '_none' ? null : v }); view.sel = new Set(); undoToast(v === '_none' ? `${plural(n, 'lot')} removed from their windows.` : `${plural(n, 'lot')} assigned to “${w.name}”.`); },
  'bulk-category'() { const v = $('[data-bulk-cat]').value; if (!v) return toast('Choose a category first.', { tone: 'red' }); const c = curEv().categories.find((x) => x.id === v); const n = S.bulkSet(evId(), selected(), { categoryId: v === '_none' ? null : v }); view.sel = new Set(); undoToast(v === '_none' ? `${plural(n, 'lot')} now have no category.` : `${plural(n, 'lot')} set to “${c.name}”.`); },
  'bulk-dup'() { const ids = selected(); if (!ids.length) return; let n = 0; ids.forEach((id) => { transient.lastDup = { id: '', at: 0 }; if (S.duplicateLot(evId(), id)?.lot) n++; }); view.sel = new Set(); undoToast(`Duplicated ${plural(n, 'lot')}.`); },
  'bulk-del'() { const ids = selected(); const n = S.deleteLots(evId(), ids); view.sel = new Set(); undoToast(`Deleted ${plural(n, 'lot')}.`); },
  'bulk-clear'() { view.sel = new Set(); renderMain(); },
  'clear-search'() { view.search = ''; },
  categories() { openSheet('categories'); },
  'cat-del'(t) { const ev = curEv(), c = ev.categories.find((x) => x.id === t.dataset.id); S.deleteCategory(ev.id, t.dataset.id); sheet.rowErr = {}; renderSheet(); undoToast(`Deleted category “${c.name}”.`); },
  // windows
  'win-new'() { openSheet('window:new'); }, 'win-edit'(t) { openSheet(`window:${t.dataset.id}`); }, 'win-assign'(t) { openSheet(`assign:${t.dataset.id}`); },
  'win-del'(t) { const ev = curEv(), w = ev.windows.find((x) => x.id === t.dataset.id), n = S.deleteWindow(ev.id, w.id); undoToast(`Deleted “${w.name}”.${n ? ` ${plural(n, 'lot')} became unassigned.` : ''}`); },
  'win-save'() { saveWindowSheet(); },
  'assign-save'() { const ids = [...sheetEl.querySelectorAll('input[name=lot]:checked')].map((i) => i.value); S.setWindowLots(sheet.evId, sheet.win.id, ids); toast(`${plural(ids.length, 'lot')} in “${sheet.win.name}”.`); closeSheet({ force: true }); },
  'assign-all-un'() { const ev = curEv(); sheetEl.querySelectorAll('input[name=lot]').forEach((i) => { const l = ev.lots.find((x) => x.id === i.value); if (l && !windowOf(ev, l)) i.checked = true; }); sheet.dirty = true; },
  // events and sheets
  'event-new'() { view.menu = false; openSheet('create-event'); },
  'event-create'() { const f = formData('#ev-form'); sheet.draft = { name: f.name || '', date: f.date || '' }; const r = S.createEvent(sheet.draft.name, sheet.draft.date); if (!r.ok) { sheet.errs = { name: r.error }; renderSheet(); $('#c-name')?.focus(); return; } toast(`Created “${sheet.draft.name.trim()}”. Start with the checklist.`); sheet.dirty = false; closeSheet({ force: true, then: () => go(href(r.id, 'overview')) }); },
  'sheet-close'() { closeSheet(); }, 'sheet-keep'() { sheet.confirmClose = false; renderSheet(); }, 'sheet-discard'() { closeSheet({ force: true }); },
  // access
  async 'copy-link'() { const l = eventLink(curEv()); try { await navigator.clipboard.writeText(l); toast('Link copied.'); } catch { $('#a-link')?.select(); toast('Select the link and copy it: this browser blocked clipboard access.'); } },
  'print-qr'() { edit(evId(), (e) => { e.access.shared = true; }, { main: false }); openSheet('print'); }, 'present-qr'() { edit(evId(), (e) => { e.access.shared = true; }, { main: false }); openSheet('present'); },
  'print-now'() { edit(evId(), (e) => { e.access.shared = true; }, { main: false }); window.print(); },
  fullscreen() { edit(evId(), (e) => { e.access.shared = true; }, { main: false }); (sheetEl.requestFullscreen?.() || Promise.resolve()).catch(() => toast('Full screen isn’t available here.')); },
  // displays
  'disp-apply'() { S.applyDisplays(evId()); }, 'disp-dismiss'() { S.dismissApplyResult(evId()); },
  'disp-discard'() { S.discardDisplayDraft(evId()); toast('Draft reset to what’s on screens.'); },
  'disp-view'(t) { view.dispView = t.dataset.v; renderMain(); },
  'disp-theme'(t) { edit(evId(), (e) => { e.displays.draft.theme = t.dataset.v; }); },
  slide(t) { edit(evId(), (e) => { e.ui.slide = t.dataset.s; }, { main: false }); },
  'lot-step'(t) { edit(evId(), (e) => { e.ui.lotIdx = ((e.ui.lotIdx || 0) + Number(t.dataset.d) + 1000) % Math.max(1, e.lots.filter((l) => windowOf(e, l)).length); }, { main: false }); },
  play() { view.play = !view.play; setupPlay(); renderMain(); },
  // sms
  'sms-test'(t) { S.simulateTestMessage(evId(), t.dataset.k); toast('Simulated: this message was not sent.'); },
};
function setupPlay() {
  clearInterval(playTimer); playTimer = null; const ev = curEv(); if (!view.play || !ev) return;
  playTimer = setInterval(() => { const e = curEv(); if (!e || route.section !== 'displays') return; const cfg = view.dispView === 'applied' ? e.displays.applied : e.displays.draft; if (!cfg) return; const sl = displaySlides(e, cfg); if (!sl.length) return; const i = sl.indexOf(e.ui.slide); edit(e.id, (x) => { x.ui.slide = sl[(i + 1) % sl.length]; }, { main: false }); }, (ev.displays.draft.seconds || 10) * 1000);
}

// ---- delegated events -------------------------------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (t && actions[t.dataset.action]) { if (t.tagName !== 'A') e.preventDefault(); actions[t.dataset.action](t, e); return; }
  const a = e.target.closest('[data-assume]'); if (a) { const note = a.nextElementSibling; note.hidden = !note.hidden; a.setAttribute('aria-expanded', String(!note.hidden)); return; }
  if (view.menu && !e.target.closest('.evswitch')) { view.menu = false; renderChrome(); }
  if (e.target.closest('.menu a')) { view.menu = false; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (view.menu) { view.menu = false; renderChrome(); $('[data-key="evbtn"]')?.focus(); } else if (state.ui.notes && !sheet) { state.ui.notes = false; commit({ main: false }); } }
  if (e.key === 'Enter' && e.target.matches('#lot-form input')) { e.preventDefault(); saveLotSheet(false); }
  if (e.key === 'Enter' && e.target.matches('#win-form input')) { e.preventDefault(); saveWindowSheet(); }
  if (e.key === 'Enter' && e.target.matches('#ev-form input')) { e.preventDefault(); actions['event-create'](); }
  if (e.key === 'Enter' && e.target.matches('[data-cat-name]')) { e.preventDefault(); e.target.blur(); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form'); if (!f) return; e.preventDefault();
  if (f.dataset.form === 'lot') saveLotSheet(false);
  else if (f.dataset.form === 'window') saveWindowSheet();
  else if (f.dataset.form === 'create-event') actions['event-create']();
  else if (f.dataset.form === 'assign') actions['assign-save']();
  else if (f.dataset.form === 'sponsor') { const inp = f.elements.name, err = S.addSponsor(evId(), inp.value); if (err) { $('#err-f-sp').textContent = err; $('#err-f-sp').hidden = false; inp.setAttribute('aria-invalid', 'true'); inp.focus(); } else { toast(`Added ${inp.value.trim()}.`); setTimeout(() => $('#f-sp')?.focus(), 0); } }
  else if (f.dataset.form === 'category') { const inp = f.elements.name, err = S.addCategory(evId(), inp.value); sheet.err = err; const keep = err ? inp.value : ''; renderSheet(); const n = $('#c-new'); if (n) { n.value = keep; n.focus(); } if (!err) toast('Category added.'); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (sheet && t.closest('dialog') && (t.closest('form[data-form="lot"]') || t.closest('form[data-form="window"]') || t.closest('form[data-form="assign"]'))) { sheet.dirty = true; if (sheet.kind === 'lot' || sheet.kind === 'window') { $('#dirty-bar')?.remove(); sheet.confirmClose = false; } }
  if (sheet?.kind === 'create-event' && t.closest('#ev-form')) sheet.dirty = !!t.value || sheet.dirty;
  if (t.matches('[data-bind]')) {
    const path = t.dataset.bind, ev = curEv();
    if (path === 'name') { const err = S.setEventName(ev.id, t.value); showFieldError('f-name', err); return; }
    edit(ev.id, (x) => setPath(x, path, t.value), { main: false });
    const c = $(`[data-counter="${path}"]`); if (c) c.textContent = t.value.length;
    if (path.startsWith('details.')) showFieldError('f-end', Core.timeError(curEv().details));
    if (path === 'donations.url') showFieldError('dn-url', t.value && !validUrl(t.value) ? 'Use a full address beginning with https://' : !t.value ? 'Add the address of your donation page.' : '');
    if (path === 'donations.label') { const b = $('.linkrow.demo b'); if (b) b.textContent = t.value || 'Donate'; }
  } else if (t.matches('[data-inc]')) { view.incRaw = t.value; S.setIncrement(evId(), /^\d+$/.test(t.value.trim()) ? Number(t.value.trim()) * 100 : 0); renderMain(); }
  else if (t.matches('[data-extop]')) { view.extopRaw = t.value; renderMain(); }
  else if (t.matches('[data-search]')) { view.search = t.value; renderMain(); }
  else if (t.matches('[data-tpl]')) { const k = t.dataset.tpl, ev = curEv(); edit(ev.id, (x) => { x.sms.templates[k].text = t.value; x.sms.templates[k].confirmed = false; }, { main: false }); renderMain(); }
  else if (t.matches('[data-cat-name]')) { /* applied on change */ }
});
document.addEventListener('change', (e) => {
  const t = e.target, ev = curEv();
  if (t.matches('[data-sel]')) { t.checked ? view.sel.add(t.value) : view.sel.delete(t.value); renderMain(); }
  else if (t.matches('[data-sel-all]')) { const shown = Lots.filterLots(ev, route.q, view.search); shown.forEach((l) => (t.checked ? view.sel.add(l.id) : view.sel.delete(l.id))); renderMain(); }
  else if (t.matches('[data-lot-cat]')) { const l = ev.lots.find((x) => x.id === t.dataset.lotCat); S.bulkSet(ev.id, [l.id], { categoryId: t.value || null }); undoToast(t.value ? `Lot ${lotNo(l.number)} set to “${ev.categories.find((c) => c.id === t.value).name}”.` : `Lot ${lotNo(l.number)} has no category.`); }
  else if (t.matches('[data-lot-win]')) { const l = ev.lots.find((x) => x.id === t.dataset.lotWin); S.bulkSet(ev.id, [l.id], { windowId: t.value || null }); undoToast(t.value ? `Lot ${lotNo(l.number)} assigned to “${ev.windows.find((w) => w.id === t.value).name}”.` : `Lot ${lotNo(l.number)} is now unassigned.`); }
  else if (t.matches('[data-filter]')) { const q = new URLSearchParams(route.q); q.delete('sheet'); t.value ? q.set(t.dataset.filter, t.value) : q.delete(t.dataset.filter); go(`#/e/${ev.id}/lots${q.toString() ? '?' + q : ''}`); }
  else if (t.matches('[data-exlot]')) { view.exLot = t.value; renderMain(); }
  else if (t.matches('[data-cat-name]')) { const err = S.renameCategory(ev.id, t.dataset.catName, t.value); if (err) { sheet.rowErr = { [t.dataset.catName]: err }; renderSheet(); } else { sheet.rowErr = {}; showFieldError(`cn-${t.dataset.catName}`, ''); } }
  else if (t.matches('[data-disp]')) { const k = t.dataset.disp; edit(ev.id, (x) => { x.displays.draft[k] = t.type === 'checkbox' ? t.checked : k === 'seconds' ? Number(t.value) : t.value; }); if (k === 'seconds') setupPlay(); }
  else if (t.matches('[data-sms-sender]')) { edit(ev.id, (x) => { x.sms.senderRegistered = t.checked; }); }
  else if (t.matches('[data-tpl-ok]')) { edit(ev.id, (x) => { x.sms.templates[t.dataset.tplOk].confirmed = t.checked; }); }
  else if (t.matches('[data-dmode]')) { edit(ev.id, (x) => { x.donations.mode = t.value; }); }
  else if (t.matches('[data-clock]')) { edit(ev.id, (x) => { x.ui.clock = t.value; }, { main: false }); }
  else if (t.matches('[data-rule]')) { state.ui.rule = t.value; commit({ main: false }); }
  else if (t.matches('[data-markers]')) { state.ui.markers = t.checked; document.body.classList.toggle('no-assume', !t.checked); commit({ main: false }); }
  else if (t.matches('[data-simfail]')) { state.ui.simFail = t.checked; commit({ main: false }); }
});
document.addEventListener('focusin', (e) => { if (e.target.matches('[data-select-all]')) e.target.select(); });
window.addEventListener('hashchange', () => onRoute());
window.addEventListener('popstate', () => onRoute({ popped: true }));
window.addEventListener('storage', (e) => { if (e.key === S.KEY && e.newValue) { S.reloadFromStorage(); onRoute(); } });
window.addEventListener('beforeprint', () => document.documentElement.classList.add('printing'));
window.addEventListener('afterprint', () => document.documentElement.classList.remove('printing'));

S.subscribe(({ main: m }) => {
  const ev = curEv(); if (route.kind === 'event' && !ev) { onRoute(); return; }
  render({ main: m });
  if (sheet && ['categories', 'assign'].includes(sheet.kind) && m) renderSheet();
});

// ---- boot --------------------------------------------------------------------------------------------------------------------
document.body.classList.toggle('no-assume', state.ui.markers === false);
const note = S.takeLoadNote();
route = parseHash(); resetView(route.kind === 'event' ? route.evId : null);
render({ main: true, routeChanged: true }); syncSheet();
if (note) toast(note, { tone: 'red' });
window.__studio = { state, S }; // for the evidence walker only
