from pathlib import Path
import subprocess,json,time,os,hashlib,tomllib
root=Path(__file__).resolve().parent
source=root/'clean13ec'
node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node'
env={'PATH':str(Path(node).parent)+':/opt/homebrew/opt/postgresql@18/bin:/usr/bin:/bin',
 'HOME':os.environ.get('HOME','/tmp/task-root'),'TMPDIR':'/tmp/task-root','LANG':'en_US.UTF-8',
 'NEXT_TELEMETRY_DISABLED':'1','VERIFY_TREE':'base','VERIFY_ROOT':str(source)}
checks=[];out=root/'proof-logs';out.mkdir(exist_ok=True)
def run(name,args,cwd=source,expected=0,group=None):
 start=time.monotonic();r=subprocess.run(args,cwd=cwd,env=env,text=True,capture_output=True,timeout=300)
 f=out/(name+'.log');f.write_text(r.stdout+r.stderr)
 item={'name':name,'argv':args,'exit':r.returncode,'expected_exit':expected,'elapsed_seconds':round(time.monotonic()-start,3),'log':str(f.relative_to(root)),'log_sha256':hashlib.sha256(f.read_bytes()).hexdigest()};checks.append(item)
 (root/'PROOF_PROGRESS.json').write_text(json.dumps({'checks':checks,'status':'RUNNING_NO_PRODUCT_CLAIM'},indent=2)+'\n')
 print(json.dumps(item),flush=True)
 assert r.returncode==expected,(name,r.returncode,r.stdout,r.stderr)
 if group:assert group in r.stdout,(name,'Missing exact complete group count.')
 return r
run('wrapper-node-syntax',[node,'--check',str(root/'cumulative-catalog.mjs')],root)
run('pure-classification-and-context-controls',[node,str(root/'controls.mjs')],root)
for mode in ['acceptance','adversarial']:
 r=run('original002-base-'+mode,[node,'tests/acceptance/staging-catalog/run.mjs',mode],expected=99)
 assert 'Baseline must fail finitely on the absent catalog API404' in r.stderr
for mode,groups in [('acceptance',4),('adversarial',7)]:
 run('wrapped002-base-'+mode,[node,'tests/acceptance/staging-manual-bid/cumulative-catalog.mjs',mode],expected=0,group=str(groups)+' independent catalog '+mode+' groups completed.')
prior=json.loads((root/'history/original-13ec/PREDECESSOR_BINDING.json').read_text())
for path,digest in prior['files_sha256'].items():assert hashlib.sha256((source/path).read_bytes()).hexdigest()==digest,('Predecessor bytes changed',path)
old=tomllib.loads((root/'history/original-13ec/staging-manual-bid-003.toml').read_text());new=tomllib.loads((root/'staging-manual-bid-003.toml').read_text());assert len(old['checks'])==len(new['checks'])==13
changes=[]
for i,(before,after) in enumerate(zip(old['checks'],new['checks'])):
 if before!=after:changes.append(i);assert before['kind']==after['kind']=='regression';assert set(k for k in before if before[k]!=after[k])=={'cmd','evidence'}
assert changes==[2,3];a=dict(old);b=dict(new);a.pop('checks');b.pop('checks');assert a==b
receipt={'scope':'Additive003 cumulative entry correction. Complete original0024/7 groups execute unchanged against clean archived13ec with owned disposablePG/Next/Chromium. No provider/sharedDB/application repository modifications.','status':'CUMULATIVE_ENTRY_PROOF_ONLY_NOT003_CANDIDATE_VERDICT','source_commit':'13ec0901052b9ec693dd6c427ce822158c0d62b1','checks':checks,'pure_controls':21,'original_base_catalog_exit':99,'wrapped_base_catalog_groups':{'acceptance':4,'adversarial':7},'original_predecessor_files_verified':len(prior['files_sha256']),'manual003TOML_changed_check_indices':changes,'manual003_mode_tests_not_changed':True,'files_sha256':{str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(root.iterdir()) if f.is_file() and f.name not in ['RECEIPT.json','PROOF_PROGRESS.json']}}
f=root/'RECEIPT.json';f.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'checks':len(checks),'receipt_sha256':hashlib.sha256(f.read_bytes()).hexdigest()}),flush=True)
