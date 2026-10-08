// Bounded successor verification around unchanged historic best-effort cleanup.
// Inspect only: never signal a discovered PID or an unrelated service.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { withFixture,HarnessError } from '../staff-drafts/harness.mjs';
function processes(){
  const r=spawnSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024});
  if(r.error||r.status!==0)throw new HarnessError('Owned cleanup process observation unavailable.');
  return r.stdout.split('\n').map(line=>line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map(m=>({pid:+m[1],parent:+m[2],command:m[3]}));
}
function descendants(rows,roots){const ids=new Set(roots);let changed=true;while(changed){changed=false;for(const r of rows)if(ids.has(r.parent)&&!ids.has(r.pid)){ids.add(r.pid);changed=true;}}return [...ids];}
export function ownedBrowser(){
  const rows=processes(),roots=rows.filter(r=>r.parent===process.pid&&/chrome|chromium/i.test(r.command)).map(r=>r.pid);
  if(roots.length!==1)throw new HarnessError('Exactly one owned browser child must be identifiable.');
  return {kind:'browser',roots,pids:descendants(rows,roots),ports:[]};
}
export function refreshOwned(owned){return {...owned,pids:[...new Set([...owned.pids,...descendants(processes(),owned.roots)])]};}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw new HarnessError('Owned process exit observation failed.');}}
async function portClosed(port){return new Promise(done=>{const socket=createConnection({host:'127.0.0.1',port});let settled=false;
  const finish=closed=>{if(settled)return;settled=true;socket.destroy();done(closed);};
  socket.setTimeout(500,()=>finish(false));socket.once('connect',()=>finish(false));socket.once('error',e=>finish(e.code==='ECONNREFUSED'));
});}
export async function verifyGone(owned){
  const deadline=Date.now()+2500;let live=[],open=[];
  do{live=owned.pids.filter(alive);open=[];for(const port of owned.ports)if(!await portClosed(port))open.push(port);
    if(!live.length&&!open.length)return {kind:owned.kind,pids:owned.pids,ports:owned.ports,allExited:true,allPortsClosed:true};
    await new Promise(done=>setTimeout(done,100));
  }while(Date.now()<deadline);
  const error=new HarnessError('Owned cleanup could not be verified; no terminal result may be accepted.');
  error.observation={kind:owned.kind,ownedPids:owned.pids,livePids:live,openOwnedPorts:open};throw error;
}
export async function withVerifiedFixture(run,configuration){
  let owned,cleanup,result,failure;
  try{result=await withFixture(async f=>{
    const dbPid=Number((await readFile(join(f.scratch,'cluster','postmaster.pid'),'utf8')).split('\n')[0]),
      appPort=Number(new URL(f.origin).port),dbPort=Number(new URL(f.appUrl).port),rows=processes(),
      roots=rows.filter(r=>r.parent===process.pid&&r.command.includes(join(f.repo,'node_modules/next/dist/bin/next'))&&r.command.includes('--port '+appPort)).map(r=>r.pid);
    if(!Number.isInteger(dbPid)||roots.length!==1)throw new HarnessError('Owned app/PostgreSQL identities could not be established.');
    owned={kind:'app-and-postgres',roots:[...roots,dbPid],pids:descendants(rows,[...roots,dbPid]),ports:[appPort,dbPort]};
    try{return await run(f);}finally{owned=refreshOwned(owned);}
  },configuration);}catch(error){failure=error;}
  if(owned)cleanup=await verifyGone(owned);
  if(failure){failure.verifiedServiceCleanup=cleanup;throw failure;}
  if(!cleanup)throw new HarnessError('Owned service cleanup witness is missing.');
  return {result,cleanup};
}
