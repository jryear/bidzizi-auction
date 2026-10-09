import { clone, esc, money, tradeMoney, tradeRulesText, cents, eventIssues, lotIssues, releaseIssues, windowFor, dateText, timeText, shortZone } from './model.js';
import { qrcodegen } from './vendor/qr-code.js';

// All drafts and staff grants come from authenticated APIs. Browser memory holds
// only the current editor and confirmed packet; it cannot grant authority.
const $=s=>document.querySelector(s);
const dialog=$('#modal');
let session=null, eventList=[], d=null, confirmed=null, dirty=false, saveState='saved';
let attempt=null, createAttempt=null, saving=false, creating=false, returnFocus=null, toastTimer;
let picked=null, selected=new Set(), search='', previewMode='saved', previewOpen=innerWidth>1060;
let windowDraft=null, imageTarget='event', notice='', loadedOrgId=null;
let contextEpoch=0, loadingDraft=false;
let catalogApproval=null, approvalAttempt=null, reviewedCatalog=null, approving=false, approvalLoading=false;
let approvalState='none', approvalNotice='', approvalReadEpoch=0;
let homeLoading=false, homeNotice='';
let nextFieldFocus=null;
let entryConfirmed=null,entryAttempt=null,entryState='loading',entryNotice='',entrySaving=false,entryReadEpoch=0;
let uploading=false,uploadNotice='',recoveredUpload=null;
const uploadRefs=new Map();
const pendingUploadKey=()=>`bz:asset-upload:${session?.person.id}:${d?.event.id}`;
const qrImages=new Map();
const amountErrors=new Map();
const current=ticket=>ticket===contextEpoch;
const chosen=()=>d?.lots.find(l=>l.id===picked);
const assigned=()=>d.lots.filter(l=>l.windowId);
const rawAmount=(v,raw)=>raw ?? (v===null?'':String(v/100));
const activeTab=()=>location.hash.startsWith('#/lots')?'lots':'event';
const eventMoney=n=>d?.version===2?tradeMoney(n,d.event.rules):money(n);
const img=path=>path?.startsWith('asset:')&&d?
 (uploadRefs.get(path)||'/api/admin/events/'+encodeURIComponent(d.event.id)+'/assets/'+path.slice(6)):
 '/staging-bidder-preview/'+path;
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('on');toastTimer=setTimeout(()=>$('#toast').classList.remove('on'),4000);}
async function api(path,method='GET',body){
 const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
 try{
  const res=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:ctrl.signal,headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  let packet;try{packet=await res.json();}catch{throw {status:res.status||503,message:'The response could not be confirmed.'};}
  if(!res.ok)throw {status:res.status,code:packet.error?.code,message:packet.error?.message||'The request could not be completed.'};
  return packet;
 }finally{clearTimeout(timeout);}
}
function compact(packet){
 if(packet.version===2)return {
  event:Object.fromEntries(['name','eyebrow','welcome','venue','cover','coverAlt','timing','rules','sponsorsEnabled','sponsors'].filter(k=>k in packet.event).map(k=>[k,clone(packet.event[k])])),
  lots:packet.lots.map(l=>Object.fromEntries(['id','title','short','description','category','image','alt','opening','includes','fine','fixedRaiseMinor'].map(k=>[k,clone(l[k])])))
 };
 const event=Object.fromEntries(['name','eyebrow','welcome','venue','cover','date','start','end','timezone','increment','sponsorsEnabled','sponsors',...(packet.event.coverAlt===undefined?[]:['coverAlt'])].map(k=>[k,clone(packet.event[k])]));
 const lots=packet.lots.map(l=>Object.fromEntries(['id','title','short','description','category','image','alt','opening','includes','fine','windowId'].map(k=>[k,clone(l[k])])));
 return {event,lots};
}
function adopt(packet,preserveUi=false){
 if(confirmed?.event.id!==packet.event.id){resetCatalog();resetEntry();restoreEntryAttempt(packet.event.id);}
 confirmed=clone(packet);d=clone(packet);dirty=false;saveState='saved';attempt=null;notice='';amountErrors.clear();nextFieldFocus=null;
 picked=d.lots.some(l=>l.id===picked)?picked:d.lots[0]?.id;selected=preserveUi?new Set([...selected].filter(id=>d.lots.some(l=>l.id===id))):new Set();if(!preserveUi)search='';loadedOrgId=d.org.id;
 const current=eventList.find(x=>x.id===d.event.id);
 if(current)Object.assign(current,{name:d.event.name,revision:d.revision,savedAt:d.savedAt});
 else eventList.unshift({id:d.event.id,organizationId:d.org.id,name:d.event.name,revision:d.revision,savedAt:d.savedAt});
 uploadRefs.clear();
}
function markDirty(){dirty=true;if(!['uncertain','conflict','saving','blocked'].includes(saveState)){saveState='dirty';notice='';}refreshChrome();renderNotice();refreshNotes();postPreview();}
async function saveDraft(){
 if(saving||uploading||loadingDraft||approving||approvalAttempt||saveState==='conflict'||!d)return false;
 const ticket=contextEpoch;
 if(!dirty&&!attempt)return true;
 if(!attempt){
  const fields=[{raw:d.event.incrementText,label:'Bid increment',key:'increment',tab:'event',field:'increment'},...d.lots.map(l=>({raw:l.openingText,label:`Lot ${l.number} opening bid`,key:l.id,tab:'lots',field:'opening',id:l.id})),...d.lots.map(l=>({raw:l.fixedRaiseText,label:`Lot ${l.number} fixed raise`,key:l.id+':raise',tab:'lots',field:'fixedRaiseMinor',id:l.id}))];
  const invalid=fields.find(f=>f.raw!==undefined&&String(f.raw).trim()&&(cents(f.raw)===null||cents(f.raw)>1_000_000_000||(f.field==='fixedRaiseMinor'&&cents(f.raw)===0)));
  if(invalid){notice=invalid.label+': enter '+(invalid.field==='fixedRaiseMinor'?'a positive amount':'an amount')+' with at most two decimal places, or clear it.';amountErrors.set(invalid.key,notice);saveState='dirty';navigate(invalid.tab,invalid.id,`[data-${invalid.tab==='event'?'event':'lot'}="${invalid.field}"]`);refreshChrome();renderNotice();refreshAmountFields();return false;}
 }
 if(!attempt)attempt={requestId:crypto.randomUUID(),expectedRevision:confirmed.revision,draft:compact(d)};
 saving=true;saveState='saving';refreshChrome();
 try{
  const response=await api((d.version===2?'/api/v2':'/api')+'/admin/events/'+d.event.id,'PUT',attempt);
  if(!current(ticket))return false;
  adopt(response.draft,true);renderMain();refresh();return true;
 }catch(e){
  if(!current(ticket))return false;
  if(e.status===409){saveState='conflict';notice=e.code==='REVISION_CONFLICT'?'This draft changed in another session.':'This save request conflicts with an earlier request. Reload the saved draft.';attempt=null;}
  else if(e.status===400||e.status===422){saveState='dirty';notice=e.message||'Check the draft fields and try again.';attempt=null;}
  else if(e.status===401||e.status===403){saveState='blocked';notice=e.status===401?'Your session has ended. Sign in again before saving.':'You no longer have access to this draft.';}
  else{saveState='uncertain';notice='Save not confirmed. Your edits are still here. Retry the same save to check its result.';}
  return false;
 }finally{if(current(ticket)){saving=false;if(d&&$('#saved')){refreshChrome();renderNotice();}}}
}
function refreshChrome(){
 if(!d){refreshHomeControls();return;}if(!$('#event-title'))return;
 $('#event-title').textContent=d.event.name||'Untitled event';$('#org-name').textContent=d.org.name;$('#org-mark').textContent=d.org.initials;$('#lot-count').textContent=d.lots.length;
 const sidebarName=$('.sidebar-event-name');if(sidebarName)sidebarName.textContent=d.event.name||'Untitled event';
 $('#release-status').innerHTML='<i></i>Working draft';
 $('#event-meta').textContent=d.version===2?
  `${d.event.timing.startDate||'Date not set'} · ${d.event.timing.start||'--:--'}–${d.event.timing.endDate||'Date not set'} ${d.event.timing.end||'--:--'} ${d.event.timing.timezone}`:
  `${dateText(d.event.date)} · ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}`;
 const status={saved:'Saved',dirty:'Unsaved edits',saving:'Saving…',uncertain:'Save not confirmed',conflict:'Save conflict',blocked:'Save blocked'};
 $('#saved').textContent=loadingDraft?'Loading draft…':status[saveState];$('#saved').classList.toggle('error',['uncertain','conflict','blocked'].includes(saveState));
 const save=$('#save-draft');save.textContent=saveState==='uncertain'?'Retry save':'Save draft';save.disabled=uploading||saving||loadingDraft||approving||!!approvalAttempt||['conflict','blocked'].includes(saveState)||(!dirty&&!attempt)||(d.version===2&&!!catalogApproval);
 document.querySelectorAll('.tabs a').forEach(a=>{const on=a.dataset.tab===activeTab();a.classList.toggle('active',on);on?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});
 $('#preview-toggle').textContent=previewOpen?'Hide preview':'Bidder preview';$('#preview-toggle').setAttribute('aria-pressed',String(previewOpen));$('#workspace').classList.toggle('no-preview',!previewOpen);$('#app').classList.toggle('preview-open',previewOpen);
 $('#preview-mode-label').textContent=previewMode==='saved'?`Saved draft · revision ${confirmed.revision}`:dirty?'Working draft · unsaved edits':'Working draft · no unsaved edits';
 document.querySelectorAll('[data-preview-mode]').forEach(b=>{const on=b.dataset.previewMode===previewMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 document.querySelectorAll('[data-action="preview-lot"]').forEach(el=>el.disabled=loadingDraft||!canPreviewLot());
 const previewHelp=$('#lot-preview-help');if(previewHelp){const unsaved=previewMode==='saved'&&chosen()&&!confirmed.lots.some(l=>l.id===picked);previewHelp.hidden=!unsaved;previewHelp.textContent=unsaved?'Save this lot to see it in Saved draft preview, or switch the preview to Working draft.':'';}
 const locked=loadingDraft||approving||!!approvalAttempt||['saving','uncertain','blocked'].includes(saveState)||(d.version===2&&!!catalogApproval);
 document.querySelectorAll('[data-event],[data-lot],[data-sponsor],[data-sponsor-alt],[data-upload]').forEach(el=>el.disabled=locked||uploading);
 document.querySelectorAll('[data-action="add-lot"],[data-action="duplicate-lot"],[data-action="move-up"],[data-action="move-down"],[data-action="image"],[data-action="clear-image"],[data-action="assign-window"],[data-action="apply-window"],[data-action="add-sponsor"],[data-action="remove-sponsor"]').forEach(el=>el.disabled=locked);
 document.querySelectorAll('[data-action="events"],[data-action="events-home"],[data-action="new-event"],[data-action="reload-draft"],[data-action="confirm-reload"]').forEach(el=>el.disabled=loadingDraft||approving||!!approvalAttempt);
 refreshCatalogControls();
 for(const [action,delta] of [['move-up',-1],['move-down',1]]){const el=document.querySelector(`[data-action="${action}"]`);if(el){const i=d.lots.findIndex(l=>l.id===picked);el.disabled=locked||i+delta<0||i+delta>=d.lots.length;}}
}
function postPreview(path){
 const frame=$('#bidder-frame');if(!frame||!d)return;
 const packet=previewMode==='saved'?confirmed:d;
 frame.contentWindow?.postMessage({type:'staff-draft-preview',payload:{org:packet.org,event:packet.event,lots:packet.lots,now:Date.now(),phase:'draft',visible:true,mode:previewMode,revision:confirmed.revision},path},location.origin);
}
function canPreviewLot(){return !!chosen()&&(previewMode==='working'||confirmed?.lots.some(l=>l.id===picked));}
function refreshNotes(){
 if(d?.version===2){const errors=$('#event-errors');if(errors)errors.textContent='One shared window. Opening is inclusive and closing is exclusive.';return;}
 const errors=$('#event-errors');if(errors)errors.innerHTML=eventIssues(d.event).map(t=>`<p class="note error">${esc(t)}</p>`).join('');
 const lotErrors=$('#lot-errors');if(lotErrors&&chosen())lotErrors.innerHTML=lotIssues(chosen(),d.event).map(t=>`<p class="note error">Add ${esc(t)} for the catalog.</p>`).join('');
 const band=$('.schedule-band');if(band){const n=assigned().length;band.innerHTML=`<div><strong>${timeText(d.event.start)} <span class="muted">→</span> ${timeText(d.event.end)} ${shortZone(d.event)}</strong><p>${n} ${n===1?'lot uses':'lots use'} this draft window. Changes apply to all assigned lots.</p></div><span class="tick" aria-hidden="true">◷</span>`;}
 refreshAmountFields();
}
function refresh(){refreshChrome();renderInventory();refreshNotes();postPreview();}
function focusEditorField(selector){const field=$(selector);if(field&&!field.disabled){field.focus();field.scrollIntoView({block:'center'});}}
function navigate(tab,id,field){
 if(!d)return;if(id)picked=id;const hash=tab==='lots'?`#/lots${id?'/'+id:''}`:'#/event',same=location.hash===hash;
 if(!same)location.hash=hash;
 // Bind the durable outer route in this click turn, before a reload can start.
 eventUrl(d.event.id,{replace:true,tab,lot:tab==='lots'?picked:null});
 if(same){nextFieldFocus=null;renderMain();refresh();if(field)focusEditorField(field);}
 else nextFieldFocus=field||null;
}
function refreshAmountFields(){
 for(const [selector,key,errorId] of [['[data-event="increment"]','increment','increment-error'],['[data-lot="opening"]',picked,'opening-error'],['[data-lot="fixedRaiseMinor"]',picked+':raise','raise-error']]){
  const field=$(selector),error=$('#'+errorId);if(!field||!error)continue;
  const message=amountErrors.get(key)||'';error.textContent=message;
  if(message)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');
 }
}
function modalFocusTarget(el){
 if(!el||el===document.body)return null;
 const attributes=['id','data-action','data-id','data-target','data-tab','data-event','data-lot'];
 const selector=attributes.filter(name=>el.hasAttribute(name)).map(name=>`[${name}="${CSS.escape(el.getAttribute(name))}"]`).join('');
 return {element:el,selector};
}
function restoreModalFocus(){
 if(!returnFocus||dialog.open)return;
 const original=returnFocus.element;
 const target=original?.isConnected&&!original.disabled?original:(returnFocus.selector?$(returnFocus.selector):null);
 (target&&!target.disabled?target:$('[data-action="events"]')||$('#workspace'))?.focus({preventScroll:true});
}
function closeModal(force=false){if(!force&&approving){toast('Wait for the approval request to finish.');return;}if(!force&&(creating||createAttempt)){toast('Retry the pending creation before closing.');return;}dialog.close();restoreModalFocus();}
function openModal(title,body,footer='',subtitle=''){
 if(!dialog.open)returnFocus=modalFocusTarget(document.activeElement);dialog.innerHTML=`<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;if(!dialog.open)dialog.showModal();
 const field=dialog.querySelector('.modal-body input:not([disabled]),.modal-body textarea:not([disabled]),.modal-body select:not([disabled])');
 (field||dialog.querySelector('.modal-body button:not([disabled])')||dialog.querySelector('button:not([disabled])'))?.focus();
}
function draftNotice(){return `<div id="draft-notice" class="draft-notice ${notice?'error':''}" ${notice?'role="alert"':''}><p>${esc(uploadNotice||notice||(catalogApproval?'Published terms are fixed.':'Working draft. Save changes before approving a catalog.'))}</p>${recoveredUpload?'<p data-asset-recovery="confirmed">An owned upload was recovered. Select its target again before attaching it.</p>':''}${saveState==='conflict'?'<button class="btn small" data-action="reload-draft">Reload saved draft</button>':saveState==='blocked'?'<button class="btn small" data-action="signout">Sign in again</button>':''}</div>`;}
function renderNotice(){const el=$('#draft-notice');if(el)el.outerHTML=draftNotice();}
function routeHost(){try{return parent===window?window:parent;}catch{return window;}}
function requestedEvent(){try{return new URL(routeHost().location.href).searchParams.get('event');}catch{return null;}}
function requestedTab(){try{const query=new URL(routeHost().location.href).searchParams;return {tab:query.get('tab')==='lots'?'lots':'event',lot:query.get('lot')};}catch{return {tab:'event',lot:null};}}
function eventUrl(id,{replace=false,tab=activeTab(),lot=picked}={}){
 // Next copies its internal state and synchronizes this external URL update.
 // Forwarding its __NA marker would bypass that canonical URL synchronization.
 try{const target=routeHost(),url=new URL(target.location.href);if(id){url.searchParams.set('event',id);if(tab==='lots'){url.searchParams.set('tab','lots');lot?url.searchParams.set('lot',lot):url.searchParams.delete('lot');}else{url.searchParams.delete('tab');url.searchParams.delete('lot');}}else{url.searchParams.delete('event');url.searchParams.delete('tab');url.searchParams.delete('lot');}if(url.href!==target.location.href)target.history[replace?'replaceState':'pushState'](null,'',url);}catch{}
}
function replaceEditorRoute(tab='event',id){
 if(id&&d?.lots.some(l=>l.id===id))picked=id;
 const hash=tab==='lots'?`#/lots${id?'/'+id:''}`:'#/event';history.replaceState(history.state,'',hash);
}
function retainEditorRoute(){
 const tab=$('.tabs a[aria-current="page"]')?.dataset.tab||activeTab();replaceEditorRoute(tab,tab==='lots'?picked:null);eventUrl(d?.event.id||null,{replace:true,tab});
}
function staffHeader(){return `<header class="top"><div class="top-left"><span class="studio-label">Studio</span></div><div class="top-right"><span class="proto-pill">Staging test</span><span class="role">${esc(session.person.name)}</span><button class="link-btn" data-action="signout">Sign out</button></div></header>`;}
function staffSidebar(){
 const org=d?.org||session.staffOrganizations.find(o=>o.id===loadedOrgId);
 return `<aside class="studio-sidebar"><span class="brand">BidZizi</span><div class="studio-organization org-btn"><span class="org-mark" id="org-mark">${esc(org?.initials||'')}</span><span class="org-name" id="org-name">${esc(org?.name||'')}</span></div><button class="sidebar-home ${d?'':'active'}" data-action="events-home" ${d?'':'aria-current="page"'}>Events</button>${d?`<div class="sidebar-event"><p class="event-heading">This event</p><button class="event-picker" data-action="events">Choose event <span aria-hidden="true">⌄</span></button><span class="sidebar-event-name">${esc(d.event.name||'Untitled event')}</span></div><nav class="tabs" aria-label="Event Studio"><a href="#/lots" data-tab="lots">Items <span class="count" id="lot-count"></span></a><a href="#/event" data-tab="event">Event & entry</a></nav>`:''}</aside>`;
}
function staffFooter(){return '<footer class="simulation"><span>Synthetic staff preview</span></footer>';}
function shell(){
 $('#app').innerHTML=`<div class="studio-shell">${staffSidebar()}<div class="studio-body">${staffHeader()}
 <div class="bar workspace-heading"><div class="bar-line"><div><h1 id="event-title" tabindex="-1"></h1><div class="bar-sub"><span id="release-status" class="status"></span><span id="catalog-approval" class="status" role="status" aria-live="polite"></span><span id="event-meta"></span></div></div><div class="bar-actions"><div class="saved" id="saved" role="status" aria-live="polite"></div><button class="btn" id="preview-toggle" data-action="toggle-preview">Bidder preview</button><button class="btn primary save-action" id="save-draft" data-action="save-draft">Save draft</button><button class="btn dark" id="review-catalog" data-action="review">Review catalog</button></div></div></div>
 <main class="workspace" id="workspace" tabindex="-1"><div class="main studio-main" id="main"></div><aside class="preview" aria-label="Interactive bidder preview"><div class="preview-head"><h2>Phone preview</h2><button class="preview-close" data-action="toggle-preview" aria-label="Close bidder preview">×</button></div><div class="preview-controls"><button data-preview-mode="working">Working draft</button><button data-preview-mode="saved" class="active">Saved draft</button></div><div class="device"><iframe id="bidder-frame" title="Interactive bidder preview" src="/staging-bidder-preview/index.html#/"></iframe></div><nav class="preview-route" aria-label="Preview screens"><button data-action="preview-route" data-path="/">Welcome</button><button data-action="preview-route" data-path="/lots">Catalog</button><button data-action="preview-lot">Selected lot</button></nav><p class="preview-caption" id="preview-mode-label"></p></aside></main>
 ${staffFooter()}</div></div>`;
 $('#bidder-frame').addEventListener('load',()=>postPreview());
}

function tradeEventView(){
 const e=d.event,t=e.timing;
 return `${draftNotice()}${catalogSummary()}
 <section class="sheet"><div class="sheet-head"><h3>Event welcome</h3><span class="section-label">Synthetic Saturn trade dollars</span></div>
 <div class="cover-grid"><div class="cover">${e.cover?`<img src="${esc(img(e.cover))}" alt="${esc(e.coverAlt||'Event photo')}">`:'<div class="no-cover">Add an event photo</div>'}
 <label>Upload event photo<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="event" aria-label="Upload event photo"></label></div>
 <div class="field-stack"><label>Event name<input data-event="name" value="${esc(e.name)}"></label>
 <label>Welcome line<input data-event="eyebrow" value="${esc(e.eyebrow)}"></label><label>Venue<input data-event="venue" value="${esc(e.venue)}"></label></div></div>
 <label>Event photo description<input data-event="coverAlt" value="${esc(e.coverAlt||'')}"></label>
 <label>Welcome message<textarea data-event="welcome">${esc(e.welcome)}</textarea></label></section>
 <section class="sheet"><div class="sheet-head"><h3>One bidding window</h3><span class="section-label">Time</span></div>
 <div class="field-grid"><label>Opening date<input type="date" data-event="timing.startDate" value="${esc(t.startDate)}"></label>
 <label>Opening time<input type="time" data-event="timing.start" value="${esc(t.start)}"></label>
 <label>Closing date<input type="date" data-event="timing.endDate" value="${esc(t.endDate)}"></label>
 <label>Closing time<input type="time" data-event="timing.end" value="${esc(t.end)}"></label></div>
 <label>Time zone<select data-event="timing.timezone">${zones(t.timezone)}</select></label>
 <div data-bid-policy><strong>Synthetic Saturn trade dollars · no payment or settlement</strong><p>${esc(tradeRulesText(e.rules))}</p></div>
 <div id="event-errors"></div></section>${sponsorsView()}${entryView()}<div id="studio-setup">${setupView()}</div>`;
}
function eventView(){
 if(d.version===2)return tradeEventView();
 const e=d.event,w=assigned().length;
 return `${draftNotice()}${catalogSummary()}
 <section class="sheet"><div class="sheet-head"><h3>Welcome page</h3><span class="section-label">Welcome</span></div><div class="cover-grid"><div><div class="cover">${e.cover?`<img src="${esc(img(e.cover))}" alt="Event cover">`:'<div class="no-cover">Add an event photo</div>'}<button data-action="image" data-target="event">Change photo</button></div><p class="cover-note">Example photos.</p></div><div class="field-stack"><label>Event name<input class="name-input" data-event="name" value="${esc(e.name)}" maxlength="120"></label><label>Welcome line<input data-event="eyebrow" value="${esc(e.eyebrow)}" maxlength="120"></label><label>Location or event note<input data-event="venue" value="${esc(e.venue)}" maxlength="180"></label></div></div><label class="event-story">Welcome message<textarea aria-label="Welcome message" data-event="welcome" rows="3" maxlength="1800">${esc(e.welcome)}</textarea></label><div class="help">Items are provided by your organization. Add event sponsors below.</div></section>
 <section class="sheet"><div class="sheet-head"><h3>Bidding schedule</h3><span class="section-label">Timing</span></div><div class="schedule-band"><div><strong>${timeText(e.start)} <span class="muted">→</span> ${timeText(e.end)} ${shortZone(e)}</strong><p>${w} ${w===1?'lot uses':'lots use'} this window. ${w?'Changing it updates all of them in this draft.':'Assign lots together from Items.'}</p></div><span class="tick" aria-hidden="true">◷</span></div><div class="field-grid three"><label>Event date<input type="date" data-event="date" value="${esc(e.date)}"></label><label>Bidding opens<input type="time" data-event="start" value="${esc(e.start)}"></label><label>Bidding closes<input type="time" data-event="end" value="${esc(e.end)}"></label></div><div class="field-grid" style="margin-top:16px"><label>Event time zone<select aria-label="Event time zone" data-event="timezone">${zones(e.timezone)}</select></label><label>Bid increment · example USD<input inputmode="decimal" data-event="increment" aria-describedby="increment-error" value="${esc(rawAmount(e.increment,e.incrementText))}"><span id="increment-error" class="field-error" role="alert"></span></label></div><p class="note">The approved catalog appears at its opening time. Saving draft changes does not change an approved window. Test bidding requires separate bidder access.</p><div id="event-errors"></div></section>
 <section class="sheet"><div class="sheet-head"><h3>Event sponsors</h3><span class="section-label">Optional</span></div><label class="switch-label"><input type="checkbox" data-event="sponsorsEnabled" ${e.sponsorsEnabled?'checked':''}>Show event sponsors</label><p class="help">Separate from the organization providing auction items.</p><div id="sponsor-fields">${sponsorFields()}</div></section>${entryView()}<div id="studio-setup">${setupView()}</div>`;
}
function sponsorsView(){return `<section class="sheet"><div class="sheet-head"><h3>Event sponsors</h3><span class="section-label">Optional</span></div><label class="switch-label"><input type="checkbox" data-event="sponsorsEnabled" ${d.event.sponsorsEnabled?'checked':''}>Show event sponsors</label><p class="help">Separate from the organization providing auction items.</p><div id="sponsor-fields">${sponsorFields()}</div></section>`;}
function zones(current){const choices=[['UTC','UTC'],['America/Los_Angeles','Pacific · Los Angeles'],['America/Denver','Mountain · Denver'],['America/Chicago','Central · Chicago'],['America/New_York','Eastern · New York']];if(current&&!choices.some(([v])=>v===current))choices.unshift([current,current]);return choices.map(([v,t])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(t)}</option>`).join('');}
function sponsorFields(){return d.event.sponsorsEnabled?`${d.event.sponsors.map((s,i)=>`<label class="sponsor-row">Sponsor ${i+1}<input data-sponsor="${i}" maxlength="200" value="${esc(s.name)}" placeholder="Organization or business name"><button class="btn small" data-action="remove-sponsor" data-index="${i}" aria-label="Remove sponsor ${i+1}">×</button></label><label>Upload sponsor ${i+1} logo<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="sponsor" data-index="${i}" aria-label="Upload sponsor ${i+1} logo"></label><label>Sponsor ${i+1} logo description<input data-sponsor-alt="${i}" value="${esc(s.alt||'')}"></label>`).join('')}<button class="link-btn" data-action="add-sponsor">+ Add event sponsor</button>`:'';}
function selectionBar(){return selected.size?`<div class="selection"><strong>${selected.size} ${selected.size===1?'lot':'lots'} selected</strong><div class="flex"><button data-action="clear-selection" style="color:inherit;font-size:12px">Clear</button>${d.version===2?'<span>Uses the shared event window</span>':'<button class="btn small" data-action="assign-window">Assign auction window →</button>'}</div></div>`:'';}
function lotsView(){
 if(!d.lots.length)return `${draftNotice()}${catalogSummary()}<div class="intro"><div><h2>Items</h2><p>Your auction catalog starts here.</p></div></div><div class="empty-state"><h3>No items yet</h3><p>Add the title, details and starting amount for your first item.</p><button class="btn primary" data-action="add-lot">Add item</button></div><div id="studio-setup">${setupView()}</div>`;
 return `${draftNotice()}${catalogSummary()}<div class="intro"><div><h2>Items</h2><p>${d.lots.length} ${d.lots.length===1?'item':'items'} · working catalog</p></div><button class="btn primary" data-action="add-lot">+ Add item</button></div><div id="selection-bar">${selectionBar()}</div><div class="lot-work"><section class="inventory" aria-label="Catalog lots"><div class="inventory-search"><label class="sr" for="lot-search">Search your lots</label><input id="lot-search" type="search" placeholder="Search items…" value="${esc(search)}"></div><div class="inventory-head"><label class="flex"><input id="select-all" type="checkbox" data-action="select-all" ${selected.size===d.lots.length?'checked':''}><span>Item</span><span class="sr">Select all</span></label><span>Starting amount · bidding window</span></div><div id="lot-list"></div></section><div class="editor" id="editor">${editorView()}</div></div><div id="studio-setup">${setupView()}</div>`;
}
function renderInventory(){
 const list=$('#lot-list');if(!list)return;

 const matches=d.lots.filter(l=>`${l.title} ${l.number} ${l.category}`.toLowerCase().includes(search.toLowerCase()));
 list.innerHTML=matches.length?matches.map(l=>{
  const issues=d.version===2?[]:lotIssues(l,d.event);const label=d.version===2?'Shared event window':issues.length?`Needs ${issues[0]}`:l.windowId?'Draft window assigned':'Ready · no window';
  return `<div class="lot-row ${l.id===picked?'active':''}" data-id="${esc(l.id)}"><label class="sr" for="pick-${esc(l.id)}">Select lot ${l.number}</label><input id="pick-${esc(l.id)}" type="checkbox" data-lot-select="${esc(l.id)}" ${selected.has(l.id)?'checked':''}><button data-action="edit-lot" data-id="${esc(l.id)}" aria-current="${l.id===picked}" aria-label="Edit lot ${l.number}: ${esc(l.title||'Untitled lot')}">${l.image?`<img class="lot-thumb" src="${esc(img(l.image))}" alt="">`:`<span class="lot-thumb empty" aria-hidden="true">+</span>`}<span class="lot-copy"><span class="lot-number">${esc(l.number)}</span><span class="title">${esc(l.title||'Untitled item')}</span><span class="meta">${esc(l.category||'Add a category')}</span></span><span class="lot-context"><strong class="lot-amount">${Number.isSafeInteger(l.opening)&&l.opening>0?eventMoney(l.opening):'Set amount'}</strong><span class="meta ${issues.length?'warn':''}">${esc(label)}${l.windowId?`<span class="lot-time">${timeText(d.event.end)} close · ${esc(shortZone(d.event))}</span>`:''}</span></span></button></div>`;
 }).join(''):'<p class="help" style="padding:18px">No matching lots. Try another search.</p>';
 $('#selection-bar').innerHTML=selectionBar();
 $('#select-all').checked=selected.size===d.lots.length;
 $('#select-all').indeterminate=selected.size>0&&selected.size<d.lots.length;
 refreshCatalogControls();
}
function editorView(){
 const l=chosen();if(!l)return '';
 if(d.version===2)return `<section class="sheet" aria-label="Lot editor"><div class="sheet-head"><h3>Editing item ${esc(l.number)}</h3><button class="link-btn" data-action="preview-lot">View in preview</button></div>
 <div class="editor-photo">${l.image?`<img src="${esc(img(l.image))}" alt="${esc(l.alt)}">`:'<div class="empty">Add photo</div>'}<label>Upload item photo<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="lot" aria-label="Upload item photo"></label></div>
 <div class="field-stack"><label>Item title<input data-lot="title" value="${esc(l.title)}"></label>
 <label>Short description<input data-lot="short" value="${esc(l.short)}"></label>
 <label>Description<textarea data-lot="description">${esc(l.description)}</textarea></label>
 <label>Category<input data-lot="category" value="${esc(l.category)}"></label>
 <label>Opening amount · synthetic trade dollars<input inputmode="decimal" data-lot="opening" aria-describedby="opening-error" value="${esc(rawAmount(l.opening,l.openingText))}"><span id="opening-error" class="field-error" role="alert"></span></label>
 <label>Fixed raise override · optional<input inputmode="decimal" data-lot="fixedRaiseMinor" aria-describedby="raise-error" value="${esc(rawAmount(l.fixedRaiseMinor,l.fixedRaiseText))}"><span id="raise-error" class="field-error" role="alert"></span></label></div>
 <details class="disclosure" open><summary>Photo and item details</summary><label>Photo description<input data-lot="alt" value="${esc(l.alt)}"></label>
 <label>Included<textarea data-lot="includes">${esc(l.includes.join('\n'))}</textarea></label><label>Important details<textarea data-lot="fine">${esc(l.fine)}</textarea></label></details><div class="lot-footer"><button class="btn small" data-action="duplicate-lot">Duplicate lot</button><div class="order-controls"><button data-action="move-up" aria-label="Move lot earlier" ${d.lots.indexOf(l)===0?'disabled':''}>↑</button><button data-action="move-down" aria-label="Move lot later" ${d.lots.indexOf(l)===d.lots.length-1?'disabled':''}>↓</button></div><small>Catalog order · ${d.lots.indexOf(l)+1} of ${d.lots.length}</small></div></section>`;
 const cats=[...new Set([...d.lots.map(x=>x.category),'Getaways','Food & drink','For the team','Good things'])];
 return `<section class="sheet" aria-label="Lot editor"><div class="sheet-head"><div><p class="eyebrow">Editing item ${esc(l.number)}</p><h3>${esc(l.title||'New item')}</h3></div><button class="link-btn" data-action="preview-lot">View in preview ↗</button></div><p id="lot-preview-help" class="help preview-help" role="status" hidden></p><div class="editor-photo">${l.image?`<img src="${esc(img(l.image))}" alt="${esc(l.alt)}">`:'<div class="empty">+</div>'}<div><p class="provider"><span class="org-mark">${esc(d.org.initials)}</span>Provided by ${esc(d.org.name)}</p><button class="link-btn" data-action="image" data-target="lot">${l.image?'Change':'Add'} photo</button>${l.image?'<button class="link-btn" data-action="clear-image" style="margin-left:12px;color:var(--muted)">Remove</button>':''}</div></div>
 <div class="field-stack"><label>Item title<input data-lot="title" class="name-input" value="${esc(l.title)}" maxlength="200"></label><label>Short description<input data-lot="short" value="${esc(l.short)}" maxlength="180" placeholder="Brief summary shown in the catalog"></label><label>Description<textarea aria-label="Description" data-lot="description" rows="5" maxlength="4500" placeholder="Item details, condition, and restrictions">${esc(l.description)}</textarea></label><div class="field-grid"><label>Category<input data-lot="category" value="${esc(l.category)}" maxlength="100" list="category-options"><datalist id="category-options">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label>Opening bid · example USD<input data-lot="opening" inputmode="decimal" aria-describedby="opening-error" value="${esc(rawAmount(l.opening,l.openingText))}"><span id="opening-error" class="field-error" role="alert"></span></label></div></div>
 <p class="help">Bid increment: ${d.event.increment?money(d.event.increment):'not set'} · shared across this event. <button class="link-btn" style="font-size:11px;min-height:24px" data-action="edit-event">Edit event defaults</button></p><div id="lot-errors"></div>
 <details class="disclosure"><summary>What’s included & details</summary><div class="field-stack"><label>Included · one per line<textarea aria-label="Included · one per line" data-lot="includes" rows="3">${esc(l.includes.join('\n'))}</textarea></label><label>Important details<textarea aria-label="Important details" data-lot="fine" rows="3" maxlength="5000">${esc(l.fine)}</textarea></label>${l.image?`<label>Photo description<input data-lot="alt" value="${esc(l.alt)}" maxlength="180"></label>`:''}</div></details>
 <div class="note">${l.windowId?`Uses the event window: ${dateText(d.event.date)}, ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}.`:'No auction window yet. Select this lot and assign a window with other lots.'}</div><div class="lot-footer"><button class="btn small" data-action="duplicate-lot">Duplicate lot</button><div class="order-controls"><button data-action="move-up" aria-label="Move lot earlier" ${d.lots.indexOf(l)===0?'disabled':''}>↑</button><button data-action="move-down" aria-label="Move lot later" ${d.lots.indexOf(l)===d.lots.length-1?'disabled':''}>↓</button></div><small>Catalog order · ${d.lots.indexOf(l)+1} of ${d.lots.length}</small></div></section>`;
}
function renderMain(){
 const route=location.hash.match(/^#\/lots\/([^?]+)/);if(route&&d.lots.some(l=>l.id===route[1]))picked=route[1];
 if(!chosen())picked=d.lots[0]?.id;
 $('#main').innerHTML=activeTab()==='lots'?lotsView():eventView();$('#main').scrollTop=0;
 if(d.version===1){
  const cover=$('.cover');if(cover)cover.insertAdjacentHTML('beforeend',`<label>Upload event photo<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="event" aria-label="Upload event photo"></label><label>Event photo description<input data-event="coverAlt" value="${esc(d.event.coverAlt||'')}" aria-label="Event photo description"></label>`);
  const photo=$('.editor-photo');if(photo)photo.insertAdjacentHTML('beforeend','<label>Upload item photo<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="lot" aria-label="Upload item photo"></label>');
 }
 renderInventory();
}
function setupView(){
 if(!confirmed)return '';
 if(confirmed.version===2)return `<section class="studio-setup" data-studio-checklist data-basis="saved"><h3>Event setup</h3><p>Saved revision ${confirmed.revision}. One explicit window and tiered synthetic trade-dollar rules.</p><ul class="setup-steps">
 <li data-setup-step="welcome" data-state="${confirmed.event.welcome.trim()?'complete':'needs-attention'}"><strong>Welcome and timing</strong></li>
 <li data-setup-step="items" data-state="${confirmed.lots.length?'complete':'needs-attention'}"><strong>${confirmed.lots.length} saved items</strong></li>
 <li data-setup-step="approval" data-state="${catalogApproval?'complete':'needs-attention'}"><strong>${catalogApproval?'Published catalog':'Publish selected items'}</strong></li>${entrySetupStep()}</ul></section>`;
 const saved=confirmed,problems=eventIssues(saved.event),incomplete=saved.lots.find(l=>lotIssues(l,saved.event).length);
 const times=windowFor(saved.event);
 const eventField=!saved.event.name.trim()?'name':!saved.event.welcome.trim()?'welcome':times.start===null||times.end===null?'date':times.end<=times.start?'end':'increment';
 const itemField=incomplete?({title:'title',description:'description',category:'category','opening bid':'opening'}[lotIssues(incomplete,saved.event)[0]]):'title';
 const welcomeOk=problems.length===0,itemsOk=saved.lots.length>0&&!incomplete;
 const pending=approvalLoading||approving||['loading','sending'].includes(approvalState);
 const approved=!pending&&approvalState==='approved'&&!!catalogApproval;
 const approvalUnknown=['uncertain','unavailable','blocked','conflict'].includes(approvalState);
 const action=(label,tab,field,id)=>`<button class="link-btn" data-action="fix-setup" data-setup-tab="${tab}" data-field="${field}" ${id?`data-id="${esc(id)}"`:''} ${!editable()?'disabled':''}>${label} →</button>`;
 return `<section class="studio-setup" data-studio-checklist data-basis="saved" aria-label="Event setup"><div class="setup-head"><h3>Event setup</h3><p>Saved revision ${saved.revision}${dirty?' · unsaved working changes are excluded':''}</p></div><ul class="setup-steps">
 <li data-setup-step="welcome" data-state="${welcomeOk?'complete':'needs-attention'}"><span class="setup-mark" aria-hidden="true">${welcomeOk?'✓':'○'}</span><div><strong>Welcome & event details</strong><p>${welcomeOk?'Saved welcome and event details are complete.':esc(problems[0])}</p></div>${!welcomeOk?action('Edit event','event',eventField):''}</li>
 <li data-setup-step="items" data-state="${itemsOk?'complete':'needs-attention'}"><span class="setup-mark" aria-hidden="true">${itemsOk?'✓':'○'}</span><div><strong>Saved items</strong><p>${itemsOk?`${saved.lots.length} saved ${saved.lots.length===1?'item has':'items have'} the required catalog details.`:incomplete?`Item ${esc(incomplete.number)} needs ${esc(lotIssues(incomplete,saved.event)[0])}.`:'Add and save your first item.'}</p></div>${!itemsOk?(incomplete?action('Finish item','lots',itemField,incomplete.id):action('Add item','lots','add')):''}</li>
 <li data-setup-step="approval" data-state="${approved?'complete':pending?'pending':'needs-attention'}"><span class="setup-mark" aria-hidden="true">${approved?'✓':pending?'…':'○'}</span><div><strong>Catalog approval</strong><p>${approved?`Independently approved saved revision ${catalogApproval.sourceRevision}. Draft changes remain separate.`:pending?'Checking independent catalog approval. It is not confirmed yet.':approvalUnknown?'Independent catalog approval is unavailable or not confirmed. Check its status before proceeding.':'Catalog approval is separate from saving the draft. Select saved items, then review the catalog.'}</p></div>${!approved&&!pending&&!approvalUnknown&&saved.lots.length?action('Choose items','lots','selection'):''}</li>
 ${entrySetupStep()}</ul></section>`;
}
function renderSetup(){const el=$('#studio-setup');if(el)el.innerHTML=setupView();}

function entryStorageKey(id=d?.event.id){return `bz:staff-event-entry:v1:${session?.person.id}:${id}`;}
function retainEntryAttempt(){try{sessionStorage.setItem(entryStorageKey(),JSON.stringify(entryAttempt));}catch{}}
function clearEntryAttempt(){try{sessionStorage.removeItem(entryStorageKey());}catch{}entryAttempt=null;}
function restoreEntryAttempt(id){
 try{const value=JSON.parse(sessionStorage.getItem(entryStorageKey(id))||'null');
  if(value&&Object.keys(value).sort().join(',')==='enabled,expectedEntryRevision,requestId'&&typeof value.enabled==='boolean'&&Number.isSafeInteger(value.expectedEntryRevision)&&value.expectedEntryRevision>=0&&value.expectedEntryRevision<2147483647&&/^[0-9a-f-]{36}$/i.test(value.requestId)){
   entryAttempt=value;entryState='uncertain';entryNotice='Entry update not confirmed. Check the original update before sharing.';
  }
 }catch{}
}
function resetEntry(){entryReadEpoch++;entryConfirmed=null;entryAttempt=null;entryState='loading';entryNotice='';entrySaving=false;}
function entrySetupStep(){
 const revision=entryConfirmed?.entryRevision??0;
 const complete=entryState==='enabled',pending=['loading','saving'].includes(entryState);
 const state=complete?'complete':entryState==='disabled'?'needs-attention':pending?'pending':'unavailable';
 const text=entryState==='enabled'?`Entry enabled · revision ${revision}. New synthetic attendees can create their own private demo profile.`:
  entryState==='disabled'?`Entry disabled · revision ${revision}. Enable entry from Event & entry when you are ready to share.`:
  entryState==='saving'?`Saving entry update · last confirmed revision ${revision}. Enablement is not confirmed yet.`:
  entryState==='loading'?`Checking current entry · last confirmed revision ${revision}. It is not confirmed yet.`:
  `${entryNotice||'Entry update not confirmed. Check its current state.'} Last confirmed revision ${revision}.`;
 return `<li data-setup-step="access" data-state="${state}"><span class="setup-mark" aria-hidden="true">${complete?'✓':pending?'…':'○'}</span><div><strong>New bidder entry</strong><p>${esc(text)}</p></div></li>`;
}
function entryQR(url){
 if(qrImages.has(url))return qrImages.get(url);
 const qr=qrcodegen.QrCode.encodeText(url,qrcodegen.QrCode.Ecc.MEDIUM),size=qr.size+8;let path='';
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))path+=`M${x+4},${y+4}h1v1h-1z`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size*4}" height="${size*4}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`;
 const source='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);qrImages.set(url,source);return source;
}
function entryView(){
 const ready=entryState==='enabled'&&!entryAttempt&&!entrySaving,disabled=entryState==='disabled'&&!entryAttempt&&!entrySaving;
 const revision=entryConfirmed?.entryRevision??0,state=['enabled','disabled','saving'].includes(entryState)?entryState:'uncertain';
 const text=entryState==='enabled'?`Entry enabled · revision ${revision}`:entryState==='disabled'?`Entry disabled · revision ${revision}`:
  entryState==='saving'?'Saving entry update…':entryState==='loading'?'Checking current entry…':entryNotice||'Entry update not confirmed.';
 const url=ready?entryConfirmed.shareUrl:'';
 return `<section class="sheet event-entry" data-event-entry data-entry-state="${state}" aria-labelledby="event-entry-title"><div class="sheet-head"><h3 id="event-entry-title">Event entry</h3><span class="section-label">Share</span></div><p class="entry-status ${['blocked','uncertain','unavailable','conflict'].includes(entryState)?'error':''}" role="status" aria-live="polite">${esc(text)}</p><p class="help">Each attendee creates a separate synthetic demo profile. Entry is independent of draft saving and catalog approval.</p><div class="entry-actions"><button class="btn primary" data-action="enable-entry" ${disabled?'':'disabled'}>Enable event entry</button><button class="btn" data-action="disable-entry" ${ready?'':'disabled'}>Disable event entry</button>${!['enabled','disabled','saving','loading','blocked'].includes(entryState)?`<button class="btn" data-action="check-entry" ${entrySaving?'disabled':''}>Check entry update</button>`:''}</div><div class="entry-share"><div><label>Event link<input aria-label="Event link" readonly value="${esc(url)}" placeholder="Enable entry to share this event"></label><button class="link-btn" data-action="copy-entry" ${ready?'':'disabled'}>Copy event link</button>${ready?'<p class="help">Use this link or QR code to open the attendee profile form.</p>':''}</div>${ready?`<img class="entry-qr" src="${esc(entryQR(url))}" alt="Event entry QR code">`:''}</div>${entryState==='blocked'?'<p class="note error">Current staff access is unavailable. Sign in again before updating or sharing entry.</p>':''}</section>`;
}
function renderEntry(){const panel=$('[data-event-entry]');if(panel)panel.outerHTML=entryView();renderSetup();}
function confirmedEntry(response,id,intent){
 const e=response?.entry;
 if(!e||e.eventId!==id||typeof e.enabled!=='boolean'||!Number.isSafeInteger(e.entryRevision)||e.entryRevision<0||e.entryRevision>2147483647||
  (e.entryRevision===0?e.updatedAt!==null:!Number.isFinite(Date.parse(e.updatedAt)))||e.shareUrl!==`${location.origin}/events/${id}`||!Number.isFinite(Date.parse(response.serverNow)))throw {status:503,message:'Entry response not confirmed.'};
 if(intent){const op=response.operation;if(typeof response.replayed!=='boolean'||!op||op.requestId!==intent.requestId||op.enabled!==intent.enabled||op.appliedRevision!==intent.expectedEntryRevision+1||!Number.isFinite(Date.parse(op.appliedAt)))throw {status:503,message:'Entry operation not confirmed.'};}
 return clone(e);
}
async function loadEntry(id,ticket=contextEpoch){
 const read=++entryReadEpoch;
 if(!entryAttempt){entryState='loading';entryNotice='';renderEntry();}
 try{const response=await api('/api/admin/events/'+encodeURIComponent(id)+'/entry');if(!current(ticket)||read!==entryReadEpoch||d?.event.id!==id)return;
  entryConfirmed=confirmedEntry(response,id);if(!entryAttempt)entryState=entryConfirmed.enabled?'enabled':'disabled';
 }catch(e){if(!current(ticket)||read!==entryReadEpoch||d?.event.id!==id)return;
  entryState=[401,403,404].includes(e.status)?'blocked':entryAttempt?'uncertain':'unavailable';entryNotice=[401,403,404].includes(e.status)?'Entry access is unavailable or denied. Sign in again.':'Current entry could not be confirmed. Check again before sharing.';
 }finally{if(current(ticket)&&read===entryReadEpoch&&d?.event.id===id)renderEntry();}
}
async function updateEntry(enabled){
 if(!d||entrySaving||loadingDraft||entryState==='blocked')return;
 if(!entryAttempt){if(!entryConfirmed||!['enabled','disabled'].includes(entryState))return;entryAttempt={expectedEntryRevision:entryConfirmed.entryRevision,enabled,requestId:crypto.randomUUID()};retainEntryAttempt();}
 const id=d.event.id,ticket=contextEpoch,intent=clone(entryAttempt);entryReadEpoch++;entrySaving=true;entryState='saving';entryNotice='';renderEntry();
 try{const response=await api('/api/admin/events/'+encodeURIComponent(id)+'/entry','POST',intent);if(!current(ticket)||d?.event.id!==id)return;
  entryConfirmed=confirmedEntry(response,id,intent);clearEntryAttempt();entryState=entryConfirmed.enabled?'enabled':'disabled';
 }catch(e){if(!current(ticket)||d?.event.id!==id)return;
  if([401,403,404].includes(e.status)){entryState='blocked';entryNotice='Entry update denied. Current staff access is unavailable.';}
  else if(e.status===409||e.status===400){clearEntryAttempt();entryState='conflict';entryNotice='Entry changed or the update was refused. Check the current entry before trying again.';}
  else{entryState='uncertain';entryNotice='Entry update not confirmed. Check entry update to retry the original request.';}
 }finally{if(current(ticket)&&d?.event.id===id){entrySaving=false;renderEntry();}}
}
async function copyEntry(){
 if(entryState!=='enabled'||entryAttempt||entrySaving||!d)return;
 const id=d.event.id,ticket=contextEpoch;await loadEntry(id,ticket);
 if(!current(ticket)||d?.event.id!==id||entryState!=='enabled'||entryAttempt)return;
 try{await navigator.clipboard.writeText(entryConfirmed.shareUrl);if(current(ticket))toast('Event link copied.');}
 catch{if(current(ticket))toast('Copy was unavailable. Select the event link to copy it.');}
}

function canLeaveDraft(){
 if(entrySaving){toast('Wait for the current entry update before switching events.');return false;}
 if(creating||createAttempt){toast('Wait for or retry the pending request before switching events.');return false;}
 if(approving||approvalAttempt){toast('Retry or finish the approval before switching events.');return false;}
 if(loadingDraft){toast('Wait for the draft to load.');return false;}
 if(dirty||attempt||saving){toast('Save or reload this draft before switching events.');return false;}
 return true;
}
async function loadEvent(id,ticket=contextEpoch,route){
 if(!current(ticket))return false;loadingDraft=true;homeNotice='';refreshChrome();
 try{
 let packet;try{packet=await api('/api/v2/admin/events/'+encodeURIComponent(id));}
 catch(e){if(e.code!=='UNSUPPORTED_EVENT_VERSION')throw e;packet=await api('/api/admin/events/'+encodeURIComponent(id));}
  if(!current(ticket))return false;
  adopt(packet.draft);if(route)replaceEditorRoute(route.tab,route.lot);
  // Record a staff event choice before exposing its editor. Approval is a
  // separate read and must not leave visible, confirmed drafts in a route race.
  if(route?.push)eventUrl(id,{tab:route.tab,lot:route.lot||null});
  shell();renderMain();refresh();
  const approvalRead=loadApproval(id,ticket),entryRead=loadEntry(id,ticket);loadingDraft=false;refreshChrome();
  await Promise.all([approvalRead,entryRead]);await recoverPendingUpload();
  return true;
 }finally{if(current(ticket)){loadingDraft=false;refreshChrome();}}
}
async function events(){
 const ticket=contextEpoch;
 try{const packet=await api('/api/admin/events');if(!current(ticket))return;eventList=packet.events;
  const choices=eventList.filter(e=>e.organizationId===loadedOrgId);
  openModal('Choose event',choices.length?choices.map(e=>`<button class="modal-choice" data-action="switch-event" data-id="${esc(e.id)}"><span><strong>${esc(e.name||'Untitled event')}</strong><small>Revision ${e.revision}</small></span></button>`).join(''):'<p>No events yet.</p>','<span></span><button class="btn primary" data-action="new-event">+ Create an event</button>',esc(session.staffOrganizations.find(o=>o.id===loadedOrgId)?.name||''));
 }catch{if(current(ticket))toast('Could not load the event list. Try again.');}
}
function eventsHomeContent(){
 const choices=eventList.filter(e=>e.organizationId===loadedOrgId);
 return `<header class="event-heading"><h1 id="events-title">Events</h1><button class="btn primary" data-action="new-event">Create event</button></header><div id="events-status" class="events-status ${homeNotice?'error':''}" role="${homeNotice?'alert':'status'}" aria-live="polite">${esc(homeNotice||(homeLoading?'Loading events…':loadingDraft?'Loading event…':`${choices.length} ${choices.length===1?'event':'events'}`))}${homeNotice?'<button class="btn small" data-action="retry-events">Retry</button>':''}</div>${!homeLoading&&!homeNotice?choices.length?`<div class="event-list">${choices.map(e=>{const savedAt=new Date(e.savedAt),saved=Number.isFinite(savedAt.getTime())?` · Saved ${savedAt.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`:'';return `<button class="event-card" data-action="switch-event" data-id="${esc(e.id)}"><span><strong>${esc(e.name||'Untitled event')}</strong><small class="event-card-meta">Revision ${e.revision}${esc(saved)}</small></span><span class="event-card-arrow" aria-hidden="true">→</span></button>`;}).join('')}</div>`:'<div class="events-empty"><h2>No events yet</h2><p>Create your first event.</p></div>':''}`;
}
function refreshHomeControls(){
 if(d)return;document.querySelectorAll('[data-action="switch-event"],[data-action="new-event"],[data-action="events-home"],[data-action="retry-events"]').forEach(el=>el.disabled=homeLoading||loadingDraft||creating||!!createAttempt);
 const status=$('#events-status');if(status&&!homeNotice)status.textContent=homeLoading?'Loading events…':loadingDraft?'Loading event…':`${eventList.filter(e=>e.organizationId===loadedOrgId).length} events`;
}
function renderEventsHome(){
 $('#app').classList.remove('preview-open');$('#app').innerHTML=`<div class="studio-shell">${staffSidebar()}<div class="studio-body">${staffHeader()}<main id="workspace" class="events-home" tabindex="-1"><section id="events-home" aria-labelledby="events-title">${eventsHomeContent()}</section></main>${staffFooter()}</div></div>`;refreshHomeControls();
}
async function showEventsHome({reload=true,route=true,replace=false,check=true}={}){
 if(check&&(creating||createAttempt||!canLeaveDraft()))return;
 const ticket=++contextEpoch;resetCatalog();resetEntry();uploading=false;d=null;confirmed=null;dirty=false;attempt=null;saveState='saved';loadingDraft=false;selected.clear();picked=null;search='';notice='';homeNotice='';homeLoading=reload;if(reload)eventList=[];
 if(route)eventUrl(null,{replace});history.replaceState(history.state,'','#/events');renderEventsHome();
 if(!reload)return;
 try{const packet=await api('/api/admin/events');if(!current(ticket))return;eventList=packet.events;}
 catch(e){if(!current(ticket))return;homeNotice=[401,403].includes(e.status)?'Event access is unavailable. Sign in again.':'Events could not be loaded. Try again.';}
 finally{if(current(ticket)){homeLoading=false;renderEventsHome();$('#workspace')?.focus({preventScroll:true});}}
}
function newEvent(){
 if(d&&!canLeaveDraft())return;
 contextEpoch++;
 createAttempt=null;
 openModal('Create event','<label>Event name<input id="new-event-name" aria-describedby="new-event-error" placeholder="Event name" maxlength="120"></label><label>Event format<select id="new-event-format"><option value="trade">Synthetic Saturn trade auction</option><option value="historical">Historical staging catalog</option></select></label><div id="new-event-error" role="alert"></div><p class="note">The new event starts with an empty catalog.</p>','<button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="create-event">Create event</button>');
}
async function createEvent(){
 if(creating)return;
 const ticket=contextEpoch;
 const field=$('#new-event-name');const name=field.value.trim();
 if(!name){$('#new-event-error').textContent='Give the event a name.';field.setAttribute('aria-invalid','true');field.focus();return;}
 field.removeAttribute('aria-invalid');$('#new-event-error').textContent='';
 if(!createAttempt)createAttempt={organizationId:loadedOrgId,name,requestId:crypto.randomUUID(),format:$('#new-event-format').value};
 creating=true;field.disabled=true;const button=dialog.querySelector('[data-action="create-event"]');button.disabled=true;dialog.querySelectorAll('[data-action="close-modal"]').forEach(el=>el.disabled=true);
 try{
  const {format,...body}=createAttempt;const response=await api((format==='historical'?'/api':'/api/v2')+'/admin/events','POST',body);if(!current(ticket))return;createAttempt=null;adopt(response.draft);replaceEditorRoute();eventUrl(d.event.id,{tab:'event'});shell();renderMain();refresh();closeModal(true);await Promise.all([loadApproval(d.event.id,ticket),loadEntry(d.event.id,ticket)]);
 }catch(e){
  if(!current(ticket))return;
  const uncertain=!e.status||e.status>=500;
  $('#new-event-error').textContent=uncertain?'Creation not confirmed. Retry to check the same request.':e.message||'The event could not be created.';
  if(!uncertain){createAttempt=null;field.disabled=false;}
  button.textContent=uncertain?'Retry create':'Create event';
 }finally{if(current(ticket)){creating=false;if(button.isConnected){button.disabled=false;dialog.querySelectorAll('[data-action="close-modal"]').forEach(el=>el.disabled=!!createAttempt);}}}
}
function resetCatalog(){
 approvalReadEpoch++;catalogApproval=null;approvalAttempt=null;reviewedCatalog=null;approving=false;approvalLoading=false;approvalState='none';approvalNotice='';
}
function confirmedApproval(response,id){
 if(!Object.hasOwn(response,'approval'))throw {status:503,message:'Approval response not confirmed.'};
 const a=response.approval;
 if(a!==null&&(!a||a.eventId!==id||a.organizationId!==d.org.id||typeof a.id!=='string'||!Number.isSafeInteger(a.sourceRevision)||!a.local||!a.snapshot?.event||!Array.isArray(a.snapshot.lots)||!Number.isFinite(Date.parse(a.opensAt))||!Number.isFinite(Date.parse(a.closesAt))))throw {status:503,message:'Approval response not confirmed.'};
 return a;
}
function canReviewCatalog(){return !!confirmed&&selected.size>0&&!dirty&&!attempt&&!saving&&!loadingDraft&&!approvalLoading&&!approving&&!approvalAttempt&&!catalogApproval&&saveState==='saved'&&approvalState!=='unavailable'&&approvalState!=='blocked';}
function refreshCatalogControls(){
 const status=$('#catalog-approval');if(status){status.textContent=({none:'Not approved',loading:'Checking approval…',sending:'Approving…',uncertain:'Approval not confirmed',approved:'Approved',conflict:'Approval conflict',blocked:'Approval blocked',unavailable:'Approval unavailable'})[approvalState];status.classList.toggle('green',approvalState==='approved');status.classList.toggle('error',['uncertain','blocked','conflict'].includes(approvalState));}
 const review=$('#review-catalog');if(review)review.disabled=!canReviewCatalog();
 document.querySelectorAll('[data-lot-select],#select-all').forEach(el=>el.disabled=loadingDraft||approving||!!approvalAttempt);
 dialog.querySelectorAll('[data-action="approve-catalog"],[data-action="close-modal"]').forEach(el=>{if(approving)el.disabled=true;});
 renderSetup();
}
function catalogSummary(){
 if(catalogApproval){const a=catalogApproval,t=a.snapshot.event.timing;return `<section class="catalog-summary" aria-label="Approved catalog"><div><strong>Approved catalog</strong><p>${esc(a.snapshot.event.name)} · saved revision ${a.sourceRevision} · ${a.snapshot.lots.length} lots</p><p>${t?`${dateText(t.startDate)} · ${timeText(t.start)} to ${dateText(t.endDate)} · ${timeText(t.end)} ${esc(t.timezone)}`:`${esc(a.local.date)} · ${timeText(a.local.start)}–${timeText(a.local.end)} ${esc(a.local.timezone)}`}</p></div><details><summary>View approved lots</summary><ol>${a.snapshot.lots.map(l=>`<li>Lot ${esc(l.number)} · ${esc(l.title)}</li>`).join('')}</ol><p>This saved copy and window are fixed.</p></details></section>`;}
 if(approvalState==='uncertain')return `<section class="catalog-summary error" role="alert"><div><strong>Approval not confirmed</strong><p>The server may have approved it. Retry the same request to check its result.</p></div><button class="btn" data-action="retry-approval" ${approving?'disabled':''}>Retry approval</button></section>`;
 if(approvalNotice)return `<section class="catalog-summary error" role="alert"><p>${esc(approvalNotice)}</p>${approvalState==='conflict'?'<button class="btn small" data-action="reload-draft">Reload saved draft</button>':approvalState==='unavailable'?'<button class="btn small" data-action="refresh-approval">Retry approval status</button>':''}</section>`;
 return '';
}
function renderCatalogSummary(){const main=$('#main');if(!main)return;main.querySelector('.catalog-summary')?.remove();const note=$('#draft-notice');if(note)note.insertAdjacentHTML('afterend',catalogSummary());refreshCatalogControls();}
async function loadApproval(id,ticket=contextEpoch){
 const read=++approvalReadEpoch;approvalLoading=true;approvalState='loading';refreshCatalogControls();
 try{const response=await api((d?.version===2?'/api/v2':'/api')+'/admin/events/'+encodeURIComponent(id)+'/catalog-approval');if(!current(ticket)||read!==approvalReadEpoch||d?.event.id!==id)return;
  const approved=confirmedApproval(response,id);catalogApproval=approved?clone(approved):null;approvalState=catalogApproval?'approved':'none';approvalNotice='';approvalAttempt=null;reviewedCatalog=null;
 }catch(e){if(!current(ticket)||read!==approvalReadEpoch||d?.event.id!==id)return;
  catalogApproval=null;approvalState=[401,403].includes(e.status)?'blocked':'unavailable';approvalNotice=[401,403].includes(e.status)?'Approval access is unavailable. Sign in again.':'Approval status could not be loaded. Drafts can still be edited and saved.';
 }finally{if(current(ticket)&&read===approvalReadEpoch){approvalLoading=false;renderCatalogSummary();renderNotice();refreshChrome();}}
}
function review(){
 if(!canReviewCatalog())return;
 const packet=confirmed,lots=packet.lots.filter(l=>selected.has(l.id));
 if(packet.version===2){
  const t=packet.event.timing,issues=[];
  if(!packet.event.name.trim()||!packet.event.welcome.trim()||!t.startDate||!t.start||!t.endDate||!t.end)issues.push('Complete the event and shared window.');
  for(const l of lots)if(!l.title.trim()||!l.description.trim()||!l.category.trim()||!Number.isSafeInteger(l.opening)||l.opening<=0)issues.push('Complete item '+l.number+'.');
  reviewedCatalog={eventId:packet.event.id,revision:packet.revision,lotIds:lots.map(l=>l.id)};
  openModal('Review catalog',`<div class="review-summary"><strong>${lots.length} selected saved items</strong><p>${esc(t.startDate)} ${esc(t.start)} to ${esc(t.endDate)} ${esc(t.end)} ${esc(t.timezone)}</p><p>Synthetic Saturn trade dollars · tiered minimum raises · no payment or settlement.</p></div><ul class="catalog-review-lots">${lots.map(l=>`<li><span>Lot ${esc(l.number)}</span><strong>${esc(l.title)}</strong></li>`).join('')}</ul>${issues.map(x=>`<p class="note error">${esc(x)}</p>`).join('')}`,
   '<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="approve-catalog" '+(issues.length?'disabled':'')+'>Approve catalog</button>');return;
 }
 const issues=[...eventIssues(packet.event),...lots.flatMap(l=>[...lotIssues(l,packet.event).map(x=>`Lot ${l.number}: add ${x}.`),...(l.windowId!=='main'?[`Lot ${l.number}: assign the auction window.`]:[])])];
 reviewedCatalog={eventId:packet.event.id,revision:packet.revision,lotIds:lots.map(l=>l.id)};
 openModal('Review catalog',`<div class="review-summary"><strong>${lots.length} selected saved ${lots.length===1?'lot':'lots'}</strong><p>Revision ${packet.revision} · ${dateText(packet.event.date)}</p><p>${timeText(packet.event.start)}–${timeText(packet.event.end)} ${esc(packet.event.timezone)}</p></div><ul class="catalog-review-lots">${lots.map(l=>`<li><span>Lot ${esc(l.number)}</span><strong>${esc(l.title)}</strong></li>`).join('')}</ul>${issues.length?`<ul class="checks">${issues.map(x=>`<li><span class="bad">!</span><span>${esc(x)}</span></li>`).join('')}</ul>`:''}<p class="note">Approval fixes this saved copy and shared window. The catalog appears at opening and stays read-only after closing. Bidder access is separate from catalog approval.</p>`,'<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="approve-catalog" '+(issues.length?'disabled':'')+'>Approve catalog</button>');
}
async function approveCatalog(){
 if(approving||loadingDraft||!d||catalogApproval)return;
 if(!approvalAttempt){if(!reviewedCatalog||dirty||attempt||reviewedCatalog.eventId!==d.event.id||reviewedCatalog.revision!==confirmed.revision)return;approvalAttempt={expectedRevision:reviewedCatalog.revision,requestId:crypto.randomUUID(),lotIds:[...reviewedCatalog.lotIds]};}
 const ticket=contextEpoch,id=d.event.id;approving=true;approvalState='sending';approvalNotice='';refreshChrome();renderCatalogSummary();
 try{const response=await api((d.version===2?'/api/v2':'/api')+'/admin/events/'+encodeURIComponent(id)+'/catalog-approval','POST',approvalAttempt);if(!current(ticket)||d?.event.id!==id)return;
  const approved=confirmedApproval(response,id);if(!approved)throw {status:503,message:'Approval response not confirmed.'};catalogApproval=clone(approved);approvalState='approved';approvalAttempt=null;reviewedCatalog=null;approvalNotice='';closeModal(true);
 }catch(e){if(!current(ticket)||d?.event.id!==id)return;
  if(!e.status||e.status>=500){approvalState='uncertain';}
  else if(e.status===401||e.status===403){approvalState='blocked';approvalNotice='Approval access ended. Sign in again.';}
  else{approvalAttempt=null;reviewedCatalog=null;approvalState=e.status===409?'conflict':'none';approvalNotice=e.status===409?'Approval conflicts with the saved event. Reload the saved draft before reviewing again.':e.message||'Check the selected lots and schedule.';if(e.code==='REVISION_CONFLICT'){saveState='conflict';notice='This draft changed in another session.';}}
  closeModal(true);
 }finally{if(current(ticket)&&d?.event.id===id){approving=false;renderCatalogSummary();refreshChrome();renderNotice();}}
}

function assignWindow(){
 windowDraft={date:d.event.date,start:d.event.start,end:d.event.end,timezone:d.event.timezone};
 openModal('Assign auction window',`<p class="muted" style="margin-bottom:20px">${selected.size} selected ${selected.size===1?'lot will':'lots will'} use the same draft window.</p><div class="field-stack"><label>Date<input type="date" data-window="date" value="${esc(d.event.date)}"></label><div class="field-grid"><label>Opens<input type="time" data-window="start" value="${esc(d.event.start)}"></label><label>Closes<input type="time" data-window="end" value="${esc(d.event.end)}"></label></div><label>Time zone<select aria-label="Time zone" data-window="timezone">${zones(d.event.timezone)}</select></label></div><p class="note">Changing the event window updates every assigned lot in the draft. Save the draft to keep these changes.</p><div id="window-error" role="alert"></div>`,`<span></span><button class="btn primary" data-action="apply-window">Assign to ${selected.size} lots</button>`);
}
const photos=[['cabin','Cabin'],['coffee','Coffee'],['dinner','Dinner'],['ceramics','Ceramics'],['bicycle','Bicycle'],['flowers','Flowers']];
async function uploadFile(input){
 if(!d||uploading||!input.files?.[0]||catalogApproval&&d.version===2)return;
 const file=input.files[0],ticket=contextEpoch,eventId=d.event.id,actorId=session.person.id,
  target=input.dataset.upload,lotId=target==='lot'?picked:null,sponsorIndex=target==='sponsor'?Number(input.dataset.index):null,
  requestId=crypto.randomUUID();
 const descriptor={eventId,actorId,target,lotId,sponsorIndex,requestId};
 try{sessionStorage.setItem(pendingUploadKey(),JSON.stringify(descriptor));}catch{}
 uploading=true;uploadNotice='Uploading and normalizing image…';refreshChrome();renderNotice();
 try{
  const response=await fetch('/api/admin/events/'+encodeURIComponent(eventId)+'/assets',{method:'POST',credentials:'same-origin',
   headers:{'content-type':file.type,'x-bidzizi-request-id':requestId},body:file,cache:'no-store'});
  const packet=await response.json();
  if(!response.ok)throw {status:response.status,message:packet.error?.message||'Image upload failed.'};
  if(!current(ticket)||d?.event.id!==eventId||session?.person.id!==actorId||
    (target==='lot'&&picked!==lotId)||(target==='sponsor'&&!d.event.sponsors[sponsorIndex]))return;
  const currentSession=await api('/api/session');
  if(!currentSession.authenticated||currentSession.person?.id!==actorId)return;
  const ref=packet.asset?.ref;
  if(typeof ref!=='string'||!ref.startsWith('asset:'))throw {status:503,message:'Image response could not be confirmed.'};
  uploadRefs.set(ref,'/api/admin/events/'+eventId+'/asset-uploads/'+requestId+'/content');
  if(target==='event')d.event.cover=ref;
  else if(target==='lot')d.lots.find(l=>l.id===lotId).image=ref;
  else d.event.sponsors[sponsorIndex].logo=ref;
  try{sessionStorage.removeItem(pendingUploadKey());}catch{}
  recoveredUpload=null;uploadNotice='Image uploaded. Save the draft to attach it.';markDirty();renderMain();refresh();
 }catch(error){
  if(current(ticket)&&d?.event.id===eventId){uploadNotice=error.status&&error.status<500?error.message:'Upload response not confirmed. Reload to check the same request.';renderNotice();}
 }finally{if(current(ticket)){uploading=false;refreshChrome();}}
}
async function recoverPendingUpload(){
 if(!d)return;
 let pending;try{pending=JSON.parse(sessionStorage.getItem(pendingUploadKey())||'null');}catch{}
 if(!pending||pending.eventId!==d.event.id||pending.actorId!==session?.person.id)return;
 try{
  const response=await api('/api/admin/events/'+pending.eventId+'/asset-uploads/'+pending.requestId);
  if(response.asset?.requestId===pending.requestId){recoveredUpload=response.asset;uploadNotice='An earlier upload was confirmed; it is not saved to a target.';}
 }catch(error){if(error.status===404){uploadNotice='Earlier upload was not found. Select the image again to retry.';try{sessionStorage.removeItem(pendingUploadKey());}catch{}}}
 renderNotice();
}
function imagePicker(target){
 imageTarget=target;openModal('Choose photo',`<div class="image-grid">${photos.map(([id,name])=>`<button data-action="choose-image" data-image="assets/lots/${id}.jpg"><img src="/staging-bidder-preview/assets/lots/${id}.jpg" alt="${name}"><span>${name}</span></button>`).join('')}</div><p class="help">Example images for staging. Uploads are not enabled.</p>`);
}
function applyImage(path){if(imageTarget==='event')d.event.cover=path;else{chosen().image=path;chosen().alt=chosen().alt||'Auction item photo';}markDirty();closeModal();renderMain();refresh();}
function renumber(){d.lots.forEach((l,i)=>l.number=String(i+1).padStart(2,'0'));}
function move(delta){if(!editable())return;const i=d.lots.findIndex(l=>l.id===picked),to=i+delta;if(to<0||to>=d.lots.length)return;[d.lots[i],d.lots[to]]=[d.lots[to],d.lots[i]];renumber();markDirty();renderMain();refresh();}
const editable=()=>!loadingDraft&&!uploading&&!approving&&!approvalAttempt&&!['saving','uncertain','blocked'].includes(saveState)&&!(d?.version===2&&catalogApproval);
function duplicateLot(){
 if(!editable()||!chosen())return;
 if(d.lots.length>=100){toast('This event already has 100 lots. A duplicate cannot be added.');return;}
 const source=chosen(),id=crypto.randomUUID();
 // Copy editable content only; each draft owns its identity and runtime state.
 const lot={id,number:String(d.lots.length+1).padStart(2,'0'),
  title:source.title,short:source.short,description:source.description,category:source.category,
  image:source.image,alt:source.alt,opening:source.opening,fixedRaiseMinor:source.fixedRaiseMinor??null,includes:clone(source.includes),fine:source.fine,
  provider:d.org.name,logo:'saturn',count:0,current:0,history:[],windowId:null};
 d.lots.push(lot);markDirty();replaceEditorRoute('lots',id);
 eventUrl(d.event.id,{replace:true,tab:'lots',lot:id});renderMain();refresh();
 $('[data-lot="title"]')?.focus();
 toast('Lot duplicated as an unsaved draft. Save the draft to keep it.');
}
const actions={
 'enable-entry':()=>updateEntry(true),'disable-entry':()=>updateEntry(false),'check-entry':()=>entryAttempt?updateEntry(entryAttempt.enabled):loadEntry(d.event.id),'copy-entry':copyEntry,
 'close-modal':()=>closeModal(),
 'save-draft':saveDraft,
 'toggle-preview':()=>{const focusInPreview=$('.preview')?.contains(document.activeElement);previewOpen=!previewOpen;refreshChrome();postPreview();if(!previewOpen&&focusInPreview)$('#preview-toggle')?.focus({preventScroll:true});},
 'preview-route':el=>{previewOpen=true;refreshChrome();postPreview(el.dataset.path);},
 'preview-lot':()=>{if(!canPreviewLot())return;previewOpen=true;refreshChrome();postPreview('/lot/'+picked);},
 'edit-event':()=>navigate('event'),
 'edit-lot':el=>{navigate('lots',el.dataset.id,'[data-lot="title"]');postPreview('/lot/'+el.dataset.id);},
 'fix-setup':el=>{if(!editable())return;if(el.dataset.field==='add'){actions['add-lot']();return;}const selector=el.dataset.field==='selection'?'#select-all':`[data-${el.dataset.setupTab==='event'?'event':'lot'}="${el.dataset.field}"]`;navigate(el.dataset.setupTab,el.dataset.id,selector);},
 'clear-selection':()=>{selected.clear();renderInventory();},
 'assign-window':()=>{if(editable())assignWindow();},
 'apply-window':()=>{if(!editable())return;const w=windowFor(windowDraft);if(w.start===null||w.end===null||w.end<=w.start){$('#window-error').innerHTML='<p class="note error">Choose valid times, with closing after opening.</p>';return;}Object.assign(d.event,windowDraft);d.lots.forEach(l=>{if(selected.has(l.id))l.windowId='main';});markDirty();closeModal();selected.clear();renderMain();refresh();toast('Draft window assigned. Save the draft to keep it.');},
 'review':review,
 'approve-catalog':approveCatalog,'retry-approval':approveCatalog,'refresh-approval':()=>loadApproval(d.event.id),
 'fix-issue':el=>{closeModal();navigate(el.dataset.id?'lots':'event',el.dataset.id);if(el.dataset.id)postPreview('/lot/'+el.dataset.id);},
 'reload-draft':()=>{openModal('Reload saved draft?','<p>Your current edits will be replaced with the latest saved version.</p>','<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="confirm-reload">Reload saved draft</button>');},
 'confirm-reload':async()=>{const id=d.event.id,ticket=++contextEpoch;try{await loadEvent(id,ticket);if(current(ticket))closeModal();}catch{if(current(ticket))toast('Could not reload the saved draft. Your edits are still here.');}},
 'duplicate-lot':duplicateLot,
 'add-lot':()=>{if(!editable())return;const id=crypto.randomUUID();d.lots.push({id,number:String(d.lots.length+1).padStart(2,'0'),title:'',short:'',category:'',provider:d.org.name,logo:'saturn',image:null,alt:'',opening:null,fixedRaiseMinor:null,count:0,current:0,history:[],description:'',includes:[],fine:'',windowId:null});markDirty();navigate('lots',id);refresh();requestAnimationFrame(()=>$('[data-lot="title"]')?.focus());},
 'move-up':()=>move(-1),'move-down':()=>move(1),
 'image':el=>{if(editable())imagePicker(el.dataset.target);},
 'choose-image':el=>{if(editable())applyImage(el.dataset.image);},
 'clear-image':()=>{if(!editable())return;chosen().image=null;markDirty();renderMain();refresh();},
 'add-sponsor':()=>{if(!editable())return;d.event.sponsors.push({name:'',logo:['cedar','coffee','table','earth'][d.event.sponsors.length%4]});markDirty();$('#sponsor-fields').innerHTML=sponsorFields();},
 'remove-sponsor':el=>{if(!editable())return;d.event.sponsors.splice(+el.dataset.index,1);markDirty();$('#sponsor-fields').innerHTML=sponsorFields();},
 'events':events,'events-home':()=>showEventsHome(),'retry-events':()=>showEventsHome(),'new-event':()=>{if(!canLeaveDraft())return;if(dialog.open)closeModal();newEvent();},
 'switch-event':async el=>{
  if(d?.event.id===el.dataset.id)return closeModal();if(!canLeaveDraft())return;const id=el.dataset.id;if(!eventList.some(e=>e.id===id&&e.organizationId===loadedOrgId))return;const ticket=++contextEpoch;uploading=false;
  try{await loadEvent(id,ticket,{tab:'event',push:true});if(current(ticket)){if(dialog.open)closeModal();else $('#event-title')?.focus({preventScroll:true});}}catch{if(current(ticket)){if(d)toast('Could not load the event. Try again.');else{homeNotice='The event could not be loaded. Try again.';renderEventsHome();}}}
 },
 'create-event':createEvent,
 'signout':async()=>{
  if(saving||creating||approving||entrySaving)return toast('Wait for the current request to finish.');
  if((dirty||approvalAttempt)&&saveState!=='blocked'){openModal('Sign out?',approvalAttempt?'<p>The approval has not been confirmed. The server may have approved it. Signing out discards local recovery information.</p>':saveState==='uncertain'?'<p>The save has not been confirmed. The server may have saved it. Signing out discards your local edits.</p>':'<p>Your unsaved edits will be discarded.</p>','<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="confirm-signout">Sign out</button>');return;}
  await signOut();
 },
 'confirm-signout':signOut,
 'retry-load':()=>boot(),
 'test-signin':signIn,
};
async function signOut(){
 if(saving||creating||approving||entrySaving)return toast('Wait for the current request to finish.');
 const ticket=++contextEpoch;
 // Invalidate old operations and remove private content before the network wait.
 resetCatalog();resetEntry();d=null;confirmed=null;session=null;eventList=[];attempt=null;createAttempt=null;dirty=false;notice='';saving=false;creating=false;loadingDraft=false;homeLoading=false;homeNotice='';selected.clear();picked=null;search='';loadedOrgId=null;previewMode='saved';amountErrors.clear();nextFieldFocus=null;
 if(dialog.open)dialog.close();dialog.replaceChildren();returnFocus=null;clearTimeout(toastTimer);$('#toast').textContent='';$('#toast').classList.remove('on');
 eventUrl(null,{replace:true});history.replaceState(history.state,'','#/events');
 $('#app').classList.remove('preview-open');$('#app').innerHTML='<main class="loading"><span class="brand">BidZizi</span><p>Signing out…</p></main>';
 try{await api('/api/session/logout','POST',{});if(!current(ticket))return;session={authenticated:false,testMode:true};showAuth();}
 catch{if(current(ticket))$('#app').innerHTML='<main class="loading"><span class="brand">BidZizi</span><h1>Sign-out not confirmed</h1><p>Retry to finish signing out.</p><button class="btn" data-action="signout">Retry sign out</button></main>';}
}
function showAuth(message=''){
 $('#app').classList.remove('preview-open');$('#app').innerHTML=`<main class="auth sheet"><span class="brand">BidZizi</span><p class="eyebrow" style="margin-top:26px">Staging test sign-in</p><h1>Choose a test account</h1><p>These are seeded test accounts. No SMS is sent and no phone number is verified.</p><label for="test-account">Test account</label><select id="test-account" ${session?.testMode===false?'disabled':''}><option value="staff-saturn">Saturn staff</option><option value="staff-pine">Pine Street staff</option><option value="bidder-juniper">Juniper bidder</option><option value="bidder-harbor">Harbor bidder</option></select><button class="btn primary" data-action="test-signin" ${session?.testMode===false?'disabled':''}>Sign in</button><div id="auth-error" role="alert">${esc(message||(session?.testMode===false?'Test sign-in is unavailable here.':''))}</div></main>`;
}
async function signIn(){
 const button=$('[data-action="test-signin"]'),account=$('#test-account').value,ticket=++contextEpoch;
 button.disabled=true;$('#auth-error').textContent='';
 try{const response=await api('/api/test-auth/login','POST',{account});if(!current(ticket))return;session=response;await loadWorkspace(ticket);}
 catch(e){if(current(ticket)&&$('#auth-error'))$('#auth-error').textContent=e.message||'Sign-in could not be confirmed. Try again.';}
 finally{if(current(ticket)&&button.isConnected)button.disabled=false;}
}
async function loadWorkspace(ticket=contextEpoch){
 if(!current(ticket))return;d=null;confirmed=null;dirty=false;attempt=null;saveState='saved';loadingDraft=false;
 const actor=session;
 if(!actor.authenticated)return showAuth();
 if(!actor.staffOrganizations.length){$('#app').classList.remove('preview-open');$('#app').innerHTML=`<main class="auth sheet"><span class="brand">BidZizi</span><h1>No staff access</h1><p>${esc(actor.person.name)} is a test bidder account. It cannot view or edit staff drafts.</p><button class="btn" data-action="signout">Switch test account</button></main>`;return;}
 const packet=await api('/api/admin/events');if(!current(ticket))return;eventList=packet.events;
 const requested=requestedEvent(),match=eventList.find(e=>e.id===requested);loadedOrgId=match?.organizationId||actor.staffOrganizations[0].id;
 if(match)await loadEvent(match.id,ticket,requestedTab());else{await showEventsHome({reload:false,replace:true,check:false});if(requested){homeNotice='This event is unavailable for this staff account.';renderEventsHome();}}
}
async function boot(){
 const ticket=++contextEpoch;
 try{const response=await api('/api/session');if(!current(ticket))return;session=response;await loadWorkspace(ticket);}
 catch{if(current(ticket))$('#app').innerHTML='<main class="loading"><span class="brand">BidZizi</span><h1>Events unavailable</h1><p>Events could not be loaded. Try again when the connection returns.</p><button class="btn" data-action="retry-load">Retry</button></main>';}
}
document.addEventListener('click',ev=>{
 const tab=ev.target.closest('a[data-tab]');if(tab&&d&&ev.button===0&&!ev.metaKey&&!ev.ctrlKey&&!ev.shiftKey&&!ev.altKey){ev.preventDefault();navigate(tab.dataset.tab);return;}
 const mode=ev.target.closest('[data-preview-mode]');if(mode){previewMode=mode.dataset.previewMode;refreshChrome();postPreview();return;}
 const el=ev.target.closest('[data-action]');if(!el||el.disabled||el.dataset.action==='select-all')return;
 const ticket=contextEpoch;Promise.resolve(actions[el.dataset.action]?.(el)).catch(()=>{if(current(ticket))toast('The request could not be completed. Try again.');});
});
document.addEventListener('input',ev=>{
 const el=ev.target;
 if(el.id==='new-event-name'){if(el.value.trim()){el.removeAttribute('aria-invalid');$('#new-event-error').textContent='';}return;}
 if(!d)return;
 if(el.id==='lot-search'){search=el.value;renderInventory();return;}
 if(el.dataset.window){windowDraft[el.dataset.window]=el.value;return;}
 if(!editable())return;
 if(el.dataset.sponsor!==undefined){d.event.sponsors[+el.dataset.sponsor].name=el.value;markDirty();return;}
 if(el.dataset.sponsorAlt!==undefined){d.event.sponsors[+el.dataset.sponsorAlt].alt=el.value;markDirty();return;}
 if(el.dataset.event){const name=el.dataset.event;if(name==='sponsorsEnabled')return;
  if(name.startsWith('timing.'))d.event.timing[name.slice(7)]=el.value;
  else d.event[name]=name==='increment'?cents(el.value):el.value;
  if(name==='increment'){d.event.incrementText=el.value;if(!String(el.value).trim()||(cents(el.value)!==null&&cents(el.value)<=1_000_000_000))amountErrors.delete('increment');}
  markDirty();renderInventory();return;}
 if(el.dataset.lot){const l=chosen(),name=el.dataset.lot;if(!l)return;
  l[name]=['opening','fixedRaiseMinor'].includes(name)?(el.value.trim()?cents(el.value):null):name==='includes'?el.value.split('\n').filter(x=>x.trim()):el.value;
  if(name==='opening'){l.openingText=el.value;if(!String(el.value).trim()||(cents(el.value)!==null&&cents(el.value)<=1_000_000_000))amountErrors.delete(l.id);}
  if(name==='fixedRaiseMinor'){l.fixedRaiseText=el.value;if(!String(el.value).trim()||(cents(el.value)!==null&&cents(el.value)>0&&cents(el.value)<=1_000_000_000))amountErrors.delete(l.id+':raise');}
  markDirty();renderInventory();}
});
document.addEventListener('change',ev=>{
 const el=ev.target;if(!d)return;
 if(el.dataset.upload){uploadFile(el);return;}
 if(el.dataset.lotSelect){el.checked?selected.add(el.dataset.lotSelect):selected.delete(el.dataset.lotSelect);renderInventory();return;}
 if(el.id==='select-all'){selected=el.checked?new Set(d.lots.map(l=>l.id)):new Set();renderInventory();return;}
 if(el.dataset.event==='sponsorsEnabled'&&editable()){d.event.sponsorsEnabled=el.checked;markDirty();$('#sponsor-fields').innerHTML=sponsorFields();}
});
window.addEventListener('hashchange',()=>{if(!d)return;if(location.hash==='#/events'){if(!canLeaveDraft()){retainEditorRoute();return;}showEventsHome();return;}renderMain();refresh();eventUrl(d.event.id,{replace:true});if(nextFieldFocus){focusEditorField(nextFieldFocus);nextFieldFocus=null;}else if(!dialog.open)$('#workspace').focus({preventScroll:true});});
try{routeHost().addEventListener('popstate',async()=>{
 if(!session?.authenticated||!session.staffOrganizations.length)return;
 const id=requestedEvent(),route=requestedTab();
 if(id===d?.event.id){replaceEditorRoute(route.tab,route.lot);renderMain();refresh();return;}
 if(!canLeaveDraft()){retainEditorRoute();return;}
 if(!id)return showEventsHome({route:false});
 const ticket=++contextEpoch;
 try{const packet=await api('/api/admin/events');if(!current(ticket))return;eventList=packet.events;const match=eventList.find(e=>e.id===id);if(!match){await showEventsHome({reload:false,replace:true,check:false});homeNotice='This event is unavailable for this staff account.';renderEventsHome();return;}loadedOrgId=match.organizationId;await loadEvent(id,ticket,route);}
 catch{if(current(ticket)){if(d)toast('Could not load the event. Try again.');else{homeNotice='Events could not be loaded. Try again.';homeLoading=false;renderEventsHome();}}}
 });}catch{}
window.addEventListener('message',ev=>{if(ev.origin===location.origin&&ev.source===$('#bidder-frame')?.contentWindow&&ev.data?.type==='staff-preview-ready')postPreview();});
window.addEventListener('beforeunload',ev=>{if(dirty||attempt||approvalAttempt||entryAttempt){ev.preventDefault();ev.returnValue='';}});
dialog.addEventListener('cancel',ev=>{if(creating||createAttempt||approving){ev.preventDefault();toast('Retry the pending creation before closing.');}});
dialog.addEventListener('close',restoreModalFocus);
boot();
