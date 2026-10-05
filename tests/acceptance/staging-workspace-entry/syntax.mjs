// Separate regression evidence. A finite SyntaxError is1; unavailable runtime/deadline is99.
import {spawnSync} from 'node:child_process';
import {access,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
export async function syntax(output){
 const started=Date.now(),node24='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
 const root=resolve(process.env.VERIFY_ROOT||process.cwd()),path=join(root,'public/staging-admin/studio.js');
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');let file;
 try{await access(node24);file=await readFile(path);}catch{throw Error('Syntax runtime/source unavailable');}
 const version=spawnSync(node24,['--version'],{encoding:'utf8',timeout:5000});if(version.error||version.status!==0||version.stdout.trim()!=='v24.4.1')throw Error('Required Node24.4.1 syntax runtime unavailable');
 const parsed=spawnSync(node24,['--check',path],{encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
 if(parsed.error||parsed.signal||![0,1].includes(parsed.status))throw Error('Syntax runtime/internal deadline unavailable');
 // Other process failures cannot masquerade as an ordinary parse defect.
 if(parsed.status===1&&!/SyntaxError/.test(parsed.stderr))throw Error('Syntax runtime failed without finite SyntaxError');
 const revision=spawnSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
 const receipt={version:3,mode:'syntax',actualExit:parsed.status,durationMs:Date.now()-started,actualNodeVersion:version.stdout.trim(),actualNodeRuntime:node24,sourcePath:path,sourceSHA256:hash(file),sourceCommit:revision.status===0?revision.stdout.trim():null,syntaxEvidenceSHA256:hash(await readFile(new URL('./syntax.mjs',import.meta.url))),expectedBaseExit:0,stderr:parsed.stderr||'',classification:revision.status===0?'ACTUAL_APPLICATION_'+(process.env.VERIFY_TREE||'CURRENT_TREE').toUpperCase()+'_SYNTAX':'ISOLATED_INVALID_JS_ORACLE_CONTROL',kernelInvoked:false};
 await mkdir(output,{recursive:true});await writeFile(join(output,'RUN_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');console.log('CASE_RESULT '+JSON.stringify(receipt));return parsed.status;
}
