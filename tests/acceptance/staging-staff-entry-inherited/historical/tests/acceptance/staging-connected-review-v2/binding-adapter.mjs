#!/usr/bin/env node
import {readFile, writeFile, mkdir, mkdtemp, lstat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {classify, need, invocation, validateBinding} from './binding-oracle.mjs';

const root = resolve(process.env.VERIFY_ROOT || process.cwd());
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const groupName = 'Inherited accepted source and exact59 assertion bindings remain unchanged';
const id = 'DR_INHERITED_BINDING';
let output;
try {
  const {phase, runId, schema} = invocation(process.argv, process.env);
  if (schema) {
    need(resolve(process.env.VERIFY_RESULT_JSON) === process.env.VERIFY_RESULT_JSON, 'absolute schema2 result path');
    try { await lstat(process.env.VERIFY_RESULT_JSON); throw Error('Preexisting result refused'); }
    catch (error) { need(error.code === 'ENOENT', 'fresh schema2 result'); }
  }
  const bindingBytes = await readFile(new URL('./INTEGRATION_BINDING.json', import.meta.url));
  const binding = JSON.parse(bindingBytes);
  const command = (bin, args) => {
    const result = spawnSync(bin, args, {cwd: root, encoding: 'utf8', timeout: 5000});
    need(!result.error && !result.signal && result.status === 0, 'source/runtime command');
    return result.stdout.trim();
  };
  const runtime = '/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';
  need(command(runtime, ['--version']) === 'v24.4.1', 'exact Node24 runtime');
  const commit = command('/usr/bin/git', ['rev-parse', 'HEAD']);
  const map = async paths => Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path => {
    try { return [path, hash(await readFile(join(root, path)))]; }
    catch (error) { if (error.code === 'ENOENT') return [path, null]; throw error; }
  })));
  const observe = async () => {
    const originalBytes = await readFile(join(root, binding.original010BindingPath));
    const original = JSON.parse(originalBytes);
    const inherited = JSON.parse(await readFile(join(root, 'tests/acceptance/staging-display-results/INHERITED.json')));
    return {
      phase, originalBindingSHA256: hash(originalBytes), originalInheritedSHA256: original.inheritedSHA256,
      historicalSHA256: await map(Object.keys(binding.original010InheritedSHA256)),
      helperSHA256: await map(Object.keys(binding.historicalEvidenceSHA256)),
      failedV1PacketSHA256: await map(Object.keys(binding.failedV1PacketSHA256)),
      productSHA256: await map(Object.keys(binding.candidateProductSHA256)),
      inheritedAssertionIds: inherited.assertionIds,
      inheritedGroups: inherited.groups.map(({name, argv, timeout, entry, assertions}) => ({name, argv, timeout, entry, assertions})),
      kernelVerifySHA256: hash(await readFile(binding.kernel.path)),
      kernelVersion: (await readFile(join(resolve(binding.kernel.path, '..'), 'VERSION'), 'utf8')).trim(),
      fullHistoricalBodiesExecutedHere: false, fullHistoricalExecutionInCombinedTask: true,
      original198ExpectationsChanged: false, allowedSuccessor: binding.authorizedHistoricalException,
      currentDTO: binding.semanticBoundary
    };
  };
  const before = await observe();
  await mkdir('/tmp/task-root', {recursive: true});
  output = await mkdtemp('/tmp/task-root/connected-binding-' + phase + '-');
  const start = {protocol: 1, name: groupName, id, phase, runId, commit, sourceRoot: root, startedMs: Date.now(), output,
    bindingSHA256: hash(bindingBytes), runtime, runtimeSHA256: hash(await readFile(runtime)), aggregateGate: false, ownerAcceptance: false};
  await writeFile(join(output, 'START.json'), JSON.stringify(start, null, 2) + '\n', {flag: 'wx'});
  let status = 'pass', detail = 'All original198 hashes retained; exact accepted009 wrapper successor and exact source/handoff additions obey the trusted phase.';
  try { validateBinding(before, binding); }
  catch (error) { if (classify(error) !== 1) throw error; status = 'fail'; detail = error.message; }
  const observationPath = join(output, id + '.json');
  await writeFile(observationPath, JSON.stringify(before, null, 2) + '\n', {flag: 'wx'});
  need(command('/usr/bin/git', ['rev-parse', 'HEAD']) === commit, 'unchanged source commit during binding');
  need(JSON.stringify(await observe()) === JSON.stringify(before), 'unchanged source/evidence during binding');
  need(hash(await readFile(new URL('./INTEGRATION_BINDING.json', import.meta.url))) === start.bindingSHA256, 'unchanged integration binding');
  const result = {id, status, detail, observationPath, observationSHA256: hash(await readFile(observationPath))};
  const exit = status === 'pass' ? 0 : 1;
  const receipt = {...start, endedMs: Date.now(), exit, classification: exit ? 'FINITE_REACHED_MISMATCH' : 'SUCCESSOR_BOUND_PASS', results: [result]};
  const receiptPath = join(output, 'RUN_RECEIPT.json');
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  if (schema) await writeFile(process.env.VERIFY_RESULT_JSON, JSON.stringify({protocol: 1, check: groupName, phase, run_id: runId, assertions: [{id, status, detail}]}) + '\n', {flag: 'wx'});
  console.log('CASE_RESULT ' + JSON.stringify(result));
  console.log('CONNECTED_BINDING_RECEIPT ' + JSON.stringify({path: receiptPath, sha256: hash(await readFile(receiptPath)), exit, aggregateGate: false}));
  process.exitCode = exit;
} catch (error) {
  if (output) await writeFile(join(output, 'FAILED.json'), JSON.stringify({classification: 'HARNESS99', reason: error.message, stack: error.stack, output, finalResultEmitted: false}, null, 2) + '\n').catch(() => {});
  console.error('HARNESS99 ' + String(error?.stack || error));
  process.exitCode = 99;
}
