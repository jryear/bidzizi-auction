// Read and recover ONLY this group's recorded process identities. No scratch
// deletion, unregistered signal, foreign PID or null identity is authorized.
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const command=(bin,args)=>spawnSync(bin,args,{encoding:'utf8',timeout:5000,maxBuffer:64000,env:{...process.env,TZ:'UTC',LC_ALL:'C'}});
function birth(pid){const r=command('/bin/ps',['-p',String(pid),'-o','lstart=']);if(r.error)throw Error('HARNESS99 lifecycle identity probe');return r.status===0&&r.stdout.trim()?r.stdout.trim():null;}
function live(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;if(error.code==='EPERM')return true;throw error;}}
function valid(p){return Number.isSafeInteger(p.pid)&&p.pid>1&&typeof p.birth==='string'&&p.birth.trim().length>0;}
export function assertRecordedBirth(p,observedBirth,processLive){
 if(!valid(p))throw Error('HARNESS99 missing registered birth proof');
 if(observedBirth!==null&&observedBirth!==p.birth)throw Error('HARNESS99 recorded PID birth changed/reused; preserve');
 if(observedBirth===null&&processLive)throw Error('HARNESS99 live recorded PID has no current birth proof; preserve');
 return observedBirth===p.birth&&processLive;
}
function portStatus(port){
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('HARNESS99 recorded listener port missing');
 const r=command('/usr/sbin/lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN','-t']);
 if(r.error||![0,1].includes(r.status))throw Error('HARNESS99 owned port probe');
 return {port,closed:r.status===1&&!r.stdout.trim()};
}
export async function inspectLifecycle(directory){
 const files=(await readdir(directory)).filter(p=>/^PROCESS-\d+\.json$/.test(p));
 const registries=await Promise.all(files.map(async file=>({file,data:JSON.parse(await readFile(join(directory,file),'utf8'))})));
 const remaining=[],ports=[];
 for(const {file,data} of registries){
  if(data.protocol!==1||!Array.isArray(data.children)||!Array.isArray(data.postgres)||!Array.isArray(data.violations))throw Error('HARNESS99 typed lifecycle registry');
  for(const p of data.children){
   if(!valid(p))throw Error('HARNESS99 missing registered birth proof');
   const observedBirth=birth(p.pid),processLive=assertRecordedBirth(p,observedBirth,live(p.pid)),groupLive=p.detached===true&&live(-p.pid);
   if(processLive||groupLive)remaining.push({file,kind:'child',...p,currentBirth:observedBirth===p.birth,processLive,groupLive});
   if(p.port)ports.push(portStatus(p.port));
  }
  for(const p of data.postgres){if(assertRecordedBirth(p,birth(p.pid),live(p.pid)))remaining.push({file,kind:'postgres',...p});ports.push(portStatus(p.port));}
 }
 return {files,registries,remaining,ports,violations:registries.flatMap(({file,data})=>data.violations.map(v=>({file,...v}))),allExited:remaining.length===0,allPortsClosed:ports.every(p=>p.closed)};
}
export async function recoverLifecycle(directory){
 const before=await inspectLifecycle(directory),attempts=[];
 for(const p of before.remaining.slice().reverse()){
  if(!valid(p)||birth(p.pid)!==p.birth){attempts.push({kind:p.kind,pid:p.pid,action:'preserved-unproved'});continue;}
  if(p.kind==='child'){
   const target=p.detached?-p.pid:p.pid;process.kill(target,'SIGTERM');let until=Date.now()+5000;
   while(live(target)&&Date.now()<until)await new Promise(done=>setTimeout(done,50));
   if(live(target)&&birth(p.pid)===p.birth){process.kill(target,'SIGKILL');until=Date.now()+2000;while(live(target)&&Date.now()<until)await new Promise(done=>setTimeout(done,50));}
   attempts.push({kind:'child',pid:p.pid,action:'birth-bound-stop'});
  }else{
   const fields=(await readFile(join(p.cluster,'postmaster.pid'),'utf8')).split('\n'),r=command('/bin/ps',['-p',String(p.pid),'-o','command=']),match=r.stdout?.match(/(?:^|\s)-D\s+(\S+)/);
   const epoch=Date.parse(p.birth+' UTC')/1000;
   if(Number(fields[0])!==p.pid||Number(fields[2])!==p.startupEpoch||!Number.isSafeInteger(epoch)||p.startupEpoch<epoch||p.startupEpoch>epoch+1||await realpath(fields[1])!==await realpath(p.cluster)||r.error||r.status!==0||!/^\S*postgres(?:\s|$)/.test(r.stdout.trim())||!match||await realpath(match[1])!==await realpath(p.cluster))throw Error('HARNESS99 PostgreSQL recovery identity changed; preserve');
   const stopped=command('/opt/homebrew/opt/postgresql@18/bin/pg_ctl',['-D',p.cluster,'-m','immediate','-w','stop']);
   if(stopped.error||stopped.status!==0)throw Error('HARNESS99 PostgreSQL recovery stop unconfirmed');attempts.push({kind:'postgres',pid:p.pid,action:'birth-startup-cluster-bound-stop'});
  }
 }
 const after=await inspectLifecycle(directory),receipt={before,attempts,after,scratchDeleted:false};await writeFile(join(directory,'RECOVERY.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
