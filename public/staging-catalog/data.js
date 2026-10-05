// Presentation adapter for an authorized, immutable API response. No seed lots.
export {LOGOS} from '../staging-bidder-preview/src/data.js';
export const assumptions={};
export const event={},lots=[],categories=['All'],sponsors=[];
export const catalog={phase:'scheduled',serverNow:null,schedule:null,organization:null};
export const lotById=id=>lots.find(l=>l.id===id);
const photos=/^assets\/lots\/(?:cabin|coffee|dinner|ceramics|bicycle|flowers)\.jpg$/;
export const photo=p=>typeof p==='string'&&photos.test(p)?'/staging-bidder-preview/'+p:null;
export function timeText(value){return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'numeric',minute:'2-digit'}).format(new Date(value));}
export function dateText(value){return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(new Date(value));}
export function applyAudience(p){
 Object.keys(event).forEach(k=>delete event[k]);
 Object.assign(catalog,{phase:p.phase,serverNow:p.serverNow,schedule:structuredClone(p.schedule),organization:structuredClone(p.organization)});
 Object.assign(event,structuredClone(p.event),{host:p.organization.name,cover:photo(p.event.cover),date:dateText(p.schedule.opensAt),opens:timeText(p.schedule.opensAt),closes:timeText(p.schedule.closesAt),timezone:'UTC'});
 const visible=p.phase!=='scheduled'&&p.catalog!==null;
 lots.splice(0,lots.length,...(visible?p.catalog.lots.map(l=>({...structuredClone(l),image:photo(l.image),sponsor:l.provider.name})):[]));
 categories.splice(0,categories.length,'All',...new Set(lots.map(l=>l.category)));
 sponsors.splice(0,sponsors.length,...(p.event.sponsorsEnabled?p.event.sponsors.filter(s=>s.name.trim()).map(s=>structuredClone(s)):[]));
}

