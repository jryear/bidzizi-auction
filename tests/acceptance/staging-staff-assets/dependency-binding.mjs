import {createRequire} from 'node:module';
import {readFile,realpath,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {hash,sharp} from './oracles.mjs';
import {HarnessError} from '../staging-catalog/harness.mjs';
// External evidence decoder identity only. This is not an application install,
// dependency declaration or promise that the whole dependency tree is immutable.
export async function decoderBinding(root){
 try{
  const req=createRequire(import.meta.url),next=createRequire(req.resolve('next/package.json'));
  const decoder=sharp(),entry=await realpath(next.resolve('sharp')),packageRoot=dirname(dirname(entry));
  const packagePath=join(packageRoot,'package.json'),pkg=JSON.parse(await readFile(packagePath,'utf8'));
  const decoderReq=createRequire(entry),libPackage=decoderReq.resolve('@img/sharp-libvips-'+process.platform+'-'+process.arch+'/package');
  const native=Object.keys(next.cache).filter(p=>p.endsWith('.node')&&p.includes('/@img/sharp-'));
  if(native.length!==1)throw new Error('Exactly one loaded raster native module must be bound.');
  const libRoot=dirname(libPackage),libDir=join(libRoot,'lib');
  const libs=(await readdir(libDir)).filter(p=>/\.(?:dylib|so(?:\.\d+)*|dll)$/.test(p));
  if(!libs.length)throw new Error('Decoder native-library identities unavailable.');
  const paths=[packagePath,entry,...Object.keys(next.cache).filter(p=>p.startsWith(packageRoot+'/dist/')),...native,libPackage,...libs.map(p=>join(libDir,p))];
  const files=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>{const resolved=await realpath(p);return [resolved,hash(await readFile(resolved))];})));
  return {boundary:'EXTERNAL_EVIDENCE_DECODER_RELEVANT_FILES_ONLY',linkedNodeModules:await realpath(join(root,'node_modules')),package:pkg.name,version:pkg.version,entry,versions:decoder.versions,files};
 }catch(e){throw new HarnessError('Evidence decoder module/native byte identity unavailable: '+e.message);}
}
