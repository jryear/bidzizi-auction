// NEW source selection assurance. No old source observation or assertion changes.
import assert from 'node:assert/strict';
import {lstat,realpath,readdir,readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const manifestSHA=files=>sha(Buffer.from(JSON.stringify(files.map(({path,mode,sha256})=>({mode,path,sha256})))));
export function validateApplication(observed,expected){assert.deepEqual(observed,expected,'Exact phase-bound application inventory/hashes');}
export function validateSelected(observed,selection){
 const s=selection.selectedSource;
 assert.equal(observed.commit,s.commit);assert.equal(observed.tree,s.tree);
 assert.deepEqual(observed.files,s.manifest.map(({path,mode,sha256})=>({path,mode,sha256})),'Full selected physical source');
 assert.deepEqual(observed.index,s.manifest.map(({path,mode,oid})=>({path,mode,oid})),'Full selected index');
 assert.equal(manifestSHA(observed.files),s.canonicalManifestSHA256,'Canonical full selected manifest digest');
 assert.deepEqual(observed.application,selection.selectedApplicationSHA256);
 assert.equal(observed.dependencies,selection.externalDependencies.node_modules.canonicalTarget);
}
async function regular(root,path){
 assert.ok(path&&!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..'),'Canonical relative file');
 const full=join(root,path),stat=await lstat(full);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),path+' regular');
 assert.equal(await realpath(full),full,path+' canonical');
 return {sha256:sha(await readFile(full)),mode:stat.mode&0o111?'100755':'100644'};
}
export async function observeApplication(root,expected){
 root=await realpath(root);const observed={};
 for(const [path,hash] of Object.entries(expected)){
  try{const value=await regular(root,path);assert.equal(value.mode,'100644',path+' mode');observed[path]=value.sha256;}
  catch(error){if(error.code!=='ENOENT'||hash!==null)throw error;observed[path]=null;}
 }
 // Detect any additional application file, including ignored/untracked files.
 const actual=[];for(const top of [...new Set(Object.keys(expected).map(p=>p.split('/')[0]))]){
  try{for(const path of await filesUnder(root,top))actual.push(path);}
  catch(error){if(error.code!=='ENOENT'||Object.entries(expected).some(([p,h])=>p.startsWith(top+'/')&&h!==null))throw error;}
 }
 assert.deepEqual(actual.sort(),Object.keys(expected).filter(p=>expected[p]!==null).sort(),'Complete application inventory');
 return observed;
}
async function filesUnder(root,start){
 const found=[];
 async function walk(relative){
  const stat=await lstat(join(root,relative));assert.ok(!stat.isSymbolicLink(),'No source symlink '+relative);
  if(stat.isDirectory()){for(const name of (await readdir(join(root,relative))).sort())await walk(join(relative,name));}
  else{assert.ok(stat.isFile(),'No nonregular source '+relative);found.push(relative);}
 }
 await walk(start);return found;
}
async function physical(root,selection){
 const paths=[],directories=[];
 async function walk(relative){
  for(const name of (await readdir(join(root,relative))).sort()){
   const path=relative?join(relative,name):name;
   if(!relative&&['.git','node_modules'].includes(name))continue;
   const stat=await lstat(join(root,path));assert.ok(!stat.isSymbolicLink(),'No selected source symlink '+path);
   if(stat.isDirectory()){directories.push(path);await walk(path);}
   else{assert.ok(stat.isFile(),'No nonregular selected source '+path);paths.push(path);}
  }
 }
 await walk('');paths.sort();
 assert.deepEqual(paths,selection.selectedSource.manifest.map(r=>r.path),'No missing/extra selected source file');
 const expectedDirs=new Set();for(const path of paths){let d=dirname(path);while(d!=='.'){expectedDirs.add(d);d=dirname(d);}}
 assert.deepEqual(directories.sort(),[...expectedDirs].sort(),'No unexpected selected directory');
 const files=[];for(const path of paths)files.push({path,...await regular(root,path)});
 return files;
}
export async function observeSelected(root,selection,git){
 assert.equal(await realpath(root),resolve(root),'Canonical selected root');
 const gitStat=await lstat(join(root,'.git'));assert.ok(gitStat.isDirectory()&&!gitStat.isSymbolicLink(),'Owned regular .git directory');
 const dependency=await lstat(join(root,'node_modules'));assert.ok(dependency.isSymbolicLink(),'Exact declared dependency link');
 const dependencies=await realpath(join(root,'node_modules'));
 const commit=(await git(['rev-parse','HEAD'],root)).trim(),tree=(await git(['rev-parse','HEAD^{tree}'],root)).trim();
 const raw=await git(['ls-files','--stage','-z'],root);
 const index=raw.split('\0').filter(Boolean).map(row=>{const m=row.match(/^(100644|100755) ([a-f0-9]{40}) 0\t(.+)$/);assert.ok(m,'Exact stage0 index');return {path:m[3],mode:m[1],oid:m[2]};}).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const files=await physical(root,selection),application=await observeApplication(root,selection.selectedApplicationSHA256);
 const metadata=[];for(const path of (await filesUnder(root,'.git')).sort())metadata.push({path,...await regular(root,path)});
 const observed={commit,tree,index,files,application,dependencies,gitMetadata:metadata};validateSelected(observed,selection);return observed;
}
export function validateOwnership(actual,recorded,canonicalParent){
 assert.deepEqual(actual,recorded,'Owned snapshot canonical path/device/inode/birth identity');
 assert.ok(canonicalParent&&actual.directory===true&&actual.symlink===false&&actual.path.startsWith(join(canonicalParent,'staff-entry-selected-v1-')),'Exact private owned snapshot');
}
export async function identity(path){const stat=await lstat(path);return {path:await realpath(path),dev:stat.dev,ino:stat.ino,birthtimeMs:stat.birthtimeMs,directory:stat.isDirectory(),symlink:stat.isSymbolicLink()};}
