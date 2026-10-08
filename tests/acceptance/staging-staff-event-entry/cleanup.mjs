// Scoped lifecycle successor. Historic harness bytes remain untouched.
// A private registry survives failure/cancellation; only validated owned process
// identities can authorize a signal. Missing identities fail99, never authorize.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {withFixture,HarnessError,pgBin} from './harness.mjs';
const command=(bin,args)=>spawnSync(bin,args,{encoding:'utf8',timeout:5000,maxBuffer:64*1024,env:{...process.env,TZ:'UTC',LC_ALL:'C'}});
const validPid=p=>Number.isSafeInteger(p)&&p>1;
const validBirth=b=>typeof b==='string'&&b.trim().length>0;
function birth(pid){
 if(!validPid(pid))throw new HarnessError('Invalid owned process identity');
 const r=command('/bin/ps',['-p',String(pid),'-o','lstart=']);
 if(r.error)throw new HarnessError('Owned process identity probe unavailable');
 return r.status===0&&r.stdout.trim()?r.stdout.trim():null;
}
function sameIdentity(pid,recorded){return validPid(pid)&&validBirth(recorded)&&birth(pid)===recorded;}
function live(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;if(e.code==='EPERM')return true;throw new HarnessError('Owned process liveness probe unavailable');}}
export async function withOwnedFixture(run,output){
 const registry={protocol:1,owner:'staging-staff-event-entry',scratch:[],next:[],postgres:[],identityFailures:[],phase:'starting',cleanupConfirmed:false};
 const path=join(output,'OWNED_SERVICES.json');let signalling=false;
 const save=async()=>writeFile(path,JSON.stringify(registry,null,2)+'\n');
 const scratchOK=s=>/^\/tmp\/task-root\/bz-bid-[A-Za-z0-9_-]+$/.test(s);
 async function identity(pid,kind){
  const observed=validPid(pid)?birth(pid):null;
  if(!validBirth(observed)){registry.identityFailures.push({kind,pid:validPid(pid)?pid:null});await save();throw new HarnessError('Owned process birth unavailable; no signal authorized');}
  return observed;
 }
 async function pgIdentity(pid,cluster){
  if(!registry.scratch.some(s=>cluster===join(s,'pg')))throw new HarnessError('Unexpected owned PostgreSQL boundary');
  try{
   const fields=(await readFile(join(cluster,'postmaster.pid'),'utf8')).split('\n'),startupEpoch=Number(fields[2]);
   if(Number(fields[0])!==pid||!Number.isSafeInteger(startupEpoch)||startupEpoch<1||await realpath(fields[1])!==await realpath(cluster))throw new Error('pidfile');
   const observed=await identity(pid,'postgres'),epoch=Date.parse(observed+' UTC')/1000;
   // ps lstart and PostgreSQL's startup epoch are whole seconds. Allow the
   // process to enter PostgreSQL startup at most one second after OS birth.
   if(!Number.isSafeInteger(epoch)||startupEpoch<epoch||startupEpoch>epoch+1)throw new Error('startup');
   const r=command('/bin/ps',['-p',String(pid),'-o','command=']),match=r.stdout?.match(/(?:^|\s)-D\s+(\S+)/);
   if(r.error||r.status!==0||!/^\S*postgres(?:\s|$)/.test(r.stdout.trim())||!match||await realpath(match[1])!==await realpath(cluster))throw new Error('cluster process');
   return {pid,birth:observed,cluster,startupEpoch};
  }catch{registry.identityFailures.push({kind:'postgres-proof',pid:validPid(pid)?pid:null});await save();throw new HarnessError('Owned PostgreSQL startup/cluster identity unproved; no signal authorized');}
 }
 async function registerPG(pid,cluster){
  const proof=await pgIdentity(pid,cluster),existing=registry.postgres.find(p=>p.pid===pid);
  if(existing){if(existing.birth!==proof.birth||existing.startupEpoch!==proof.startupEpoch||existing.cluster!==proof.cluster){registry.identityFailures.push({kind:'postgres-reused',pid});await save();throw new HarnessError('Owned PostgreSQL identity changed; no signal authorized');}}
  else registry.postgres.push(proof);
 }
 function aliveOwned(){
  const found=[];
  for(const p of registry.postgres)if(sameIdentity(p.pid,p.birth)&&live(p.pid))found.push({kind:'postgres',pid:p.pid});
  for(const p of registry.next){
   // A surviving group is unconfirmed if its leader identity has disappeared.
   // That observation never authorizes a group kill or a reused PID kill.
   if((sameIdentity(p.group,p.birth)&&live(-p.group))||p.listeners.some(l=>sameIdentity(l.pid,l.birth)&&live(l.pid))||(birth(p.group)===null&&live(-p.group)))found.push({kind:'next',group:p.group});
  }
  return found;
 }
 function nextAlive(p){return (sameIdentity(p.group,p.birth)&&live(-p.group))||p.listeners.some(l=>sameIdentity(l.pid,l.birth)&&live(l.pid))||(birth(p.group)===null&&live(-p.group));}
 async function stopNext(group){
  const owned=registry.next.find(p=>p.group===group);
  async function uncertain(){registry.identityFailures.push({kind:'next-stop',pid:validPid(group)?group:null});await save();throw new HarnessError('Owned Next identity/teardown uncertain; no unverified signal authorized');}
  if(!owned||!validBirth(owned.birth))return await uncertain();
  if(!nextAlive(owned))return;
  function signal(value){
   if(!sameIdentity(owned.group,owned.birth))return false;
   try{process.kill(-owned.group,value);return true;}catch(e){if(e.code==='ESRCH')return true;throw new HarnessError('Owned Next signal unavailable');}
  }
  if(!signal('SIGTERM'))return await uncertain();
  let end=Date.now()+5000;while(nextAlive(owned)&&Date.now()<end)await new Promise(done=>setTimeout(done,50));
  if(nextAlive(owned)){
   if(!signal('SIGKILL'))return await uncertain();
   end=Date.now()+2000;while(nextAlive(owned)&&Date.now()<end)await new Promise(done=>setTimeout(done,50));
  }
  if(nextAlive(owned))return await uncertain();
 }
 async function stopRegisteredPG(){
  // Catch partial pg_ctl startup before the normal post-start callback. A stale
  // PID file with a gone process confers no authority; preserve it if unproved.
  for(const scratch of registry.scratch){
   let file;try{file=await readFile(join(scratch,'pg','postmaster.pid'),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw new HarnessError('Owned PostgreSQL startup identity unreadable');}
   const pid=Number(file.split('\n')[0]);await registerPG(pid,join(scratch,'pg'));
  }
  for(const p of registry.postgres){
   if(!sameIdentity(p.pid,p.birth))continue;
   const proof=await pgIdentity(p.pid,p.cluster);if(proof.birth!==p.birth||proof.startupEpoch!==p.startupEpoch)throw new HarnessError('Owned PostgreSQL identity changed before stop');
   const r=command(join(pgBin,'pg_ctl'),['-D',p.cluster,'-m','immediate','-w','stop']);
   if(r.error||r.status!==0)throw new HarnessError('Exact owned PostgreSQL stop unconfirmed');
  }
 }
 async function confirmStopped(){
  const end=Date.now()+5000;let remaining=aliveOwned();
  while(remaining.length&&Date.now()<end){await new Promise(done=>setTimeout(done,100));remaining=aliveOwned();}
  registry.remaining=remaining;registry.cleanupConfirmed=remaining.length===0&&registry.identityFailures.length===0;
  registry.phase=registry.cleanupConfirmed?'stopped':'cleanup-unconfirmed';await save();
  if(!registry.cleanupConfirmed)throw new HarnessError('Owned teardown unconfirmed; preserve private registry and scratch for parent recovery');
 }
 async function onOwned(p){
  if(p.kind==='scratch'){if(!scratchOK(p.scratch))throw new HarnessError('Unexpected owned scratch boundary');registry.scratch.push(p.scratch);}
  else if(p.kind==='postgres')await registerPG(p.pid,p.cluster);
  else if(p.kind==='next'){
   if(!validPid(p.group)||!Number.isSafeInteger(p.port)||p.port<1||p.port>65535)throw new HarnessError('Invalid owned Next boundary');
   const started=await identity(p.group,'next');registry.next.push({group:p.group,birth:started,port:p.port,listeners:[{pid:p.group,birth:started}]});
  }else if(p.kind==='stop-next')await stopNext(p.group);
  else if(p.kind==='before-remove'){await stopRegisteredPG();await confirmStopped();}
  else throw new HarnessError('Unknown owned lifecycle observation');
  await save();
 }
 async function capture(f){
  if(!scratchOK(f.scratch))throw new HarnessError('Unexpected owned scratch boundary');
  const pid=Number((await readFile(join(f.scratch,'pg','postmaster.pid'),'utf8')).split('\n')[0]);await registerPG(pid,join(f.scratch,'pg'));
  const port=Number(new URL(f.origin).port),ls=command('/usr/sbin/lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN','-t']);
  if(ls.error||ls.status!==0)throw new HarnessError('Owned Next listener identity unavailable');
  for(const member of new Set(ls.stdout.trim().split(/\s+/).map(Number))){
   if(!validPid(member))throw new HarnessError('Invalid owned listener');
   const ps=command('/bin/ps',['-p',String(member),'-o','pgid=']);if(ps.error||ps.status!==0)throw new HarnessError('Owned Next group identity unavailable');
   const group=Number(ps.stdout.trim()),owned=registry.next.find(p=>p.group===group&&p.port===port);
   if(!owned||!sameIdentity(owned.group,owned.birth))throw new HarnessError('Listener lacks current registered owned group');
   const observed=await identity(member,'next-listener');
   if(!owned.listeners.some(l=>l.pid===member&&l.birth===observed))owned.listeners.push({pid:member,birth:observed});
  }
  registry.phase='running';await save();
 }
 async function signalStop(signal){
  if(signalling)return;signalling=true;registry.phase='interrupted-'+signal;await save().catch(()=>{});
  // Scratch precedes synchronous pg_ctl. A signal during its startup cannot run
  // until JS resumes; discover only the registered scratch's postmaster.pid.
  for(const scratch of registry.scratch){try{const pid=Number((await readFile(join(scratch,'pg','postmaster.pid'),'utf8')).split('\n')[0]);await registerPG(pid,join(scratch,'pg'));}catch{}}
  for(const p of registry.next){
   try{
    if(sameIdentity(p.group,p.birth))process.kill(-p.group,'SIGKILL');
    else for(const listener of p.listeners)if(sameIdentity(listener.pid,listener.birth))process.kill(listener.pid,'SIGKILL');
   }catch{}
  }
  for(const p of registry.postgres){
   if(!sameIdentity(p.pid,p.birth))continue;
   const proof=await pgIdentity(p.pid,p.cluster);if(proof.birth!==p.birth||proof.startupEpoch!==p.startupEpoch)continue;
   const stopped=command(join(pgBin,'pg_ctl'),['-D',p.cluster,'-m','immediate','-w','stop']);
   if(stopped.error||stopped.status!==0){try{if(sameIdentity(p.pid,p.birth))process.kill(p.pid,'SIGQUIT');}catch{}}
  }
  try{await confirmStopped();}catch{}
  registry.phase='interrupted-terminal99';await save().catch(()=>{});process.exit(99);
 }
 const term=()=>{void signalStop('SIGTERM').catch(()=>process.exit(99));},interrupt=()=>{void signalStop('SIGINT').catch(()=>process.exit(99));};
 process.on('SIGTERM',term);process.on('SIGINT',interrupt);
 let value,error;
 try{
  value=await withFixture(async f=>{
   await capture(f);const restart=f.restart.bind(f);f.restart=async options=>{await capture(f);const r=await restart(options);await capture(f);return r;};
   try{return await run(f);}finally{await capture(f);}
  },{onOwned});
 }catch(e){error=e;}
 finally{
  process.off('SIGTERM',term);process.off('SIGINT',interrupt);
  if(registry.next.length||registry.postgres.length||registry.identityFailures.length)await confirmStopped();
  else{registry.phase='startup-unconfirmed99';await save();}
 }
 if(signalling)throw new HarnessError('Owned fixture cancelled; no terminal assertion result permitted');
 if(error)throw error;return value;
}
