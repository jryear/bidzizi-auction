#!/usr/bin/env python3
"""Final bounded modes and parent-requested standalone syntax controls; sequential."""
import pathlib,json,subprocess,time,tempfile,shutil,os
packet=pathlib.Path(__file__).resolve().parent;root=packet.parents[2];node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';out=packet/'preparation-logs'/'v3-final';out.mkdir(parents=True,exist_ok=True);rows=[]
def run(label,cmd,expected,env=None,cwd=root):
 before=time.monotonic()
 with (out/(label+'.log')).open('w')as log:r=subprocess.run(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=590)
 row={'id':label,'rawExit':r.returncode,'expectedExit':expected,'durationSeconds':round(time.monotonic()-before,3),'command':cmd};rows.append(row);(out/'FINAL_RESULTS.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 if r.returncode!=expected:raise RuntimeError(label+' classification differs')
run('syntax-actual',[node,str(packet/'run.mjs'),'syntax','--output',str(out/'syntax-actual')],0)
with tempfile.TemporaryDirectory(prefix='bz-workspace004-syntax-',dir='/tmp')as tmp:
 fixture=pathlib.Path(tmp)/'public'/'staging-admin';fixture.mkdir(parents=True);(fixture/'studio.js').write_text('const explicitlyInvalid = ;\n');env=os.environ.copy();env['VERIFY_ROOT']=tmp
 run('syntax-invalid-JS-probe',[node,str(packet/'run.mjs'),'syntax','--output',str(out/'syntax-invalid')],1,env=env)
 copy=pathlib.Path(tmp)/'packet';copy.mkdir()
 for name in ['run.mjs','syntax.mjs','CASE_PLAN.json']:shutil.copy2(packet/name,copy/name)
 p=copy/'syntax.mjs';p.write_text(p.read_text().replace("'/Users/jryear/.nvm/versions/node/v24.4.1/bin/node'","'/tmp/bz-workspace004-missing-node-runtime'"))
 run('syntax-unavailable-runtime-probe',[node,str(copy/'run.mjs'),'syntax','--output',str(out/'syntax-missing-runtime')],99,env=env)
 env=os.environ.copy();env['DATABASE_URL']='deliberately-invalid-inherited-runtime-control'
 run('inherited-runtime-refused',[node,str(packet/'run.mjs'),'acceptance'],99,env=env)
for mode in ['acceptance','adversarial']:
 run(mode,[node,str(packet/'run.mjs'),mode,'--output',str(out/mode)],1)
# Syntax check evidence source itself, independent of the separate app parse mode.
for p in sorted(packet.glob('*.mjs')):run('evidence-parse-'+p.name,[node,'--check',str(p)],0)

for case in ['STALE_DRAFT_SESSION','STALE_APPROVAL_SESSION','APPROVED_NOTICE_ASYNC','APPROVED_NOTICE_PRIORITY','APPROVAL_RESPONSE_VARIANTS']:
 run('barrier-direct-'+case,[node,str(packet/'run.mjs'),case,'--output',str(out/('barrier-direct-'+case))],1 if case=='APPROVED_NOTICE_ASYNC' else 0)
