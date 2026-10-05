#!/usr/bin/env node
// Independently owned unfrozen004 preparation runner. No old13 invocation.
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const started=Date.now();let mode,output,mutant,timer;const results=[];
const sanitize=m=>String(m).replace(/bz_session=[A-Za-z0-9_-]+/g,'bz_session=[REDACTED_DISPOSABLE_SESSION]').replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[REDACTED_DATABASE_URL]');
const internalFailure=e=>{console.error('HARNESS99: asynchronous internal callback failure '+sanitize(e?.message||e));if(process.listenerCount('SIGTERM'))process.emit('SIGTERM');else process.exit(99);};
process.on('unhandledRejection',internalFailure);process.on('uncaughtException',internalFailure);
try{
 if(['DATABASE_URL','BIDZIZI_STAGING_DATABASE_URL','APP_ORIGIN','VERCEL','VERCEL_ENV','BIDZIZI_STAGING_TEST_AUTH','BIDZIZI_APP_MODE','BIDZIZI_LOCAL_TEST_DATABASE'].some(key=>process.env[key]!==undefined))throw Error('Inherited application/provider runtime environment refused');
 const plan=JSON.parse(await readFile(new URL('./CASE_PLAN.json',import.meta.url),'utf8'));const args=process.argv.slice(2);mode=args.shift();
 if(!mode||(!['acceptance','adversarial','list'].includes(mode)&&!plan.cases.some(c=>c.id===mode)))throw Error('Missing or unknown mode/case ID');
 while(args.length){const key=args.shift();if(key==='--output'&&args.length)output=resolve(args.shift());else if(key==='--probe'&&args.length)mutant=args.shift();else if(key==='--deadline-ms'&&args.length){const v=Number(args.shift());if(!Number.isInteger(v)||v<1||v>plan.deadlinesMs[mode==='acceptance'?'acceptance':mode==='adversarial'?'adversarial':'direct'])throw Error('Invalid bounded deadline');timer=v;}else throw Error('Unknown/missing CLI option');}
 if(mutant&&!['DROP_CONTEXT_EPOCH','OMIT_NOTICE_REFRESH','NOTICE_REFRESH_REFERENCE'].includes(mutant))throw Error('Unknown source-sandbox probe');
 if(mode==='list'){console.log(JSON.stringify(plan,null,2));process.exit(0);}
 const deadline=timer||plan.deadlinesMs[mode==='acceptance'?'acceptance':mode==='adversarial'?'adversarial':'direct'];
 timer=setTimeout(()=>{console.error('HARNESS: INTERNAL_MODE_DEADLINE99 '+mode);if(process.listenerCount('SIGTERM'))process.emit('SIGTERM');else process.exit(99);},deadline);timer.unref();
 const [{withFixture,HarnessError,evidenceExit},{healthy},{cases},{bounded}]=await Promise.all([import('./harness.mjs'),import('./fixtures.mjs'),import('./checks.mjs'),import('./browser.mjs')]);
 output=output||await mkdtemp('/tmp/bidzizi-workspace004-results-');await mkdir(output,{recursive:true});
 const selected=plan.cases.filter(c=>c.mode===mode||c.id===mode);if(selected.length===0)throw new HarnessError('No executable cases selected');for(const c of selected)if(typeof cases[c.id]!=='function')throw new HarnessError('Missing case implementation '+c.id);
 const sourceRoot=resolve(process.env.VERIFY_ROOT||process.cwd());const hash=bytes=>createHash('sha256').update(bytes).digest('hex');const sourceBinding=JSON.parse(await readFile(new URL('./SOURCE_BINDING.json',import.meta.url),'utf8'));const actualSourceHashes={};for(const path of Object.keys(sourceBinding.sha256))actualSourceHashes[path]=hash(await readFile(join(sourceRoot,path)));
 const currentEvidenceHashes={};for(const name of ['CASE_PLAN.json','SOURCE_BINDING.json','run.mjs','checks.mjs','browser.mjs','fixtures.mjs','protocol.mjs','harness.mjs','seed-people.sql'])currentEvidenceHashes[name]=hash(await readFile(new URL('./'+name,import.meta.url)));
 const revision=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'});if(revision.status!==0)throw new HarnessError('Read-only source revision binding unavailable');
 let aggregate=0;
 await withFixture(async f=>{
 await healthy(f);
 for(const c of selected){const before=Date.now();let code=0,message='All contracted observations completed';
 try{await bounded(cases[c.id](f,output),c.id,plan.deadlinesMs.case);}catch(e){code=evidenceExit(e);message=sanitize(e.message);console.error((code===99?'HARNESS':'FAIL')+' '+c.id+': '+message);}
 const result={id:c.id,expectedBaseExit:c.expectedBaseExit,actualExit:code,durationMs:Date.now()-before,message,classification:mutant?'SOURCE_SANDBOX_ORACLE_PROBE':'ACTUAL_APPLICATION_'+(process.env.VERIFY_TREE||'CURRENT_TREE').toUpperCase()+'_CHARACTERIZATION'};results.push(result);console.log('CASE_RESULT '+JSON.stringify(result));
 if(code===99){aggregate=99;break;}if(code===1)aggregate=1;
 }
 },{mutant});
 clearTimeout(timer);
 const receipt={version:3,mode,plannedSourceCommit:plan.sourceCommit,actualSourceCommit:revision.stdout.trim(),actualSourceHashes,currentEvidenceHashes,sourceCommit:revision.stdout.trim(),verifyTree:process.env.VERIFY_TREE||'direct-characterization',frozenContract:false,kernelInvoked:false,mutant:mutant||null,actualExit:aggregate,durationMs:Date.now()-started,results,casePlanSHA256:createHash('sha256').update(await readFile(new URL('./CASE_PLAN.json',import.meta.url))).digest('hex')};
 await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');console.log('RUN_RECEIPT '+join(output,'RUN_RECEIPT.json'));process.exitCode=aggregate;
}catch(e){clearTimeout(timer);console.error('HARNESS99: '+sanitize(e.message));process.exitCode=99;}
