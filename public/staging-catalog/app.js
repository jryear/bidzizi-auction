import {event,catalog,applyAudience} from './data.js';
import {state} from './store.js';
import {views,lotView,tabbar,lotsList,lotsCount} from './views.js';
import {esc} from './ui.js';
const $=s=>document.querySelector(s);
let ready=false,scope='',path='/';
const memories=new Map();
function render(){
 if(!ready)return;
 const raw=(location.hash.slice(1)||'/').split('?')[0];
 path=catalog.phase==='scheduled'?(raw==='/event'?'/event':'/'):(/^\/lot\/[\w-]+$/.test(raw)||['/','/lots','/event'].includes(raw)?raw:'/');
 const match=path.match(/^\/lot\/([\w-]+)$/);
 const view=match?lotView(match[1]):views[path==='/'?'entry':path.slice(1)]();
 const y=scrollY,key=document.activeElement?.dataset?.key;
 $('#view').innerHTML=view.html;$('#tabbar').innerHTML=tabbar(view.tab);$('#shell').dataset.chrome=view.chrome;document.body.dataset.chrome=view.chrome;
 document.title=view.title+' · BidZizi catalog';
 scrollTo(0,y);if(key)$(`[data-key="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
}
function navigate(next,replace=false){
 if(catalog.phase==='scheduled'&&next!=='/event')next='/';
 memories.set(path,scrollY);history[replace?'replaceState':'pushState']({from:path},'','#'+next);render();scrollTo(0,memories.get(path)||0);
}
function valid(p){
 return p&&p.event&&p.organization&&typeof p.event.id==='string'&&typeof p.organization.id==='string'&&['scheduled','open','closed'].includes(p.phase)&&p.biddingEnabled===false&&Number.isFinite(Date.parse(p.serverNow))&&p.schedule&&Number.isFinite(Date.parse(p.schedule.opensAt))&&Number.isFinite(Date.parse(p.schedule.closesAt))&&Array.isArray(p.event.sponsors)&&(p.phase==='scheduled'?p.catalog===null:p.catalog&&Array.isArray(p.catalog.lots));
}
window.addEventListener('message',ev=>{
 if(parent===window||ev.origin!==location.origin||ev.source!==parent||ev.data?.type!=='audience-catalog'||!valid(ev.data.payload))return;
 const p=ev.data.payload,next=p.organization.id+'/'+p.event.id;
 if(scope!==next){scope=next;memories.clear();state.ui={view:'cards',cat:'All',sort:'number',q:''};path='/';history.replaceState({},'','#/');}
 applyAudience(p);if(!state.ui.cat||!p.catalog?.lots.some(l=>l.category===state.ui.cat))state.ui.cat='All';ready=true;render();
});
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('a[data-nav]');if(nav){const href=nav.getAttribute('href');if(href?.startsWith('#/')){ev.preventDefault();navigate(href.slice(1));}return;}
 const button=ev.target.closest('[data-action]');if(!button||button.disabled)return;
 const a=button.dataset.action;
 if(a==='back')return navigate('/lots');
 if(a==='cat'){state.ui.cat=button.dataset.v;render();}
 if(a==='view'){state.ui.view=button.dataset.v;render();}
 if(a==='clear-filters'){state.ui.q='';state.ui.cat='All';render();}
 if(a==='welcome'){const d=$('#sheet');d.innerHTML=`<div class="sheet-in"><h2 id="sheet-title" tabindex="-1">${esc(event.name)}</h2><p style="margin:20px 0">${esc(event.welcome)}</p><button class="btn primary block" id="close-welcome">Back to event</button></div>`;d.showModal();$('#close-welcome').onclick=()=>d.close();}
});
document.addEventListener('input',ev=>{if(!ev.target.matches('[data-search]')||catalog.phase==='scheduled')return;state.ui.q=ev.target.value;$('#lotlist').innerHTML=lotsList();$('#lot-count').textContent=lotsCount();});
document.addEventListener('change',ev=>{if(ev.target.dataset.action==='sort'){state.ui.sort=ev.target.value;render();}});
window.addEventListener('popstate',()=>{render();scrollTo(0,memories.get(path)||0);});
window.addEventListener('hashchange',()=>render());
if(parent!==window)parent.postMessage({type:'audience-ready'},location.origin);

