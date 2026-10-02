import { event, lotById } from './data.js';
import * as S from './store.js';
import { views, lotView, tabbar } from './views.js';
import { sheetFor, refreshBid, validate, draftFor } from './sheets.js';
import { panelHtml } from './panel.js';
import { money, toast } from './ui.js';

const $ = (s) => document.querySelector(s);
const viewEl = $('#view'), shell = $('#shell'), tabEl = $('#tabbar'), dlg = $('#sheet'), proto = $('#proto');
const INC = event.increment;
history.scrollRestoration = 'manual';

// ---- routing -------------------------------------------------------------------------------
const parse = () => {
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const m = path.match(/^\/lot\/([\w-]+)$/);
  return { path, q: new URLSearchParams(qs), name: m ? 'lot' : path === '/' ? 'entry' : path.slice(1), id: m?.[1] };
};
let route = parse();
const TAB_ROOTS = new Set(['lots', 'bids', 'event']);
const idx = () => history.state?.i ?? 0;

function navigate(to, { replace = false, sheet = false } = {}) {
  const st = { i: replace ? idx() : idx() + 1, sheet };
  history[replace ? 'replaceState' : 'pushState'](st, '', '#' + to);
  onRoute(replace ? 'replace' : 'push');
}
const sheetUrl = (kind, lot) => `${route.path}?sheet=${kind}${lot ? `&lot=${lot}` : ''}`;
const openSheet = (kind, lot) => navigate(sheetUrl(kind, lot), { sheet: true });
const swapSheet = (kind, lot) => navigate(sheetUrl(kind, lot), { replace: true, sheet: history.state?.sheet });
function closeSheet() {
  if (history.state?.sheet) history.back();
  else navigate(route.path, { replace: true });
}

// ---- scroll memory: anchored to the first visible card, so it survives content height changes ----
const mem = JSON.parse(sessionStorage.getItem('lanyard.scroll') || '{}');
const inset = () => (document.querySelector('.pass, .topbar')?.getBoundingClientRect().height ?? 0) + 4;
function saveScroll() {
  if (restoring) return;
  const anchors = [...viewEl.querySelectorAll('[data-anchor]')];
  const a = anchors.find((el) => el.getBoundingClientRect().bottom > inset());
  mem[route.path] = { y: scrollY, id: a?.dataset.anchor, off: a ? a.getBoundingClientRect().top : 0 };
  sessionStorage.setItem('lanyard.scroll', JSON.stringify(mem));
}
let restoring = false, raf = 0;
addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(saveScroll); }, { passive: true });
function restoreScroll(path) {
  const s = mem[path];
  restoring = true;
  const apply = () => {
    if (!s) return scrollTo(0, 0);
    const el = s.id && viewEl.querySelector(`[data-anchor="${s.id}"]`);
    scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - s.off : s.y);
  };
  apply();
  document.fonts?.ready.then(() => { apply(); restoring = false; });
  setTimeout(() => { restoring = false; }, 400);
}

function onRoute(kind) {
  route = parse();
  if (route.name === 'lot' && lotById(route.id) && S.state.lastViewed !== route.id) { S.state.lastViewed = route.id; S.commit(); }
  const sameScreen = kind === 'replace';
  render({ keepScroll: sameScreen });
  if (sameScreen) return;
  if (kind === 'pop' || kind === 'boot' || TAB_ROOTS.has(route.name)) restoreScroll(route.path);
  else scrollTo(0, 0);
  if (!route.q.get('sheet')) focusAfterNav(kind);
  if (kind === 'pop' && route.name === 'lots' && S.state.lastViewed) {
    const c = viewEl.querySelector(`[data-lot="${S.state.lastViewed}"]`);
    c?.classList.add('was-here'); setTimeout(() => c?.classList.remove('was-here'), 1600);
  }
}
function focusAfterNav(kind) {
  const lastCard = kind === 'pop' && route.name === 'lots' && S.state.lastViewed && viewEl.querySelector(`[data-key="lot-${S.state.lastViewed}"]`);
  (lastCard || viewEl.querySelector('[data-key="h1"]'))?.focus({ preventScroll: true });
}

// ---- rendering -----------------------------------------------------------------------------
/** Re-render the screen from state. Scroll position and focus survive a re-render triggered by state change. */
function render({ keepScroll = true } = {}) {
  route = parse();
  const v = route.name === 'lot' ? lotView(route.id) : (views[route.name] || views.lots)(route);
  const y = scrollY, ae = document.activeElement;
  const fk = ae && (viewEl.contains(ae) || tabEl.contains(ae)) ? ae.dataset?.key : null;
  viewEl.innerHTML = v.html;
  shell.dataset.chrome = v.chrome;
  document.body.dataset.chrome = v.chrome;
  tabEl.innerHTML = tabbar(v.tab);
  document.title = `${v.title} · BidZizi prototype`;
  document.body.classList.toggle('no-assume', !S.state.sim.assumptions);
  if (keepScroll) scrollTo(0, y);
  if (fk) (viewEl.querySelector(`[data-key="${CSS.escape(fk)}"]`) || tabEl.querySelector(`[data-key="${CSS.escape(fk)}"]`))?.focus({ preventScroll: true });
  renderSheet();
  const editing = proto.contains(document.activeElement) && /SELECT|INPUT/.test(document.activeElement.tagName);
  if (!editing) proto.innerHTML = panelHtml(route);
}

let sheetMode = null, sheetLot = null;
function renderSheet() {
  const s = sheetFor(route.q);
  if (!s) {
    if (dlg.open) { dlg.close(); }
    if (sheetMode?.startsWith('bid') && S.state.outbox.some((e) => e.status === 'accepted')) queueMicrotask(S.pruneAccepted);
    sheetMode = null; return;
  }
  const mode = s.kind + ':' + (s.kind === 'bid' ? bidMode(s.lot) : s.kind === 'identity' ? S.state.flow.step || 'phone' : '');
  dlg.dataset.lot = s.lot || '';
  if (!dlg.open) { dlg.showModal(); }
  if (mode === sheetMode && s.lot === sheetLot) {
    if (mode === 'bid:form') { refreshBid(dlg); return; }
    if (mode.startsWith('identity')) return; // never clobber what someone is typing
  }
  const hadFocusInside = dlg.contains(document.activeElement);
  dlg.innerHTML = `<div class="sheet-in" aria-labelledby="sheet-title">${s.html}</div>`;
  if (sheetMode !== mode || !hadFocusInside) dlg.querySelector('#sheet-title')?.focus({ preventScroll: true });
  sheetMode = mode; sheetLot = s.lot;
}
function bidMode(lotId) {
  const lot = lotById(lotId); if (!lot) return 'missing';
  if (!S.state.identity) return 'identity';
  const e = S.entryFor(lotId);
  if (S.acceptedEntryFor(lotId)) return 'accepted';
  if (e) return `${e.status}-${e.reason || ''}`;
  return S.state.snap.closed ? 'closed' : 'form';
}

// ---- actions -------------------------------------------------------------------------------
const lotOf = (el) => el.closest('[data-lot]')?.dataset.lot || el.dataset.lot || dlg.dataset.lot;
function startBid(lotId) {
  const lot = lotById(lotId);
  if (!S.state.identity) { S.state.flow = { step: 'phone', intentLot: lotId }; S.commit(); return openSheet('identity', lotId); }
  if ((S.state.drafts[lotId] ?? 0) < S.minNext(lot)) S.state.drafts[lotId] = S.minNext(lot);
  openSheet('bid', lotId);
}
function setDraft(lot, cents) { S.state.drafts[lot.id] = cents; const i = dlg.querySelector('#amt'); if (i && document.activeElement !== i) i.value = String(cents / 100); refreshBid(dlg); }
function finishIdentity() {
  const f = S.state.flow, lot = f.intentLot;
  S.signIn({ business: f.business.trim(), person: f.person.trim(), phone: '•••• ' + (f.phone || '').replace(/\D/g, '').slice(-4).padStart(4, '0') });
  S.state.flow = {};
  toast(`You're bidding for ${S.state.identity.business}`, 'ink');
  if (lot) startBidFromIdentity(lot); else closeSheet();
}
function startBidFromIdentity(lotId) { const lot = lotById(lotId); S.state.drafts[lotId] = S.minNext(lot); swapSheet('bid', lotId); }

const A = {
  back: () => (idx() > 0 ? history.back() : navigate('/lots', { replace: true })),
  cat: (el) => { S.update((s) => { s.ui.cat = el.dataset.v; }); scrollTo(0, 0); },
  view: (el) => S.update((s) => { s.ui.view = el.dataset.v; }),
  identify: () => { S.state.flow = { step: 'phone' }; S.commit(); openSheet('identity'); },
  account: () => openSheet('account'),
  bid: (el) => startBid(lotOf(el)),
  reconnect: () => (S.state.online ? (S.sync(), toast('Standings refreshed', 'ink')) : toast('Still no connection', 'red')),
  'close-sheet': () => closeSheet(),
  'close-then-nav': () => {},
  step: (el) => { const lot = lotById(dlg.dataset.lot); setDraft(lot, Math.max(0, draftFor(lot) + Number(el.dataset.d) * INC)); },
  quick: (el) => setDraft(lotById(dlg.dataset.lot), Number(el.dataset.v)),
  'update-min': () => { const lot = lotById(dlg.dataset.lot); setDraft(lot, S.minNext(lot)); },
  place: () => { const lot = lotById(dlg.dataset.lot); if (validate(lot, draftFor(lot)).ok) S.placeBid(lot.id, draftFor(lot)); },
  retry: () => { const e = S.entryFor(dlg.dataset.lot); if (e) S.retryBid(e.key); },
  check: async () => {
    const e = S.entryFor(dlg.dataset.lot); if (!e) return;
    const note = dlg.querySelector('#check-note'); if (note) note.textContent = 'Checking with the server…';
    const r = await S.checkStatus(e.key);
    if (r.offline) { const n = dlg.querySelector('#check-note'); if (n) n.textContent = "Can't check while offline."; }
  },
  dismiss: () => { const e = S.entryFor(dlg.dataset.lot); if (e) S.dismissEntry(e.key); closeSheet(); },
  rebid: () => { const lot = lotById(dlg.dataset.lot), e = S.entryFor(lot.id); if (e) S.dismissEntry(e.key); S.state.drafts[lot.id] = S.minNext(lot); S.commit(); },
  'sign-out': () => { S.signOut(); closeSheet(); toast('Signed out on this device', 'ink'); },
  'id-phone': () => { const p = (S.state.flow.phone || '').replace(/\D/g, ''); if (p.length < 7) return setErr('Enter a mobile number.'); S.state.flow = { ...S.state.flow, step: 'code', err: '', code: '' }; S.commit(); },
  'id-code': () => { if (!/^\d{6}$/.test(S.state.flow.code || '')) return setErr('Enter all 6 digits.'); S.state.flow = { ...S.state.flow, step: 'who', err: '' }; S.commit(); },
  'id-back': () => { S.state.flow = { ...S.state.flow, step: 'phone', err: '' }; S.commit(); },
  'id-who': () => { const f = S.state.flow; f.business = (f.business ?? event.business); f.person = (f.person ?? event.participant); if (!f.business.trim() || !f.person.trim()) return setErr('Both names are needed.'); finishIdentity(); },
};
function setErr(msg) { S.state.flow.err = msg; const e = dlg.querySelector('#id-err'); if (e) e.textContent = msg; }

const P = {
  go: (el) => { closePanel(); navigate(el.dataset.to); },
  'bid-cabin': () => { closePanel(); navigate('/lot/cabin'); startBid('cabin'); },
  seed: () => S.seedDemo(),
  signout: () => { S.signOut(); S.state.flow = {}; S.commit(); },
  reset: () => { S.reset(); navigate('/', { replace: true }); },
  'sim-next': (el) => S.update((s) => { s.sim.next = el.value; }),
  rival: () => S.rivalBids($('#p-rival-lot').value),
  online: () => { S.setOnline(!S.state.online); if (S.state.online) toast('Back online. Standings updated.', 'ink'); },
  'close-event': () => S.setClosed(!S.state.server.closed),
  'assume-toggle': (el) => S.update((s) => { s.sim.assumptions = el.checked; }),
  'panel-close': () => closePanel(),
};
const closePanel = () => proto.classList.remove('open');

addEventListener('click', (e) => {
  const t = e.target;
  const as = t.closest('[data-assume]');
  if (as) { const n = as.nextElementSibling; n.hidden = !n.hidden; as.setAttribute('aria-expanded', String(!n.hidden)); return; }
  if (t === dlg) return closeSheet(); // backdrop
  const p = t.closest('[data-p]');
  if (p && p.tagName !== 'SELECT' && !(p.tagName === 'INPUT')) { P[p.dataset.p]?.(p); return; }
  const a = t.closest('a[data-nav]');
  if (a) {
    e.preventDefault();
    const href = a.getAttribute('href').slice(1);
    if (a.dataset.action === 'close-then-nav') return navigate(href, { replace: true });
    return navigate(href);
  }
  const el = t.closest('[data-action]');
  if (el && el.tagName !== 'SELECT' && A[el.dataset.action]) { el.blur?.(); A[el.dataset.action](el); }
});
addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-p="sim-next"]')) P['sim-next'](t);
  if (t.matches('[data-p="assume-toggle"]')) P['assume-toggle'](t);
  if (t.matches('select[data-action="sort"]')) { S.update((s) => { s.ui.sort = t.value; }); scrollTo(0, 0); }
});
addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'amt') { const d = t.value.replace(/\D/g, ''); t.value = d; const lot = lotById(dlg.dataset.lot); S.state.drafts[lot.id] = d ? Number(d) * 100 : 0; refreshBid(dlg); }
  else if (t.dataset.flow) { S.state.flow[t.dataset.flow] = t.value; }
});
addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-flow], #amt')) { e.preventDefault(); dlg.querySelector('.sheet-foot .btn.primary:not([disabled])')?.click(); }
});
dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });

// swipe-down to dismiss, from the grab handle or the sheet header
let drag = null;
dlg.addEventListener('pointerdown', (e) => { if (e.target.closest('.grab, .sheet-head') && !e.target.closest('button')) { drag = { y: e.clientY, dy: 0 }; dlg.setPointerCapture(e.pointerId); dlg.classList.add('dragging'); } });
dlg.addEventListener('pointermove', (e) => { if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y); dlg.style.transform = `translateY(${drag.dy}px)`; });
const endDrag = () => { if (!drag) return; const go = drag.dy > 110; drag = null; dlg.classList.remove('dragging'); dlg.style.transform = ''; if (go) closeSheet(); };
dlg.addEventListener('pointerup', endDrag); dlg.addEventListener('pointercancel', endDrag);

$('#proto-handle').addEventListener('click', () => proto.classList.add('open'));

// ---- live notices (toast is a courtesy; standing is always shown in place) ------------------------
S.noticeHandlers.add((n) => {
  if (n.kind === 'outbid') toast(`Outbid on Lot ${n.lot.number}: ${n.by.business} bid ${money(n.by.amount)}`, 'red');
  if (n.kind === 'closed') toast('Bidding has closed', 'ink');
});

S.subscribe(() => render({ keepScroll: true }));
addEventListener('popstate', () => onRoute('pop'));
if (!history.state) history.replaceState({ i: 0, sheet: false }, '');
onRoute('boot');
