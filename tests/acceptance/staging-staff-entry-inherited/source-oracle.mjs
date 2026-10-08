import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function validateSource(observed,binding,manifest,groups){
 assert.deepEqual(observed.historicalArchiveSHA256,manifest.historicalArchiveSHA256,'All261 historical archived bytes exact');
 assert.deepEqual(observed.importedHistoricalSHA256,manifest.rootImportSHA256,'All148 missing historical paths imported byte-exact');
 assert.deepEqual(observed.immutableCurrentApplicationSHA256,binding.immutableCurrentApplicationSHA256,'Current immutable source outside015 scope exact');
 if(binding.acceptedEntry)assert.deepEqual(observed.acceptedApplicationSHA256,binding.acceptedEntry.acceptedApplicationSHA256,'Every exact accepted Entry application byte retained');
 assert.deepEqual(observed.protected009SHA256,binding.protected009SHA256,'Original009 wrapper, functions and routes exact');
 assert.equal(observed.entryTaskSHA256,binding.new36IDContract.sha256,'Frozen015 task byte-exact');
 assert.deepEqual(observed.entryEvidenceSHA256,binding.entryEvidenceSHA256,'Exact reviewed v2 Entry freeze evidence closure retained');
 assert.deepEqual(observed.retainedHistoricalHelpersSHA256,binding.retainedHistoricalHelpersSHA256,'Existing historical helpers exact; only approved current gitignore differs');
 assert.equal(observed.kernelSHA256,binding.kernel.sha256,'External kernel unchanged');
 assert.equal(observed.kernelVersion,binding.kernel.version);
 assert.equal(groups.groups.length,32);assert.equal(groups.standalone009Groups,27);assert.equal(groups.standalone009IDs,80);
 const ids=groups.groups.flatMap(g=>g.assertions);assert.equal(ids.length,96);assert.equal(new Set(ids).size,96);
 assert.equal(groups.standalonePrefixExactlyEqual,true);
 assert.equal(createHash('sha256').update(JSON.stringify(groups.groups)).digest('hex'),binding.originalCombinedGroupsSHA256,'Exact original32 group declarations, IDs, commands and deadlines');
 assert.equal(groups.groups.slice(0,27).flatMap(g=>g.assertions).length,80);
 assert.equal(groups.groups[31].assertions[0],'DR_INHERITED_BINDING');
 assert.deepEqual(binding.mutableExistingStudioPaths,['public/staging-admin/index.html','public/staging-admin/studio.js','public/staging-admin/studio.css']);
 assert.equal(binding.approvedCurrentDeltas.length,6);
 assert.deepEqual(binding.approvedCurrentDeltas.map(r=>r.path).sort(),['.gitignore','AGENTS.md','public/staging-admin/studio.css','public/staging-admin/studio.js','src/app/page.tsx','src/server/config.ts'].sort());
 return true;
}
