import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectorCases,adapterCases} from './fixtures.mjs';
const node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
const directory=dirname(fileURLToPath(import.meta.url));
const mode=process.argv[2],root=resolve(process.env.VERIFY_ROOT||process.cwd());
if(!['selector','adapter'].includes(mode)){console.error('HARNESS: mode must be selector or adapter.');process.exit(99);}
const cases=mode==='selector'?selectorCases:adapterCases;
let completed=0;
try{
 for(const fixture of cases){
  const env={PATH:'/usr/bin:/bin',HOME:'/tmp',LANG:'en_US.UTF-8',...Object.fromEntries(Object.entries(fixture.env).filter(([,value])=>value!==undefined))};
  const child=spawnSync(node,['--conditions=react-server','--experimental-loader',resolve(directory,'loader.mjs'),resolve(directory,'worker.mjs'),mode,fixture.id,root],{cwd:root,env,encoding:'utf8',timeout:10_000,maxBuffer:256*1024});
  if(child.error){
   const timeout=child.error.code==='ETIMEDOUT';
   console.error(timeout?'APPLICATION: pure selector/adapter exceeded 10 seconds.':`HARNESS: Node worker unavailable (${child.error.code}).`);
   process.exitCode=timeout&&process.env.VERIFY_TREE!=='base'?1:99;
   break;
  }
  if(child.status!==0){
   process.stderr.write(child.stderr||child.stdout||'FAIL: boundary worker failed without diagnostic.\n');
   process.exitCode=child.status===99?99:1;
   break;
  }
  assert.equal(child.stdout.trim(),`PASS ${mode}: ${fixture.id}`,'Every declared worker must finish its assertions.');
  completed++;
  process.stdout.write(child.stdout);
 }
 if(!process.exitCode){assert.equal(completed,cases.length);console.log(`${completed} fixed ${mode} boundary cases passed.`);}
}catch(error){console.error(`FAIL: ${error.message}`);process.exitCode=1;}
