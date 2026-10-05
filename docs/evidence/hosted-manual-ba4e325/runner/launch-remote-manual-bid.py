"""Release-owner launcher. No secret values appear in argv, output, or files."""
import json
import pathlib
import subprocess
import sys

project = 'prj_fy9oxz1zTFpwqLRDJONdgvjI2KNP'
team = 'team_fOkqe9T0PRKMmdczUvnoMXct'
repo = pathlib.Path('/Users/jryear/code/bidzizi-staging-e2e')
if len(sys.argv) != 2 or len(sys.argv[1]) != 40 or any(c not in '0123456789abcdef' for c in sys.argv[1]):
    print('HARNESS: Supply the exact verified source commit, without credentials.')
    raise SystemExit(99)
candidate = sys.argv[1]

def api(path):
    result = subprocess.run(['vercel', 'api', path, '--method', 'GET'], cwd=repo, capture_output=True, text=True, timeout=40)
    if result.returncode:
        raise RuntimeError('Required scoped provider read failed; output withheld.')
    return json.loads(result.stdout)

try:
    deployments = api('/v6/deployments?projectId=' + project + '&teamId=' + team + '&limit=12')['deployments']
    matching = [d for d in deployments if d.get('meta', {}).get('githubCommitSha') == candidate and d.get('meta', {}).get('githubCommitRef') == 'staging-e2e' and d.get('meta', {}).get('githubOrg') == 'jryear' and d.get('meta', {}).get('githubRepo') == 'bidzizi-auction' and d.get('target') is None and d.get('state') == 'READY']
    if not matching:
        print(json.dumps({'candidate': candidate, 'readyExactPreview': False, 'applicationWritesAttempted': False}))
        raise SystemExit(99)
    selected = matching[0]
    exact = api('/v13/deployments/' + selected['uid'] + '?teamId=' + team)
    meta = exact.get('meta', {})
    assert exact.get('id') == selected['uid'] and exact.get('readyState') == 'READY' and exact.get('target') is None
    assert all(meta.get(k) == v for k, v in {'githubCommitSha': candidate, 'githubCommitRef': 'staging-e2e', 'githubOrg': 'jryear', 'githubRepo': 'bidzizi-auction'}.items())
    assert exact.get('url') == selected['url']
    origin = 'https://' + exact['url']
    private = pathlib.Path('/tmp/bidzizi-staging-e2e-secrets')
    runtime = (private / 'runtime-url').read_text().strip()
    env = api('/v1/projects/' + project + '/env/r7FT8Q5Aci6NNNKz?decrypt=true&teamId=' + team)
    assert env.get('key') == 'BIDZIZI_STAGING_DATABASE_URL' and env.get('target') == ['preview'] and env.get('gitBranch') == 'staging-e2e'
    assert env.get('configurationId') is None and env.get('value') == runtime
    metadata = api('/v9/projects/' + project + '?teamId=' + team)
    assert metadata.get('id') == project and metadata.get('ssoProtection', {}).get('deploymentType') == 'all_except_custom_domains'
    existing = [key for key, info in metadata.get('protectionBypass', {}).items() if info.get('scope') == 'automation-bypass']
    assert len(existing) == 1, 'Expected one existing automation credential; never create one.'
    owner = (private / 'owner-url').read_text().strip()
    deployment = {'id': exact['id'], 'state': exact['readyState'], 'target': exact['target'], 'meta': {key: meta[key] for key in ['githubCommitSha', 'githubCommitRef', 'githubOrg', 'githubRepo']}}
    payload = json.dumps({'origin': origin, 'commit': candidate, 'deployment': deployment, 'bypass': existing[0], 'runtimeURL': runtime, 'ownerURL': owner})
    print(json.dumps({'candidate': candidate, 'deploymentId': exact['id'], 'origin': origin, 'readyExactPreview': True, 'dedicatedRuntimeMatches': True, 'credentialsPersisted': False}), flush=True)
    node = '/Users/jryear/.nvm/versions/node/v24.4.1/bin/node'
    script = '/Users/jryear/Documents/Codex/2026-10-02/task-3/remote-manual-bid-e2e.mjs'
    result = subprocess.run([node, script], cwd=repo, input=payload, text=True, timeout=510)
    raise SystemExit(result.returncode)
except (AssertionError, RuntimeError, OSError, KeyError, ValueError, subprocess.TimeoutExpired):
    print('HARNESS: Required scoped release/credential/setup check failed; output withheld.')
    raise SystemExit(99)
