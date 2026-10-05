// Small rendering helpers shared by every view. Same atoms as prototype A: one status vocabulary, one icon set.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PATHS = {
  back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7.5', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.8 17a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  chevron: 'M6 9l6 6 6-6', right: 'M9 5l7 7-7 7', lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z', info: 'M12 11v6M12 7.5v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  lots: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z', ticket: 'M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V8zM14 6v12',
  home: 'M4 11l8-7 8 7M6 10v10h12V10', calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5v.01',
  copy: 'M9 9h11v11H9zM5 15V5h10', printer: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z', tv: 'M3 6h18v12H3zM8 21h8',
  chat: 'M4 5h16v11H9l-5 4z', qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v0M14 20h6M20 17v3', flag: 'M6 21V4M6 5h11l-2 4 2 4H6',
  gavel: 'M4 20h9M7 13l5 5M10 6l5 5M12 4l6 6-3 3-6-6z', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  dup: 'M8 8h12v12H8zM4 16V4h12', dots: 'M5 12h.01M12 12h.01M19 12h.01', phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  play: 'M8 5l11 7-11 7z', pause: 'M8 5v14M16 5v14', expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', swap: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
  folder: 'M3 6h6l2 2h10v11H3z', list: 'M4 6h16M4 12h16M4 18h16', tag: 'M3 12V4h8l10 10-8 8z', undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-3',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name === 'spinner' ? '<path d="M21 12a9 9 0 11-6.2-8.56" class="spin"/>' : `<path d="${PATHS[name] || PATHS.info}"/>`}</svg>`;

const TONES = [['#DCE3F7', '#233A9B'], ['#F6D9CF', '#8F3015'], ['#D8EBDD', '#175C3A'], ['#EADDF3', '#5B2C86'], ['#F1E7C8', '#6D5413'], ['#D7ECEF', '#14585F']];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = (n) => { const w = String(n).replace(/&/g, ' ').split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase(); };
/** Circles are people and organizations; marigold is reserved for "yours" (the organization you are working as). */
export const circle = (name, px = 36, mine = false) => { const [bg, fg] = mine ? ['#F2B632', '#1A1814'] : TONES[hash(name) % TONES.length]; return `<span class="mark ci${mine ? ' mine' : ''}" style="--s:${px}px;background:${bg};color:${fg}" aria-hidden="true">${esc(initials(name))}</span>`; };
/** Sponsors are rounded squares (as in A). */
export const square = (name, px = 32) => { const [bg, fg] = TONES[hash(name) % TONES.length]; return `<span class="mark sq" style="--s:${px}px;background:${bg};color:${fg};border-radius:${Math.round(px * .24)}px" aria-hidden="true">${esc(initials(name))}</span>`; };

// ---- status vocabulary: green done, vermilion needs attention, amber suggestion, dashed not started, grey optional ----
export const STATUS = {
  done: { tone: 'green', label: 'Done', ic: 'check' }, attention: { tone: 'red', label: 'Needs attention', ic: 'alert' },
  todo: { tone: 'dashed', label: 'Not started', ic: 'clock' }, optional: { tone: 'grey', label: 'Optional', ic: 'plus' },
  suggest: { tone: 'amber', label: 'Suggestion', ic: 'info' }, progress: { tone: 'amber', label: 'In progress', ic: 'clock' }, sim: { tone: 'hatch', label: 'Simulated', ic: 'flag' },
};
export const badge = (kind, text, small = false) => { const s = STATUS[kind]; return `<span class="badge t-${s.tone}${small ? ' sm' : ''}">${icon(s.ic, 'sm')}${esc(text ?? s.label)}</span>`; };
export const stepBadge = (st, tier) => (st.status === 'done' ? badge('done') : st.status === 'attention' ? badge('attention') : st.status === 'progress' ? badge('progress') : tier === 'optional' ? badge('optional') : tier === 'recommended' ? badge('suggest', 'Recommended') : badge('todo'));

export const lbl = (t) => `<span class="lbl">${esc(t)}</span>`;
/** Inline marker for a decision the prototype does not make. Notes are listed on the Review notes rail. */
export const ASSUME = {
  S1: ['One window per lot', 'Provisional prototype assumption: each lot belongs to exactly one bidding window. Lots in several windows, relisting a lot in a later window, and moving a lot after the event is approved are not designed and are not simulated.'],
  S2: ['Catalog visibility across windows', 'Existing staging hides the catalog until bidding opens. How later windows change visibility is undecided. The preview offers two labeled possibilities; neither is a rule.'],
  S3: ['Changes after approval', 'There is no approval step here, so what staff may change after approval (windows, lots) is not designed. The readiness “reviewed” stamp is a local note, not an approval.'],
  S4: ['Bid increments', 'One fixed increment per event; the next eligible bid is the current top bid plus the increment, or the opening bid when there are no bids. Whether a bidder may bid above the minimum, tiered increments, and per-lot increments are undecided.'],
  S5: ['Money', 'USD whole-dollar fixtures, integer cents internally, like prototype A. Real currency and rounding rules are undecided.'],
  S6: ['Categories', 'Categories are a per-event list and a lot has at most one. They are separate from bidding windows. Whether categories carry over between events is undecided.'],
  S7: ['One shared event link', 'One link and QR for the whole event. It is not a ticket or credential: it admits and identifies no one. Link format, rotation or revocation, and whether it works before bidding opens are undecided. The domain shown is fictional.'],
  S8: ['What the screens show', 'No screens are connected. Slides use this draft’s lots; bid amounts and bidder names are not shown because what is public is undecided.'],
  S9: ['SMS', 'No provider is connected and nothing is sent. Provider, carrier registration, templates, opt-out handling and whether SMS is required to open an event are undecided. The readiness checks are a simulation.'],
  S10: ['Donations', 'Link-out only. BidZizi does not take, route or record donations here. Whether the platform ever handles donations is undecided.'],
  S11: ['Sponsors', 'Optional and presentation-only: names appear on the welcome page and screens, and a lot may credit one. Sponsor tiers, logos and approval are not designed.'],
  S12: ['Staff and local data', 'No sign-in, roles or concurrent editing. Data lives in this browser only and is lost if site data is cleared.'],
};
export const assume = (id) => { const [t, x] = ASSUME[id]; return `<button type="button" class="assume" data-assume aria-expanded="false" aria-label="Assumption ${id}: ${esc(t)}">${id}</button><span class="assume-note" hidden><b>Assumption ${id} · ${esc(t)}.</b> ${esc(x)}</span>`; };
export const simTag = (t = 'Simulated') => `<span class="sim-tag">${esc(t)}</span>`;

export function toast(msg, { tone = 'ink', action = null } = {}) {
  const host = document.getElementById('toasts');
  host.replaceChildren();
  const live = document.getElementById('live'); if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 20); }
  const el = document.createElement('div'); el.className = `toast t-${tone}`; el.setAttribute('role', 'status');
  const span = document.createElement('span'); span.textContent = msg; el.append(span);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label; b.dataset.toastAct = '1'; b.addEventListener('click', () => { action.run(); el.remove(); }); el.append(b); }
  host.append(el);
  const t = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, action ? 8000 : 4500);
  el.addEventListener('remove', () => clearTimeout(t));
}
