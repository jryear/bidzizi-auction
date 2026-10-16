#!/usr/bin/env node
// Provider GETs and read-only SQL only. No branch is created here.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {providers,targets} from '../load/staging-provider.mjs';import {manifest} from './manifest.mjs';
const auth=JSON.parse(await readFile('/Users/jryear/.config/neon/credentials.json','utf8'));
const r=await fetch('https://console.neon.tech/api/v2/projects/delicate-math-48681189',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+auth.access_token}});assert.ok(r.ok,`Project GET failed (${r.status}); details suppressed.`);
const raw=await r.json(),project=raw.project??raw;assert.equal(project.id,'delicate-math-48681189');
const retention=project.history_retention_seconds??project.settings?.history_retention_seconds;assert.ok(Number.isFinite(retention)&&retention>0,'Actual restore history must be available.');
const db=await (await providers()).database('production','restore-baseline',true);
try{
 const event=(await db.query(`SELECT e.id,count(b.id)::int bids FROM events e JOIN bids b ON b.event_id=e.id WHERE e.ends_at<clock_timestamp() GROUP BY e.id ORDER BY count(b.id) DESC,e.id LIMIT 1`)).rows[0];assert.ok(event?.bids>0,'Need an existing ended event with real durable bids.');
 const before=await manifest(db,event.id),after=await manifest(db,event.id);assert.deepEqual(after.tables,before.tables,'Selected event changed around the chosen point; do not create a branch.');
 assert.ok(before.tables.receipts.rows>0&&before.tables.standings.rows>0);
 const result={preparedAt:new Date().toISOString(),project:project.id,parentBranch:targets.production.branch,historyRetentionSeconds:retention,restorePoint:{at:before.point.at,lsn:before.point.lsn},baseline:before,stabilityReadback:after,branchName:'nov19-restore-drill-'+new Date().toISOString().replace(/[-:.]/g,'').slice(0,15),branchLifetimeMinutes:30,compute:{cu:0.25,autosuspendSeconds:300},productionReadOnly:true,branchCreated:false};
 await writeFile('docs/evidence/nov19/restore-baseline.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({project:result.project,parentBranch:result.parentBranch,historyRetentionSeconds:retention,restorePoint:result.restorePoint,branchName:result.branchName,counts:Object.fromEntries(Object.entries(before.tables).map(([k,v])=>[k,v.rows]))}));
}finally{await db.end();}
