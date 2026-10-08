// Retain the predecessor runner and all 29 original assertions unchanged.
// The main agent executes one mode/test process at a time.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const mode=process.argv[2];
const original=mode?.startsWith('original-');
const childMode=original?mode.slice('original-'.length):mode;
if(!['acceptance','regression','adversarial','reviewed-regression','reviewed-adversarial'].includes(childMode)||(!original&&!childMode.startsWith('reviewed-'))){
 console.error(JSON.stringify({harness_error:'Mode must be original-acceptance, original-regression, original-adversarial, reviewed-regression or reviewed-adversarial.'}));process.exitCode=99;
}else{
 const entry=fileURLToPath(new URL(original?'../staging-mobile-poll-render/run.mjs':'./reviewed-cases.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[entry,childMode],{env:process.env,stdio:'inherit',timeout:110000});
 if(result.error||result.signal){console.error(JSON.stringify({harness_error:result.error?.message||'Child terminated with '+result.signal}));process.exitCode=99;}
 else process.exitCode=[0,1,99].includes(result.status)?result.status:99;
}
