// A's manual-bid interaction, using current server context and durable receipts.
// Storage keeps an operation intent only. Acceptance is always read from the server.
import {catalog,event,lots,lotById,timestamp,currencyLabel,currencySymbol} from './data.js';
import {state} from './store.js';
import {esc,money,icon,monogram} from './ui.js';
import {reconcileHTML} from './reconcile.js';
const RULESET='staging-usd-manual-v1';
const ruleset=()=>catalog.version===2?'saturn-trade-tiered-v1':RULESET;
const denomination=()=>catalog.version===2?'SATURN_TRADE_DOLLAR_SYNTHETIC_V1':'USD';
const $=s=>document.querySelector(s);
export const bidder={context:null,eventId:null,epoch:null,refresh:null,stale:false,activeLot:null,entries:new Map()};
let generation=0,signature='',sheet=null,sheetReturn=null;
const changed=()=>window.dispatchEvent(new Event('bidder-change'));
const currentBusiness=()=>bidder.context?.businesses.find(b=>b.id===state.identity?.businessId)||bidder.context?.businesses.find(b=>b.canBid)||bidder.context?.businesses[0]||null;
const guard=()=>({generation,person:bidder.context?.person.id,event:bidder.eventId});
const current=g=>g.generation===generation&&g.person===bidder.context?.person.id&&g.event===bidder.eventId;
const root=lot=>`${catalog.version===2?'/api/v2':'/api'}/bidder/events/${encodeURIComponent(bidder.eventId)}/lots/${encodeURIComponent(lot)}`;
const entryFor=id=>{
 if(!bidder.entries.has(id))bidder.entries.set(id,{standing:null,loading:false,stale:false,error:'',sequence:0,intent:null,receipt:null,mode:null,checking:false,recoveryAttempted:false});
 return bidder.entries.get(id);
};
const key=lot=>`bz:manual-intent:v${catalog.version===2?2:1}:${bidder.context?.person.id}/${bidder.eventId}/${lot}`;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function validIntent(v){return v&&Object.keys(v).sort().join(',')==='amountMinor,businessId,requestId,rulesetId'&&uuid(v.requestId)&&uuid(v.businessId)&&Number.isSafeInteger(v.amountMinor)&&v.amountMinor>=0&&v.amountMinor<=1_000_000_000&&v.rulesetId===ruleset();}
function storedIntent(lot){
 try{const raw=localStorage.getItem(key(lot));if(!raw||raw.length>1000)return null;const v=JSON.parse(raw);return validIntent(v)&&bidder.context.businesses.some(b=>b.id===v.businessId)?v:null;}catch{return null;}
}
function saveIntent(lot,intent){try{localStorage.setItem(key(lot),JSON.stringify(intent));}catch{/* Server recovery remains available while this page stays open. */}}
async function request(path,body){
 const expected=guard(),expectedEpoch=bidder.epoch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(path,{signal:controller.signal,credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}),data=await response.json();
  const sessionResponse=await fetch('/api/session',{signal:controller.signal,credentials:'same-origin',cache:'no-store'}),session=await sessionResponse.json();
  if(!sessionResponse.ok||session.authenticated!==true||session.person?.id!==expected.person){window.dispatchEvent(new Event('member-session-changed'));throw new Error('The private session changed. The original bid remains with its owner.');}
  if(!current(expected)||expectedEpoch!==bidder.epoch)throw new Error('The member view changed before this response could be used.');
  return {status:response.status,data};
 }finally{clearTimeout(timer);}
}
function receiptMatches(receipt,intent,lot){
 return receipt&&intent&&receipt.requestId===intent.requestId&&receipt.eventId===bidder.eventId&&receipt.releaseId===catalog.approvalId&&receipt.lotId===lot&&receipt.actorId===bidder.context?.person.id&&receipt.businessId===intent.businessId&&receipt.amountMinor===intent.amountMinor&&receipt.rulesetId===intent.rulesetId&&receipt.currency===denomination()&&['accepted','rejected'].includes(receipt.status)&&Number.isFinite(Date.parse(receipt.decidedAt))&&(receipt.status==='accepted'?typeof receipt.bidId==='string'&&receipt.reason===null:receipt.bidId===null&&typeof receipt.reason==='string');
}
function validStanding(s,id){return s&&s.releaseId===catalog.approvalId&&s.lotId===id&&s.rulesetId===ruleset()&&s.currency===denomination()&&Number.isSafeInteger(s.incrementMinor)&&s.incrementMinor>0&&s.amountCapMinor===1_000_000_000&&(catalog.version===2?['scheduled','open','closed']:['open','closed']).includes(s.phase)&&typeof s.canBid==='boolean'&&Number.isFinite(Date.parse(s.serverNow))&&Number.isFinite(Date.parse(s.updatedAt))&&Number.isSafeInteger(s.version)&&Number.isSafeInteger(s.acceptedBidCount)&&(s.currentAmountMinor===null||Number.isSafeInteger(s.currentAmountMinor))&&(s.minimumAmountMinor===null||Number.isSafeInteger(s.minimumAmountMinor));}
function adoptReceipt(e,r,id){
 if(!receiptMatches(r,e.intent,id))return false;
 e.receipt=structuredClone(r);e.mode=r.status;return true;
}
export function hasManualAccess(){return !!bidder.context?.businesses.some(b=>b.canBid);}
export function setContext(message){
 if(message.eventId!==event.id||typeof message.epoch!=='number')return;
 const c=message.context;
 if(c!==null&&(!c||c.testMode!==true||typeof c.person?.id!=='string'||typeof c.person?.name!=='string'||!Array.isArray(c.businesses)||!c.businesses.every(b=>uuid(b.id)&&typeof b.name==='string'&&typeof b.canBid==='boolean')))return;
 const nextSignature=JSON.stringify([message.eventId,message.epoch,c?{testMode:c.testMode,version:c.version,person:c.person,businesses:c.businesses,phase:c.phase}:null]);
 const actorChanged=bidder.eventId!==message.eventId||bidder.epoch!==message.epoch||bidder.context?.person.id!==c?.person.id;
 if(nextSignature!==signature){
  ++generation;signature=nextSignature;
  if(!actorChanged){for(const entry of bidder.entries.values()){if(entry.mode==='pending')entry.mode='unconfirmed';}}
  if(actorChanged){bidder.entries.clear();sheetReturn=null;if($('#sheet')?.open)$('#sheet').close();sheet=null;}
 }
 const refreshChanged=bidder.refresh!==message.refresh;
 bidder.context=c?structuredClone(c):null;bidder.eventId=message.eventId;bidder.epoch=message.epoch;bidder.refresh=message.refresh;bidder.stale=!!message.stale||!navigator.onLine;
 const b=currentBusiness();state.identity=c&&b?{business:b.name,businessId:b.id,person:c.person.name,personId:c.person.id}:null;
 if(!c){bidder.entries.clear();sheetReturn=null;if($('#sheet')?.open)$('#sheet').close();sheet=null;}
 if(c)for(const l of lots){const e=entryFor(l.id);if(!e.intent){e.intent=storedIntent(l.id);if(e.intent){e.mode='unconfirmed';queueMicrotask(()=>recover(l.id,false));}}}
 changed();
 if(c&&bidder.activeLot&&(actorChanged||refreshChanged))void refreshLot(bidder.activeLot,{fresh:actorChanged});
 if(sheet)renderSheet();
}
export function activateLot(id){
 if(bidder.activeLot===id)return;
 bidder.activeLot=id;
 if(id&&bidder.context){
  const e=entryFor(id);e.loading=navigator.onLine&&!bidder.stale;
  queueMicrotask(()=>{if(bidder.activeLot===id)void refreshLot(id,{fresh:true});});
 }
}
export async function refreshLot(id,{fresh=false}={}){
 if(!bidder.context||!lotById(id))return;
 const e=entryFor(id),g=guard(),sequence=++e.sequence;
 if(!navigator.onLine||bidder.stale){e.stale=true;e.loading=false;changed();return;}
 if(fresh)e.loading=true;
 try{
  const r=await request(root(id)+'/standing');
  if(!current(g)||e.sequence!==sequence)return;
  if(r.status===200&&validStanding(r.data.standing,id)){
   const s=r.data.standing;
   if(!e.standing||Date.parse(s.serverNow)>=Date.parse(e.standing.serverNow)){e.standing=structuredClone(s);e.stale=false;e.error='';}
  }else if([401,403,404].includes(r.status)){
   e.standing=null;e.receipt=null;e.error='Bidding is not available to this account.';e.stale=false;
  }else if(r.status===409){e.standing=null;e.error=r.data.error?.code==='UNSUPPORTED_RULESET'?'This catalog uses a different bidding ruleset.':'Bidding has not opened.';e.stale=false;}
  else{e.stale=true;e.error='Standing could not be refreshed.';}
 }catch{if(!current(g)||e.sequence!==sequence)return;e.stale=true;e.error='No connection. The last confirmed standing is shown.';}
 if(!current(g)||e.sequence!==sequence)return;
 e.loading=false;
 if(!e.intent)e.intent=storedIntent(id);
 if(sheet?.lot===id&&sheet.mode==='review'&&e.standing){
  sheet.minimum=e.standing.minimumAmountMinor??1_000_000_001;
  sheet.increment=e.standing.incrementMinor;
 }
 changed();
 if(e.intent&&!e.receipt&&!e.checking&&!e.recoveryAttempted)void recover(id,false);
 if(sheet?.lot===id)renderSheet();
}
function allowed(id){const e=entryFor(id),b=currentBusiness();return !!(b?.canBid&&e.standing?.canBid&&e.standing.phase==='open'&&e.standing.leadingBusiness?.id!==b.id&&!e.loading&&!e.stale&&!e.checking&&!(e.intent&&!e.receipt)&&!bidder.stale&&navigator.onLine);}
export function standingMarkup(lot){
 if(!bidder.context)return '';
 const e=entryFor(lot.id),s=e.standing;
 if(e.loading)return '<section class="standing catalog-standing" role="status"><b>Checking standing…</b><p>Waiting for the current server result.</p></section>';
 if(!s)return `<section class="standing catalog-standing" role="status"><b>${esc(e.error||'Checking bidding access…')}</b></section>`;
 const own=e.receipt?.status==='accepted'?e.receipt:null;
 const ownLeading=own&&s.leadingBusiness?.id===own.businessId;
 const title=s.phase==='closed'?(own?(ownLeading?'Closed · your business led':'Closed · outbid'):s.leadingBusiness?`Closed · ${s.leadingBusiness.name} led`:'Closed · no bids recorded'):own?(ownLeading?"You're leading":'Outbid'):s.leadingBusiness?`${s.leadingBusiness.name} is leading`:'No bids yet';
 const tone=own?(ownLeading?'green':'red'):'grey';
 const stale=e.stale||bidder.stale||!navigator.onLine;
 return `<section class="standing catalog-standing t-${tone}" role="status"><div><span class="lbl">${stale?'Last confirmed standing':s.phase==='closed'?'Final recorded standing':'Current standing'}</span><b>${esc(title)}</b>${s.currentAmountMinor!==null?`<span class="amt">${money(s.currentAmountMinor)}</span>`:''}</div>${s.leadingBusiness?`<p>${esc(s.leadingBusiness.name)}</p>`:''}${own?`<p data-owned-request="${esc(own.requestId)}">Your ${money(own.amountMinor)} bid was recorded for ${esc(bidder.context.businesses.find(b=>b.id===own.businessId)?.name||'your business')}.</p>`:''}<p class="catalog-asof" data-standing-as-of="${esc(s.serverNow)}">${stale?'Offline or out of date · ':''}As of ${esc(timestamp(s.serverNow))}</p>${s.phase==='closed'?'<p>Bidding closed. This recorded standing is not an award or settlement.</p>':''}</section>`;
}
export function bidderStub(lot){
 const e=entryFor(lot.id),s=e.standing;
 if(!bidder.context||!s||e.loading)return '';
 return `<span class="catalog-amount-note">${s.phase==='closed'?'Bidding closed':s.minimumAmountMinor===null?'No further amount available':`Next minimum ${money(s.minimumAmountMinor)}`} · synthetic ${catalog.version===2?'Saturn trade dollars':'USD'}</span>`;
}
export function bidFooter(lot){
 const e=entryFor(lot.id),s=e.standing,b=currentBusiness();
 const label=!bidder.context?'Bidding is not enabled':s?.phase==='closed'?'Bidding closed':s?.phase==='scheduled'?'Bidding opens '+event.opens:!b?.canBid?'Bidding is not enabled':e.intent&&!e.receipt?'Check your original bid':e.stale||bidder.stale||!navigator.onLine?'Reconnect to bid':s?.leadingBusiness?.id===b.id?'Your business is leading':s?.minimumAmountMinor===null?'No further bid available':'Place a bid';
 return `<div class="catalog-footer">${bidder.context&&b?`<span>Bidding for <b>${esc(b.name)}</b> · ${esc(bidder.context.person.name)}</span>`:'Read-only catalog'}<button class="btn primary" data-action="bid" ${allowed(lot.id)?'':'disabled'}>${esc(label)}</button>${e.intent&&!e.receipt&&e.mode!=='pending'?'<button class="btn quiet" data-action="recover-open">Check your original bid</button>':''}</div>`;
}
const head=title=>`<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title" tabindex="-1">${esc(title)}</h2><button class="x" data-action="close-sheet" aria-label="Close">${icon('close')}</button></div>`;
function lotMini(l){return `<div class="lotmini"><div class="thumb sm">${l.image?`<img src="${esc(l.image)}" alt="" width="1000" height="667">`:'<span>No photo</span>'}</div><div><span class="lbl">Lot ${esc(l.number)} · ${esc(l.category)}</span><p>${esc(l.title)}</p></div></div>`;}
function businessBlock(body){
 const b=bidder.context?.businesses.find(b=>b.id===body?.businessId)||currentBusiness();
 return b?`<div class="forbiz">${monogram(b.name,44,true)}<div><span class="lbl">Bidding for</span><b>${esc(b.name)}</b><small>Placed by ${esc(bidder.context.person.name)}</small></div></div>`:'';
}
function amountMinor(text){if(!/^\d+(?:\.\d{0,2})?$/.test(String(text)))return null;const [whole,fraction='']=String(text).split('.');const value=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(value)?value:null;}
function reviewValidity(){
 const cents=amountMinor(sheet?.amount),e=sheet&&entryFor(sheet.lot);
 if(cents===null||cents<=0)return {ok:false,text:'Enter an amount with up to two decimal places.'};
 if(cents>1_000_000_000)return {ok:false,text:'This amount exceeds the test limit.'};
 if(cents<sheet.minimum)return {ok:false,text:`The reviewed minimum is ${money(sheet.minimum)}.`};
 if(!allowed(sheet.lot))return {ok:false,text:e?.stale||bidder.stale?'Reconnect and refresh before placing a bid.':'Bidding is not available right now.'};
 return {ok:true,text:''};
}
function updateAmount(){
 const d=$('#sheet'),v=reviewValidity(),c=amountMinor(sheet.amount),button=d.querySelector('[data-action="place"]');
 if(!button)return;button.disabled=!v.ok;button.textContent=`Place ${c===null?currencySymbol()+'—':money(c)} bid`;
 d.querySelector('#amt-err').textContent=v.text;
 d.querySelector('#amt').setAttribute('aria-invalid',String(!v.ok));
 d.querySelector('.stepper')?.classList.toggle('is-long',String(sheet.amount).length>7);
 d.querySelector('#review-amount').textContent=c===null?'—':money(c);
 const lower=d.querySelector('[data-action="step"][data-d="-1"]');if(lower)lower.disabled=c===null||c-sheet.increment<sheet.minimum;
}
export function openBid(id,recovery=false){
 if(!bidder.context)return;
 const e=entryFor(id);if(!recovery&&!allowed(id))return;
 sheetReturn={lot:id,action:recovery?'recover-open':'bid'};
 sheet={lot:id,mode:recovery?'unconfirmed':'review',amount:String((e.standing?.minimumAmountMinor??lotById(id).opening)/100),minimum:e.standing?.minimumAmountMinor??lotById(id).opening,increment:e.standing?.incrementMinor??2500};
 if(recovery&&e.intent)sheet.mode=e.mode||'unconfirmed';
 renderSheet();const d=$('#sheet');if(!d.open){history.pushState({bidSheet:true},'','#'+(location.hash.slice(1).split('?')[0]||'/lots')+'?sheet=bid');d.showModal();}d.querySelector('#sheet-title')?.focus({preventScroll:true});
}
// Keep keyboard context inside the native dialog when an outcome changes mode
// and the submitting control no longer exists. Same-mode polling retains nodes.
function captureSheetFocus(d){
 const active=document.activeElement;if(!d.open||!d.contains(active))return null;
 const selector=active.id?`#${CSS.escape(active.id)}`:active.dataset.action?`[data-action="${CSS.escape(active.dataset.action)}"]${active.dataset.d!==undefined?`[data-d="${CSS.escape(active.dataset.d)}"]`:''}${active.dataset.v!==undefined?`[data-v="${CSS.escape(active.dataset.v)}"]`:''}`:null;
 return {selector,index:selector?[...d.querySelectorAll(selector)].indexOf(active):0,selection:active.id==='amt'?[active.selectionStart,active.selectionEnd]:null,mode:d.dataset.bidState};
}
function restoreSheetFocus(d,focus){
 if(!focus||!d.open)return;
 const sameMode=focus.mode===d.dataset.bidState;
 const target=sameMode&&focus.selector?d.querySelectorAll(focus.selector)[focus.index]:null;
 const next=target&&!target.disabled?target:d.querySelector('#sheet-title');
 next?.focus({preventScroll:true});
 if(next?.id==='amt'&&focus.selection)try{next.setSelectionRange(...focus.selection);}catch{}
}
function renderSheet(){
 if(!sheet||!bidder.context)return;
 const d=$('#sheet'),l=lotById(sheet.lot),e=entryFor(sheet.lot);if(!l)return;
 const focus=captureSheetFocus(d);
 if(sheet.mode==='review'){
  const b=currentBusiness();d.dataset.bidState='review';d.dataset.lot=l.id;
  reconcileHTML(d,`<div class="sheet-in">${head('Place a bid')}<div class="sheet-scroll">${lotMini(l)}${businessBlock({businessId:b?.id})}<div class="amount"><label class="lbl" for="amt">Your bid <span class="lbl-min">· minimum ${money(sheet.minimum)}</span></label><div class="stepper"><button class="step" data-action="step" data-d="-1" aria-label="Decrease by ${money(sheet.increment)}">${icon('minus')}</button><div class="amt-field"><span class="cur" aria-hidden="true">${currencySymbol()}</span><input id="amt" inputmode="decimal" autocomplete="off" maxlength="12" value="${esc(sheet.amount)}" aria-describedby="amt-err"></div><button class="step" data-action="step" data-d="1" aria-label="Increase by ${money(sheet.increment)}">${icon('plus')}</button></div><p id="amt-err" class="err" role="alert"></p><div class="quick">${[0,1,2].map(i=>sheet.minimum+i*sheet.increment).filter(c=>c<=1_000_000_000).map(c=>`<button class="chip" data-action="quick" data-v="${c}">${money(c)}</button>`).join('')}</div></div><section class="commit-box"><h3>Review your bid</h3><ul><li>Bid <b id="review-amount"></b> on <b>Lot ${esc(l.number)}</b> for <b>${esc(b?.name)}</b>.</li><li>Placed by <b>${esc(bidder.context.person.name)}</b>.</li><li>Acceptance appears after the server records this bid. Standing may change before confirmation.</li><li class="note">${currencyLabel()}. No payment or settlement occurs.</li></ul></section></div><div class="sheet-foot"><button class="btn primary block lg" data-action="place">Place bid</button><button class="btn-link center" data-action="close-sheet">Not now</button></div></div>`);
  updateAmount();restoreSheetFocus(d,focus);return;
 }
 const mode=e.mode||sheet.mode,receipt=e.receipt,body=e.intent;
 sheet.mode=mode;d.dataset.bidState=mode==='not-recorded'?'rejected':mode;d.dataset.lot=l.id;
 let title='Bid not confirmed',tone='hatch',symbol='question',text="We couldn't confirm this bid. It may or may not have been recorded.",footer='<button class="btn primary block lg" data-action="check">Check status</button>',extra='';
 if(mode==='pending'){title='Sending your bid';tone='amber';symbol='spinner';text='Waiting for the server receipt. This bid may already be recorded; check its status before trying again.';footer='<button class="btn quiet block lg" data-action="close-sheet">Browse while bid is pending</button>';}
 else if(mode==='accepted'&&receipt){title='Bid placed';tone='green';symbol='check';text=`Your ${money(receipt.amountMinor)} bid was recorded for ${esc(bidder.context.businesses.find(b=>b.id===receipt.businessId)?.name||'your business')}.`;extra=`<p data-owned-request="${esc(receipt.requestId)}">Confirmed ${esc(timestamp(receipt.decidedAt))}</p>`;footer='<button class="btn primary block lg" data-action="close-sheet">Keep browsing</button>';}
 else if(mode==='rejected'){title='Bid not placed';tone='dashed';symbol='x';text=({BELOW_MINIMUM:'Another bid changed the minimum. Your bid was not placed.',CLOSED:'Bidding closed before this bid could be placed.',NOT_OPEN:'Bidding has not opened. Your bid was not placed.',UNSUPPORTED_SELF_RAISE:'Your business is already leading. Raising its own bid is unavailable in this test.',AMOUNT_LIMIT:'No further bid fits within this test limit.'})[receipt?.reason]||'This bid was not placed.';footer='<button class="btn quiet block lg" data-action="close-sheet">Keep browsing</button>';}
 else if(mode==='not-recorded'){title='Bid not recorded';tone='dashed';symbol='x';text=`We checked: this request is not recorded. Try again sends your original ${money(body.amountMinor)} bid using the same request.`;footer='<button class="btn primary block lg" data-action="retry">Try again</button><button class="btn-link center" data-action="close-sheet">Close</button>';}
 if(e.checking)extra+='<p class="r-note" role="status">Checking the original request…</p>';
 reconcileHTML(d,`<div class="sheet-in">${head(title)}<div class="sheet-scroll">${lotMini(l)}${businessBlock(body)}<div class="result t-${tone}" role="status"><span class="r-ic">${icon(symbol)}</span><h3>${title}</h3><p>${text}</p>${extra}</div></div><div class="sheet-foot">${footer}</div></div>`);
 d.querySelector('[data-action="check"]')?.toggleAttribute('disabled',e.checking||!navigator.onLine);
 d.querySelector('[data-action="retry"]')?.toggleAttribute('disabled',!navigator.onLine||bidder.stale);
 restoreSheetFocus(d,focus);
}
async function submit(id,retry=false){
 const e=entryFor(id),g=guard();
 if(!retry){
  const v=reviewValidity();if(!v.ok){updateAmount();return;}
  e.intent={requestId:crypto.randomUUID(),businessId:currentBusiness().id,amountMinor:amountMinor(sheet.amount),rulesetId:ruleset()};e.receipt=null;e.recoveryAttempted=true;saveIntent(id,e.intent);
 }
 if(!e.intent||!navigator.onLine)return;
 const payload=structuredClone(e.intent);e.mode='pending';if(sheet?.lot===id){sheet.mode='pending';renderSheet();}changed();
 try{
  const r=await request(root(id)+'/bids',payload);if(!current(g)||e.intent?.requestId!==payload.requestId)return;
  if(((r.status===201&&r.data.receipt?.status==='accepted')||(r.status===409&&r.data.receipt?.status==='rejected'))&&adoptReceipt(e,r.data.receipt,id)){
   if(r.status===201&&validStanding(r.data.standing,id)){e.standing=structuredClone(r.data.standing);e.loading=false;e.stale=false;}
  }else{e.mode='unconfirmed';if([401,403].includes(r.status)){e.stale=true;e.error='Bidding access could not be confirmed.';}}
 }catch{if(!current(g)||e.intent?.requestId!==payload.requestId)return;e.mode='unconfirmed';}
 if(!current(g))return;
 changed();if(sheet?.lot===id){sheet.mode=e.mode;renderSheet();}
 if(e.mode==='accepted'||e.mode==='rejected')void refreshLot(id);
}
async function recover(id,show=true){
 const e=entryFor(id);if(!e.intent||e.checking||!bidder.context)return;
 const g=guard(),intent=structuredClone(e.intent);e.checking=true;e.recoveryAttempted=true;if(show&&sheet?.lot===id)renderSheet();
 try{
  const r=await request(root(id)+'/bid-receipts/'+encodeURIComponent(intent.requestId));
  if(!current(g)||e.intent?.requestId!==intent.requestId)return;
  if(r.status===200&&adoptReceipt(e,r.data.receipt,id)){}
  else if(r.status===404){e.mode='not-recorded';e.receipt=null;}
  else{e.mode='unconfirmed';if([401,403].includes(r.status)){e.stale=true;e.error='Bidding access could not be confirmed.';}}
 }catch{if(!current(g)||e.intent?.requestId!==intent.requestId)return;e.mode='unconfirmed';}
 finally{if(current(g)&&e.intent?.requestId===intent.requestId){e.checking=false;changed();if(sheet?.lot===id){sheet.mode=e.mode;renderSheet();}}}
}
export function bidAction(button){
 const action=button.dataset.action,id=bidder.activeLot;
 if(action==='bid'){openBid(id);return true;}
 if(action==='recover-open'){openBid(id,true);return true;}
 if(action==='close-sheet'){$('#sheet').close();sheet=null;return true;}
 if(!sheet)return false;
 if(action==='place'){void submit(sheet.lot);return true;}
 if(action==='check'){void recover(sheet.lot,true);return true;}
 if(action==='retry'){void submit(sheet.lot,true);return true;}
 if(action==='quick'||action==='step'){
  const cents=action==='quick'?Number(button.dataset.v):(amountMinor(sheet.amount)??sheet.minimum)+Number(button.dataset.d)*sheet.increment;
  sheet.amount=String(Math.max(sheet.minimum,cents)/100);$('#amt').value=sheet.amount;updateAmount();return true;
 }
 return false;
}
document.addEventListener('input',ev=>{if(ev.target.id==='amt'&&sheet?.mode==='review'){sheet.amount=ev.target.value;updateAmount();}});
$('#sheet')?.addEventListener('close',()=>{
 const target=sheetReturn;sheet=null;sheetReturn=null;if(location.hash.includes('?sheet=bid'))history.back();
 if(!target||target.lot!==bidder.activeLot)return;
 queueMicrotask(()=>{
  const button=$(`.catalog-footer [data-action="${target.action}"]`);
  const next=button&&!button.disabled?button:$('main[data-lot] h1');
  next?.focus({preventScroll:true});
 });
});
window.addEventListener('offline',()=>{bidder.stale=true;for(const e of bidder.entries.values())e.stale=true;changed();if(sheet)renderSheet();});
window.addEventListener('online',()=>{changed();});

window.addEventListener('popstate',()=>{if(!location.hash.includes('?sheet=bid')&&$('#sheet')?.open&&sheet){$('#sheet').close();}});
