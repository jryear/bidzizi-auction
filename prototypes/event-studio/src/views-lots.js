// Lots, Bidding windows, and the editor sheets (lot, window, assign lots, categories, create event).
import { esc, icon, badge, lbl, assume, square, circle, simTag } from './ui.js';
import { fmtDT, fmtTime, fmtDateShort, dollars, lotNo, plural, photo, photoSrc, PHOTOS, windowOf, windowState, unassigned, validWindows, validateWindow, overlaps, NOW_LABEL, TZ, NOW } from './model.js';
import { href, pageHead, field } from './views-common.js';

const thumb = (l, cls = '') => `<div class="thumb ${cls}">${l.image ? `<img src="${photoSrc(l.image)}" alt="" width="160" height="107" loading="lazy" decoding="async">` : `<span class="thumb-none" title="No photo">${icon('image')}</span>`}<span class="lotno sm" aria-hidden="true">${lotNo(l.number)}</span></div>`;

// ---- filters -----------------------------------------------------------------------------------
export function filterLots(ev, q, search = '') {
  const f = q.get('f') || 'all', cat = q.get('cat') || '', win = q.get('win') || '', s = search.trim().toLowerCase();
  return ev.lots.filter((l) => {
    if (f === 'unassigned' && windowOf(ev, l)) return false;
    if (f === 'nocat' && ev.categories.some((c) => c.id === l.categoryId)) return false;
    if (f === 'nophoto' && l.image) return false;
    if (cat === '_none' ? ev.categories.some((c) => c.id === l.categoryId) : cat && l.categoryId !== cat) return false;
    if (win === '_none' ? windowOf(ev, l) : win && l.windowId !== win) return false;
    if (s && !`lot ${lotNo(l.number)} ${l.title} ${l.short}`.toLowerCase().includes(s)) return false;
    return true;
  }).sort((a, b) => a.number - b.number);
}
const qs = (q, patch) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } n.delete('sheet'); const s = n.toString(); return s ? `?${s}` : ''; };

// ---- Lots page -------------------------------------------------------------------------------
export function lots(ev, q, view) {
  const f = q.get('f') || 'all', all = ev.lots, shown = filterLots(ev, q, view.search);
  const un = unassigned(ev).length, nocat = all.filter((l) => !ev.categories.some((c) => c.id === l.categoryId)).length, nophoto = all.filter((l) => !l.image).length;
  const ws = validWindows(ev);
  const chip = (id, label, n, tone = '') => `<a class="chip${f === id ? ' on' : ''} ${tone}" href="${href(ev.id, 'lots', qs(q, { f: id === 'all' ? '' : id }))}" ${f === id ? 'aria-current="true"' : ''} data-key="chip-${id}">${label} <b>${n}</b></a>`;
  const sel = [...view.sel].filter((id) => all.some((l) => l.id === id));
  const bulk = sel.length ? `<div class="bulkbar" role="region" aria-label="Selected lots"><b>${plural(sel.length, 'lot')} selected</b>
    <span class="bulk-g"><label class="sr" for="bulk-win">Window</label><select id="bulk-win" data-bulk-win><option value="">Assign to window…</option>${ws.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}<option value="_none">Remove from window</option></select><button type="button" class="btn sm primary" data-action="bulk-window">Apply</button></span>
    <span class="bulk-g"><label class="sr" for="bulk-cat">Category</label><select id="bulk-cat" data-bulk-cat><option value="">Set category…</option>${ev.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="_none">No category</option></select><button type="button" class="btn sm primary" data-action="bulk-category">Apply</button></span>
    <button type="button" class="btn sm quiet" data-action="bulk-dup">${icon('dup', 'sm')} Duplicate</button><button type="button" class="btn sm quiet danger" data-action="bulk-del">${icon('trash', 'sm')} Delete</button><button type="button" class="btn-link" data-action="bulk-clear">Clear</button></div>` : '';

  const band = un && f !== 'unassigned' ? `<div class="alertband">${icon('alert')}<div><b>${plural(un, 'lot')} ${un === 1 ? 'isn’t' : 'aren’t'} in a bidding window.</b> Bidders can’t bid on ${un === 1 ? 'it' : 'them'} until ${un === 1 ? 'it is' : 'they are'} assigned.</div><a class="btn sm quiet" href="${href(ev.id, 'lots', qs(q, { f: 'unassigned' }))}">Show them</a></div>`
    : f === 'unassigned' && un ? `<div class="alertband">${icon('alert')}<div><b>${plural(un, 'lot')} to place.</b> ${ws.length ? 'Assign them one at a time below, or all at once:' : 'Create a bidding window first, then assign these.'}</div>${ws.length ? `<span class="quickfix"><label class="sr" for="qa-${ev.id}">Window</label><select id="qa-${ev.id}" data-quick-window>${ws.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select><button type="button" class="btn sm primary" data-action="assign-unassigned">Assign all ${un}</button></span>` : `<a class="btn sm primary" href="${href(ev.id, 'windows', '?sheet=window:new')}">Create a window</a>`}</div>`
    : f === 'unassigned' && !un ? `<div class="okband">${icon('check')}<div><b>Every lot is in a bidding window.</b></div></div>` : '';

  const rows = shown.map((l) => {
    const w = windowOf(ev, l);
    return `<li class="lrow${w ? '' : ' unassigned'}" data-lot="${l.id}">
      <label class="selbox"><input type="checkbox" id="sel-${l.id}" data-sel value="${l.id}" ${view.sel.has(l.id) ? 'checked' : ''} aria-label="Select Lot ${lotNo(l.number)}"></label>
      ${thumb(l)}
      <div class="lt"><button type="button" class="lt-title" data-action="lot-edit" data-id="${l.id}" data-key="edit-${l.id}">${esc(l.title)}</button><span class="lt-short">${l.short ? esc(l.short) : '<i>No short line</i>'}</span></div>
      <div class="lc"><label class="sr" for="cat-${l.id}">Category for Lot ${lotNo(l.number)}</label><select id="cat-${l.id}" data-lot-cat="${l.id}" class="${ev.categories.some((c) => c.id === l.categoryId) ? '' : 'empty-sel'}"><option value="">No category</option>${ev.categories.map((c) => `<option value="${c.id}"${c.id === l.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="lw"><label class="sr" for="win-${l.id}">Bidding window for Lot ${lotNo(l.number)}</label><select id="win-${l.id}" data-lot-win="${l.id}" class="${w ? '' : 'attn-sel'}"><option value="">Unassigned</option>${validWindows(ev).map((x) => `<option value="${x.id}"${x.id === l.windowId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <span class="lo" title="Opening bid">${dollars(l.opening)}</span>
      <span class="lact"><button type="button" class="icon-btn" data-action="lot-dup" data-key="dup-${l.id}" data-id="${l.id}" aria-label="Duplicate Lot ${lotNo(l.number)}" title="Duplicate">${icon('dup')}</button><button type="button" class="icon-btn" data-action="lot-del" data-key="del-${l.id}" data-id="${l.id}" aria-label="Delete Lot ${lotNo(l.number)}" title="Delete">${icon('trash')}</button></span></li>`;
  }).join('');

  const filtersOn = f !== 'all' || q.get('cat') || q.get('win') || view.search;
  const empty = !all.length ? `<div class="empty big"><h2>No lots yet</h2><p>Add the first lot, then duplicate it to speed up similar ones. You can sort lots into categories and bidding windows afterwards.</p><div><button type="button" class="btn primary" data-action="lot-new" data-key="empty-add">${icon('plus', 'sm')} Add the first lot</button></div></div>`
    : `<div class="empty big"><h2>No lots match these filters</h2><p>${plural(all.length, 'lot')} in this event.</p><div><a class="btn quiet" href="${href(ev.id, 'lots')}" data-action="clear-search">Show all lots</a></div></div>`;

  return pageHead('Lots', `${plural(all.length, 'lot')}. Categories help bidders browse; bidding windows decide when each lot can be bid on. They’re separate. ${assume('S6')}`,
    `<button type="button" class="btn quiet" data-action="categories" data-key="cats">${icon('tag', 'sm')} Categories</button><button type="button" class="btn primary" data-action="lot-new" data-key="add-lot">${icon('plus', 'sm')} Add lot</button>`) + band + `
  <div class="filters"><div class="chips" role="group" aria-label="Quick filters">${chip('all', 'All', all.length)}${chip('unassigned', 'Unassigned', un, un ? 't-attn' : '')}${chip('nocat', 'No category', nocat)}${chip('nophoto', 'No photo', nophoto)}</div>
    <div class="filter-sel"><label class="search"><span class="sr">Search lots</span>${icon('search')}<input type="search" id="lot-search" data-search value="${esc(view.search)}" placeholder="Search lots" autocomplete="off"></label>
      <label class="sr" for="fc">Category</label><select id="fc" data-filter="cat"><option value="">All categories</option>${ev.categories.map((c) => `<option value="${c.id}"${q.get('cat') === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="_none"${q.get('cat') === '_none' ? ' selected' : ''}>No category</option></select>
      <label class="sr" for="fw">Window</label><select id="fw" data-filter="win"><option value="">All windows</option>${validWindows(ev).map((w) => `<option value="${w.id}"${q.get('win') === w.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}<option value="_none"${q.get('win') === '_none' ? ' selected' : ''}>Unassigned</option></select></div></div>
  ${bulk}${shown.length ? `<div class="lcontainer"><div class="lhead"><span class="sa"><input type="checkbox" id="sel-all" aria-label="Select all ${shown.length} lots shown" data-sel-all ${shown.length && shown.every((l) => view.sel.has(l.id)) ? 'checked' : ''}><span class="sa-l" aria-hidden="true">Select all</span></span><span></span><span aria-hidden="true">Lot</span><span aria-hidden="true">Category</span><span aria-hidden="true">Bidding window</span><span class="r" aria-hidden="true">Opening bid</span><span></span></div>
  <ol class="ltable">${rows}</ol></div><p class="fine center pt">${filtersOn ? `Showing ${shown.length} of ${all.length}.` : 'Lot numbers follow the order lots were added; reordering isn’t part of this prototype.'}</p>` : empty}`;
}

// ---- Bidding windows ---------------------------------------------------------------------------
const mins = (dt) => Math.round(new Date(`${dt}:00Z`).getTime() / 60000);
const dur = (a, b) => { const m = mins(b) - mins(a); if (m <= 0) return ''; const h = Math.floor(m / 60), r = m % 60; return h >= 24 ? `${Math.round(h / 24)} days` : `${h ? `${h} hr` : ''}${h && r ? ' ' : ''}${r ? `${r} min` : ''}`; };

function timeline(ev) {
  const d = ev.details, ws = validWindows(ev), bars = [];
  const evStart = d.date && d.start ? `${d.date}T${d.start}` : null, evEnd = d.date && (d.end && d.end > d.start) ? `${d.date}T${d.end}` : evStart;
  if (evStart) bars.push({ kind: 'ev', label: 'Event', a: evStart, b: evEnd, text: `${fmtTime(d.start)}${evEnd !== evStart ? ' – ' + fmtTime(d.end) : ''}` });
  ws.forEach((w) => bars.push({ kind: 'win', label: w.name, a: w.opens, b: w.closes, text: `${fmtTime(w.opens.slice(11))} – ${fmtTime(w.closes.slice(11))}` }));
  if (!bars.length) return '';
  const lo = Math.min(...bars.map((b) => mins(b.a))), hi = Math.max(...bars.map((b) => mins(b.b))), span = Math.max(hi - lo, 60), pad = span * 0.06, L = lo - pad, R = hi + pad;
  const pos = (m) => ((m - L) / (R - L)) * 100;
  const sameDay = bars.every((b) => b.a.slice(0, 10) === bars[0].a.slice(0, 10) && b.b.slice(0, 10) === bars[0].a.slice(0, 10));
  return `<section class="panel timeline" aria-labelledby="h-tl"><div class="panel-head"><h2 id="h-tl">Event time and bidding time</h2></div>
    <p class="sub">The dashed bar is when people gather. The solid bars are when bidding is open. They don’t have to match.${sameDay ? ` All on ${esc(fmtDateShort(bars[0].a.slice(0, 10)))}.` : ''}</p>
    <div class="tl">${bars.map((b) => { const l = pos(mins(b.a)), w = Math.max(pos(mins(b.b)) - l, 1.2); return `<div class="tl-row"><span class="tl-l">${esc(b.label)}</span><div class="tl-track"><i class="tl-bar ${b.kind}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%" title="${esc(b.label)}: ${esc(fmtDT(b.a))} to ${esc(fmtDT(b.b))}"><span>${esc(b.text)}</span></i></div></div>`; }).join('')}</div></section>`;
}

export function windows(ev) {
  const un = unassigned(ev), ws = ev.windows, ok = validWindows(ev);
  const unCard = !ev.lots.length ? '' : un.length
    ? `<section class="panel attn" aria-labelledby="h-un"><div class="panel-head"><h2 id="h-un">${icon('alert')} Unassigned lots <span class="count">${un.length}</span></h2></div><p class="sub">These aren’t in any bidding window, so bidders can’t bid on them. ${assume('S1')}</p>
      <ul class="chiplots">${un.map((l) => `<li>${thumb(l, 'xs')}<span>${esc(l.title.length > 44 ? l.title.slice(0, 43) + '…' : l.title)}</span></li>`).join('')}</ul>
      ${ok.length ? `<div class="quickfix wide"><label for="qa-${ev.id}">Put all ${un.length} in</label><select id="qa-${ev.id}" data-quick-window data-key="qa-sel">${ok.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select><button type="button" class="btn primary" data-action="assign-unassigned" data-key="qa-btn">Assign ${un.length}</button><a class="btn quiet" href="${href(ev.id, 'lots', '?f=unassigned')}">Pick one by one</a></div>` : `<p class="fine">Create a window below first.</p>`}</section>`
    : `<div class="okband">${icon('check')}<div><b>Every lot is in a bidding window.</b> ${assume('S1')}</div></div>`;
  const cards = ws.map((w) => {
    const errs = validateWindow(w), mine = ev.lots.filter((l) => l.windowId === w.id), st = Object.keys(errs).length ? null : windowState(w);
    return `<li class="wcard${errs.name || errs.closes || errs.opens ? ' invalid' : ''}" data-window="${w.id}"><div class="w-top"><div><h3>${esc(w.name || 'Untitled window')}</h3><p class="w-times">${w.opens ? esc(fmtDT(w.opens)) : '—'} <span aria-hidden="true">→</span><span class="sr"> to </span> ${w.closes ? esc(fmtDT(w.closes)) : '—'}${w.opens && w.closes && !errs.closes ? ` <span class="dim">· ${dur(w.opens, w.closes)}</span>` : ''}</p></div>
      ${st ? badge(st === 'open' ? 'done' : st === 'closed' ? 'optional' : 'todo', st === 'open' ? 'Open now' : st === 'closed' ? 'Closed' : 'Scheduled') : badge('attention', 'Needs fixing')}</div>
      ${Object.values(errs).length ? `<p class="err">${esc(Object.values(errs)[0])}</p>` : ''}
      ${mine.length ? `<ul class="chiplots">${mine.slice(0, 6).map((l) => `<li>${thumb(l, 'xs')}<span>${esc(l.title.length > 36 ? l.title.slice(0, 35) + '…' : l.title)}</span></li>`).join('')}${mine.length > 6 ? `<li class="more">+${mine.length - 6} more</li>` : ''}</ul>` : '<div class="empty slim">No lots in this window yet.</div>'}
      <div class="w-act"><button type="button" class="btn sm primary" data-action="win-assign" data-id="${w.id}">${icon('lots', 'sm')} Assign lots <span class="n">${mine.length}</span></button><button type="button" class="btn sm quiet" data-action="win-edit" data-id="${w.id}">${icon('edit', 'sm')} Edit times</button><button type="button" class="btn sm quiet danger" data-action="win-del" data-id="${w.id}">${icon('trash', 'sm')} Delete</button></div></li>`;
  }).join('');
  const ov = overlaps(ev);
  return pageHead('Bidding windows', `When bidders can place bids. Separate from lot categories and from the physical event. Times are ${TZ}. ${assume('S1')}`, `<button type="button" class="btn primary" data-action="win-new" data-key="add-window">${icon('plus', 'sm')} Add window</button>`) + unCard + timeline(ev)
    + (ov.length ? `<div class="alertband soft">${icon('info')}<div>${ov.map(([a, b]) => `“${esc(a.name)}” and “${esc(b.name)}”`).join('; ')} overlap. That’s allowed here; check it’s intended.</div></div>` : '')
    + (ws.length ? `<ol class="wlist">${cards}</ol>` : `<div class="empty big"><h2>No bidding windows yet</h2><p>A window is a period when bidding is open. Most events need one; use several for rounds, like a silent round followed by a final round. Each lot is in exactly one window. ${assume('S3')}</p><div><button type="button" class="btn primary" data-action="win-new" data-key="empty-win">${icon('plus', 'sm')} Create the first window</button></div></div>`)
    + `<p class="fine pt">Prototype clock: ${NOW_LABEL}. Statuses are relative to it.</p>`;
}

// ---- Sheets -----------------------------------------------------------------------------------
export function sheetFrame(title, body, foot = '', { id = 'sheet-title', wide = false } = {}) {
  return `<div class="sheet-in${wide ? ' wide' : ''}"><div class="sheet-head"><h2 id="${id}" tabindex="-1">${esc(title)}</h2><button type="button" class="x" data-action="sheet-close" aria-label="Close">${icon('close')}</button></div>
    <div class="sheet-scroll">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</div>`;
}
const dirtyBar = (dirty) => (dirty ? `<div class="alertband soft" id="dirty-bar" role="alert">${icon('alert')}<div><b>Discard your changes?</b> You haven’t saved them.</div><span class="bulk-g"><button type="button" class="btn sm quiet" data-action="sheet-keep">Keep editing</button><button type="button" class="btn sm primary" data-action="sheet-discard">Discard</button></span></div>` : '');

export function sheetLot(ev, d, errs = {}, { isNew, confirmClose = false } = {}) {
  const ws = validWindows(ev);
  const tile = (id, label, src) => `<button type="button" class="photo sm${d.image === id ? ' on' : ''}" data-action="sheet-photo" data-id="${id ?? ''}" aria-pressed="${d.image === id}">${src ? `<img src="${src}" alt="" width="200" height="133" loading="lazy">` : `<span class="photo-none">${icon('close')}</span>`}<span>${esc(label)}</span></button>`;
  const body = `${dirtyBar(confirmClose)}<form id="lot-form" data-form="lot" novalidate>
    ${field('l-title', 'Title', `<input id="l-title" name="title" type="text" value="${esc(d.title)}" maxlength="160" autocomplete="off" aria-describedby="err-l-title">`, { error: errs.title })}
    ${field('l-short', 'Short line', `<input id="l-short" name="short" type="text" value="${esc(d.short)}" maxlength="100" autocomplete="off" placeholder="Shown under the title on lot cards">`, { opt: true, error: errs.short })}
    ${field('l-desc', 'Description', `<textarea id="l-desc" name="description" rows="4" maxlength="1300">${esc(d.description)}</textarea>`, { opt: true, error: errs.description })}
    <div class="row2">${field('l-cat', 'Category', `<select id="l-cat" name="categoryId"><option value="">No category</option>${ev.categories.map((c) => `<option value="${c.id}"${c.id === d.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`, { hint: 'Helps bidders browse. Manage the list from Lots → Categories.' })}
      ${field('l-win', 'Bidding window', `<select id="l-win" name="windowId"><option value="">Unassigned (not biddable)</option>${ws.map((w) => `<option value="${w.id}"${w.id === d.windowId ? ' selected' : ''}>${esc(w.name)} · ${esc(fmtDT(w.opens))}</option>`).join('')}</select>`, { hint: `A lot is in one window. ${assume('S1')}` })}</div>
    <div class="row2">${field('l-open', 'Opening bid', `<div class="money"><span>$</span><input id="l-open" name="opening" type="text" inputmode="decimal" value="${esc(d.openingRaw ?? d.opening / 100)}" autocomplete="off"></div>`, { error: errs.opening, hint: `With no bids, the first bid is this amount. ${assume('S5')}` })}
      ${field('l-sp', 'Donated by', `<select id="l-sp" name="sponsorId"><option value="">Not credited</option>${ev.sponsors.map((s) => `<option value="${s.id}"${s.id === d.sponsorId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`, { opt: true, hint: ev.sponsors.length ? 'From the event sponsors.' : 'Add sponsors on the Event page first.' })}</div>
    <div class="field"><span class="lbl-d" id="l-photo-l">Photo</span><div class="photos small" role="group" aria-labelledby="l-photo-l">${tile(null, 'No photo', '')}${PHOTOS.map((p) => tile(p.id, p.label, photoSrc(p.id))).join('')}</div></div>
    <button type="submit" class="sr" tabindex="-1">Save</button></form>`;
  const foot = `<button type="button" class="btn quiet" data-action="sheet-close">Cancel</button>${isNew ? '<button type="button" class="btn quiet" data-action="lot-save-another" data-key="save-another">Save and add another</button>' : ''}<button type="submit" form="lot-form" class="btn primary" data-action="lot-save" data-key="save">${isNew ? 'Add lot' : 'Save lot'}</button>`;
  return sheetFrame(isNew ? 'Add a lot' : `Edit Lot ${lotNo(d.number)}`, body, foot, { wide: true });
}

export function sheetWindow(ev, d, errs = {}, { isNew, confirmClose = false } = {}) {
  const dt = ev.details;
  const body = `${dirtyBar(confirmClose)}<form id="win-form" data-form="window" novalidate>
    ${field('w-name', 'Name', `<input id="w-name" name="name" type="text" value="${esc(d.name)}" maxlength="60" placeholder="Silent round" autocomplete="off">`, { error: errs.name })}
    <div class="row2">${field('w-open', 'Bidding opens', `<input id="w-open" name="opens" type="datetime-local" value="${esc(d.opens)}">`, { error: errs.opens })}${field('w-close', 'Bidding closes', `<input id="w-close" name="closes" type="datetime-local" value="${esc(d.closes)}">`, { error: errs.closes })}</div>
    <p class="hint">Times are ${TZ}. ${dt.date ? `The event itself is ${esc(fmtDateShort(dt.date))}${dt.start ? `, ${esc(fmtTime(dt.start))}${dt.end ? '–' + esc(fmtTime(dt.end)) : ''}` : ''}. Bidding can run at other times.` : 'Set the event date on the Event page to compare.'}</p>
    <button type="submit" class="sr" tabindex="-1">Save</button></form>`;
  const foot = `<button type="button" class="btn quiet" data-action="sheet-close">Cancel</button><button type="submit" form="win-form" class="btn primary" data-action="win-save" data-key="save">${isNew ? 'Add window' : 'Save window'}</button>`;
  return sheetFrame(isNew ? 'Add a bidding window' : 'Edit bidding window', body, foot);
}

export function sheetAssign(ev, w, picked) {
  const group = (title, items, note = '') => (items.length ? `<div class="pickgroup"><div class="pg-head"><h3>${title}</h3>${note ? `<span class="fine">${note}</span>` : ''}</div>${items.map((l) => `<label class="pick"><input type="checkbox" name="lot" value="${l.id}" ${picked.has(l.id) ? 'checked' : ''}>${thumb(l, 'xs')}<span class="pk-t"><b>Lot ${lotNo(l.number)}</b> ${esc(l.title.length > 60 ? l.title.slice(0, 59) + '…' : l.title)}</span>${windowOf(ev, l) && l.windowId !== w.id ? `<em class="pk-w">now in ${esc(windowOf(ev, l).name)}</em>` : ''}</label>`).join('')}</div>` : '');
  const un = ev.lots.filter((l) => !windowOf(ev, l)), here = ev.lots.filter((l) => l.windowId === w.id), other = ev.lots.filter((l) => windowOf(ev, l) && l.windowId !== w.id);
  const body = `<p class="sub">Choose the lots for “${esc(w.name)}”. A lot is in one window, so picking one from another window moves it. ${assume('S1')}</p>
    ${ev.lots.length ? `<form id="assign-form" data-form="assign">${group('Not in a window', un, `${un.length}`)}${group('In this window', here)}${group('In other windows', other, 'moves them here')}</form>` : '<div class="empty slim">Add lots first.</div>'}`;
  const foot = `<button type="button" class="btn quiet" data-action="assign-all-un">Select all unassigned</button><span class="grow"></span><button type="button" class="btn quiet" data-action="sheet-close">Cancel</button><button type="submit" form="assign-form" class="btn primary" data-action="assign-save" data-key="save">Save</button>`;
  return sheetFrame(`Assign lots to ${w.name}`, body, foot, { wide: true });
}

export function sheetCategories(ev, err = '', rowErr = {}) {
  const body = `<p class="sub">Categories group lots for browsing. They’re independent of bidding windows. A lot has at most one. ${assume('S6')}</p>
    ${ev.categories.length ? `<ul class="catlist">${ev.categories.map((c) => { const n = ev.lots.filter((l) => l.categoryId === c.id).length; return `<li><div class="field grow"><label class="sr" for="cn-${c.id}">Category name</label><input id="cn-${c.id}" type="text" data-cat-name="${c.id}" value="${esc(c.name)}" maxlength="40" autocomplete="off"><p class="err" id="err-cn-${c.id}" role="alert"${rowErr[c.id] ? '' : ' hidden'}>${esc(rowErr[c.id] || '')}</p></div><span class="count">${plural(n, 'lot')}</span><button type="button" class="btn sm quiet danger" data-action="cat-del" data-id="${c.id}" aria-label="Delete category ${esc(c.name)}">${icon('trash', 'sm')} Delete</button></li>`; }).join('')}</ul>` : '<div class="empty slim">No categories yet.</div>'}
    <form class="addrow" data-form="category" novalidate><div class="field grow"><label for="c-new">New category</label><input id="c-new" name="name" type="text" maxlength="40" autocomplete="off" placeholder="Getaways"><p class="err" id="err-c-new" role="alert"${err ? '' : ' hidden'}>${esc(err)}</p></div><button class="btn primary" type="submit">${icon('plus', 'sm')} Add</button></form>
    <p class="hint">Deleting a category keeps its lots; they just have no category (you can undo it).</p>`;
  return sheetFrame('Categories', body, `<button type="button" class="btn primary" data-action="sheet-close">Done</button>`);
}

export function sheetCreateEvent(d, errs = {}) {
  const body = `<form id="ev-form" data-form="create-event" novalidate><p class="sub">Starts empty: you’ll get a checklist of what to do next. Everything can be changed later.</p>
    ${field('c-name', 'Event name', `<input id="c-name" name="name" type="text" value="${esc(d.name)}" maxlength="80" placeholder="Spring Gala Auction" autocomplete="off">`, { error: errs.name })}
    ${field('c-date', 'Event date', `<input id="c-date" name="date" type="date" value="${esc(d.date)}">`, { opt: true, hint: 'When people gather. Bidding times are set separately.' })}
    <button type="submit" class="sr" tabindex="-1">Create</button></form>`;
  return sheetFrame('Create an event', body, `<button type="button" class="btn quiet" data-action="sheet-close">Cancel</button><button type="submit" form="ev-form" class="btn primary" data-action="event-create" data-key="save">Create event</button>`);
}

export function sheetConfirm(title, text, confirmLabel, action, data = '') {
  return sheetFrame(title, `<p class="lead">${text}</p>`, `<button type="button" class="btn quiet" data-action="sheet-close">Cancel</button><button type="button" class="btn primary danger-fill" data-action="${action}" ${data} data-key="confirm">${esc(confirmLabel)}</button>`);
}
export { circle, square, simTag, lbl };
