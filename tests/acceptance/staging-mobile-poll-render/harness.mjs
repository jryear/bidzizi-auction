import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ORIGIN,EVENT,fixture,stamp,receipt} from './fixtures.mjs';
export class HarnessError extends Error{}
export const root=path.resolve(process.env.VERIFY_ROOT||process.cwd());
const requireDeps=createRequire(path.join(root,'package.json'));
export function dependencies(){
 try{return requireDeps('@playwright/test');}catch(e){throw new HarnessError('Playwright unavailable: '+e.message);}
}
// The actual parent client is transpiled in memory, not reimplemented. Its real
// DemoEntryForm import is included. No Next build/dev server is started.
export function parentHTML(){
 try{
  const babel=requireDeps('next/dist/compiled/babel/core');
  const transform=rel=>babel.transformSync(fs.readFileSync(path.join(root,rel),'utf8'),{
   filename:path.join(root,rel),babelrc:false,configFile:false,
   presets:[[requireDeps('next/dist/compiled/babel/preset-react'),{runtime:'automatic'}],[requireDeps('next/dist/compiled/babel/preset-typescript'),{allExtensions:true,isTSX:true}]],
   plugins:[requireDeps('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
  }).code;
  const readCJS=(pkg,name)=>fs.readFileSync(path.join(path.dirname(requireDeps.resolve(pkg+'/package.json')),'cjs',name),'utf8');
  const reactDOMRequire=createRequire(requireDeps.resolve('react-dom/client'));
  const schedulerRoot=path.dirname(reactDOMRequire.resolve('scheduler/package.json'));
  const sources={
   react:readCJS('react','react.production.js'),
   'react/jsx-runtime':readCJS('react','react-jsx-runtime.production.js'),
   'react-dom':readCJS('react-dom','react-dom.production.js'),
   'react-dom/client':readCJS('react-dom','react-dom-client.production.js'),
   scheduler:fs.readFileSync(path.join(schedulerRoot,'cjs/scheduler.production.js'),'utf8'),
   './demo-entry-form':transform('src/app/events/[id]/demo-entry-form.tsx'),
   entry:transform('src/app/events/[id]/event-access.tsx'),
  };
  const encoded=JSON.stringify(sources).replaceAll('<','\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script>
   window.process={env:{NODE_ENV:'production'}};const sources=${encoded},cache={};
   function require(id){if(cache[id])return cache[id].exports;if(!sources[id])throw Error('Unknown CJS module '+id);const m={exports:{}};cache[id]=m;Function('module','exports','require',sources[id])(m,m.exports,require);return m.exports;}
   require('react-dom/client').createRoot(document.getElementById('root')).render(require('react').createElement(require('entry').default,{eventId:${JSON.stringify(EVENT)}}));
  </script></body></html>`;
 }catch(e){throw new HarnessError('Parent client/dependency preparation failed: '+e.message);}
}
const contentType=p=>p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.woff2')?'font/woff2':'application/octet-stream';
export async function session(browser,html){
 const f=fixture(),hits=[],errors=[],foreign=[],holds=new Map(),allHolds=new Set();let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3,serviceWorkers:'block'});
  context.setDefaultTimeout(4000);
  await context.addInitScript(()=>{
   window.__messages=[];window.__timeouts=[];window.__pins={};
   window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type)window.__messages.push({type:e.data.type,refresh:e.data.refresh,epoch:e.data.epoch});});
   const original=window.setTimeout;window.setTimeout=function(fn,ms,...args){window.__timeouts.push(ms);return original.call(this,fn,ms,...args);};
  });
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname;
   if(url.origin!==ORIGIN){foreign.push(url.origin);return route.abort();}
   if(p==='/events/'+EVENT&&req.method()==='GET')return route.fulfill({contentType:'text/html',body:html});
   if(p==='/favicon.ico')return route.fulfill({status:204,body:''});
   if(!p.startsWith('/api/')){
    const local=path.resolve(root,'public','.'+p);
    if(!local.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(local)){errors.push('Unknown local asset '+p);return route.abort();}
    return route.fulfill({contentType:contentType(p),body:fs.readFileSync(local)});
   }
   let kind,status=200,body;
   if(p==='/api/session'&&req.method()==='GET'){kind='session';body={authenticated:true,...f.context,staffOrganizations:[]};}
   else if(p.endsWith('/entry')){kind='entry';body={demoEntry:false,eventId:EVENT};}
   else if(p==='/api/catalog/events/'+EVENT){kind='catalog';status=f.catalogStatus;body={...structuredClone(f.packet),serverNow:stamp(f)};}
   else if(p.endsWith('/context')){kind='context';status=f.contextStatus;body=structuredClone(f.context);}
   else if(p.endsWith('/standing')){kind='standing';status=f.standingStatus;body={standing:{...structuredClone(f.standing),serverNow:stamp(f)}};}
   else if(p.endsWith('/bids')&&req.method()==='POST'){
    kind='bid';f.intent=req.postDataJSON();hits.push({kind,method:req.method(),path:p});
    if(f.bidAbort)return route.abort('failed');body={receipt:receipt(f,f.intent),standing:structuredClone(f.standing)};status=201;
   }else if(p.includes('/bid-receipts/')){kind='receipt';status=f.receiptStatus;body={receipt:f.intent?receipt(f,f.intent):null};}
   else if(p==='/api/session/logout'&&req.method()==='POST'){kind='logout';body={authenticated:false,testMode:true};}
   else{errors.push('Unknown browser-local API '+req.method()+' '+p);return route.abort();}
   if(status>=400)body={error:{code:status===401?'AUTH_REQUIRED':status===403?'FORBIDDEN':status===404?'NOT_FOUND':'UNAVAILABLE',message:status===401?'Sign in to continue.':'Local fixture response unavailable.'}};
   hits.push({kind,method:req.method(),path:p,status,body:structuredClone(body)});
   const hold=holds.get(kind);if(hold){holds.delete(kind);hold.seen=true;hold.body=body;await hold.promise;}
   try{await route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(body)});}catch(e){if(!context?.isClosed?.()&&!['TargetClosedError'].includes(e.name)&&!e.message.includes('closed'))errors.push(e.message);}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(ORIGIN+'/events/'+EVENT,{waitUntil:'domcontentloaded'});
  await page.locator('iframe').waitFor();
  await page.frameLocator('iframe').locator('.welcome-connected').waitFor();
  const frame=page.frames().find(x=>x.url().split('#')[0]===ORIGIN+'/staging-catalog/index.html');
  if(!frame)throw new HarnessError('The local iframe failed to attach.');
  await frame.locator('.welcome-connected').waitFor();
  await page.waitForTimeout(150);
  return {context,page,frame,f,hits,errors,foreign,
   hold(kind){let release;const h={seen:false,promise:new Promise(r=>release=r),release:()=>release()};holds.set(kind,h);allHolds.add(h);return h;},
   close:async()=>{for(const h of allHolds)h.release();await context.close();},
  };
 }catch(e){await context?.close();if(e instanceof HarnessError)throw e;throw new HarnessError('Local fixture bootstrap failed: '+e.message);}
}
export async function until(fn,ms=4000){const end=Date.now()+ms;do{if(await fn())return true;await new Promise(r=>setTimeout(r,40));}while(Date.now()<end);return false;}
export async function refresh(ui){
 const n=ui.hits.filter(x=>x.kind==='catalog').length;
 await ui.page.getByRole('button',{name:'Refresh event',exact:true}).click();
 if(!await until(()=>ui.hits.filter(x=>x.kind==='catalog').length>n))throw new HarnessError('Refresh failed to reach the local request harness.');
 await ui.page.waitForTimeout(150);
}
export async function openLot(ui){
 await ui.frame.locator('a[href="#/lots"]').first().click();await ui.frame.locator('.card-link').first().click();
 if(!await until(()=>ui.frame.locator('.catalog-footer [data-action="bid"]:not([disabled])').count()))throw new HarnessError('Open fixture standing failed to settle.');
}
export async function withUI(browser,html,fn){const ui=await session(browser,html);try{await fn(ui);}finally{await ui.close();}}
