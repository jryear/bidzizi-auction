// Protected disposable-process probe only. Never loaded by normal app commands.
// No public route, application environment switch, or writable product clock.
'use strict';
const http=require('node:http');
const RealDate=Date;
const skew=365*24*60*60*1000;
// A callable wrapper preserves Date() and all native OWN static descriptors.
// Next clones those descriptors: inheriting UTC/parse from a class loses them.
function EvidenceDate(...args){
  if(new.target===undefined)return new RealDate(RealDate.now()+skew).toString();
  return Reflect.construct(RealDate,args.length?args:[RealDate.now()+skew],new.target);
}
Object.defineProperties(EvidenceDate,Object.getOwnPropertyDescriptors(RealDate));
Object.defineProperty(EvidenceDate,'now',{
  ...Object.getOwnPropertyDescriptor(RealDate,'now'),
  value:function now(){return RealDate.now()+skew;},
});
global.Date=EvidenceDate;
// Next can stream/write headers before end(). Stamp the actual worker clock
// at the last synchronous header-commit boundary, including implicit writes.
function markClock(response){
  if(!response.headersSent)response.setHeader('x-fixed-app-clock-skew-ms',String(Date.now()-RealDate.now()));
}
const writeHead=http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead=function(...args){
  markClock(this);
  return writeHead.apply(this,args);
};
const end=http.ServerResponse.prototype.end;
http.ServerResponse.prototype.end=function(...args){
  markClock(this);
  return end.apply(this,args);
};
