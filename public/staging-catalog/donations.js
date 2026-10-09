// A recorded manual commitment; client selection and review never submit it.
import {event,timestamp} from './data.js';
import {bidder} from './bidding.js';
import {memberRequest} from './collections.js';
export const donation={context:null,error:'',accessError:'',review:null,refusal:null,mode:'entry',amount:'25',nonprofitId:'',businessId:'',intent:null,receipt:null,checking:false};
let scope='',generation=0,refresh=null,sequence=0;
const actor=()=>bidder.context?.person.id;
const root=()=>'/api/bidder/events/'+encodeURIComponent(event.id)+'/donation-pledges';
const key=()=>`bz:donation-intent:v1:${actor()}/${event.id}`;
const changed=()=>window.dispatchEvent(new Event('member-change'));
export function donationMoney(minor){if(!Number.isSafeInteger(minor))return '—';const whole=Math.floor(minor/100),fraction=minor%100;return '$'+whole.toLocaleString('en-US')+(fraction?'.'+String(fraction).padStart(2,'0'):'');}
export function donationMinor(text){if(!/^\d+(?:\.\d{1,2})?$/.test(String(text)))return null;const [whole,fraction='']=String(text).split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(n)&&n>0?n:null;}
const save=()=>{try{if(donation.intent)localStorage.setItem(key(),JSON.stringify(donation.intent));else localStorage.removeItem(key());}catch{}};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validAvailability=a=>a===null||a?.mode==='any-time'||a?.mode==='window'&&Number.isFinite(Date.parse(a.opensAt))&&Number.isFinite(Date.parse(a.closesAt))&&Date.parse(a.closesAt)>Date.parse(a.opensAt);
function validContext(c){return c?.event?.id===event.id&&typeof c.event.name==='string'&&uuid(c.organization?.id)&&typeof c.organization.name==='string'&&c.person?.id===actor()&&typeof c.person.name==='string'&&c.unit==='trade-dollar'&&c.scale===100&&typeof c.enabled==='boolean'&&typeof c.policyReady==='boolean'&&(c.minimumMinor===null||Number.isSafeInteger(c.minimumMinor)&&c.minimumMinor>0)&&(c.amountCapMinor===null||Number.isSafeInteger(c.amountCapMinor)&&c.amountCapMinor>0)&&validAvailability(c.availability)&&(!c.policyReady||c.minimumMinor!==null&&c.amountCapMinor>=c.minimumMinor&&c.availability!==null)&&Array.isArray(c.businesses)&&Array.isArray(c.nonprofits)&&c.businesses.every(b=>uuid(b.id)&&typeof b.name==='string'&&typeof b.canPledge==='boolean')&&c.nonprofits.every(n=>uuid(n.id)&&typeof n.name==='string'&&typeof n.description==='string'&&Number.isSafeInteger(n.version)&&n.version>=0);}
function receiptMatches(r,p){return r&&p&&uuid(r.id)&&r.eventId===event.id&&r.organizationId===donation.context?.organization.id&&r.actorId===actor()&&r.requestId===p.requestId&&uuid(r.requestId)&&r.businessId===p.businessId&&r.nonprofit?.id===p.nonprofitId&&r.nonprofit.version===p.nonprofitVersion&&r.amountMinor===p.amountMinor&&Number.isSafeInteger(r.amountMinor)&&r.amountMinor>0&&r.unit==='trade-dollar'&&r.scale===100&&r.status==='pending_staff_settlement'&&typeof r.actorName==='string'&&typeof r.nonprofit.name==='string'&&typeof r.nonprofit.description==='string'&&typeof r.businessName==='string'&&Number.isFinite(Date.parse(r.recordedAt));}
export function donationAvailability(){const a=donation.context?.availability;return a?.mode==='window'?`Configured donation window: ${timestamp(a.opensAt)} to ${timestamp(a.closesAt)}. Current eligibility is checked by the server.`:a?.mode==='any-time'?'Configured availability: any time. Current eligibility is checked by the server.':'Donation availability has not been configured.';}
const definiteRefusals=['NONPROFIT_CHANGED','DONATIONS_DISABLED'];
function refuse(intent,code,message){donation.refusal={requestId:intent.requestId,code};donation.mode='refused';donation.error=message||'The server refused this original donation before recording it.';try{localStorage.setItem(key()+':refusal',JSON.stringify(donation.refusal));}catch{}}
export function editRefusedDonation(){if(donation.mode!=='refused'||!donation.refusal||!definiteRefusals.includes(donation.refusal.code))return;try{localStorage.setItem(key()+':last-refusal',JSON.stringify({intent:donation.intent,refusal:donation.refusal}));localStorage.removeItem(key()+':refusal');}catch{}donation.intent=null;donation.receipt=null;donation.refusal=null;donation.mode='entry';donation.error='';save();changed();void refreshDonation();}
export async function refreshDonation(){
 if(!actor())return;const g=generation,s=++sequence;
 try{const r=await memberRequest(root()+'/context');if(g!==generation||s!==sequence)return;
  if(r.status===200&&validContext(r.data)){donation.context=structuredClone(r.data);donation.accessError='';if(!donation.nonprofitId)donation.nonprofitId=r.data.nonprofits[0]?.id||'';if(!donation.businessId)donation.businessId=r.data.businesses.find(b=>b.canPledge)?.id||r.data.businesses[0]?.id||'';}
  else{donation.context=null;if([401,403].includes(r.status)){++generation;donation.receipt=null;donation.review=null;donation.mode='denied';donation.checking=false;}donation.accessError=r.data.error?.message||'Donation access could not be confirmed.';}
 }catch{if(g===generation&&s===sequence){donation.accessError='Donation status is out of date. Reconnect and refresh before confirming.';}}
 if(g!==generation&&donation.mode==='denied'){changed();return;}
 if(g===generation){changed();if(donation.intent&&!donation.receipt&&!donation.checking&&!['pending','refused','denied'].includes(donation.mode))void checkDonation();}
}
export function setDonationContext(){
 const next=[event.id,bidder.epoch,actor()].join('/');
 if(scope!==next){scope=next;++generation;refresh=null;Object.assign(donation,{context:null,error:'',accessError:'',review:null,refusal:null,mode:'entry',amount:'25',nonprofitId:'',businessId:'',intent:null,receipt:null,checking:false});
  if(actor())try{const p=JSON.parse(localStorage.getItem(key()));if(p?.actorId===actor()&&typeof p.requestId==='string'&&typeof p.businessId==='string'&&typeof p.nonprofitId==='string'&&Number.isSafeInteger(p.amountMinor)&&Number.isSafeInteger(p.nonprofitVersion)){donation.intent=p;donation.mode='unconfirmed';const refusal=JSON.parse(localStorage.getItem(key()+':refusal'));if(refusal?.requestId===p.requestId&&definiteRefusals.includes(refusal.code)){donation.refusal=refusal;donation.mode='refused';}}}catch{}
 }
 if(actor()&&refresh!==bidder.refresh){refresh=bidder.refresh;void refreshDonation();}
}
export function donationValidity(){
 const c=donation.context,n=donationMinor(donation.amount),recipient=c?.nonprofits.find(n=>n.id===donation.nonprofitId),business=c?.businesses.find(b=>b.id===donation.businessId);
 if(donation.intent&&!donation.receipt)return 'Check your original donation before making another.';
 if(!c||donation.accessError||bidder.stale||!navigator.onLine)return 'Refresh the current donation status before continuing.';
 if(!c.policyReady||!Number.isSafeInteger(c.minimumMinor)||!Number.isSafeInteger(c.amountCapMinor))return 'Donation policy is still being prepared.';
 if(!c.enabled)return 'Donations are not enabled for this event.';
 if(!business?.canPledge)return 'Your current pass does not permit a donation.';
 if(!recipient)return 'Choose a current nonprofit.';
 if(n===null)return 'Enter a positive amount with up to two decimal places.';
 if(n<c.minimumMinor)return 'The minimum is '+donationMoney(c.minimumMinor)+'.';
 if(n>c.amountCapMinor)return 'The maximum is '+donationMoney(c.amountCapMinor)+'.';
 return '';
}
export function reviewDonation(){const error=donationValidity();if(error){donation.error=error;changed();return;}donation.review={recipient:structuredClone(donation.context.nonprofits.find(n=>n.id===donation.nonprofitId)),business:structuredClone(donation.context.businesses.find(b=>b.id===donation.businessId)),amountMinor:donationMinor(donation.amount)};donation.error='';donation.mode='review';changed();}
export function editDonation(){if(donation.intent&&!donation.receipt)return;donation.mode='entry';changed();}
export function anotherDonation(){if(donation.intent&&!donation.receipt)return;donation.intent=null;donation.receipt=null;donation.mode='entry';donation.amount='25';save();changed();}
export async function submitDonation(retry=false){
 if(donation.checking||donation.mode==='pending'||!actor()||!navigator.onLine)return;
 if(!retry){const error=donationValidity();if(error){donation.error=error;changed();return;}const n=donation.context.nonprofits.find(n=>n.id===donation.nonprofitId);if(donation.mode!=='review'||!donation.review||n.version!==donation.review.recipient.version||n.id!==donation.review.recipient.id||donation.businessId!==donation.review.business.id||donationMinor(donation.amount)!==donation.review.amountMinor){donation.error='Donation details changed. Return to the amount and review again.';changed();return;}donation.intent={actorId:actor(),requestId:crypto.randomUUID(),businessId:donation.businessId,nonprofitId:n.id,nonprofitVersion:n.version,amountMinor:donationMinor(donation.amount)};save();}
 if(!donation.intent)return;const g=generation,p=structuredClone(donation.intent);donation.mode='pending';donation.error='';changed();
 try{const r=await memberRequest(root(),p);if(g!==generation)return;
  if([200,201].includes(r.status)&&receiptMatches(r.data.receipt,p)){donation.receipt=structuredClone(r.data.receipt);donation.mode='recorded';}
  else if(r.status===409&&definiteRefusals.includes(r.data.error?.code)){refuse(p,r.data.error.code,r.data.error.message);}
  else{donation.mode='unconfirmed';donation.error=r.data.error?.message||'This donation may or may not have been recorded.';}
 }catch{if(g===generation){donation.mode='unconfirmed';donation.error='The response was lost. This donation may or may not have been recorded.';}}
 if(g===generation)changed();
}
export async function checkDonation(){
 if(!donation.intent||donation.checking||!actor()||!navigator.onLine)return;const g=generation,p=structuredClone(donation.intent);donation.checking=true;changed();
 try{const r=await memberRequest(root()+'/'+encodeURIComponent(p.requestId));if(g!==generation)return;
  if(r.status===200&&receiptMatches(r.data.receipt,p)){donation.receipt=structuredClone(r.data.receipt);donation.mode='recorded';donation.error='';}
  else{donation.mode=r.status===404?(donation.refusal?'refused':'not-found'):'unconfirmed';donation.error=r.data.error?.message||'The original donation could not be confirmed.';}
 }catch{if(g===generation){donation.mode='unconfirmed';donation.error='Reconnect to check the original donation.';}}
 finally{if(g===generation){donation.checking=false;changed();}}
}
