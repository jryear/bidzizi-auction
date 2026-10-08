"""Static Entry checkpoint successor. Historical validators stay byte-identical.

Checks real source and saved receipts against paired map/CURRENT status. Executes
no application, database, browser, build or external verifier; proves no hosted
journey and does not convert the blocked inherited contract into a GREEN gate.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import tomllib

root = Path(__file__).resolve().parents[3]
m = root / 'docs/project-map'
s = json.loads((m / 'DELIVERY_STATE.json').read_text())
html = (m / 'index.html').read_text()
current = (m / 'CURRENT.md').read_text()
errors = []

def require(condition, message):
    if not condition:
        errors.append(message)

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def blob(commit, path):
    return subprocess.check_output(['git', '-C', str(root), 'cat-file', 'blob', commit + ':' + path])

def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

require(s['version'] == 2 and s['status'] == 'STUDIO_AND_ENTRY_ACCEPTED_LOCAL_INHERITED_BLOCKED', 'unbound status transition')
require(s['outcomeDelivered'] is False and s['firstSlice'] == 'STUDIO', 'partial outcome overstated')
require(set(s['activePreparation']) == {'ASSETS', 'TIMING007'}, 'bounded preparation differs')
require(git('merge-base', s['productBase'], 'HEAD') == s['productBase'], 'released lineage lost')
require(git('branch', '--show-current') == 'codex/saturn-staff-delivery', 'private branch differs')
for path, commit in [('contracts/validate.py', 'f46d876'), ('contracts/validate-delivery.py', '0176459')]:
    require(blob(commit, 'docs/project-map/' + path) == (m / path).read_bytes(), 'historical validator changed: ' + path)
inventory = json.loads((m / 'contracts/INVENTORY.json').read_text())['slices']
match = re.search(r'const items=(.*?);\nconst extras=', html, re.S)
require(match is not None, 'map items missing')
items = json.loads(match.group(1)) if match else []
require(len(inventory) == 13 and sorted(a['slice'] for a in items if 'slice' in a) == sorted(a['id'] for a in inventory), '13-contract parity differs')
for a in inventory:
    path = 'contracts/' + a['file']
    # The accepted Studio status checkpoint already recorded the owner's
    # increment direction in its unfrozen draft; preserve that exact checkpoint.
    require(blob('0176459', 'docs/project-map/' + path) == (m / path).read_bytes(), 'prior checkpoint contract changed: ' + path)
    require('](' + path + ')' in current, 'CURRENT missing contract link: ' + path)
    require(next((x for x in items if x.get('slice') == a['id']), {}).get('contract') == path, 'map contract link differs: ' + path)
require('Studio and Entry are accepted as bounded local source checkpoints' in current and 'have not been deployed' in current, 'CURRENT acceptance caveat missing')
require('D1 staff delivery · Studio &amp; Entry accepted locally' in html and 'upstream publication held' in html, 'map acceptance/hold differs')
require('MOBILE014' in current and 'MOBILE014' in s['runtimeSlot'], 'parent mobile hold missing')
require('optional\nfixed item override' in current and 'prototype5/10/25is withdrawn' in current, 'increment authority missing')
require('Demo enrollment immediately auto-admits' in current, 'demo auto-admission authority missing')

studio = s['studioCheckpoint']
require(studio['acceptedLocal'] and studio['integratedLocal'] and not studio['deployed'], 'Studio history caveat differs')
studio_claim = json.loads((Path(studio['gateArchive']) / 'kernel-claim.json').read_text())
studio_review = json.loads(Path(studio['reviewFile']).read_text())
require(studio_claim['verdict'] == 'supported' and studio_claim['source_binding']['candidate']['commit'] == studio['candidate'], 'Studio original receipt differs')
require(studio_review['status'] == 'GO_SOURCE_AND_RENDER_EXACT_D631D70' and studio_review['candidate'] == studio['candidate'], 'Studio original independent review differs')
for path, digest in studio['productSHA256'].items():
    require(hashlib.sha256(blob(studio['candidate'], path)).hexdigest() == digest, 'Studio historical source differs: ' + path)

entry = s['entryCheckpoint']
require(entry['acceptedLocal'] and entry['integratedCandidate'] and not entry['integratedAccepted'], 'source/integration distinction differs')
require(not entry['deployed'] and not entry['connectedPrivilegesInstalled'], 'unapproved connected deployment claim')
require(entry['candidateAssertionsPassed'] == 36 and entry['baselineFiniteFail'] == 20 and entry['baselinePass'] == 16, 'Entry finite counts differ')
claim_path = Path(entry['gateArchive']) / 'kernel-claim.json'
review_path = Path(entry['reviewFile'])
require(sha(claim_path) == entry['kernelClaimSHA256'], 'Entry receipt hash differs')
require(sha(review_path) == entry['reviewSHA256'], 'Entry independent review hash differs')
claim = json.loads(claim_path.read_text())
review = json.loads(review_path.read_text())
require(claim['verdict'] == 'supported' and claim['source_binding']['candidate']['commit'] == entry['candidate'] and claim['source_binding']['base']['commit'] == entry['trustedEvidenceBase'], 'Entry exact gate binding differs')
require(review['status'] == entry['sourceRenderReview'] and review['candidate'] == entry['candidate'], 'Entry independent source/render GO differs')
checks = tomllib.loads((root / 'tasks/staging-staff-event-entry-015-evidence-successor-v2.toml').read_text())['checks']
for phase, key in [('base', 'base_checks'), ('candidate', 'candidate_checks')]:
    observed = claim[key]
    require(len(observed) == len(checks) == 9, 'Entry nine terminal groups differ')
    for declared, result in zip(checks, observed):
        terminal = result.get('assertion_result', {})
        require(result['name'] == declared['name'] and result['kind'] == declared['kind'] and not result['harness_error'] and result['exit'] in [0, 1], 'Entry finite group differs')
        rows = terminal.get('assertions', [])
        require(terminal.get('phase') == phase and [a['id'] for a in rows] == declared['assertions'], 'Entry terminal phase/IDs differ')
        failures = [a['id'] for a in rows if a['status'] == 'fail']
        require(failures == (declared['baseline_failures'] if phase == 'base' else []), 'Entry exact finite failures differ')
require(len(entry['productSHA256']) == 8 and len(entry['acceptedApplicationSHA256']) == 80, 'accepted product closure differs')
changed = git('diff', s['productBase'], '--name-only', '--', 'src', 'public', 'migrations').splitlines()
require(sorted(changed) == sorted(entry['productSHA256']), 'current integration exceeds eight accepted product paths')
for path, digest in entry['acceptedApplicationSHA256'].items():
    require(sha(root / path) == digest and hashlib.sha256(blob(entry['candidate'], path)).hexdigest() == digest, 'accepted application source differs: ' + path)
for path, digest in entry['productSHA256'].items():
    require(sha(root / path) == digest and hashlib.sha256(blob(entry['productImplementation'], path)).hexdigest() == digest, 'original implementation source differs: ' + path)

inherited = s['inheritedRegression']
require(inherited['status'] == 'SPEC_ERROR_BEFORE_RUNTIME' and inherited['closureProved'] is False and inherited['behavioralAssertionsExecuted'] == 0 and inherited['runtimeStarted'] is False, 'blocked inherited closure overstated')
require(inherited['groups'] == 32 and inherited['assertions'] == 96 and inherited['verifierExit'] == 3, 'inherited counts/classification differ')
require(sha(root / inherited['task']) == inherited['taskSHA256'] and (root / inherited['task']).read_bytes() == blob(inherited['trustedFreeze'], inherited['task']), 'frozen inherited task differs')
regression = tomllib.loads((root / inherited['task']).read_text())['checks']
require(len(regression) == 32 and all(c['kind'] == 'regression' and not c['baseline_failures'] for c in regression) and len(set(a for c in regression for a in c['assertions'])) == 96, 'preserved inherited requirements differ')
error = json.loads(Path(inherited['errorEvidence']).read_text())
require(error['trustedFreeze'] == inherited['trustedFreeze'] and error['verifierExit'] == 3 and error['verifierMessage'] == 'SPEC_ERROR contract needs at least one acceptance check' and error['applicationRuntimeStarted'] is False and error['inheritedClosureProved'] is False, 'actual inherited SPEC_ERROR differs')
require(Path(inherited['priorErrorEvidence']).is_file() and 'Inherited96 remains\nunexecuted and unproved' in current and 'inherited96 unexecuted' in html, 'preserved blocker missing from paired status')
composition = json.loads(Path(inherited['compositionDiagnostic']).read_text())
require(composition['status'] == 'DECLARATION_ONLY_COMPOSITION_BLOCKED_BY_INCOMPATIBLE_FROZEN_BASE_BINDINGS' and not composition['applicationRuntimeStarted'] and not composition['inheritedClosureProved'], 'composition diagnostic overstated')
require(composition['publicKernelInterface']['mixedCheckKindsStructurallyAllowed'] and composition['publicKernelInterface']['oneGlobalBase'] and not composition['publicKernelInterface']['perCheckBaseOption'], 'composition limitation differs')
require(composition['entryAcceptance']['intendedFiniteBaseFailures'] == 5 and composition['inheritedRegression']['requiresAcceptedApplication80HashesInBothPhases'], 'frozen baseline conflict differs')
for path in composition['inheritedRegression']['missingAtGenuineEntryBase']:
    absent = subprocess.run(['git', '-C', str(root), 'cat-file', '-e', composition['genuineEntryAbsentBase'] + ':' + path], capture_output=True)
    require(absent.returncode != 0, 'recorded missing pre-Entry file exists: ' + path)
for path in composition['inheritedRegression']['differentAtGenuineEntryBase']:
    require(hashlib.sha256(blob(composition['genuineEntryAbsentBase'], path)).hexdigest() != entry['acceptedApplicationSHA256'][path], 'recorded pre-Entry source conflict differs: ' + path)
require('checks have no common valid baseline' in current and 'exceeds the current declaration-only authorization' in current and 'incompatible baseline bindings' in html, 'precise composition blocker missing')
require(len(entry['libraryFileIds']) == 2 and len(studio['libraryFileIds']) == 2, 'private accepted capture identities differ')
result = {'status': 'PASS' if not errors else 'FAIL', 'method': 'static accepted-source and map/CURRENT status parity only', 'EntrySourceAccepted': True, 'inheritedClosureProved': False, 'outcomeDelivered': False, 'deployed': False, 'validatorExecutesApplicationGate': False, 'errors': errors}
print(json.dumps(result, indent=2))
sys.exit(bool(errors))
