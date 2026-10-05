// Overview (the checklist), Event page, Bid increments, Readiness.
import { esc, icon, badge, stepBadge, lbl, assume, square, simTag, circle } from './ui.js';
import { fmtDate, fmtTime, toCents, dollars, plural, photo, photoSrc, PHOTOS, unassigned, ladder, nextEligible, NOW_LABEL, TZ, smsChecks, eventLink } from './model.js';
import { reviewState } from './store.js';
import { href, pageHead, field, issueList, fixControl, quickFix, SECTIONS, issKind, issIcon } from './views-common.js';

// ---- Overview: checklist-led, not a wizard ----------------------------------------------------
const TIER_TITLE = { required: 'Needed before bidding opens', recommended: 'Recommended', optional: 'Optional' };
const TIER_NOTE = { required: 'These decide whether the event can open. Do them in any order.', recommended: 'Not blocking, but worth a look.', optional: 'Skip anything you don’t need. Nothing here blocks the event.' };

function stepRow(ev, s, isNext) {
  const first = s.issues.find((i) => i.sev === 'blocker') || s.issues[0];
  const route = first?.fix || s.fixRoute || { section: s.section, q: '', label: 'Open' };
  const verb = s.done ? 'Review' : s.status === 'attention' ? 'Fix' : s.status === 'progress' ? 'Continue' : 'Start';
  const go = route.section === 'preview' ? `<button type="button" class="btn sm ${isNext ? 'primary' : 'quiet'}" data-action="preview-open">${s.done ? 'Open again' : 'Open preview'}</button>` : `<a class="btn sm ${isNext ? 'primary' : 'quiet'}" href="${href(ev.id, route.section, s.done && !s.advice.length ? '' : route.q)}" data-key="step-${s.id}">${verb}</a>`;
  const showIssues = s.status !== 'todo' || s.issues.length ? s.issues : [];
  return `<li class="step t-${s.status === 'done' ? 'green' : s.status === 'attention' ? 'red' : s.status === 'progress' ? 'amber' : s.tier === 'optional' ? 'grey' : 'dashed'}${isNext ? ' is-next' : ''}" id="step-${s.id}">
    <div class="st-main"><div class="st-top"><h3 class="st-title">${esc(s.title)}</h3>${stepBadge(s, s.tier)}${isNext ? '<span class="nexttag">Next</span>' : ''}</div>
      <p class="st-why">${esc(s.why)}</p>${s.done && !s.advice.length ? '' : issueList(ev, showIssues)}</div>
    <div class="st-stub">${go}</div></li>`;
}

export function overview(ev, a) {
  const un = unassigned(ev).length, next = a.next, nr = a.required.length;
  const d = ev.details;
  const nextCard = next ? (() => {
    const first = next.issues.find((i) => i.sev === 'blocker') || next.issues[0];
    const fix = first?.fix || { section: next.section, q: '', label: 'Open' };
    const quick = first && quickFix(ev, first);
    return `<section class="nextcard" aria-labelledby="next-h">${lbl(next.tier === 'required' ? 'Next useful action' : 'Recommended next')}
      <h2 id="next-h">${esc(next.title)}</h2><p>${esc(next.why)}</p>
      ${first ? `<p class="next-issue k-${issKind(first)}">${icon(issIcon(first), 'sm')} ${esc(first.text)}</p>` : ''}
      <div class="next-act">${quick || (fix.section === 'preview' ? `<button type="button" class="btn primary" data-action="preview-open" data-key="next-go">Open the preview</button>` : `<a class="btn primary" href="${href(ev.id, fix.section, fix.q)}" data-key="next-go">${esc(fix.label || 'Open')}</a>`)}
        ${quick ? fixControl(ev, fix) : ''}<span class="fine">You can work in any order. The checklist keeps track.</span></div></section>`;
  })() : `<section class="nextcard all-set">${lbl('All set')}<h2>Every step is done</h2><p>Review the readiness page and mark the event as reviewed.</p><div class="next-act"><a class="btn primary" href="${href(ev.id, 'readiness')}" data-key="next-go">Review readiness</a></div></section>`;

  const facts = `<dl class="facts onpage statrow">
    <div><dt>Event</dt><dd>${d.date ? esc(fmtDate(d.date).replace(/^\w+, /, '')) : '<span class="dim">No date yet</span>'}</dd></div>
    <div><dt>Lots</dt><dd>${ev.lots.length}</dd></div>
    <div><dt>Bidding windows</dt><dd>${ev.windows.length}</dd></div>
    <div class="${un ? 'warn' : ''}"><dt>Unassigned lots</dt><dd>${un ? `<a href="${href(ev.id, 'lots', '?f=unassigned')}">${un} to place</a>` : ev.lots.length ? 'None' : '—'}</dd></div></dl>`;

  const groups = ['required', 'recommended', 'optional'].map((tier) => {
    const ss = a.steps.filter((s) => s.tier === tier), done = ss.filter((s) => s.done).length;
    return `<section class="group" aria-labelledby="g-${tier}"><div class="group-head"><h2 id="g-${tier}">${TIER_TITLE[tier]}</h2><span class="count">${done} of ${ss.length} done</span></div><p class="sub">${TIER_NOTE[tier]}</p>
      <ol class="steps-list">${ss.map((s) => stepRow(ev, s, next === s)).join('')}</ol></section>`;
  }).join('');

  return pageHead(ev.name, `${a.doneReq} of ${nr} required steps done${a.doneReq && a.advice.length ? ` · ${plural(a.advice.length, 'suggestion')}` : ''}`) + nextCard + facts + groups;
}

// ---- Event page: heading image, welcome, physical date/time, sponsors ---------------------------
export const timeError = (d) => (d.start && d.end && d.end <= d.start ? 'The end time must be after the start time.' : '');

export function details(ev) {
  const d = ev.details, link = (s, t) => `<a href="${href(ev.id, s)}">${t}</a>`;
  const tile = (id, label, src) => `<button type="button" class="photo${d.heroImage === id ? ' on' : ''}" data-action="hero" data-id="${id ?? ''}" aria-pressed="${d.heroImage === id}" data-key="hero-${id ?? 'none'}">${src ? `<img src="${src}" alt="" width="300" height="200" loading="lazy">` : `<span class="photo-none">${icon('close')}</span>`}<span>${esc(label)}</span></button>`;
  return pageHead('Event page', 'What attendees see first, and when the event physically happens.') + `
  <section class="panel" id="sec-heading" aria-labelledby="h-heading"><div class="panel-head"><h2 id="h-heading">Event name and heading image</h2></div>
    ${field('f-name', 'Event name', `<input id="f-name" type="text" data-bind="name" value="${esc(ev.name)}" maxlength="80" autocomplete="off">`, { hint: `Hosted by the organization, ${esc('Northline Business Exchange')}.` })}
    <div class="field"><span class="lbl-d" id="hero-l">Heading image</span><p class="hint">Shown at the top of the welcome page. Sample photos only: uploading isn’t part of this prototype, and the photos’ licensing is unverified.</p>
      <div class="photos" role="group" aria-labelledby="hero-l">${tile(null, 'No image', '')}${PHOTOS.map((p) => tile(p.id, p.label, photoSrc(p.id))).join('')}</div></div></section>
  <section class="panel" id="sec-welcome" aria-labelledby="h-welcome"><div class="panel-head"><h2 id="h-welcome">Welcome page</h2></div>
    ${field('f-wt', 'Heading', `<input id="f-wt" type="text" data-bind="details.welcomeTitle" value="${esc(d.welcomeTitle)}" maxlength="90" placeholder="Welcome to the Spring Gala" autocomplete="off">`)}
    ${field('f-wb', 'Message', `<textarea id="f-wb" rows="5" data-bind="details.welcomeBody" maxlength="600" placeholder="Say hello, explain how to bid, and thank your sponsors.">${esc(d.welcomeBody)}</textarea>`, { hint: `<span data-counter="details.welcomeBody">${d.welcomeBody.length}</span> of 600 characters. Two or three friendly sentences work well.` })}</section>
  <section class="panel" id="sec-when" aria-labelledby="h-when"><div class="panel-head"><h2 id="h-when">When the event happens</h2></div>
    <p class="sub">The gathering itself. Bidding runs on its own schedule: see ${link('windows', 'Bidding windows')}. Times are ${TZ}.</p>
    <div class="row3">${field('f-date', 'Date', `<input id="f-date" type="date" data-bind="details.date" value="${esc(d.date)}">`)}${field('f-start', 'Starts', `<input id="f-start" type="time" data-bind="details.start" value="${esc(d.start)}">`)}${field('f-end', 'Ends', `<input id="f-end" type="time" data-bind="details.end" value="${esc(d.end)}">`, { opt: true, error: timeError(d) })}</div>
    ${field('f-venue', 'Venue', `<input id="f-venue" type="text" data-bind="details.venue" value="${esc(d.venue)}" maxlength="120" placeholder="Name and address" autocomplete="off">`, { opt: true })}</section>
  <section class="panel" id="sec-sponsors" aria-labelledby="h-sponsors"><div class="panel-head"><h2 id="h-sponsors">Event sponsors ${badge('optional')} ${assume('S11')}</h2></div>
    <p class="sub">Sponsors appear in the welcome page and on displays. You can skip this: it never blocks the event.</p>
    ${ev.sponsors.length ? `<ul class="sponsor-list">${ev.sponsors.map((s) => `<li>${square(s.name, 36)}<span>${esc(s.name)}</span><button type="button" class="btn-link" data-action="sponsor-remove" data-id="${s.id}" aria-label="Remove ${esc(s.name)}">Remove</button></li>`).join('')}</ul>` : '<div class="empty slim">No sponsors yet. That’s fine.</div>'}
    <form class="addrow" data-form="sponsor" novalidate><div class="field grow"><label for="f-sp">Add a sponsor</label><input id="f-sp" type="text" name="name" maxlength="60" autocomplete="off" placeholder="Sponsor name"><p class="err" id="err-f-sp" role="alert" hidden></p></div><button class="btn quiet" type="submit">${icon('plus', 'sm')} Add sponsor</button></form></section>`;
}

// ---- Bid increments --------------------------------------------------------------------------
export const INC_PRESETS = [500, 1000, 2500, 5000, 10000];
export function increments(ev, exLotId, topRaw, incRaw) {
  const inc = ev.increment, ok = inc.amount >= 100, ex = ev.lots.find((l) => l.id === exLotId) || ev.lots[0] || null;
  const opening = ex ? ex.opening : 10000, top = topRaw == null ? opening + 2 * (ok ? inc.amount : 2500) : toCents(topRaw);
  const topOk = Number.isFinite(top) && top >= opening;
  const rows = ok ? ladder(opening, inc.amount, 5) : [];
  return pageHead('Bid increments', `How much each new bid must beat the last one by. ${assume('S4')}`) + `
  <section class="panel" aria-labelledby="h-inc"><div class="panel-head"><h2 id="h-inc">Increment for this event</h2>${inc.confirmed && ok ? badge('done', 'Confirmed') : badge('attention', 'Not confirmed yet')}</div>
    <div class="chips" role="group" aria-label="Common increments">${INC_PRESETS.map((c) => `<button type="button" class="chip${inc.amount === c ? ' on' : ''}" data-action="inc-preset" data-cents="${c}" aria-pressed="${inc.amount === c}">${dollars(c)}</button>`).join('')}</div>
    ${field('f-inc', 'Or enter your own (whole dollars)', `<div class="money"><span>$</span><input id="f-inc" type="text" inputmode="numeric" data-inc value="${esc(incRaw ?? (inc.amount ? inc.amount / 100 : ''))}" autocomplete="off"></div>`, { hint: 'The same increment applies to every lot in this event.', error: ok ? '' : 'Enter an increment of at least $1.' })}
  </section>
  <section class="panel example" aria-labelledby="h-ex"><div class="panel-head"><h2 id="h-ex">What bidders will see</h2></div>
    <div class="ex-controls">${ev.lots.length ? `<div class="field"><label for="f-exlot">Example lot</label><select id="f-exlot" data-exlot>${ev.lots.map((l) => `<option value="${l.id}"${ex && l.id === ex.id ? ' selected' : ''}>Lot ${String(l.number).padStart(2, '0')} · ${esc(l.title.slice(0, 48) || 'Untitled')} (opens at ${dollars(l.opening)})</option>`).join('')}</select></div>` : '<p class="fine">Add a lot to try this with a real opening bid. Showing a sample lot that opens at $100.</p>'}
      <div class="field"><label for="f-extop">Pretend the current top bid is</label><div class="money"><span>$</span><input id="f-extop" type="text" inputmode="numeric" data-extop value="${esc(topRaw ?? top / 100)}" autocomplete="off"></div></div></div>
    ${ok && topOk ? `<div class="stub" aria-live="polite"><div class="stub-main"><span class="lbl">Current top bid</span><span class="amt xl">${dollars(top)}</span><p class="fine">Increment ${dollars(inc.amount)}</p></div><div class="stub-side"><div><span class="lbl">Next eligible bid</span><span class="n">${dollars(nextEligible(opening, top, inc.amount))}</span><span class="tl">${dollars(top)} + ${dollars(inc.amount)}</span></div></div></div>`
      : `<div class="empty slim">${ok ? `Enter a top bid of at least the opening bid, ${dollars(opening)}.` : 'Set a valid increment to see the example.'}</div>`}
    ${ok ? `<h3 class="sub-h">From the opening bid</h3><p class="fine">With no bids yet, the first bid is the opening bid. After that each bid goes up by ${dollars(inc.amount)}.</p>
      <ol class="ladder">${rows.map((v, i) => `<li><span class="lbl">${i === 0 ? 'First bid' : `Then`}</span><b>${dollars(v)}</b></li>`).join('')}<li class="more"><span>…</span></li></ol>` : ''}
    <p class="fine pt">Bidders see this as “Next bid ${ok ? dollars(nextEligible(opening, top, inc.amount)) : '$—'}” on the lot, the way prototype A does. Whether someone may bid more than the minimum is undecided.</p></section>
  <section class="panel confirmbox"><p>${inc.confirmed && ok ? `You confirmed ${dollars(inc.amount)} increments. Changing the amount asks you to confirm again.` : `Confirm to tick this step off. The default is ${dollars(inc.amount)}: check it suits your lots.`}</p>
    <button type="button" class="btn ${inc.confirmed ? 'quiet' : 'primary'}" data-action="confirm-increment" data-key="confirm-inc" ${ok && !inc.confirmed ? '' : 'disabled'}>${inc.confirmed && ok ? `${icon('check', 'sm')} Confirmed` : `Confirm ${ok ? dollars(inc.amount) : ''} increments`}</button></section>`;
}

// ---- Readiness -------------------------------------------------------------------------------
export function readiness(ev, a) {
  const rs = reviewState(ev), nb = a.blockers.length, na = a.advice.length;
  const verdict = a.ready
    ? `<section class="standing t-green" role="status"><span class="st-ic">${icon('check', '')}</span><div><p class="st-title">${rs === 'current' ? 'Reviewed and ready' : 'Ready to review'}</p><p class="st-sub">Every required step is done.${na ? ` ${plural(na, 'suggestion')} left, none of them blocking.` : ' Nothing is left.'}</p></div></section>`
    : a.wrong.length ? `<section class="standing t-red" role="status"><span class="st-ic">${icon('alert', '')}</span><div><p class="st-title">Not ready: ${plural(a.wrong.length, 'thing')} to fix${nb > a.wrong.length ? `, ${nb - a.wrong.length} more to do` : ''}</p><p class="st-sub">${a.required.length - a.doneReq} of ${a.required.length} required steps still open. Fix them in any order.</p></div></section>`
    : `<section class="standing t-dashed" role="status"><span class="st-ic">${icon('clock', '')}</span><div><p class="st-title">Not ready yet: ${plural(nb, 'thing')} left to do</p><p class="st-sub">Nothing is wrong. ${a.required.length - a.doneReq} of ${a.required.length} required steps are still to do, in any order.</p></div></section>`;
  const group = (title, items, empty) => `<section class="panel"><div class="panel-head"><h2>${title}</h2><span class="count">${items.length}</span></div>${items.length ? `<ul class="issues big">${items.map((i) => `<li class="iss s-${issKind(i)}">${icon(issIcon(i), 'sm')}<span class="iss-t"><b>${esc(i.step.title)}</b><br>${esc(i.text)}</span><span class="iss-a">${quickFix(ev, i) || fixControl(ev, i.fix)}</span></li>`).join('')}</ul>` : `<div class="empty slim">${empty}</div>`}</section>`;
  const review = rs === 'current' ? `<p class="fine">${icon('check', 'sm')} Reviewed ${NOW_LABEL}. Nothing has changed since.</p>` : rs === 'stale' ? `<p class="fine warn-t">${icon('alert', 'sm')} You reviewed this event, then changed it. Review again.</p>` : '<p class="fine">Not reviewed yet.</p>';
  return pageHead('Readiness', 'Everything that has to be true before bidding opens, and what to do about what isn’t.') + verdict + group('Needed before bidding opens', a.blockers, 'Nothing is blocking this event.') + group('Suggestions', a.advice, 'No suggestions.') + `
  <section class="panel"><div class="panel-head"><h2>Steps at a glance</h2></div><ul class="glance">${a.steps.map((s) => `<li>${stepBadge(s, s.tier)}<span>${esc(s.title)}</span>${s.tier !== 'required' ? `<em class="tier">${s.tier}</em>` : ''}</li>`).join('')}</ul></section>
  <section class="panel confirmbox"><div><h2 class="h3">Mark as reviewed ${simTag()} ${assume('S3')}</h2><p>This records that someone looked. It doesn’t publish the event, open bidding, send any message or approve anything: those steps aren’t part of this prototype.</p>${review}</div>
    <button type="button" class="btn primary" data-action="mark-reviewed" data-key="review" ${a.ready && rs !== 'current' ? '' : 'disabled'}>${rs === 'current' ? 'Reviewed' : 'Mark as reviewed'}</button></section>
  ${!a.ready ? `<p class="fine center">“Mark as reviewed” turns on once every required step is done.</p>` : ''}`;
}
export { SECTIONS };
