#!/usr/bin/env python3
"""Bounded v4 follow-up; sequential full15 modes, affected direct, observer guard."""
import pathlib,json,subprocess,time
packet=pathlib.Path(__file__).resolve().parent;root=packet.parents[2];node='/Users/jryear/.nvm/versions/node/v24.4.1/bin/node';out=packet/'preparation-logs'/'v4-final';out.mkdir(parents=True,exist_ok=True);rows=[]
def run(label,cmd,expected):
 before=time.monotonic()
 with (out/(label+'.log')).open('w')as log:r=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=590)
 row={'id':label,'rawExit':r.returncode,'expectedExit':expected,'durationSeconds':round(time.monotonic()-before,3),'command':cmd};rows.append(row);(out/'FINAL_RESULTS.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 if r.returncode!=expected:raise RuntimeError(label+' classification differs; retain raw result and investigate without weakening')
for mode in ['syntax','acceptance','adversarial','KEYBOARD_DIALOG_FOCUS']:
 run(mode,[node,str(packet/'run.mjs'),mode,'--output',str(out/mode)],0 if mode=='syntax' else 1)
run('missing-consumption-guard',[node,str(packet/'v4-missing-consumption-control.mjs'),str(out/'missing-consumption-guard')],0)
for p in sorted(packet.glob('*.mjs')):run('evidence-parse-'+p.name,[node,'--check',str(p)],0)
