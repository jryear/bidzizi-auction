#!/usr/bin/env node
// Read only: extract only our explicitly allowlisted alert records; never emit raw runtime logs.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { targets } from '../load/staging-provider.mjs';
const path='docs/evidence/nov19/alerts-production-proof.json';
const proof=JSON.parse(await readFile(path,'utf8'));assert.ok(proof.finishedAt && proof.cleanup.confirmed);
const ids=new Set(Object.values(proof.scenarios).map(x=>x.alertId));
const notices=[];
function inspect(value){
  if(typeof value==='string'&&value.startsWith('BidZizi alert ')){
    try{
      const n=JSON.parse(value.slice('BidZizi alert '.length));
      if(ids.has(n.eventId)&&['accepted','failed'].includes(n.status)&&['server-failure','guest-blocked'].includes(n.category))
        notices.push({eventId:n.eventId,status:n.status,category:n.category,check:n.check,occurredAt:n.occurredAt,at:n.at,providerDate:n.providerDate??null});
    }catch{/* unrecognized logs ignored */}
  }else if(Array.isArray(value))for(const v of value)inspect(v);
  else if(value&&typeof value==='object')for(const v of Object.values(value))inspect(v);
}
try{
  const raw=execFileSync('/Users/jryear/.local/bin/vercel',['logs','--project',targets.production.project,'--deployment',proof.deploymentId,
    '--scope','saturn-ea53','--source','serverless','--since',proof.startedAt,'--query','"BidZizi alert"','--limit','100','--json'],
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000,maxBuffer:2*1024*1024});
  for(const line of raw.split('\n')){try{inspect(JSON.parse(line));}catch{/* CLI prose ignored */}}
}catch{proof.logCollection={at:new Date().toISOString(),available:false,reason:'Runtime log query failed; raw output suppressed.'};}
proof.deliveryNotices=[...new Map(notices.map(n=>[n.eventId+"|"+n.at+"|"+n.status,n])).values()];
proof.logCollection??={at:new Date().toISOString(),available:true,matched:notices.length};
for(const scenario of Object.values(proof.scenarios)){
  const n=notices.find(n=>n.eventId===scenario.alertId&&n.status==='accepted');
  if(n){scenario.serverOccurredAt=n.occurredAt;scenario.ingestAcceptedAt=n.at;scenario.providerHttpDate=n.providerDate;
    scenario.detectionTimestamp={confirmed:false,reason:'Ingest HTTP acceptance is not Sentry detection or inbox delivery. Await Sentry event received timestamp and engineer receipt.'};}
}
await writeFile(path,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({logCollection:proof.logCollection,notices,inboxProofPending:!proof.inboxProof.confirmed}));
