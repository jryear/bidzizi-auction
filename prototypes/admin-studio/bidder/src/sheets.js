import { event, lots, lotById, sponsors, LOGOS, network } from './data.js';
import { state, lotStatus, topBid, minNext, acceptedEntryFor, isMine, myMax, extraUsers } from './store.js';
import { esc, money, icon, sponsorMark, monogram, assume } from './ui.js';


const thumb = (lot) => (lot.image ? `<img src="${lot.image}" alt="" width="1000" height="667">` : `<div class="art mini" style="--c:${LOGOS[lot.logo].bg}">${sponsorMark(lot.logo, 26)}</div>`);

const lotMini = (lot) => `<div class="lotmini"><div class="thumb sm">${thumb(lot)}</div><div><span class="lbl">Lot ${esc(lot.number)} · ${esc(lot.category)}</span><p>${esc(lot.title)}</p></div></div>`;
const forBlock = () => {
  const id = state.identity;
  return `<div class="forbiz">${monogram(id.business, 44, true)}<div><span class="lbl">Bidding for</span><b>${esc(id.business)}</b><small>Placed by ${esc(id.person)} ${assume('A3')}</small></div></div>`;
};
const head = (title, extra = '') => `<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title" tabindex="-1">${esc(title)}</h2><button class="x" data-action="close-sheet" aria-label="Close" data-key="x">${icon('close')}</button></div>${extra}`;

// ---- amount validation + live commitment ---------------------------------------------------
export function validate(lot, cents, maximum = false) {
  const min = minNext(lot);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, msg: 'Enter an amount.' };
  if (cents < min) return { ok: false, msg: maximum ? `A maximum must be at least ${money(min)}.` : `The minimum bid is ${money(min)}.`, below: true };
  if (cents % event.increment) return { ok: false, msg: `Bids go up in ${money(event.increment)} steps. Try ${money(Math.ceil(cents / event.increment) * event.increment)}.` };
  return { ok: true, msg: '' };
}
export const draftFor = (lot) => state.drafts[lot.id] ?? minNext(lot);

function commitList(lot, cents) {
  const t = topBid(lot.id), id = state.identity, mineTop = t && isMine(t);
  const first = mineTop
    ? `Raises your bid on <b>Lot ${esc(lot.number)}</b> from <b>${money(t.amount)}</b> to <b>${money(cents)}</b> for <b>${esc(id.business)}</b>. ${assume('A9')}`
    : `Places a <b>${money(cents)}</b> bid on <b>Lot ${esc(lot.number)}</b> for <b>${esc(id.business)}</b>.`;
  const second = t && !mineTop ? `The top bid is ${money(t.amount)} from <b>${esc(t.business)}</b>.` : t ? '' : 'There are no bids yet. Yours would be the first.';
  return `<li>${first}</li>${second ? `<li>${second} You're leading only once we confirm it here.</li>` : `<li>You're leading only once we confirm it here.</li>`}<li>Bidding closes ${esc(event.closes)} ${esc(event.timezone)}. ${assume('A6')}</li><li class="note">Whether a bid is binding, and anything about payment or pickup, isn't decided yet. Nothing is charged or promised. ${assume('A4')}</li>`;
}
const quickChips = (lot, cents) => {
  const min = minNext(lot);
  return [0, 1, 2].map((i) => min + i * event.increment).map((c) => `<button type="button" class="chip${c === cents ? ' on' : ''}" data-action="quick" data-v="${c}" aria-pressed="${c === cents}">${money(c)}</button>`).join('');
};

/** Re-render only the parts that depend on the typed amount, so the field keeps focus. */
export function refreshBid(dlg) {
  const lot = lotById(dlg.dataset.lot);
  if (!lot || !dlg.querySelector('#amt')) return;
  const cents = draftFor(lot), v = validate(lot, cents), min = minNext(lot);
  dlg.querySelector('#commit').innerHTML = commitList(lot, cents);
  dlg.querySelector('#amt-err').textContent = v.msg;
  dlg.querySelector('#quick').innerHTML = quickChips(lot, cents);
  const cta = dlg.querySelector('#cta');
  cta.disabled = !v.ok;
  cta.textContent = v.below ? `Update to ${money(min)}` : `Place ${money(cents)} bid`;
  cta.dataset.action = v.below ? 'update-min' : 'place';
  dlg.querySelector('[data-d="-1"]').disabled = cents - event.increment < min;
  const input = dlg.querySelector('#amt');
  if (document.activeElement !== input) input.value = String(cents / 100);
}

// ---- bid sheet --------------------------------------------------------------------------------
function bidForm(lot) {
  const cents = draftFor(lot), v = validate(lot, cents), min = minNext(lot), t = topBid(lot.id);
  const raise = t && isMine(t);
  return `${head(raise ? 'Raise your bid' : 'Place a bid')}
  <div class="sheet-scroll">${lotMini(lot)}${forBlock()}
    <div class="amount"><label class="lbl" for="amt">Your bid <span class="lbl-min">· minimum ${money(min)}, ${money(event.increment)} steps</span> ${assume('A5')}</label>
      <div class="stepper"><button class="step" data-action="step" data-d="-1" aria-label="Decrease by ${money(event.increment)}" ${cents - event.increment < min ? 'disabled' : ''} data-key="dec">${icon('minus')}</button>
        <div class="amt-field"><span class="cur" aria-hidden="true">$</span><input id="amt" inputmode="numeric" autocomplete="off" maxlength="6" value="${cents / 100}" aria-describedby="amt-err" data-key="amt"></div>
        <button class="step" data-action="step" data-d="1" aria-label="Increase by ${money(event.increment)}" data-key="inc">${icon('plus')}</button></div>
      <p id="amt-err" class="err" role="alert">${esc(v.msg)}</p>
      <div class="quick" id="quick">${quickChips(lot, cents)}</div></div>
    <section class="commit-box"><h3>What this does</h3><ul id="commit">${commitList(lot, cents)}</ul></section>
  </div>
  <div class="sheet-foot"><button class="btn primary block lg" id="cta" data-action="place" data-key="place" ${v.ok ? '' : 'disabled'}>Place ${money(cents)} bid</button><button class="btn-link center" data-action="close-sheet">Not now</button></div>`;
}

function bidResult(lot, st, acc) {
  const idBlock = forBlock();
  const foot = (primary, secondary = '') => `<div class="sheet-foot">${primary}${secondary || '<button class="btn-link center" data-action="close-sheet">Close</button>'}</div>`;
  const body = (cls, ic, title, text, extra = '') => `<div class="sheet-scroll">${lotMini(lot)}${idBlock}<div class="result t-${cls}" role="status"><span class="r-ic">${ic}</span><h3>${title}</h3><p>${text}</p>${extra}</div></div>`;
  if (acc) {
    const t = topBid(lot.id), still = t && isMine(t);
    const text = still ? `Confirmed ${esc(acc.confirmedAt || '')} for <b>${esc(state.identity.business)}</b>. You hold the top bid.` : `Your ${money(acc.amount)} bid was placed for <b>${esc(state.identity.business)}</b>, but <b>${esc(t.business)}</b> has since bid ${money(t.amount)}.`;
    return head(still ? 'Bid placed' : 'Bid placed, then outbid') + body(still ? 'green' : 'red', icon(still ? 'check' : 'alert'), still ? `You're leading at ${money(acc.amount)}` : `Now outbid at ${money(t.amount)}`, text)
      + foot('<button class="btn primary block lg" data-action="close-sheet" data-key="done">Keep browsing</button>', '<a class="btn quiet block" href="#/bids" data-nav data-action="close-then-nav">View my bids</a>');
  }
  const e = st.entry;
  if (st.kind === 'sending') return head('Sending your bid') + body('amber', icon('spinner'), `Sending ${money(e.amount)}…`, "Not placed yet. You aren't leading until we confirm it here. You can keep browsing; we'll keep trying.") + foot('<button class="btn quiet block lg" data-action="close-sheet" data-key="done">Keep browsing</button>', '<span></span>');
  if (st.kind === 'unconfirmed') return head('Bid not confirmed') + body('hatch', icon('question'), `We couldn't confirm ${money(e.amount)}`, `We lost contact before we got an answer. It may or may not have been placed. Check its status rather than bidding again. ${assume('A10')}`, '<p class="r-note" id="check-note" role="status"></p>')
    + foot('<button class="btn primary block lg" data-action="check" data-key="check">Check status</button>');
  if ((e.status === 'rejected' && e.reason === 'closed') || (e.status === 'failed' && state.snap.closed)) return head('Not placed') + body('dashed', icon('x'), 'Bidding closed first', `Bidding ended before your ${money(e.amount)} bid arrived, so it was not placed. ${assume('A8')}`) + foot('<button class="btn quiet block lg" data-action="dismiss" data-key="done">Close</button>', '<span></span>');
  if (e.status === 'rejected') return head('Not placed') + body('dashed', icon('x'), `${esc(e.by.business)} got there first`, `They bid ${money(e.by.amount)} just before your ${money(e.amount)}, so yours was not placed. The minimum is now ${money(minNext(lot))}. ${assume('A7')}`)
    + foot(`<button class="btn primary block lg" data-action="rebid" data-key="rebid">Bid ${money(minNext(lot))} instead</button>`, '<button class="btn-link center" data-action="dismiss">Discard</button>');
  const why = e.reason === 'offline' ? "There's no connection, so nothing was sent." : e.reason === 'lost' ? 'We checked: the server never received it.' : "It couldn't be sent.";
  return head('Not placed') + body('dashed', icon('x'), `${money(e.amount)} wasn't placed`, `${why} Your bid hasn't been recorded. Trying again re-sends the same bid and can't place it twice. ${assume('A10')}`, `<p class="r-note" id="check-note" role="status">${!state.online ? 'Still offline.' : ''}</p>`)
    + foot('<button class="btn primary block lg" data-action="retry" data-key="retry">Try again</button>', '<button class="btn-link center" data-action="dismiss">Discard this bid</button>');
}

export function bidSheet(lotId) {
  const lot = lotById(lotId);
  if (!lot) return { html: `${head('Lot not found')}<div class="sheet-scroll"><p>That lot isn't in this event.</p></div>`, lot: '' };
  if (state.snap.closed && !lotStatus(lot).entry && !acceptedEntryFor(lotId)) {
    return { lot: lotId, html: `${head('Bidding is closed')}<div class="sheet-scroll">${lotMini(lot)}<div class="result t-grey"><span class="r-ic">${icon('clock')}</span><h3>No more bids</h3><p>Bidding closed at ${esc(event.closes)}. ${assume('A8')}</p></div></div><div class="sheet-foot"><button class="btn quiet block lg" data-action="close-sheet">Close</button></div>` };
  }
  if (!state.identity) return { html: identitySheet(), lot: lotId };
  const acc = acceptedEntryFor(lotId), st = lotStatus(lot);
  return { lot: lotId, html: acc || st.entry ? bidResult(lot, st, acc) : bidForm(lot) };
}

// ---- identity sheet (the bid boundary) -----------------------------------------------------------
const INTENT_LABEL = { autobid: 'Continue to maximum', users: 'Continue', bid: 'Continue to bid' };
const intentOf = (f) => f.intent || (f.intentLot ? 'bid' : '');
const simTag = '<span class="sim-tag">Simulated</span>';

export function identitySheet() {
  const step = state.flow.step || 'phone', f = state.flow;
  const foot = (label, action, extra = '') => `<div class="sheet-foot"><button class="btn primary block lg" data-action="${action}" data-key="go">${label}</button>${extra}</div>`;
  if (step === 'phone') return `${head("Who's bidding?")}<div class="sheet-scroll"><p class="lead">Browsing is open to everyone. We only ask who you are when you place a bid, so your bids and standing are yours to come back to. ${assume('A1')}</p>
    <div class="field"><label for="f-phone">Mobile number</label><input id="f-phone" data-flow="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 010-0142" value="${esc(f.phone || '')}" data-key="f-phone"></div>
    <p class="hint">A real version would text you a code. ${assume('A15')}</p><p class="proto-note">${simTag} Prototype: any number works and no text is sent.</p></div>${foot('Send code', 'id-phone')}`;
  if (step === 'code') return `${head('Enter your code')}<div class="sheet-scroll"><p class="lead">A real version would text a 6-digit code to <b>${esc(f.phone || 'your phone')}</b>. ${assume('A15')}</p>
    <div class="field"><label for="f-code">6-digit code</label><input id="f-code" data-flow="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" value="${esc(f.code || '')}" data-key="f-code"></div>
    <p class="err" id="id-err" role="alert">${esc(f.err || '')}</p><p class="proto-note">${simTag} Verification is simulated: no text was sent, and any 6 digits are accepted. Nothing is actually checked.</p></div>${foot('Continue', 'id-code', '<button class="btn-link center" data-action="id-back">Use a different number</button>')}`;
  const where = INTENT_LABEL[intentOf(f)] || 'Done';
  return `${head('Who are you bidding for?')}<div class="sheet-scroll"><p class="netband"><span class="lbl">Network</span><b>${esc(network.name)}</b><span>Business, name and Member ID are declared by you. ${assume('A14')}</span></p>
    <p class="lead">Your bids are shown to everyone under your business and your name. ${assume('A3')}</p>
    <div class="field"><label for="f-biz">Business</label><input id="f-biz" data-flow="business" autocomplete="organization" value="${esc(f.business ?? event.business)}" data-key="f-biz"></div>
    <div class="field"><label for="f-name">Your name</label><input id="f-name" data-flow="person" autocomplete="name" value="${esc(f.person ?? event.participant)}" data-key="f-name"></div>
    <div class="field"><label for="f-member">${esc(network.name)} Member ID <span class="opt">optional</span> ${assume('A13')}</label><input id="f-member" data-flow="memberId" autocomplete="off" autocapitalize="characters" placeholder="Your Member ID" value="${esc(f.memberId || '')}" data-key="f-member"></div>
    <p class="err" id="id-err" role="alert">${esc(f.err || '')}</p><p class="proto-note">Prototype: you simply declare these. A Member ID is not checked and does not give access to any business, so business and name are still needed. No permission to bid for a business is verified.</p></div>${foot(where, 'id-who')}`;
}

export function accountSheet() {
  const id = state.identity;
  if (!id) return identitySheet();
  const n = extraUsers().length;
  const row = (action, key, ic, title, sub) => `<button class="linkrow" data-action="${action}" data-key="${key}">${icon(ic)}<span class="lr-t"><b>${title}</b><small>${sub}</small></span>${icon('right', 'sm')}</button>`;
  return `${head('Your bidding pass')}<div class="sheet-scroll"><div class="forbiz big">${monogram(id.business, 56, true)}<div><b>${esc(id.business)}</b><small>${esc(id.person)}</small></div></div>
    <dl class="idfacts">
      <div><dt>Phone</dt><dd>${esc(id.phone || '')} ${simTag}<small>Verification was simulated.</small></dd></div>
      <div><dt>Network</dt><dd>${esc(network.name)} ${assume('A14')}</dd></div>
      <div><dt>Member ID</dt><dd>${id.memberId ? esc(id.memberId) : 'Not given'}<small>${id.memberId ? 'Declared by you, not checked.' : 'Optional.'} It gives no access to any business. ${assume('A13')}</small></dd></div>
    </dl>
    <p class="lead">Bids you place are recorded under this business and name. Closing this tab won't lose them. ${assume('A12')}</p>
    <div class="linkrows tight">${row('users', 'users', 'users', 'Additional users', n ? `${n} added · list only` : 'None added')}${row('appearance', 'appearance', 'text', 'Appearance', 'Text size, lot layout, motion')}</div></div>
    <div class="sheet-foot"><button class="btn quiet block lg" data-action="close-sheet">Close</button><button class="btn-link center" data-action="sign-out" data-key="signout">Sign out of this device</button></div>`;
}

// ---- additional users (A17): a list, nothing more ----------------------------------------------------
export function usersSheet() {
  const id = state.identity;
  if (!id) return identitySheet();
  const f = state.flow, list = extraUsers();
  return `${head('Additional users')}<div class="sheet-scroll"><div class="forbiz">${monogram(id.business, 44, true)}<div><span class="lbl">For</span><b>${esc(id.business)}</b></div></div>
    <p class="lead pt">${simTag} Prototype: this is only a list kept on this device. Nothing is sent, and added people can't bid, see standing or act for ${esc(id.business)}. Roles and permissions are not decided. ${assume('A17')}</p>
    ${list.length ? `<ul class="people">${list.map((u) => `<li>${monogram(u.name, 40)}<div><b>${esc(u.name)}</b><small>${u.phone ? esc(u.phone) : 'No phone given'} · not active</small></div><button class="btn-link" data-action="user-remove" data-id="${u.id}" data-key="rm-${u.id}" aria-label="Remove ${esc(u.name)}">Remove</button></li>`).join('')}</ul>` : '<div class="empty slim"><p>No one added yet.</p></div>'}
    <h3 class="sub-h">Add a person</h3>
    <div class="field"><label for="f-uname">Name</label><input id="f-uname" data-flow="uname" autocomplete="off" value="${esc(f.uname || '')}" data-key="f-uname"></div>
    <div class="field"><label for="f-uphone">Mobile number <span class="opt">optional</span></label><input id="f-uphone" data-flow="uphone" type="tel" inputmode="tel" autocomplete="off" value="${esc(f.uphone || '')}" data-key="f-uphone"></div>
    <p class="err" id="id-err" role="alert">${esc(f.err || '')}</p></div>
    <div class="sheet-foot"><button class="btn primary block lg" data-action="user-add" data-key="go">Add to the list</button><button class="btn-link center" data-action="close-sheet">Done</button></div>`;
}

// ---- appearance (A18) ----------------------------------------------------------------------------------
export function appearanceSheet() {
  const u = state.ui;
  const seg = (label, key, opts, cur) => `<div class="setting"><span class="lbl">${label}</span><div class="seg2" role="group" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" data-action="appearance" data-keep data-k="${key}" data-v="${v}" aria-pressed="${cur === v}" data-key="ap-${key}-${v}">${t}</button>`).join('')}</div></div>`;
  return `${head('Appearance')}<div class="sheet-scroll"><p class="lead">These apply on this device only. ${assume('A18')}</p>
    ${seg('Text size', 'text', [['standard', 'Standard'], ['large', 'Larger']], u.text)}
    ${seg('Lot layout', 'view', [['cards', 'Large cards'], ['rows', 'Compact list']], u.view)}
    ${seg('Motion', 'motion', [['system', 'Match my device'], ['reduce', 'Reduce motion']], u.motion)}</div>
    <div class="sheet-foot"><button class="btn quiet block lg" data-action="close-sheet" data-key="done">Done</button></div>`;
}

// ---- sponsor welcome (A21): placeholder wording built from the fixtures ------------------------------------
export function welcomeSheet() {
  return `${head('Welcome to '+event.name)}<div class="sheet-scroll"><p class="lead">${esc(event.welcome||'Welcome to our event.')}</p>
    <ul class="donors">${sponsors.map(sp=>`<li>${sponsorMark(sp.logo,40)}<div><b>${esc(sp.name)}</b><p>Event sponsor</p></div></li>`).join('')}</ul>
    <p class="proto-note">Event sponsors are separate from the organization providing auction items.</p></div>
    <div class="sheet-foot"><button class="btn primary block lg" data-action="close-sheet" data-key="done">Continue browsing</button></div>`;
}

// ---- nonprofit donation (A19): access only. Nothing about the donation itself is decided ---------------------
export function donateSheet() {
  return `${head('Nonprofit donation')}<div class="sheet-scroll"><div class="result t-grey"><span class="r-ic">${icon('heart')}</span><h3>Not decided yet</h3><p>This is where donation access would live. This prototype takes no amount and no payment, and it does not say who would receive a gift. ${assume('A19')}</p></div>
    <section class="commit-box"><h3>Still to decide</h3><ul><li>What a donation is, and whether it relates to a bid.</li><li>Who receives it.</li><li>Whether any money moves through this app.</li><li>Receipts and anything shown after a gift.</li></ul></section></div>
    <div class="sheet-foot"><button class="btn quiet block lg" data-action="close-sheet" data-key="done">Close</button></div>`;
}

// ---- private maximum (A20): a labeled simulation with an explicit confirmation -------------------------------
const MX = (lot) => `max:${lot.id}`;
export const mxDraft = (lot) => state.drafts[MX(lot)] ?? minNext(lot);
export function mxMode(lotId) {
  const lot = lotById(lotId); if (!lot) return 'missing';
  if (!state.identity) return 'identity';
  const m = myMax(lotId);
  if (m && m.status !== 'saved') return m.status;                  // saving | unconfirmed | failed
  if (state.snap.closed) return m ? 'saved' : 'closed';
  if (state.mflow.lot === lotId && state.mflow.step) return state.mflow.step;   // form | confirm (a change in progress)
  return m ? 'saved' : 'form';
}
const mxCommit = (lot, cents) => {
  const id = state.identity, t = topBid(lot.id);
  return `<li>Saves a private maximum of <b>${money(cents)}</b> on <b>Lot ${esc(lot.number)}</b> for <b>${esc(id.business)}</b>.</li>
    <li>It is not a bid. It does not change who is leading${t ? `: ${esc(t.business)} holds ${money(t.amount)} now` : ''}.</li>
    <li>${simTag} Nothing will bid for you in this prototype. The maximum is only saved, and only you see it.</li>
    <li>Bidding closes ${esc(event.closes)} ${esc(event.timezone)}. ${assume('A6')}</li>
    <li class="note">How a real maximum would act, who could see it, and whether it commits you to anything isn't decided. Nothing is charged or promised. ${assume('A20')}</li>`;
};
export function refreshMax(dlg) {
  const lot = lotById(dlg.dataset.lot);
  if (!lot || !dlg.querySelector('#mx')) return;
  const cents = mxDraft(lot), v = validate(lot, cents, true), min = minNext(lot);
  dlg.querySelector('#mx-err').textContent = v.msg;
  const cta = dlg.querySelector('#cta');
  cta.disabled = !v.ok;
  cta.dataset.action = v.below ? 'mx-update-min' : 'mx-review';
  cta.textContent = v.below ? `Update to ${money(min)}` : `Review ${money(cents)} maximum`;
  dlg.querySelector('[data-d="-1"]').disabled = cents - event.increment < min;
  const input = dlg.querySelector('#mx');
  if (document.activeElement !== input) input.value = String(cents / 100);
}
function maxForm(lot) {
  const cents = mxDraft(lot), v = validate(lot, cents, true), min = minNext(lot), t = topBid(lot.id);
  return `${head('Set a private maximum')}<div class="sheet-scroll">${lotMini(lot)}${forBlock()}
    <p class="lead pt">${simTag} The most you would go to on this lot, kept to yourself. It is <b>not a bid</b>, and in this prototype nothing will bid for you. ${assume('A20')}</p>
    <div class="amount"><label class="lbl" for="mx">Your maximum <span class="lbl-min">· at least ${money(min)}, ${money(event.increment)} steps</span></label>
      <div class="stepper"><button class="step" data-action="mx-step" data-d="-1" aria-label="Decrease by ${money(event.increment)}" ${cents - event.increment < min ? 'disabled' : ''} data-key="dec">${icon('minus')}</button>
        <div class="amt-field"><span class="cur" aria-hidden="true">$</span><input id="mx" inputmode="numeric" autocomplete="off" maxlength="6" value="${cents / 100}" aria-describedby="mx-err" data-key="mx"></div>
        <button class="step" data-action="mx-step" data-d="1" aria-label="Increase by ${money(event.increment)}" data-key="inc">${icon('plus')}</button></div>
      <p id="mx-err" class="err" role="alert">${esc(v.msg)}</p>
      ${t ? `<p class="hint">The top bid now is ${money(t.amount)}.</p>` : ''}</div></div>
    <div class="sheet-foot"><button class="btn primary block lg" id="cta" data-action="${v.below ? 'mx-update-min' : 'mx-review'}" data-key="mx-review" ${v.ok ? '' : 'disabled'}>${v.below ? `Update to ${money(min)}` : `Review ${money(cents)} maximum`}</button><button class="btn-link center" data-action="close-sheet">Not now</button></div>`;
}
function maxConfirm(lot) {
  const cents = mxDraft(lot), id = state.identity, ack = !!state.mflow.ack;
  return `${head('Confirm your maximum')}<div class="sheet-scroll">${lotMini(lot)}${forBlock()}
    <div class="mx-sum"><span class="lbl">Private maximum, simulated</span><span class="amt xl">${money(cents)}</span></div>
    <section class="commit-box"><h3>What this does</h3><ul>${mxCommit(lot, cents)}</ul></section>
  </div>
    <div class="sheet-foot"><label class="confirm"><input type="checkbox" data-action="mx-ack" data-keep data-key="mx-ack" ${ack ? 'checked' : ''}><span>I confirm a ${money(cents)} private maximum on Lot ${esc(lot.number)} for <b>${esc(id.business)}</b>. I understand it is a simulation and places no bids.</span></label><button class="btn primary block lg" data-action="mx-save" data-key="mx-save" ${ack ? '' : 'disabled'}>Confirm ${money(cents)} maximum</button><button class="btn-link center" data-action="mx-back">Change the amount</button></div>`;
}
function maxResult(lot, m) {
  const idBlock = forBlock();
  const foot = (primary, secondary = '<button class="btn-link center" data-action="close-sheet">Close</button>') => `<div class="sheet-foot">${primary}${secondary}</div>`;
  const body = (cls, ic, title, text, extra = '') => `<div class="sheet-scroll">${lotMini(lot)}${idBlock}<div class="result t-${cls}" role="status"><span class="r-ic">${ic}</span><h3>${title}</h3><p>${text}</p>${extra}</div></div>`;
  const prevNote = m.prev ? ` Your earlier ${money(m.prev.amount)} maximum is still saved.` : '';
  if (m.status === 'saving') return head('Saving your maximum') + body('amber', icon('spinner'), `Saving ${money(m.amount)}…`, `Not saved yet. Nothing is placed either way.${prevNote} You can keep browsing.`) + foot('<button class="btn quiet block lg" data-action="close-sheet" data-key="done">Keep browsing</button>', '<span></span>');
  if (m.status === 'unconfirmed') return head('Maximum not confirmed') + body('hatch', icon('question'), `We couldn't confirm ${money(m.amount)}`, `We lost contact before we got an answer. It may or may not have been saved. Check its status before changing it. ${assume('A20')}`, '<p class="r-note" id="check-note" role="status"></p>') + foot('<button class="btn primary block lg" data-action="mx-check" data-key="check">Check status</button>');
  if (m.status === 'failed') {
    const why = m.reason === 'offline' ? "There's no connection, so nothing was sent." : m.reason === 'closed' ? 'Bidding closed before it could be saved.' : m.reason === 'lost' ? 'We checked: the server never received it.' : "It couldn't be sent.";
    const over = m.reason === 'closed' || state.snap.closed;
    return head('Not saved') + body('dashed', icon('x'), `${money(m.amount)} wasn't saved`, `${why}${prevNote || ' Nothing is saved.'}`, `<p class="r-note" id="check-note" role="status">${!state.online ? 'Still offline.' : ''}</p>`)
      + foot(over ? '<button class="btn quiet block lg" data-action="mx-discard" data-key="done">Close</button>' : '<button class="btn primary block lg" data-action="mx-retry" data-key="retry">Try again</button>', over ? '<span></span>' : '<button class="btn-link center" data-action="mx-discard">Discard this</button>');
  }
  return head('Maximum saved') + body('ink', icon('check'), `Your private maximum is ${money(m.amount)}`, `Saved${m.confirmedAt ? ` ${esc(m.confirmedAt)}` : ''} for <b>${esc(state.identity.business)}</b>, as a simulation. It has placed no bid and doesn't change who is leading. Only you see it. ${assume('A20')}`, '<p class="r-note" id="check-note" role="status"></p>')
    + foot(state.snap.closed ? '<button class="btn quiet block lg" data-action="close-sheet" data-key="done">Close</button>' : '<button class="btn primary block lg" data-action="mx-change" data-key="mx-change">Change maximum</button>', state.snap.closed ? '<span></span>' : '<button class="btn-link center" data-action="mx-remove" data-key="mx-remove">Remove maximum</button>');
}
export function maxSheet(lotId) {
  const lot = lotById(lotId);
  if (!lot) return { html: `${head('Lot not found')}<div class="sheet-scroll"><p>That lot isn't in this event.</p></div>`, lot: '' };
  if (!state.identity) return { html: identitySheet(), lot: lotId };
  const mode = mxMode(lotId), m = myMax(lotId);
  if (mode === 'closed') return { lot: lotId, html: `${head('Bidding is closed')}<div class="sheet-scroll">${lotMini(lot)}<div class="result t-grey"><span class="r-ic">${icon('clock')}</span><h3>No more maximums</h3><p>Bidding closed at ${esc(event.closes)}. ${assume('A8')}</p></div></div><div class="sheet-foot"><button class="btn quiet block lg" data-action="close-sheet">Close</button></div>` };
  if (mode === 'form') return { lot: lotId, html: maxForm(lot) };
  if (mode === 'confirm') return { lot: lotId, html: maxConfirm(lot) };
  return { lot: lotId, html: maxResult(lot, m) };
}

export const sheetFor = (q) => {
  const kind = q.get('sheet');
  if (kind === 'bid') return { kind, ...bidSheet(q.get('lot')) };
  if (kind === 'identity') return { kind, html: identitySheet(), lot: q.get('lot') || '' };
  if (kind === 'account') return { kind, html: accountSheet(), lot: '' };
  if (kind === 'users') return { kind, html: usersSheet(), lot: '' };
  if (kind === 'appearance') return { kind, html: appearanceSheet(), lot: '' };
  if (kind === 'welcome') return { kind, html: welcomeSheet(), lot: '' };
  if (kind === 'donate') return { kind, html: donateSheet(), lot: '' };
  if (kind === 'autobid') return { kind, ...maxSheet(q.get('lot')) };
  return null;
};
