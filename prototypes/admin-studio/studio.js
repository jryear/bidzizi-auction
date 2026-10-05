import { fresh, clone, STORAGE_KEY, esc, money, cents, eventIssues, lotIssues, releaseIssues, makeRelease, audiencePayload, statusAt, clockAt, windowFor, dateText, timeText, shortZone } from './model.js';

const $=(s)=>document.querySelector(s);
const dialog=$('#modal');
let library={}, d, saveError=false, failNextSave=false, returnFocus=null, toastTimer;
try { const packet=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); library=packet?.drafts||JSON.parse(localStorage.getItem(STORAGE_KEY+'.drafts')||'{}'); const key=packet?.current||localStorage.getItem(STORAGE_KEY+'.current'); d=library[key]; } catch { saveError=true; }
if(!d?.version) d=fresh();
let picked=d.lots[0]?.id, selected=new Set(), search='', stage='before', previewMode='draft';
let previewOpen=innerWidth>1060;
try { stage=sessionStorage.getItem('studio.clock')||'before'; } catch {}
const keyOf=()=>`${d.org.id}/${d.event.id}`;
try { const ui=JSON.parse(sessionStorage.getItem('studio.ui.'+keyOf())||'null'); if(ui){search=ui.search||'';selected=new Set((ui.selected||[]).filter(id=>d.lots.some(l=>l.id===id)));if(d.lots.some(l=>l.id===ui.picked))picked=ui.picked;} }catch{}
const img=(path)=>path?.startsWith('data:image/')?path:'bidder/'+path;
const phase=()=>statusAt(d.release,clockAt(d.release?.event||d.event,stage));
const assigned=()=>d.lots.filter(l=>l.windowId);
const chosen=()=>d.lots.find(l=>l.id===picked);
const rawAmount=(v,raw)=>raw ?? (v===null?'':String(v/100));
const activeTab=()=>location.hash.startsWith('#/lots')?'lots':'event';
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('on');toastTimer=setTimeout(()=>$('#toast').classList.remove('on'),4000);}
function save(){
 const before=d.savedAt;
 try{
  if(failNextSave){failNextSave=false;throw new Error('Simulated interruption');}
  d.savedAt=new Date().toISOString();
  const next={...library,[keyOf()]:clone(d)};
  localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,current:keyOf(),drafts:next}));
  library=next;saveError=false;
 }catch{d.savedAt=before;saveError=true;}
 refreshChrome();
 return !saveError;
}
function refreshChrome(){
 $('#event-title').textContent=d.event.name||'Untitled event';
 $('#org-name').textContent=d.org.name;$('#org-mark').textContent=d.org.initials;
 $('#lot-count').textContent=d.lots.length;
 const p=phase(), labels={draft:'Working draft',scheduled:'Scheduled',open:'Bidding open',closed:'Bidding closed'};
 $('#release-status').className='status'+(p==='open'?' green':p==='scheduled'?' amber':'');
 $('#release-status').innerHTML=`<i></i>${labels[p]}`;
 $('#event-meta').textContent=`${dateText(d.event.date)} · ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}`;
 const saved=$('#saved');saved.classList.toggle('error',saveError);
 saved.innerHTML=saveError?`Unsaved edits <button class="link-btn" data-action="retry-save">Retry save</button>`:d.savedAt?'✓ Saved on this device':'Example draft';
 $('#review-count').textContent=releaseIssues(d).length ? ` · ${releaseIssues(d).length} to check` : '';
 document.querySelectorAll('.tabs a').forEach(a=>{const active=a.dataset.tab===activeTab();a.classList.toggle('active',active);active?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});
 $('#preview-toggle').setAttribute('aria-pressed',String(previewOpen));
 $('#preview-toggle').textContent=previewOpen?'Hide preview':'Bidder preview';
 $('#workspace').classList.toggle('no-preview',!previewOpen);
 $('#app').classList.toggle('preview-open',previewOpen);
 $('#preview-mode-label').textContent=previewMode==='draft'?'Draft · staff view':'Audience · scheduled copy';
 document.querySelectorAll('[data-preview-mode]').forEach(b=>b.classList.toggle('active',b.dataset.previewMode===previewMode));
}
function postPreview(path){
 const frame=$('#bidder-frame');
 frame?.contentWindow?.postMessage({type:'studio-draft',payload:audiencePayload(d,stage,previewMode),path},location.origin);
}
function refreshNotes(){
 const errors=$('#event-errors');if(errors)errors.innerHTML=eventIssues(d.event).map(t=>`<p class="note error">${esc(t)}</p>`).join('');
 const lotErrors=$('#lot-errors');if(lotErrors&&chosen())lotErrors.innerHTML=lotIssues(chosen(),d.event).map(t=>`<p class="note error">Add ${esc(t)} before scheduling.</p>`).join('');
 const band=$('.schedule-band');if(band){const w=assigned().length;band.innerHTML=`<div><strong>${timeText(d.event.start)} <span class="muted">→</span> ${timeText(d.event.end)} ${shortZone(d.event)}</strong><p>${w} ${w===1?'lot uses':'lots use'} this window. ${w?'Changing it updates all of them in this draft.':'Assign lots together from the Lots tab.'}</p></div><span class="tick" aria-hidden="true">◷</span>`;}
}
function refresh(){refreshChrome();renderInventory();refreshNotes();postPreview();}
function navigate(tab,id){
 if(id)picked=id;
 const hash=tab==='lots'?`#/lots/${picked||''}`:'#/event';
 if(location.hash===hash){renderMain();refresh();}else location.hash=hash;
}
function closeModal(){dialog.close();returnFocus?.focus?.();}
function openModal(title,body,footer='',subtitle=''){
 returnFocus=document.activeElement;
 dialog.innerHTML=`<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
 dialog.showModal();
 dialog.querySelector('input,button,select')?.focus();
}
function shell(){
 $('#app').innerHTML=`<header class="top"><div class="top-left"><span class="brand">BidZizi</span><span class="top-divider"></span><button class="org-btn" data-action="organizations" aria-label="Choose organization"><span class="org-mark" id="org-mark"></span><span class="org-name" id="org-name"></span><span class="chev">⌄</span></button></div><div class="top-right"><span class="proto-pill">Interactive prototype</span><span class="role">Organization staff</span><span class="person" aria-label="Fictional staff account">JC</span></div></header>
 <div class="bar"><div class="bar-line"><div><button class="event-picker" data-action="events">Event studio <span>⌄</span></button><h1 id="event-title"></h1><div class="bar-sub"><span id="release-status" class="status"></span><span id="event-meta"></span></div></div><div class="bar-actions"><button class="btn" id="preview-toggle" data-action="toggle-preview">Bidder preview</button><button class="btn primary" data-action="review">Review schedule <span id="review-count"></span><span aria-hidden="true">→</span></button></div></div>
 <nav class="tabs" aria-label="Event workspace"><a href="#/event" data-tab="event">Event</a><a href="#/lots" data-tab="lots">Lots <span class="count" id="lot-count"></span></a><div class="saved" id="saved" aria-live="polite"></div></nav></div>
 <main class="workspace" id="workspace" tabindex="-1"><div class="main" id="main"></div><aside class="preview" aria-label="Interactive bidder preview"><div class="preview-head"><h2>Bidder preview</h2><button class="preview-close" data-action="toggle-preview" aria-label="Close bidder preview">×</button></div><div class="preview-controls"><button data-preview-mode="draft" class="active">Working draft</button><button data-preview-mode="audience">Audience view</button></div><div class="device"><iframe id="bidder-frame" title="Interactive bidder preview" src="bidder/index.html#/event"></iframe></div><nav class="preview-route" aria-label="Preview screens"><button data-action="preview-route" data-path="/">Welcome</button><button data-action="preview-route" data-path="/lots">Catalog</button><button data-action="preview-lot">Selected lot</button></nav><p class="preview-caption" id="preview-mode-label"></p></aside></main>
 <footer class="simulation"><span><strong>Prototype</strong> · Fictional content. Saves on this device. No live auction.</span><label class="clock" for="clock">Preview clock <select id="clock"><option value="before">Before opening</option><option value="open">During bidding</option><option value="closed">After closing</option></select></label><details class="sim-tools"><summary>Simulation tools</summary><div><p>Browser-local simulations only.</p><button data-action="fail-save">Interrupt the next save</button><button data-action="reset">Reset this example draft</button><a href="README.md" target="_blank">Scope & provenance</a></div></details></footer>`;
 $('#clock').value=stage;
 $('#bidder-frame').addEventListener('load',()=>postPreview());
}
function releaseNote(){return d.release?`<div class="release-note"><span aria-hidden="true">◷</span><span>A scheduled copy is preserved. Working edits only reach bidders after another schedule review.</span></div>`:'';}
function eventView(){
 const e=d.event,w=assigned().length;
 return `${releaseNote()}<div class="intro"><div><p class="eyebrow">Event setup</p><h2>Event details</h2><p>Edit the event information and check the bidder preview.</p></div></div>
 <section class="sheet"><div class="sheet-head"><h3>Welcome page</h3><span class="section-label">Welcome</span></div><div class="cover-grid"><div><div class="cover">${e.cover?`<img src="${esc(img(e.cover))}" alt="Event cover">`:'<div class="no-cover">Add an event photo</div>'}<button data-action="image" data-target="event">Change photo</button></div><p class="cover-note">Example photos.</p></div><div class="field-stack"><label>Event name<input class="name-input" data-event="name" value="${esc(e.name)}" maxlength="120"></label><label>Welcome line<input data-event="eyebrow" value="${esc(e.eyebrow)}" maxlength="120"></label><label>Location or event note<input data-event="venue" value="${esc(e.venue)}" maxlength="180"></label></div></div><label class="event-story">Welcome message<textarea data-event="welcome" rows="3" maxlength="1800">${esc(e.welcome)}</textarea></label><div class="help">Items are provided by your organization. Add event sponsors below.</div></section>
 <section class="sheet"><div class="sheet-head"><h3>Bidding schedule</h3><span class="section-label">Timing</span></div><div class="schedule-band"><div><strong>${timeText(e.start)} <span class="muted">→</span> ${timeText(e.end)} ${shortZone(e)}</strong><p>${w} ${w===1?'lot uses':'lots use'} this window. ${w?'Changing it updates all of them in this draft.':'Assign lots together from the Lots tab.'}</p></div><span class="tick" aria-hidden="true">◷</span></div><div class="field-grid three"><label>Event date<input type="date" data-event="date" value="${esc(e.date)}"></label><label>Bidding opens<input type="time" data-event="start" value="${esc(e.start)}"></label><label>Bidding closes<input type="time" data-event="end" value="${esc(e.end)}"></label></div><div class="field-grid" style="margin-top:16px"><label>Event time zone<select data-event="timezone">${zones(e.timezone)}</select></label><label>Bid increment · example USD<input inputmode="decimal" data-event="increment" value="${esc(rawAmount(e.increment,e.incrementText))}"></label></div><p class="note">The catalog appears when bidding opens. Lots open and close on this schedule automatically. You approve the scheduled copy after reviewing it.</p><div id="event-errors"></div></section>
 <section class="sheet"><div class="sheet-head"><h3>Event sponsors</h3><span class="section-label">Optional</span></div><label class="switch-label"><input type="checkbox" data-event="sponsorsEnabled" ${e.sponsorsEnabled?'checked':''}>Show event sponsors</label><p class="help">Separate from the organization providing auction items.</p><div id="sponsor-fields">${sponsorFields()}</div></section>`;
}
function zones(current){return [['America/Los_Angeles','Pacific · Los Angeles'],['America/Denver','Mountain · Denver'],['America/Chicago','Central · Chicago'],['America/New_York','Eastern · New York']].map(([v,t])=>`<option value="${v}" ${v===current?'selected':''}>${t}</option>`).join('');}
function sponsorFields(){return d.event.sponsorsEnabled?`${d.event.sponsors.map((s,i)=>`<label class="sponsor-row">Sponsor ${i+1}<input data-sponsor="${i}" value="${esc(s.name)}" placeholder="Organization or business name"><button class="btn small" data-action="remove-sponsor" data-index="${i}" aria-label="Remove sponsor ${i+1}">×</button></label>`).join('')}<button class="link-btn" data-action="add-sponsor">+ Add event sponsor</button>`:'';}
function selectionBar(){return selected.size?`<div class="selection"><strong>${selected.size} ${selected.size===1?'lot':'lots'} selected</strong><div class="flex"><button data-action="clear-selection" style="color:inherit;font-size:12px">Clear</button><button class="btn small" data-action="assign-window">Assign auction window →</button></div></div>`:'';}
function lotsView(){
 if(!d.lots.length)return `${releaseNote()}<div class="intro"><div><p class="eyebrow">Auction catalog</p><h2>Lots</h2></div></div><div class="empty-state"><h3>No lots yet</h3><p>Add a lot to start building the catalog.</p><button class="btn primary" data-action="add-lot">Add lot</button></div>`;
 return `${releaseNote()}<div class="intro"><div><p class="eyebrow">Auction catalog</p><h2>Lots</h2><p>Edit lots and assign their bidding schedule.</p></div><button class="btn" data-action="add-lot">+ Add lot</button></div><div id="selection-bar">${selectionBar()}</div><div class="lot-work"><section class="inventory" aria-label="Catalog lots"><div class="inventory-head"><label class="flex" style="gap:8px"><input id="select-all" type="checkbox" data-action="select-all" ${selected.size===d.lots.length?'checked':''}>Select all</label><span>${d.lots.length} lots</span></div><div class="inventory-search"><label class="sr" for="lot-search">Search your lots</label><input id="lot-search" type="search" placeholder="Find a lot…" value="${esc(search)}"></div><div id="lot-list"></div></section><div class="editor" id="editor">${editorView()}</div></div>`;
}
function renderInventory(){
 const list=$('#lot-list');if(!list)return;
 try{sessionStorage.setItem('studio.ui.'+keyOf(),JSON.stringify({search,selected:[...selected],picked}));}catch{}
 const matches=d.lots.filter(l=>`${l.title} ${l.number} ${l.category}`.toLowerCase().includes(search.toLowerCase()));
 list.innerHTML=matches.length?matches.map(l=>{
  const issues=lotIssues(l,d.event);const label=issues.length?`Needs ${issues[0]}`:l.windowId?'Window assigned':'Ready · no window';
  return `<div class="lot-row ${l.id===picked?'active':''}" data-id="${l.id}"><label class="sr" for="pick-${l.id}">Select lot ${l.number}</label><input id="pick-${l.id}" type="checkbox" data-lot-select="${l.id}" ${selected.has(l.id)?'checked':''}><button data-action="edit-lot" data-id="${l.id}" aria-label="Edit lot ${l.number}: ${esc(l.title||'Untitled lot')}">${l.image?`<img class="lot-thumb" src="${esc(img(l.image))}" alt="">`:`<span class="lot-thumb empty">${l.number}</span>`}<span><span class="lot-number">Lot ${l.number}</span><span class="title">${esc(l.title||'Untitled lot')}</span><span class="meta ${issues.length?'warn':''}">${esc(label)}</span></span></button></div>`;
 }).join(''):'<p class="help" style="padding:18px">No matching lots. Try another search.</p>';
 $('#selection-bar').innerHTML=selectionBar();
 $('#select-all').checked=selected.size===d.lots.length;
 $('#select-all').indeterminate=selected.size>0&&selected.size<d.lots.length;
}
function editorView(){
 const l=chosen();if(!l)return '';
 const cats=[...new Set([...d.lots.map(x=>x.category),'Getaways','Food & drink','For the team','Good things'])];
 return `<section class="sheet" aria-label="Lot editor"><div class="sheet-head"><h3>Lot ${l.number}</h3><button class="link-btn" data-action="preview-lot">View in preview ↗</button></div><div class="editor-photo">${l.image?`<img src="${esc(img(l.image))}" alt="${esc(l.alt)}">`:'<div class="empty">+</div>'}<div><p class="provider"><span class="org-mark">${d.org.initials}</span>Provided by ${esc(d.org.name)}</p><button class="link-btn" data-action="image" data-target="lot">${l.image?'Change':'Add'} photo</button>${l.image?'<button class="link-btn" data-action="clear-image" style="margin-left:12px;color:var(--muted)">Remove</button>':''}</div></div>
 <div class="field-stack"><label>Lot title<input data-lot="title" class="name-input" value="${esc(l.title)}" maxlength="260"></label><label>Short description<input data-lot="short" value="${esc(l.short)}" maxlength="180" placeholder="Brief summary shown in the catalog"></label><label>Description<textarea data-lot="description" rows="5" maxlength="4500" placeholder="Item details, condition, and restrictions">${esc(l.description)}</textarea></label><div class="field-grid"><label>Category<select data-lot="category">${cats.map(c=>`<option ${c===l.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>Opening bid · example USD<input data-lot="opening" inputmode="decimal" value="${esc(rawAmount(l.opening,l.openingText))}"></label></div></div>
 <p class="help">Bid increment: ${d.event.increment?money(d.event.increment):'not set'} · shared across this event. <button class="link-btn" style="font-size:11px;min-height:24px" data-action="edit-event">Edit event defaults</button></p><div id="lot-errors"></div>
 <details class="disclosure"><summary>What’s included & details</summary><div class="field-stack"><label>Included · one per line<textarea data-lot="includes" rows="3">${esc(l.includes.join('\n'))}</textarea></label><label>Important details<textarea data-lot="fine" rows="3">${esc(l.fine)}</textarea></label>${l.image?`<label>Photo description<input data-lot="alt" value="${esc(l.alt)}" maxlength="180"></label>`:''}</div></details>
 <div class="note">${l.windowId?`Uses the event window: ${dateText(d.event.date)}, ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}.`:'No auction window yet. Select this lot and assign a window with other lots.'}</div><div class="lot-footer"><div class="order-controls"><button data-action="move-up" aria-label="Move lot earlier" ${d.lots.indexOf(l)===0?'disabled':''}>↑</button><button data-action="move-down" aria-label="Move lot later" ${d.lots.indexOf(l)===d.lots.length-1?'disabled':''}>↓</button></div><small>Catalog order · ${d.lots.indexOf(l)+1} of ${d.lots.length}</small></div></section>`;
}
function renderMain(){
 const route=location.hash.match(/^#\/lots\/([^?]+)/);if(route&&d.lots.some(l=>l.id===route[1]))picked=route[1];
 if(!chosen())picked=d.lots[0]?.id;
 $('#main').innerHTML=activeTab()==='lots'?lotsView():eventView();
 renderInventory();
}
function review(){
 const issues=releaseIssues(d),scheduled=assigned(),notScheduled=d.lots.length-scheduled.length;
 const body=`<div class="review-summary"><strong>${scheduled.length} ${scheduled.length===1?'lot':'lots'} assigned to the event window.</strong><p>${dateText(d.event.date)} · ${timeText(d.event.start)}–${timeText(d.event.end)} ${shortZone(d.event)}</p><p>${esc(d.org.name)} → ${esc(d.event.name||'Untitled event')}</p></div>
 <ul class="checks"><li><span class="ok">✓</span><span>Catalog stays hidden until bidding opens.</span></li><li><span class="ok">✓</span><span>Assigned lots open and close together automatically.</span></li><li><span class="ok">✓</span><span>${notScheduled} unassigned ${notScheduled===1?'lot stays':'lots stay'} in the working draft.</span></li>${issues.map(x=>`<li><span class="bad">!</span><span>${esc(x.message)}</span><button data-action="fix-issue" ${x.lotId?`data-id="${x.lotId}"`:''}>Fix</button></li>`).join('')}</ul>
 ${!issues.length?`<ul class="review-lots">${scheduled.map(l=>`<li>Lot ${l.number} · ${esc(l.title)} <span class="muted">· opens at ${money(l.opening)}</span></li>`).join('')}</ul>`:''}
 ${phase()==='open'||phase()==='closed'?'<p class="note error">This scheduled copy has already opened in the simulation. Return the preview clock to Before opening to try a new release.</p>':''}<p class="note">Prototype only. This saves a separate catalog snapshot on this device. No real auction is published.</p><div id="schedule-error"></div>`;
 openModal('Review schedule',body,`<button class="btn" data-action="close-modal">Keep editing</button><button class="btn primary" data-action="confirm-release" ${issues.length||['open','closed'].includes(phase())?'disabled':''}>Schedule catalog →</button>`,'Check the selected lots and bidding times.');
}
let windowDraft;
function assignWindow(){
 windowDraft={date:d.event.date,start:d.event.start,end:d.event.end,timezone:d.event.timezone};
 openModal('Assign auction window',`<p class="muted" style="margin-bottom:20px">${selected.size} selected ${selected.size===1?'lot will':'lots will'} use the same opening and closing time.</p><div class="field-stack"><label>Date<input type="date" data-window="date" value="${d.event.date}"></label><div class="field-grid"><label>Opens<input type="time" data-window="start" value="${d.event.start}"></label><label>Closes<input type="time" data-window="end" value="${d.event.end}"></label></div><label>Time zone<select data-window="timezone">${zones(d.event.timezone)}</select></label></div><p class="note">This is the event’s shared window. ${assigned().length} already assigned lots will also use any updated times. Unassigned lots remain drafts.</p><div id="window-error"></div>`,`<small>Nothing becomes visible until you review and schedule the catalog.</small><button class="btn primary" data-action="apply-window">Assign to ${selected.size} lots</button>`);
}
const photos=[['cabin','Cabin'],['coffee','Coffee'],['dinner','Dinner'],['ceramics','Ceramics'],['bicycle','Bicycle'],['flowers','Flowers']];
let imageTarget='event';
function imagePicker(target){
 imageTarget=target;
 openModal('Choose photo',`<div class="image-grid">${photos.map(([id,name])=>`<button data-action="choose-image" data-image="assets/lots/${id}.jpg"><img src="bidder/assets/lots/${id}.jpg" alt="${name}"><span>${name}</span></button>`).join('')}</div><label class="upload">Or choose your own image<input id="image-upload" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="help">Kept on this device. JPG, PNG or WebP, up to 1 MB.</p><div id="image-error"></div>`);
}
function applyImage(path){
 if(imageTarget==='event')d.event.cover=path;else{chosen().image=path;chosen().alt=chosen().alt||'Auction item photo';}
 save();closeModal();renderMain();refresh();
}
function organizations(){
 openModal('Choose organization',[['org-saturn','Saturn Barter','SB'],['org-pine','Pine Street Exchange','PE']].map(([id,name,initials])=>`<button class="modal-choice" data-action="switch-org" data-id="${id}" data-name="${name}" data-initials="${initials}"><span class="org-mark">${initials}</span><span><strong>${name}</strong><small>${id===d.org.id?'Current workspace':'Fictional example workspace'}</small></span></button>`).join('')+'<p class="note">This demonstrates organization context with separate local drafts. It does not implement staff permissions or organization onboarding.</p>');
}
function events(){
 const choices=Object.values(library).filter(x=>x.org.id===d.org.id);
 if(!choices.some(x=>x.event.id===d.event.id))choices.unshift(d);
 openModal('Choose event',choices.map(x=>`<button class="modal-choice" data-action="switch-event" data-id="${x.event.id}"><span class="org-mark">${x.lots.length}</span><span><strong>${esc(x.event.name||'Untitled event')}</strong><small>${dateText(x.event.date)} · ${x.lots.length} lots</small></span></button>`).join(''),'<span></span><button class="btn primary" data-action="new-event">+ Create an event</button>',esc(d.org.name));
}
function newEvent(){openModal('Create event',`<label>Event name<input id="new-event-name" placeholder="Event name" maxlength="120"></label><p class="note">A new local draft for ${esc(d.org.name)}. Your other event stays available in Event studio.</p><div id="new-event-error"></div>`,'<button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="create-event">Create event</button>');}
function renumber(){d.lots.forEach((l,i)=>l.number=String(i+1).padStart(2,'0'));}
const actions={
 'close-modal':closeModal,
 'toggle-preview':()=>{previewOpen=!previewOpen;refreshChrome();postPreview();},
 'preview-route':(el)=>{previewOpen=true;refreshChrome();postPreview(el.dataset.path);},
 'preview-lot':()=>{previewOpen=true;refreshChrome();postPreview(chosen()?'/lot/'+picked:'/lots');},
 'edit-event':()=>navigate('event'),
 'edit-lot':(el)=>{navigate('lots',el.dataset.id);postPreview('/lot/'+el.dataset.id);},
 'clear-selection':()=>{selected.clear();renderInventory();},
 'assign-window':assignWindow,
 'apply-window':()=>{const w=windowFor(windowDraft);if(w.start===null||w.end===null||w.end<=w.start){$('#window-error').innerHTML='<p class="note error" role="alert">Choose valid times, with closing after opening.</p>';return;}Object.assign(d.event,windowDraft);d.lots.forEach(l=>{if(selected.has(l.id))l.windowId='main';});save();closeModal();selected.clear();renderMain();refresh();toast('Auction window assigned to the selected lots.');},
 'review':review,
 'fix-issue':(el)=>{closeModal();navigate(el.dataset.id?'lots':'event',el.dataset.id);if(el.dataset.id)postPreview('/lot/'+el.dataset.id);},
 'confirm-release':()=>{const result=makeRelease(d);if(!result.ok)return review();if(['open','closed'].includes(phase()))return;const previous=d.release;d.release=result.release;if(!save()){d.release=previous;$('#schedule-error').innerHTML='<p class="note error" role="alert">The schedule wasn’t saved. Your working draft is still here. Try Schedule catalog again.</p>';refresh();return;}closeModal();refresh();renderMain();toast('Catalog scheduled on this device. Hidden until opening.');},
 'retry-save':()=>{if(save())toast('Draft saved on this device.');refresh();},
 'fail-save':()=>{failNextSave=true;toast('The next save will be interrupted.');},
 'reset':()=>{openModal('Reset this example?',`<p>Replace this local event draft with its starting fixtures. Other events and A’s source are preserved.</p>`,'<button class="btn" data-action="close-modal">Keep working</button><button class="btn dark" data-action="confirm-reset">Reset example</button>');},
 'confirm-reset':()=>{const org=clone(d.org),id=d.event.id;d=fresh();d.org=org;d.event.id=id;d.event.orgId=org.id;d.lots.forEach(l=>l.provider=org.name);picked=d.lots[0].id;selected.clear();stage='before';try{sessionStorage.setItem('studio.clock',stage);}catch{}$('#clock').value=stage;save();closeModal();navigate('event');refresh();},
 'add-lot':()=>{const id='lot-'+crypto.randomUUID().slice(0,8);d.lots.push({id,number:String(d.lots.length+1).padStart(2,'0'),title:'',short:'',category:'Good things',provider:d.org.name,sponsor:d.org.name,logo:'saturn',image:null,alt:'',opening:5000,count:0,current:0,history:[],description:'',includes:[],fine:'',windowId:null});save();navigate('lots',id);refresh();requestAnimationFrame(()=>$('[data-lot="title"]')?.focus());},
 'move-up':()=>move(-1),'move-down':()=>move(1),
 'image':(el)=>imagePicker(el.dataset.target),
 'choose-image':(el)=>applyImage(el.dataset.image),
 'clear-image':()=>{chosen().image=null;save();renderMain();refresh();},
 'add-sponsor':()=>{d.event.sponsors.push({name:'',logo:['cedar','coffee','table','earth'][d.event.sponsors.length%4]});save();$('#sponsor-fields').innerHTML=sponsorFields();postPreview();},
 'remove-sponsor':(el)=>{d.event.sponsors.splice(+el.dataset.index,1);save();$('#sponsor-fields').innerHTML=sponsorFields();postPreview();},
 'organizations':organizations,'events':events,'new-event':()=>{closeModal();newEvent();},
 'switch-org':(el)=>{if(!save())return toast('Save your working draft before switching organizations.');const existing=Object.values(library).find(x=>x.org.id===el.dataset.id);if(existing)d=clone(existing);else{d=fresh();d.org={id:el.dataset.id,name:el.dataset.name,initials:el.dataset.initials};d.event={...d.event,id:'evt-pine',orgId:d.org.id,name:'Community Auction',welcome:'Browse auction items provided by Pine Street Exchange.'};d.lots=[];d.release=null;}picked=d.lots[0]?.id;selected.clear();save();closeModal();navigate('event');refresh();},
 'switch-event':(el)=>{if(el.dataset.id===d.event.id)return closeModal();if(!save())return toast('Save your working draft before switching events.');d=clone(library[`${d.org.id}/${el.dataset.id}`]);picked=d.lots[0]?.id;selected.clear();closeModal();save();navigate('event');refresh();},
 'create-event':()=>{const name=$('#new-event-name').value.trim();if(!name){$('#new-event-error').innerHTML='<p class="note error">Give your event a name.</p>';return;}if(!save())return toast('Save your working draft first.');const org=clone(d.org);d=fresh();d.org=org;d.event.id='evt-'+crypto.randomUUID().slice(0,8);d.event.orgId=org.id;d.event.name=name;d.event.welcome=`Welcome to ${name}, hosted by ${org.name}.`;d.lots=[];d.release=null;picked=undefined;selected.clear();save();closeModal();navigate('event');refresh();},
};
function move(delta){const i=d.lots.findIndex(l=>l.id===picked),to=i+delta;if(to<0||to>=d.lots.length)return;[d.lots[i],d.lots[to]]=[d.lots[to],d.lots[i]];renumber();save();renderMain();refresh();}
document.addEventListener('click',ev=>{
 const mode=ev.target.closest('[data-preview-mode]');if(mode){previewMode=mode.dataset.previewMode;refreshChrome();postPreview();return;}
 const el=ev.target.closest('[data-action]');if(el&&el.dataset.action!=='select-all')actions[el.dataset.action]?.(el);
});
document.addEventListener('input',ev=>{
 const el=ev.target;
 if(el.id==='lot-search'){search=el.value;renderInventory();return;}
 if(el.dataset.window){windowDraft[el.dataset.window]=el.value;return;}
 if(el.dataset.sponsor!==undefined){d.event.sponsors[+el.dataset.sponsor].name=el.value;save();postPreview();return;}
 if(el.dataset.event){const name=el.dataset.event;if(name==='sponsorsEnabled')return;d.event[name]=name==='increment'?cents(el.value):el.value;if(name==='increment')d.event.incrementText=el.value;save();postPreview();renderInventory();refreshNotes();return;}
 if(el.dataset.lot){const name=el.dataset.lot,l=chosen();if(!l)return;l[name]=name==='opening'?cents(el.value):name==='includes'?el.value.split('\n').filter(s=>s.trim()):el.value;if(name==='opening')l.openingText=el.value;save();renderInventory();refreshNotes();postPreview();}
});
document.addEventListener('change',ev=>{
 const el=ev.target;
 if(el.id==='clock'){stage=el.value;try{sessionStorage.setItem('studio.clock',stage);}catch{}refresh();return;}
 if(el.dataset.lotSelect){el.checked?selected.add(el.dataset.lotSelect):selected.delete(el.dataset.lotSelect);renderInventory();return;}
 if(el.id==='select-all'){selected=el.checked?new Set(d.lots.map(l=>l.id)):new Set();renderInventory();return;}
 if(el.dataset.event==='sponsorsEnabled'){d.event.sponsorsEnabled=el.checked;save();$('#sponsor-fields').innerHTML=sponsorFields();postPreview();return;}
 if(el.id==='image-upload'){
  const file=el.files[0];if(!file)return;
  if(file.size>1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){$('#image-error').innerHTML='<p class="note error">Choose a JPG, PNG or WebP under 1 MB.</p>';return;}
  const reader=new FileReader();reader.onload=()=>applyImage(reader.result);reader.onerror=()=>{$('#image-error').innerHTML='<p class="note error">Couldn’t read this photo. Try another image.</p>';};reader.readAsDataURL(file);
 }
});
window.addEventListener('hashchange',()=>{renderMain();refresh();$('#workspace').focus({preventScroll:true});});
window.addEventListener('message',ev=>{if(ev.origin===location.origin&&ev.source===$('#bidder-frame')?.contentWindow&&ev.data?.type==='studio-ready')postPreview();});
dialog.addEventListener('cancel',()=>returnFocus?.focus?.());
shell();renderMain();refresh();
