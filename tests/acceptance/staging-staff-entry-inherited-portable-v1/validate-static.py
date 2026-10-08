#!/usr/bin/env python3
"""Declaration portability only; never imports entry/group or starts runtimes."""
import pathlib,json,hashlib,tomllib,stat,subprocess,fnmatch
root=pathlib.Path(__file__).resolve().parents[3];packet=pathlib.Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mapping=json.loads((packet/'ALIASES.json').read_text());old_path=root/mapping['predecessorTask']['path']
assert sha(old_path)==mapping['predecessorTask']['sha256']
old=tomllib.loads(old_path.read_text());new_path=root/'tasks/staging-staff-entry-inherited-portable-v1.toml';new=tomllib.loads(new_path.read_text())
assert len(mapping['aliases'])==17
originals={r['original'] for r in mapping['aliases']};aliases={r['alias'] for r in mapping['aliases']}
assert len(originals)==len(aliases)==17
bad_paths={p for g in old['checks'] for p in g['chain'] if '[' in p or ']' in p};assert originals==bad_paths
for r in mapping['aliases']:
 for p in [r['original'],r['alias']]:
  path=root/p;assert not path.is_symlink() and stat.S_ISREG(path.lstat().st_mode),p
  assert sha(path)==r['sha256'],p
 assert (root/r['original']).read_bytes()==(root/r['alias']).read_bytes()
 assert '[' not in r['alias'] and ']' not in r['alias']
for p,h in mapping['predecessor433FilesSHA256'].items():assert sha(root/p)==h,p
assert len(mapping['predecessor433FilesSHA256'])==433
binding=json.loads((root/'tests/acceptance/staging-staff-entry-inherited/SOURCE_BINDING.json').read_text())
for p,h in binding['acceptedEntry']['acceptedApplicationSHA256'].items():assert sha(root/p)==h,p
reverse={r['alias']:r['original'] for r in mapping['aliases']}
new_prefix='tests/acceptance/staging-staff-entry-inherited-portable-v1/'
doc_prefix='docs/proposed/staff-entry-inherited-portable-v1/'
new_task='tasks/staging-staff-entry-inherited-portable-v1.toml'
extras={new_task}|{str(p.relative_to(root)) for p in packet.rglob('*') if p.is_file()}|{str(p.relative_to(root)) for p in (root/doc_prefix).rglob('*') if p.is_file()}
assert len(new['checks'])==32
reconstructed=new_path.read_text().splitlines();expected_entry=new_prefix+'entry.mjs'
for i,line in enumerate(reconstructed):
 if line.startswith('id = '):reconstructed[i]='id = '+json.dumps(old['id'])
 if line.startswith('portability = '):reconstructed[i]=None;continue
 if line.startswith('entry = '):reconstructed[i]='entry = '+json.dumps(mapping['originalDelegate'])
 if line.startswith('argv = '):args=json.loads(line[len('argv = '):]);assert args[1]==expected_entry;args[1]=mapping['originalDelegate'];reconstructed[i]='argv = '+json.dumps(args)
 for key in ['chain','evidence']:
  prefix=key+' = '
  if line.startswith(prefix):
   paths=json.loads(line[len(prefix):]);assert '[' not in ''.join(paths) and ']' not in ''.join(paths)
   old_paths=[reverse.get(p,p) for p in paths if p not in extras or p in aliases]
   if key=='evidence':old_paths=[p for p in old_paths if p!=mapping['originalArchiveGlob']]
   reconstructed[i]=prefix+json.dumps(sorted(old_paths))
assert hashlib.sha256(('\n'.join(line for line in reconstructed if line is not None)+'\n').encode()).hexdigest()==mapping['predecessorTask']['sha256'],'Only reviewed portability declaration delta'
for index,(before,after) in enumerate(zip(old['checks'],new['checks'])):
 for key in ['name','kind','timeout','assertions','baseline_failures']:assert before[key]==after[key],(index,key)
 assert after['argv']==[before['argv'][0],expected_entry,str(index)] and after['entry']==expected_entry
 assert before['chain']==sorted(reverse.get(p,p) for p in after['chain'] if p not in extras or p in aliases)
 assert aliases<=set(after['chain']) and expected_entry in after['evidence']
 assert all(any(fnmatch.fnmatchcase(p,pattern) for pattern in after['evidence']) for p in originals)
 for p in after['chain']:
  path=root/p;assert not path.is_symlink() and stat.S_ISREG(path.lstat().st_mode),p
assert new['scope']==old['scope'] and new['worktree']==old['worktree']
for p in packet.glob('*.mjs'):
 r=subprocess.run(['/Users/jryear/.nvm/versions/node/v24.4.1/bin/node','--check',str(p)],capture_output=True,text=True);assert r.returncode==0,r.stderr
print(json.dumps({'status':'STATIC_PORTABILITY_PASS','groups':32,'ids':96,'aliases':17,'original433Exact':433,'acceptedApplicationPathsExact':80,'originalTaskByteReconstructionExact':True,'originalBodiesClocksDeadlinesChanged':False,'appDBBrowserKernelStarted':False,'runtimeReady':False}))
