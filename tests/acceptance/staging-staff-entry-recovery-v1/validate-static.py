from pathlib import Path
import json,hashlib,tomllib,subprocess
r=Path(__file__).resolve().parents[3];p=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def git(commit,path):return subprocess.check_output(['/usr/bin/git','show',commit+':'+path],cwd=r)
s=json.loads((r/'tests/acceptance/staging-staff-entry-inherited-selection-v1/SELECTION.json').read_text())
for path,h in s['frozenPredecessor460SHA256'].items():assert sha((r/path).read_bytes())==h,path
for path,h in s['actualKernelApplicationSHA256ByPhase']['candidate'].items():assert sha((r/path).read_bytes())==h,path
for path in subprocess.check_output(['/usr/bin/git','ls-tree','-r','--name-only','ff349660'],cwd=r).decode().splitlines():
 if path.startswith(('tasks/','tests/','docs/proposed/')):assert (r/path).read_bytes()==git('ff349660',path),path
old=tomllib.loads((r/'tasks/staging-staff-entry-composed-selection-v1.toml').read_text());new=tomllib.loads((r/'tasks/staging-staff-entry-composed-recovery-v1.toml').read_text())
assert old['checks'][0]==new['checks'][0] and len(new['checks'])==33
assert old['scope']==new['scope'] and old['worktree']==new['worktree']
extras={str(x.relative_to(r)) for x in p.glob('*') if x.is_file()}|{'docs/proposed/staff-entry-recovery-v1/CONTRACT.md','tasks/staging-staff-entry-composed-recovery-v1.toml'}
for i,(a,b) in enumerate(zip(old['checks'][1:],new['checks'][1:])):
 for k in a:
  if k in ['chain','evidence']:assert set(b[k])==set(a[k])|extras,(i,k)
  elif k=='entry':assert b[k]=='tests/acceptance/staging-staff-entry-recovery-v1/entry.mjs'
  elif k=='argv':assert b[k]==[a[k][0],'tests/acceptance/staging-staff-entry-recovery-v1/entry.mjs',str(i)]
  else:assert b[k]==a[k],(i,k)
 for path in b['chain']:assert (r/path).is_file() and not (r/path).is_symlink(),path
ids=[x for c in new['checks'] for x in c['assertions']];assert len(ids)==len(set(ids))==101
for d in json.loads((p/'DELTAS.json').read_text())['records']:
 original=(r/d['path']).read_bytes();assert sha(original)==d['diskSHA256'];text=original.decode()
 for step in d['steps']:assert text.count(step['before'])==step['count'];text=text.replace(step['before'],step['after'])
 assert sha(text.encode())==d['executedSHA256']
 result=subprocess.run(['/Users/jryear/.nvm/versions/node/v24.4.1/bin/node','--check','--input-type=module'],input=text,capture_output=True,text=True);assert result.returncode==0,result.stderr
for path in p.glob('*.mjs'):subprocess.run(['/Users/jryear/.nvm/versions/node/v24.4.1/bin/node','--check',str(path)],check=True)
print(json.dumps({'status':'STATIC_RECOVERY_PASS','predecessor460Exact':True,'allPriorTaskTestProposedBytesExact':True,'application80Exact':True,'checks':33,'IDs':101,'metadataKindsDeadlinesAssertionsClassifiersPreserved':True,'entryGroup0Exact':True,'newFiles':len(extras),'runtimeStarted':False}))
