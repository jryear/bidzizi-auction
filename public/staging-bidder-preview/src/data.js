// The same content shape drives A's earned renderers. No seed identities or bid authority.
export const event={};
export const lots=[];
export const categories=['All'];
export const sponsors=[];
export const lotById=id=>lots.find(l=>l.id===id);
export let CLOSE_MIN=0,CLOCK0_MIN=0;
export const assumptions={};
export const network={name:''};
export const LOGOS = {
  cedar: { bg: '#2F5D46', g: '<path d="M20 7l7 10h-4l6 9H11l6-9h-4z" fill="#F5F0E6"/><rect x="18.4" y="26" width="3.2" height="7" fill="#F5F0E6"/>' },
  coffee: { bg: '#5B3A29', g: '<ellipse cx="20" cy="20" rx="8.5" ry="12" transform="rotate(35 20 20)" fill="#F5F0E6"/><path d="M14.5 27c4-3 7-10 11-14" stroke="#5B3A29" stroke-width="2.4" fill="none" stroke-linecap="round"/>' },
  table: { bg: '#7A2E3F', g: '<circle cx="20" cy="20" r="10.5" fill="none" stroke="#F5F0E6" stroke-width="2.6"/><circle cx="20" cy="20" r="3.8" fill="#F5F0E6"/>' },
  earth: { bg: '#B4573A', g: '<path d="M13 10h14c.8 6 3 8 3 13a10 8 0 01-20 0c0-5 2.2-7 3-13z" fill="#F5F0E6"/>' },
  spoke: { bg: '#1F6B74', g: '<circle cx="20" cy="20" r="11" fill="none" stroke="#F5F0E6" stroke-width="2.4"/><path d="M20 9v22M9 20h22M12.2 12.2l15.6 15.6M27.8 12.2L12.2 27.8" stroke="#F5F0E6" stroke-width="1.5"/>' },
  floral: { bg: '#B8456F', g: '<g fill="#F5F0E6"><circle cx="20" cy="11.5" r="5"/><circle cx="28.5" cy="20" r="5"/><circle cx="20" cy="28.5" r="5"/><circle cx="11.5" cy="20" r="5"/></g><circle cx="20" cy="20" r="3.8" fill="#B8456F"/>' },
  harbor: { bg: '#26335F', g: '<path d="M8 17c3-4 5-4 8 0s5 4 8 0 5-4 8 0M8 24c3-4 5-4 8 0s5 4 8 0 5-4 8 0" stroke="#F5F0E6" stroke-width="2.4" fill="none" stroke-linecap="round"/>' },
};

export let previewPhase = 'scheduled';
LOGOS.saturn = { bg:'#1A1814', g:'<ellipse cx="20" cy="20" rx="16" ry="6" transform="rotate(-25 20 20)" fill="none" stroke="#F2B632" stroke-width="2.2"/><circle cx="20" cy="20" r="8" fill="#F2B632"/>' };
export function applyAdminDraft(payload) {
  const e=payload.event;
  const asset=ref=>typeof ref==='string'&&ref.startsWith('asset:')?
    '/api/admin/events/'+encodeURIComponent(e.id)+'/assets/'+ref.slice(6):ref;
  if(e.version===2){
    const t=e.timing;
    Object.assign(event,e,{host:payload.org.name,date:t.startDate||'Date not set',
      opens:labelTime(t.start),closes:labelTime(t.end),timezone:t.timezone,
      cover:asset(e.cover),increment:2500});
    lots.splice(0,lots.length,...payload.lots.map(l=>({...structuredClone(l),
      image:asset(l.image),sponsor:l.provider||payload.org.name,logo:'saturn',opening:Number.isSafeInteger(l.opening)?l.opening:null})));
    categories.splice(0,categories.length,'All',...new Set(lots.map(l=>l.category)));
    sponsors.splice(0,sponsors.length,...(e.sponsorsEnabled?e.sponsors.filter(s=>s.name.trim()).map(s=>({...s,logo:asset(s.logo)})):[]));
    event.lotCount=lots.length;previewPhase=payload.phase;network.name=payload.org.name;
    CLOSE_MIN=0;CLOCK0_MIN=0;return;
  }
  Object.assign(event,e,{ host:payload.org.name,cover:asset(e.cover), date:e.date?new Date(e.date+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'}):'Date not set', closes:labelTime(e.end), opens:labelTime(e.start), timezone:zoneLabel(e), increment:Number.isSafeInteger(e.increment)&&e.increment>0?e.increment:2500 });
  lots.splice(0,lots.length,...payload.lots.map(l=>({...structuredClone(l),image:asset(l.image),sponsor:l.provider||payload.org.name,logo:'saturn',opening:Number.isSafeInteger(l.opening)?l.opening:null})));
  categories.splice(0,categories.length,'All',...new Set(lots.map(l=>l.category)));
  sponsors.splice(0,sponsors.length,...(e.sponsorsEnabled?e.sponsors.filter(s=>s.name.trim()).map(s=>({...s,logo:asset(s.logo)})):[]));
  event.lotCount=lots.length;
  const [h,m]=(e.end||'').split(':').map(Number);CLOSE_MIN=h*60+m;
  try { const parts=new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(payload.now);CLOCK0_MIN=Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value); } catch { CLOCK0_MIN=18*60; }
  previewPhase=payload.phase;network.name=payload.org.name;
}
function zoneLabel(e) { try{return new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,timeZoneName:'short'}).formatToParts(new Date(e.date+'T12:00:00Z')).find(p=>p.type==='timeZoneName').value;}catch{return e.timezone;} }
function labelTime(t) { if(!/^\d{2}:\d{2}$/.test(t))return 'Not set'; const [h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
