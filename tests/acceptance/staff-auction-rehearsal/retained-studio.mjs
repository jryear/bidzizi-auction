// Candidate-native successor for the accepted Studio assertion groups.
// The historical runner and its release-375 binding remain untouched.
import {readFile,writeFile,mkdtemp,mkdir,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {configuration} from '../staging-studio-composition/fixture.mjs';
import {groups} from '../staging-studio-composition/cases.mjs';
import {controls} from '../staging-studio-composition/controls.mjs';
import {withVerifiedFixture} from '../staging-studio-composition/cleanup.mjs';
import {ReachedMismatch} from '../staging-studio-composition/oracles.mjs';
function savedSetupSuccessor(o){
 const by=(v,key)=>v.steps.find(s=>s.key===key),need=(v,m)=>{if(!v)throw new ReachedMismatch(m);};
 need(o.length===7&&o.every(v=>v.present&&v.accessible&&v.basis==='saved'&&/saved/i.test(v.text)&&/separate|independent/i.test(by(v,'approval')?.text||'')),'Setup lost confirmed saved-state and independent approval truth.');
 need(o.every((v,i)=>i===4?by(v,'access')?.state==='pending'&&/checking current entry|not confirmed yet/i.test(by(v,'access')?.text||''):by(v,'access')?.state==='unavailable'&&/could not be confirmed|unavailable|not enabled/i.test(by(v,'access')?.text||'')&&!by(v,'access')?.action),'Current Entry availability/pending state is misrepresented.');
 need(by(o[0],'welcome')?.state==='needs-attention'&&by(o[0],'items')?.state==='needs-attention'&&by(o[1],'welcome')?.state==='complete'&&by(o[1],'items')?.state==='complete'&&/unsaved|working/i.test(o[2].text)&&by(o[2],'items')?.state==='complete'&&by(o[3],'items')?.state==='needs-attention'&&o[3].actionReached&&o.slice(0,4).every(v=>by(v,'approval')?.state==='needs-attention')&&by(o[4],'approval')?.state==='pending'&&by(o[5],'approval')?.state!=='complete'&&by(o[6],'approval')?.state==='complete','Saved setup progression or correction action differs from observed accepted behavior.');
}
const root=resolve(process.env.VERIFY_ROOT||process.cwd()),sha=b=>createHash('sha256').update(b).digest('hex');
let output;
try{
 const index=Number(process.argv[2]);if(!Number.isInteger(index)||index<0||index>3)throw Error('Exact retained Studio group required.');
 const declaration=JSON.parse(await readFile(new URL('../staging-studio-composition/CHECKS.json',import.meta.url),'utf8'));
 const group=index===3?{...declaration.checks[index],run:controls}:groups[index],check=declaration.checks[index];
 if(group.name!==check.name||JSON.stringify(group.assertions)!==JSON.stringify(check.assertions))throw Error('Retained Studio assertion declaration drift.');
 const phase=process.env.VERIFY_TREE||'direct',runId=process.env.VERIFY_RUN_ID||'direct';
 if(process.env.VERIFY_RESULT_JSON){if(!['base','candidate'].includes(phase)||!/^[a-f0-9]{32}$/.test(runId))throw Error('Invalid schema2 invocation.');try{await lstat(process.env.VERIFY_RESULT_JSON);throw Error('Result path already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const map=async paths=>Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,sha(await readFile(join(root,p)))])));
 const before=await map(declaration.sourcePaths),helpers=await map(declaration.helperPaths),commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 await mkdir('/tmp/bz-retained-studio',{recursive:true});output=await mkdtemp('/tmp/bz-retained-studio/'+phase+'-');
 const results=[];const record=async(id,observation,validate)=>{if(id!==group.assertions[results.length])throw Error('Retained Studio assertion order changed.');let status='pass',detail='Independent retained Studio oracle passed.';try{(id==='STUDIO_SAVED_SETUP_TRUTH'?savedSetupSuccessor:validate)(observation);}catch(e){if(!(e instanceof ReachedMismatch))throw e;status='fail';detail=e.message;}const path=join(output,id+'.json');await writeFile(path,JSON.stringify(observation,null,2)+'\n',{flag:'wx'});results.push({id,status,detail,path,sha256:sha(await readFile(path))});};
 let cleanup;if(index===3)cleanup={kind:'pure-controls',browser:await group.run(null,record)};
 else{const verified=await withVerifiedFixture(async f=>{await f.initialize();await group.run(f,record);return f.browserCleanup;},configuration);cleanup={services:verified.cleanup,browser:verified.result};}
 if(JSON.stringify(results.map(x=>x.id))!==JSON.stringify(group.assertions))throw Error('Retained Studio assertion set incomplete.');
 if(execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==commit||JSON.stringify(await map(declaration.sourcePaths))!==JSON.stringify(before)||JSON.stringify(await map(declaration.helperPaths))!==JSON.stringify(helpers))throw Error('Retained Studio source/evidence changed during execution.');
 const exit=results.some(x=>x.status==='fail')?1:0;await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify({commit,phase,runId,before,helpers,results,cleanup,exit},null,2)+'\n');
 if(process.env.VERIFY_RESULT_JSON)await writeFile(process.env.VERIFY_RESULT_JSON,JSON.stringify({protocol:1,check:check.name,phase,run_id:runId,assertions:results.map(({id,status,detail})=>({id,status,detail}))})+'\n',{flag:'wx'});
 console.log('RETAINED_STUDIO_RECEIPT '+output);process.exitCode=exit;
}catch(e){if(output)await writeFile(join(output,'HARNESS99.json'),JSON.stringify({error:e.message,terminalResult:false})+'\n').catch(()=>{});console.error('RETAINED_STUDIO_HARNESS99 '+e.stack);process.exitCode=99;}
