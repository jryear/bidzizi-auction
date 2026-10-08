"""Static D1 continuation parity. The historical validate.py is preserved.

This successor checks current map/status bindings on released-source lineage.
It neither executes application gates nor renews historical receipts.
"""
from pathlib import Path
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
project_map = root / 'docs/project-map'
state = json.loads((project_map / 'DELIVERY_STATE.json').read_text())
inventory = json.loads((project_map / 'contracts/INVENTORY.json').read_text())
current = (project_map / 'CURRENT.md').read_text()
html = (project_map / 'index.html').read_text()
errors = []

def require(condition, message):
    if not condition:
        errors.append(message)

def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

match = re.search(r'const items=(.*?);\nconst extras=', html, re.S)
require(match is not None, 'map data missing')
items = json.loads(match.group(1)) if match else []
slices = inventory['slices']
require(len(slices) == 13, 'finite inventory changed')
require(sorted(x['slice'] for x in items if 'slice' in x) == sorted(x['id'] for x in slices),
        'map/inventory slice parity differs')
for row in slices:
    require(f"](contracts/{row['file']})" in current, 'CURRENT missing ' + row['id'])
    card = next((x for x in items if x.get('slice') == row['id']), {})
    require(card.get('contract') == 'contracts/' + row['file'], 'map contract link differs ' + row['id'])
require(state['status'] == 'APP_RUNTIME_RELEASED_UPSTREAM_SLOT_HELD', 'unreviewed delivery-state transition')
require(state['outcomeDelivered'] is False, 'preparation cannot claim delivery')
require(state['firstSlice'] == 'STUDIO', 'first slice differs')
require(set(state['activePreparation']) == {'STUDIO', 'ADMISSION', 'ASSETS', 'TIMING007'}, 'bounded preparation scope differs')
require('static contract preparation' in current and 'not\naccepted, integrated or deployed' in current,
        'CURRENT completion caveat missing')
require('D1 staff delivery · contract preparation' in html and 'Staff test slot released; upstream publication held' in html,
        'map continuation/runtime hold differs')
require('MOBILE014' in current and 'MOBILE014' in state['runtimeSlot'], 'runtime owner differs')
require('optional fixed item override' in current and 'prototype5/10/25is withdrawn' in current,
        'selected increment history/withdrawal missing')
require('Demo enrollment immediately auto-admits' in current, 'selected demo behavior missing')
require(git('merge-base', state['productBase'], 'HEAD') == state['productBase'], 'release lineage lost')
require(git('branch', '--show-current') == 'codex/saturn-staff-delivery', 'wrong private integration branch')
require(subprocess.check_output(['git', '-C', str(root), 'show',
        'f46d876:docs/project-map/contracts/validate.py']) ==
        (project_map / 'contracts/validate.py').read_bytes(), 'historical validator changed')
require(not git('diff', state['productBase'], '--name-only', '--', 'src', 'public', 'migrations'),
        'preparation checkpoint contains product implementation')
result = {'status': 'PASS' if not errors else 'FAIL', 'method': 'static D1 source/status parity only',
          'outcomeDelivered': False, 'applicationGateExecuted': False, 'errors': errors}
print(json.dumps(result, indent=2))
sys.exit(1 if errors else 0)
