import {event,catalog,applyAudience} from './data.js';
import {state,restoreBrowse,saveBrowse} from './store.js';
import {views,lotView,tabbar,lotsList,lotsCount} from './views.js';
import {esc} from './ui.js';
import {setContext,activateLot,bidAction} from './bidding.js';
import {reconcileHTML} from './reconcile.js';
const $=s=>document.querySelector(s);
let ready=false,scope='',path='/',restoreScroll=false;
let renderedHash=null,renderedView=null;
const memories=new Map();
function focusRouteHeading(){$('#view main h1')?.focus({preventScroll:true});}
function render(){
 if(!ready)return;
 renderedHash=location.hash;
 const raw=(location.hash.slice(1)||'/').split('?')[0];
 path=catalog.phase==='scheduled'&&catalog.version!==2?(raw==='/event'?'/event':'/'):(/^\/lot\/[\w-]+$/.test(raw)||['/','/lots','/event'].includes(raw)?raw:'/');
 const match=path.match(/^\/lot\/([\w-]+)$/);
 activateLot(match?.[1]||null);
 const view=match?lotView(match[1]):views[path==='/'?'entry':path.slice(1)]();
 const y=scrollY,active=document.activeElement,key=active?.dataset?.key,viewKey=scope+':'+path;
 if(renderedView===viewKey)reconcileHTML($('#view'),view.html);else $('#view').innerHTML=view.html;
 renderedView=viewKey;reconcileHTML($('#tabbar'),tabbar(view.tab));$('#shell').dataset.chrome=view.chrome;document.body.dataset.chrome=view.chrome;
 document.title=view.title+' · BidZizi catalog';
 if(scrollY!==y)scrollTo(0,y);if(key&&document.activeElement!==active)$(`[data-key="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
}
function navigate(next,replace=false){
 if(catalog.phase==='scheduled'&&catalog.version!==2&&next!=='/event')next='/';
 memories.set(path,scrollY);state.from=path;saveBrowse(scope,path,memories);history[replace?'replaceState':'pushState']({from:path},'','#'+next);render();scrollTo(0,memories.get(path)||0);saveBrowse(scope,path,memories);
 focusRouteHeading();
}
function valid(p){
 return p&&p.event&&p.organization&&typeof p.event.id==='string'&&typeof p.organization.id==='string'&&['scheduled','open','closed'].includes(p.phase)&&(p.version===2?p.biddingEnabled===(p.phase==='open'):p.biddingEnabled===false)&&Number.isFinite(Date.parse(p.serverNow))&&p.schedule&&Number.isFinite(Date.parse(p.schedule.opensAt))&&Number.isFinite(Date.parse(p.schedule.closesAt))&&Array.isArray(p.event.sponsors)&&(p.version===2?p.catalog&&Array.isArray(p.catalog.lots):(p.phase==='scheduled'?p.catalog===null:p.catalog&&Array.isArray(p.catalog.lots)));
}
window.addEventListener('message',ev=>{
 if(parent===window||ev.origin!==location.origin||ev.source!==parent)return;
 if(ev.data?.type==='bidder-context'){setContext(ev.data);return;}
 if(ev.data?.type!=='audience-catalog'||!valid(ev.data.payload))return;
 const p=ev.data.payload,next=p.organization.id+'/'+p.event.id;
 if(scope!==next){scope=next;restoreScroll=true;memories.clear();const saved=restoreBrowse(scope);for(const [key,y] of Array.isArray(saved?.scroll)?saved.scroll:[]){if(typeof key==='string'&&Number.isFinite(y))memories.set(key,y);}path=saved?.path||'/';history.replaceState({},'','#'+path);}
 applyAudience(p);if(!state.ui.cat||!p.catalog?.lots.some(l=>l.category===state.ui.cat))state.ui.cat='All';ready=true;render();if(restoreScroll){restoreScroll=false;requestAnimationFrame(()=>scrollTo(0,memories.get(path)||0));}
});
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('a[data-nav]');if(nav){const href=nav.getAttribute('href');if(href?.startsWith('#/')){ev.preventDefault();navigate(href.slice(1));}return;}
 const button=ev.target.closest('[data-action]');if(!button||button.disabled)return;
 if(bidAction(button))return;
 const a=button.dataset.action;
 if(a==='back')return navigate(['/lots','/watching','/bids'].includes(state.from)?state.from:'/lots');
 if(a==='cat'){state.ui.cat=button.dataset.v;render();}
 if(a==='view'){state.ui.view=button.dataset.v;render();}
 if(a==='clear-filters'){state.ui.q='';state.ui.cat='All';render();}
 saveBrowse(scope,path,memories);
 if(a==='welcome'){const d=$('#sheet');d.innerHTML=`<div class="sheet-in"><h2 id="sheet-title" tabindex="-1">${esc(event.name)}</h2><p style="margin:20px 0">${esc(event.welcome)}</p><button class="btn primary block" id="close-welcome">Back to event</button></div>`;d.showModal();$('#close-welcome').onclick=()=>d.close();}
});
document.addEventListener('input',ev=>{if(!ev.target.matches('[data-search]')||catalog.phase==='scheduled'&&catalog.version!==2)return;state.ui.q=ev.target.value;reconcileHTML($('#lotlist'),lotsList());$('#lot-count').textContent=lotsCount();saveBrowse(scope,path,memories);});
document.addEventListener('change',ev=>{if(ev.target.dataset.action==='sort'){state.ui.sort=ev.target.value;render();saveBrowse(scope,path,memories);}});
window.addEventListener('pagehide',()=>{memories.set(path,scrollY);saveBrowse(scope,path,memories);});
window.addEventListener('popstate',()=>{render();scrollTo(0,memories.get(path)||0);focusRouteHeading();});
window.addEventListener('hashchange',()=>{if(location.hash!==renderedHash){render();focusRouteHeading();}});
window.addEventListener('bidder-change',()=>render());
if(parent!==window)parent.postMessage({type:'audience-ready'},location.origin);
