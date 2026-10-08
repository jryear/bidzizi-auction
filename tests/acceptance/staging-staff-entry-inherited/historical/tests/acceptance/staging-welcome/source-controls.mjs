import {createHash} from 'node:crypto';
import {HarnessError} from '../staging-workspace-entry/harness.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const controls=['REFERENCE','WRONG_TITLE','WRONG_COVER','WRONG_WELCOME','WRONG_SPONSOR','SPONSORS_AFTER_FACTS','DISABLED_SPONSOR_LEAK','WORKING_AS_SAVED','PROTOTYPE_CONTENT_LEAK','FOCUS_LOST','DRAFT_AS_APPROVED','SIDE_INSET','HIDDEN_TITLE'];
// This independently authored reference is served transiently only in disposable
// controls. It is never written into product files and never earns application GREEN.
const welcome=kind=>`export function entryView(){
 const shownSponsors=sponsors;
 return {name:'entry',title:event.name,chrome:'entry',tab:'event',html:\`<main class="entry welcome-connected" id="main">
 <section class="event-hero" aria-labelledby="event-title">\${event.cover?\`<img class="event-cover" src="\${esc(event.cover)}" alt="" width="1000" height="667">\`:''}<div class="hero-title"><p class="host">\${esc(event.host)} presents</p><h1 id="event-title" tabindex="-1" data-key="h1">\${esc(event.name)}</h1></div></section>
 <div class="welcome-content"><section class="welcome-message" aria-label="Event welcome">\${event.eyebrow?\`<h2>\${esc(event.eyebrow)}</h2>\`:''}<p class="studio-welcome">\${esc(event.welcome)}</p><div class="welcome-actions">${kind==='catalog'?"\${open()?'<a class=\"btn primary lg\" href=\"#/lots\" data-nav data-key=\"browse\">Browse the lots</a>':'<p class=\"catalog-message\">Lots become available at the approved opening time.</p>'}":'<a class="btn primary lg" href="#/lots" data-nav data-key="browse">Browse the lots</a>'}<a href="#/event" data-nav>Event information</a></div></section>
 \${shownSponsors.length?\`<section class="welcome-sponsors" aria-label="Event sponsors"><p class="lbl">Event sponsors</p><ul>\${shownSponsors.map(s=>\`<li>\${sponsorMark(s.logo,40)}<span>\${esc(s.name)}</span></li>\`).join('')}</ul></section>\`:''}
 <aside class="welcome-facts" aria-label="Event details"><p>\${esc(event.venue)}</p><dl class="facts"><div><dt>When</dt><dd>\${esc(event.date)}</dd></div><div><dt>Closes</dt><dd>\${esc(event.closes)} \${esc(event.timezone)}</dd></div><div><dt>Lots</dt><dd>\${lots.length}</dd></div></dl><p class="fine">${kind==='catalog'?'Read-only event catalog.':'Staff draft preview. Bidding is disabled.'}</p></aside>${kind==='catalog'?'\${asOf()}':''}</div></main>\`};
}
`;
const css=`
/* Diagnostic reference only; product is not edited. */
.entry.welcome-connected{padding:0;display:block;background:var(--paper)}.event-hero{position:relative;isolation:isolate;min-height:300px;color:var(--paper);background:var(--ink);display:flex;align-items:flex-end}.event-cover{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}.event-hero:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.85))}.hero-title{padding:100px 20px 28px;min-width:0}.hero-title .host{color:var(--paper)}.hero-title h1{font:600 43px/1.05 var(--serif);overflow-wrap:anywhere;max-width:100%;margin:0}.welcome-content{padding:24px 20px;display:flex;flex-direction:column}.welcome-message{order:0}.welcome-message h2{font:550 25px/1.2 var(--serif)}.welcome-actions{display:flex;flex-direction:column;gap:12px;margin-top:20px}.welcome-actions .btn{min-height:48px}.welcome-sponsors{order:1;margin-top:24px;border-top:1px solid var(--line);padding-top:20px}.welcome-sponsors ul{display:grid;grid-template-columns:1fr 1fr;gap:18px 12px}.welcome-sponsors li{display:flex;gap:9px;min-width:0}.welcome-sponsors li span:last-child{overflow-wrap:anywhere}.welcome-facts{order:2;margin-top:28px}.welcome-facts .facts{gap:12px}.welcome-facts .facts dd{overflow-wrap:anywhere}
`;
export function controlledSource(original,path,control){
 if(!controls.includes(control))throw new HarnessError('Unknown welcome control');
 if(path.endsWith('/views.js')){
  const kind=path.includes('/staging-catalog/')?'catalog':'preview',start=original.indexOf('export function entryView()'),end=original.indexOf(kind==='catalog'?'\nfunction card(':'\n// ---- lots',start);
  if(start<0||end<=start)throw new HarnessError('Reference welcome source anchors missing');
  let ref=welcome(kind);
  if(control==='WRONG_TITLE')ref=ref.replace('esc(event.name)','esc("WRONG TITLE CONTROL")');
  if(control==='WRONG_COVER')ref=ref.replace('event.cover?','true?').replace('esc(event.cover)',kind==='catalog'?'esc("/staging-bidder-preview/assets/lots/flowers.jpg")':'esc("assets/lots/flowers.jpg")');
  if(control==='WRONG_WELCOME')ref=ref.replace('esc(event.welcome)','esc("WRONG WELCOME CONTROL")');
  if(control==='WRONG_SPONSOR')ref=ref.replace('esc(s.name)','esc("WRONG SPONSOR CONTROL")');
  if(control==='DISABLED_SPONSOR_LEAK')ref=ref.replace('const shownSponsors=sponsors;','const shownSponsors=event.sponsors.filter(s=>s.name.trim());');
  if(control==='DRAFT_AS_APPROVED'&&kind==='catalog')ref=ref.replace('esc(event.name)','esc("006b PRIVATE after approval")');
  if(control==='PROTOTYPE_CONTENT_LEAK')ref=ref.replace('</main>', '<footer>Local visual study · synthetic content, not saved event data</footer></main>');
  return original.slice(0,start)+ref+original.slice(end);
 }
 if(path.endsWith('/styles.css'))return original+css+(control==='SPONSORS_AFTER_FACTS'?'\n.welcome-sponsors{order:3}.welcome-facts{order:1}\n':control==='SIDE_INSET'?'\n.entry.welcome-connected{width:70%;margin-inline:auto}\n':control==='HIDDEN_TITLE'?'\n.event-hero h1{opacity:0}\n':'');
 if(path.endsWith('/src/app.js')||path.endsWith('/staging-catalog/app.js')){
  if(control==='FOCUS_LOST')return original;
  if(!original.includes('render();scrollTo'))throw new HarnessError('Reference route focus anchor missing');
  return original.replaceAll('render();scrollTo',"render();document.querySelector('main h1')?.focus({preventScroll:true});scrollTo");
 }
 if(path==='/staging-admin/studio.js'&&control==='WORKING_AS_SAVED'){
  const anchor="const packet=previewMode==='saved'?confirmed:d;";if(!original.includes(anchor))throw new HarnessError('Working-as-saved anchor absent');
  return original.replace(anchor,'const packet=d;');
 }
 return original;
}
export async function installControl(page,control,bindings=[]){
 const paths=['/staging-bidder-preview/src/views.js','/staging-bidder-preview/styles.css','/staging-bidder-preview/src/app.js','/staging-catalog/views.js','/staging-catalog/styles.css','/staging-catalog/app.js','/staging-admin/studio.js'];
 for(const path of paths)await page.route('**'+path,async route=>{
  const response=await route.fetch();if(response.status()!==200)throw new HarnessError('Control source unavailable');const original=await response.text(),served=controlledSource(original,path,control);
  const binding={control,path,originalSHA256:hash(original),servedSHA256:hash(served),gateProof:false};bindings.push(binding);console.log('WELCOME_SOURCE_CONTROL '+JSON.stringify(binding));await route.fulfill({response,body:served});
 });
}
