import { HarnessError } from '../staff-drafts/harness.mjs';
export class ReachedMismatch extends Error {
  constructor(message,observation={}) { super(message);this.observation=observation; }
}
export const canonical=value=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function expect(value,message,observation={}) { if(!value)throw new ReachedMismatch(message,observation); }
export function same(actual,expected,message,observation={}) { expect(equal(actual,expected),message,{...observation,actual,expected}); }
export const eventKeys=['name','eyebrow','welcome','venue','cover','timing','increment','sponsorsEnabled','sponsors'];
export const lotKeys=['id','title','short','description','category','image','alt','opening','includes','fine','windowId'];
export const pick=(raw,keys)=>Object.fromEntries(keys.map(k=>[k,raw?.[k]]));
export function available(response,corruption=null) {
  const declared=corruption?.applied===true&&['manifest','target','marker'].includes(corruption.kind)&&['eventId','approvalId','lotId'].every(k=>typeof corruption[k]==='string'&&/^[a-f0-9-]{36}$/.test(corruption[k]));
  if(response.status>=500||response.data?.error?.code==='UNAVAILABLE') {
    if(declared&&response.status===503&&response.data?.error?.code==='UNAVAILABLE')return;
    const error=new HarnessError('Unexpected application/provider unavailable response; not finite capability absence.');error.observation=response;throw error;
  }
}
export function acceptedTuple(receipt,known,bracket,timing) {
  const keys=['requestId','eventId','releaseId','lotId','actorId','businessId','amountMinor','rulesetId','currency','status','reason'];
  same(pick(receipt,keys),known,'Accepted immutable receipt differs from independently known intent/authority/target.');
  expect(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(receipt.bidId||''),'Accepted generated bid ID is not a UUIDv4.',receipt);
  const at=Date.parse(receipt.decidedAt);expect(Number.isFinite(at)&&new Date(at).toISOString()===receipt.decidedAt&&at>=Date.parse(bracket.before)&&at<=Date.parse(bracket.after)&&at>=Date.parse(timing.opensAt)&&at<Date.parse(timing.closesAt),'Accepted decision time is outside independent DB bracket/own window.',{receipt,bracket,timing});
  same(Object.keys(receipt).sort(),[...keys,'bidId','decidedAt'].sort(),'Accepted receipt exposes an undeclared field.');
}
export function privateMetadata(value) {
  if(!value||typeof value!=='object')return false;
  return Object.entries(value).some(([k,v])=>k==='_timing'||k==='_origin'||privateMetadata(v));
}
export function sealed(response) {
  expect(/no-store/i.test(response.cacheControl||''),'Private response must be uncached.',response);
  expect(!/postgres(?:ql)?:|\.neon\.tech|token_hash|password|stack_trace/i.test(JSON.stringify(response.data)),'Provider/auth details leaked.',response);
  expect(!privateMetadata(response.data),'Reserved persistence metadata leaked through public response.',response);
}
export function knownDraft(expected,packet,sql) {
  expect(packet.version===2&&sql.event.draft._timing?.version===2,'Persisted and public v2 versions differ.',{packet,sql});
  same(pick(packet.event,eventKeys),expected.event,'Saved API differs from independently entered full event.');
  same(pick(sql.event.draft,eventKeys),expected.event,'Stored JSON differs from independently entered full event.');
  same(packet.groups,expected.groups,'Saved groups differ from independently entered group schedule.');
  same(sql.event.draft._timing.groups,expected.groups,'Stored groups differ from independent known groups.');
  same(packet.lots.map(l=>pick(l,lotKeys)),expected.lots,'Saved full lot API tuple/order differs.');
  same(sql.lots.map(l=>l.data),expected.lots,'Stored full lot tuple/order differs.');
  expect(packet.revision===sql.event.revision,'Saved API/SQL revision differs.',{packet,sql});
  expect(!privateMetadata(packet),'Reserved metadata leaked in draft.');
}
export function consumedA(expected,observation) {
  same(observation.event,expected.event,'Actual A consumed a different known event tuple.');
  same(observation.lots,expected.lots,'Actual A consumed different complete lot content/order.');
  same(observation.groups,expected.groups,'Live A data module lacks the known saved group schedules.');
  expect(observation.selectedLotId===expected.selectedLotId,'Actual A selected item route differs from independently selected item.',observation);
  expect(observation.mode==='saved'&&observation.revision===expected.revision,'Actual A mode/revision is stale.',observation);
  for(const text of [expected.event.timing.timezone,...expected.groups.map(g=>g.name)])
    expect(observation.text.includes(text),'Actual A omits explicit date/timezone/group display: '+text,observation);
  for(const date of [expected.event.timing.startDate,expected.event.timing.endDate]){
    const [year,month,day]=date.split('-'),label=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
    const full=new RegExp('(?:'+label+'|'+label.slice(0,3)+')\\s+'+Number(day)+'(?:st|nd|rd|th)?(?:,)?\\s+'+year);
    expect(observation.text.includes(date)||full.test(observation.text),'Actual A omits readable complete start/end date: '+date,observation);
  }
  for(const group of expected.groups) {
    const rendered=observation.renderedGroups?.find(g=>g.id===group.id&&g.lotId===expected.selectedLotId);expect(!!rendered&&expected.lots.some(l=>l.id===rendered.lotId&&l.windowId===group.id),'Actual A has no rendered selected-item own group schedule.',{group,observation});
    same(rendered.local,{startDate:group.startDate,start:group.start,endDate:group.endDate,end:group.end,timezone:expected.event.timing.timezone},'Actual A rendered group local endpoints/timezone differ from independently entered values.');
    expect(rendered.visible===true&&rendered.text.includes(group.name)&&rendered.text.includes(expected.event.timing.timezone),'Actual A group schedule is not readable/visible.',rendered);
    for(const [date,time]of [[group.startDate,group.start],[group.endDate,group.end]]) {
      const [y,m,d]=date.split('-'),label=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')),dateLabel=new RegExp('(?:'+label+'|'+label.slice(0,3)+')\\s+'+Number(d)+'(?:st|nd|rd|th)?(?:,)?\\s+'+y),[h,min]=time.split(':').map(Number),human=new RegExp('\\b'+(h%12||12)+':'+String(min).padStart(2,'0')+'\\s*'+(h>=12?'PM':'AM')+'\\b','i');
      expect((rendered.text.includes(date)||dateLabel.test(rendered.text))&&(rendered.text.includes(time)||human.test(rendered.text)),'Actual A group does not render complete known date and local time.',{date,time,rendered});
    }
  }
}
export function phaseAt(timing,serverNow) { const n=Date.parse(serverNow);return n<Date.parse(timing.opensAt)?'scheduled':n<Date.parse(timing.closesAt)?'open':'closed'; }
export function phases(catalog,expectedSchedule,expectedTimingById) {
  sealed(catalog);const p=catalog.data;expect(p.version===2&&p.catalog,'Published v2 catalog must be visible before opens.',catalog);
  expect(catalog.dbTimeBracket&&Date.parse(p.serverNow)>=Date.parse(catalog.dbTimeBracket.before)&&Date.parse(p.serverNow)<=Date.parse(catalog.dbTimeBracket.after),'Catalog serverNow lies outside independent DB time bracket.',catalog);
  same(p.schedule,expectedSchedule,'Event schedule was derived from a selected group.');
  expect(p.phase===phaseAt(expectedSchedule,p.serverNow),'Event phase is not DB-projected explicit schedule.',p);
  for(const l of p.catalog.lots) {same(l.timing,expectedTimingById[l.id],'Effective timing differs from independent saved endpoints.');expect(l.phase===phaseAt(l.timing,p.serverNow),'Own item phase differs at common serverNow.',l);}
}
export function completion(observation) {
  expect(observation.completed===true&&observation.steps?.length>0,'Full bounded witness was not completed.',observation);
  expect(observation.steps.every(s=>s.pass===true),'A reached bounded witness failed.',observation);
}
