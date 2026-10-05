// Evaluate the EXACT browser initializer in an isolated JS realm, no browser/app.
'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/browser.mjs','utf8');
const start='if(skewMs)await context.addInitScript(offset=>{',end='},skewMs);';
const from=source.indexOf(start);assert.ok(from>=0);
const to=source.indexOf(end,from);assert.ok(to>from);
const body=source.slice(from+start.length,to);
let controls=0;
for(const offset of [-86400000,86400000]){
 const realm=vm.createContext({});
 vm.runInContext('globalThis.NativeDate=Date',realm);
 vm.runInContext(`(offset=>{${body}})(${offset})`,realm);
 const result=vm.runInContext(`(()=>{
  const before=NativeDate.now(),now=Date.now(),after=NativeDate.now();
  class Extended extends Date{};const derived=new Extended();
  return {now,before,after,implicit:new Date().getTime(),callable:NativeDate.parse(Date()),
   utc:Date.UTC(2000,0,2,3,4,5,123),parsed:Date.parse('2000-01-02T03:04:05.123Z'),
   explicit:new Date('2000-01-02T03:04:05.123Z').getTime(),nullValue:new Date(null).getTime(),
   names:Object.getOwnPropertyNames(Date).sort().join(','),nativeNames:Object.getOwnPropertyNames(NativeDate).sort().join(','),
   ownUTC:Object.hasOwn(Date,'UTC'),ownParse:Object.hasOwn(Date,'parse'),subclass:derived instanceof Extended&&derived instanceof Date};
 })()`,realm);
 assert.ok(result.now>=result.before+offset&&result.now<=result.after+offset);
 assert.ok(result.implicit>=result.before+offset&&result.implicit<=Date.now()+offset);
 assert.ok(result.callable>=result.before+offset-1000&&result.callable<=Date.now()+offset);
 assert.equal(result.utc,946782245123);assert.equal(result.parsed,946782245123);assert.equal(result.explicit,946782245123);
 assert.equal(result.nullValue,0);assert.equal(result.names,result.nativeNames);assert.equal(result.ownUTC,true);assert.equal(result.ownParse,true);assert.equal(result.subclass,true);controls+=11;
}
console.log(JSON.stringify({actual_browser_initializer_controls:controls,offsets:[-86400000,86400000],app_network_db_browser_processes:0}));
