// Owned, persistent rehearsal runtime. Source and database are disposable;
// credentials never leave process environment and no provider is contacted.
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localFixture,repo,sleep } from './local-fixture.mjs';

const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const migrations=['001_staging_staff.sql','002_staging_catalog.sql','003_staging_manual_bid.sql','009_demo_attendee_entry.sql','015_staff_event_entry.sql','016_staging_staff_assets.sql'];
if(existsSync(join(repo,'migrations/017_asset_authority_scope.sql')))migrations.push('017_asset_authority_scope.sql');
if(existsSync(join(repo,'migrations/018_attendee_activity_donations.sql')))migrations.push('018_attendee_activity_donations.sql');
migrations.push('019_staff_bidder_operations.sql');
const f=await localFixture('bz_test_integrated_v1',migrations);
const appRoot=join(f.root,'app'),appPort=43981,origin=`http://127.0.0.1:${appPort}`;
let app,stopping=false,exitCode=0,resolveStop;
const stopped=new Promise(r=>{resolveStop=r;});
const stop=()=>{if(stopping)return;stopping=true;resolveStop();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try {
  await f.admin.query(`GRANT EXECUTE ON FUNCTION bz_demo_begin(uuid,uuid,text),bz_demo_enroll(uuid,uuid,text,text,text,text,text,text),
    bz_demo_acknowledge(uuid,uuid,text),bz_demo_entry_read(uuid),
    bz_staff_event_entry_read(text,uuid),bz_staff_event_entry_set(text,uuid,integer,boolean,uuid),
    bz_staff_asset_put(text,uuid,uuid,text,integer,text,bytea,integer,integer),bz_staff_asset_recover(text,uuid,uuid),
    bz_staff_asset_validate(text,uuid,uuid[]),bz_staff_asset_read(text,uuid,uuid,text,uuid),
    bz_staff_bidder_list(text,uuid),bz_staff_bidder_set(text,uuid,uuid,uuid,integer,text,boolean) TO fixture_runtime`);
  const organizationId=randomUUID(),otherOrganizationId=randomUUID(),staffId=randomUUID(),otherStaffId=randomUUID();
  await f.admin.query("INSERT INTO bz_orgs(id,name,initials) VALUES($1,'Saturn Barter','SA'),($2,'Other synthetic organization','OT')",[organizationId,otherOrganizationId]);
  await f.admin.query("INSERT INTO bz_people(id,alias,name,is_test) VALUES($1,'staff-saturn','Saturn staff',true),($2,'staff-pine','Other staff',true)",[staffId,otherStaffId]);
  await f.admin.query('INSERT INTO bz_staff_grants(person_id,org_id) VALUES($1,$3),($2,$4)',[staffId,otherStaffId,organizationId,otherOrganizationId]);
  // App bytes are a committed snapshot, so unrelated integration work cannot
  // silently alter public scripts while another owner is taking UI evidence.
  await mkdir(appRoot);
  const archive=execFileSync('git',['archive',head],{cwd:repo,maxBuffer:128*1024*1024});
  execFileSync('tar',['-xf','-','-C',appRoot],{input:archive});
  await symlink(join(repo,'node_modules'),join(appRoot,'node_modules'),'dir');
  const environment={...process.env,APP_ORIGIN:origin,LC_ALL:'C',LANG:'C'};
  execFileSync(process.execPath,[join(appRoot,'node_modules/next/dist/bin/next'),'build'],{cwd:appRoot,env:environment,stdio:'pipe',maxBuffer:16*1024*1024});
  app=spawn(process.execPath,[join(appRoot,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','-p',String(appPort)],{cwd:appRoot,env:environment,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',bytes=>process.stdout.write(bytes));app.stderr.on('data',bytes=>process.stderr.write(bytes));
  app.on('exit',code=>{if(!stopping){exitCode=code??1;stop();}});
  let ready=false;
  for(let i=0;i<100;i++){try{const response=await fetch(origin+'/admin');if(response.ok){ready=true;break;}}catch{}await sleep(100);}
  if(!ready)throw Error('Owned app readiness failed');
  const descriptor={sourceCommit:head,sourceRoot:appRoot,origin,organizationId,otherOrganizationId,staffAlias:'staff-saturn',otherStaffAlias:'staff-pine',
    runtimePid:process.pid,appPid:app.pid,postgresPid:f.pid,port:f.port,scope:'disposable local synthetic event rehearsal',migrations};
  f.report.runtime=descriptor;
  const path=join(f.root,'RUNTIME.json');await writeFile(path,JSON.stringify(descriptor,null,2)+'\n',{mode:0o600});
  console.log('RUNTIME_READY '+JSON.stringify({descriptor:path,...descriptor}));
  await stopped;
}catch(error){console.error('Owned integration runtime failed: '+error.message);exitCode=1;}
finally{
  stopping=true;
  if(app && app.exitCode===null && app.signalCode===null){const exited=new Promise(r=>app.once('exit',r));app.kill('SIGTERM');await exited;}
  await f.close();process.exitCode=exitCode;
}
