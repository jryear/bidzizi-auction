#!/usr/bin/env node
// Real Mobile Safari via Apple's WebDriver. Missing runtime/driver/baseline is infrastructure (99), never GREEN.
// BASE=... HOST_EMAIL=... HOST_PASSWORD=... IOS_BASELINE_URL=... pnpm test:ios
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const BASE=process.env.BASE??'http://127.0.0.1:3432',out='.shots/ios',versions=['16.4','17.5','18.6'];
await mkdir(out,{recursive:true});const matrix=[];
let runtimes;
try{runtimes=JSON.parse(execFileSync('xcrun',['simctl','list','runtimes','--json'],{encoding:'utf8'})).runtimes;}
catch(e){console.error('iOS infrastructure unavailable: xcrun simctl could not list runtimes.');process.exit(99);}
for(const version of versions){const runtime=runtimes.find(r=>r.version===version&&r.isAvailable);matrix.push({version,status:runtime?'pending':'unavailable',runtime:runtime?.identifier??null});}
await writeFile(out+'/matrix.json',JSON.stringify(matrix,null,2));
if(matrix.some(m=>m.status==='unavailable')){console.error('Missing iOS runtimes: '+matrix.filter(m=>m.status==='unavailable').map(m=>m.version).join(', ')+'. Install them in Xcode; no simulator test has passed.');process.exit(99);}
if(!process.env.IOS_BASELINE_URL){console.error('Set IOS_BASELINE_URL to the vulnerable 88997dd build on an isolated test database to verify the iOS 16.4 RED case.');process.exit(99);}
const port=Number(process.env.SAFARI_DRIVER_PORT??4445),driver=spawn('/usr/bin/safaridriver',['-p',String(port)],{stdio:'ignore'});
const wd=async(method,path,body)=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const d=await r.json();if(d.value?.error)throw new Error(d.value.message);return d.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let sid, checking=false;
async function session(path,body,method='POST'){return wd(method,`/session/${sid}/${path}`,body);}
const execute=(script,args=[])=>session('execute/sync',{script,args});
async function wait(script){const until=Date.now()+30000;while(Date.now()<until){if(await execute(script))return;await pause(250);}throw new Error('Timed out: '+script);}
async function element(selector){const e=await execute('return Array.from(document.querySelectorAll(arguments[0])).find(e=>e.getClientRects().length && getComputedStyle(e).visibility!=="hidden")', [selector]);if(!e)throw new Error('No visible element: '+selector);return e['element-6066-11e4-a52e-4f735466cecf'];}
const click=async selector=>session(`element/${await element(selector)}/click`,{});
const fill=async(selector,text)=>{const id=await element(selector);await session(`element/${id}/clear`,{});await session(`element/${id}/value`,{text,value:[...text]});};
const capture=async name=>writeFile(`${out}/${name}.png`,Buffer.from(await session('screenshot',undefined,'GET'),'base64'));
function apiClient(base){let cookie='';return async(method,path,body)=>{const r=await fetch(base+path,{method,headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const set=r.headers.getSetCookie();if(set.length)cookie=set.map(c=>c.split(';')[0]).join('; ');const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;};}
async function fixture(base){const host=apiClient(base);await host('POST','/api/v1/host/login',{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD});const e=await host('POST','/api/v1/host/events',{requestId:randomUUID(),name:'iOS Safari rehearsal',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString()});const i=await host('POST',`/api/v1/host/events/${e.id}/items`,{requestId:randomUUID(),title:'Safari prize',openingMinor:10000});await host('POST',`/api/v1/host/events/${e.id}/recipients`,{name:'Test nonprofit'});const w=await host('GET',`/api/v1/host/events/${e.id}`);await host('PATCH',`/api/v1/host/events/${e.id}`,{revision:w.event.revision,status:'live'});return{host,event:e,item:i,code:w.event.code};}
try{
 for(let n=0;n<60;n++){try{await wd('GET','/status');break;}catch{if(n===59)throw new Error('safaridriver unavailable; enable Remote Automation according to Apple documentation.');await pause(250);}}
 for(const row of matrix){
  checking=false;
  const devices=JSON.parse(execFileSync('xcrun',['simctl','list','devices','available','--json'],{encoding:'utf8'})).devices[row.runtime]??[];
  let device=devices.find(d=>d.name.startsWith('BidZizi-'))??devices.find(d=>d.name.includes('iPhone'));
  if(!device){const type=row.version==='16.4'?'iPhone-14':row.version==='17.5'?'iPhone-15':'iPhone-16';const udid=execFileSync('xcrun',['simctl','create','BidZizi-'+row.version,'com.apple.CoreSimulator.SimDeviceType.'+type,row.runtime],{encoding:'utf8'}).trim();device={udid};}
  try{execFileSync('xcrun',['simctl','boot',device.udid],{stdio:'ignore'});}catch{}
  const created=await wd('POST','/session',{capabilities:{alwaysMatch:{browserName:'Safari',platformName:'iOS','safari:useSimulator':true,'safari:deviceUDID':device.udid}}});sid=created.sessionId;
  for(const [base,red] of [[BASE,false],...(row.version==='16.4'?[[process.env.IOS_BASELINE_URL,true]]:[])]){
   checking=false;const f=await fixture(base);checking=true;await session('url',{url:base+'/e/'+f.code});
   await wait('return !!document.querySelector(".join-card input")');
   await fill('.join-card input[autocomplete="name"]','Safari test');await fill('.join-card input[autocomplete="organization"]','Local test');await click('.join-card form button.primary');
   await wait('return !!document.querySelector(".lc-hit")');await capture(row.version+'-join');await click('.lc-hit');await wait('return !!document.querySelector(".pa-actionbar button")');await click('.pa-actionbar button');
   await wait('return !!document.querySelector(".pa-sheet")');await pause(800);
   const tappable=await execute('var e=document.querySelector(".sheet-foot button"),r=e.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>40&&r.height>30&&r.bottom<=innerHeight&&(h===e||e.contains(h));');
   await capture(row.version+(red?'-baseline-sheet':'-sheet'));
   if(red){if(tappable)throw new Error('Baseline unexpectedly tappable; iOS 16.4 RED not reproduced.');continue;}
   if(!tappable)throw new Error('Bid button is not visible and tappable.');await fill("#bid-amount","100");await pause(300);await capture(row.version+"-keyboard");await click('.sheet-foot button');await wait('return !!document.querySelector(".landed") || document.body.textContent.includes("Bid placed")');await capture(row.version+'-receipt');await pause(2500);
   const rival=apiClient(base);await rival('POST',`/api/v1/e/${f.code}/join`,{requestId:randomUUID(),displayName:'Rival',businessName:'Other business'});await rival('POST',`/api/v1/e/${f.code}/bid`,{requestId:randomUUID(),itemId:f.item.id,amountMinor:12500});
   await wait('return document.body.textContent.includes("outbid")');await capture(row.version+'-outbid');
   await session('url',{url:base+'/e/'+f.code+'?s=mine'});await pause(1000);await capture(row.version+'-my-bids');
   await session('url',{url:base+'/e/'+f.code+'?s=give'});await wait('return !!document.querySelector(".give-pick") || !!document.querySelector(".causes")');await click('.cause');await click('.amt-chip');await click('.give-layout button.primary');await wait('return document.body.textContent.includes("Confirm $")');await click('.give-layout button.primary');await wait('return document.body.textContent.includes("recorded") || document.body.textContent.includes("Thank you")');await capture(row.version+'-donation');
   const w=await f.host('GET',`/api/v1/host/events/${f.event.id}`),p=w.participants.find(p=>p.name==='Safari test'),rejoin=await f.host('POST',`/api/v1/host/events/${f.event.id}/participants/${p.id}/rejoin`,{});
   await session('cookie',undefined,'DELETE');await session('url',{url:base+'/e/'+f.code});await wait('return !!document.querySelector(".join-card .btn-link")');await click('.join-card .btn-link');await wait('return !!document.querySelector(".pa-code")');await fill('.pa-code',rejoin.code);await click('.stack-form button.primary');await wait('return !!document.querySelector(".pa-main")');await capture(row.version+'-rejoin');
  }
  row.status='passed';await wd('DELETE','/session/'+sid);sid=null;await writeFile(out+'/matrix.json',JSON.stringify(matrix,null,2));
 }
 console.log('PASS real iOS Safari matrix; screenshots in '+out);
}catch(e){console.error((checking?'iOS validation failed: ':'iOS environment incomplete: ')+e.message);process.exitCode=checking?1:99;}finally{if(sid)await wd('DELETE','/session/'+sid).catch(()=>{});driver.kill();await writeFile(out+'/matrix.json',JSON.stringify(matrix,null,2));}
