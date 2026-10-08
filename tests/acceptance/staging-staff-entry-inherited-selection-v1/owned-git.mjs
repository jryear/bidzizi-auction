// Only future root-authorized execution may create the private repository.
// Literal local Git, private config and birth-bound detached command lifecycle.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
export const gitFlags=['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','core.untrackedCache=false','-c','protocol.allow=never','-c','protocol.file.allow=always','-c','protocol.ext.allow=never','-c','credential.helper=','-c','fetch.fsckObjects=true','-c','transfer.fsckObjects=true','-c','maintenance.auto=false','-c','gc.auto=0','-c','core.autocrlf=false','-c','core.safecrlf=false','-c','fetch.writeCommitGraph=false'];
export function gitEnvironment(environment){
 const env=Object.fromEntries(Object.entries(environment).filter(([key])=>!key.startsWith('GIT_')));
 return {...env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'file',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TZ:'UTC',LC_ALL:'C'};
}
export function live(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;if(error.code==='EPERM')return true;throw error;}}
export function birth(pid){const p=spawnSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:1000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}});if(p.error)throw Error('Git identity probe unavailable');return p.status===0&&p.stdout.trim()?p.stdout.trim():null;}
export function validateBirth(recorded,current,positive){
 assert.ok(Number.isSafeInteger(recorded.pid)&&recorded.pid>1&&recorded.birth,'Recorded command birth required');
 if(current!==null&&current!==recorded.birth)throw Error('Changed/reused command PID; preserve');
 if(current===null&&positive)throw Error('Live command identity unknown; preserve');
 return current===recorded.birth&&positive;
}
export function validateCompletion(recorded,current,pidLive,groupLive){
 assert.ok(Number.isSafeInteger(recorded.pid)&&recorded.pid>1&&recorded.closed===true,'Direct child close proof required');
 assert.equal(recorded.spawnError,undefined);assert.deepEqual(recorded.exit,{code:0,signal:null},'Direct owned command successful close');
 if(recorded.birth)validateBirth(recorded,current,pidLive);
 else{assert.equal(current,null,'Unproved birth cannot authorize changed/reused PID');assert.equal(pidLive,false,'Unproved command live identity; preserve');}
 assert.equal(pidLive,false,'Command PID gone');assert.equal(groupLive,false,'Command group gone');
}
export function ownedGit(deadline){
 const records=[];let active;
 async function stop(){
  if(!active)return;const p=active;
  if(validateBirth(p,birth(p.pid),live(p.pid))){process.kill(-p.pid,'SIGTERM');await new Promise(done=>setTimeout(done,100));
   if(live(-p.pid)){assert.equal(birth(p.pid),p.birth,'Exact command birth before force stop');process.kill(-p.pid,'SIGKILL');}
  }else assert.equal(live(-p.pid),false,'No orphan command group');
 }
 async function assertGone(){for(const p of records)validateCompletion(p,birth(p.pid),live(p.pid),live(-p.pid));}
 async function git(args,cwd){
  assert.ok(Date.now()<deadline-15000,'No preparation/execution time remaining');assert.equal(active,undefined,'One owned Git command');
  const p=spawn('/usr/bin/git',[...gitFlags,...args],{cwd,env:gitEnvironment(process.env),detached:true,stdio:['ignore','pipe','pipe']});
  const record={pid:p.pid??null,birth:null,argv:['/usr/bin/git',...gitFlags,...args],cwd,startedMs:Date.now(),closed:false};records.push(record);active=record;
  // Ledger and listeners exist even when spawn/birth fails. No empty-ledger
  // cleanup proof can authorize deletion after an unproved spawned identity.
  const completion=new Promise(done=>{p.once('error',error=>{record.spawnError=error.message;});p.once('close',(code,signal)=>{record.closed=true;record.exit={code,signal};record.endedMs=Date.now();done(record.exit);});});
  let out='',err='',overflow=false;const limit=2*1024*1024;
  p.stdout.on('data',d=>{out+=d;if(Buffer.byteLength(out)>limit){overflow=true;void stop().catch(()=>{});}});
  p.stderr.on('data',d=>{err+=d;if(Buffer.byteLength(err)>limit){overflow=true;void stop().catch(()=>{});}});
  record.birth=record.pid?birth(record.pid):null;
  let rejectDeadline;const expired=new Promise((_,reject)=>{rejectDeadline=reject;});
  const timer=setTimeout(async()=>{try{await stop();}catch(error){record.stopError=error.message;}rejectDeadline(Error('Local Git command deadline; preserve'));},Math.min(5000,Math.max(1,deadline-Date.now()-15000)));
  try{const exit=await Promise.race([completion,expired]);assert.equal(record.spawnError,undefined,'Git spawn failed');assert.equal(exit.signal,null,'Git terminated');assert.equal(exit.code,0,'Local Git command failed: '+err.slice(0,300));assert.equal(overflow,false,'Git output overflow');validateCompletion(record,birth(record.pid),live(record.pid),live(-record.pid));return out;}
  finally{clearTimeout(timer);active=undefined;}
 }
 return {git,stop,assertGone,records};
}
