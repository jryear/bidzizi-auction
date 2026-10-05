// Events list, Attendee access, Displays, Notifications, Donations.
import { esc, icon, badge, lbl, assume, square, circle, simTag } from './ui.js';
import { qrSvg } from './qr.js';
import { ORG, eventLink, fmtDate, fmtDateShort, fmtTime, fmtDT, dollars, lotNo, plural, photoSrc, windowOf, validWindows, displayChanges, displaySlides, smsChecks, validUrl, analyze, NOW_LABEL, TZ, defaultDisplay } from './model.js';
import { transient, reviewState } from './store.js';
import { href, pageHead, field, progressSegments } from './views-common.js';
import { sheetFrame } from './views-lots.js';

// ---- Events (the organization's home) ----------------------------------------------------------
export function eventsList(events) {
  const cards = events.map((ev) => {
    const a = analyze(ev), rs = reviewState(ev), hero = ev.details.heroImage;
    const status = rs === 'current' ? badge('done', 'Reviewed') : a.ready ? badge('suggest', 'Ready to review') : a.required.length && a.doneReq === 0 ? badge('todo', 'Just started') : badge('attention', `${a.required.length - a.doneReq} to finish`);
    return `<li class="evcard" data-event="${ev.id}"><a class="ev-link" href="${href(ev.id, 'overview')}" aria-label="Open ${esc(ev.name)} in Event Studio" data-key="open-${ev.id}">
      <div class="ev-media">${hero ? `<img src="${photoSrc(hero)}" alt="" width="600" height="400" loading="lazy">` : `<span class="ev-none">${icon('image')}<span>No heading image yet</span></span>`}</div>
      <div class="ev-body"><p class="cat">${ev.details.date ? esc(fmtDateShort(ev.details.date)) : 'No date yet'}</p><h2 class="ev-title">${esc(ev.name)}</h2>
        <div class="ev-meter" aria-hidden="true">${a.required.map((s) => `<i class="${s.done ? 'done' : s.status === 'attention' ? 'attn' : ''}"></i>`).join('')}</div>
        <p class="ev-line"><b>${a.doneReq} of ${a.required.length}</b> required steps · ${plural(ev.lots.length, 'lot')} · ${plural(ev.windows.length, 'window')}</p>
        <div class="ev-foot">${status}<span class="ev-open">Open ${icon('right', 'sm')}</span></div></div></a></li>`;
  }).join('');
  return pageHead('Events', `Everything ${esc(ORG.name)} is running. Each event is separate: its own lots, windows, and settings.`, `<button type="button" class="btn primary" data-action="event-new" data-key="new-event">${icon('plus', 'sm')} Create event</button>`)
    + `<ul class="evgrid">${cards}</ul><p class="fine center pt">Fictional organization and data. Stored in this browser only. ${assume('S12')}</p>`;
}

// ---- Attendee access ----------------------------------------------------------------------------
export function access(ev) {
  const link = eventLink(ev), ws = validWindows(ev), first = ws.map((w) => w.opens).sort()[0];
  const state = first ? `Until bidding opens (${esc(fmtDT(first))}) attendees see only the welcome page.` : 'No bidding window yet: attendees would see only the welcome page.';
  return pageHead('Attendee access', `One link and QR code for the whole event. ${assume('S7')}`) + `
  <div class="access-grid"><section class="panel qrpanel" aria-labelledby="h-qr"><div class="panel-head"><h2 id="h-qr">Event QR code</h2>${badge('sim', 'Fictional link')}</div>
      <div class="qrbox">${qrSvg(link, { label: `QR code for ${ev.name}` })}</div>
      <label class="linkfield" for="a-link"><span class="lbl">Event link</span><input id="a-link" type="text" readonly value="${esc(link)}" data-select-all></label>
      <div class="qr-act"><button type="button" class="btn quiet" data-action="copy-link" data-key="copy">${icon('copy', 'sm')} Copy link</button><button type="button" class="btn primary" data-action="print-qr" data-key="print">${icon('printer', 'sm')} Print sign</button><button type="button" class="btn primary" data-action="present-qr" data-key="present">${icon('expand', 'sm')} Present on iPad</button></div>
      <p class="fine">${state}</p></section>
    <section class="panel" aria-labelledby="h-what"><div class="panel-head"><h2 id="h-what">What this code is</h2></div>
      <ul class="isnot"><li class="yes">${icon('check', 'sm')}<span>One shared link for everyone. Print it, or show it on an iPad at the door.</span></li><li class="yes">${icon('check', 'sm')}<span>Takes people to this event’s welcome page, and to the lots once bidding opens.</span></li><li class="no">${icon('close', 'sm')}<span><b>Not a ticket.</b> It doesn’t admit anyone or prove who they are.</span></li><li class="no">${icon('close', 'sm')}<span><b>Not a bidder credential.</b> Anyone with the link can open it. Who may bid is decided separately, when someone first bids.</span></li></ul>
      <p class="fine">The address uses a fictional domain, so scanning it won’t open a real page. Real link format, and whether it can be rotated, are undecided.</p></section></div>`;
}
export function sheetPrint(ev) {
  const link = eventLink(ev);
  const body = `<div class="poster" id="poster"><p class="p-host">${esc(ORG.name)} presents</p><h3>${esc(ev.name)}</h3>${ev.details.date ? `<p class="p-when">${esc(fmtDate(ev.details.date))}${ev.details.start ? ` · ${esc(fmtTime(ev.details.start))}` : ''}</p>` : ''}
    <div class="p-qr">${qrSvg(link, { label: `QR code for ${ev.name}` })}</div><p class="p-scan">Scan to browse the lots and bid</p><p class="p-link">${esc(link)}</p><p class="p-fine">One code for everyone at the event. It isn’t a ticket.</p></div>`;
  return sheetFrame('Print the QR sign', `<p class="sub no-print">This is how the page prints: one sign, black on white. Your browser’s print dialog opens when you press Print.</p>${body}`, `<button type="button" class="btn quiet" data-action="sheet-close">Close</button><button type="button" class="btn primary" data-action="print-now" data-key="print-now">${icon('printer', 'sm')} Print</button>`, { wide: true });
}
export function sheetPresent(ev) {
  const link = eventLink(ev);
  return `<div class="presenting"><button type="button" class="x light" data-action="sheet-close" aria-label="Stop presenting" data-key="stop">${icon('close')}</button><p class="p-host">${esc(ORG.name)} presents</p><h2 id="sheet-title" tabindex="-1">${esc(ev.name)}</h2><div class="p-qr">${qrSvg(link, { label: `QR code for ${ev.name}` })}</div><p class="p-scan">Scan to browse the lots and bid</p><p class="p-link">${esc(link)}</p><button type="button" class="btn quiet" data-action="fullscreen">${icon('expand', 'sm')} Full screen</button></div>`;
}

// ---- Displays: draft vs applied ------------------------------------------------------------------
export function renderDisplay(ev, cfg, slide, lotIdx = 0) {
  const link = eventLink(ev), d = ev.details, qr = (cls) => (cfg.qr ? `<div class="sc-qr ${cls}">${qrSvg(link, { label: 'Event QR code' })}${cls === 'big' ? '<p>Scan to browse and bid</p>' : ''}</div>` : '');
  const lotsAssigned = ev.lots.filter((l) => windowOf(ev, l)).sort((a, b) => a.number - b.number);
  let inner = '';
  if (slide === 'welcome') inner = `<div class="sc-welcome"><div class="sc-hero">${d.heroImage ? `<img src="${photoSrc(d.heroImage)}" alt="">` : `<span>${icon('image')}</span>`}</div><div class="sc-text"><p class="sc-host">${esc(ORG.name)} presents</p><h3>${esc(ev.name)}</h3><p class="sc-when">${d.date ? esc(fmtDateShort(d.date)) : 'Date to be set'}${d.start ? ` · ${esc(fmtTime(d.start))}` : ''}</p>${d.welcomeTitle ? `<p class="sc-wt">${esc(d.welcomeTitle)}</p>` : ''}</div>${qr('big')}</div>`;
  else if (slide === 'lots') { const l = lotsAssigned[lotIdx % Math.max(lotsAssigned.length, 1)]; inner = l ? `<div class="sc-lot"><div class="sc-photo">${l.image ? `<img src="${photoSrc(l.image)}" alt="">` : `<span>${icon('image')}</span>`}<i class="sc-no"><small>Lot</small>${lotNo(l.number)}</i></div><div class="sc-text"><p class="sc-host">${esc(ev.categories.find((c) => c.id === l.categoryId)?.name || 'Lot')}</p><h3>${esc(l.title)}</h3>${l.short ? `<p class="sc-short">${esc(l.short)}</p>` : ''}<p class="sc-open"><small>Opening bid</small>${dollars(l.opening)}</p></div>${qr('corner')}</div>` : `<div class="sc-empty"><p>No lots are in a bidding window yet.</p></div>`; }
  else if (slide === 'sponsors') inner = `<div class="sc-sponsors"><h3>Thank you to our sponsors</h3><ul>${ev.sponsors.map((s) => `<li>${square(s.name, 64)}<span>${esc(s.name)}</span></li>`).join('')}</ul>${qr('corner')}</div>`;
  return `<div class="screen th-${cfg.theme}" role="img" aria-label="Display preview: ${esc(slide)} slide">${inner}</div>`;
}

export function displayPreview(ev, view) {
  const disp = ev.displays, showApplied = view.dispView === 'applied', cfg = showApplied ? disp.applied : disp.draft;
  const slides = cfg ? displaySlides(ev, cfg) : [];
  const slide = slides.includes(ev.ui.slide) ? ev.ui.slide : slides[0];
  const lotCount = ev.lots.filter((l) => windowOf(ev, l)).length;
  return `<div class="dp-top"><div class="seg2" role="group" aria-label="Which version to preview"><button type="button" data-action="disp-view" data-v="draft" aria-pressed="${!showApplied}">Draft</button><button type="button" data-action="disp-view" data-v="applied" aria-pressed="${showApplied}">On screens now</button></div>${simTag('Simulated screen')}</div>
    ${cfg ? (slide ? `<div class="screen-frame">${renderDisplay(ev, cfg, slide, ev.ui.lotIdx || 0)}<span class="frame-tag">${showApplied ? 'Applied' : 'Draft'} · not shown on any real screen</span></div>
      <div class="dp-bar"><div class="slide-tabs" role="group" aria-label="Slide">${slides.map((s) => `<button type="button" class="chip${s === slide ? ' on' : ''}" data-action="slide" data-s="${s}" aria-pressed="${s === slide}">${{ welcome: 'Welcome', lots: 'Lots', sponsors: 'Sponsors' }[s]}</button>`).join('')}${slide === 'lots' && lotCount > 1 ? `<button type="button" class="icon-btn" data-action="lot-step" data-d="-1" aria-label="Previous lot">${icon('back')}</button><button type="button" class="icon-btn" data-action="lot-step" data-d="1" aria-label="Next lot">${icon('right')}</button>` : ''}</div>
        <button type="button" class="btn sm quiet" data-action="play" aria-pressed="${!!view.play}">${icon(view.play ? 'pause' : 'play', 'sm')} ${view.play ? 'Stop rotation' : `Preview rotation (${cfg.seconds} s)`}</button></div>`
      : `<div class="screen-frame empty"><p>All slides are turned off${disp.applied && showApplied ? '' : ' in this draft'}. Turn one on to preview it.</p></div>`)
      : `<div class="screen-frame empty"><p>Nothing has been applied yet. Screens would stay on their idle display. No real screens are connected in this prototype.</p></div>`}`;
}

export function displays(ev, view) {
  const disp = ev.displays, dr = disp.draft, ch = displayChanges(disp), ap = transient.applying[ev.id];
  const sw = (key, label, hint, disabled = false) => `<label class="switch"><input type="checkbox" id="sw-${key}" data-disp="${key}" ${dr[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="sw-t"><b>${label}</b><small>${hint}</small></span></label>`;
  const status = ap?.result === 'failed' ? `<div class="alertband" role="alert">${icon('alert')}<div><b>Couldn’t reach the simulated screens.</b> Nothing changed on screen and your draft is kept. (Failure forced from Review notes.)</div><span class="bulk-g"><button type="button" class="btn sm primary" data-action="disp-apply">Try again</button><button type="button" class="btn sm quiet" data-action="disp-dismiss">Dismiss</button></span></div>`
    : ap ? `<div class="alertband soft" role="status">${icon('spinner')}<div><b>Applying to the simulated screens…</b> Your draft isn’t on screen yet.</div></div>`
    : ch.length ? `<div class="alertband soft draftband" role="status">${icon('info')}<div><b>Draft not applied.</b> ${disp.applied ? `Screens still show the previous version. ${plural(ch.length, 'change')} waiting:` : 'Nothing has been applied yet, so no screen would show this. Apply it when the preview looks right.'}${disp.applied ? `<ul class="changes">${ch.map((c) => `<li><b>${esc(c.label)}</b> ${esc(c.from)} → ${esc(c.to)}</li>`).join('')}</ul>` : ''}</div><span class="bulk-g"><button type="button" class="btn primary" data-action="disp-apply" data-key="apply">Apply to screens</button>${disp.applied ? '<button type="button" class="btn quiet" data-action="disp-discard">Discard draft</button>' : ''}</span></div>`
    : `<div class="okband" role="status">${icon('check')}<div><b>Screens match this draft.</b> Applied ${esc(fmtDT(disp.appliedAt))}.</div></div>`;
  return pageHead('Displays', `Slides for TVs and projectors in the room. Edit a draft, watch the preview, then apply. ${assume('S8')}`, simTag('No screens connected'))
    + status + `<div class="disp-grid"><section class="panel" aria-labelledby="h-ds"><div class="panel-head"><h2 id="h-ds">Draft settings</h2></div>
      ${sw('welcome', 'Welcome and QR', 'Event name, date and the QR code')}${sw('lots', 'Featured lots', 'Cycles through lots that are in a bidding window')}${sw('sponsors', 'Sponsors', ev.sponsors.length ? `${plural(ev.sponsors.length, 'sponsor')}` : 'No sponsors yet, so this slide is skipped', !ev.sponsors.length)}
      <div class="field"><label for="d-sec">Seconds per slide</label><select id="d-sec" data-disp="seconds">${[8, 10, 12, 15, 20].map((s) => `<option value="${s}"${dr.seconds === s ? ' selected' : ''}>${s} seconds</option>`).join('')}</select></div>
      <div class="field"><span class="lbl-d" id="d-th">Theme</span><div class="seg2" role="group" aria-labelledby="d-th"><button type="button" data-action="disp-theme" data-v="ink" aria-pressed="${dr.theme === 'ink'}">Ink</button><button type="button" data-action="disp-theme" data-v="paper" aria-pressed="${dr.theme === 'paper'}">Paper</button></div></div>
      ${sw('qr', 'Show the QR code', 'On every slide')}<p class="fine pt">Edits change only the draft. Screens change when you press Apply.</p></section>
    <section class="panel dp" aria-labelledby="h-dp"><div class="panel-head"><h2 id="h-dp">Preview</h2></div><div id="disp-preview">${displayPreview(ev, view)}</div></section></div>`;
}

// ---- Notifications (SMS readiness, simulated) -------------------------------------------------------
export function bubble(text) { return `<div class="bubble"><p>${esc(text)}</p></div>`; }
export function notifications(ev, renderTpl) {
  const sms = ev.sms, checks = smsChecks(ev), ok = checks.filter((c) => c.ok).length;
  const tpl = (k, t) => `<section class="panel tpl" aria-labelledby="t-${k}"><div class="panel-head"><h2 id="t-${k}">${esc(t.label)}</h2>${t.confirmed ? badge('done', 'Reviewed') : badge('todo', 'Not reviewed')}</div>
    <div class="field"><label for="tt-${k}">Message wording</label><textarea id="tt-${k}" rows="3" data-tpl="${k}" maxlength="320">${esc(t.text)}</textarea><p class="hint"><span data-tpl-count="${k}">${t.text.length}</span> characters. Texts over 160 characters may be split into more than one message.</p></div>
    <div class="bubble-wrap"><span class="lbl">Example of what someone would receive</span><div id="bub-${k}">${bubble(renderTpl(ev, t.text))}</div></div>
    <div class="tpl-act"><label class="check"><input type="checkbox" id="tok-${k}" data-tpl-ok="${k}" ${t.confirmed ? 'checked' : ''}><span>I’ve read this wording</span></label><button type="button" class="btn sm quiet" data-action="sms-test" data-k="${k}" data-key="test-${k}">${icon('chat', 'sm')} Simulate a test message</button></div></section>`;
  return pageHead('Notifications', `Whether text messages could be sent for this event. ${assume('S9')}`, simTag('Simulated'))
    + `<div class="alertband soft honest">${icon('info')}<div><b>No SMS provider is connected. Nothing is ever sent from this prototype.</b> This page only tracks readiness and shows the exact wording that would be used.</div></div>
    <section class="panel" aria-labelledby="h-chk"><div class="panel-head"><h2 id="h-chk">SMS readiness</h2><span class="count">${ok} of ${checks.length}</span></div>
      <ul class="checks">${checks.map((c) => `<li class="${c.ok ? 'ok' : ''}">${c.ok ? icon('check') : icon('clock')}<span class="ck-t"><b>${esc(c.label)}</b><small>${esc(c.hint)}</small></span>${c.id === 'sender' ? `<label class="switch compact"><input type="checkbox" id="sms-sender" data-sms-sender ${sms.senderRegistered ? 'checked' : ''}><span class="sw-t"><b>${sms.senderRegistered ? 'Registered' : 'Not registered'}</b><small>simulation switch</small></span></label>` : c.ok ? badge('done') : badge('todo', 'Open')}</li>`).join('')}</ul></section>
    ${Object.entries(sms.templates).map(([k, t]) => tpl(k, t)).join('')}
    <section class="panel" aria-labelledby="h-log"><div class="panel-head"><h2 id="h-log">Simulated test log</h2><span class="count">${sms.log.length}</span></div>
      ${sms.log.length ? `<ul class="smslog">${sms.log.map((m) => `<li>${simTag('Simulated · not sent')}<span class="lg-m"><b>${esc(m.kind)}</b> to ${esc(m.to)} <small>${esc(NOW_LABEL)}</small></span><p>${esc(m.text)}</p></li>`).join('')}</ul>` : '<div class="empty slim">No test messages yet. Simulating one records it here and shows it was never sent.</div>'}</section>`;
}

// ---- Donations ---------------------------------------------------------------------------------------
export function donations(ev) {
  const dn = ev.donations, linkErr = dn.mode === 'link' && dn.url && !validUrl(dn.url) ? 'Use a full address beginning with https://' : dn.mode === 'link' && !dn.url ? 'Add the address of your donation page.' : '';
  const opt = (v, t, h) => `<label class="radio${dn.mode === v ? ' on' : ''}"><input type="radio" id="dm-${v}" name="dmode" value="${v}" data-dmode ${dn.mode === v ? 'checked' : ''}><span><b>${t}</b><small>${h}</small></span></label>`;
  return pageHead('Donations', `Where giving would live for this event. BidZizi doesn’t move money here. ${assume('S10')}`)
    + `<section class="panel" aria-labelledby="h-dn"><div class="panel-head"><h2 id="h-dn">What should attendees see?</h2>${dn.mode === 'undecided' ? badge('optional', 'Not decided') : badge('done', 'Decided')}</div>
      <fieldset class="radios"><legend class="sr">Donation option</legend>${opt('undecided', 'Not decided yet', 'The event page shows nothing about donations.')}${opt('none', 'No donation prompt', 'Decided: this event doesn’t ask for donations.')}${opt('link', 'Link to our own donation page', 'A link on the event page that opens your organization’s page. BidZizi handles no payment.')}</fieldset>
      ${dn.mode === 'link' ? `<div class="row2">${field('dn-label', 'Link text', `<input id="dn-label" type="text" data-bind="donations.label" value="${esc(dn.label)}" maxlength="60" autocomplete="off">`)}${field('dn-url', 'Donation page address', `<input id="dn-url" type="url" data-bind="donations.url" value="${esc(dn.url)}" placeholder="https://example.org/donate" autocomplete="off">`, { error: linkErr })}</div>
      <div class="field"><span class="lbl">How it appears to bidders</span><div class="linkrow demo"><span aria-hidden="true">${icon('heart')}</span><span class="lr-t"><b>${esc(dn.label || 'Donate')}</b><small>Opens ${esc(dn.url || 'your donation page')} in a new tab</small></span>${icon('external', 'sm')}</div></div>` : ''}
      <p class="fine pt">No amounts, payment, receipts or recipients are modeled. Whether BidZizi ever handles donations is a separate decision.</p></section>`;
}
