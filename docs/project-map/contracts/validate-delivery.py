"""Static D1 continuation parity. The historical validate.py is preserved.

This successor checks current map/status bindings on released-source lineage.
It neither executes application gates nor renews historical receipts.
"""
from pathlib import Path
import hashlib
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
require(state['status'] == 'STUDIO_ACCEPTED_LOCAL_UPSTREAM_HELD', 'unreviewed delivery-state transition')
require(state['outcomeDelivered'] is False, 'partial local checkpoint cannot claim delivery')
require(state['studioBaseline']['observed'] is True and state['studioBaseline']['ready'] is True, 'baseline readiness overstated')
require(state['firstSlice'] == 'STUDIO', 'first slice differs')
require(set(state['activePreparation']) == {'ADMISSION', 'ASSETS', 'TIMING007'}, 'bounded preparation scope differs')
require('Studio is accepted and integrated locally' in current and 'has not been deployed' in current,
        'CURRENT completion caveat missing')
require('D1 staff delivery · Studio accepted locally' in html and 'Staff test slot released; upstream publication held' in html,
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
checkpoint = state['studioCheckpoint']
require(checkpoint['acceptedLocal'] and checkpoint['integratedLocal'] and not checkpoint['deployed'],
        'Studio local/deployment distinction differs')
require(checkpoint['candidateAssertionsPassed'] == 12, 'Studio assertion count differs')
claim = json.loads((Path(checkpoint['gateArchive']) / 'kernel-claim.json').read_text())
review = json.loads(Path(checkpoint['reviewFile']).read_text())
require(claim['verdict'] == 'supported' and claim['source_binding']['candidate']['commit'] == checkpoint['candidate'],
        'exact supported source binding differs')
require(review['status'] == 'GO_SOURCE_AND_RENDER_EXACT_D631D70' and review['candidate'] == checkpoint['candidate'],
        'independent source/render acceptance differs')
require(sorted(git('diff', state['productBase'], '--name-only', '--', 'src', 'public', 'migrations').splitlines()) ==
        sorted(checkpoint['productSHA256']), 'local integration exceeds accepted product scope')
for path, digest in checkpoint['productSHA256'].items():
    require(hashlib.sha256((root / path).read_bytes()).hexdigest() == digest,
            'accepted Studio source hash differs: ' + path)
    require(hashlib.sha256(subprocess.check_output(['git', '-C', str(root), 'show',
            checkpoint['candidate'] + ':' + path])).hexdigest() == digest,
            'recorded candidate source differs: ' + path)
result = {'status': 'PASS' if not errors else 'FAIL', 'method': 'static D1 source/status parity only',
          'outcomeDelivered': False, 'validatorExecutesApplicationGate': False, 'errors': errors}
print(json.dumps(result, indent=2))
sys.exit(1 if errors else 0)
