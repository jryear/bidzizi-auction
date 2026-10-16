// Real API and disposable DB integration. Never accepts a hosted target.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {writeFile} from 'node:fs/promises';import {runPreflight} from '../../scripts/preflight.mjs';import pg from 'pg';import {localConfig,verifyDatabaseTarget} from '../load/support.mjs';import {manifest} from '../restore/manifest.mjs';
const {base,database}=localConfig(),jar=new Map();
async function host(method,path,body){const r=await fetch(base+path,{method,redirect:'manual',headers:{origin:base,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});for(const s of r.headers.getSetCookie()){const[k,...v]=s.split(';')[0].split('=');jar.set(k,v.join('='));}const data=await r.json();assert.ok(r.status>=200&&r.status<300);return data;}
const db=new pg.Client({connectionString:database});await db.connect();await verifyDatabaseTarget(db,base);let event;
try{
 await host('POST','/api/v1/host/login',{email:process.env.HOST_EMAIL,password:process.env.HOST_PASSWORD});
 const startsAt=new Date(Date.now()+60000).toISOString(),endsAt=new Date(Date.now()+600000).toISOString();
 event=(await host('POST','/api/v1/host/events',{requestId:randomUUID(),name:'Preflight baseline '+randomUUID(),isPractice:true,startsAt,endsAt})).id;
 await host('POST',`/api/v1/host/events/${event}/items`,{requestId:randomUUID(),title:'Preflight visible item',openingMinor:100,ready:true});
 const w=await host('GET','/api/v1/host/events/'+event);await host('PATCH','/api/v1/host/events/'+event,{revision:w.event.revision,status:'live'});
 const o={origin:base,eventCode:w.event.code,startsAt,endsAt,local:true,databaseUrl:database,alerts:{origin:base,verifiedAt:new Date().toISOString(),dsnConfigured:true,rulesEnabled:true,deliveryDemonstrated:true,subminuteProofPassed:false}};
 const readonly=await runPreflight(o);assert.equal(readonly.passed,true);assert.equal((await db.query('SELECT count(*)::int n FROM participants WHERE event_id=$1',[event])).rows[0].n,0,'Default preflight must not join or mutate.');
 const practice=await runPreflight({...o,practice:true,hostEmail:process.env.HOST_EMAIL,hostPassword:process.env.HOST_PASSWORD});assert.equal(practice.passed,true,JSON.stringify(practice));assert.ok(practice.practice.joined&&practice.practice.cleanupConfirmed);
 const id=practice.practice.eventId;const rows=(await db.query(`SELECT (SELECT count(*)::int FROM events WHERE id=$1) events,(SELECT count(*)::int FROM items WHERE event_id=$1) items,(SELECT count(*)::int FROM participants WHERE event_id=$1) participants`,[id])).rows[0];assert.ok(Object.values(rows).every(n=>n===0));
 await db.query('SET default_transaction_read_only=on');const before=await manifest(db,event),after=await manifest(db,event);assert.deepEqual(before.tables,after.tables);await db.query('SET default_transaction_read_only=off');
 await writeFile('docs/evidence/nov19/preflight-local.json',JSON.stringify({at:new Date().toISOString(),passed:true,server:'next start after production build',readonly,practice,independentSqlCleanup:rows},null,2)+'\n');console.log('PASS real local preflight: read-only default, unique practice API create/publish/join/delete/logout, independent SQL cleanup.');
}finally{if(event)await host('DELETE','/api/v1/host/events/'+event);await host('POST','/api/v1/host/logout',{}).catch(()=>{});await db.end();}
