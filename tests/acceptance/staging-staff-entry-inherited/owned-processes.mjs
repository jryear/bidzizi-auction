// Lifecycle-only guard around historic fixture operations. The historic files
// and fixture bodies remain exact. Only recorded live birth identities signal.
import childProcess from 'node:child_process';
import fs from 'node:fs';
import promises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {join,resolve,basename,dirname} from 'node:path';
import {assertRecordedBirth} from './lifecycle.mjs';
const directory=process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR;
if(!directory||!/^\/tmp\/task-root\/staff-entry-inherited-[A-Za-z0-9_-]+\/PROCESS_REGISTRY$/.test(directory))throw Error('HARNESS99 fresh inherited lifecycle registry required');
const ds=fs.lstatSync(directory);if(!ds.isDirectory()||ds.isSymbolicLink())throw Error('HARNESS99 regular owned registry directory required');
const nativeSpawn=childProcess.spawn,nativeSync=childProcess.spawnSync,nativeKill=process.kill.bind(process),nativeTemp=promises.mkdtemp,nativeRM=promises.rm;
const registry={protocol:1,pid:process.pid,startedMs:Date.now(),scratch:[],children:[],postgres:[],violations:[]};
const path=join(directory,'PROCESS-'+process.pid+'.json');
const save=()=>fs.writeFileSync(path,JSON.stringify(registry,null,2)+'\n');
const fail=reason=>{registry.violations.push({reason,at:Date.now()});save();throw Error('HARNESS99 owned lifecycle '+reason);};
const probe=(pid,field)=>nativeSync('/bin/ps',['-p',String(pid),'-o',field+'='],{encoding:'utf8',timeout:5000,maxBuffer:64000,env:{...process.env,TZ:'UTC',LC_ALL:'C'}});
const birth=pid=>{if(!Number.isSafeInteger(pid)||pid<2)return null;const r=probe(pid,'lstart');if(r.error)fail('birth probe unavailable');return r.status===0&&r.stdout.trim()?r.stdout.trim():null;};
const live=pid=>{try{nativeKill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;if(e.code==='EPERM')return true;fail('liveness probe unavailable');}};
const current=p=>!!p.birth&&birth(p.pid)===p.birth;
const scratchOK=s=>/^\/tmp\/(?:task-root\/bz-(?:bid|cat|workspace)-[A-Za-z0-9_-]+|bz-staff-(?:base|candidate|manual)-[A-Za-z0-9_-]+)$/.test(s);
const checkedLive=p=>{try{return assertRecordedBirth(p,birth(p.pid),live(p.pid));}catch(error){fail(error.message);}};
function pgProof(cluster){
 if(!registry.scratch.some(s=>join(s.path,'pg')===cluster))fail('unregistered PostgreSQL cluster');
 const fields=fs.readFileSync(join(cluster,'postmaster.pid'),'utf8').split('\n'),pid=Number(fields[0]),startupEpoch=Number(fields[2]),observed=birth(pid);
 if(!observed||fs.realpathSync(fields[1])!==fs.realpathSync(cluster)||!Number.isSafeInteger(startupEpoch))fail('PostgreSQL pidfile identity');
 const epoch=Date.parse(observed+' UTC')/1000,r=probe(pid,'command'),match=r.stdout?.match(/(?:^|\s)-D\s+(\S+)/);
 if(!Number.isSafeInteger(epoch)||startupEpoch<epoch||startupEpoch>epoch+1||r.error||r.status!==0||!/^\S*postgres(?:\s|$)/.test(r.stdout.trim())||!match||fs.realpathSync(match[1])!==fs.realpathSync(cluster))fail('PostgreSQL live birth/startup/command identity');
 const scratch=registry.scratch.find(s=>join(s.path,'pg')===cluster);if(epoch*1000<scratch.createdMs-1000)fail('PostgreSQL predates owned scratch');
 const port=Number(fields[3]);if(!Number.isSafeInteger(port)||port<1||port>65535)fail('PostgreSQL pidfile port');
 return {pid,birth:observed,cluster,startupEpoch,port};
}
export function assertOwnedDatabasePort(port){const p=registry.postgres.find(p=>p.port===Number(port));if(!p||!current(p)||JSON.stringify(pgProof(p.cluster))!==JSON.stringify(p))fail('database prerequisite has no current owned PostgreSQL port proof');}
promises.mkdtemp=async function(prefix,options){const value=await nativeTemp(prefix,options);if(scratchOK(value)){registry.scratch.push({path:value,createdMs:Date.now()});save();}return value;};
childProcess.spawnSync=function(binary,args,options){
 const pg=basename(String(binary))==='pg_ctl',index=Array.isArray(args)?args.indexOf('-D'):-1,cluster=index>=0?resolve(args[index+1]):null;
 if(pg&&args.includes('stop')){
  const saved=registry.postgres.find(p=>p.cluster===cluster);if(!saved)fail('unregistered PostgreSQL stop');
  const proof=pgProof(cluster);if(JSON.stringify(proof)!==JSON.stringify(saved))fail('changed PostgreSQL stop identity');
 }
 const result=nativeSync(binary,args,options);
 if(pg&&args.includes('start')){
  // Failed/partial starts retain the exact owned cluster. No old PID file or
  // missing birth can authorize stopping a process or deleting its scratch.
  if(fs.existsSync(join(cluster,'postmaster.pid'))){const proof=pgProof(cluster);if(!registry.postgres.some(p=>p.cluster===cluster))registry.postgres.push(proof);else fail('duplicate PostgreSQL start without teardown');save();}
 }
 return result;
};
childProcess.spawn=function(binary,args,options){
 const child=nativeSpawn(binary,args,options);if(!Number.isSafeInteger(child.pid)||child.pid<2)fail('spawned child identity unavailable');
 const observed=birth(child.pid);if(!observed)fail('spawned child birth unavailable');
 const index=Array.isArray(args)?args.indexOf('--port'):-1,port=index>=0?Number(args[index+1]):null;
 const record={pid:child.pid,birth:observed,detached:options?.detached===true,binary:basename(String(binary)),port:Number.isSafeInteger(port)&&port>0&&port<65536?port:null};registry.children.push(record);save();
 const kill=child.kill.bind(child);child.kill=function(signal){if(child.exitCode!==null)return false;if(!current(record))fail('changed child signal identity');return kill(signal);};
 return child;
};
process.kill=function(pid,signal){
 if(signal===0)return nativeKill(pid,signal);
 const p=registry.children.find(r=>r.pid===Math.abs(pid))||registry.postgres.find(r=>r.pid===pid);
 if(!p||pid<0&&!p.detached||!current(p))fail('unregistered or changed signal identity');
 return nativeKill(pid,signal);
};
promises.rm=async function(target,options){
 const value=resolve(String(target));if(registry.scratch.some(s=>s.path===value)){
  const p=registry.postgres.find(p=>p.cluster===join(value,'pg'));
  if(p&&checkedLive(p))fail('PostgreSQL remains before owned scratch removal');
  if(fs.existsSync(join(value,'pg','postmaster.pid')))fail('unconfirmed PostgreSQL pidfile before scratch removal');
  for(const child of registry.children)if(checkedLive(child)||child.detached&&live(-child.pid))fail('owned child/group remains before scratch removal');
 }
 return nativeRM(target,options);
};
save();syncBuiltinESMExports();
process.on('exit',()=>{registry.endedMs=Date.now();save();});
