#!/usr/bin/env python3
"""Controls for actual runner fail-closed behavior; source copies are labeled probes."""
import json,pathlib,tempfile,subprocess,time,shutil,hashlib
packet=pathlib.Path(__file__).resolve().parent;root=packet.parents[2]
node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';out=packet/'preparation-logs'/'controls';out.mkdir(parents=True,exist_ok=True);rows=[]
def run(label,command,expected=99,cwd=root):
 before=time.monotonic()
 with (out/(label+'.log')).open('w') as log:r=subprocess.run(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,timeout=220)
 row={'id':label,'rawExit':r.returncode,'expectedExit':expected,'durationSeconds':round(time.monotonic()-before,3),'command':command};rows.append(row);(out/'CONTROL_RESULTS.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 if r.returncode!=expected:raise RuntimeError(label+' classification differs')
run('missing-mode',[node,str(packet/'run.mjs')]);run('unknown-mode',[node,str(packet/'run.mjs'),'not-a-mode']);run('missing-option-value',[node,str(packet/'run.mjs'),'acceptance','--output']);run('list',[node,str(packet/'run.mjs'),'list'],0)
with tempfile.TemporaryDirectory(prefix='bz-workspace004-missing-dependency-',dir='/tmp') as tmp:
 copy=pathlib.Path(tmp)/'packet';shutil.copytree(packet,copy,ignore=shutil.ignore_patterns('preparation-logs','history'))
 run('missing-node-dependencies',[node,str(copy/'run.mjs'),'NAV_WORKSPACE_ABSENT'],cwd=tmp)
# Source-sandbox probes modify only throwaway new-harness copies, not protected app source.
for label,replace in [('missing-postgres',("'/opt/homebrew/opt/postgresql@18/bin'","'/tmp/workspace004-required-tool-does-not-exist'")),('setup-invalid-seed',None)]:
 with tempfile.TemporaryDirectory(prefix='bz-workspace004-control-',dir='/tmp') as tmp:
  copy=pathlib.Path(tmp)/'packet';shutil.copytree(packet,copy,ignore=shutil.ignore_patterns('preparation-logs','history'));(pathlib.Path(tmp)/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
  if replace:
   p=copy/'harness.mjs';p.write_text(p.read_text().replace(*replace))
  else:(copy/'seed-people.sql').write_text('THIS IS A DELIBERATELY INVALID LOCAL SETUP SEED;')
  run(label,[node,str(copy/'run.mjs'),'NAV_WORKSPACE_ABSENT','--output',str(out/label)],cwd=root)
run('internal-mode-deadline',[node,str(packet/'run.mjs'),'NAV_WORKSPACE_ABSENT','--deadline-ms','1','--output',str(out/'deadline')])
run('DOM-and-HTTP500-oracles',[node,str(packet/'oracle-controls.mjs'),str(out/'DOM-oracles')],0)
run('dropped-context-epoch-probe',[node,str(packet/'run.mjs'),'STALE_DRAFT_SESSION','--probe','DROP_CONTEXT_EPOCH','--output',str(out/'epoch-mutant')],1)
run('notice-refresh-reference-probe',[node,str(packet/'run.mjs'),'APPROVED_NOTICE_ASYNC','--probe','NOTICE_REFRESH_REFERENCE','--output',str(out/'notice-reference')],0)
run('notice-refresh-omission-probe',[node,str(packet/'run.mjs'),'APPROVED_NOTICE_ASYNC','--probe','OMIT_NOTICE_REFRESH','--output',str(out/'notice-omission')],1)
