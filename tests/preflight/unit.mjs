import assert from 'node:assert/strict';import {runPreflight,validateOptions} from '../../scripts/preflight.mjs';
const now=Date.parse('2026-10-16T16:00:00Z'),origin='https://app.bidzizi.com',eventCode='ABCDEF',startsAt='2026-11-19T18:00:00Z',endsAt='2026-11-20T02:00:00Z';
const options={origin,eventCode,startsAt,endsAt,alerts:{origin,verifiedAt:new Date(now).toISOString(),dsnConfigured:true,rulesEnabled:true,deliveryDemonstrated:true,subminuteProofPassed:false}};
function stub(mode){const calls=[];let fixture=null,deleted=false;const f=async(url,init)=>{const path=new URL(url).pathname;calls.push({method:init.method,path});
 if(mode==='network')throw new Error('private connection string must not appear');if(mode==='tls')throw Object.assign(new Error('private certificate details'),{cause:{code:'CERT_HAS_EXPIRED'}});
 const reply=(data,status=200)=>Response.json(data,{status});
 if(path==='/join')return new Response('join',{status:mode==='challenge'?429:200});
 if(path==='/api/v1/e/ABCDEF')return reply({preview:false,event:{code:eventCode,startsAt:mode==='times'?'2026-11-19T19:00:00Z':startsAt,endsAt,phase:'upcoming',entryOpen:true},items:mode==='hidden'?[]:[{id:'visible'}]});
 if(path==='/api/v1/host/logout')return reply({ok:true});
 if(path==='/api/v1/host/login')return reply({ok:true});
 if(path==='/api/v1/host/events'&&init.method==='POST'){const b=JSON.parse(init.body);fixture={id:'11111111-1111-4111-8111-111111111111',name:b.name,isPractice:true,code:'GJKLMN',revision:1};if(mode==='lostCreate')throw new Error('response loss');return reply({id:fixture.id},201);}
 if(path==='/api/v1/host/events')return reply({events:fixture&&!deleted?[fixture]:[]});
 if(path.endsWith('/items'))return reply({id:'item'},201);
 if(path==='/api/v1/e/GJKLMN/join')return reply(mode==='joinFailure'?{error:{code:'FAIL'}}:{participant:{}},mode==='joinFailure'?503:201);
 if(init.method==='DELETE'){if(mode==='cleanupFailure')return reply({error:{}},500);deleted=true;return reply({ok:true});}
 if(init.method==='PATCH')return reply({ok:true});
 if(path.endsWith('11111111-1111-4111-8111-111111111111'))return reply(deleted?{error:{}}:{event:fixture},deleted?404:200);
 throw new Error('Unexpected stub path');};return {fetcher:f,calls,get deleted(){return deleted;}};}
for(const [mode,pass]of [['normal',true],['network',false],['tls',false],['times',false],['hidden',false],['challenge',false]]){const t=stub(mode),r=await runPreflight(options,{fetcher:t.fetcher,now:()=>now});assert.equal(r.passed,pass,mode);assert.ok(t.calls.every(c=>c.method==='GET'));assert.ok(!JSON.stringify(r).includes('private'));}
for(const field of ['dsnConfigured','rulesEnabled','deliveryDemonstrated']){const t=stub('normal');const r=await runPreflight({...options,alerts:{...options.alerts,[field]:false}},{fetcher:t.fetcher,now:()=>now});assert.equal(r.passed,false,field);}
assert.equal((await runPreflight({...options,alerts:{...options.alerts,verifiedAt:'2026-10-14T00:00:00Z'}},{fetcher:stub('normal').fetcher,now:()=>now})).passed,false);
assert.equal((await runPreflight({...options,requireSubminute:true},{fetcher:stub('normal').fetcher,now:()=>now})).passed,false);
for(const mode of ['normal','joinFailure','cleanupFailure','lostCreate']){const t=stub(mode);const r=await runPreflight({...options,practice:true,hostEmail:'fixture@example.test',hostPassword:'unit-only'},{fetcher:t.fetcher,now:()=>now});assert.equal(r.passed,mode==='normal',mode);assert.equal(r.practice.cleanupConfirmed,mode!=='cleanupFailure',mode);assert.equal(t.calls.filter(c=>c.method==='POST'&&c.path==='/api/v1/host/events').length,1);assert.ok(t.calls.filter(c=>c.method==='DELETE').every(c=>c.path.endsWith('11111111-1111-4111-8111-111111111111')));}
assert.throws(()=>validateOptions({...options,practice:true,origin:'https://unapproved.example',hostEmail:'x',hostPassword:'x'}));assert.throws(()=>validateOptions({...options,origin:'http://app.bidzizi.com'}));assert.throws(()=>validateOptions({...options,startsAt:'2026-11-19'}));
console.log('PASS preflight: read-only default, unreachable/TLS, times, hidden items, disarmed/stale alerts, strict latency, platform stop, practice join/cleanup failure, lost create response and credential-origin guard. Stub transport only.');
// Actual untrusted TLS handshake, confined to an owned loopback HTTPS receiver.
const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync,spawnSync}=await import('node:child_process'),{createServer}=await import('node:https');
const dir=await mkdtemp(join(tmpdir(),'bz-preflight-tls-'));let server;
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1'],{stdio:'ignore'});
 server=createServer({key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))},(_req,res)=>res.end('untrusted'));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let rejected=false;
 const r=await runPreflight(options,{now:()=>now,fetcher:async()=>{try{return await fetch('https://127.0.0.1:'+server.address().port,{signal:AbortSignal.timeout(3000)});}catch(e){rejected=/SELF_SIGNED|CERT/.test(e.cause?.code??'');throw e;}}});
 assert.ok(rejected);assert.equal(r.passed,false);assert.ok(JSON.stringify(r).includes('verified TLS'));
 const cli=spawnSync(process.execPath,['scripts/preflight.mjs','--origin','http://app.bidzizi.com','--event-code','ABCDEF','--starts-at',startsAt,'--ends-at',endsAt],{encoding:'utf8'});assert.equal(cli.status,1);assert.equal(JSON.parse(cli.stdout).passed,false);
 console.log('PASS actual self-signed TLS rejection and nonzero CLI failure exit.');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
