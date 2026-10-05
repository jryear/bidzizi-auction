import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const repo=process.argv[3];let child;let output='';
try{
 const port=await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 child=spawn(process.execPath,['--require',process.argv[2],repo+'/node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:repo,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:'/tmp/task-root',NEXT_TELEMETRY_DISABLED:'1'},detached:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});
 const start=Date.now();let r;
 while(Date.now()-start<60000){if(child.exitCode!==null)throw Error('Next exited before response');try{r=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(10000)});}catch{}if(r)break;await new Promise(done=>setTimeout(done,100));}
 if(!r)throw Error('Next setup deadline');
 const text=await r.text(),header=r.headers.get('x-fixed-app-clock-skew-ms');
 console.log(JSON.stringify({status:r.status,header,htmlBytes:text.length,elapsedMs:Date.now()-start}));
 assert.equal(r.status,200);assert.ok(header!==null&&Math.abs(Number(header)-365*86400000)<10,'Actual Next worker clock proof must survive streamed header commit');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}await Promise.race([new Promise(done=>child.once('exit',done)),new Promise(done=>setTimeout(done,5000))]);if(child.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{}}}}
