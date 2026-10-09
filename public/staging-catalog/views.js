// Deliberately adapted from A's earned renderers in staging-bidder-preview.
// All visible content comes from the authorized catalog DTO; no local outcomes.
import {event,lots,lotById,categories,sponsors,catalog,dateText,timeText,currencyLabel,timestamp} from './data.js';
import {state} from './store.js';
import {esc,money,icon,sponsorMark,monogram} from './ui.js';
import {bidder,hasManualAccess,standingMarkup,bidderStub,bidFooter} from './bidding.js';
const open=()=>catalog.version===2||catalog.phase!=='scheduled';
const phaseText=()=>({scheduled:'Bidding opens soon',open:'Bidding open',closed:'Bidding closed'})[catalog.phase];
const providerMark=(p,size=28)=>`<span class="provider-initials" style="--s:${size}px" aria-hidden="true">${esc(p.initials)}</span>`;
const asOf=()=>`<p class="catalog-asof">Server status as of <time datetime="${esc(catalog.serverNow)}">${esc(timestamp(catalog.serverNow))}</time></p>`;
function pass(){const identity=state.identity;return `<header class="pass${identity?'':' guest'}"><span class="pass-badge"><span class="slot"></span>${identity?monogram(identity.business,36,true):providerMark(catalog.organization,36)}<span class="pass-text"><b>${esc(identity?.business||event.host)}</b><small>${esc(identity?.person||'Read-only event catalog')}</small></span></span><span class="pass-meta">${catalog.phase==='closed'?'Closed':hasManualAccess()?'Bidder':'Catalog'}</span></header>`;}
function banners(){return catalog.phase==='closed'?`<div class="banner b-closed" role="status">${icon('clock')}<div><b>Bidding closed.</b> Final recorded standing is available. It is not an award or settlement.</div></div>`:catalog.phase==='scheduled'&&catalog.version===2?`<div class="banner b-closed" role="status">${icon('clock')}<div><b>Browse before bidding opens.</b> Bidding opens ${esc(event.opens)} ${esc(event.timezone)}.</div></div>`:'';}
function topbar(){const back=state.from==='/bids'?'My bids':state.from==='/watching'?'Watching':'Lots';return `<header class="topbar"><button class="back" data-action="back" data-key="back" aria-label="Back to ${back}">${icon('back')}<span>${back}</span></button><a class="wordmark" href="#/lots" data-nav data-key="wordmark" aria-label="BidZizi, all lots">BidZizi</a><span class="chip-pass${state.identity?'':' guest'}">${state.identity?monogram(state.identity.business,22,true):icon('lock','sm')}<span title="${esc(state.identity?.business||'Read-only')}">${esc(state.identity?.business||'Read-only')}</span></span></header>`;}
export function tabbar(active){
 const t=(path,key,label,ic,disabled=false)=>`<a ${disabled?'aria-disabled="true"':`href="#${path}" data-nav`} class="tab${active===key?' on':''}" ${active===key?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`;
 return `<div class="pillnav">${t('/lots','lots','Lots','lots',!open())}${t('/watching','watching','Watching','bookmark',true)}${t('/bids','bids','My bids','ticket',true)}${t('/event','event','Event','info')}</div>`;
}
const watchBtn=(l,small=false)=>`<button type="button" class="watch${small?' sm':''}" data-action="watch" disabled aria-label="Watching not enabled for Lot ${esc(l.number)}" title="Watching is not enabled">${icon('bookmark')}</button>`;
const art=l=>`<div class="art">${providerMark(l.provider,52)}<span>${esc(l.sponsor)}</span><small>No photo</small></div>`;
const media=l=>l.image?`<img src="${esc(l.image)}" alt="${esc(l.alt)}" width="1000" height="667" loading="lazy" decoding="async">`:art(l);
const sponsorList=()=>sponsors.length?`<section class="sponsor-row" aria-label="Event sponsors"><p class="lbl">Event sponsors</p><ul>${sponsors.map(s=>`<li>${sponsorMark(s.logo,34)}<span>${esc(s.name)}</span></li>`).join('')}</ul></section>`:'';
export function entryView(){
 return {title:event.name,chrome:'entry',tab:'event',html:`
 <main class="entry welcome-connected" id="main" tabindex="-1">
  ${banners()}
  <section class="event-hero" aria-labelledby="event-title">
   ${event.cover?`<img class="event-cover" src="${esc(event.cover)}" alt="" width="1000" height="667" fetchpriority="high">`:''}
   <header class="hero-masthead"><a class="hero-brand" href="#/" data-nav aria-label="BidZizi, event welcome">BidZizi</a><span>${esc(event.host)}</span></header>
   <div class="hero-title"><p class="host">${esc(event.host)} presents</p><h1 id="event-title" tabindex="-1" data-key="h1">${esc(event.name)}</h1></div>
  </section>
  <div class="welcome-content">
   <div class="welcome-intro">
    <section class="welcome-message" aria-label="Event welcome">
     ${event.eyebrow?`<h2>${esc(event.eyebrow)}</h2>`:''}
     <p class="studio-welcome">${esc(event.welcome)}</p>
     <div class="welcome-actions">
      ${open()?`<a class="btn primary lg" href="#/lots" data-nav data-key="browse">Browse the lots ${icon('right')}</a>`:`<div class="catalog-message"><strong>Catalog opens ${esc(event.opens)} ${esc(event.timezone)}</strong>Lots become available at the approved opening time.</div>`}
      <a class="event-link" href="#/event" data-nav>Event information ${icon('right','sm')}</a>
     </div>
    </section>
    <aside class="welcome-facts" aria-label="Event details">
     <p class="venue">${esc(event.venue)}</p>
     <dl class="facts"><div><dt>When</dt><dd>${esc(event.date)}</dd></div><div><dt>Opens</dt><dd>${esc(event.opens)} ${esc(event.timezone)}</dd></div><div><dt>Closes</dt><dd>${esc(event.closeDate!==event.date?event.closeDate+' · ':'')}${esc(event.closes)} ${esc(event.timezone)}</dd></div></dl>
     <p class="fine">${currencyLabel()}. No payment or settlement occurs. ${hasManualAccess()?'Your pass permits bidding when the event is open.':'Your catalog access does not grant permission to bid.'}</p>
    </aside>
   </div>
   ${sponsors.length?`<section class="welcome-sponsors" aria-labelledby="sponsor-title"><p class="lbl" id="sponsor-title">With our event sponsors</p><ul>${sponsors.map(s=>`<li>${sponsorMark(s.logo,44)}<span>${esc(s.name)}</span></li>`).join('')}</ul></section>`:''}
   <footer class="welcome-footer"><span>BidZizi</span><button class="btn-link" data-action="welcome">A welcome from ${esc(event.host)}</button>${asOf()}</footer>
  </div>
 </main>`};
}
function card(l){return `<article class="card" data-anchor="${esc(l.id)}" data-lot="${esc(l.id)}">${watchBtn(l)}<a class="card-link" href="#/lot/${esc(l.id)}" data-nav data-key="lot-${esc(l.id)}"><div class="card-media">${media(l)}<span class="lotno" aria-label="Lot ${esc(l.number)}">${esc(l.number)}</span><span class="sponsor-tag">${providerMark(l.provider,22)}<span>${esc(l.sponsor)}</span></span></div><div class="card-body"><p class="cat">${esc(l.category)}</p><h3 class="card-title">${esc(l.title)}</h3><p class="card-short">${esc(l.short)}</p></div><div class="card-numbers"><div class="cn-a"><span class="lbl">Opening amount</span><span class="amt">${money(l.opening)}</span></div><span class="count">${hasManualAccess()?'Test bidding':'Read-only'}</span><div class="leaderrow"><span class="leader none">${currencyLabel()} · no payment or settlement</span></div></div></a></article>`;}
function row(l){return `<article class="row" data-anchor="${esc(l.id)}" data-lot="${esc(l.id)}"><a href="#/lot/${esc(l.id)}" data-nav data-key="lot-${esc(l.id)}" class="row-link"><div class="thumb">${l.image?`<img src="${esc(l.image)}" alt="" width="1000" height="667" loading="lazy">`:art(l)}<span class="lotno sm">${esc(l.number)}</span></div><div class="row-main"><h3 class="row-title">${esc(l.title)}</h3><p class="row-meta"><span class="leader none">${esc(l.sponsor)}</span></p></div><div class="row-end"><span class="amt">${money(l.opening)}</span><span class="count">${currencyLabel()}</span></div></a>${watchBtn(l,true)}</article>`;}
export function visibleLots(){
 const {cat,sort,q}=state.ui,terms=(q||'').toLowerCase().split(/\s+/).filter(Boolean);
 let list=lots.filter(l=>(cat==='All'||l.category===cat)&&terms.every(t=>`lot ${l.number} ${l.title} ${l.short} ${l.sponsor} ${l.category}`.toLowerCase().includes(t)));
 if(sort==='low')list=[...list].sort((a,b)=>a.opening-b.opening);return list;
}
export const lotsCount=()=>`${visibleLots().length} of ${lots.length}`;
export function lotsList(){const list=visibleLots();return list.length?`<div class="${state.ui.view==='rows'?'rows':'cards'}">${list.map(state.ui.view==='rows'?row:card).join('')}</div><p class="end-note">That’s every matching lot.</p>`:'<div class="empty big"><p>No lots match your search.</p><button class="btn quiet" data-action="clear-filters">Clear search and filters</button></div>';}
export function lotsView(){
 const {view,cat,sort,q}=state.ui;
 return {title:'Lots',chrome:'tabs',tab:'lots',html:`${pass()}${banners()}<main id="main" class="lots"><div class="page-head"><h1 tabindex="-1" data-key="h1">Lots</h1><p id="lot-count">${esc(lotsCount())}</p></div><div class="searchrow"><label class="search">${icon('search','sm')}<span class="sr">Search lots</span><input type="search" data-search enterkeyhint="search" autocomplete="off" placeholder="Search lots" value="${esc(q)}" data-key="q"></label></div><div class="chips" role="group" aria-label="Filter by category">${categories.map(c=>`<button class="chip${cat===c?' on':''}" data-action="cat" data-v="${esc(c)}" aria-pressed="${cat===c}">${esc(c)}</button>`).join('')}</div><div class="toolbar"><label class="sort"><span class="sr">Sort lots</span><select data-action="sort"><option value="number" ${sort==='number'?'selected':''}>Lot order</option><option value="low" ${sort==='low'?'selected':''}>Lowest opening amount</option></select>${icon('chevron','sm')}</label><div class="seg" role="group" aria-label="Layout"><button data-action="view" data-v="cards" aria-pressed="${view==='cards'}" aria-label="Large cards">${icon('grid')}</button><button data-action="view" data-v="rows" aria-pressed="${view==='rows'}" aria-label="Compact list">${icon('list')}</button></div></div><div id="lotlist">${lotsList()}</div>${asOf()}</main>`};
}
export function lotView(id){
 const l=lotById(id);if(!l)return {title:'Lot unavailable',chrome:'tabs',tab:'lots',html:`${pass()}<main class="lots"><div class="empty big"><h1>That lot is unavailable</h1><a href="#/lots" data-nav class="btn primary">Back to lots</a></div></main>`};
 return {title:`Lot ${l.number} · ${l.title}`,chrome:'focus',tab:'lots',html:`${topbar()}${banners()}<main id="main" class="detail" data-lot="${esc(l.id)}"><div class="hero">${media(l)}${watchBtn(l)}<span class="lotno lg" aria-label="Lot ${esc(l.number)}">${esc(l.number)}</span></div><div class="d-body"><p class="sponsor-line">${providerMark(l.provider,30)}<span><small>Provided by</small><b>${esc(l.sponsor)}</b></span><span class="cat">${esc(l.category)}</span></p><h1 class="d-title" tabindex="-1" data-key="h1">${esc(l.title)}</h1><p class="d-short">${esc(l.short)}</p><section class="stub" aria-label="Catalog status"><div class="stub-main"><span class="lbl">Opening amount</span><span class="amt xl">${money(l.opening)}</span>${bidder.context?bidderStub(l):`<span class="catalog-amount-note">${currencyLabel()} · no payment or settlement</span>`}</div><div class="stub-side"><div><span class="lbl">${catalog.phase==='closed'?'Closed':'Closes'}</span><span class="n sm">${esc(event.closes)}</span><span class="tl">${esc(event.timezone)}</span></div></div></section>${standingMarkup(l)}<section class="prose"><h2>About this lot</h2><p>${esc(l.description)}</p></section>${l.includes.length?`<section class="prose"><h2>What's included</h2><ul class="incl">${l.includes.map(x=>`<li>${icon('check','sm')}<span>${esc(x)}</span></li>`).join('')}</ul></section>`:''}${l.fine?`<section class="prose"><h2>Good to know</h2><p class="fine-print">${esc(l.fine)}</p></section>`:''}<a class="btn-link center" href="#/event" data-nav>Event information</a>${asOf()}</div>${bidFooter(l)}</main>`};
}
export function eventView(){return {title:'Event',chrome:'tabs',tab:'event',html:`${pass()}${banners()}<main id="main" class="eventinfo"><div class="page-head"><h1 tabindex="-1">${esc(event.name)}</h1><p>${esc(event.host)} · ${esc(event.date)}</p></div><section class="prose"><h2>Event details</h2><p>${esc(event.welcome)}</p><p class="fine-print">${esc(event.venue)}</p></section><section class="prose"><h2>Catalog schedule</h2><dl class="facts onpage"><div><dt>Opens</dt><dd>${esc(event.opens)} ${esc(event.timezone)}</dd></div><div><dt>Closes</dt><dd>${esc(event.closeDate!==event.date?event.closeDate+' · ':'')}${esc(event.closes)} ${esc(event.timezone)}</dd></div></dl><p class="fine-print">${esc(phaseText())}. ${currencyLabel()}. No payment or settlement occurs. ${catalog.phase==='closed'?'Recorded standing is not an award.':catalog.phase==='scheduled'?'Browse now; bid after opening.':hasManualAccess()?'Bidding is available with your current pass.':'Your catalog access does not grant permission to bid.'}</p></section>${sponsors.length?`<section class="prose"><h2>Event sponsors</h2><ul class="sponsors">${sponsors.map(s=>`<li>${sponsorMark(s.logo,40)}<span>${esc(s.name)}</span></li>`).join('')}</ul></section>`:''}<a class="btn-link center" href="#/" data-nav>Back to welcome</a>${asOf()}</main>`};}
export const views={entry:entryView,lots:lotsView,event:eventView};
