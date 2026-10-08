// Manual acceptance fixture bootstrap only. No actor, fixture schedule or bid exists yet.
import {createHash} from 'node:crypto';
import {HarnessError} from '../staging-manual-bid/harness.mjs';
import {ids} from '../staging-manual-bid/fixtures.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=why=>{throw new HarnessError('Manual receipt-route readiness: '+why);};
async function databaseDigest(f){
 const names=(await f.db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename),tables={};
 for(const name of names){if(!/^bz_[a-z0-9_]+$/.test(name))fail('unexpected fixture table');const rows=(await f.db.query('SELECT to_jsonb(t)::text AS row FROM public."'+name+'" t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.row);tables[name]={rows:rows.length,sha256:hash(JSON.stringify(rows))};}
 return tables;
}
export async function prepareManualReceiptReadiness(f){
 const startedMs=Date.now();let before,after,responseRecord,error;
 try{
  if(!f||!/^\/tmp\/task-root\/bz-bid-[A-Za-z0-9]+$/.test(f.scratch||'')||!/^runtime_[a-f0-9]{12}$/.test(f.runtimeRole||'')||!/^migration_[a-f0-9]{12}$/.test(f.migratorRole||''))fail('owned disposable manual fixture required');
  const origin=new URL(f.origin);if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||!origin.port||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)fail('owned loopback origin required');
  if(f.fixtures!==undefined||f.opensAt!==undefined||f.closesAt!==undefined)fail('bootstrap must precede prepareFixture and short-window allocation');
  before=await databaseDigest(f);for(const name of ['bz_events','bz_lots','bz_catalog_approvals','bz_catalog_lots','bz_manual_bids','bz_bid_receipts','bz_lot_standing','bz_sessions'])if(before[name]?.rows!==0)fail('unallocated manual fixture required');
  const path='/api/bidder/events/'+ids.event+'/lots/'+ids.lotA+'/bid-receipts/10000000-0000-4000-8000-000000000099';
  // Exactly one actual GET. The existing request helper also uses20s; no retry or delay.
  const response=await fetch(origin.origin+path,{method:'GET',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(20_000)});
  const text=await response.text();responseRecord={path,status:response.status,cacheControl:response.headers.get('cache-control'),contentType:response.headers.get('content-type'),hasSetCookie:response.headers.has('set-cookie'),bodySHA256:hash(text),data:null};let data;try{data=JSON.parse(text);}catch{fail('actual response must contain sealed JSON');}responseRecord.data=data;
  if(response.status!==401)fail('actual unauthenticated receipt route must return401');
  if(!/no-store/i.test(responseRecord.cacheControl||'')||!/^application\/json\b/i.test(responseRecord.contentType||'')||responseRecord.hasSetCookie)fail('sealed unauthenticated no-store response required');
  if(JSON.stringify(data)!==JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Sign in to continue.'}}))fail('exact unauthenticated response required');
 }catch(e){error=e instanceof HarnessError?e:new HarnessError('Manual receipt-route readiness: actual request/setup unavailable ('+(e?.name||'Error')+')');}
 finally{
  if(before)try{after=await databaseDigest(f);if(JSON.stringify(after)!==JSON.stringify(before))error=new HarnessError('Manual receipt-route readiness: GET mutated fixture database');}catch{error=new HarnessError('Manual receipt-route readiness: database observation unavailable');}
 }
 const record={version:1,sourceRoot:f?.repo,startedMs,endedMs:Date.now(),fixture:f?.scratch,origin:f?.origin,eventId:ids.event,lotId:ids.lotA,requestMethod:'GET',credentials:'omit',response:responseRecord||null,databaseBefore:before||null,databaseAfter:after||null,databaseUnchanged:!!before&&JSON.stringify(before)===JSON.stringify(after),beforePrepareFixture:f?.fixtures===undefined&&f?.opensAt===undefined&&f?.closesAt===undefined,status:error?'HARNESS99':'ready',reason:error?.message||null};
 console.log('MANUAL_RECEIPT_READINESS '+JSON.stringify(record));if(error)throw error;return record;
}
