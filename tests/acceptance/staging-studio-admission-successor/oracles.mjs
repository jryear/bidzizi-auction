import assert from 'node:assert/strict';
import {isDeepStrictEqual as same} from 'node:util';
import {ReachedMismatch} from '../staging-studio-composition/oracles.mjs';
import {currentEntry} from '../staging-staff-event-entry/oracles.mjs';
export {ReachedMismatch};
const need=(value,message)=>{if(!value)throw new ReachedMismatch(message);};
const by=(v,key)=>v?.steps?.find(s=>s.key===key);
const revision=(row,n)=>new RegExp('\\brevision\\s*[:#·]?\\s*'+n+'\\b','i').test(row?.text||'');
function current(v,e,enabled,n){
  need(v?.api&&v.sql,'Actual current entry API and SQL observations are required.');
  try{currentEntry({status:v.api.status,data:v.api.data,headers:new Headers({'cache-control':v.api.cacheControl})},
    {eventId:e.id,origin:e.origin,enabled,revision:n,clockBounds:v.api.clock});}
  catch(error){if(!(error instanceof assert.AssertionError))throw error;throw new ReachedMismatch('Actual entry API contradicts current event/revision/clock truth: '+error.message);}
  need(!v.api.hasSetCookie,'Entry control read cannot issue a private session.');
  need(n===0?v.sql.entry.length===0:v.sql.entry.length===1&&v.sql.entry[0].event_id===e.id&&
    v.sql.entry[0].org_id===e.organizationId&&v.sql.entry[0].enabled===enabled&&v.sql.entry[0].entry_revision===n&&
    v.sql.entry[0].updated_by===e.actorId&&Date.parse(v.sql.entry[0].updated_at)===Date.parse(v.api.data.entry.updatedAt),
    'Entry availability/revision must agree with independent current SQL.');
}
export function access(original,e){
  current(e.initial,e,false,0);
  // Original snapshots remain raw. A pending/error read is honest; only a
  // confirmed disabled row can assert the independently known initial revision.
  need(original.length===7&&original.every(v=>{const row=by(v,'access');return row&&!/until\s+ADMISSION/i.test(row.text)&&
    (row.state==='needs-attention'&&/disabled|not enabled/i.test(row.text)&&revision(row,0)||
     row.state==='pending'&&/checking|loading|pending|not confirmed|unconfirmed/i.test(row.text)||
     row.state==='unavailable'&&/unconfirmed|could not|not confirmed|failed|error|denied|forbidden/i.test(row.text));}),
    'All seven raw saved setup access rows must truthfully reflect disabled or unconfirmed current entry.');
  const initial=by(e.initial.dom?.checklist,'access');
  need(e.initial.dom?.panelCount===1&&e.initial.dom.panelState==='disabled'&&e.initial.dom.buttons.enable.enabled&&
    initial?.state==='needs-attention'&&/disabled|not enabled/i.test(initial.text)&&revision(initial,0)&&!e.initial.dom.buttons.copy.enabled,
    'Actual entry controls are available for confirmed disabled revision0 without a share-ready claim.');
  current(e.saving,e,false,0);current(e.uncertain,e,true,1);current(e.enabled,e,true,1);
  const held=by(e.saving.dom?.checklist,'access'),uncertain=by(e.uncertain.dom?.checklist,'access'),enabled=by(e.enabled.dom?.checklist,'access');
  need(e.saving.dom.panelState==='saving'&&held?.state==='pending'&&/saving|pending|not confirmed/i.test(held.text)&&revision(held,0)&&
    !e.saving.dom.buttons.copy.enabled&&e.uncertain.dom.panelState==='uncertain'&&uncertain?.state!=='complete'&&
    /not confirmed|unconfirmed|uncertain/i.test(uncertain?.text||'')&&revision(uncertain,0)&&!e.uncertain.dom.buttons.copy.enabled&&
    e.uncertain.dom.buttons.check.enabled,'Pending/lost entry updates cannot claim confirmed enablement or expose an operational share action.');
  need(e.requests?.length===2&&same(e.requests[0],e.requests[1])&&
    same(Object.keys(e.requests[0]).sort(),['enabled','expectedEntryRevision','requestId'])&&e.requests[0].enabled===true&&
    e.requests[0].expectedEntryRevision===0&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.requests[0].requestId)&&
    e.lostResponseStatus===200&&same(e.uncertain.sql,e.enabled.sql)&&e.enabled.sql.ledger.length===1&&
    e.enabled.sql.ledger[0].actor_id===e.actorId&&e.enabled.sql.ledger[0].event_id===e.id&&
    e.enabled.sql.ledger[0].request_id===e.requests[0].requestId&&e.enabled.sql.ledger[0].expected_revision===0&&
    e.enabled.sql.ledger[0].requested_enabled===true&&e.enabled.sql.ledger[0].applied_revision===1&&e.enabled.sql.ledger[0].applied_enabled===true,
    'Actual native lost enable must retry the exact UUID/body and settle one independent entry revision/receipt.');
  need(e.enabled.dom.panelState==='enabled'&&enabled?.state==='complete'&&/enabled/i.test(enabled.text)&&revision(enabled,1)&&
    e.enabled.dom.buttons.disable.enabled&&e.enabled.dom.buttons.copy.enabled&&e.enabled.dom.link.count===1&&
    e.enabled.dom.link.value===e.origin+'/events/'+e.id,
    'Saved setup can claim available entry only after confirmed current revision1 with the real event destination and controls.');
  const denied=by(e.denied?.dom?.checklist,'access');
  need(e.deniedMutationStatus===403&&e.denied?.api.status===403&&e.denied.api.data?.error?.code==='FORBIDDEN'&&
    same(Object.keys(e.denied.api.data),['error'])&&!e.denied.api.hasSetCookie&&/no-store/i.test(e.denied.api.cacheControl)&&
    same(e.denied.sql,e.enabled.sql)&&denied?.state!=='complete'&&
    /denied|forbidden|expired|blocked|not permitted|not authorized|unavailable|could not|not confirmed/i.test(denied?.text||'')&&
    !e.denied.dom.buttons.enable.enabled&&!e.denied.dom.buttons.disable.enabled&&!e.denied.dom.buttons.copy.enabled,
    'Current staff denial must remove operational/share claims without changing durable entry or private authority.');
}
export function checklist({original:o,entry}){
  const by = (v, key) => v.steps.find(s => s.key === key);
  need(o.every(v => v.present && v.accessible && v.basis === 'saved' && /saved/i.test(v.text) &&
    /separate|independent/i.test(by(v,'approval')?.text || '')),
  'Setup uses confirmed saved state and distinguishes independent catalog approval.');
  need(by(o[0],'welcome')?.state === 'needs-attention' && by(o[0],'items')?.state === 'needs-attention' &&
    by(o[1],'welcome')?.state === 'complete' && by(o[1],'items')?.state === 'complete' &&
    /unsaved|working/i.test(o[2].text) && by(o[2],'items')?.state === 'complete' &&
    by(o[3],'items')?.state === 'needs-attention' && o[3].actionReached &&
    o.slice(0,4).every(v=>by(v,'approval')?.state==='needs-attention') &&
    by(o[4],'approval')?.state === 'pending' && by(o[5],'approval')?.state !== 'complete' &&
    /unavailable|unconfirmed|could not|not confirmed|failed/i.test(by(o[5],'approval')?.text||'') && by(o[6],'approval')?.state === 'complete',
  'Empty, saved, unsaved, saved-incomplete and independently approved states have truthful statuses and a real item correction action.');
  access(o,entry);
}
