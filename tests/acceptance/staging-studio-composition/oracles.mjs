// Independent observations, never imported by product code.
import { isDeepStrictEqual as same } from 'node:util';
export class ReachedMismatch extends Error {}
const need = (condition, message) => { if (!condition) throw new ReachedMismatch(message); };
export function composition(o) {
  need(o.length === 2 && o.every(v => v.rows.length === 2 && !v.overflow && v.rows.every(r =>
    r.title === r.expected && r.complete && r.font >= (v.viewport>=1400?13:12) && r.photo.loaded &&
    r.photo.width >= 56 && r.photo.height >= 56 && r.number === r.expectedNumber)),
  'Catalog titles remain complete at desktop/laptop, with readable titles and prominent loaded photography.');
}
export function phone(o) {
  need(o.length === 3 && o.every(v => v.width >= 280 && v.width <= 400 &&
    v.height / v.width >= 1.85 && v.height / v.width <= 2.25 &&
    Math.abs(v.nativeWidth - v.width) <= 2 && Math.abs(v.nativeHeight - v.height) <= 2 &&
    v.unscaled && !v.horizontalOverflow && v.routes.join(',') === '/,/lots,/lot/' + v.lotId &&
    v.scrolled && v.mode === 'saved'),
  'Actual A iframe retains a native phone viewport, independent scrolling and real Welcome/Catalog/selected-item routes at1440/1280/390.');
}
export function checklist(o) {
  const by = (v, key) => v.steps.find(s => s.key === key);
  need(o.every(v => v.present && v.accessible && v.basis === 'saved' && /saved/i.test(v.text) &&
    by(v,'access')?.state === 'unavailable' && /unavailable|not available|not enabled/i.test(by(v,'access').text) &&
    !by(v,'access').action && /separate|independent/i.test(by(v,'approval')?.text || '')),
  'Setup uses confirmed saved state, distinguishes independent catalog approval, and explicitly leaves entry control unavailable.');
  need(by(o[0],'welcome')?.state === 'needs-attention' && by(o[0],'items')?.state === 'needs-attention' &&
    by(o[1],'welcome')?.state === 'complete' && by(o[1],'items')?.state === 'complete' &&
    /unsaved|working/i.test(o[2].text) && by(o[2],'items')?.state === 'complete' &&
    by(o[3],'items')?.state === 'needs-attention' && o[3].actionReached &&
    o.slice(0,4).every(v=>by(v,'approval')?.state==='needs-attention') &&
    by(o[4],'approval')?.state === 'pending' && by(o[5],'approval')?.state !== 'complete' &&
    /unavailable|unconfirmed|could not|not confirmed|failed/i.test(by(o[5],'approval')?.text||'') && by(o[6],'approval')?.state === 'complete',
  'Empty, saved, unsaved, saved-incomplete and independently approved states have truthful statuses and a real item correction action.');
}
export function invalid(o) {
  need(o.length === 2 && o.every(v => v.invalid && v.linked && v.alert && v.focused &&
    v.raw === '12.345' && v.error.length > 0 && v.puts === 0 && v.cleared),
  'Invalid opening/increment amounts are field-associated, announced, focused, retained and rejected without a save; correction clears obsolete errors.');
}
export function persistence(o) {
  need(o.createdEmpty && o.id && o.saved.revision === o.initialRevision + 1 && o.saved.lots.length === 2 &&
    o.saved.event.id===o.id&&o.saved.lots[0].opening === 12345 && same(o.api,o.expected) &&
    same(o.sql.event,o.expected.event) && same(o.sql.lots,o.expected.lots) &&
    o.sql.revision === o.saved.revision && o.reloadTitle === o.saved.event.name && o.reloadValue === o.saved.lots[1].title &&
    o.preview.eventId === o.id && o.preview.revision===o.saved.revision&&same(o.preview.consumed,o.expectedPreview),
  'Staff-created empty event and UI item edits persist with exact minor units, stable IDs/order, SQL/API and reload/consumed A agreement.');
}
export function selected(o) {
  need(same(o.current,[o.second]) && o.editor === o.expected && same(o.before,o.after),
  'The actual second edited row is current without changing independent bulk selection.');
}
export function savedWorking(o) {
  need(o.saved.mode === 'saved' && o.saved.revision === o.revision &&
    o.saved.eventId === o.id && same(o.saved.consumed,o.expectedSavedPreview) &&
    o.working.mode === 'working' && same(o.working.consumed,o.expectedWorkingPreview) && /working.*unsaved/i.test(o.label) &&
    same(o.before,o.after) && o.newDisabled && /sav(?:e|ed).*working draft|working draft.*sav(?:e|ed)/is.test(o.help),
  'Saved preview is the original confirmed tuple; working edits are visibly labeled, unsaved new items explain their saved-preview absence and SQL stays unchanged.');
}
export function navigation(o) {
  need(o.empty && o.createInvalid && o.createLinked && o.createFocused && o.createCleared && o.escapeReturned &&
    o.backHome && o.forwardEvent && o.narrow.length >= 6 && o.narrow.every(v => v.hit && v.within && v.enabled) && !o.overflow,
  'Empty/create validation, Escape return, native Back/Forward and reachable narrow editor inputs survive.');
}
export function held(o) {
  need(o.request && o.locked && o.status === 'Saving…' && same(o.before,o.during) && o.posts === 1 && o.cancelledLeave &&
    o.request.expectedRevision===o.before.revision && same(o.request.draft,o.expected) &&
    same({event:o.after.event,lots:o.after.lots},o.expected) && o.expected.lots[1].title===o.changedTitle &&
    o.after.revision === o.before.revision + 1 && o.preview.mode==='saved' && o.preview.eventId===o.id &&
    o.preview.revision===o.after.revision && same(o.preview.consumed,o.expectedPreview),
  'Held Save locks editor mutations, retains its event during departure attempts, makes no premature durable claim and commits once after release.');
}
export function lost(o) {
  need(o.requests.length === 2 && same(o.requests[0],o.requests[1]) && o.locked &&
    /not confirmed/i.test(o.uncertain) && o.requests[0].expectedRevision===o.startRevision &&
    same(o.requests[0].draft,o.expected) && same({event:o.sql.event,lots:o.sql.lots},o.expected) &&
    o.expected.lots[1].title===o.changedTitle && o.sql.revision === o.startRevision + 1 && o.requestCount === 1 &&
    same(o.sql,o.retrySQL) && o.status === 'Saved' && o.preview.mode==='saved' && o.preview.eventId===o.id &&
    o.preview.revision === o.sql.revision && same(o.preview.consumed,o.expectedPreview),
  'Lost committed Save remains unconfirmed and locked; exact UUID/payload retry recovers one revision/request without rewriting storage.');
}
export function isolation(o) {
  need(o.blocked && o.blockedLocked && o.noWrite && o.foreignDenied && o.spoofIgnored && o.privateCleared,
  'Expired authority blocks Save without writes, foreign staff cannot read the event, spoof messages cannot replace consumed A, and sign-out removes private content.');
}
