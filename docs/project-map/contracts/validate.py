"""Static documentation checks only. No application imports, gates or networking."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote
import hashlib
import json
import re
import subprocess
import sys

C = Path(__file__).resolve().parent
P = C.parent
ROOT = P.parent.parent
errors = []
checks = []

def require(ok, message):
    if not ok:
        errors.append(message)

def schema_check(value, schema, path='$'):
    if 'const' in schema:
        require(value == schema['const'], path + ': const mismatch')
    if 'enum' in schema:
        require(value in schema['enum'], path + ': enum mismatch')
    kind = schema.get('type')
    expected = {'object': dict, 'array': list, 'string': str}
    if kind:
        require(isinstance(value, expected[kind]), path + ': type mismatch')
        if not isinstance(value, expected[kind]):
            return
    if isinstance(value, dict):
        for key in schema.get('required', []):
            require(key in value, path + ': missing ' + key)
        require(len(value) >= schema.get('minProperties', 0), path + ': minProperties')
        props = schema.get('properties', {})
        for key, child in value.items():
            if key in props:
                schema_check(child, props[key], path + '.' + key)
            elif schema.get('additionalProperties') is False:
                errors.append(path + ': unexpected ' + key)
            elif isinstance(schema.get('additionalProperties'), dict):
                schema_check(child, schema['additionalProperties'], path + '.' + key)
    if isinstance(value, list):
        require(len(value) >= schema.get('minItems', 0), path + ': minItems')
        require(len(value) <= schema.get('maxItems', sys.maxsize), path + ': maxItems')
        if schema.get('uniqueItems'):
            require(len({json.dumps(x, sort_keys=True) for x in value}) == len(value), path + ': duplicate items')
        for i, child in enumerate(value):
            schema_check(child, schema.get('items', {}), f'{path}[{i}]')
    if isinstance(value, str):
        require(len(value) >= schema.get('minLength', 0), path + ': empty string')
        if schema.get('pattern'):
            require(re.search(schema['pattern'], value) is not None, path + ': pattern mismatch')

inventory = json.loads((C / 'INVENTORY.json').read_text())
schema_check(inventory, json.loads((C / 'SCHEMA.json').read_text()))
checks.append('inventory JSON schema (stdlib supported keyword subset)')
rows = inventory['slices']
ids = [s['id'] for s in rows]
require(len(set(ids)) == len(ids), 'duplicate slice IDs')
require(len({s['file'] for s in rows}) == len(rows), 'duplicate contract filenames')
lookup = {s['id']: s for s in rows}
seen = set()
def visit(id, active):
    require(id not in active, 'dependency cycle: ' + ' → '.join(active + [id]))
    if id in active or id in seen:
        return
    for dep in lookup[id]['depends_on']:
        require(dep in lookup, id + ': missing dependency ' + dep)
        if dep in lookup:
            visit(dep, active + [id])
    seen.add(id)
for id in ids:
    visit(id, [])
require(lookup['WATCH012']['depends_on'] == [], '012 must not wait on unimplemented007/008')
assigned = [x for d in inventory['deliverables'] for x in d['slices']]
require(sorted(assigned) == sorted(ids), 'deliverable assignment missing/duplicated')
for d in inventory['deliverables']:
    for id in d['slices']:
        require(lookup[id]['deliverable'] == d['id'], id + ': deliverable mismatch')
checks.append('13 unique finite slices, complete grouping and acyclic accepted dependencies')

binding = json.loads((C / 'SOURCES.json').read_text())
sources = binding['sources']
for id, s in sources.items():
    path = Path(s['path'])
    require(path.is_file(), id + ': missing exact reading source')
    if path.is_file():
        require(hashlib.sha256(path.read_bytes()).hexdigest() == s['sha256'], id + ': source drift')
    require(bool(s['meaning']), id + ': no authority/source limit')
sections = ['Bounded user-visible outcome', 'Exclusions', 'Dependencies and delivery seam', 'Decisions and freeze blockers', 'Implementation expectations after authorization', 'Verification and evidence expectations', 'Acceptance and promotion criteria', 'Reviewed successor and historical preservation', 'Exact scoped reading for the future slice delegator']
for s in rows:
    p = C / s['file']
    require(p.is_file(), s['id'] + ': contract missing')
    if not p.is_file():
        continue
    md = p.read_text()
    require('DRAFT_UNFROZEN' in md and s['readiness'] in md, s['id'] + ': readiness/status mismatch')
    require(s['outcome'] in md, s['id'] + ': bounded outcome differs')
    for section in sections:
        require('## ' + section in md, s['id'] + ': missing section ' + section)
    for r in s['reading']:
        require(r['source'] in sources, s['id'] + ': unknown source ' + r['source'])
        if r['source'] in sources:
            require(sources[r['source']]['path'] in md and r['sections'] in md, s['id'] + ': scoped reading differs')
    require('Local GREEN means ready to integrate' in md, s['id'] + ': delivery lifecycle missing')
    require('present owner pause' in md, s['id'] + ': current pause missing')
checks.append('exact reading sources/hashes and all required contract sections/status/lifecycle')

html = (P / 'index.html').read_text()
match = re.search(r'const items=(.*?);\nconst extras=', html, re.S)
require(match is not None, 'map items not statically parseable')
items = json.loads(match.group(1)) if match else []
mapped = [i for i in items if 'slice' in i]
require(sorted(i['slice'] for i in mapped) == sorted(ids), 'map/inventory slice parity')
current = (P / 'CURRENT.md').read_text()
readme = (C / 'README.md').read_text()
for s in rows:
    require(f"](contracts/{s['file']})" in current, s['id'] + ': CURRENT link missing')
    require(f"]({s['file']})" in readme, s['id'] + ': inventory README link missing')
    i = next((i for i in mapped if i['slice'] == s['id']), {})
    require(i.get('contract') == 'contracts/' + s['file'], s['id'] + ': map contract link mismatch')
    require(s['readiness'].lower().replace('_', ' ') in i.get('evidence', ''), s['id'] + ': map readiness mismatch')
require('product work paused' in html and 'All product work is paused' in current, 'projection pause mismatch')
require('private' in html.lower() and 'not a fresh hosted test' in current, 'recorded/private projection caveat missing')
require('closed/archived operationally' in current and 'Historical anomalies archived' in html, 'case disposition mismatch')
require('014 first frozen packet; stopped' in html and 'independently reviewed successor/improvements' in current, 'mobile stop parity')
checks.append('map/CURRENT/inventory readiness, links, pause and historical/mobile status parity')

class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
        self.triggers = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            require(a['id'] not in self.ids, 'duplicate HTML ID ' + a['id'])
            self.ids.add(a['id'])
        if 'href' in a:
            self.links.append(a['href'])
        if 'data-detail' in a:
            self.triggers.append(a['data-detail'])
parser = Links()
parser.feed(html)
dynamic_ids = {i['id'] for i in items}
extras_match = re.search(r'const extras=(.*?);\nconst grid=', html, re.S)
extras = json.loads(extras_match.group(1)) if extras_match else {}
require(len(dynamic_ids) == len(items), 'duplicate map card IDs')
require(not (dynamic_ids & parser.ids), 'card/static HTML ID collision')
for trigger in parser.triggers:
    require(trigger in dynamic_ids or trigger in extras, 'missing dialog data ' + trigger)
link_count = 0
def check_link(file, target):
    global link_count
    target = target.strip('<>')
    if re.match(r'^[a-z]+:', target) or target.startswith('//'):
        return  # No network fetches; no fresh external status claims.
    path, _, anchor = target.partition('#')
    if not path:
        if file.suffix == '.html' and anchor:
            require(anchor in parser.ids or anchor in dynamic_ids, str(file) + ': missing anchor ' + anchor)
        return
    resolved = Path(unquote(path)) if path.startswith('/') else file.parent / unquote(path)
    require(resolved.exists(), str(file.relative_to(P)) + ': broken link ' + target)
    link_count += 1
for target in parser.links + [i['contract'] for i in mapped]:
    check_link(P / 'index.html', target)
for file in [P / 'CURRENT.md', C / 'README.md', C / 'DELIVERY.md'] + [C / s['file'] for s in rows] + list((P / 'evidence/checkpoint-2026-10-08').glob('*.md')):
    for target in re.findall(r'\]\((<[^>]+>|[^)]+)\)', file.read_text()):
        check_link(file, target)
checks.append('static HTML anchors/dialog targets and all scoped Markdown/local links')

def git(path, *args):
    return subprocess.check_output(['git', '-C', str(path), *args], text=True).strip()
base = inventory['doc_base']
require(git(ROOT, 'branch', '--show-current') == binding['documentation']['isolated_branch'], 'wrong docs branch')
require(git(ROOT, 'merge-base', base, 'HEAD') == base, 'docs branch lost source lineage')
outside = git(ROOT, 'diff', '--name-only', base, '--', '.', ':(exclude)docs/project-map')
require(not outside, 'tracked product/protected change: ' + outside)
changed = git(ROOT, 'diff', '--name-only', base).splitlines()
untracked = git(ROOT, 'ls-files', '--others', '--exclude-standard').splitlines()
for file in changed + untracked:
    require(file.startswith('docs/project-map/'), 'non-document path ' + file)
    if file.startswith('docs/project-map/evidence/'):
        require(file.startswith('docs/project-map/evidence/checkpoint-2026-10-08/'), 'historical evidence change ' + file)
original = git(ROOT, 'show', base + ':docs/project-map/index.html')
old_style = re.search(r'<style>(.*?)</style>', original, re.S).group(1)
new_style = re.search(r'<style>(.*?)</style>', html, re.S).group(1)
require(new_style.startswith(old_style), 'original map stylesheet changed')
for path, sha, clean in [
    (binding['documentation']['source_checkout'], base, True),
    (binding['product']['released_checkout'], inventory['release'], True),
    (binding['product']['accepted_private_checkout'], binding['product']['accepted_private_head'], True),
    ('/Users/jryear/Documents/Codex/2026-10-07/task-12/mobile-fix', 'deba554033d716c57f65f542b75eb0af807f03e7', True),
    (binding['product']['canonical_checkout'], binding['product']['canonical_head'], False),
]:
    require(git(path, 'rev-parse', 'HEAD') == sha, 'external checkout HEAD drift: ' + path)
    if clean:
        require(not git(path, 'status', '--porcelain'), 'external checkout dirty: ' + path)
checks.append('docs-only diff, original map CSS preservation and untouched source/mobile checkouts')

result = {'status': 'PASS' if not errors else 'FAIL', 'method': 'static documentation only; no application/baseline/hosted execution', 'slice_count': len(rows), 'source_count': len(sources), 'map_card_count': len(items), 'local_links_checked': link_count, 'checks': checks, 'errors': errors}
print(json.dumps(result, indent=2))
sys.exit(0 if not errors else 1)
