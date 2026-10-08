// Exact approved Studio label/order successors. No product or observation rewrite.
import {registerHooks,syncBuiltinESMExports} from 'node:module';
import {readFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import childProcess from 'node:child_process';
import './owned-processes.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const plan=JSON.parse(readFileSync(new URL('../staging-staff-entry-inherited/STUDIO_SUCCESSOR_DELTAS.json',import.meta.url)));
plan.records.push(...JSON.parse(readFileSync(new URL('../staging-staff-entry-inherited/DISPOSABLE_SETUP_DELTAS.json',import.meta.url))).records);
const recovery=JSON.parse(readFileSync(new URL('./DELTAS.json',import.meta.url))).records.find(r=>r.path==='tests/acceptance/staging-workspace-entry/harness.mjs');
const oldOwnedHash="fd866e504e6070740380af4a2de44f95baf3b5924672af3ebbedca03d9d1c316",ownedURL=new URL('./owned-processes.mjs',import.meta.url).href;
const preload=fileURLToPath(import.meta.url),originalSpawn=childProcess.spawnSync;
childProcess.spawnSync=function(binary,args,options){
 // Existing nested Node evidence commands retain argv semantics and their old
 // NODE_OPTIONS fan/readiness hooks. This CLI preload applies only to test code.
 const evidence=Array.isArray(args)&&typeof args[0]==='string'&&/^tests\/acceptance\/.*\.mjs$/.test(args[0]);
 const node=binary==='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
 return originalSpawn(binary,evidence&&node?['--import',preload,...args]:args,options);
};
syncBuiltinESMExports();
registerHooks({load(url,context,next){
 const result=next(url,context),path=new URL(url).pathname;
 if(path.endsWith('/tests/acceptance/staging-staff-entry-inherited/owned-processes.mjs')){if(sha(String(result.source))!==oldOwnedHash)throw Error('HARNESS99 original ownership input changed');return {...result,source:'export {assertOwnedDatabasePort} from '+JSON.stringify(ownedURL)+';'};}
 const record=plan.records.find(r=>path.endsWith('/'+r.path));if(!record)return result;
 const source=String(result.source),before=sha(source),prior=before===record.acceptedPriorFanSHA256;
 if(before!==record.diskSHA256&&!prior)throw Error('HARNESS99 exact historical source lineage required: '+record.path);
 let executed=source;
 for(const step of record.steps){if(executed.split(step.before).length-1!==step.count)throw Error('HARNESS99 exact approved anchor cardinality: '+record.path);executed=executed.replaceAll(step.before,step.after);}
 const after=sha(executed),expected=prior?record.executedAfterPriorFanSHA256:record.executedSHA256;
 if(after!==expected)throw Error('HARNESS99 exact approved executed source hash: '+record.path);
 const lineage={path:record.path,diskSHA256:record.diskSHA256,inputSHA256:before,executedSHA256:after,priorAcceptedFanHook:prior,steps:record.steps.length,observationRewrite:false};
 if(process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR)appendFileSync(process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR+'/SOURCE_LINEAGE.jsonl',JSON.stringify(lineage)+'\n');
 // Authenticated provenance is retained in its typed private producer ledger.
 // Semantic stdout/stderr, including real errors and completion markers, is untouched.
 if(record.path===recovery.path){
  const input=sha(executed);if(input!==recovery.priorExecutedSHA256)throw Error('HARNESS99 exact prerequisite fixture input required');
  for(const step of recovery.steps){if(executed.split(step.before).length-1!==step.count)throw Error('HARNESS99 exact fixture lifecycle anchor');executed=executed.replaceAll(step.before,step.after);}
  if(sha(executed)!==recovery.executedAfterPriorSHA256)throw Error('HARNESS99 exact fixture lifecycle output');
  appendFileSync(process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR+'/RECOVERY_LINEAGE.jsonl',JSON.stringify({path:record.path,inputSHA256:input,executedSHA256:sha(executed),kind:'fixture-lifecycle',assertionEdits:0})+'\n');
 }
 return {...result,source:executed};
}});
