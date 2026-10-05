import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const child=spawn(process.execPath,['--require',process.argv[2],fileURLToPath(new URL('./stream-server.cjs',import.meta.url))],{stdio:['ignore','pipe','inherit']});
let output='';const start=Date.now();let failures=0;
try{
 const {port}=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server setup deadline')),10000);child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.split('\n')[0]));}});});
 for(const mode of ['end','explicit','array','flush','implicit']){
  const before=Date.now(),r=await fetch('http://127.0.0.1:'+port+'/'+mode,{signal:AbortSignal.timeout(10000)}),body=await r.json(),after=Date.now();
  const skew=365*86400000,header=r.headers.get('x-fixed-app-clock-skew-ms');
  let error=null;
  try{assert.ok(body.workerNow>=before+skew&&body.workerNow<=after+skew);assert.ok(body.workerConstructorNow>=before+skew&&body.workerConstructorNow<=after+skew);assert.equal(body.explicit,946684800000);assert.ok(header!==null&&Math.abs(Number(header)-skew)<10,'Actual worker proof header missing/wrong');}catch(e){error=e.message;failures++;}
  console.log(JSON.stringify({mode,status:r.status,header,body,elapsed:Date.now()-before,error}));
 }
}catch(e){console.error(e);process.exitCode=99;}
finally{child.kill('SIGTERM');await new Promise(done=>child.once('exit',done));}
if(process.exitCode===undefined)process.exitCode=failures?1:0;
console.log(JSON.stringify({failures,totalElapsedMs:Date.now()-start,exit:process.exitCode}));
