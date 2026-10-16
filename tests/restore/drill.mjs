#!/usr/bin/env node
// Approved drill: create one historical child, use read-only SQL, delete only that owned child.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import pg from 'pg';import {manifest} from './manifest.mjs';import {execFileSync} from 'node:child_process';import {setTimeout as sleep} from 'node:timers/promises';
assert.deepEqual(process.argv.slice(2),['--restore-drill-approved']);assert.match(process.version,/^v24\./);
const baseline=JSON.parse(await readFile('docs/evidence/nov19/restore-baseline.json','utf8'));
assert.equal(baseline.project,'delicate-math-48681189');assert.equal(baseline.parentBranch,'br-cold-glitter-arx1msrh');assert.match(baseline.branchName,/^nov19-restore-drill-\d{8}T\d{6}$/);assert.match(baseline.restorePoint.lsn,/^[0-9A-F]+\/[0-9A-F]+$/);
assert.ok(Date.now()-Date.parse(baseline.preparedAt)<3600000,'Prepare a fresh baseline.');
function refreshAuth(){try{execFileSync('/Users/jryear/.local/bin/neon',['projects','get',baseline.project,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000});}catch{throw new Error('Existing Neon authentication refresh failed; raw output suppressed.');}}
refreshAuth();
const root='https://console.neon.tech/api/v2/projects/'+baseline.project;
async function api(method,path,body){
 for(let attempt=0;attempt<2;attempt++){
  const auth=JSON.parse(await readFile('/Users/jryear/.config/neon/credentials.json','utf8'));
  const r=await fetch(root+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+auth.access_token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(r.status===401&&method==='GET'&&attempt===0){refreshAuth();continue;}
  assert.ok(r.ok,`Neon ${method} failed (${r.status}); details suppressed.`);return r.status===204?{}:r.json();
 }
}
const evidence={startedAt:new Date().toISOString(),project:baseline.project,parentBranch:baseline.parentBranch,branchName:baseline.branchName,restorePoint:baseline.restorePoint,productionSqlReadOnly:true,applicationSettingsChanged:false,cleanupConfirmed:false};
const save=()=>writeFile('docs/evidence/nov19/restore-drill.json',JSON.stringify(evidence,null,2)+'\n');
let branchId,db,createAttempted=false;
const owned=b=>b.name===baseline.branchName&&b.parent_id===baseline.parentBranch&&b.id!==baseline.parentBranch&&b.id!=='br-crimson-mountain-arsolcfe';
try{
 const raw=await api('GET',''),project=raw.project??raw;const retention=project.history_retention_seconds??project.settings?.history_retention_seconds;assert.ok(retention>0);assert.ok(Date.now()-Date.parse(baseline.restorePoint.at)<retention*1000);evidence.historyRetentionSeconds=retention;
 const before=(await api('GET','/branches')).branches;assert.ok(!before.some(b=>b.name===baseline.branchName),'Do not reuse an existing resource.');evidence.branchesBefore=before.map(b=>b.id).sort();await save();
 const createStart=performance.now();createAttempted=true;
 // Installed CLI creation accepts either a parent branch or an LSN, not both. Use documented API for this exact pair.
 const created=await api('POST','/branches',{branch:{name:baseline.branchName,parent_id:baseline.parentBranch,parent_lsn:baseline.restorePoint.lsn,expires_at:new Date(Date.now()+30*60000).toISOString()},endpoints:[{type:'read_write',autoscaling_limit_min_cu:0.25,autoscaling_limit_max_cu:0.25,suspend_timeout_seconds:300}]});
 const b=created.branch;assert.ok(owned(b));branchId=b.id;assert.equal(b.parent_lsn.toUpperCase(),baseline.restorePoint.lsn.toUpperCase());evidence.branchId=branchId;evidence.parentLsnReadback=b.parent_lsn;evidence.createSeconds=(performance.now()-createStart)/1000;await save();
 const ep=created.endpoints?.find(e=>e.branch_id===branchId)??(await api('GET','/endpoints')).endpoints.find(e=>e.branch_id===branchId);assert.ok(ep);evidence.endpointId=ep.id;
 evidence.phase='waiting-for-ready';await save();
 for(let i=0;i<60;i++){const current=(await api('GET','/branches/'+branchId)).branch;if(current.current_state==='ready')break;assert.ok(i<59,'Temporary branch did not become ready.');await sleep(1000);}
 evidence.phase='database-metadata';await save();
 const info=(await api('GET',`/branches/${branchId}/databases`)).databases.find(d=>d.name==='neondb');assert.ok(info?.owner_name);
 evidence.phase='connection-uri';await save();
 const params=new URLSearchParams({branch_id:branchId,endpoint_id:ep.id,database_name:info.name,role_name:info.owner_name,pooled:'false'});const u=new URL((await api('GET','/connection_uri?'+params)).uri);assert.ok(u.hostname.startsWith(ep.id+'.')&&u.hostname.endsWith('.neon.tech'));
 for(const k of ['sslmode','sslcert','sslkey','sslrootcert','channel_binding'])u.searchParams.delete(k);
 db=new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:30000,query_timeout:10000,options:'-c default_transaction_read_only=on -c statement_timeout=8000',application_name:'nov19-restore-drill-readonly'});db.on('error',()=>{});
 evidence.phase='connecting-readonly';await save();const verifyStart=performance.now();await db.connect();assert.equal(db.connection.stream.authorized,true);
 evidence.phase='comparing-manifest';await save();const recovered=await manifest(db,baseline.baseline.eventId);assert.deepEqual(recovered.tables,baseline.baseline.tables,'Recovered event/bids/receipts/standings must exactly match baseline.');
 evidence.recovered=recovered;evidence.verifiedTls=true;evidence.verifySeconds=(performance.now()-verifyStart)/1000;evidence.verificationPassed=true;await save();
}catch(e){evidence.failure={type:e.name,code:typeof e.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)?e.code:null,reason:'Restore drill failed; raw provider/database output suppressed.'};}
finally{
 await db?.end().catch(()=>{});
 try{
  evidence.phaseBeforeCleanup=evidence.phase;evidence.phase='cleanup';await save();const list=(await api('GET','/branches')).branches;
  // Discover by exact unique name/parent even if the create response was lost. Never retry creation.
  const matches=list.filter(owned);assert.ok(matches.length<=1);
  if(createAttempted&&matches.length){const b=matches[0];if(branchId)assert.equal(b.id,branchId);branchId=b.id;evidence.branchId=branchId;await api('DELETE','/branches/'+branchId);}
  const remaining=(await api('GET','/branches')).branches;assert.ok(!remaining.some(b=>b.id===branchId||b.name===baseline.branchName));
  assert.ok(evidence.branchesBefore.every(id=>remaining.some(b=>b.id===id)),'Pre-existing branches must remain.');
  const endpoints=(await api('GET','/endpoints')).endpoints;assert.ok(!endpoints.some(e=>e.branch_id===branchId));evidence.cleanupConfirmed=true;evidence.cleanupAt=new Date().toISOString();
 }catch{evidence.cleanupFailure='Verify/delete only the recorded owned drill branch; provider output suppressed.';}
 evidence.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({branchId:evidence.branchId,verificationPassed:evidence.verificationPassed??false,cleanupConfirmed:evidence.cleanupConfirmed,createSeconds:evidence.createSeconds,verifySeconds:evidence.verifySeconds}));
}
if(evidence.failure||!evidence.cleanupConfirmed)process.exitCode=1;
