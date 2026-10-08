// Exact archive aliases only. No application observation or result conversion.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
function relative(path,alias=false){
 assert.ok(typeof path==='string'&&!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').some(s=>!s||s==='.'||s==='..'));
 if(alias)assert.ok(!/[\[\]*?\0]/.test(path),'Literal portable alias path');
 return path;
}
export function validateAliases(observed,mapping){
 assert.equal(mapping.version,1);assert.equal(mapping.aliases.length,17);
 assert.equal(new Set(mapping.aliases.map(r=>r.original)).size,17);
 assert.equal(new Set(mapping.aliases.map(r=>r.alias)).size,17);
 assert.deepEqual(observed.mandatoryFrozenSHA256,mapping.mandatoryFrozenSHA256,'Frozen original delegate/task/manifest retained');
 assert.equal(observed.aliases.length,17);
 mapping.aliases.forEach((record,index)=>{
  relative(record.original);relative(record.alias,true);assert.match(record.sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(observed.aliases[index],{original:record.original,alias:record.alias,originalSHA256:record.sha256,aliasSHA256:record.sha256},'Exact alias and original parity '+record.original);
 });
 return true;
}
export async function observeAliases(root,mapping){
 const canonical=await realpath(resolve(root));
 const regular=async path=>{relative(path);const target=join(canonical,path),stat=await lstat(target);assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'Regular frozen input '+path);assert.equal(await realpath(target),target,'No symlink ancestor '+path);return sha(await readFile(target));};
 return {mandatoryFrozenSHA256:Object.fromEntries(await Promise.all(Object.keys(mapping.mandatoryFrozenSHA256).sort().map(async path=>[path,await regular(path)]))),aliases:await Promise.all(mapping.aliases.map(async r=>({original:r.original,alias:r.alias,originalSHA256:await regular(r.original),aliasSHA256:await regular(r.alias)})))};
}
