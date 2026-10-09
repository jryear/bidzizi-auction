// Browsing preferences only; identity, grants, time and bid authority stay outside.
export const state={identity:null,ui:{view:'cards',cat:'All',sort:'number',q:''}};
const defaults=()=>({view:'cards',cat:'All',sort:'number',q:''});
export function restoreBrowse(scope){
 try{const p=JSON.parse(localStorage.getItem('bz:browse:v1:'+scope));state.ui={view:p?.ui?.view==='rows'?'rows':'cards',sort:p?.ui?.sort==='low'?'low':'number',cat:typeof p?.ui?.cat==='string'?p.ui.cat:'All',q:typeof p?.ui?.q==='string'?p.ui.q.slice(0,200):''};return p;}catch{state.ui=defaults();return null;}
}
export function saveBrowse(scope,path,memories){
 if(!scope)return;
 try{localStorage.setItem('bz:browse:v1:'+scope,JSON.stringify({ui:state.ui,path,scroll:[...memories]}));}catch{}
}
