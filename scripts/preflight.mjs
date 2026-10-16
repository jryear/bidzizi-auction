#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
class CheckError extends Error {constructor(message){super(message);this.safe=true;}}
const need=(ok,message)=>{if(!ok)throw new CheckError(message);};
export function validateOptions(o){
 let u;try{u=new URL(o.origin);}catch{throw new CheckError('Supply an explicit app origin.');}
 need(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&u.origin===o.origin,'Use an origin only, without a path or credentials.');
 if(o.local){let db;try{db=new URL(o.databaseUrl);}catch{throw new CheckError('Local mode requires a disposable database.');}need(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&Number(u.port)>1024&&db.hostname==='127.0.0.1'&&/^\/bz_test_[a-z0-9_]+$/.test(db.pathname)&&!process.env.VERCEL,'Local mode permits only explicit loopback app and bz_test_* database.');}
 else need(u.protocol==='https:'&&!['localhost','127.0.0.1','::1'].includes(u.hostname),'Use a verified HTTPS hosted origin.');
 need(process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0','TLS verification is disabled; restore it before preflight.');
 need(/^[A-HJ-NP-Z2-9]{6}$/.test(o.eventCode??''),'Supply the six-character event code.');
 need(/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(o.startsAt??'')&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(o.endsAt??'')&&Number.isFinite(Date.parse(o.startsAt))&&Number.isFinite(Date.parse(o.endsAt))&&Date.parse(o.startsAt)<Date.parse(o.endsAt),'Supply valid expected start and end instants, including timezone.');
 need(Number.isInteger(o.minItems??1)&&(o.minItems??1)>0,'Expected visible-item minimum must be positive.');
 if(o.practice){need(o.local||['https://app.bidzizi.com','https://staging.bidzizi.com'].includes(o.origin),'Practice credentials may go only to the approved app origins.');need(Boolean(o.hostEmail&&o.hostPassword),'Practice mode needs server-held host credentials.');}
}
export async function runPreflight(o,{fetcher=fetch,now=Date.now,id=randomUUID}={}){
 const report={at:new Date(now()).toISOString(),origin:o.origin,eventCode:o.eventCode,readOnly:!o.practice,checks:[],warnings:[],passed:false};
 const check=(name,passed,action)=>report.checks.push({name,passed,...(!passed?{action}:{})});
 try{validateOptions(o);}catch(e){check('Inputs',false,e.safe?e.message:'Invalid preflight inputs.');return report;}
 let stopped=false;
 function client(){const jar=new Map();return async(method,path,body)=>{
  need(!stopped,'Platform stop: contact the engineer before retrying.');
  let r;try{r=await fetcher(o.origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{origin:o.origin,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new CheckError('Cannot reach the app with verified TLS. Check network, DNS, certificate and origin.');}
  if([403,429].includes(r.status)||r.headers.get('x-vercel-mitigated')||r.headers.get('x-vercel-error')||(r.status>=300&&r.status<400)){stopped=true;throw new CheckError('Platform blocked or challenged the request. Stop and contact the engineer.');}
  for(const s of r.headers.getSetCookie()){const [k,...v]=s.split(';')[0].split('=');if(/Max-Age=0/.test(s))jar.delete(k);else jar.set(k,v.join('='));}
  let data;try{data=r.headers.get('content-type')?.includes('application/json')?await r.json():null;}catch{throw new CheckError('The app returned an unreadable response; contact the engineer.');}
  return {status:r.status,data};
 };}
 const guest=client();
 try{
  const reach=await guest('GET','/join');need(reach.status===200,'Join page is unavailable; check origin and deployment.');check('HTTPS and reachability',true);
  const r=await guest('GET','/api/v1/e/'+o.eventCode);need(r.status===200,'Event is unavailable to guests. Check the code and publish state.');
  const s=r.data;need(s?.preview===false&&s.event?.code===o.eventCode,'Expected a public event snapshot; check the event code.');
  check('Event status',s.event.phase!=='closed'&&s.event.entryOpen===true,'Event is closed or new entry is off; confirm the intended schedule and entry switch.');
  check('Expected event times',Date.parse(s.event.startsAt)===Date.parse(o.startsAt)&&Date.parse(s.event.endsAt)===Date.parse(o.endsAt),'Opening/closing times differ. Confirm the expected instants and correct Studio schedule.');
  const items=s.items??[];check('Visible items',items.length>=(o.minItems??1)&&(o.expectedItemIds??[]).every(id=>items.some(i=>i.id===id&&!i.withdrawn)),'Items are missing, hidden or withdrawn. Check Show/Hide and the expected item list.');
  const a=o.alerts,age=now()-Date.parse(a?.verifiedAt);
  const ready=a?.origin===o.origin&&age>=0&&age<=86400000&&a.dsnConfigured===true&&a.rulesEnabled===true&&a.deliveryDemonstrated===true;
  check('Alert readiness',ready,'Engineer must refresh the <=24h deployment/DSN/rule readback and confirm demonstrated inbox delivery.');
  if(ready&&a.subminuteProofPassed!==true){report.warnings.push('Measured email delivery exceeded 60 seconds. Keep direct staff-to-engineer escalation available.');if(o.requireSubminute)check('Subminute alert target',false,'The strict 60-second delivery target has not passed.');}
 }catch(e){check('Guest checks',false,e.safe?e.message:'Guest checks failed; contact the engineer.');}
 if(o.practice&&report.checks.every(c=>c.passed)){
  const host=client(),name='Preflight practice '+id(),requestId=id();let eventId=null,loggedIn=false,created=false;
  report.practice={name,created:false,joined:false,cleanupConfirmed:false};
  const call=async(method,path,body)=>{const r=await host(method,path,body);need(r.status>=200&&r.status<300,'Practice API action failed. Check host access; inspect the named practice fixture.');return r.data;};
  try{
   await call('POST','/api/v1/host/login',{email:o.hostEmail,password:o.hostPassword});loggedIn=true;
   const start=new Date(now()-60000).toISOString(),end=new Date(now()+600000).toISOString();created=true;
   eventId=(await call('POST','/api/v1/host/events',{requestId,name,isPractice:true,startsAt:start,endsAt:end})).id;report.practice.eventId=eventId;report.practice.created=true;
   const w=await call('GET','/api/v1/host/events/'+eventId);need(w.event.name===name&&w.event.isPractice===true,'Practice ownership check failed.');
   await call('POST',`/api/v1/host/events/${eventId}/items`,{requestId:id(),title:'Preflight practice item',openingMinor:100,ready:true});
   const fresh=await call('GET','/api/v1/host/events/'+eventId);await call('PATCH','/api/v1/host/events/'+eventId,{revision:fresh.event.revision,status:'live'});
   const joined=await client()('POST','/api/v1/e/'+fresh.event.code+'/join',{requestId:id(),displayName:'Preflight practice',businessName:'Practice'});need(joined.status===200||joined.status===201,'Practice join failed; investigate before guests arrive.');report.practice.joined=true;check('Practice join',true);
  }catch(e){check('Practice journey',false,e.safe?e.message:'Practice journey failed; inspect its fixture.');}
  finally{
   try{
    if(loggedIn&&created&&!eventId){const listing=await call('GET','/api/v1/host/events');const events=Array.isArray(listing)?listing:listing.events;need(Array.isArray(events),'Cannot discover a lost practice create response.');const matches=events.filter(e=>e.name===name&&e.isPractice);need(matches.length<=1,'Ambiguous practice fixture; contact engineer.');eventId=matches[0]?.id??null;}
    if(eventId){report.practice.eventId=eventId;need(/^[a-f0-9-]{36}$/.test(eventId),'Invalid practice event identity.');const w=await call('GET','/api/v1/host/events/'+eventId);need(w.event.name===name&&w.event.isPractice===true,'Refusing to delete an event that does not match the practice fixture.');await call('DELETE','/api/v1/host/events/'+eventId);const absent=await host('GET','/api/v1/host/events/'+eventId);need(absent.status===404,'Practice cleanup could not be confirmed.');}
    report.practice.cleanupConfirmed=true;check('Practice cleanup',true);
   }catch{check('Practice cleanup',false,'Cleanup failed. Engineer must remove only the uniquely named practice event shown in this report and confirm absence.');}
   if(loggedIn){try{await call('POST','/api/v1/host/logout',{});check('Practice host session logout',true);}catch{check('Practice host session logout',false,'Practice host session logout failed; engineer must verify session cleanup.');}}
  }
 }
 report.passed=report.checks.every(c=>c.passed);return report;
}
export function parseArgs(args){const o={minItems:1};for(let i=0;i<args.length;i++){
 const flags={'--origin':'origin','--event-code':'eventCode','--starts-at':'startsAt','--ends-at':'endsAt','--min-items':'minItems','--alerts':'alertsPath'};
 const booleans={'--practice-event':'practice','--local-test':'local','--require-subminute':'requireSubminute'};
 if(flags[args[i]]){need(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'Missing required option value.');o[flags[args[i]]]=args[++i];}
 else if(booleans[args[i]])o[booleans[args[i]]]=true;else throw new CheckError('Unknown preflight option.');
 }o.minItems=Number(o.minItems);return o;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const o=parseArgs(process.argv.slice(2));o.databaseUrl=process.env.BIDZIZI_DATABASE_URL;o.hostEmail=process.env.PREFLIGHT_HOST_EMAIL;o.hostPassword=process.env.PREFLIGHT_HOST_PASSWORD;try{o.alerts=JSON.parse(await readFile(o.alertsPath,'utf8'));}catch{o.alerts=null;}const r=await runPreflight(o);console.log(JSON.stringify(r,null,2));if(!r.passed)process.exitCode=1;}catch(e){console.log(JSON.stringify({passed:false,action:e.safe?e.message:'Preflight could not run; check inputs.'}));process.exitCode=1;}
}
