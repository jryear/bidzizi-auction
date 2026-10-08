// Static negative controls only. Never import selector/delegate, Git or apps.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateApplication,validateSelected,validateOwnership,observeApplication,manifestSHA,sha} from './source-guard.mjs';
import {validateBirth,validateCompletion,gitEnvironment,gitFlags} from './owned-git.mjs';
const s=JSON.parse(await readFile(new URL('./SELECTION.json',import.meta.url))),clone=x=>structuredClone(x),results=[];
function pass(name,fn){fn();results.push(name);}
function reject(name,fn){assert.throws(fn);results.push(name);}
for(const phase of ['base','candidate']){
 const expected=s.actualKernelApplicationSHA256ByPhase[phase];pass(phase+' exact80',()=>validateApplication(clone(expected),expected));
 for(const [name,change] of [['hash',v=>v[Object.keys(v).find(p=>v[p]!==null)]='f'.repeat(64)],['missing',v=>delete v[Object.keys(v)[0]]],['extra',v=>v['src/extra.ts']='a'.repeat(64)]]){const v=clone(expected);change(v);reject(phase+' rejects '+name,()=>validateApplication(v,expected));}
}
reject('genuine baseline cannot impersonate selected accepted80',()=>validateApplication(s.actualKernelApplicationSHA256ByPhase.base,s.selectedApplicationSHA256));
pass('candidate equals selected accepted80',()=>validateApplication(s.actualKernelApplicationSHA256ByPhase.candidate,s.selectedApplicationSHA256));
const observed={commit:s.selectedSource.commit,tree:s.selectedSource.tree,files:s.selectedSource.manifest.map(({path,mode,sha256})=>({path,mode,sha256})),index:s.selectedSource.manifest.map(({path,mode,oid})=>({path,mode,oid})),application:clone(s.selectedApplicationSHA256),dependencies:s.externalDependencies.node_modules.canonicalTarget};
pass('complete1023 selected source accepted',()=>validateSelected(observed,s));
for(const [name,change] of [['commit',v=>v.commit='a'.repeat(40)],['tree',v=>v.tree='b'.repeat(40)],['file hash',v=>v.files[0].sha256='f'.repeat(64)],['file mode',v=>v.files[0].mode='100755'],['missing file',v=>v.files.pop()],['extra file',v=>v.files.push({path:'unexpected',mode:'100644',sha256:'a'.repeat(64)})],['index OID',v=>v.index[0].oid='f'.repeat(40)],['index mode',v=>v.index[0].mode='100755'],['missing index',v=>v.index.pop()],['extra index',v=>v.index.push({path:'extra',mode:'100644',oid:'a'.repeat(40)})],['application',v=>v.application[Object.keys(v.application)[0]]='e'.repeat(64)],['dependency',v=>v.dependencies='/tmp/other-dependency']]){const v=clone(observed);change(v);reject('selected rejects '+name,()=>validateSelected(v,s));}
const wrongDigest=clone(s);wrongDigest.selectedSource.canonicalManifestSHA256='0'.repeat(64);reject('selected rejects manifest digest',()=>validateSelected(observed,wrongDigest));
pass('independent canonical digest exact',()=>assert.equal(manifestSHA(observed.files),'4ec72d4be4c7a73be0225250804b934802b26089d326ac5023ea64a7d808c906'));
const own={path:'/private/tmp/task-root/staff-entry-selected-v1-CONTROL/SOURCE',dev:1,ino:2,birthtimeMs:3,directory:true,symlink:false};
pass('canonical Darwin owned source identity',()=>validateOwnership(clone(own),own,'/private/tmp/task-root'));
for(const key of ['path','dev','ino','birthtimeMs','directory','symlink']){const v=clone(own);v[key]=typeof v[key]==='number'?999:typeof v[key]==='boolean'?!v[key]:'/private/tmp/foreign';reject('ownership rejects '+key,()=>validateOwnership(v,own,'/private/tmp/task-root'));}
reject('ownership refuses wrong canonical parent',()=>validateOwnership(own,own,'/tmp/task-root'));
const record={pid:123,birth:'Wed Oct 7 12:00:00 2026'};
pass('exact recorded live identity',()=>assert.equal(validateBirth(record,record.birth,true),true));
pass('confirmed absent recorded identity',()=>assert.equal(validateBirth(record,null,false),false));
reject('changed live identity preserved',()=>validateBirth(record,'Thu Oct 8 12:00:00 2026',true));
reject('changed nonnull identity never absence',()=>validateBirth(record,'Thu Oct 8 12:00:00 2026',false));
reject('unknown positive identity preserved',()=>validateBirth(record,null,true));
reject('missing birth preserved',()=>validateBirth({...record,birth:null},null,false));
const short={pid:123,birth:null,closed:true,exit:{code:0,signal:null}};
pass('short direct owned close plus absent PID/group',()=>validateCompletion(short,null,false,false));
reject('short command positive unknown PID preserved',()=>validateCompletion(short,null,true,false));
reject('short command positive group preserved',()=>validateCompletion(short,null,false,true));
reject('short command reused identity preserved',()=>validateCompletion(short,'Thu Oct 8 12:00:00 2026',true,true));
reject('short command missing close preserved',()=>validateCompletion({...short,closed:false},null,false,false));
reject('short command unsuccessful close preserved',()=>validateCompletion({...short,exit:{code:1,signal:null}},null,false,false));
const env=gitEnvironment({HOME:'/Users/CONTROL',GIT_CONFIG_COUNT:'9',GIT_SSH_COMMAND:'unexpected',GIT_OBJECT_DIRECTORY:'foreign',PATH:'foreign'});
pass('ambient Git injection removed',()=>{assert.equal(env.GIT_CONFIG_COUNT,undefined);assert.equal(env.GIT_SSH_COMMAND,undefined);assert.equal(env.GIT_OBJECT_DIRECTORY,undefined);});
pass('local Git config and transport isolated',()=>{assert.equal(env.GIT_CONFIG_GLOBAL,'/dev/null');assert.equal(env.GIT_CONFIG_SYSTEM,'/dev/null');assert.equal(env.GIT_CONFIG_NOSYSTEM,'1');assert.equal(env.GIT_ALLOW_PROTOCOL,'file');assert.equal(env.GIT_NO_LAZY_FETCH,'1');assert.equal(env.GIT_TERMINAL_PROMPT,'0');assert.ok(gitFlags.includes('core.hooksPath=/dev/null')&&gitFlags.includes('credential.helper=')&&gitFlags.includes('core.fsmonitor=false'));assert.equal(env.HOME,'/Users/CONTROL');});
// Small source inventory fixtures exercise namespaces, absences and rejection.
const temp=await mkdtemp(join(tmpdir(),'entry-selection-static-control-'));
try{
 const expected={'src/a.ts':sha('src'),'public/a.txt':sha('public'),'scripts/migrate-control.mjs':sha('script'),'migrations/absent.sql':null};
 for(const [path,hash] of Object.entries(expected)){if(hash===null)continue;await mkdir(join(temp,path,'..'),{recursive:true});await writeFile(join(temp,path),path.startsWith('src/')?'src':path.startsWith('public/')?'public':'script');}
 assert.deepEqual(await observeApplication(temp,expected),expected);results.push('physical inventory includes scripts and genuinely absent namespace');
 await writeFile(join(temp,'scripts/ignored-extra.mjs'),'extra');await assert.rejects(()=>observeApplication(temp,expected));results.push('physical inventory rejects additional script');await rm(join(temp,'scripts/ignored-extra.mjs'));
 await chmod(join(temp,'src/a.ts'),0o755);await assert.rejects(()=>observeApplication(temp,expected));results.push('physical inventory rejects changed executable mode');await chmod(join(temp,'src/a.ts'),0o644);
 await rm(join(temp,'public/a.txt'));await symlink(join(temp,'src/a.ts'),join(temp,'public/a.txt'));await assert.rejects(()=>observeApplication(temp,expected));results.push('physical inventory rejects application symlink');
}finally{await rm(temp,{recursive:true,force:false});}
console.log(JSON.stringify({status:'STATIC_SELECTION_CONTROLS_PASS',controls:results.length,results,selectorImported:false,gitStarted:false,appDBBrowserKernelStarted:false}));
