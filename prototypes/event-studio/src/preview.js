// The phone preview. Renders prototype A's own markup and classes (lanyard.css, unmodified) from the studio's
// draft data, received by postMessage. No bidding happens here: the bid button only says so.
// Routing is in memory so the preview never adds entries to the studio's browser history.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => '$' + (c / 100).toLocaleString('en-US', Number.isInteger(c / 100) ? {} : { minimumFractionDigits: 2 });
const P = { back: 'M15 5l-7 7 7 7', lots: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', info: 'M12 11v6M12 7.5v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z', lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z', heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z', external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6' };
const icon = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const TONES = [['#DCE3F7', '#233A9B'], ['#F6D9CF', '#8F3015'], ['#D8EBDD', '#175C3A'], ['#EADDF3', '#5B2C86'], ['#F1E7C8', '#6D5413'], ['#D7ECEF', '#14585F']];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const inits = (n) => { const w = String(n).replace(/&/g, ' ').split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase(); };
const sq = (name, px) => { const [bg, fg] = TONES[hash(name) % TONES.length]; return `<span class="mark sq tint" style="--s:${px}px;background:${bg};color:${fg}" aria-hidden="true">${esc(inits(name))}</span>`; };

let D = null, route = { name: 'entry' }, stack = [], cat = 'All', bidNote = false;
const view = document.getElementById('view'), tabbar = document.getElementById('tabbar'), shell = document.getElementById('shell');
const goto = (r, { push = false } = {}) => { if (push) stack.push(route); route = r; bidNote = false; render(true); };
const back = () => { route = stack.pop() || { name: 'lots' }; bidNote = false; render(true); };

const guestPass = (meta) => `<header class="pass guest"><div class="pass-badge"><span class="mark ci ghost" style="--s:36px">${icon('user')}</span><span class="pass-text"><b>Guest</b><small>Sign in when you bid</small></span></div><span class="pass-meta">${esc(meta)}</span></header>`;
const media = (l) => (l.image ? `<img src="assets/lots/${esc(l.image)}.jpg" alt="" width="1000" height="667" loading="lazy">` : `<div class="art" style="--c:${TONES[hash(l.sponsor || l.title) % TONES.length][1]}">${l.sponsor ? sq(l.sponsor, 52) : ''}<span>${esc(l.sponsor || 'BidZizi')}</span><small>No photo yet</small></div>`);
const stateBand = (l) => (l.state === 'scheduled' ? `<div class="band t-dashed"><span class="b-t"><span class="badge t-dashed sm">${icon('clock', 'sm')}Not open yet</span></span><span class="b-s">Bidding opens ${esc(l.opens)}</span></div>` : l.state === 'closed' ? `<div class="band t-grey"><span class="b-t"><span class="badge t-grey sm">${icon('clock', 'sm')}Closed</span></span><span class="b-s">Bidding closed ${esc(l.closes)}</span></div>` : '');
const tabs = (active) => `<div class="pillnav two"><a href="#" data-go="lots" class="tab${active === 'lots' ? ' on' : ''}" ${active === 'lots' ? 'aria-current="page"' : ''}>${icon('lots')}<span>Lots</span></a><a href="#" data-go="event" class="tab${active === 'event' ? ' on' : ''}" ${active === 'event' ? 'aria-current="page"' : ''}>${icon('info')}<span>Event</span></a></div>`;
const when = () => (D.date ? D.date.replace(/^\w+, /, '') : 'Date to be announced');

function entry() {
  const d = D.details, n = D.name.length, fs = n > 44 ? 30 : n > 28 ? 38 : 52;
  const hero = d.heroImage ? `<div class="hero-frame"><img src="assets/lots/${esc(d.heroImage)}.jpg" alt="" width="1000" height="667"></div>` : `<div class="hero-frame none">No heading image yet</div>`;
  const cta = D.catalogOpen ? `<a class="btn primary block lg" href="#" data-go="lots">Browse the lots</a><p class="fine">No sign-in to look around. We only ask who’s bidding when you place your first bid.</p>`
    : D.firstOpens ? `<button class="btn primary block lg" disabled>The lots open ${esc(D.firstOpens)}</button><p class="fine">The catalog appears when bidding opens. Until then, this welcome page is all attendees see.</p>`
    : `<button class="btn primary block lg" disabled>The lots aren’t open yet</button><p class="fine">Lots appear once a bidding window is scheduled.</p>`;
  return { chrome: 'entry', html: `<main class="entry" id="main">${hero}<p class="host">${esc(D.host)} presents</p><h1 tabindex="-1" style="font-size:${fs}px">${esc(D.name)}</h1>
    <dl class="facts"><div><dt>When</dt><dd>${esc(when())}${D.start ? `<br><span class="fine">${esc(D.start)}${D.end ? ' – ' + esc(D.end) : ''} ${esc(D.tz)}</span>` : ''}</dd></div><div><dt>${D.catalogOpen ? 'Bidding' : 'Bidding opens'}</dt><dd>${esc(D.firstOpens || 'Not scheduled')}</dd></div><div><dt>Lots</dt><dd>${D.totalAssigned}</dd></div></dl>
    ${d.venue ? `<p class="fine">${esc(d.venue)}</p>` : ''}
    ${d.welcomeTitle || d.welcomeBody ? `<section class="prose" style="margin-top:4px"><h2>${esc(d.welcomeTitle || 'Welcome')}</h2><p>${esc(d.welcomeBody)}</p></section>` : `<div class="empty">No welcome message yet. Attendees would see only the details above.</div>`}
    ${cta}
    ${D.sponsors.length ? `<section class="sponsor-row" aria-label="Sponsors"><p class="lbl">Thank you to our sponsors</p><ul>${D.sponsors.map((s) => `<li>${sq(s, 34)}<span>${esc(s)}</span></li>`).join('')}</ul></section>` : ''}
    <a class="btn-link center" href="#" data-go="event">How bidding works</a></main>` };
}

function card(l) {
  const sp = l.sponsor ? `<span class="sponsor-tag">${sq(l.sponsor, 22)}<span>${esc(l.sponsor)}</span></span>` : '';
  return `<article class="card"><a class="card-link" href="#" data-lot="${esc(l.id)}"><div class="card-media">${media(l)}<span class="lotno" aria-label="Lot ${esc(l.number)}">${esc(l.number)}</span>${sp}</div>
    <div class="card-body">${l.category ? `<p class="cat">${esc(l.category)}</p>` : ''}<h3 class="card-title">${esc(l.title)}</h3>${l.short ? `<p class="card-short">${esc(l.short)}</p>` : ''}</div>
    <div class="card-numbers"><div class="cn-a"><span class="lbl">Opening bid</span><span class="amt">${money(l.opening)}</span></div><span class="count">0 bids</span><div class="leaderrow"><span class="leader none">No bids yet</span></div></div>${stateBand(l)}</a></article>`;
}
function lots() {
  const head = `<div class="page-head"><h1 tabindex="-1">Lots</h1><p>${D.catalogOpen ? `${D.lots.length} of ${D.totalAssigned}` : 'Not open yet'}</p></div>`;
  if (!D.catalogOpen) return { chrome: 'tabs', tab: 'lots', html: `${guestPass(D.firstOpens ? `Opens ${D.firstOpens.replace(/^\w+, /, '')}` : 'Not scheduled')}<main id="main" class="lots">${head}<div class="pv-hidden"><h2>Lots appear when bidding opens</h2><p class="sub">${D.firstOpens ? `Bidding opens ${esc(D.firstOpens)}. ` : 'No bidding window is scheduled. '}Existing staging keeps the catalog hidden until then.</p></div></main>` };
  if (cat !== 'All' && !D.cats.includes(cat)) cat = 'All';
  const shown = D.lots.filter((l) => cat === 'All' || l.category === cat);
  return { chrome: 'tabs', tab: 'lots', html: `${guestPass('Bidding open')}<main id="main" class="lots">${head}
    ${D.cats.length ? `<div class="chips" role="group" aria-label="Categories"><button class="chip${cat === 'All' ? ' on' : ''}" data-cat="All" aria-pressed="${cat === 'All'}">All</button>${D.cats.map((c) => `<button class="chip${cat === c ? ' on' : ''}" data-cat="${esc(c)}" aria-pressed="${cat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
    ${shown.length ? `<div class="cards">${shown.map(card).join('')}</div><p class="end-note">That’s every lot.</p>` : `<div class="empty big"><h1>No lots in this category yet</h1></div>`}</main>` };
}

function lot(id) {
  const l = D.lots.find((x) => x.id === id);
  if (!l) return { chrome: 'focus', html: `<header class="topbar"><button class="back" data-back>${icon('back')}<span>Lots</span></button><span class="wordmark">BidZizi</span><span></span></header><main id="main" class="lots"><div class="empty big"><h1 tabindex="-1">That lot isn’t available</h1><p>It may have been removed, or moved out of a bidding window.</p><button class="btn primary" data-back>Back to lots</button></div></main>` };
  const when2 = l.state === 'scheduled' ? l.opens : l.closes, [wd, wt] = when2.split(' · ');
  const cta = l.state === 'open' ? `<button class="btn primary" data-bid>Bid ${money(l.next)}</button>` : `<span class="closed-note">${l.state === 'scheduled' ? `Opens ${esc(wt)}` : 'Bidding closed'}</span>`;
  return { chrome: 'focus', html: `<header class="topbar"><button class="back" data-back aria-label="Back to Lots">${icon('back')}<span>Lots</span></button><a class="wordmark" href="#" data-go="lots" aria-label="BidZizi, all lots">BidZizi</a><span class="chip-pass guest">${icon('user', 'sm')}<span>Guest</span></span></header>
  <main id="main" class="detail"><div class="hero">${media(l)}<span class="lotno lg" aria-label="Lot ${esc(l.number)}">${esc(l.number)}</span></div>
  <div class="d-body">${l.sponsor || l.category ? `<p class="sponsor-line">${l.sponsor ? `${sq(l.sponsor, 30)}<span><small>Donated by</small><b>${esc(l.sponsor)}</b></span>` : ''}${l.category ? `<span class="cat">${esc(l.category)}</span>` : ''}</p>` : ''}
    <h1 class="d-title" tabindex="-1">${esc(l.title)}</h1>${l.short ? `<p class="d-short">${esc(l.short)}</p>` : ''}
    <section class="stub" aria-label="Bid status"><div class="stub-main"><span class="lbl">Opening bid</span><span class="amt xl">${money(l.opening)}</span><span class="leaderrow"><span class="leader none">No bids yet</span></span></div><div class="stub-side"><div><span class="lbl">Bids</span><span class="n">0</span></div><div><span class="lbl">${l.state === 'closed' ? 'Closed' : l.state === 'open' ? 'Closes' : 'Opens'}</span><span class="n sm">${esc(wt || '')}</span><span class="tl">${esc(wd || '')}</span></div></div></section>
    ${l.state === 'scheduled' ? `<section class="standing t-dashed" role="status"><span class="st-ic">${icon('clock')}</span><div><p class="st-title">Not open yet</p><p class="st-sub">${esc(l.windowName)} opens ${esc(l.opens)}.</p></div></section>` : ''}
    ${l.description ? `<section class="prose"><h2>About this lot</h2><p>${esc(l.description)}</p></section>` : ''}
    <section class="prose"><h2>Bid history</h2><div class="empty"><p><b>No bids yet.</b> The opening bid is ${money(l.opening)}.</p></div></section>
    ${bidNote ? `<p class="note-inline" role="status">Preview only: nothing is bid here. Bidding is simulated in prototype A.</p>` : ''}</div>
  <div class="actionbar"><p class="for">${icon('lock', 'sm')}<span>You’ll confirm who’s bidding at your first bid</span></p><div class="ab-row"><div class="ab-amt"><span class="lbl">Next bid</span><span class="amt">${money(l.next)}</span></div>${cta}</div></div></main>` };
}

function event() {
  const d = D.details, link = D.donations.mode === 'link' && D.donations.url ? `<section class="prose"><h2>Giving</h2><ul class="linkrows"><li><span class="linkrow" role="link" aria-label="${esc(D.donations.label)} (preview)">${icon('heart')}<span class="lr-t"><b>${esc(D.donations.label || 'Donate')}</b><small>Opens the organization’s own donation page</small></span>${icon('external', 'sm')}</span></li></ul></section>` : '';
  return { chrome: 'tabs', tab: 'event', html: `${guestPass(D.catalogOpen ? 'Bidding open' : 'Not open yet')}<main id="main" class="eventinfo"><div class="page-head"><h1 tabindex="-1">${esc(D.name)}</h1><p>${esc(D.host)}${D.date ? ' · ' + esc(D.date.replace(/^\w+, /, '')) : ''}</p></div>
    <section class="prose"><h2>The event</h2><dl class="facts onpage"><div><dt>When</dt><dd>${esc(when())}</dd></div><div><dt>Time</dt><dd>${D.start ? esc(D.start) + (D.end ? ' – ' + esc(D.end) : '') : '—'}</dd></div><div><dt>Lots</dt><dd>${D.totalAssigned}</dd></div></dl>${d.venue ? `<p class="fine-print">${esc(d.venue)}</p>` : ''}</section>
    ${d.welcomeTitle ? `<section class="prose"><h2>${esc(d.welcomeTitle)}</h2><p>${esc(d.welcomeBody)}</p></section>` : ''}
    <section class="prose"><h2>How bidding works</h2><ol class="steps"><li><b>Browse freely.</b> Look at any lot, no sign-in.</li><li><b>Say who’s bidding.</b> At your first bid we ask who you’re bidding for.</li><li><b>Bid the next amount.</b> Each bid goes up by at least ${money(D.increment)}.</li><li><b>Trust only what’s confirmed.</b> You’re leading only after you see “You’re leading”.</li></ol></section>
    ${D.windows.length ? `<section class="prose"><h2>Bidding times</h2><ul class="win-list">${D.windows.map((w) => `<li><b>${esc(w.name)}</b>${esc(w.opens)} → ${esc(w.closes)}</li>`).join('')}</ul></section>` : ''}
    ${D.sponsors.length ? `<section class="prose"><h2>Sponsors</h2><ul class="sponsors">${D.sponsors.map((s) => `<li>${sq(s, 40)}<span>${esc(s)}</span></li>`).join('')}</ul></section>` : ''}${link}
    <a class="btn-link center" href="#" data-go="entry">Back to the welcome page</a><p class="fine center" style="padding:18px 16px 0">Preview of your draft. Nothing is published.</p></main>` };
}

function render(top = false) {
  if (!D) { view.innerHTML = '<div class="empty big"><h1>Loading preview…</h1></div>'; return; }
  const y = window.scrollY, r = route.name === 'lot' ? lot(route.id) : route.name === 'lots' ? lots() : route.name === 'event' ? event() : entry();
  view.innerHTML = r.html; shell.dataset.chrome = r.chrome; tabbar.innerHTML = r.chrome === 'tabs' ? tabs(r.tab) : '';
  if (top) { window.scrollTo(0, 0); view.querySelector('h1')?.focus({ preventScroll: true }); } else window.scrollTo(0, y);
  parent.postMessage({ type: 'screen', name: route.name }, location.origin);
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); const n = g.dataset.go; goto({ name: n }, { push: n === 'entry' ? false : route.name === 'entry' }); if (n === 'entry') stack = []; return; }
  const l = e.target.closest('[data-lot]'); if (l) { e.preventDefault(); goto({ name: 'lot', id: l.dataset.lot }, { push: true }); return; }
  if (e.target.closest('[data-back]')) { e.preventDefault(); back(); return; }
  const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; render(); return; }
  if (e.target.closest('[data-bid]')) { bidNote = true; render(); document.querySelector('.note-inline')?.scrollIntoView({ block: 'center' }); }
});
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'data') return;
  D = e.data.data;
  if (e.data.reset) { route = { name: 'entry' }; stack = []; cat = 'All'; bidNote = false; render(true); } else render();
});
render();
parent.postMessage({ type: 'ready' }, location.origin);
