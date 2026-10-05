import { clone, esc, money, cents, eventIssues, lotIssues, releaseIssues, windowFor, dateText, timeText, shortZone } from './model.js';

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
const current=ticket=>ticket===contextEpoch;
const chosen=()=>d?.lots.find(l=>l.id===picked);
const assigned=()=>d.lots.filter(l=>l.windowId);
const rawAmount=(v,raw)=>raw ?? (v===null?'':String(v/100));
const activeTab=()=>location.hash.startsWith('#/lots')?'lots':'event';
const img=path=>'/staging-bidder-preview/'+path;
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
 const event=Object.fromEntries(['name','eyebrow','welcome','venue','cover','date','start','end','timezone','increment','sponsorsEnabled','sponsors'].map(k=>[k,clone(packet.event[k])]));
 const lots=packet.lots.map(l=>Object.fromEntries(['id','title','short','description','category','image','alt','opening','includes','fine','windowId'].map(k=>[k,clone(l[k])])));
 return {event,lots};
}
function adopt(packet,preserveUi=false){
 if(confirmed?.event.id!==packet.event.id)resetCatalog();
 confirmed=clone(packet);d=clone(packet);dirty=false;saveState='saved';attempt=null;notice='';
 picked=d.lots.some(l=>l.id===picked)?picked:d.lots[0]?.id;selected=preserveUi?new Set([...selected].filter(id=>d.lots.some(l=>l.id===id))):new Set();if(!preserveUi)search='';loadedOrgId=d.org.id;
 const current=eventList.find(x=>x.id===d.event.id);
 if(current)Object.assign(current,{name:d.event.name,revision:d.revision,savedAt:d.savedAt});
 else eventList.unshift({id:d.event.id,organizationId:d.org.id,name:d.event.name,revision:d.revision,savedAt:d.savedAt});
}
function markDirty(){dirty=true;if(!['uncertain','conflict','saving','blocked'].includes(saveState)){saveState='dirty';notice='';}refreshChrome();renderNotice();refreshNotes();postPreview();}
async function saveDraft(){
 if(saving||loadingDraft||approving||approvalAttempt||saveState==='conflict'||!d)return false;
 const ticket=contextEpoch;
 if(!dirty&&!attempt)return true;
 if(!attempt){
  const fields=[{raw:d.event.incrementText,label:'Bid increment'},...d.lots.map(l=>({raw:l.openingText,label:`Lot ${l.number} opening bid`}))];
  const invalid=fields.find(f=>f.raw!==undefined&&String(f.raw).trim()&&(cents(f.raw)===null||cents(f.raw)>1_000_000_000));
  if(invalid){notice=invalid.label+': enter an amount with at most two decimal places, or clear it.';saveState='dirty';refreshChrome();renderNotice();return false;}
 }
 if(!attempt)attempt={requestId:crypto.randomUUID(),expectedRevision:confirmed.revision,draft:compact(d)};
 saving=true;saveState='saving';refreshChrome();
 try{
  const response=await api('/api/admin/events/'+d.event.id,'PUT',attempt);
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
 if(!d||!$('#event-title'))return;
 $('#event-title').textContent=d.event.name||'Untitled event';$('#org-name').textContent=d.org.name;$('#org-mark').textContent=d.org.initials;$('#lot-count').textContent=d.lots.length;
 $('#release-status').innerHTML='<i></i>Working draft';
 $('#event-meta').textContent=`${dateText(d.event.date)} · ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}`;
 const status={saved:'Saved',dirty:'Unsaved edits',saving:'Saving…',uncertain:'Save not confirmed',conflict:'Save conflict',blocked:'Save blocked'};
 $('#saved').textContent=loadingDraft?'Loading draft…':status[saveState];$('#saved').classList.toggle('error',['uncertain','conflict','blocked'].includes(saveState));
 const save=$('#save-draft');save.textContent=saveState==='uncertain'?'Retry save':'Save draft';save.disabled=saving||loadingDraft||approving||!!approvalAttempt||['conflict','blocked'].includes(saveState)||(!dirty&&!attempt);
 document.querySelectorAll('.tabs a').forEach(a=>{const on=a.dataset.tab===activeTab();a.classList.toggle('active',on);on?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});
 $('#preview-toggle').textContent=previewOpen?'Hide preview':'Bidder preview';$('#preview-toggle').setAttribute('aria-pressed',String(previewOpen));$('#workspace').classList.toggle('no-preview',!previewOpen);$('#app').classList.toggle('preview-open',previewOpen);
 $('#preview-mode-label').textContent=previewMode==='saved'?`Saved draft · revision ${confirmed.revision}`:dirty?'Working draft · unsaved edits':'Working draft · no unsaved edits';
 document.querySelectorAll('[data-preview-mode]').forEach(b=>{const on=b.dataset.previewMode===previewMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 const locked=loadingDraft||approving||!!approvalAttempt||['saving','uncertain','blocked'].includes(saveState);
 document.querySelectorAll('[data-event],[data-lot],[data-sponsor]').forEach(el=>el.disabled=locked);
 document.querySelectorAll('[data-action="add-lot"],[data-action="move-up"],[data-action="move-down"],[data-action="image"],[data-action="clear-image"],[data-action="assign-window"],[data-action="apply-window"],[data-action="add-sponsor"],[data-action="remove-sponsor"]').forEach(el=>el.disabled=locked);
 document.querySelectorAll('[data-action="events"],[data-action="organizations"],[data-action="new-event"],[data-action="reload-draft"],[data-action="confirm-reload"]').forEach(el=>el.disabled=loadingDraft||approving||!!approvalAttempt);
 refreshCatalogControls();
 for(const [action,delta] of [['move-up',-1],['move-down',1]]){const el=document.querySelector(`[data-action="${action}"]`);if(el){const i=d.lots.findIndex(l=>l.id===picked);el.disabled=locked||i+delta<0||i+delta>=d.lots.length;}}
}
function postPreview(path){
 const frame=$('#bidder-frame');if(!frame||!d)return;
 const packet=previewMode==='saved'?confirmed:d;
 frame.contentWindow?.postMessage({type:'staff-draft-preview',payload:{org:packet.org,event:packet.event,lots:packet.lots,now:Date.now(),phase:'draft',visible:true,mode:previewMode,revision:confirmed.revision},path},location.origin);
}
function refreshNotes(){
 const errors=$('#event-errors');if(errors)errors.innerHTML=eventIssues(d.event).map(t=>`<p class="note error">${esc(t)}</p>`).join('');
 const lotErrors=$('#lot-errors');if(lotErrors&&chosen())lotErrors.innerHTML=lotIssues(chosen(),d.event).map(t=>`<p class="note error">Add ${esc(t)} for the catalog.</p>`).join('');
 const band=$('.schedule-band');if(band){const n=assigned().length;band.innerHTML=`<div><strong>${timeText(d.event.start)} <span class="muted">→</span> ${timeText(d.event.end)} ${shortZone(d.event)}</strong><p>${n} ${n===1?'lot uses':'lots use'} this draft window. Changes apply to all assigned lots.</p></div><span class="tick" aria-hidden="true">◷</span>`;}
}
function refresh(){refreshChrome();renderInventory();refreshNotes();postPreview();}
function navigate(tab,id){if(id)picked=id;const hash=tab==='lots'?`#/lots/${picked||''}`:'#/event';if(location.hash===hash){renderMain();refresh();}else location.hash=hash;}
function closeModal(force=false){if(!force&&approving){toast('Wait for the approval request to finish.');return;}if(!force&&(creating||createAttempt)){toast('Retry the pending creation before closing.');return;}dialog.close();returnFocus?.focus?.();}
function openModal(title,body,footer='',subtitle=''){
 returnFocus=document.activeElement;dialog.innerHTML=`<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;dialog.showModal();dialog.querySelector('input,button,select')?.focus();
}
function draftNotice(){return `<div id="draft-notice" class="draft-notice ${notice?'error':''}" ${notice?'role="alert"':''}><p>${esc(notice||(catalogApproval?'Working draft. Changes do not alter the approved catalog.':'Working draft. Save changes before approving a catalog.'))}</p>${saveState==='conflict'?'<button class="btn small" data-action="reload-draft">Reload saved draft</button>':saveState==='blocked'?'<button class="btn small" data-action="signout">Sign in again</button>':''}</div>`;}
function renderNotice(){const el=$('#draft-notice');if(el)el.outerHTML=draftNotice();}
function shell(){
 $('#app').innerHTML=`<header class="top"><div class="top-left"><span class="brand">BidZizi</span><span class="top-divider"></span><button class="org-btn" data-action="organizations" aria-label="Choose organization"><span class="org-mark" id="org-mark"></span><span class="org-name" id="org-name"></span><span class="chev">⌄</span></button></div><div class="top-right"><span class="proto-pill">Staging test</span><span class="role">${esc(session.person.name)}</span><button class="link-btn" data-action="signout">Sign out</button></div></header>
 <div class="bar"><div class="bar-line"><div><button class="event-picker" data-action="events">Event studio <span>⌄</span></button><h1 id="event-title"></h1><div class="bar-sub"><span id="release-status" class="status"></span><span id="catalog-approval" class="status" role="status" aria-live="polite"></span><span id="event-meta"></span></div></div><div class="bar-actions"><button class="btn" id="preview-toggle" data-action="toggle-preview">Bidder preview</button><button class="btn primary save-action" id="save-draft" data-action="save-draft">Save draft</button><button class="btn dark" id="review-catalog" data-action="review">Review catalog</button></div></div>
 <nav class="tabs" aria-label="Event workspace"><a href="#/event" data-tab="event">Event</a><a href="#/lots" data-tab="lots">Lots <span class="count" id="lot-count"></span></a><div class="saved" id="saved" role="status" aria-live="polite"></div></nav></div>
 <main class="workspace" id="workspace" tabindex="-1"><div class="main" id="main"></div><aside class="preview" aria-label="Interactive bidder preview"><div class="preview-head"><h2>Bidder preview</h2><button class="preview-close" data-action="toggle-preview" aria-label="Close bidder preview">×</button></div><div class="preview-controls"><button data-preview-mode="working">Working draft</button><button data-preview-mode="saved" class="active">Saved draft</button></div><div class="device"><iframe id="bidder-frame" title="Interactive bidder preview" src="/staging-bidder-preview/index.html#/"></iframe></div><nav class="preview-route" aria-label="Preview screens"><button data-action="preview-route" data-path="/">Welcome</button><button data-action="preview-route" data-path="/lots">Catalog</button><button data-action="preview-lot">Selected lot</button></nav><p class="preview-caption" id="preview-mode-label"></p></aside></main>
 <footer class="simulation"><span><strong>Staging</strong> · Test accounts and example items. Bidding is not enabled.</span><span>Event and lot drafts save to the server.</span></footer>`;
 $('#bidder-frame').addEventListener('load',()=>postPreview());
}

function eventView(){
 const e=d.event,w=assigned().length;
 return `${draftNotice()}${catalogSummary()}<div class="intro"><div><p class="eyebrow">Event setup</p><h2>Event details</h2><p>Edit the event information and check the bidder preview.</p></div></div>
 <section class="sheet"><div class="sheet-head"><h3>Welcome page</h3><span class="section-label">Welcome</span></div><div class="cover-grid"><div><div class="cover">${e.cover?`<img src="${esc(img(e.cover))}" alt="Event cover">`:'<div class="no-cover">Add an event photo</div>'}<button data-action="image" data-target="event">Change photo</button></div><p class="cover-note">Example photos.</p></div><div class="field-stack"><label>Event name<input class="name-input" data-event="name" value="${esc(e.name)}" maxlength="120"></label><label>Welcome line<input data-event="eyebrow" value="${esc(e.eyebrow)}" maxlength="120"></label><label>Location or event note<input data-event="venue" value="${esc(e.venue)}" maxlength="180"></label></div></div><label class="event-story">Welcome message<textarea aria-label="Welcome message" data-event="welcome" rows="3" maxlength="1800">${esc(e.welcome)}</textarea></label><div class="help">Items are provided by your organization. Add event sponsors below.</div></section>
 <section class="sheet"><div class="sheet-head"><h3>Bidding schedule</h3><span class="section-label">Timing</span></div><div class="schedule-band"><div><strong>${timeText(e.start)} <span class="muted">→</span> ${timeText(e.end)} ${shortZone(e)}</strong><p>${w} ${w===1?'lot uses':'lots use'} this window. ${w?'Changing it updates all of them in this draft.':'Assign lots together from the Lots tab.'}</p></div><span class="tick" aria-hidden="true">◷</span></div><div class="field-grid three"><label>Event date<input type="date" data-event="date" value="${esc(e.date)}"></label><label>Bidding opens<input type="time" data-event="start" value="${esc(e.start)}"></label><label>Bidding closes<input type="time" data-event="end" value="${esc(e.end)}"></label></div><div class="field-grid" style="margin-top:16px"><label>Event time zone<select aria-label="Event time zone" data-event="timezone">${zones(e.timezone)}</select></label><label>Bid increment · example USD<input inputmode="decimal" data-event="increment" value="${esc(rawAmount(e.increment,e.incrementText))}"></label></div><p class="note">The approved catalog appears at its opening time. Saving draft changes does not change an approved window. Bidding is disabled in this staging slice.</p><div id="event-errors"></div></section>
 <section class="sheet"><div class="sheet-head"><h3>Event sponsors</h3><span class="section-label">Optional</span></div><label class="switch-label"><input type="checkbox" data-event="sponsorsEnabled" ${e.sponsorsEnabled?'checked':''}>Show event sponsors</label><p class="help">Separate from the organization providing auction items.</p><div id="sponsor-fields">${sponsorFields()}</div></section>`;
}
function zones(current){const choices=[['UTC','UTC'],['America/Los_Angeles','Pacific · Los Angeles'],['America/Denver','Mountain · Denver'],['America/Chicago','Central · Chicago'],['America/New_York','Eastern · New York']];if(current&&!choices.some(([v])=>v===current))choices.unshift([current,current]);return choices.map(([v,t])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(t)}</option>`).join('');}
function sponsorFields(){return d.event.sponsorsEnabled?`${d.event.sponsors.map((s,i)=>`<label class="sponsor-row">Sponsor ${i+1}<input data-sponsor="${i}" maxlength="200" value="${esc(s.name)}" placeholder="Organization or business name"><button class="btn small" data-action="remove-sponsor" data-index="${i}" aria-label="Remove sponsor ${i+1}">×</button></label>`).join('')}<button class="link-btn" data-action="add-sponsor">+ Add event sponsor</button>`:'';}
function selectionBar(){return selected.size?`<div class="selection"><strong>${selected.size} ${selected.size===1?'lot':'lots'} selected</strong><div class="flex"><button data-action="clear-selection" style="color:inherit;font-size:12px">Clear</button><button class="btn small" data-action="assign-window">Assign auction window →</button></div></div>`:'';}
function lotsView(){
 if(!d.lots.length)return `${draftNotice()}${catalogSummary()}<div class="intro"><div><p class="eyebrow">Auction catalog</p><h2>Lots</h2></div></div><div class="empty-state"><h3>No lots yet</h3><p>Add a lot to start building the catalog.</p><button class="btn primary" data-action="add-lot">Add lot</button></div>`;
 return `${draftNotice()}${catalogSummary()}<div class="intro"><div><p class="eyebrow">Auction catalog</p><h2>Lots</h2><p>Edit lots and assign their bidding schedule.</p></div><button class="btn" data-action="add-lot">+ Add lot</button></div><div id="selection-bar">${selectionBar()}</div><div class="lot-work"><section class="inventory" aria-label="Catalog lots"><div class="inventory-head"><label class="flex" style="gap:8px"><input id="select-all" type="checkbox" data-action="select-all" ${selected.size===d.lots.length?'checked':''}>Select all</label><span>${d.lots.length} lots</span></div><div class="inventory-search"><label class="sr" for="lot-search">Search your lots</label><input id="lot-search" type="search" placeholder="Find a lot…" value="${esc(search)}"></div><div id="lot-list"></div></section><div class="editor" id="editor">${editorView()}</div></div>`;
}
function renderInventory(){
 const list=$('#lot-list');if(!list)return;

 const matches=d.lots.filter(l=>`${l.title} ${l.number} ${l.category}`.toLowerCase().includes(search.toLowerCase()));
 list.innerHTML=matches.length?matches.map(l=>{
  const issues=lotIssues(l,d.event);const label=issues.length?`Needs ${issues[0]}`:l.windowId?'Draft window assigned':'Ready · no window';
  return `<div class="lot-row ${l.id===picked?'active':''}" data-id="${esc(l.id)}"><label class="sr" for="pick-${esc(l.id)}">Select lot ${l.number}</label><input id="pick-${esc(l.id)}" type="checkbox" data-lot-select="${esc(l.id)}" ${selected.has(l.id)?'checked':''}><button data-action="edit-lot" data-id="${esc(l.id)}" aria-label="Edit lot ${l.number}: ${esc(l.title||'Untitled lot')}">${l.image?`<img class="lot-thumb" src="${esc(img(l.image))}" alt="">`:`<span class="lot-thumb empty">${l.number}</span>`}<span><span class="lot-number">Lot ${l.number}</span><span class="title">${esc(l.title||'Untitled lot')}</span><span class="meta ${issues.length?'warn':''}">${esc(label)}</span></span></button></div>`;
 }).join(''):'<p class="help" style="padding:18px">No matching lots. Try another search.</p>';
 $('#selection-bar').innerHTML=selectionBar();
 $('#select-all').checked=selected.size===d.lots.length;
 $('#select-all').indeterminate=selected.size>0&&selected.size<d.lots.length;
 refreshCatalogControls();
}
function editorView(){
 const l=chosen();if(!l)return '';
 const cats=[...new Set([...d.lots.map(x=>x.category),'Getaways','Food & drink','For the team','Good things'])];
 return `<section class="sheet" aria-label="Lot editor"><div class="sheet-head"><h3>Lot ${l.number}</h3><button class="link-btn" data-action="preview-lot">View in preview ↗</button></div><div class="editor-photo">${l.image?`<img src="${esc(img(l.image))}" alt="${esc(l.alt)}">`:'<div class="empty">+</div>'}<div><p class="provider"><span class="org-mark">${esc(d.org.initials)}</span>Provided by ${esc(d.org.name)}</p><button class="link-btn" data-action="image" data-target="lot">${l.image?'Change':'Add'} photo</button>${l.image?'<button class="link-btn" data-action="clear-image" style="margin-left:12px;color:var(--muted)">Remove</button>':''}</div></div>
 <div class="field-stack"><label>Lot title<input data-lot="title" class="name-input" value="${esc(l.title)}" maxlength="200"></label><label>Short description<input data-lot="short" value="${esc(l.short)}" maxlength="180" placeholder="Brief summary shown in the catalog"></label><label>Description<textarea aria-label="Description" data-lot="description" rows="5" maxlength="4500" placeholder="Item details, condition, and restrictions">${esc(l.description)}</textarea></label><div class="field-grid"><label>Category<input data-lot="category" value="${esc(l.category)}" maxlength="100" list="category-options"><datalist id="category-options">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label>Opening bid · example USD<input data-lot="opening" inputmode="decimal" value="${esc(rawAmount(l.opening,l.openingText))}"></label></div></div>
 <p class="help">Bid increment: ${d.event.increment?money(d.event.increment):'not set'} · shared across this event. <button class="link-btn" style="font-size:11px;min-height:24px" data-action="edit-event">Edit event defaults</button></p><div id="lot-errors"></div>
 <details class="disclosure"><summary>What’s included & details</summary><div class="field-stack"><label>Included · one per line<textarea aria-label="Included · one per line" data-lot="includes" rows="3">${esc(l.includes.join('\n'))}</textarea></label><label>Important details<textarea aria-label="Important details" data-lot="fine" rows="3" maxlength="5000">${esc(l.fine)}</textarea></label>${l.image?`<label>Photo description<input data-lot="alt" value="${esc(l.alt)}" maxlength="180"></label>`:''}</div></details>
 <div class="note">${l.windowId?`Uses the event window: ${dateText(d.event.date)}, ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}.`:'No auction window yet. Select this lot and assign a window with other lots.'}</div><div class="lot-footer"><div class="order-controls"><button data-action="move-up" aria-label="Move lot earlier" ${d.lots.indexOf(l)===0?'disabled':''}>↑</button><button data-action="move-down" aria-label="Move lot later" ${d.lots.indexOf(l)===d.lots.length-1?'disabled':''}>↓</button></div><small>Catalog order · ${d.lots.indexOf(l)+1} of ${d.lots.length}</small></div></section>`;
}
function renderMain(){
 const route=location.hash.match(/^#\/lots\/([^?]+)/);if(route&&d.lots.some(l=>l.id===route[1]))picked=route[1];
 if(!chosen())picked=d.lots[0]?.id;
 $('#main').innerHTML=activeTab()==='lots'?lotsView():eventView();
 renderInventory();
}

function canLeaveDraft(){
 if(approving||approvalAttempt){toast('Retry or finish the approval before switching events.');return false;}
 if(loadingDraft){toast('Wait for the draft to load.');return false;}
 if(dirty||attempt||saving){toast('Save or reload this draft before switching events.');return false;}
 return true;
}
async function loadEvent(id,ticket=contextEpoch){
 if(!current(ticket))return false;loadingDraft=true;refreshChrome();
 try{
  const packet=await api('/api/admin/events/'+encodeURIComponent(id));
  if(!current(ticket))return false;
  adopt(packet.draft);shell();renderMain();refresh();
  await loadApproval(id,ticket);
  try{const target=window.parent===window?window:window.parent;const url=new URL(target.location.href);url.searchParams.set('event',d.event.id);target.history.replaceState(target.history.state,'',url);}catch{}
  return true;
 }finally{if(current(ticket)){loadingDraft=false;refreshChrome();}}
}
async function organizations(){
 openModal('Choose organization',session.staffOrganizations.map(o=>`<button class="modal-choice" data-action="switch-org" data-id="${esc(o.id)}"><span class="org-mark">${esc(o.initials)}</span><span><strong>${esc(o.name)}</strong><small>${o.id===loadedOrgId?'Current workspace':'Staff access'}</small></span></button>`).join(''));
}
async function events(){
 const ticket=contextEpoch;
 try{const packet=await api('/api/admin/events');if(!current(ticket))return;eventList=packet.events;
  const choices=eventList.filter(e=>e.organizationId===loadedOrgId);
  openModal('Choose event',choices.length?choices.map(e=>`<button class="modal-choice" data-action="switch-event" data-id="${esc(e.id)}"><span><strong>${esc(e.name||'Untitled event')}</strong><small>Revision ${e.revision}</small></span></button>`).join(''):'<p>No events yet.</p>','<span></span><button class="btn primary" data-action="new-event">+ Create an event</button>',esc(session.staffOrganizations.find(o=>o.id===loadedOrgId)?.name||''));
 }catch{if(current(ticket))toast('Could not load the event list. Try again.');}
}
function emptyWorkspace(){
 $('#app').classList.remove('preview-open');const org=session.staffOrganizations.find(o=>o.id===loadedOrgId);
 $('#app').innerHTML=`<header class="top"><span class="brand">BidZizi</span><div class="top-right"><span class="proto-pill">Staging test</span><span class="role">${esc(session.person.name)}</span><button class="link-btn" data-action="signout">Sign out</button></div></header><main id="workspace" class="empty-workspace"><p class="eyebrow">${esc(org?.name||'Staff workspace')}</p><h1>No events yet</h1><p>Create an event to begin.</p><button class="btn primary" data-action="new-event" style="margin-top:20px">Create event</button></main>`;
}
function newEvent(){
 if(d&&!canLeaveDraft())return;
 contextEpoch++;
 createAttempt=null;
 openModal('Create event','<label>Event name<input id="new-event-name" placeholder="Event name" maxlength="120"></label><p class="note">The new event starts with an empty catalog.</p><div id="new-event-error" role="alert"></div>','<button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="create-event">Create event</button>');
}
async function createEvent(){
 if(creating)return;
 const ticket=contextEpoch;
 const field=$('#new-event-name');const name=field.value.trim();
 if(!name){$('#new-event-error').textContent='Give the event a name.';return;}
 if(!createAttempt)createAttempt={organizationId:loadedOrgId,name,requestId:crypto.randomUUID()};
 creating=true;field.disabled=true;const button=dialog.querySelector('[data-action="create-event"]');button.disabled=true;dialog.querySelectorAll('[data-action="close-modal"]').forEach(el=>el.disabled=true);
 try{
  const response=await api('/api/admin/events','POST',createAttempt);if(!current(ticket))return;createAttempt=null;adopt(response.draft);closeModal(true);location.hash='#/event';shell();renderMain();refresh();await loadApproval(d.event.id,ticket);
  try{const target=window.parent===window?window:window.parent;const url=new URL(target.location.href);url.searchParams.set('event',d.event.id);target.history.replaceState(target.history.state,'',url);}catch{}
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
}
function catalogSummary(){
 if(catalogApproval){const a=catalogApproval;return `<section class="catalog-summary" aria-label="Approved catalog"><div><strong>Approved catalog</strong><p>${esc(a.snapshot.event.name)} · saved revision ${a.sourceRevision} · ${a.snapshot.lots.length} lots</p><p>${dateText(a.local.date)} · ${timeText(a.local.start)}–${timeText(a.local.end)} ${esc(a.local.timezone)}</p></div><details><summary>View approved lots</summary><ol>${a.snapshot.lots.map(l=>`<li>Lot ${esc(l.number)} · ${esc(l.title)}</li>`).join('')}</ol><p>This saved copy and window are fixed. Draft edits remain separate.</p></details></section>`;}
 if(approvalState==='uncertain')return `<section class="catalog-summary error" role="alert"><div><strong>Approval not confirmed</strong><p>The server may have approved it. Retry the same request to check its result.</p></div><button class="btn" data-action="retry-approval" ${approving?'disabled':''}>Retry approval</button></section>`;
 if(approvalNotice)return `<section class="catalog-summary error" role="alert"><p>${esc(approvalNotice)}</p>${approvalState==='conflict'?'<button class="btn small" data-action="reload-draft">Reload saved draft</button>':approvalState==='unavailable'?'<button class="btn small" data-action="refresh-approval">Retry approval status</button>':''}</section>`;
 return '';
}
function renderCatalogSummary(){const main=$('#main');if(!main)return;main.querySelector('.catalog-summary')?.remove();const note=$('#draft-notice');if(note)note.insertAdjacentHTML('afterend',catalogSummary());refreshCatalogControls();}
async function loadApproval(id,ticket=contextEpoch){
 const read=++approvalReadEpoch;approvalLoading=true;approvalState='loading';refreshCatalogControls();
 try{const response=await api('/api/admin/events/'+encodeURIComponent(id)+'/catalog-approval');if(!current(ticket)||read!==approvalReadEpoch||d?.event.id!==id)return;
  const approved=confirmedApproval(response,id);catalogApproval=approved?clone(approved):null;approvalState=catalogApproval?'approved':'none';approvalNotice='';approvalAttempt=null;reviewedCatalog=null;
 }catch(e){if(!current(ticket)||read!==approvalReadEpoch||d?.event.id!==id)return;
  catalogApproval=null;approvalState=[401,403].includes(e.status)?'blocked':'unavailable';approvalNotice=[401,403].includes(e.status)?'Approval access is unavailable. Sign in again.':'Approval status could not be loaded. Drafts can still be edited and saved.';
 }finally{if(current(ticket)&&read===approvalReadEpoch){approvalLoading=false;renderCatalogSummary();refreshChrome();}}
}
function review(){
 if(!canReviewCatalog())return;
 const packet=confirmed,lots=packet.lots.filter(l=>selected.has(l.id));
 const issues=[...eventIssues(packet.event),...lots.flatMap(l=>[...lotIssues(l,packet.event).map(x=>`Lot ${l.number}: add ${x}.`),...(l.windowId!=='main'?[`Lot ${l.number}: assign the auction window.`]:[])])];
 reviewedCatalog={eventId:packet.event.id,revision:packet.revision,lotIds:lots.map(l=>l.id)};
 openModal('Review catalog',`<div class="review-summary"><strong>${lots.length} selected saved ${lots.length===1?'lot':'lots'}</strong><p>Revision ${packet.revision} · ${dateText(packet.event.date)}</p><p>${timeText(packet.event.start)}–${timeText(packet.event.end)} ${esc(packet.event.timezone)}</p></div><ul class="catalog-review-lots">${lots.map(l=>`<li><span>Lot ${esc(l.number)}</span><strong>${esc(l.title)}</strong></li>`).join('')}</ul>${issues.length?`<ul class="checks">${issues.map(x=>`<li><span class="bad">!</span><span>${esc(x)}</span></li>`).join('')}</ul>`:''}<p class="note">Approval fixes this saved copy and shared window. The catalog appears at opening and stays read-only after closing. Bidding is not enabled.</p>`,'<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="approve-catalog" '+(issues.length?'disabled':'')+'>Approve catalog</button>');
}
async function approveCatalog(){
 if(approving||loadingDraft||!d||catalogApproval)return;
 if(!approvalAttempt){if(!reviewedCatalog||dirty||attempt||reviewedCatalog.eventId!==d.event.id||reviewedCatalog.revision!==confirmed.revision)return;approvalAttempt={expectedRevision:reviewedCatalog.revision,requestId:crypto.randomUUID(),lotIds:[...reviewedCatalog.lotIds]};}
 const ticket=contextEpoch,id=d.event.id;approving=true;approvalState='sending';approvalNotice='';refreshChrome();renderCatalogSummary();
 try{const response=await api('/api/admin/events/'+encodeURIComponent(id)+'/catalog-approval','POST',approvalAttempt);if(!current(ticket)||d?.event.id!==id)return;
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
function imagePicker(target){
 imageTarget=target;openModal('Choose photo',`<div class="image-grid">${photos.map(([id,name])=>`<button data-action="choose-image" data-image="assets/lots/${id}.jpg"><img src="/staging-bidder-preview/assets/lots/${id}.jpg" alt="${name}"><span>${name}</span></button>`).join('')}</div><p class="help">Example images for staging. Uploads are not enabled.</p>`);
}
function applyImage(path){if(imageTarget==='event')d.event.cover=path;else{chosen().image=path;chosen().alt=chosen().alt||'Auction item photo';}markDirty();closeModal();renderMain();refresh();}
function renumber(){d.lots.forEach((l,i)=>l.number=String(i+1).padStart(2,'0'));}
function move(delta){if(!editable())return;const i=d.lots.findIndex(l=>l.id===picked),to=i+delta;if(to<0||to>=d.lots.length)return;[d.lots[i],d.lots[to]]=[d.lots[to],d.lots[i]];renumber();markDirty();renderMain();refresh();}
const editable=()=>!loadingDraft&&!approving&&!approvalAttempt&&!['saving','uncertain','blocked'].includes(saveState);
const actions={
 'close-modal':()=>closeModal(),
 'save-draft':saveDraft,
 'toggle-preview':()=>{previewOpen=!previewOpen;refreshChrome();postPreview();},
 'preview-route':el=>{previewOpen=true;refreshChrome();postPreview(el.dataset.path);},
 'preview-lot':()=>{previewOpen=true;refreshChrome();postPreview(chosen()?'/lot/'+picked:'/lots');},
 'edit-event':()=>navigate('event'),
 'edit-lot':el=>{navigate('lots',el.dataset.id);postPreview('/lot/'+el.dataset.id);},
 'clear-selection':()=>{selected.clear();renderInventory();},
 'assign-window':()=>{if(editable())assignWindow();},
 'apply-window':()=>{if(!editable())return;const w=windowFor(windowDraft);if(w.start===null||w.end===null||w.end<=w.start){$('#window-error').innerHTML='<p class="note error">Choose valid times, with closing after opening.</p>';return;}Object.assign(d.event,windowDraft);d.lots.forEach(l=>{if(selected.has(l.id))l.windowId='main';});markDirty();closeModal();selected.clear();renderMain();refresh();toast('Draft window assigned. Save the draft to keep it.');},
 'review':review,
 'approve-catalog':approveCatalog,'retry-approval':approveCatalog,'refresh-approval':()=>loadApproval(d.event.id),
 'fix-issue':el=>{closeModal();navigate(el.dataset.id?'lots':'event',el.dataset.id);if(el.dataset.id)postPreview('/lot/'+el.dataset.id);},
 'reload-draft':()=>{openModal('Reload saved draft?','<p>Your current edits will be replaced with the latest saved version.</p>','<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="confirm-reload">Reload saved draft</button>');},
 'confirm-reload':async()=>{const id=d.event.id,ticket=++contextEpoch;try{await loadEvent(id,ticket);if(current(ticket))closeModal();}catch{if(current(ticket))toast('Could not reload the saved draft. Your edits are still here.');}},
 'add-lot':()=>{if(!editable())return;const id=crypto.randomUUID();d.lots.push({id,number:String(d.lots.length+1).padStart(2,'0'),title:'',short:'',category:'',provider:d.org.name,logo:'saturn',image:null,alt:'',opening:null,count:0,current:0,history:[],description:'',includes:[],fine:'',windowId:null});markDirty();navigate('lots',id);refresh();requestAnimationFrame(()=>$('[data-lot="title"]')?.focus());},
 'move-up':()=>move(-1),'move-down':()=>move(1),
 'image':el=>{if(editable())imagePicker(el.dataset.target);},
 'choose-image':el=>{if(editable())applyImage(el.dataset.image);},
 'clear-image':()=>{if(!editable())return;chosen().image=null;markDirty();renderMain();refresh();},
 'add-sponsor':()=>{if(!editable())return;d.event.sponsors.push({name:'',logo:['cedar','coffee','table','earth'][d.event.sponsors.length%4]});markDirty();$('#sponsor-fields').innerHTML=sponsorFields();},
 'remove-sponsor':el=>{if(!editable())return;d.event.sponsors.splice(+el.dataset.index,1);markDirty();$('#sponsor-fields').innerHTML=sponsorFields();},
 'organizations':organizations,'events':events,'new-event':()=>{if(!canLeaveDraft())return;closeModal();newEvent();},
 'switch-org':async el=>{
  if(!canLeaveDraft())return;const orgId=el.dataset.id;if(!session.staffOrganizations.some(o=>o.id===orgId))return;const ticket=++contextEpoch;
  try{const packet=await api('/api/admin/events');if(!current(ticket))return;eventList=packet.events;loadedOrgId=orgId;d=null;confirmed=null;closeModal();const first=eventList.find(e=>e.organizationId===orgId);if(first)await loadEvent(first.id,ticket);else emptyWorkspace();}
  catch{if(current(ticket))toast('Could not load the organization workspace. Try again.');}
 },
 'switch-event':async el=>{
  if(d?.event.id===el.dataset.id)return closeModal();if(!canLeaveDraft())return;const id=el.dataset.id,ticket=++contextEpoch;
  try{await loadEvent(id,ticket);if(current(ticket))closeModal();}catch{if(current(ticket))toast('Could not load the event. Try again.');}
 },
 'create-event':createEvent,
 'signout':async()=>{
  if(saving||creating||approving)return toast('Wait for the current request to finish.');
  if((dirty||approvalAttempt)&&saveState!=='blocked'){openModal('Sign out?',approvalAttempt?'<p>The approval has not been confirmed. The server may have approved it. Signing out discards local recovery information.</p>':saveState==='uncertain'?'<p>The save has not been confirmed. The server may have saved it. Signing out discards your local edits.</p>':'<p>Your unsaved edits will be discarded.</p>','<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="confirm-signout">Sign out</button>');return;}
  await signOut();
 },
 'confirm-signout':signOut,
 'retry-load':()=>boot(),
 'test-signin':signIn,
};
async function signOut(){
 if(saving||creating||approving)return toast('Wait for the current request to finish.');
 const ticket=++contextEpoch;
 // Invalidate old operations and remove private content before the network wait.
 resetCatalog();d=null;confirmed=null;session=null;eventList=[];attempt=null;createAttempt=null;dirty=false;notice='';saving=false;creating=false;loadingDraft=false;selected.clear();picked=null;search='';loadedOrgId=null;previewMode='saved';
 if(dialog.open)dialog.close();dialog.replaceChildren();returnFocus=null;clearTimeout(toastTimer);$('#toast').textContent='';$('#toast').classList.remove('on');
 try{const target=parent===window?window:parent;const url=new URL(target.location.href);url.searchParams.delete('event');target.history.replaceState(target.history.state,'',url);}catch{}
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
 let requested;try{requested=new URL((parent===window?window:parent).location.href).searchParams.get('event');}catch{}
 const match=eventList.find(e=>e.id===requested)||eventList[0];loadedOrgId=match?.organizationId||actor.staffOrganizations[0].id;
 if(match)await loadEvent(match.id,ticket);else emptyWorkspace();
}
async function boot(){
 const ticket=++contextEpoch;
 try{const response=await api('/api/session');if(!current(ticket))return;session=response;await loadWorkspace(ticket);}
 catch{if(current(ticket))$('#app').innerHTML='<main class="loading"><span class="brand">BidZizi</span><h1>Workspace unavailable</h1><p>The workspace could not be loaded. Try again when the connection returns.</p><button class="btn" data-action="retry-load">Retry</button></main>';}
}
document.addEventListener('click',ev=>{
 const mode=ev.target.closest('[data-preview-mode]');if(mode){previewMode=mode.dataset.previewMode;refreshChrome();postPreview();return;}
 const el=ev.target.closest('[data-action]');if(!el||el.disabled||el.dataset.action==='select-all')return;
 const ticket=contextEpoch;Promise.resolve(actions[el.dataset.action]?.(el)).catch(()=>{if(current(ticket))toast('The request could not be completed. Try again.');});
});
document.addEventListener('input',ev=>{
 const el=ev.target;if(!d)return;
 if(el.id==='lot-search'){search=el.value;renderInventory();return;}
 if(el.dataset.window){windowDraft[el.dataset.window]=el.value;return;}
 if(!editable())return;
 if(el.dataset.sponsor!==undefined){d.event.sponsors[+el.dataset.sponsor].name=el.value;markDirty();return;}
 if(el.dataset.event){const name=el.dataset.event;if(name==='sponsorsEnabled')return;d.event[name]=name==='increment'?cents(el.value):el.value;if(name==='increment')d.event.incrementText=el.value;markDirty();renderInventory();return;}
 if(el.dataset.lot){const l=chosen(),name=el.dataset.lot;if(!l)return;l[name]=name==='opening'?cents(el.value):name==='includes'?el.value.split('\n').filter(x=>x.trim()):el.value;if(name==='opening')l.openingText=el.value;markDirty();renderInventory();}
});
document.addEventListener('change',ev=>{
 const el=ev.target;if(!d)return;
 if(el.dataset.lotSelect){el.checked?selected.add(el.dataset.lotSelect):selected.delete(el.dataset.lotSelect);renderInventory();return;}
 if(el.id==='select-all'){selected=el.checked?new Set(d.lots.map(l=>l.id)):new Set();renderInventory();return;}
 if(el.dataset.event==='sponsorsEnabled'&&editable()){d.event.sponsorsEnabled=el.checked;markDirty();$('#sponsor-fields').innerHTML=sponsorFields();}
});
window.addEventListener('hashchange',()=>{if(!d)return;renderMain();refresh();$('#workspace').focus({preventScroll:true});});
window.addEventListener('message',ev=>{if(ev.origin===location.origin&&ev.source===$('#bidder-frame')?.contentWindow&&ev.data?.type==='staff-preview-ready')postPreview();});
window.addEventListener('beforeunload',ev=>{if(dirty||attempt||approvalAttempt){ev.preventDefault();ev.returnValue='';}});
dialog.addEventListener('cancel',ev=>{if(creating||createAttempt||approving){ev.preventDefault();toast('Retry the pending creation before closing.');}else returnFocus?.focus?.();});
boot();
