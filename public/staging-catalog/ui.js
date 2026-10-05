import { LOGOS, assumptions } from './data.js';
import { state } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (cents) => {
  if(!Number.isSafeInteger(cents))return 'Not set';
  const d = cents / 100;
  return '$' + (Number.isInteger(d) ? d.toLocaleString('en-US') : d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};

const PATHS = {
  back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6L6 18', check: 'M5 12.5l4.5 4.5L19 7.5', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.8 17a2 2 0 001.7 3h15a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  wifiOff: 'M3 3l18 18M8.5 16.4a5 5 0 017 0M5 12.9a10 10 0 014.1-2.3M12 20h.01M19 12.9a10 10 0 00-3.2-2M2 8.8a15 15 0 015.2-3M22 8.8A15 15 0 0012 5.2',
  list: 'M4 6h16M4 12h16M4 18h16', grid: 'M4 5h16v6H4zM4 13h16v6H4z', chevron: 'M6 9l6 6 6-6', lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  lots: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  ticket: 'M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V8zM14 6v12',
  info: 'M12 11v6M12 7.5v.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z', question: 'M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17v.5',
  x: 'M7 7l10 10M17 7L7 17', arrowUp: 'M12 19V5M6 11l6-6 6 6', sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  bookmark: 'M7 4h10v16l-5-4-5 4z', search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4', right: 'M9 5l7 7-7 7',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z', text: 'M4 19L10 5l6 14M6 14h8M18 9v8M15 12.5h6',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name === 'spinner' ? '<path d="M21 12a9 9 0 11-6.2-8.56" class="spin"/>' : `<path d="${PATHS[name]}"/>`}</svg>`;

/** Sponsors are squares. */
export function sponsorMark(id, px = 28) {
  const l = LOGOS[id];
  return `<span class="mark sq" style="--s:${px}px" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="${l.bg}"/>${l.g}</svg></span>`;
}
const TONES = [['#DCE3F7', '#233A9B'], ['#F6D9CF', '#8F3015'], ['#D8EBDD', '#175C3A'], ['#EADDF3', '#5B2C86'], ['#F1E7C8', '#6D5413'], ['#D7ECEF', '#14585F']];
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Bidding businesses are circles. Marigold is reserved for "yours". */
export function monogram(business, px = 36, mine = false) {
  const words = business.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  const init = ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase();
  const [bg, fg] = mine ? ['#F2B632', '#1A1814'] : TONES[hash(business) % TONES.length];
  return `<span class="mark ci${mine ? ' mine' : ''}" style="--s:${px}px;background:${bg};color:${fg}" aria-hidden="true">${esc(init)}</span>`;
}
export const monoFor = (b, px) => monogram(b.business, px, !!state.identity && b.business === state.identity.business && b.person === state.identity.person);

export const statusIcon = (kind, cls = 'sm') =>
  icon({ sending: 'spinner', unconfirmed: 'question', notplaced: 'x', leading: 'check', 'final-leading': 'check', outbid: 'alert' }[kind] || 'clock', cls);
export const badge = (st, small = false) =>
  st.kind === 'none' ? '' : `<span class="badge t-${st.tone}${small ? ' sm' : ''}">${statusIcon(st.kind)}${esc(st.label)}</span>`;

/** Inline marker for an undecided rule. Visibility is a prototype-wide toggle. */
export const assume = () => '';

export const lbl = (t) => `<span class="lbl">${esc(t)}</span>`;

// Toasts are a courtesy only. Standing is always shown in place; a toast never carries the only copy.
export function toast(msg, tone = 'ink') {
  const host = document.getElementById('toasts');
  host.replaceChildren(); // one at a time: a stack of toasts buries the thing being decided
  const el = document.createElement('div');
  el.className = `toast t-${tone}`;
  el.textContent = msg;
  host.append(el);
  document.getElementById('live').textContent = msg;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 4000);
}
