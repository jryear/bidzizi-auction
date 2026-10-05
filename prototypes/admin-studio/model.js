import { lots as kit } from './bidder/src/fixtures.shared.js';

export const STORAGE_KEY = 'bidzizi.admin-studio.v1';
export const clone = (x) => structuredClone(x);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const money = (n) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 }).format(n / 100);
export function cents(text) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(text))) return null;
  const [a,b=''] = String(text).split('.');
  const n = Number(a) * 100 + Number(b.padEnd(2,'0'));
  return Number.isSafeInteger(n) ? n : null;
}
export function fresh() {
  return {
    version:1, org:{ id:'org-saturn', name:'Saturn Barter', initials:'SB' },
    event:{ id:'evt-holiday', orgId:'org-saturn', name:'Holiday Trade Show', eyebrow:'Member auction',
      welcome:'Browse auction items provided by Saturn Barter.',
      venue:'Saturn Barter community event', cover:'assets/lots/dinner.jpg',
      date:'2026-12-10', start:'18:00', end:'20:00', timezone:'America/Los_Angeles', increment:2500,
      sponsorsEnabled:false, sponsors:[{ name:'Northline Community Partners', logo:'cedar' }] },
    lots:kit.map((l,i) => ({ ...clone(l), image:`assets/lots/${l.image}.jpg`, provider:'Saturn Barter', logo:'saturn',
      opening:[10000,5000,15000,5000,10000,5000][i], current:0, count:0, history:[], leader:null, person:null,
      description:i===5 ? '' : l.description, windowId:null })),
    release:null, savedAt:null,
  };
}
function localParts(ms, zone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
// Prototype conversion: refuse invalid or ambiguous DST wall times rather than guess.
export function wallTime(date, time, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y,m,d]=date.split('-').map(Number), [h,min]=time.split(':').map(Number);
  const target=Date.UTC(y,m-1,d,h,min);
  if (h>23 || min>59 || new Date(target).toISOString().slice(0,10)!==date) return null;
  try {
    const offsets=new Set([-86400000,0,86400000].map(delta=>{
      const ms=target+delta,p=localParts(ms,zone);
      return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-ms;
    }));
    const matches=[...offsets].map(off=>target-off).filter(ms=>{
      const p=localParts(ms,zone);
      return `${p.year}-${p.month}-${p.day}`===date && `${p.hour}:${p.minute}`===time;
    });
    return matches.length===1 ? matches[0] : null;
  } catch { return null; }
}
export const windowFor = (e) => ({ start:wallTime(e.date,e.start,e.timezone), end:wallTime(e.date,e.end,e.timezone) });
export function eventIssues(e) {
  const problems=[];
  if (!e.name.trim()) problems.push('Give the event a name.');
  if (!e.welcome.trim()) problems.push('Add a welcome message.');
  const w=windowFor(e);
  if (w.start===null || w.end===null) problems.push('Choose valid, unambiguous dates and times.');
  else if (w.end<=w.start) problems.push('Closing time must be after opening time.');
  if (!Number.isSafeInteger(e.increment) || e.increment<=0) problems.push('Set a positive bid increment.');
  return problems;
}
export function lotIssues(l,e) {
  const a=[];
  if (!l.title.trim()) a.push('title');
  if (!l.description.trim()) a.push('description');
  if (!l.category.trim()) a.push('category');
  if (!Number.isSafeInteger(l.opening) || l.opening<=0) a.push('opening bid');
  else if (Number.isSafeInteger(e.increment) && e.increment>0 && l.opening%e.increment) a.push('opening bid aligned to the increment');
  return a;
}
export function releaseIssues(d) {
  return [...eventIssues(d.event).map(message=>({message})),
    ...d.lots.filter(l=>l.windowId).flatMap(l=>lotIssues(l,d.event).map(x=>({lotId:l.id,message:`Lot ${l.number}: add ${x}.`}))),
    ...(!d.lots.some(l=>l.windowId) ? [{message:'Assign at least one lot to the auction window.'}] : [])];
}
export function makeRelease(d) {
  const issues=releaseIssues(d);
  if (issues.length) return {ok:false,issues};
  return {ok:true,release:{ id:crypto.randomUUID(), orgId:d.org.id, event:clone(d.event), lots:clone(d.lots.filter(l=>l.windowId)), approvedAt:new Date().toISOString() }};
}
export function statusAt(release,now) {
  if (!release) return 'draft';
  const w=windowFor(release.event);
  return now<w.start ? 'scheduled' : now<w.end ? 'open' : 'closed';
}
export function clockAt(e,stage) {
  const w=windowFor(e);
  if(w.start===null||w.end===null) return Date.now();
  return stage==='closed' ? w.end : stage==='open' ? w.start+60000 : w.start-1800000;
}
export function audiencePayload(d,stage,mode) {
  const copy=mode==='audience' && d.release ? d.release : d;
  const now=clockAt(d.release?.event || d.event,stage);
  const phase=mode==='audience' ? statusAt(d.release,now) : stage==='closed' ? 'closed' : stage==='open' ? 'open' : 'scheduled';
  return {event:copy.event,org:d.org,lots:copy.lots,now,phase,mode,visible:mode==='draft'||phase==='open'||phase==='closed'};
}
export const timeText = (t) => { if(!/^\d{2}:\d{2}$/.test(t))return 'Set time'; const [h,m]=t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };
export const dateText = (s) => s ? new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}) : 'Set date';
export const shortZone = (e) => { try{return new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,timeZoneName:'short'}).formatToParts(new Date(e.date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;}catch{return e.timezone;} };
