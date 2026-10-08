import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function observeSource(root,binding,manifest){
 const map=async(paths,prefix=root)=>Object.fromEntries(await Promise.all(Object.keys(paths).sort().map(async path=>[path,sha(await readFile(join(prefix,path)))])));
 const old=JSON.parse(await readFile(new URL('./historical/tests/acceptance/staging-connected-review-v2/INTEGRATION_BINDING.json',import.meta.url)));
 const expectedRetainedHistoricalHelpersSHA256=Object.fromEntries(Object.entries(old.historicalEvidenceSHA256).filter(([p])=>!(p in manifest.rootImportSHA256)));
 expectedRetainedHistoricalHelpersSHA256['.gitignore']=manifest.rootRetainedCurrentSHA256['.gitignore'];
 return {
  historicalArchiveSHA256:await map(manifest.historicalArchiveSHA256,new URL('./historical/',import.meta.url).pathname),
  importedHistoricalSHA256:await map(manifest.rootImportSHA256),
  immutableCurrentApplicationSHA256:await map(binding.immutableCurrentApplicationSHA256),
  acceptedApplicationSHA256:binding.acceptedEntry?await map(binding.acceptedEntry.acceptedApplicationSHA256):null,
  protected009SHA256:await map(binding.protected009SHA256),
  entryTaskSHA256:sha(await readFile(join(root,binding.new36IDContract.path))),
  entryEvidenceSHA256:await map(binding.entryEvidenceSHA256),
  retainedHistoricalHelpersSHA256:await map(expectedRetainedHistoricalHelpersSHA256),expectedRetainedHistoricalHelpersSHA256,
  kernelSHA256:sha(await readFile(binding.kernel.path)),kernelVersion:(await readFile(join(binding.kernel.path,'..','VERSION'),'utf8')).trim()
 };
}
