export const clone = (x) => structuredClone(x);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const money = (n) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 }).format(n / 100);
export function tradeMoney(minor, rules) {
  if (rules?.denomination !== 'SATURN_TRADE_DOLLAR_SYNTHETIC_V1' || rules.scale !== 100 ||
      !Number.isSafeInteger(minor) || minor < 0 || !Number.isSafeInteger(rules.amountCapMinor) || minor > rules.amountCapMinor) return 'Amount unavailable';
  return `T$${Math.floor(minor / 100).toLocaleString('en-US')}.${String(minor % 100).padStart(2,'0')}`;
}
export function tradeRulesText(rules) {
  if (!Array.isArray(rules?.tiers) || !rules.tiers.length || tradeMoney(0,rules) === 'Amount unavailable') return 'Bid rules are unavailable. Reload the saved event to check them.';
  let lower=0;
  const ranges=[];
  for (const [index,tier] of rules.tiers.entries()) {
    if (!Number.isSafeInteger(tier.raiseMinor) || tier.raiseMinor <= 0 || tier.raiseMinor > rules.amountCapMinor ||
        (tier.belowMinor === null ? index !== rules.tiers.length-1 : !Number.isSafeInteger(tier.belowMinor) || tier.belowMinor <= lower || tier.belowMinor > rules.amountCapMinor)) return 'Bid rules are unavailable. Reload the saved event to check them.';
    const range=tier.belowMinor===null?`from ${tradeMoney(lower,rules)}`:lower===0?`below ${tradeMoney(tier.belowMinor,rules)}`:`${tradeMoney(lower,rules)} to below ${tradeMoney(tier.belowMinor,rules)}`;
    ranges.push(`${range}: ${tradeMoney(tier.raiseMinor,rules)}`);lower=tier.belowMinor;
  }
  if (lower !== null) return 'Bid rules are unavailable. Reload the saved event to check them.';
  return `Minimum raise uses the current highest accepted bid: ${ranges.join('; ')}. A positive item override replaces the raise. The first bid starts at the opening amount. Any amount at or above the applicable minimum is allowed, up to ${tradeMoney(rules.amountCapMinor,rules)}.`;
}
export function cents(text) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(text))) return null;
  const [a,b=''] = String(text).split('.');
  const n = Number(a) * 100 + Number(b.padEnd(2,'0'));
  return Number.isSafeInteger(n) ? n : null;
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
  return a;
}
export function releaseIssues(d) {
  return [...eventIssues(d.event).map(message=>({message})),
    ...d.lots.filter(l=>l.windowId).flatMap(l=>lotIssues(l,d.event).map(x=>({lotId:l.id,message:`Lot ${l.number}: add ${x}.`}))),
    ...(!d.lots.some(l=>l.windowId) ? [{message:'Assign at least one lot to the auction window.'}] : [])];
}
export const timeText = (t) => { if(!/^\d{2}:\d{2}$/.test(t))return 'Set time'; const [h,m]=t.split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; };
export const dateText = (s) => s ? new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}) : 'Set date';
export const shortZone = (e) => { try{return new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,timeZoneName:'short'}).formatToParts(new Date(e.date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;}catch{return e.timezone;} };
