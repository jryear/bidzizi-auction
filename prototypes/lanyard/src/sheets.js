import { event, lotById, LOGOS } from './data.js';
import { state, lotStatus, topBid, minNext, acceptedEntryFor, isMine } from './store.js';
import { esc, money, icon, sponsorMark, monogram, assume } from './ui.js';

const INC = event.increment;
const thumb = (lot) => (lot.image ? `<img src="${lot.image}" alt="" width="1000" height="667">` : `<div class="art mini" style="--c:${LOGOS[lot.logo].bg}">${sponsorMark(lot.logo, 26)}</div>`);

const lotMini = (lot) => `<div class="lotmini"><div class="thumb sm">${thumb(lot)}</div><div><span class="lbl">Lot ${esc(lot.number)} · ${esc(lot.category)}</span><p>${esc(lot.title)}</p></div></div>`;
const forBlock = () => {
  const id = state.identity;
  return `<div class="forbiz">${monogram(id.business, 44, true)}<div><span class="lbl">Bidding for</span><b>${esc(id.business)}</b><small>Placed by ${esc(id.person)} ${assume('A3')}</small></div></div>`;
};
const head = (title, extra = '') => `<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title" tabindex="-1">${esc(title)}</h2><button class="x" data-action="close-sheet" aria-label="Close" data-key="x">${icon('close')}</button></div>${extra}`;

// ---- amount validation + live commitment ---------------------------------------------------
export function validate(lot, cents) {
  const min = minNext(lot);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, msg: 'Enter an amount.' };
  if (cents < min) return { ok: false, msg: `The minimum bid is ${money(min)}.`, below: true };
  if (cents % INC) return { ok: false, msg: `Bids go up in ${money(INC)} steps. Try ${money(Math.ceil(cents / INC) * INC)}.` };
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
  return [0, 1, 2].map((i) => min + i * INC).map((c) => `<button type="button" class="chip${c === cents ? ' on' : ''}" data-action="quick" data-v="${c}" aria-pressed="${c === cents}">${money(c)}</button>`).join('');
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
  dlg.querySelector('[data-d="-1"]').disabled = cents - INC < min;
  const input = dlg.querySelector('#amt');
  if (document.activeElement !== input) input.value = String(cents / 100);
}

// ---- bid sheet --------------------------------------------------------------------------------
function bidForm(lot) {
  const cents = draftFor(lot), v = validate(lot, cents), min = minNext(lot), t = topBid(lot.id);
  const raise = t && isMine(t);
  return `${head(raise ? 'Raise your bid' : 'Place a bid')}
  <div class="sheet-scroll">${lotMini(lot)}${forBlock()}
    <div class="amount"><label class="lbl" for="amt">Your bid <span class="lbl-min">· minimum ${money(min)}, ${money(INC)} steps</span> ${assume('A5')}</label>
      <div class="stepper"><button class="step" data-action="step" data-d="-1" aria-label="Decrease by ${money(INC)}" ${cents - INC < min ? 'disabled' : ''} data-key="dec">${icon('minus')}</button>
        <div class="amt-field"><span class="cur" aria-hidden="true">$</span><input id="amt" inputmode="numeric" autocomplete="off" maxlength="6" value="${cents / 100}" aria-describedby="amt-err" data-key="amt"></div>
        <button class="step" data-action="step" data-d="1" aria-label="Increase by ${money(INC)}" data-key="inc">${icon('plus')}</button></div>
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
export function identitySheet() {
  const step = state.flow.step || 'phone', f = state.flow;
  const foot = (label, action, extra = '') => `<div class="sheet-foot"><button class="btn primary block lg" data-action="${action}" data-key="go">${label}</button>${extra}</div>`;
  if (step === 'phone') return `${head("Who's bidding?")}<div class="sheet-scroll"><p class="lead">Browsing is open to everyone. We only ask who you are when you place a bid, so your bids and standing are yours to come back to. ${assume('A1')}</p>
    <div class="field"><label for="f-phone">Mobile number</label><input id="f-phone" data-flow="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(555) 010-0142" value="${esc(f.phone || '')}" data-key="f-phone"></div>
    <p class="hint">We'll text you a code. ${assume('A2')}</p><p class="proto-note">Prototype: any number works and no text is sent.</p></div>${foot('Send code', 'id-phone')}`;
  if (step === 'code') return `${head('Enter your code')}<div class="sheet-scroll"><p class="lead">We sent a 6-digit code to <b>${esc(f.phone || 'your phone')}</b>.</p>
    <div class="field"><label for="f-code">6-digit code</label><input id="f-code" data-flow="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" value="${esc(f.code || '')}" data-key="f-code"></div>
    <p class="err" id="id-err" role="alert">${esc(f.err || '')}</p><p class="proto-note">Prototype: any 6 digits are accepted.</p></div>${foot('Verify', 'id-code', '<button class="btn-link center" data-action="id-back">Use a different number</button>')}`;
  const where = state.flow.intentLot ? 'Continue to bid' : 'Done';
  return `${head('Who are you bidding for?')}<div class="sheet-scroll"><p class="lead">Your bids are shown to everyone under both names. ${assume('A3')}</p>
    <div class="field"><label for="f-biz">Business</label><input id="f-biz" data-flow="business" autocomplete="organization" value="${esc(f.business ?? event.business)}" data-key="f-biz"></div>
    <div class="field"><label for="f-name">Your name</label><input id="f-name" data-flow="person" autocomplete="name" value="${esc(f.person ?? event.participant)}" data-key="f-name"></div>
    <p class="err" id="id-err" role="alert">${esc(f.err || '')}</p><p class="proto-note">Prototype: you simply declare these. No permission to bid for a business is checked.</p></div>${foot(where, 'id-who')}`;
}

export function accountSheet() {
  const id = state.identity;
  if (!id) return identitySheet();
  return `${head('Your bidding pass')}<div class="sheet-scroll"><div class="forbiz big">${monogram(id.business, 56, true)}<div><b>${esc(id.business)}</b><small>${esc(id.person)}</small><small>${esc(id.phone || '')}</small></div></div>
    <p class="lead">Bids you place are recorded under this business and name. Closing this tab won't lose them. ${assume('A12')}</p></div>
    <div class="sheet-foot"><button class="btn quiet block lg" data-action="close-sheet">Close</button><button class="btn-link center" data-action="sign-out" data-key="signout">Sign out of this device</button></div>`;
}

export const sheetFor = (q) => {
  const kind = q.get('sheet');
  if (kind === 'bid') return { kind, ...bidSheet(q.get('lot')) };
  if (kind === 'identity') return { kind, html: identitySheet(), lot: q.get('lot') || '' };
  if (kind === 'account') return { kind, html: accountSheet(), lot: '' };
  return null;
};
