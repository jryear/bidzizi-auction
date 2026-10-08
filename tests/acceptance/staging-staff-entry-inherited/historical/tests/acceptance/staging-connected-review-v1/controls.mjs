#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classify, invocation, expectedHistorical, validateBinding} from './binding-oracle.mjs';
const binding = JSON.parse(await readFile(new URL('./INTEGRATION_BINDING.json', import.meta.url)));
const make = phase => ({phase, originalBindingSHA256: binding.original010BindingSHA256,
  originalInheritedSHA256: {...binding.original010InheritedSHA256}, historicalSHA256: expectedHistorical(binding, phase),
  helperSHA256: {...binding.historicalEvidenceSHA256}, productSHA256: {...(phase === 'base' ? binding.baseProductSHA256 : binding.candidateProductSHA256)},
  inheritedAssertionIds: [...binding.inheritedAssertionIds], inheritedGroups: binding.inheritedGroups.map(({name, argv, timeout, entry, assertions}) => ({name, argv, timeout, entry, assertions})),
  kernelVerifySHA256: binding.kernel.sha256, kernelVersion: binding.kernel.version});
let positives = 0, negatives = 0, harness = 0;
for (const phase of ['base', 'candidate']) { validateBinding(make(phase), binding); positives++; }
const broken = (name, mutate, phase = 'candidate') => {
  const row = structuredClone(make(phase)); mutate(row);
  let error; try { validateBinding(row, binding); } catch (caught) { error = caught; }
  assert.ok(error, name + ' must be rejected'); assert.equal(classify(error), 1, name + ' is reached finite mismatch'); negatives++;
};
for (const path of Object.keys(binding.original010InheritedSHA256)) broken('original historical source ' + path, row => { row.historicalSHA256[path] = 'broken'; });
for (const path of Object.keys(binding.historicalEvidenceSHA256)) broken('protected historical helper ' + path, row => { row.helperSHA256[path] = 'broken'; });
for (const path of Object.keys(binding.candidateProductSHA256)) {
  broken('accepted exact product ' + path, row => { row.productSHA256[path] = 'broken'; });
  if (binding.baseProductSHA256[path] === null) broken('base must not contain accepted feature ' + path, row => { row.productSHA256[path] = binding.candidateProductSHA256[path]; }, 'base');
}
broken('unfixed64da wrapper forbidden', row => { row.historicalSHA256[binding.authorizedHistoricalException.path] = binding.previous009WrapperSHA256; });
broken('unfixed64da product wrapper forbidden', row => { row.productSHA256[binding.authorizedHistoricalException.path] = binding.previous009WrapperSHA256; });
broken('original198 map cannot be rewritten', row => { row.originalInheritedSHA256[binding.authorizedHistoricalException.path] = binding.authorizedHistoricalException.candidateSHA256; });
broken('original010 packet byte identity', row => { row.originalBindingSHA256 = 'broken'; });
broken('original wrapper required on base', row => { row.historicalSHA256[binding.authorizedHistoricalException.path] = binding.authorizedHistoricalException.candidateSHA256; }, 'base');
broken('successor wrapper required on candidate', row => { row.historicalSHA256[binding.authorizedHistoricalException.path] = binding.authorizedHistoricalException.baselineSHA256; });
broken('unknown extra historical source', row => { row.historicalSHA256['src/unapproved.ts'] = 'broken'; });
broken('unknown extra product', row => { row.productSHA256['src/unapproved.ts'] = 'broken'; });
broken('missing product', row => { delete row.productSHA256[Object.keys(row.productSHA256)[0]]; });
broken('missing helper', row => { delete row.helperSHA256[Object.keys(row.helperSHA256)[0]]; });
broken('exact59 IDs', row => { row.inheritedAssertionIds.pop(); });
broken('exact24 bodies', row => { row.inheritedGroups.pop(); });
broken('immutable inherited argv', row => { row.inheritedGroups[0].argv.push('bypass'); });
broken('immutable inherited timeout', row => { row.inheritedGroups[0].timeout++; });
broken('kernel anchor', row => { row.kernelVerifySHA256 = 'broken'; });
broken('kernel version', row => { row.kernelVersion = 'broken'; });
for (const run of [() => invocation(['node', 'adapter', '4'], {}), () => invocation(['node', 'adapter', '3'], {VERIFY_TREE: 'base'}), () => invocation(['node', 'adapter', '4'], {VERIFY_TREE: 'base', DATABASE_URL: 'synthetic'}), () => invocation(['node', 'adapter', '4'], {VERIFY_TREE: 'base', VERIFY_RESULT_JSON: '/tmp/synthetic', VERIFY_RUN_ID: 'bad'}), () => validateBinding({...make('base'), phase: 'direct'}, binding), () => { throw Error('Synthetic setup/transport failure'); }]) {
  let error; try { run(); } catch (caught) { error = caught; }
  assert.ok(error); assert.equal(classify(error), 99, 'setup/invocation failure is99'); harness++;
}
console.log(JSON.stringify({status: 'SUCCESSOR_BINDING_CONTROLS_PASS', positives, finiteMismatchControls: negatives, harness99Controls: harness, applicationEvidence: false, fixtureOrProductRuntime: false}));
