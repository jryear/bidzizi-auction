import { esc, icon, badge } from './ui.js';
import { validWindows } from './model.js';

/** Route to a section of an event. `#x` shortcuts become ?at=x so the URL hash stays a clean route. */
export const href = (evId, section, q = '') => `#/e/${evId}/${section}${q.startsWith('#') ? `?at=${q.slice(1)}` : q}`;

export const SECTIONS = [
  { id: 'overview', label: 'Overview', ic: 'home', group: '' },
  { id: 'details', label: 'Event page', ic: 'calendar', group: 'Set up' },
  { id: 'lots', label: 'Lots', ic: 'lots', group: 'Set up' },
  { id: 'windows', label: 'Bidding windows', ic: 'clock', group: 'Set up' },
  { id: 'increments', label: 'Bid increments', ic: 'gavel', group: 'Set up' },
  { id: 'access', label: 'Attendee access', ic: 'qr', group: 'Event day' },
  { id: 'displays', label: 'Displays', ic: 'tv', group: 'Event day' },
  { id: 'notifications', label: 'Notifications', ic: 'chat', group: 'Event day' },
  { id: 'donations', label: 'Donations', ic: 'heart', group: 'Event day' },
  { id: 'readiness', label: 'Readiness', ic: 'flag', group: 'Review' },
];
export const sectionLabel = (id) => SECTIONS.find((s) => s.id === id)?.label || id;

export function fixControl(ev, fix, { primary = false } = {}) {
  const cls = `btn sm ${primary ? 'primary' : 'quiet'}`;
  if (fix.section === 'preview') return `<button type="button" class="${cls}" data-action="preview-open">${esc(fix.label)}</button>`;
  return `<a class="${cls}" href="${href(ev.id, fix.section, fix.q)}">${esc(fix.label)}</a>`;
}

/** A one-click fix for the issues that have an obvious one. */
export function quickFix(ev, issue) {
  if (issue.fix.quick === 'confirm-increment') return `<button type="button" class="btn sm primary" data-action="confirm-increment" data-key="qf-inc">Confirm ${'$' + ev.increment.amount / 100}</button>`;
  if (issue.fix.quick === 'assign') {
    const ws = validWindows(ev); if (!ws.length) return '';
    const n = ev.lots.filter((l) => !ws.some((w) => w.id === l.windowId)).length;
    return `<span class="quickfix"><label class="sr" for="qa-${ev.id}">Window for unassigned lots</label><select id="qa-${ev.id}" data-quick-window data-key="qa-sel">${ws.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select><button type="button" class="btn sm primary" data-action="assign-unassigned" data-key="qf-assign">Assign ${n}</button></span>`;
  }
  return '';
}

export function issueList(ev, issues, { quick = true } = {}) {
  if (!issues.length) return '';
  return `<ul class="issues">${issues.map((i) => `<li class="iss s-${issKind(i)}">${icon(issIcon(i), 'sm')}<span class="iss-t">${esc(i.text)}</span><span class="iss-a">${(quick && quickFix(ev, i)) || fixControl(ev, i.fix)}</span></li>`).join('')}</ul>`;
}

export const issKind = (i) => (i.sev === 'blocker' ? (i.wrong ? 'wrong' : 'missing') : 'advice');
export const issIcon = (i) => (i.sev === 'blocker' ? (i.wrong ? 'alert' : 'plus') : 'info');
export const pageHead = (title, sub = '', right = '') => `<div class="page-head"><div><h1 tabindex="-1" data-key="h1">${esc(title)}</h1>${sub ? `<p class="lede">${sub}</p>` : ''}</div>${right ? `<div class="head-act">${right}</div>` : ''}</div>`;

export const field = (id, label, control, { hint = '', error = '', opt = false } = {}) =>
  `<div class="field">${label ? `<label for="${id}">${esc(label)}${opt ? ' <span class="opt">optional</span>' : ''}</label>` : ''}${control}${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ''}<p class="err" id="err-${id}" role="alert"${error ? '' : ' hidden'}>${esc(error)}</p></div>`;

export function progressSegments(ev, a) {
  return a.required.map((s) => `<a class="seg ${s.done ? 'done' : s.status === 'attention' ? 'attn' : ''}" href="${href(ev.id, s.section, s.issues[0]?.fix.q || '')}" aria-label="${esc(s.title)}: ${s.done ? 'done' : s.status === 'attention' ? 'needs attention' : 'not started'}" title="${esc(s.title)}"></a>`).join('');
}
export { badge };
