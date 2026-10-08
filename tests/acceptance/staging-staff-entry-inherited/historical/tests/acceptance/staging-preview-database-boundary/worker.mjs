import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {selectorCases,adapterCases} from './fixtures.mjs';
const [mode,id,root]=process.argv.slice(2);
const fixture=(mode==='selector'?selectorCases:adapterCases).find(item=>item.id===id);
assert.ok(fixture,'Declared fixed case must exist.');
globalThis.__boundary={pools:[],connects:0,attached:0,networkAttempts:0};
function noNetwork(){globalThis.__boundary.networkAttempts++;throw new Error('INDEPENDENT_NETWORK_FORBIDDEN');}
net.connect=net.createConnection=net.Socket.prototype.connect=noNetwork;
tls.connect=http.request=http.get=https.request=https.get=globalThis.fetch=noNetwork;
syncBuiltinESMExports();
function generic(error){
 assert.ok(error instanceof Error,'Refusal must throw an Error.');
 assert.doesNotMatch(error.message,/private_fixture|managed_fixture|private_staff|managed_staff|local_fixture_password|postgres(?:ql)?:\/\//i,'Refusal must not reveal fixture credential/target values.');
 return true;
}
try{
 if(mode==='selector'){
  const config=await import(pathToFileURL(resolve(root,'src/server/config.ts')).href);
  assert.equal(typeof config.databaseConnectionURL,'function','Exported databaseConnectionURL() is absent.');
  if(fixture.value)assert.equal(config.databaseConnectionURL(),fixture.value,'Selector must choose the declared environment boundary.');
  else assert.throws(()=>config.databaseConnectionURL(),generic);
  assert.equal(globalThis.__boundary.pools.length,0);
 }else{
  const database=await import(pathToFileURL(resolve(root,'src/server/db.ts')).href);
  let error;
  try{await database.transaction(async()=>assert.fail('Connection sentinel must stop before transaction callback.'));}catch(failure){error=failure;}
  assert.ok(error,'Adapter must either refuse configuration or encounter the fake connection sentinel.');
  if(fixture.value){
   assert.equal(error.message,'INDEPENDENT_POOL_CONNECT_SENTINEL','Valid adapter configuration must reach the fake Pool.');
   assert.equal(globalThis.__boundary.pools.length,1);
   assert.equal(globalThis.__boundary.connects,1);
   assert.equal(globalThis.__boundary.attached,fixture.attached);
   const expected=new URL(fixture.value);
   for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])expected.searchParams.delete(key);
   assert.equal(globalThis.__boundary.pools[0].connectionString,expected.toString(),'Actual Pool must receive only the selected target, with TLS URL overrides removed.');
   assert.deepEqual(globalThis.__boundary.pools[0].ssl,fixture.ssl,'Verified TLS must remain enabled outside explicitly disposable local mode.');
  }else{
   generic(error);
   assert.equal(globalThis.__boundary.pools.length,0,'Refused configuration must fail before any Pool is constructed.');
   assert.equal(globalThis.__boundary.connects,0);
  }
 }
 assert.equal(globalThis.__boundary.networkAttempts,0,'Pure boundary evidence must never attempt network I/O.');
 console.log(`PASS ${mode}: ${id}`);
}catch(error){
 const dependency=error.code==='ERR_MODULE_NOT_FOUND'&&/package '(?:server-only|typescript)'/.test(error.message);
 console.error(`${dependency?'HARNESS':'FAIL'} ${mode}/${id}: ${error.message}`);
 process.exitCode=dependency?99:1;
}
