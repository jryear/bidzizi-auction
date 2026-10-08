// Root-owned import preparation only. Never imports historical product source.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const root=resolve(process.env.VERIFY_ROOT||process.cwd());
const mode=process.argv[2];
if(process.argv.length!==3||!['--verify','--import'].includes(mode))throw Error('Exact --verify or root-authorized --import required');
const manifest=JSON.parse(await readFile(new URL('./HISTORICAL_MANIFEST.json',import.meta.url)));
const result={mode,imported:[],verified:[],missing:[]};
for(const [path,hash] of Object.entries(manifest.historicalArchiveSHA256))assert.equal(sha(await readFile(new URL('./historical/'+path,import.meta.url))),hash,'Exact historical archived bytes '+path);
for(const [path,hash] of Object.entries(manifest.rootImportSHA256)){
 assert.ok(path.startsWith('tests/')||path.startsWith('tasks/')||path.startsWith('docs/'),'No product source import');
 const target=join(root,path);let absent=false;
 try{const stat=await lstat(target);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Regular exact historic import only');assert.equal(sha(await readFile(target)),hash,'Refuse changed existing historical path');}
 catch(error){if(error.code!=='ENOENT')throw error;absent=true;}
 if(absent&&mode==='--import'){
  const bytes=await readFile(new URL('./historical/'+path,import.meta.url));await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});assert.equal(sha(await readFile(target)),hash);result.imported.push(path);
 }else if(absent)result.missing.push(path);
 else result.verified.push(path);
}
console.log(JSON.stringify(result));
if(result.missing.length)process.exitCode=99;
