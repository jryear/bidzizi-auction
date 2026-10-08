#!/usr/bin/env python3
"""Static closure equality only. Never launches app/DB/browser/kernel/services."""
import hashlib,json,pathlib,tomllib,subprocess
root=pathlib.Path(__file__).resolve().parents[3]
packet=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads((packet/p).read_text())
manifest=read('HISTORICAL_MANIFEST.json');groups=read('GROUPS.json');binding=read('SOURCE_BINDING.json')
entry_bytes=(root/binding['new36IDContract']['path']).read_bytes()
assert sha(entry_bytes)==binding['new36IDContract']['sha256'],'Exact explicitly bound Entry task'
entry=tomllib.loads(entry_bytes.decode());assert entry['id']==binding['new36IDContract']['id']
assert len(entry['checks'])==9 and sum(len(g['assertions']) for g in entry['checks'])==36
entry_paths=set(p for g in entry['checks'] for p in g['chain'])
assert set(binding['entryEvidenceSHA256'])==entry_paths,'Exact reviewed successor path closure'
for p,h in binding['entryEvidenceSHA256'].items():assert sha((root/p).read_bytes())==h,p
old009=tomllib.loads((packet/'historical/tasks/staging-demo-attendee-entry-009-v2.toml').read_text())
oldcombined=tomllib.loads((packet/'historical/tasks/staging-connected-review-009-010-v2.toml').read_text())
assert old009['checks']==oldcombined['checks'][:27]
assert groups['groups']==oldcombined['checks']
assert len(groups['groups'])==32 and sum(len(g['assertions']) for g in groups['groups'])==96
assert sum(len(g['assertions']) for g in old009['checks'])==80
for path,expected in manifest['historicalArchiveSHA256'].items():assert sha((packet/'historical'/path).read_bytes())==expected,path
for name in ['STUDIO_SUCCESSOR_DELTAS.json','DISPOSABLE_SETUP_DELTAS.json']:
 for record in read(name)['records']:
  source=(packet/'historical'/record['path']).read_text();assert sha(source.encode())==record['diskSHA256']
  for step in record['steps']:
   assert source.count(step['before'])==step['count'];source=source.replace(step['before'],step['after'])
  assert sha(source.encode())==record['executedSHA256']
  check=subprocess.run(['/Users/jryear/.nvm/versions/node/v24.4.1/bin/node','--check','--input-type=module'],input=source,text=True,capture_output=True)
  assert check.returncode==0,check.stderr
  if 'acceptedPriorFanSHA256' in record:
   fan=json.loads((packet/'historical/tests/acceptance/staging-welcome/SUPERSESSION.json').read_text())
   prior=(packet/'historical'/record['path']).read_text().replace(fan['original'],fan['replacement']);assert sha(prior.encode())==record['acceptedPriorFanSHA256']
   for step in record['steps']:prior=prior.replace(step['before'],step['after'])
   assert sha(prior.encode())==record['executedAfterPriorFanSHA256']
for path in packet.glob('*.mjs'):
 check=subprocess.run(['/Users/jryear/.nvm/versions/node/v24.4.1/bin/node','--check',str(path)],capture_output=True,text=True)
 assert check.returncode==0,check.stderr
task=tomllib.loads((root/'tasks/staging-staff-entry-inherited-regression.toml').read_text())
assert len(task['checks'])==32
for i,(old,new) in enumerate(zip(groups['groups'],task['checks'])):
 for key in ['name','timeout','assertions']:assert new[key]==old[key],(i,key)
 assert new['kind']=='regression' and new['baseline_failures']==[]
 assert new['argv']==[old['argv'][0],'tests/acceptance/staging-staff-entry-inherited/group.mjs',str(i)]
 assert entry_paths<=set(new['chain']) and entry_paths<=set(new['evidence']),'Every current Entry evidence path declared'
for p,h in binding['protected009SHA256'].items():assert sha((root/p).read_bytes())==h,p
print(json.dumps({'status':'STATIC_PREPARATION_PASS','groups':32,'ids':96,'009PrefixGroups':27,'009PrefixIDs':80,'historicalPaths':len(manifest['historicalArchiveSHA256']),'missingOnlyImports':len(manifest['rootImportSHA256']),'nativeSuccessorRecords':len(read('STUDIO_SUCCESSOR_DELTAS.json')['records']),'disposableSetupRecords':len(read('DISPOSABLE_SETUP_DELTAS.json')['records']),'appDBBrowserKernelStarted':False,'acceptedEntryRebound':bool(binding.get('acceptedEntry')),'freezeReady':False}))
