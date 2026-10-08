import assert from 'node:assert/strict';

export const classify = error => error instanceof assert.AssertionError ? 1 : 99;
export const need = (condition, reason) => { if (!condition) throw Error('HARNESS99 ' + reason); };
export function invocation(argv, env) {
  need(argv.length === 3 && argv[2] === '4', 'exact successor binding group4');
  need(['base', 'candidate'].includes(env.VERIFY_TREE), 'explicit trusted base/candidate phase');
  for (const key of ['DATABASE_URL', 'BIDZIZI_STAGING_DATABASE_URL', 'APP_ORIGIN', 'VERCEL', 'VERCEL_ENV', 'BIDZIZI_STAGING_TEST_AUTH', 'BIDZIZI_APP_MODE', 'BIDZIZI_LOCAL_TEST_DATABASE', 'NODE_OPTIONS']) {
    need(env[key] === undefined, 'undeclared environment ' + key);
  }
  const schema = env.VERIFY_RESULT_JSON !== undefined;
  if (schema) need(/^[a-f0-9]{32}$/.test(env.VERIFY_RUN_ID || ''), 'schema2 run ID');
  return {phase: env.VERIFY_TREE, runId: schema ? env.VERIFY_RUN_ID : 'direct', schema};
}
export function expectedHistorical(binding, phase) {
  need(['base', 'candidate'].includes(phase), 'source expectation phase');
  const expected = {...binding.original010InheritedSHA256};
  if (phase === 'candidate') expected[binding.authorizedHistoricalException.path] = binding.authorizedHistoricalException.candidateSHA256;
  return expected;
}
// Used by the real adapter and broken controls. Only a fully pinned accepted wrapper
// replaces one original expectation; every other historical source/helper stays exact.
export function validateBinding(observed, binding) {
  need(['base', 'candidate'].includes(observed.phase), 'observed binding phase');
  const exception = binding.authorizedHistoricalException;
  assert.equal(Object.keys(binding.original010InheritedSHA256).length, 198);
  assert.equal(exception.path, 'src/app/events/[id]/event-access.tsx');
  assert.equal(exception.baselineSHA256, binding.original010InheritedSHA256[exception.path]);
  assert.notEqual(exception.candidateSHA256, exception.baselineSHA256);
  assert.equal(exception.candidateSHA256, binding.candidateProductSHA256[exception.path]);
  assert.equal(Object.keys(binding.candidateProductSHA256).length, 15);
  assert.equal(Object.keys(binding.baseProductSHA256).length, 15);
  assert.equal(Object.values(binding.baseProductSHA256).filter(x => x !== null).length, 1);
  assert.deepEqual(Object.keys(binding.baseProductSHA256).sort(), Object.keys(binding.candidateProductSHA256).sort());
  assert.equal(observed.originalBindingSHA256, binding.original010BindingSHA256, 'Original010 binding file unchanged');
  assert.deepEqual(observed.originalInheritedSHA256, binding.original010InheritedSHA256, 'Original198 expectations retained, not rewritten');
  assert.deepEqual(observed.historicalSHA256, expectedHistorical(binding, observed.phase), 'All198 historical sources exact except phase-specific accepted009 wrapper');
  assert.deepEqual(observed.helperSHA256, binding.historicalEvidenceSHA256, 'All original009v1/v2/010 and inherited helpers/specs plus exact runtime metadata reads');
  assert.deepEqual(observed.failedV1PacketSHA256, binding.failedV1PacketSHA256, 'Failed frozenv1 packet preserved unchanged');
  assert.deepEqual(observed.productSHA256, observed.phase === 'base' ? binding.baseProductSHA256 : binding.candidateProductSHA256, 'Exact accepted009+010 product/handoff, absent on base except original wrapper');
  assert.equal(observed.inheritedGroups.length, 24);
  assert.equal(observed.inheritedAssertionIds.length, 59);
  assert.equal(new Set(observed.inheritedAssertionIds).size, 59);
  assert.deepEqual(observed.inheritedAssertionIds, binding.inheritedAssertionIds, 'Exact59 accepted IDs');
  assert.deepEqual(observed.inheritedGroups, binding.inheritedGroups.map(({name, argv, timeout, entry, assertions}) => ({name, argv, timeout, entry, assertions})), 'Exact24 accepted commands, deadlines and assertion declarations');
  assert.equal(observed.kernelVerifySHA256, binding.kernel.sha256, 'Unchanged external kernel3.1.0 trust anchor');
  assert.equal(observed.kernelVersion, binding.kernel.version);
}
