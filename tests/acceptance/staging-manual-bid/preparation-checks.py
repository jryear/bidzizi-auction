"""Evidence-of-evidence only. Does not start app/network/DB/browser processes."""
from pathlib import Path
import subprocess, json, time, shutil, tempfile, hashlib, tomllib

packet = Path(__file__).resolve().parent
node = '/Users/jryear/.nvm/versions/node/v24.4.1/bin/node'
checks = []

def run(name, args, cwd=packet, expected=0):
    start = time.monotonic()
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=30)
    log = packet / 'preparation-logs' / f'{name}.log'
    log.parent.mkdir(exist_ok=True)
    log.write_text(result.stdout + result.stderr)
    checks.append(dict(name=name, argv=args, exit=result.returncode,
                       expected_exit=expected, elapsed_seconds=round(time.monotonic()-start, 3),
                       log=str(log.relative_to(packet)), log_sha256=hashlib.sha256(log.read_bytes()).hexdigest()))
    assert result.returncode == expected, (name, result.returncode, result.stdout, result.stderr)
    return result

for file in sorted(list(packet.glob('*.mjs')) + list(packet.glob('*.cjs'))):
    run('syntax-' + file.name, [node, '--check', str(file)])
spec = tomllib.loads((packet / 'staging-manual-bid-003.toml').read_text())
assert len(spec['checks']) == 13
checks.append(dict(name='TOML parse and cumulative check inventory', exit=0,
                   checks=13, acceptance=1, adversarial=1, regression=11))
cases = json.loads(run('case-list', [node, str(packet / 'run.mjs'), 'list']).stdout)
assert len(cases) == 28 and len({case['id'] for case in cases}) == 28
assert sum(case['mode'] == 'acceptance' for case in cases) == 7
assert sum(case['mode'] == 'adversarial' for case in cases) == 21
run('invalid-cli-mode', [node, str(packet / 'run.mjs'), 'not-a-mode'], expected=99)
run('protocol-controls', [node, str(packet / 'preparation-protocol-checks.mjs')])
run('browser-Date-controls', [node, str(packet / 'preparation-browser-date-checks.cjs')])
run('actual-Next-Date-primitives', [node, '--require', str(packet / 'app-clock-skew.cjs'),
                                    str(packet / 'preparation-next-date-primitives.cjs')])
for mutation in ['unknown-modes', 'acceptance-too-short', 'missing-driver']:
    scratch = Path(tempfile.mkdtemp(prefix='manual003-prep-', dir='/tmp/task-root'))
    try:
        for file in packet.iterdir():
            if file.is_file():
                shutil.copy2(file, scratch / file.name)
        (scratch / 'node_modules').symlink_to('/Users/jryear/code/bidzizi-staging-e2e/node_modules', target_is_directory=True)
        if mutation == 'missing-driver':
            (scratch / 'driver.mjs').unlink()
        else:
            target = scratch / 'probes.mjs'
            target.write_text(target.read_text() + (
                '\nfor(const p of cases)p.mode="UNKNOWN";\n' if mutation == 'unknown-modes'
                else '\ncases.find(p=>p.mode==="acceptance").mode="adversarial";\n'))
        run(mutation, [node, str(scratch / 'run.mjs'), 'acceptance'], cwd=scratch, expected=99)
    finally:
        shutil.rmtree(scratch)
receipt = dict(status='PROPOSAL_NOT_FROZEN',
    scope='Preparation only; no full28 product app/database/browser candidate execution.',
    trusted_catalog002_base='7eef3e74688604fdf1a9ffaf0fc7899d0a45290d',
    cases=cases, expected_mode_counts=dict(acceptance=7, adversarial=21), checks=checks,
    app_network_provider_database_browser_processes_started=0,
    limits=['Pure protocol controls are helper challenges, not real durable DB acceptance.',
            'No full003 baseline/candidate/kernel or weak-candidate app run executed.',
            'Parent complete002 baseline, independent current-delta review and rule review remain before freeze.'])
receipt['files_sha256'] = {str(file.relative_to(packet)): hashlib.sha256(file.read_bytes()).hexdigest()
    for file in sorted(packet.rglob('*')) if file.is_file() and 'node_modules' not in file.parts
    and file.name != 'PREPARATION_RECEIPT.json'}
(packet / 'PREPARATION_RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(status=receipt['status'], preparation_checks=len(checks),
    all_expected_exits_observed=True, group_counts=receipt['expected_mode_counts'],
    receipt_sha256=hashlib.sha256((packet / 'PREPARATION_RECEIPT.json').read_bytes()).hexdigest())))
