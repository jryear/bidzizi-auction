import assert from 'node:assert/strict';
const timestamp=value=>value instanceof Date?value.getTime():Date.parse(value);

export function currentEntry(response,{eventId,origin,enabled,revision,clockBounds}){
 assert.equal(response.status,200,'Reached current-entry API must return200');
 assert.match(response.headers.get('cache-control')||'',/no-store/i);
 const mutation=Object.hasOwn(response.data||{},'operation')||Object.hasOwn(response.data||{},'replayed');
 assert.deepEqual(Object.keys(response.data||{}).sort(),(mutation?['entry','serverNow','replayed','operation']:['entry','serverNow']).sort(),'Successful control DTO contains only public entry/control state');
 if(mutation){assert.equal(typeof response.data.replayed,'boolean');assert.deepEqual(Object.keys(response.data.operation||{}).sort(),['requestId','appliedRevision','enabled','appliedAt'].sort());}
 const e=response.data?.entry;
 assert.deepEqual(Object.keys(e||{}).sort(),['enabled','entryRevision','eventId','shareUrl','updatedAt'].sort());
 assert.equal(e.eventId,eventId);assert.equal(e.enabled,enabled);assert.equal(e.entryRevision,revision);
 assert.ok(Number.isSafeInteger(e.entryRevision)&&e.entryRevision>=0);
 assert.equal(e.shareUrl,origin+'/events/'+eventId,'Share destination is only configured-origin/event UUID');
 const u=new URL(e.shareUrl);assert.equal(u.search,'');assert.equal(u.hash,'');assert.equal(u.username,'');assert.equal(u.password,'');
 assert.ok(Number.isFinite(Date.parse(response.data.serverNow)),'DB current time is present');
 if(clockBounds){const at=Date.parse(response.data.serverNow);assert.ok(at>=clockBounds.before-1&&at<=clockBounds.after+1,'Current entry server time must fall within independent DB-before/after bound');}
 if(revision===0)assert.equal(e.updatedAt,null);else assert.ok(Number.isFinite(Date.parse(e.updatedAt)));
 return e;
}
export function applied(response,{requestId,enabled,revision,replayed=false}){
 const op=response.data?.operation;
 assert.deepEqual(Object.keys(op||{}).sort(),['requestId','appliedRevision','enabled','appliedAt'].sort());
 assert.equal(op.requestId,requestId);assert.equal(op.enabled,enabled);assert.equal(op.appliedRevision,revision);
 assert.ok(Number.isFinite(Date.parse(op.appliedAt)));assert.equal(response.data.replayed,replayed);
 return op;
}
export function persisted({entryRows,ledgerRows,sqlTimeMatches,eventId,organizationId,enabled,revision,requestId,actorId,expectedRevision,operation,entry,operationEnabled=enabled}){
 assert.equal(entryRows.length,1);assert.equal(entryRows[0].event_id,eventId);assert.equal(entryRows[0].enabled,enabled);
 assert.equal(entryRows[0].entry_revision,revision);
 assert.equal(entryRows[0].org_id,organizationId);assert.equal(entryRows[0].updated_by,actorId);
 assert.equal(timestamp(entryRows[0].updated_at),Date.parse(entry.updatedAt));
 const row=ledgerRows.find(r=>r.actor_id===actorId&&r.event_id===eventId&&r.request_id===requestId);
 assert.ok(row,'Independent SQL must contain exact actor/event/request control receipt');
 assert.equal(row.expected_revision,expectedRevision);assert.equal(row.requested_enabled,operationEnabled);
 assert.equal(row.applied_revision,expectedRevision+1);assert.equal(row.applied_enabled,operationEnabled);
 assert.equal(row.applied_revision,operation.appliedRevision);assert.equal(row.applied_enabled,operation.enabled);assert.equal(timestamp(row.applied_at),Date.parse(operation.appliedAt));
 assert.deepEqual(sqlTimeMatches,{entry:true,operation:true},'Independent SQL equality binds full timestamp precision, not only JS Date milliseconds');
 assert.equal(ledgerRows.filter(r=>r.actor_id===actorId&&r.event_id===eventId&&r.request_id===requestId).length,1);
}
export function preserved(before,after){assert.deepEqual(after,before,'Entry control must preserve publication, grants, private sessions, slots, bids and owned receipts');}
export function revisionConflict(response,currentRevision){
 denied(response,409,'ENTRY_REVISION_CONFLICT');
 assert.deepEqual(Object.keys(response.data).sort(),['error','currentEntryRevision'].sort());
 assert.equal(response.data.currentEntryRevision,currentRevision,'Stale control conflict returns independently observed durable current entry revision');
}
export function denied(response,status,code){
 assert.equal(response.status,status);if(code)assert.equal(response.data?.error?.code,code);
 assert.match(response.headers.get('cache-control')||'',/no-store/i);
 assert.doesNotMatch(response.text,/postgres(?:ql)?:|token_hash|password|\.neon\.tech|stack|SELECT |INSERT /i);
 assert.equal(response.headers.has('set-cookie'),false);
 if([401,403,404].includes(status)){
  assert.deepEqual(Object.keys(response.data||{}),['error'],'Unauthorized response cannot disclose entry, operation, revision or private state');
  assert.deepEqual(Object.keys(response.data.error).sort(),['code','message']);
  assert.doesNotMatch(response.text,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|SYNTHETIC-ENTRY-ONLY|Synthetic Entry Ada|Synthetic Entry Studio/i,'Unauthorized errors reveal no actor/business/event existence or claims');
 }
}

// Preserve only fixed error classes/operators and repository helper file positions.
// Error messages, function labels, actual/expected values and absolute paths are omitted.
const priorErrorSites=new WeakMap();
export function safeErrorSite(error){
 if(error&&typeof error==='object'&&priorErrorSites.has(error))return priorErrorSites.get(error);
 const classes=['AssertionError','Error','TypeError','RangeError','SyntaxError','ReferenceError','TimeoutError','AbortError','HarnessError','ApplicationFailure'];
 const errorClass=[error?.constructor?.name,error?.name].find(name=>classes.includes(name))||'Error';
 const operators=['strictEqual','notStrictEqual','deepStrictEqual','notDeepStrictEqual','equal','notEqual','deepEqual','notDeepEqual','match','doesNotMatch','throws','doesNotThrow','rejects','doesNotReject','fail','ifError','==','===','!=','!=='];
 const operator=operators.includes(error?.operator)?error.operator:null,frames=[];
 for(const line of typeof error?.stack==='string'?error.stack.split('\n').slice(1):[]){
  const match=line.match(/(tests\/acceptance\/(?:staging-staff-event-entry-evidence-successor|staging-staff-event-entry|staging-manual-bid|staff-drafts)\/[A-Za-z0-9._-]+\.mjs):(\d+):(\d+)\)?$/);
  if(match){frames.push({file:match[1],line:Number(match[2]),column:Number(match[3])});if(frames.length===8)break;}
 }
 return {class:errorClass,operator,frames};
}
export function preserveErrorSite(error,original){
 if(error&&typeof error==='object')priorErrorSites.set(error,safeErrorSite(original));
 return error;
}
