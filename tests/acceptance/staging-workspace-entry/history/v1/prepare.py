#!/usr/bin/env python3
"""Sequential raw characterization only; deliberately does not invoke kernel or old13."""
import subprocess,time,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[3]
packet=pathlib.Path(__file__).resolve().parent
version=sys.argv[1] if len(sys.argv)>1 else 'v1'
base=packet/'preparation-logs'/version;base.mkdir(parents=True,exist_ok=True)
node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node'
plan=json.loads((packet/'CASE_PLAN.json').read_text())
commands=[('acceptance',['acceptance']),('adversarial',['adversarial'])]+[(c['id'],[c['id']])for c in plan['cases']]
rows=[]
for name,args in commands:
 out=base/name;out.mkdir(exist_ok=True)
 cmd=[node,str(packet/'run.mjs'),*args,'--output',str(out)]
 before=time.monotonic()
 with (base/(name+'.log')).open('w') as log:
  result=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=590)
 row={'id':name,'command':cmd,'rawExit':result.returncode,'durationSeconds':round(time.monotonic()-before,3)};rows.append(row)
 (base/'CHARACTERIZATION.json').write_text(json.dumps(rows,indent=2)+'\n')
 print(json.dumps(row),flush=True)
