#!/usr/bin/env python3
"""Read-only finite source/declaration closure. No selector/runtime import."""
import pathlib,json,hashlib,tomllib,subprocess,os,stat,fnmatch
root=pathlib.Path(__file__).resolve().parents[3];packet=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
s=json.loads((packet/'SELECTION.json').read_text());store=s['selectedSource']['gitObjectStore']
env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
env.update(GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_SYSTEM='/dev/null',GIT_CONFIG_GLOBAL='/dev/null',GIT_NO_LAZY_FETCH='1',GIT_NO_REPLACE_OBJECTS='1',GIT_ALLOW_PROTOCOL='file')
def git(*args,input=None):
 p=subprocess.run(['/usr/bin/git','--git-dir',store,*args],input=input,capture_output=True,env=env,timeout=20)
 assert p.returncode==0,p.stderr.decode(errors='replace');return p.stdout
def tree(commit):
 rows=[]
 for row in git('ls-tree','-rz','--full-tree',commit).split(b'\0'):
  if not row:continue
  metadata,path=row.split(b'\t',1);mode,kind,oid=metadata.decode().split();assert mode=='100644' and kind=='blob'
  rows.append({'path':path.decode(),'mode':mode,'oid':oid})
 return sorted(rows,key=lambda r:r['path'])
def blobs(rows):
 raw=git('cat-file','--batch',input=('\n'.join(r['oid'] for r in rows)+'\n').encode());offset=0;out={}
 for r in rows:
  end=raw.index(b'\n',offset);oid,kind,size=raw[offset:end].decode().split();assert oid==r['oid'] and kind=='blob'
  size=int(size);data=raw[end+1:end+1+size];assert len(data)==size and raw[end+1+size:end+2+size]==b'\n'
  out[r['path']]=data;offset=end+2+size
 assert offset==len(raw);return out
rows=tree(s['selectedSource']['commit']);data=blobs(rows)
assert git('rev-parse',s['selectedSource']['commit']+'^{tree}').decode().strip()==s['selectedSource']['tree']
manifest=[{**r,'sha256':sha(data[r['path']])} for r in rows]
assert manifest==s['selectedSource']['manifest'] and len(rows)==s['selectedSource']['trackedLeaves']==1023
assert sum(map(len,data.values()))==s['selectedSource']['totalBlobBytes']==35954063
canonical=[{k:r[k] for k in ['path','mode','sha256']} for r in rows for r in [next(m for m in manifest if m['path']==r['path'])]]
assert sha(json.dumps(canonical,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())==s['selectedSource']['canonicalManifestSHA256']=='4ec72d4be4c7a73be0225250804b934802b26089d326ac5023ea64a7d808c906'
assert pathlib.Path(store).resolve()==pathlib.Path(store)
namespaces={p.split('/')[0] for p in s['selectedApplicationSHA256']};assert namespaces=={'src','public','scripts','migrations'}
app=lambda files:{p:sha(b) for p,b in files.items() if p.split('/')[0] in namespaces}
assert app(data)==s['selectedApplicationSHA256']==s['actualKernelApplicationSHA256ByPhase']['candidate'] and len(app(data))==80
for phase,commit in [('base',s['genuineEntryBase']),('candidate',s['acceptedApplicationCommit'])]:
 files=blobs(tree(commit));observed={p:sha(files[p]) if p in files else None for p in s['selectedApplicationSHA256']}
 assert observed==s['actualKernelApplicationSHA256ByPhase'][phase]
 assert set(app(files))=={p for p,h in observed.items() if h is not None}
base=s['actualKernelApplicationSHA256ByPhase']['base'];candidate=s['selectedApplicationSHA256']
missing=[p for p,h in base.items() if h is None];changed=[p for p,h in base.items() if h is not None and h!=candidate[p]]
assert len(missing)==6 and changed==['public/staging-admin/studio.css','public/staging-admin/studio.js']
assert s['cleanupReserveMilliseconds']==15000 and not s['networkAllowed'] and s['preserveFailedSnapshot']
assert s['selectedSource']['sourceBoundExternalExecutionInput'] and not s['selectedSource']['kernelRootAssurance']
assert pathlib.Path(s['externalDependencies']['node_modules']['canonicalTarget']).resolve()==pathlib.Path(s['externalDependencies']['node_modules']['canonicalTarget'])
assert len(s['frozenPredecessor460SHA256'])==460
for p,h in s['frozenPredecessor460SHA256'].items():
 assert sha(data[p])==h and sha((root/p).read_bytes())==h,p
 assert stat.S_ISREG((root/p).lstat().st_mode) and not (root/p).is_symlink(),p
entry_task=root/s['originalEntryTask'];assert sha(entry_task.read_bytes())==s['originalEntryTaskSHA256']=='821ad1e050906bfd028736099675cf14d157c7fb595bd5726c54cb23f24715ef'
entry=tomllib.loads(entry_task.read_text());old=tomllib.loads((root/'tasks/staging-staff-entry-inherited-portable-v1.toml').read_text())
task_path=root/'tasks/staging-staff-entry-composed-selection-v1.toml';new=tomllib.loads(task_path.read_text())
assert len(new['checks'])==33 and new['checks'][0]==entry['checks'][0]
assert new['scope']==old['scope'] and new['worktree']==old['worktree']
extras={str(p.relative_to(root)) for p in packet.rglob('*') if p.is_file()}|{str(p.relative_to(root)) for p in (root/'docs/proposed/staff-entry-inherited-selection-v1').rglob('*') if p.is_file()}|{str(task_path.relative_to(root))}
assert len(extras)==11
for i,(before,after) in enumerate(zip(old['checks'],new['checks'][1:])):
 for k in ['name','kind','timeout','assertions','baseline_failures']:assert before[k]==after[k],(i,k)
 assert after['argv']==[before['argv'][0],'tests/acceptance/staging-staff-entry-inherited-selection-v1/entry.mjs',str(i)]
 assert after['entry']==after['argv'][1]
 for k in ['chain','evidence']:assert set(after[k])==set(before[k])|extras,(i,k)
 for p in after['chain']:
  path=root/p;assert '[' not in p and ']' not in p and not path.is_symlink() and stat.S_ISREG(path.lstat().st_mode),p
ids=[a for c in new['checks'] for a in c['assertions']];assert len(ids)==len(set(ids))==101
assert new['checks'][0]['baseline_failures']==new['checks'][0]['assertions'] and len(new['checks'][0]['assertions'])==5
assert all(c['kind']=='regression' and c['baseline_failures']==[] for c in new['checks'][1:])
for p in packet.glob('*.mjs'):
 check=subprocess.run(['/Users/jryear/.nvm/versions/node/v24.4.1/bin/node','--check',str(p)],capture_output=True,text=True);assert check.returncode==0,check.stderr
print(json.dumps({'status':'STATIC_SELECTION_PASS','checks':33,'ids':101,'entryGroup0Exact':True,'inherited32MetadataExact':True,'source1023Exact':True,'predecessor460Exact':True,'baseMissing':missing,'baseChanged':changed,'candidateApplication80Exact':True,'newFiles':11,'appDBBrowserKernelStarted':False,'runtimeResultClaimed':False}))
