"""Static parity for the actual UNVERIFIABLE composition; no runtime execution.

All historical validators remain exact. This successor checks saved source,
terminal receipts, cleanup and paired documentation. It does not turn withheld
assertions, diagnostic markers or native captures into product acceptance.
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
current = (m / 'CURRENT.md').read_text()
html = (m / 'index.html').read_text()
errors = []

def require(ok, message):
    if not ok:
        errors.append(message)

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def blob(commit, path):
    return subprocess.check_output(['git', '-C', str(root), 'cat-file', 'blob', commit + ':' + path])

require(s['version'] == 3 and s['status'] == 'STUDIO_ENTRY_ACCEPTED_LOCAL_INHERITED_RUNTIME_UNVERIFIABLE', 'status transition differs')
require(not s['outcomeDelivered'], 'full D1 overstated')
old = json.loads(blob('42a6a82efc2ce9316bf0a3103043f74e410ee3bc', 'docs/project-map/DELIVERY_STATE.json'))
require(s['previousInheritedRegression'] == old['inheritedRegression'], 'prior blocker history changed')
for name, commit in [('validate.py', 'f46d876'), ('validate-delivery.py', '0176459'), ('validate-delivery-entry.py', '42a6a82')]:
    path = 'docs/project-map/contracts/' + name
    require((root / path).read_bytes() == blob(commit, path), 'historical validator changed: ' + path)
inventory = json.loads((m / 'contracts/INVENTORY.json').read_text())['slices']
match = re.search(r'const items=(.*?);\nconst extras=', html, re.S)
items = json.loads(match.group(1)) if match else []
require(len(inventory) == 13 and sorted(i['id'] for i in inventory) == sorted(i['slice'] for i in items if 'slice' in i), '13-contract parity differs')
for i in inventory:
    path = 'docs/project-map/contracts/' + i['file']
    require((root / path).read_bytes() == blob('0176459', path), 'historical draft changed: ' + path)
    require('](contracts/' + i['file'] + ')' in current, 'CURRENT contract link missing')
    require(next((x for x in items if x.get('slice') == i['id']), {}).get('contract') == 'contracts/' + i['file'], 'map contract link differs')

entry = s['entryCheckpoint']
require(entry == old['entryCheckpoint'], 'original accepted Entry checkpoint changed')
require(entry['acceptedLocal'] and not entry['integratedAccepted'] and not entry['deployed'] and not entry['connectedPrivilegesInstalled'], 'Entry acceptance/hold overstated')
for path, digest in entry['acceptedApplicationSHA256'].items():
    require(sha(root / path) == digest and hashlib.sha256(blob(entry['candidate'], path)).hexdigest() == digest, 'accepted application changed: ' + path)
original_claim_path = Path(entry['gateArchive']) / 'kernel-claim.json'
require(sha(original_claim_path) == entry['kernelClaimSHA256'] and sha(entry['reviewFile']) == entry['reviewSHA256'], 'original36 acceptance evidence changed')
original_claim = json.loads(original_claim_path.read_text())
require(original_claim['verdict'] == 'supported' and original_claim['source_binding']['candidate']['commit'] == entry['candidate'], 'original36 binding differs')
require(s['studioCheckpoint'] == old['studioCheckpoint'], 'accepted Studio history changed')

g = s['inheritedRegression']
require(g['status'] == 'UNVERIFIABLE_AFTER_REAL_COMPOSITION' and not g['closureProved'] and g['runtimeStarted'] and g['runtimeCompleted'], 'actual inherited status overstated')
require(g['groups'] == 32 and g['assertions'] == 96 and g['composedGroupsPerPhase'] == 33 and g['composedAssertionsPerPhase'] == 101 and g['actualPhaseInvocations'] == 66, 'declaration counts differ')
require(g['kernelVerdict'] == 'unverifiable' and g['kernelExit'] == 2 and not g['selectedSourceKernelAssured'] and g['selectedSourceHelperWitnessed'], 'assurance/verdict differs')
require(g['trustedFreeze'] == 'ff349660be240c60725cab1dd28ec2360163fe85' and g['candidate'] == '22b619dc5b572bcb826e254092434767fc5b7dbb' and g['selectedExternalSource'] == 'e0cef66f650bbfbf55d60862b3abe90127e5382f', 'three distinct source inputs differ')
task_bytes = (root / g['task']).read_bytes()
require(sha(root / g['task']) == g['taskSHA256'] and task_bytes == blob(g['trustedFreeze'], g['task']), 'frozen composed contract changed')
checks = tomllib.loads(task_bytes.decode())['checks']
entry_checks = tomllib.loads((root / 'tasks/staging-staff-event-entry-015-evidence-successor-v2.toml').read_text())['checks']
regression = tomllib.loads((root / 'tasks/staging-staff-entry-inherited-portable-v1.toml').read_text())['checks']
require(checks[0] == entry_checks[0], 'genuine Entry group0 changed')
for before, after in zip(regression, checks[1:]):
    for key in ['name', 'kind', 'assertions', 'baseline_failures', 'timeout']:
        require(before[key] == after[key], 'inherited metadata changed: ' + key)
require(len(checks) == 33 and len({a for c in checks for a in c['assertions']}) == 101, '101 original IDs differ')
selection_path = 'tests/acceptance/staging-staff-entry-inherited-selection-v1/SELECTION.json'
selection = json.loads((root / selection_path).read_text())
ready_path = 'docs/proposed/staff-entry-inherited-selection-v1/REVIEW_READY.json'
ready = json.loads((root / ready_path).read_text())
require(sha(root / ready_path) == '654841e0e1e1f884c6dffd31d2a3088935a1b827a3b81bf61920fe660d92327d', 'reviewed READY differs')
for path, digest in {**selection['frozenPredecessor460SHA256'], **ready['filesSHA256']}.items():
    require(sha(root / path) == digest and (root / path).read_bytes() == blob(g['trustedFreeze'], path), 'preserved evidence differs: ' + path)
for path, digest in selection['actualKernelApplicationSHA256ByPhase']['base'].items():
    if digest is None:
        p = subprocess.run(['git', '-C', str(root), 'cat-file', '-e', g['trustedFreeze'] + ':' + path], capture_output=True)
        require(p.returncode != 0, 'genuine baseline absence lost: ' + path)
    else:
        require(hashlib.sha256(blob(g['trustedFreeze'], path)).hexdigest() == digest, 'genuine baseline source differs: ' + path)

claim_path = Path(g['gateArchive']) / 'kernel-claim.json'
require(sha(claim_path) == g['kernelClaimSHA256'], 'fresh kernel claim changed')
claim = json.loads(claim_path.read_text())
require(claim['verdict'] == 'unverifiable' and claim['source_binding']['base']['commit'] == g['trustedFreeze'] and claim['source_binding']['candidate']['commit'] == g['candidate'], 'fresh source/verdict binding differs')
require(claim['source_binding']['clean_before'] and claim['source_binding']['unchanged_after'], 'actual source mutated')
require(not claim['protected_changes'] and not claim['out_of_scope'] and not claim['mutable_test_changes'] and not claim['bypasses'], 'protected scope differs')
expected_errors = [4, 6, 7, 8, 9, 10, 11, 12, 13, 14]
require(g['inheritedErrorIndices'] == expected_errors and g['causeClasses'] == {'nestedFixtureLifetimeGuard': [4], 'provenanceTokenClassifier': [6, 7, 8, 9], 'clusterPathRegistration': [10, 11, 12, 13, 14]}, 'diagnosis scope differs')
for phase in ['base', 'candidate']:
    observed = claim[phase + '_checks']
    require(len(observed) == 33, 'missing actual phase invocation')
    rows = []
    for i, (declared, result) in enumerate(zip(checks, observed)):
        require(result['name'] == declared['name'] and result['kind'] == declared['kind'], 'actual check identity differs')
        terminal = result.get('assertion_result') or {}
        if i - 1 in expected_errors:
            require(result['harness_error'] and not terminal.get('assertions'), 'withheld error converted into assertions')
        else:
            a = terminal.get('assertions', [])
            require(not result['harness_error'] and result['exit'] in [0, 1], 'valid finite group differs')
            require(terminal.get('phase') == phase and sorted(x['id'] for x in a) == sorted(declared['assertions']), 'actual phase/IDs differ')
            require([x['id'] for x in a if x['status'] == 'fail'] == (declared['baseline_failures'] if phase == 'base' else []), 'finite requirements changed')
            rows.extend(a)
    counts = {'pass': sum(a['status'] == 'pass' for a in rows), 'finiteFail': sum(a['status'] == 'fail' for a in rows), 'unverifiable': 101 - len(rows), 'harnessGroups': sum(bool(c['harness_error']) for c in observed)}
    require(counts == g['phaseCounts'][phase] == ({'pass': 81, 'finiteFail': 5, 'unverifiable': 15, 'harnessGroups': 10} if phase == 'base' else {'pass': 86, 'finiteFail': 0, 'unverifiable': 15, 'harnessGroups': 10}), 'terminal counts overstated')
for path, digest in g['archiveBindingSHA256'].items():
    require(sha(Path(path) / 'ARCHIVE_BINDING.json') == digest, 'archive binding changed')
    binding = json.loads((Path(path) / 'ARCHIVE_BINDING.json').read_text())
    for relative, file_sha in binding['filesSHA256'].items():
        require(sha(Path(path) / relative) == file_sha, 'raw archived artifact changed: ' + relative)
require(sha(g['sourceSelectionReview']) == g['sourceSelectionReviewSHA256'], 'pre-freeze independent review changed')
require(g['actualReviewSHA256'] and sha(g['actualReviewFile']) == g['actualReviewSHA256'], 'fresh independent actual review missing')
review = json.loads(Path(g['actualReviewFile']).read_text())
require(review.get('candidate') == g['candidate'] and review.get('trustedBase') == g['trustedFreeze'] and review.get('status') == 'UNVERIFIABLE' and review.get('accepted') is False and review.get('fullIntegrationAccepted') is False and review.get('verdict') == 'NO_GO_ACTUAL_COMPOSITION_UNVERIFIABLE', 'actual independent NO_GO differs')
require(review.get('kernelClaim', {}).get('sha256') == g['kernelClaimSHA256'] and review.get('kernelClaim', {}).get('verdict') == g['kernelVerdict'] and review.get('kernelClaim', {}).get('exit') == g['kernelExit'], 'independent actual kernel claim differs')
require('at most one simultaneously active app' in current and 'at most one simultaneously active app' in g['nextRequiredAuthorization'] and 'at most one simultaneously active app' in s['nextExecutableAction'], 'next successor app bound missing')
require(sha(g['cleanupEvidence']) == g['cleanupSHA256'], 'final cleanup readback changed')
cleanup = json.loads(Path(g['cleanupEvidence']).read_text())
require(cleanup['ownedRuntimeCleanupConfirmed'] and cleanup['systemPostgresProcessCount'] == 0 and cleanup['allRegisteredPortsClosed'] and len(cleanup['ownedPorts']) == 219 and len(cleanup['unregisteredStaffClusters']) == 10, 'final owned cleanup unproved')
require(not cleanup['signalsSent'] and not cleanup['failedSnapshotsDeleted'] and cleanup['unregisteredStartIdentityPortProofLost'], 'cleanup history was rewritten')
require('actual runtime is UNVERIFIABLE' in current and 'Base:81 PASS' in current and 'Candidate:86 PASS' in current and 'current phase/source-only authorization' in current, 'CURRENT actual blocker missing')
require('actual101 composition UNVERIFIABLE' in html and '22 inherited groups pass on both phases;10 return99' in html and 'upstream publication held' in html, 'paired map actual status differs')
require('not deployed' in current and 'MOBILE014' in current and not entry['integratedAccepted'], 'remaining delivery holds missing')
result = {'status': 'PASS' if not errors else 'FAIL', 'method': 'static saved-source/receipt/map/CURRENT parity only', 'kernelVerdict': 'unverifiable', 'inheritedClosureProved': False, 'outcomeDelivered': False, 'deployed': False, 'applicationGateExecutedByValidator': False, 'errors': errors}
print(json.dumps(result, indent=2))
sys.exit(bool(errors))
