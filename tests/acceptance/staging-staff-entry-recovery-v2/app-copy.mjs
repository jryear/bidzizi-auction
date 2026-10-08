// Concrete legacy Next output boundary only. Product/config bytes are immutable.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,realpath,symlink,readdir,appendFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assertOwnedScratch,assertApplicationSlot} from './owned-processes.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const selection=JSON.parse(await readFile(new URL('../staging-staff-entry-inherited-selection-v1/SELECTION.json',import.meta.url)));
const inputNames=['AGENTS.md','package.json','pnpm-lock.yaml','tsconfig.json','next-env.d.ts','next.config.ts','next.config.mjs','next.config.js','postcss.config.mjs'];
const manifest=new Map(selection.selectedSource.manifest.map(r=>[r.path,r]));
const expected=Object.fromEntries([...Object.entries(selection.selectedApplicationSHA256),...inputNames.filter(p=>manifest.has(p)).map(p=>[p,manifest.get(p).sha256])]);
async function identity(path){const s=await lstat(path);assert.ok(s.isDirectory()&&!s.isSymbolicLink(),'Exact regular runtime directory');return {realpath:await realpath(path),dev:s.dev,ino:s.ino};}
async function observe(root){
 const files={};const extras={};
 async function walk(path,prefix=''){
  for(const name of (await readdir(path)).sort()){
   const full=join(path,name),rel=prefix+name,s=await lstat(full);
   if(rel==='node_modules'){assert.ok(s.isSymbolicLink(),'Declared dependency link only');assert.equal(await realpath(full),selection.externalDependencies.node_modules.canonicalTarget);continue;}
   assert.ok(!s.isSymbolicLink(),'No runtime source/output symlink');
   if(s.isDirectory())await walk(full,rel+'/');
   else{assert.ok(s.isFile(),'Regular runtime files');const row={sha256:sha(await readFile(full)),mode:s.mode&0o777,bytes:s.size};if(rel in expected)files[rel]=row;else{assert.ok(rel.startsWith('.next/dev/'),'Only observed legacy Next dev output namespace');extras[rel]=row;}}
  }
 }
 await walk(root);assert.deepEqual(Object.keys(files).sort(),Object.keys(expected).sort(),'Complete accepted runtime input set');
 for(const [path,hash] of Object.entries(expected)){assert.equal(files[path].sha256,hash,'Exact accepted app/config '+path);assert.equal(files[path].mode,0o644,'Exact source mode '+path);}
 return {files,generated:extras};
}
async function ledger(row){assert.ok(process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR,'Typed owned output ledger');await appendFile(join(process.env.BZ_INHERITED_PROCESS_REGISTRY_DIR,'RUNTIME_APPLICATION_COPIES.jsonl'),JSON.stringify(row)+'\n');}
export async function createRuntimeCopy(repo,scratch){
 assertOwnedScratch(scratch);assertApplicationSlot();const root=join(scratch,'app');await mkdir(root,{mode:0o700});
 const owner=await identity(root);assert.equal(owner.realpath,join((await identity(scratch)).realpath,'app'),'Canonical fixture-owned runtime child');
 for(const [path,hash] of Object.entries(expected)){
  const source=join(repo,path),s=await lstat(source);assert.ok(s.isFile()&&!s.isSymbolicLink(),'Regular accepted source input');assert.equal(s.mode&0o777,0o644);const bytes=await readFile(source);assert.equal(sha(bytes),hash,'Source pinned to accepted e0 application/config');
  const target=join(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{mode:0o644,flag:'wx'});
 }
 assert.equal(await realpath(join(repo,'node_modules')),selection.externalDependencies.node_modules.canonicalTarget);await symlink(selection.externalDependencies.node_modules.canonicalTarget,join(root,'node_modules'),'dir');
 const before=await observe(root);assert.equal(Object.keys(before.generated).length,0);const record={version:1,sourceRepo:repo,root,scratch,owner,sourceCommit:selection.selectedSource.commit,application80SHA256:selection.selectedApplicationSHA256,before,createdMs:Date.now()};await ledger({...record,stage:'BEFORE_LAUNCH',productBytesChanged:false});return record;
}
export async function validateRuntimeCopy(record){
 assertOwnedScratch(record.scratch);assertApplicationSlot();assert.deepEqual(await identity(record.root),record.owner,'Runtime child ownership unchanged');
 const after=await observe(record.root);assert.deepEqual(after.files,record.before.files,'Complete copied accepted app/config unchanged after runtime');
 await ledger({...record,stage:'AFTER_FINAL_APP_STOP',after,endedMs:Date.now(),application80Exact:true,configurationInputsExact:true,immutableSelectedSourceGuardChanged:false,generatedOutputsIsolated:true});
}
