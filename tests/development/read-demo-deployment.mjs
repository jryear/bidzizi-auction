// Read only canonical GitHub/Vercel metadata and the existing synthetic alias.
// Credentials are consumed by the authenticated CLIs, never emitted or stored.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const [source,deploymentId,filename]=process.argv.slice(2);
const origin='https://staging.bidzizi.com';
const projectId='prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP';
const teamId='team_fOkqe9T0PRKMmdczUvnoMXct';
const cli=(name,args)=>execFileSync(name,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
 if(!/^[a-f0-9]{40}$/.test(source)||!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)||! /^[A-Z0-9_]+\.json$/.test(filename))throw Error('Arguments');
 const canonicalMain=cli('gh',['api','repos/jryear/bidzizi-auction/git/ref/heads/main','--jq','.object.sha']);
 assert.equal(canonicalMain,source);
 const deployment=JSON.parse(cli('vercel',['api',`/v13/deployments/${deploymentId}?teamId=${teamId}`]));
 const alias=JSON.parse(cli('vercel',['api',`/v4/aliases/staging.bidzizi.com?teamId=${teamId}`]));
 assert.equal(deployment.id,deploymentId);assert.equal(deployment.projectId,projectId);
 assert.equal(deployment.readyState,'READY');assert.equal(deployment.target,'production');
 assert.equal(deployment.meta.githubCommitSha,source);assert.equal(deployment.meta.githubCommitRef,'main');
 assert.equal(deployment.meta.githubRepo,'bidzizi-auction');assert.equal(deployment.meta.githubCommitOrg,'jryear');
 assert.equal(alias.alias,'staging.bidzizi.com');assert.equal(alias.projectId,projectId);assert.equal(alias.deploymentId,deploymentId);
 const paths=['/staging-catalog/bidding.js','/staging-catalog/collections.js','/staging-catalog/donations.js',
  '/staging-catalog/views.js','/staging-catalog/styles.css','/staging-admin/staff-operations.js','/staging-admin/styles.css',
  '/staging-bidder-preview/styles.css','/staging-bidder-preview/src/views.js'];
 const assets=[];
 for(const path of paths){
  const response=await fetch(origin+path,{cache:'no-store'});assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  const expected=execFileSync('git',['show',source+':public'+path]);assert.ok(bytes.equals(expected));
  assets.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),sourceMatches:true});
 }
 const root=await fetch(origin+'/',{redirect:'manual',cache:'no-store'});
 assert.equal(root.status,307);assert.equal(root.headers.get('location'),'/events/990280fa-51db-47cd-aabe-5d15bf776002');
 const routes=[];
 for(const path of ['/admin','/events/990280fa-51db-47cd-aabe-5d15bf776002','/events/9c32e7e7-cf56-4c6b-a1fb-3e31a5d009c6']){
  const response=await fetch(origin+path,{cache:'no-store'});assert.equal(response.status,200);routes.push({path,status:response.status});
 }
 for(const id of ['990280fa-51db-47cd-aabe-5d15bf776002','9c32e7e7-cf56-4c6b-a1fb-3e31a5d009c6']){
  const path=`/api/demo/events/${id}/entry`,response=await fetch(origin+path,{cache:'no-store'}),data=await response.json();
  assert.equal(response.status,200);assert.equal(data.eventId,id);assert.equal(data.demoEntry,true);routes.push({path,status:response.status,demoEntry:true});
 }
 const session=await (await fetch(origin+'/api/session',{cache:'no-store'})).json();
 assert.equal(session.testMode,true);assert.equal(session.authenticated,false);
 for(const path of ['/api/admin/events/990280fa-51db-47cd-aabe-5d15bf776002/results','/api/admin/events/990280fa-51db-47cd-aabe-5d15bf776002/donations']){
  const response=await fetch(origin+path,{cache:'no-store'});assert.ok([401,403,404].includes(response.status));routes.push({path,status:response.status,anonymousPrivateDenial:true});
 }
 const report={checkedAt:new Date().toISOString(),readOnly:true,canonicalMain,sourceCommit:source,deploymentId,projectId,origin,
  target:deployment.target,regions:deployment.regions,generatedUrl:deployment.url,readyState:deployment.readyState,aliasBound:true,
  root:{status:root.status,location:root.headers.get('location')},assets,routes,
  scope:'Exact existing synthetic demo deployment, actual alias/source/served bytes and anonymous real paths; no sign-in or data writes. Rendered successor verification is separately owned by frontend.'};
 const path='docs/evidence/overnight-release/'+filename;
 await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({path,source,deploymentId,readyState:report.readyState,aliasBound:true,servedAssets:assets.length,realRoutes:routes.length}));
}catch(error){
 console.error(error instanceof assert.AssertionError?'Observed demo release binding/byte/path mismatch; private inputs withheld.':'Demo readback harness/provider setup failed; private inputs withheld.');
 process.exitCode=error instanceof assert.AssertionError?1:99;
}
