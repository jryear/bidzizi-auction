// Prototype-only controls. This is review tooling, not product UI, and it is styled apart from it.
import { lots, assumptions } from './data.js';
import { state } from './store.js';
import { esc, icon } from './ui.js';

const OUTCOMES = [
  ['accept', 'Succeeds'],
  ['stale', 'Rival lands first (not placed)'],
  ['closed', 'Bidding closes first (not placed)'],
  ['not_sent', "Fails to send (not placed)"],
  ['timeout_landed', 'Times out, bid DID land (unconfirmed)'],
  ['timeout_lost', 'Times out, bid did NOT land (unconfirmed)'],
];
const QUESTIONS = [
  ['Which business am I bidding for?', 'Pass at the top of Lots / My bids / Event; the chip on a lot; the action bar; the bid sheet.'],
  ['What does this action commit me to?', 'Open any lot, tap Bid. Read "What this does", then change the amount.'],
  ['Am I leading?', 'Seed the demo bidder, then compare cards, lot pages, and My bids.'],
  ['Can I return to exactly where I was?', 'Scroll Lots, open a lot, press Back. Also: switch tabs, then reload.'],
  ['Is it the same interaction everywhere?', 'Bid from a card’s lot, from My bids, and from a failed ticket: the same sheet each time.'],
];

export function panelHtml(route) {
  const lotOptions = lots.map((l) => `<option value="${l.id}">Lot ${l.number} · ${esc(l.short)}</option>`).join('');
  const closed = state.server.closed;
  return `
  <div class="p-head"><div><span class="p-tag">Prototype only</span><h2>Review controls</h2></div><button class="p-x" data-p="panel-close" aria-label="Close controls">${icon('close')}</button></div>
  <p class="p-lede">Simulated server in this browser. Not part of the product. Nothing here is real.</p>

  <section><h3>Walk the journey</h3>
    <ol class="p-steps">
      <li><button data-p="go" data-to="/">1 · Arrive from the QR code</button></li>
      <li><button data-p="go" data-to="/lots">2 · Browse open lots</button></li>
      <li><button data-p="go" data-to="/lot/cabin">3 · Open a lot</button></li>
      <li><button data-p="bid-cabin">4 · Bid (asks who you are first)</button></li>
      <li><button data-p="go" data-to="/bids">5 · Standing in My bids</button></li>
      <li><button data-p="go" data-to="/event">6 · How bidding works</button></li>
    </ol>
    <div class="p-row"><button data-p="seed">Seed a demo bidder (leading, outbid, not placed, unconfirmed)</button></div>
    <div class="p-row"><button data-p="signout">Forget identity (try the first-bid ask again)</button><button data-p="reset" class="danger">Reset everything</button></div>
  </section>

  <section><h3>Make things happen</h3>
    <label class="p-field"><span>Next bid I submit…</span><select data-p="sim-next">${OUTCOMES.map(([v, t]) => `<option value="${v}"${state.sim.next === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="p-grid"><label class="p-field"><span>A rival bids on</span><select id="p-rival-lot">${lotOptions}</select></label><button data-p="rival">Rival bids</button></div>
    <div class="p-row">
      <button data-p="online" aria-pressed="${state.online}">${icon(state.online ? 'check' : 'wifiOff', 'sm')} Connection: ${state.online ? 'online' : 'OFFLINE'}</button>
      <button data-p="close-event" aria-pressed="${closed}">${closed ? 'Reopen bidding' : 'Close bidding now'}</button>
    </div>
    <p class="p-fine">While offline the app keeps showing the last standings it heard (${esc(state.snap.asOf)}). Rival bids made now stay hidden until it reconnects.</p>
  </section>

  <section><h3>Display</h3><label class="p-check"><input type="checkbox" data-p="assume-toggle" ${state.sim.assumptions ? 'checked' : ''}> Show assumption markers (A1–A12)</label></section>

  <section><h3>Where to look</h3><ul class="p-q">${QUESTIONS.map(([q, a]) => `<li><b>${q}</b><span>${a}</span></li>`).join('')}</ul></section>

  <section><h3>Assumptions</h3><p class="p-fine">Rules the product has not decided. Each is marked where it affects a screen.</p>
    <dl class="p-assume">${Object.entries(assumptions).map(([id, [t, d]]) => `<div><dt><b>${id}</b> ${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl></section>
  <p class="p-fine">Route: <code>${esc(route.path)}</code></p>`;
}
