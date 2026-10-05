// Protected disposable-process probe only. Never loaded by normal app commands.
// No public route, application environment switch, or writable product clock.
const http=require('node:http');
const RealDate=Date;
const skew=365*24*60*60*1000;
global.Date=class EvidenceDate extends RealDate{
  constructor(...args){super(...(args.length?args:[RealDate.now()+skew]));}
  static now(){return RealDate.now()+skew;}
};
const end=http.ServerResponse.prototype.end;
http.ServerResponse.prototype.end=function(...args){
  if(!this.headersSent)this.setHeader('x-fixed-app-clock-skew-ms',String(Date.now()-RealDate.now()));
  return end.apply(this,args);
};
