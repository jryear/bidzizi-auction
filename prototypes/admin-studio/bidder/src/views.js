import { event, lots, lotById, categories, sponsors, LOGOS } from './data.js';
import { state, lotStatus, topBid, totalBids, minNext, myBestBid, needsAttention, timeLeft, snapLot, isMine, isWatching, watchedLots, myMax } from './store.js';
import { esc, money, icon, sponsorMark, monogram, monoFor, badge, statusIcon, assume } from './ui.js';

// ---- shared pieces -------------------------------------------------------------------------
function pass() {
  const id = state.identity;
  const meta = `<span class="pass-meta">${state.snap.closed ? 'Bidding closed' : `Closes ${esc(event.closes)}`}</span>`;
  if (!id) {
    return `<header class="pass guest"><button class="pass-badge" data-action="identify" data-key="pass"><span class="slot"></span><span class="mark ci ghost" style="--s:36px">${icon('user')}</span><span class="pass-text"><b>Guest</b><small>Sign in when you bid</small></span></button>${meta}</header>`;
  }
  return `<header class="pass"><button class="pass-badge" data-action="account" data-key="pass" aria-label="Bidding as ${esc(id.business)}, ${esc(id.person)}. Open account"><span class="slot"></span>${monogram(id.business, 36, true)}<span class="pass-text"><b>${esc(id.business)}</b><small>${esc(id.person)}</small></span></button>${meta}</header>`;
}
const FROM = { '/watching': 'Watching', '/bids': 'My bids', '/event': 'Event', '/lots': 'Lots' };
/** Persistent BidZizi header on a lot page (A23): back (labelled for where you came from), wordmark, business chip. */
function topbar(backLabel) {
  const id = state.identity;
  const chip = id
    ? `<button class="chip-pass" data-action="account" data-key="pass" aria-label="Bidding as ${esc(id.business)}">${monogram(id.business, 24, true)}<span>${esc(id.business)}</span></button>`
    : `<button class="chip-pass guest" data-action="identify" data-key="pass">${icon('user', 'sm')}<span>Guest</span></button>`;
  const label = FROM[history.state?.from] || backLabel;
  return `<header class="topbar"><button class="back" data-action="back" data-key="back" aria-label="Back to ${esc(label)}">${icon('back')}<span>${esc(label)}</span></button><a class="wordmark" href="#/lots" data-nav data-key="wordmark" aria-label="BidZizi, all lots">BidZizi</a>${chip}</header>`;
}
function banners() {
  let h = '';
  if (!state.online) h += `<div class="banner b-off" role="status">${icon('wifiOff')}<div><b>No connection.</b> Standings are as of ${esc(state.snap.asOf)} and may be out of date. Bids can't be sent.</div><button class="btn-link" data-action="reconnect">Try again</button></div>`;
  if (state.snap.closed) h += `<div class="banner b-closed" role="status">${icon('clock')}<div><b>Bidding is closed.</b> Final standings are shown. ${assume('A8')}</div></div>`;
  return h;
}
export function tabbar(active) {
  const n = needsAttention();
  const t = (href, key, label, ic, extra = '') => `<a href="#${href}" data-nav class="tab${active === key ? ' on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${extra}</a>`;
  return `<div class="pillnav">${t('/lots', 'lots', 'Lots', 'lots') + t('/watching', 'watching', 'Watching', 'bookmark') + t('/bids', 'bids', 'My bids', 'ticket', n ? `<i class="dot" aria-label="${n} need attention">${n}</i>` : '') + t('/event', 'event', 'Event', 'info')}</div>`;
}

/** Watching is a separate list from bids (A16). The same button works on a card, a row and a lot page. */
const watchBtn = (lot, cls = '') => {
  const on = isWatching(lot.id);
  return `<button type="button" class="watch ${cls}${on ? ' on' : ''}" data-action="watch" data-keep data-watch="${lot.id}" data-key="watch-${lot.id}" aria-pressed="${on}" aria-label="Watch Lot ${esc(lot.number)}: ${esc(lot.short)}">${icon('bookmark')}</button>`;
};
const art = (lot) => `<div class="art" style="--c:${LOGOS[lot.logo].bg}">${sponsorMark(lot.logo, 52)}<span>${esc(lot.sponsor)}</span><small>No photo yet</small></div>`;
const media = (lot, sizes) => (lot.image ? `<img src="${lot.image}" alt="${esc(lot.alt)}" width="1000" height="667" loading="lazy" decoding="async" ${sizes ? `sizes="${sizes}"` : ''}>` : art(lot));
const curLabel = () => (state.online ? 'Current bid' : 'Last known bid');
const leaderLine = (lot, px = 24) => {
  const t = topBid(lot.id);
  return t ? `<span class="leader">${monoFor(t, px)}<span class="ln"><b>${esc(t.business)}</b>${isMine(t) ? ' <em class="you">You</em>' : ''}</span></span>` : `<span class="leader none">No bids yet</span>`;
};

/** The one place that decides which action a lot offers. Every list and the detail page use it. */
export function ctaFor(lot) {
  const st = lotStatus(lot);
  const min = minNext(lot);
  if (st.kind === 'none') return { label: `Bid ${money(min)}`, tone: 'primary' };
  if (st.kind === 'leading') return { label: 'Bid higher', tone: 'quiet' };
  if (st.kind === 'outbid') return { label: `Bid ${money(min)}`, tone: 'primary' };
  if (st.kind === 'sending') return { label: 'View', tone: 'quiet' };
  if (st.kind === 'unconfirmed') return { label: 'Check status', tone: 'primary' };
  if (st.kind === 'notplaced') {
    const e = st.entry;
    if ((e.status === 'rejected' && e.reason === 'closed') || state.snap.closed) return null; // nothing can be sent after close
    return e.status === 'rejected' ? { label: `Bid ${money(min)}`, tone: 'primary' } : { label: 'Try again', tone: 'primary' };
  }
  return null; // closed kinds
}

// ---- entry (QR landing) ------------------------------------------------------------------
export function entryView() {
  const photos=[...new Set([event.cover,...lots.map(l=>l.image),'assets/lots/cabin.jpg','assets/lots/dinner.jpg'].filter(Boolean))].slice(0,3);
  const id = state.identity;
  const kinds = lots.map((l) => lotStatus(l).kind);
  const c = (k) => kinds.filter((x) => x === k).length;
  const last = state.lastViewed && lotById(state.lastViewed);
  const bits = [c('leading') + c('final-leading') ? `${c('leading') + c('final-leading')} ${state.snap.closed ? 'top bid' : 'leading'}` : '', c('outbid') ? `${c('outbid')} outbid` : '', c('notplaced') + c('unconfirmed') ? `${c('notplaced') + c('unconfirmed')} to check` : ''].filter(Boolean);
  const welcome = id ? `<section class="welcome" aria-label="Welcome back">
      <p class="lbl">Welcome back ${assume('A12')}</p>
      <div class="w-id">${monogram(id.business, 40, true)}<div><b>${esc(id.business)}</b><span>${esc(id.person)}${bits.length ? ' · ' + bits.join(', ') : ''}</span></div></div>
      ${last ? `<a class="btn quiet block" href="#/lot/${last.id}" data-nav>Pick up where you left off: Lot ${esc(last.number)}</a>` : ''}
    </section>` : '';
  return { name: 'entry', title: event.name, chrome: 'entry', html: `
  <main class="entry" id="main">
    ${banners()}
    <div class="fan" aria-hidden="true"><img src="${esc(photos[0])}" alt="" width="1000" height="667"><img src="${esc(photos[1])}" alt="" width="1000" height="667"><img src="${esc(photos[2])}" alt="" width="1000" height="667"></div>
    <p class="host">${esc(event.host)} presents</p>
    <h1 tabindex="-1" data-key="h1">${esc(event.name)} <span>Auction</span></h1>
    <dl class="facts">
      <div><dt>When</dt><dd>${esc(event.date)}</dd></div>
      <div><dt>${state.snap.closed ? 'Closed' : 'Bidding closes'}</dt><dd>${esc(event.closes)} ${esc(event.timezone)} ${assume('A6')}</dd></div>
      <div><dt>Lots</dt><dd>${event.lotCount}</dd></div>
    </dl>
    <p class="studio-welcome"><strong>${esc(event.eyebrow||'')}</strong><br>${esc(event.welcome || '')}</p>
    ${welcome}
    <a class="btn primary block lg" href="#/lots" data-nav data-key="browse">Browse the lots</a>
    <p class="fine">No sign-in to look around. We only ask who's bidding when you place your first bid. ${assume('A1')}</p>
    ${sponsors.length ? `<section class="sponsor-row" aria-label="Event sponsors"><p class="lbl">Event sponsors</p><ul>${sponsors.map((s) => `<li>${sponsorMark(s.logo, 34)}<span>${esc(s.name)}</span></li>`).join('')}</ul></section>` : ''}
    <button class="btn-link center" data-action="welcome" data-key="welcome">A welcome from ${esc(event.host)}</button>
    <a class="btn-link center" href="#/event" data-nav>How bidding works</a>
  </main>` };
}

// ---- lots ---------------------------------------------------------------------------------
function band(lot, st) {
  if (st.kind === 'none' || st.kind === 'closed') return '';
  return `<div class="band t-${st.tone}"><span class="b-t">${badge(st)}</span><span class="b-s">${esc(st.sub)}</span></div>`;
}
function card(lot) {
  const st = lotStatus(lot), n = totalBids(lot), t = topBid(lot.id);
  const shown = t ? t.amount : lot.opening;
  return `<article class="card" data-anchor="${lot.id}" data-lot="${lot.id}">
    ${watchBtn(lot)}
    <a class="card-link" href="#/lot/${lot.id}" data-nav data-key="lot-${lot.id}">
      <div class="card-media">${media(lot, '(min-width:430px) 430px, 100vw')}<span class="lotno" aria-label="Lot ${esc(lot.number)}">${esc(lot.number)}</span><span class="sponsor-tag">${sponsorMark(lot.logo, 22)}<span>${esc(lot.sponsor)}</span></span></div>
      <div class="card-body"><p class="cat">${esc(lot.category)}</p><h3 class="card-title">${esc(lot.title)}</h3><p class="card-short">${esc(lot.short)}</p></div>
      <div class="card-numbers"><div class="cn-a"><span class="lbl">${t ? curLabel() : 'Opening bid'}</span><span class="amt${state.online ? '' : ' stale'}">${money(shown)}</span></div><span class="count">${n} ${n === 1 ? 'bid' : 'bids'}</span><div class="leaderrow">${leaderLine(lot, 28)}</div></div>
      ${band(lot, st)}
    </a></article>`;
}
function row(lot) {
  const st = lotStatus(lot), n = totalBids(lot), t = topBid(lot.id);
  return `<article class="row" data-anchor="${lot.id}" data-lot="${lot.id}"><a href="#/lot/${lot.id}" data-nav data-key="lot-${lot.id}" class="row-link">
    <div class="thumb">${lot.image ? `<img src="${lot.image}" alt="" width="1000" height="667" loading="lazy" decoding="async">` : `<div class="art mini" style="--c:${LOGOS[lot.logo].bg}">${sponsorMark(lot.logo, 28)}</div>`}<span class="lotno sm">${esc(lot.number)}</span></div>
    <div class="row-main"><h3 class="row-title">${esc(lot.title)}</h3><p class="row-meta">${t ? `${leaderLine(lot, 18)}` : '<span class="leader none">No bids yet</span>'}<span class="count">${n} ${n === 1 ? 'bid' : 'bids'}</span></p></div>
    <div class="row-end"><span class="amt${state.online ? '' : ' stale'}">${money(t ? t.amount : lot.opening)}</span>${badge(st, true) || '<span class="row-gap"></span>'}</div>
  </a>${watchBtn(lot, 'sm')}</article>`;
}
// Search (A22): every word must appear in the lot number, title, short description, sponsor or category.
const haystack = (l) => `lot ${l.number} ${l.title} ${l.short} ${l.sponsor} ${l.category}`.toLowerCase();
export function visibleLots() {
  const { cat, sort, q } = state.ui;
  const terms = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
  let list = lots.filter((l) => (cat === 'All' || l.category === cat) && terms.every((t) => haystack(l).includes(t)));
  const cur = (l) => topBid(l.id)?.amount ?? l.opening;
  if (sort === 'bids') list = [...list].sort((a, b) => totalBids(b) - totalBids(a));
  if (sort === 'low') list = [...list].sort((a, b) => cur(a) - cur(b));
  return list;
}
export const lotsCount = () => `${visibleLots().length} of ${lots.length}${state.online ? '' : ' · as of ' + state.snap.asOf}`;
/** The part of the Lots screen that changes as you type, so the search field is never re-created under your thumb. */
export function lotsList() {
  const list = visibleLots(), { view, q, cat } = state.ui;
  if (!list.length) return `<div class="empty big"><p><b>No lots match${q ? ` “${esc(q)}”` : ''}${cat !== 'All' ? ` in ${esc(cat)}` : ''}.</b> ${assume('A22')}</p><button class="btn quiet" data-action="clear-filters" data-key="clear-filters">Clear search and filters</button></div>`;
  return `<div class="${view === 'rows' ? 'rows' : 'cards'}">${list.map(view === 'rows' ? row : card).join('')}</div><p class="end-note">That's every lot${q || cat !== 'All' ? ' that matches' : ''}. ${state.online ? '' : 'Standings may be out of date.'}</p>`;
}
export function lotsView() {
  const { view, cat, sort, q } = state.ui;
  return { name: 'lots', title: 'Lots', chrome: 'tabs', tab: 'lots', html: `
  ${pass()}${banners()}
  <main id="main" class="lots">
    <div class="page-head"><h1 tabindex="-1" data-key="h1">Lots</h1><p id="lot-count">${esc(lotsCount())}</p></div>
    <div class="searchrow"><label class="search">${icon('search', 'sm')}<span class="sr">Search lots</span><input type="search" data-search enterkeyhint="search" autocomplete="off" placeholder="Search lots" value="${esc(q || '')}" data-key="q"></label></div>
    <div class="chips" role="group" aria-label="Filter by category">${categories.map((c) => `<button class="chip${c === cat ? ' on' : ''}" data-action="cat" data-v="${esc(c)}" aria-pressed="${c === cat}" data-key="cat-${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="toolbar"><label class="sort"><span class="sr">Sort lots</span><select data-action="sort" data-key="sort"><option value="number"${sort === 'number' ? ' selected' : ''}>Lot order</option><option value="bids"${sort === 'bids' ? ' selected' : ''}>Most bids</option><option value="low"${sort === 'low' ? ' selected' : ''}>Lowest bid first</option></select>${icon('chevron', 'sm')}</label>
      <div class="seg" role="group" aria-label="Layout"><button data-action="view" data-v="cards" aria-pressed="${view === 'cards'}" aria-label="Large cards" data-key="v-cards">${icon('grid')}</button><button data-action="view" data-v="rows" aria-pressed="${view === 'rows'}" aria-label="Compact list" data-key="v-rows">${icon('list')}</button></div></div>
    <div id="lotlist">${lotsList()}</div>
  </main>` };
}

// ---- watching: its own list, separate from My bids (A16) -----------------------------------------------
export function watchingView() {
  const list = watchedLots();
  return { name: 'watching', title: 'Watching', chrome: 'tabs', tab: 'watching', html: `
  ${pass()}${banners()}
  <main id="main" class="watching">
    <div class="page-head"><h1 tabindex="-1" data-key="h1">Watching</h1><p>${list.length} ${list.length === 1 ? 'lot' : 'lots'} · only on this device${state.online ? '' : ' · as of ' + esc(state.snap.asOf)}</p></div>
    ${list.length ? `<div class="rows">${list.map(row).join('')}</div>
      <p class="fine pad">Watching places no bid, notifies no one, and isn't shown to anyone else. Bids you place are in My bids. ${assume('A16')}</p>`
      : `<div class="empty big"><p><b>You're not watching any lots.</b> Tap the bookmark on a lot to keep it here. Watching is not bidding: it places nothing and tells no one. ${assume('A16')}</p><a class="btn primary" href="#/lots" data-nav>Browse the lots</a></div>`}
  </main>` };
}

// ---- lot detail -----------------------------------------------------------------------------
function historyList(lot) {
  const bids = snapLot(lot.id).bids;
  if (!bids.length) return `<div class="empty"><p><b>No bids yet.</b> The opening bid is ${money(lot.opening)}. ${assume('A5')}</p></div>`;
  const total = totalBids(lot);
  return `<ol class="history">${bids.map((b, i) => `<li class="${isMine(b) ? 'mine' : ''}">${monoFor(b, 34)}<div class="h-who"><b>${esc(b.business)}</b>${isMine(b) ? ' <em class="you">You</em>' : ''}<span>${esc(b.person)} · ${esc(b.time)}</span></div><div class="h-amt"><span class="amt">${money(b.amount)}</span>${i === 0 ? '<span class="top">Top bid</span>' : ''}</div></li>`).join('')}</ol>
    ${total > bids.length ? `<p class="fine">Showing the latest ${bids.length} of ${total} bids.</p>` : ''}`;
}
export function lotView(id) {
  const lot = lotById(id);
  if (!lot) return { name: 'lot', title: 'Lot not found', chrome: 'tabs', tab: 'lots', html: `${pass()}<main id="main" class="lots"><div class="empty big"><h1 tabindex="-1" data-key="h1">That lot isn't in this event</h1><a class="btn primary" href="#/lots" data-nav>Back to lots</a></div></main>` };
  const st = lotStatus(lot), t = topBid(lot.id), n = totalBids(lot), cta = ctaFor(lot), min = minNext(lot);
  const idn = state.identity;
  const forLine = idn ? `<p class="for">${monogram(idn.business, 22, true)}<span>Bidding for <b>${esc(idn.business)}</b></span></p>` : `<p class="for">${icon('lock', 'sm')}<span>You'll confirm who's bidding at your first bid</span></p>`;
  let left;
  if (['none', 'outbid'].includes(st.kind) || (st.kind === 'notplaced' && st.entry.status === 'rejected')) left = `<div class="ab-amt"><span class="lbl">Next bid</span><span class="amt">${money(min)}</span></div>`;
  else if (st.kind === 'leading') left = `<div class="ab-amt">${badge(st)}<span class="amt sm">${money(t.amount)}</span></div>`;
  else if (['sending', 'unconfirmed', 'notplaced'].includes(st.kind)) left = `<div class="ab-amt">${badge(st)}<span class="amt sm">${money(st.entry.amount)}</span></div>`;
  else left = `<div class="ab-amt"><span class="lbl">${t ? 'Final top bid' : 'Final'}</span><span class="amt">${t ? money(t.amount) : '—'}</span></div>`;
  const standing = st.kind === 'none' || st.kind === 'closed' ? '' : `<section class="standing t-${st.tone}" role="status"><span class="st-ic">${statusIcon(st.kind, '')}</span><div><p class="st-title">${esc(st.title)}</p><p class="st-sub">${esc(st.sub)}${state.online ? '' : ` Standing as of ${esc(state.snap.asOf)}.`}${st.kind === 'notplaced' && st.entry.status === 'rejected' && st.entry.reason === 'stale' ? ' ' + assume('A7') : ''}${st.kind === 'leading' ? ' ' + assume('A9') : ''}</p></div></section>`;
  return { name: 'lot', title: `Lot ${lot.number} · ${lot.title}`, chrome: 'focus', tab: 'lots', html: `
  ${topbar('Lots')}${banners()}
  <main id="main" class="detail" data-lot="${lot.id}">
    <div class="hero">${media(lot, '(min-width:430px) 430px, 100vw')}${watchBtn(lot, 'lg')}<span class="lotno lg" aria-label="Lot ${esc(lot.number)}">${esc(lot.number)}</span></div>
    <div class="d-body">
      <p class="sponsor-line">${sponsorMark(lot.logo, 30)}<span><small>Provided by</small><b>${esc(lot.sponsor)}</b></span><span class="cat">${esc(lot.category)}</span></p>
      <h1 class="d-title" tabindex="-1" data-key="h1">${esc(lot.title)}</h1>
      <p class="d-short">${esc(lot.short)}</p>
      <section class="stub" aria-label="Bid status">
        <div class="stub-main"><span class="lbl">${t ? curLabel() : 'Opening bid'}</span><span class="amt xl${state.online ? '' : ' stale'}">${money(t ? t.amount : lot.opening)}</span><span class="leaderrow">${t ? `<span class="lbl">Top bid</span>` : ''}${leaderLine(lot, 28)}${t ? `<span class="who-p">${esc(t.person)}</span>` : ''}</span></div>
        <div class="stub-side"><div><span class="lbl">Bids</span><span class="n">${n}</span></div><div><span class="lbl">${state.snap.closed ? 'Closed' : 'Closes'}</span><span class="n sm">${esc(event.closes)}</span>${state.snap.closed ? '' : `<span class="tl">${esc(timeLeft())}</span>`} ${assume('A6')}</div></div>
      </section>
      ${standing}${maxCard(lot)}
      <section class="prose"><h2>About this lot</h2><p>${esc(lot.description)}</p></section>
      <section class="prose"><h2>What's included</h2><ul class="incl">${lot.includes.map((x) => `<li>${icon('check', 'sm')}<span>${esc(x)}</span></li>`).join('')}</ul></section>
      <section class="prose"><h2>Good to know</h2><p class="fine-print">${esc(lot.fine)}</p></section>
      <section class="prose"><h2>Bid history</h2><p class="sub">Every bidder sees the business and person behind each bid. ${assume('A11')}</p>${historyList(lot)}</section>
      <a class="btn-link center" href="#/event" data-nav>How bidding works</a>
    </div>
    <div class="actionbar">${forLine}<div class="ab-row">${left}${cta ? `<button class="btn ${cta.tone}" data-action="bid" data-lot="${lot.id}" data-key="cta">${esc(cta.label)}</button>` : `<span class="closed-note">${state.snap.closed ? 'Bidding closed' : 'Not available'}</span>`}</div></div>
  </main>` };
}

// ---- private maximum card on a lot page (A20): a labeled simulation, never a bid ------------------------
function maxCard(lot) {
  const m = myMax(lot.id), closed = state.snap.closed;
  const $ = (c) => money(c);
  if (!m && closed) return '';
  const row = (title, sub, btn, tone = '') => `<section class="maxcard ${tone}" aria-label="Private maximum"><div><span class="lbl">Private maximum · simulation</span><p class="mx-t">${title}</p><p class="mx-s">${sub} ${assume('A20')}</p></div>${btn}</section>`;
  const open = (label, key) => (closed ? '' : `<button class="btn quiet sm" data-action="max" data-key="${key}">${label}</button>`);
  if (!m) return row('Set a maximum you keep to yourself', 'This is not a bid. Prototype: nothing will bid for you.', open('Set a maximum', 'max-open'));
  if (m.status === 'saving') return row(`Saving your ${$(m.amount)} maximum…`, 'Not saved yet. Nothing is placed either way.', open('View', 'max-open'), 't-amber');
  if (m.status === 'unconfirmed') return row(`We couldn't confirm your ${$(m.amount)} maximum`, 'It may or may not have been saved. Check before changing it.', open('Check status', 'max-open'), 't-hatch');
  if (m.status === 'failed') return row(`Your ${$(m.amount)} maximum wasn't saved`, m.prev ? `Your earlier ${$(m.prev.amount)} maximum is still saved.` : 'Nothing is saved.', open('View', 'max-open'), 't-dashed');
  return row(`Your private maximum is ${$(m.amount)}`, `Saved (simulated). It has placed no bid and doesn't change who is leading. ${closed ? '' : 'Only you see it.'}`, open('Change', 'max-open'), 't-saved');
}

// ---- my bids ---------------------------------------------------------------------------------
function ticket(lot) {
  const st = lotStatus(lot), cta = ctaFor(lot), t = topBid(lot.id);
  const mine = st.entry ? st.entry.amount : myBestBid(lot.id)?.amount;
  return `<article class="ticket t-${st.tone}" data-anchor="${lot.id}">
    <a class="tk-main" href="#/lot/${lot.id}" data-nav data-key="tk-${lot.id}"><div class="thumb">${lot.image ? `<img src="${lot.image}" alt="" width="1000" height="667" loading="lazy" decoding="async">` : `<div class="art mini" style="--c:${LOGOS[lot.logo].bg}">${sponsorMark(lot.logo, 26)}</div>`}</div>
      <div class="tk-t"><span class="lbl">Lot ${esc(lot.number)}</span><h3>${esc(lot.title)}</h3>${badge(st, true)}<p>${esc(st.sub)}</p></div></a>
    <div class="tk-stub"><span class="lbl">${st.entry ? 'Attempted' : 'Your bid'}</span><span class="amt">${mine ? money(mine) : '—'}</span>${t && !['leading', 'final-leading'].includes(st.kind) ? `<span class="tk-cur">Now ${money(t.amount)}</span>` : ''}</div>
    ${cta ? `<div class="tk-act"><button class="btn ${cta.tone === 'quiet' ? 'quiet' : 'primary'} sm" data-action="bid" data-lot="${lot.id}" data-key="tkc-${lot.id}">${esc(cta.label)}</button></div>` : ''}
  </article>`;
}
export function bidsView() {
  const items = lots.map((l) => ({ l, k: lotStatus(l).kind }));
  const g = (ks) => items.filter((x) => ks.includes(x.k)).map((x) => ticket(x.l)).join('');
  const attn = g(['outbid', 'notplaced', 'unconfirmed']), active = g(['sending', 'leading']), ended = g(['final-leading', 'closed-outbid']);
  const none = !attn && !active && !ended;
  const sec = (title, sub, html) => (html ? `<section class="b-sec"><h2>${title}</h2><p class="sub">${sub}</p><div class="tickets">${html}</div></section>` : '');
  return { name: 'bids', title: 'My bids', chrome: 'tabs', tab: 'bids', html: `
  ${pass()}${banners()}
  <main id="main" class="bids">
    <div class="page-head"><h1 tabindex="-1" data-key="h1">My bids</h1><p>${state.identity ? esc(state.identity.business) : 'Guest'}${state.online ? '' : ' · as of ' + esc(state.snap.asOf)}</p></div>
    ${none ? `<div class="empty big"><p><b>${state.identity ? 'No bids yet.' : "You haven't bid yet."}</b> Bids you place show up here with their standing, and you can come back to them any time. ${assume('A12')}</p><a class="btn primary" href="#/lots" data-nav>Browse the lots</a></div>` : ''}
    ${sec('Needs your attention', 'Outbid, or something we could not finish.', attn)}
    ${sec('In play', 'Sending now, or leading.', active)}
    ${sec('Closed', 'Final standings.', ended)}
  </main>` };
}

// ---- event / how it works ---------------------------------------------------------------------
export function eventView() {
  const g = (kind, tone, label, text) => `<li>${badge({ kind, tone, label })}<p>${text}</p></li>`;
  const link = (action, key, ic, title, sub) => `<li><button class="linkrow" data-action="${action}" data-key="${key}">${icon(ic)}<span class="lr-t"><b>${title}</b><small>${sub}</small></span>${icon('right', 'sm')}</button></li>`;
  return { name: 'event', title: 'Event', chrome: 'tabs', tab: 'event', html: `
  ${pass()}${banners()}
  <main id="main" class="eventinfo">
    <div class="page-head"><h1 tabindex="-1" data-key="h1">${esc(event.name)}</h1><p>${esc(event.host)} · ${esc(event.date)}</p></div>
    <section class="prose"><h2>The event</h2>
      <dl class="facts onpage"><div><dt>When</dt><dd>${esc(event.date)}</dd></div><div><dt>${state.snap.closed ? 'Closed' : 'Bidding closes'}</dt><dd>${esc(event.closes)} ${esc(event.timezone)} ${assume('A6')}</dd></div><div><dt>Lots</dt><dd>${event.lotCount}</dd></div></dl>
      <p class="fine-print">${esc(event.welcome)}<br>${esc(event.venue)}</p></section>
    <section class="prose"><h2>How bidding works</h2>
      <ol class="steps"><li><b>Browse freely.</b> Look at any lot, no sign-in. ${assume('A1')}</li><li><b>Say who's bidding.</b> At your first bid we ask for your phone and the business you're bidding for. ${assume('A2')}</li><li><b>Review, then place.</b> Every bid shows its amount and what it does before you send it. ${assume('A4')}</li><li><b>Trust only what's confirmed.</b> You're leading only after you see "You're leading". Anything else means we don't know yet.</li></ol>
      <p class="fine-print">Bids go up in ${money(event.increment)} steps. Bidding closes at ${esc(event.closes)} ${esc(event.timezone)} for every lot together. ${assume('A5')}</p></section>
    <section class="prose"><h2>What the labels mean</h2>
      <ul class="glossary">
        ${g('leading', 'green', "You're leading", 'Your bid is the highest, confirmed by us.')}
        ${g('outbid', 'red', 'Outbid', 'Someone bid higher. You can bid again.')}
        ${g('sending', 'amber', 'Sending', 'On its way. Not placed yet. You are not leading.')}
        ${g('unconfirmed', 'hatch', 'Unconfirmed', `We lost contact before an answer. It may or may not have been placed. Check status before bidding again. ${assume('A10')}`)}
        ${g('notplaced', 'dashed', 'Not placed', 'It did not go through and nothing was recorded. You can try again.')}
        ${g('closed', 'grey', 'Closed', 'Bidding has ended. The standing is final.')}
      </ul></section>
    ${sponsors.length ? `<section class="prose"><h2>Event sponsors</h2><ul class="sponsors">${sponsors.map((s) => `<li>${sponsorMark(s.logo, 40)}<span>${esc(s.name)}</span></li>`).join('')}</ul>
      <ul class="linkrows">${link('welcome', 'welcome', 'heart', 'Event welcome', 'A message from the event organizers')}</ul></section>` : ''}
    <section class="prose"><h2>Giving</h2>
      <ul class="linkrows">${link('donate', 'donate', 'heart', 'Nonprofit donation', 'Where giving would live. Not decided yet')}</ul></section>
    <section class="prose"><h2>Your settings</h2>
      <ul class="linkrows">${link('users', 'users', 'users', 'Additional users', state.identity ? `People added for ${esc(state.identity.business)}` : 'Sign in to add people')}${link('appearance', 'appearance', 'text', 'Appearance', 'Text size, lot layout, motion')}</ul></section>
    <p class="fine center">Prototype with fictional content. No real auction is running.</p>
  </main>` };
}

export const views = { entry: entryView, lots: lotsView, watching: watchingView, bids: bidsView, event: eventView };
