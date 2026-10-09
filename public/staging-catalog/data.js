// Presentation adapter for an authorized, immutable API response. No seed lots.
export {LOGOS} from '../staging-bidder-preview/src/data.js';
export const assumptions={};
export const event={},lots=[],categories=['All'],sponsors=[];
export const catalog={phase:'scheduled',serverNow:null,schedule:null,organization:null};
export const lotById=id=>lots.find(l=>l.id===id);
const photos=/^assets\/lots\/(?:cabin|coffee|dinner|ceramics|bicycle|flowers)\.jpg$/;
export const photo=p=>typeof p==='string'&&photos.test(p)?'/staging-bidder-preview/'+p:null;
const assetRef=/^asset:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function resolvedPhoto(ref,p){
 if(typeof ref==='string'&&assetRef.test(ref)&&p.assetContext?.version===1&&p.assetContext.approvalId===p.catalog?.approvalId)
  return '/api/catalog/events/'+encodeURIComponent(p.event.id)+'/assets/'+ref.slice(6)+'?approvalId='+encodeURIComponent(p.assetContext.approvalId);
 return photo(ref);
}
export function timeText(value){return new Intl.DateTimeFormat('en-US',{timeZone:event.timezone||'UTC',hour:'numeric',minute:'2-digit'}).format(new Date(value));}
export function dateText(value){return new Intl.DateTimeFormat('en-US',{timeZone:event.timezone||'UTC',month:'long',day:'numeric',year:'numeric'}).format(new Date(value));}
export function timestamp(value){return new Intl.DateTimeFormat('en-US',{timeZone:event.timezone||'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value));}
export const currencyLabel=()=>catalog.version===2?'Synthetic Saturn trade dollars':'Synthetic USD';
export const currencySymbol=()=>catalog.version===2?'T$':'$';
function timezone(p){const zone=p.schedule.timezone||p.event.timing?.timezone||p.event.timezone||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return zone;}catch{return 'UTC';}}
export function applyAudience(p){
 Object.keys(event).forEach(k=>delete event[k]);
 Object.assign(catalog,{version:p.version===2?2:1,phase:p.phase,serverNow:p.serverNow,schedule:structuredClone(p.schedule),organization:structuredClone(p.organization),approvalId:p.catalog?.approvalId||null});
 Object.assign(event,structuredClone(p.event),{host:p.organization.name,cover:resolvedPhoto(p.event.cover,p),timezone:timezone(p)});
 Object.assign(event,{date:dateText(p.schedule.opensAt),closeDate:dateText(p.schedule.closesAt),opens:timeText(p.schedule.opensAt),closes:timeText(p.schedule.closesAt)});
 const visible=(p.version===2||p.phase!=='scheduled')&&p.catalog!==null;
 lots.splice(0,lots.length,...(visible?p.catalog.lots.map(l=>({...structuredClone(l),image:resolvedPhoto(l.image,p),sponsor:l.provider.name})):[]));
 categories.splice(0,categories.length,'All',...new Set(lots.map(l=>l.category)));
 sponsors.splice(0,sponsors.length,...(p.event.sponsorsEnabled?p.event.sponsors.filter(s=>s.name.trim()).map(s=>({...structuredClone(s),logo:resolvedPhoto(s.logo,p)||s.logo})):[]));
}
