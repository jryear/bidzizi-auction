// Separate, explicitly authorized production-proof adapter. The normal provider stays read-only for production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { providers, targets } from '../load/staging-provider.mjs';
export async function productionProofProviders(approved) {
 assert.equal(approved,true,'Explicit production practice-proof approval is required.');
 const base=await providers();
 const va=JSON.parse(await readFile('/Users/jryear/Library/Application Support/com.vercel.cli/auth.json','utf8'));
 const na=JSON.parse(await readFile('/Users/jryear/.config/neon/credentials.json','utf8'));
 async function get(host,path,token){const r=await fetch(`https://${host}${path}`,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token}});assert.ok(r.ok,`Provider GET failed (${r.status}); details suppressed.`);return r.json();}
 const neon=path=>get('console.neon.tech','/api/v2/projects/delicate-math-48681189'+path,na.access_token);
 const vercel=path=>get('api.vercel.com',path+(path.includes('?')?'&':'?')+'teamId=team_fOkqe9T0PRKMmdczUvnoMXct',va.token);
 async function database(label,purpose,readOnly){
  if(readOnly)return base.database(label,purpose,true);
  assert.equal(label,'production');assert.equal(purpose,'alert-fixture-control');
  const t=targets.production,ep=(await neon('/endpoints')).endpoints.find(e=>e.id===t.endpoint);assert.equal(ep?.branch_id,t.branch);
  const dbInfo=(await neon(`/branches/${t.branch}/databases`)).databases.find(d=>d.name==='neondb');assert.ok(dbInfo?.owner_name);
  const params=new URLSearchParams({branch_id:t.branch,endpoint_id:t.endpoint,database_name:dbInfo.name,role_name:dbInfo.owner_name,pooled:'false'});
  const u=new URL((await neon('/connection_uri?'+params)).uri);assert.ok(u.hostname.startsWith(t.endpoint+'.')&&u.hostname.endsWith('.neon.tech'));
  for(const k of ['sslmode','sslcert','sslkey','sslrootcert','channel_binding'])u.searchParams.delete(k);
  const db=new pg.Client({connectionString:u.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000,query_timeout:10000,options:'-c statement_timeout=8000',application_name:'nov19-production-alert-fixture-control'});
  db.on('error',()=>{});await db.connect();return db;
 }
 async function assertProductionDeployment(deploymentId,sourceCommit){
  assert.match(deploymentId,/^dpl_[A-Za-z0-9]+$/);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
  const alias=await vercel('/v4/aliases/'+targets.production.alias);assert.equal(alias.deployment?.id??alias.deploymentId,deploymentId);
  const d=await vercel('/v13/deployments/'+deploymentId);assert.equal(d.projectId,targets.production.project);assert.equal(d.readyState,'READY');assert.equal(d.meta?.sourceCommit,sourceCommit);
  const other=await vercel('/v4/aliases/'+targets.staging.alias);assert.equal(other.deployment?.id??other.deploymentId,targets.staging.deployment);
  return {deploymentId,sourceCommit,readyState:d.readyState,projectId:d.projectId,stagingUnchanged:true};
 }
 return {database,assertProductionDeployment};
}
