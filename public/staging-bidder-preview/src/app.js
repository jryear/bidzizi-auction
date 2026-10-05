import {event,lots,applyAdminDraft} from './data.js';
import {state,applyPacket} from './store.js';
import {views,lotView,tabbar,lotsList,lotsCount} from './views.js';
import {esc} from './ui.js';
const $=s=>document.querySelector(s);
let ready=false,scope='',route='/',mode='saved';
let path='/';
const memories=new Map();
function remember(){memories.set(path,scrollY);}
function navigate(next,replace=false){
 remember();history[replace?'replaceState':'pushState']({from:path},'','#'+next);path=next;render();scrollTo(0,memories.get(next)||0);
}
function render(){
 if(!ready)return;
 const raw=(location.hash.slice(1)||'/').split('?')[0];
 path=/^\/lot\/[\w-]+$/.test(raw)||['/','/lots','/event'].includes(raw)?raw:'/lots';
 const match=path.match(/^\/lot\/([\w-]+)$/);const view=match?lotView(match[1]):views[path==='/'?'entry':path.slice(1)]();
 const y=scrollY,focus=document.activeElement?.dataset?.key;
 $('#view').innerHTML=view.html;$('#tabbar').innerHTML=tabbar(view.tab);$('#shell').dataset.chrome=view.chrome;document.body.dataset.chrome=view.chrome;
 document.title=`${view.title} · Staff draft preview`;
 document.querySelectorAll('[data-action]').forEach(button=>{if(!['back','cat','view','sort','clear-filters','welcome'].includes(button.dataset.action)){button.disabled=true;button.title='Not enabled in staff preview';if(button.dataset.action==='bid')button.textContent='Preview only';}});
 $('#tabbar').querySelectorAll('a[href="#/watching"],a[href="#/bids"]').forEach(a=>{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.style.opacity='.5';});
 scrollTo(0,y);if(focus)$(`[data-key="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
}
window.addEventListener('message',ev=>{
 if(ev.origin!==location.origin||ev.source!==parent||parent===window||ev.data?.type!=='staff-draft-preview')return;
 const p=ev.data.payload;if(!p?.org||!p?.event||!Array.isArray(p.lots))return;
 const nextScope=p.org.id+'/'+p.event.id;
 if(scope!==nextScope){scope=nextScope;memories.clear();state.ui={view:'cards',cat:'All',sort:'number',q:''};path='/';history.replaceState({},'','#/');}
 mode=p.mode;applyAdminDraft(p);applyPacket();ready=true;
 if(ev.data.path){navigate(ev.data.path,true);}else render();
});
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('a[data-nav]');if(nav){if(nav.getAttribute('href')?.startsWith('#/')){ev.preventDefault();navigate(nav.getAttribute('href').slice(1));}return;}
 const button=ev.target.closest('[data-action]');if(!button||button.disabled)return;
 const action=button.dataset.action;
 if(action==='back')return navigate('/lots');
 if(action==='cat'){state.ui.cat=button.dataset.v;render();}
 if(action==='view'){state.ui.view=button.dataset.v;render();}
 if(action==='clear-filters'){state.ui.q='';state.ui.cat='All';render();}
 if(action==='welcome'){const dialog=$('#sheet');dialog.innerHTML=`<div class="sheet-in"><h2 id="sheet-title" tabindex="-1">${esc(event.name)}</h2><p style="margin:20px 0">${esc(event.welcome)}</p><button class="btn primary block" id="close-welcome">Back to preview</button></div>`;dialog.showModal();$('#close-welcome').onclick=()=>dialog.close();}
});
document.addEventListener('input',ev=>{if(!ev.target.matches('[data-search]'))return;state.ui.q=ev.target.value;$('#lotlist').innerHTML=lotsList();$('#lot-count').textContent=lotsCount();});
document.addEventListener('change',ev=>{if(ev.target.dataset.action==='sort'){state.ui.sort=ev.target.value;render();}});
window.addEventListener('popstate',()=>{render();scrollTo(0,memories.get(path)||0);});
window.addEventListener('hashchange',()=>render());
if(parent!==window)parent.postMessage({type:'staff-preview-ready'},location.origin);
