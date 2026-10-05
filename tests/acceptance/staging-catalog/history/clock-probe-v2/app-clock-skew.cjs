// Protected disposable-process probe only. Never loaded by normal app commands.
// No public route, application environment switch, or writable product clock.
const http=require('node:http');
const RealDate=Date;
const skew=365*24*60*60*1000;
global.Date=class EvidenceDate extends RealDate{
  constructor(...args){super(...(args.length?args:[RealDate.now()+skew]));}
  static now(){return RealDate.now()+skew;}
};
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
