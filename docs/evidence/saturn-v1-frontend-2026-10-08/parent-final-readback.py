"""Read-only served-byte and preserved-render accounting; never signs in or writes demo data."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "final-hosted-staff-786b510"
CHILD = ROOT.parent / "saturn-v1-configured-codex-refinement"
BACKEND = ROOT.parent / "junior-saturn-v1-backend"
EVIDENCE = Path("docs/evidence/saturn-v1-staff-refinement-2026-10-09")
RENDERED = "786b5103303a0990b0a3ef3e45d5c5ea12371389"
RELEASED = "e8712ee52a1cafebf593347284e8700c685780b9"
ORIGIN = "https://staging.bidzizi.com"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def load(path):
    return json.loads(path.read_text())

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def validate_files(base, manifest):
    for item in manifest["files"]:
        data = (base / item["path"]).read_bytes()
        assert len(data) == item["bytes"] and digest(data) == item["sha256"], item["path"]
        if "png" in item:
            assert data[:8] == b"\x89PNG\r\n\x1a\n"
            assert struct.unpack(">II", data[16:24]) == (item["png"]["width"], item["png"]["height"])
    return len(manifest["files"])

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def fetch(path):
    req = urllib.request.Request(ORIGIN + path, headers={"User-Agent": "SaturnV1-ReadOnly-Source-Readback"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=25) as response:
            return response.status, response.read(), response.headers.get("Location")
    except urllib.error.HTTPError as response:
        return response.code, response.read(), response.headers.get("Location")

OUT.mkdir(exist_ok=False)
worker = load(CHILD / EVIDENCE / "HOSTED_WORKER_READBACK_786b510.json")
backend = load(BACKEND / EVIDENCE / "HOSTED_BACKEND_READBACK_786b510.json")
release_path = Path("/Users/jryear/.hermes/projects/bidzizi-20261008/FINAL_RELEASE_READBACK_e8712ee.json")
release = load(release_path)
assert worker["deployedSource"] == backend["sourceCommit"] == RENDERED
assert release["sourceCommit"] == release["canonicalMain"] == RELEASED
assert release["applicationBytesEqualRenderedSource"] == RENDERED
assert worker["browserErrors"] == worker["cssInterceptions"] == worker["blockedWrites"] == []
assert backend["browserErrors"] == backend["cssInterceptions"] == backend["blockedWrites"] == []
assert len(worker["logoutStatuses"]) == 2 and set(worker["logoutStatuses"]) == {200}
assert backend["logoutStatus"] == 200
validated = {"workerFiles": validate_files(CHILD, worker), "backendFiles": validate_files(BACKEND, backend)}
changed = git("diff", "--name-only", RENDERED, RELEASED).decode().splitlines()
assert changed and all(path.startswith("docs/") for path in changed), changed
canonical = subprocess.check_output(["gh", "api", "repos/jryear/bidzizi-auction/git/ref/heads/main", "--jq", ".object.sha"], cwd=ROOT, timeout=25).decode().strip()
assert canonical == RELEASED, canonical

paths = [item["path"] for item in release["assets"] + release["compiledStyles"]]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    responses = dict(zip(paths, pool.map(fetch, paths)))
served = []
for item in release["assets"] + release["compiledStyles"]:
    status, data, _ = responses[item["path"]]
    assert status == 200 and digest(data) == item["sha256"], item["path"]
    if item in release["assets"]:
        assert digest(git("show", RELEASED + ":public" + item["path"])) == item["sha256"]
    served.append({"path": item["path"], "status": status, "sha256": digest(data)})
root_status, _, root_location = fetch("/")
assert root_status == 307 and root_location == release["root"]["location"]
denials = []
for path in ["/api/admin/events/990280fa-51db-47cd-aabe-5d15bf776002/results", "/api/admin/events/990280fa-51db-47cd-aabe-5d15bf776002/donations"]:
    status, _, _ = fetch(path)
    assert status == 401
    denials.append({"path": path, "status": status})

copies = []
sources = [(CHILD / EVIDENCE / "HOSTED_WORKER_READBACK_786b510.json", "WORKER_READBACK_786b510.json"),
           (BACKEND / EVIDENCE / "HOSTED_BACKEND_READBACK_786b510.json", "BACKEND_READBACK_786b510.json"),
           (release_path, "BACKEND_FINAL_RELEASE_e8712ee.json")]
for name in ["lots-360-top.png", "lots-1440-top.png", "donations-390-bottom.png", "results-390-work.png", "display-1440-top.png"]:
    sources.append((CHILD / EVIDENCE / "deployed" / name, name))
for source, name in sources:
    shutil.copyfile(source, OUT / name)
    data = (OUT / name).read_bytes()
    item = {"source": str(source), "path": str((OUT / name).relative_to(ROOT)), "bytes": len(data), "sha256": digest(data)}
    if name.endswith(".png"):
        width, height = struct.unpack(">II", data[16:24])
        item["png"] = {"width": width, "height": height}
    copies.append(item)

receipt = {"checkedAt": datetime.now(timezone.utc).isoformat(), "kind": "PARENT_FRESH_SERVED_BYTES_AND_PRESERVED_RENDER_REVIEW", "readOnly": True,
           "canonicalMain": canonical, "metadataSource": RELEASED, "metadataDeploymentId": release["deploymentId"], "origin": ORIGIN,
           "renderedSource": RENDERED, "renderedDeploymentId": worker["announcedDeploymentId"], "docsOnlySuccessorPaths": changed,
           "freshServedAssets": served, "root": {"status": root_status, "location": root_location}, "actualAnonymousDenials": denials,
           "independentlyValidatedManifestCounts": validated,
           "workerRun": {"partialRows": worker["partialAttempt"]["rows"], "partialFailurePreserved": worker["partialAttempt"]["failure"], "focusedRows": worker["focusedSuccessor"]["rows"], "focusedChecks": worker["focusedSuccessor"]["checks"]},
           "backendSeparateRun": {"captureRows": backend["captureRows"], "browserErrors": backend["browserErrors"], "cssInterceptions": backend["cssInterceptions"], "blockedWrites": backend["blockedWrites"], "logoutStatus": backend["logoutStatus"]},
           "copiedArtifacts": copies,
           "scope": "Fresh GET-only served hashes/root/anonymous denial plus independent preserved manifest validation and actual hosted PNG review. No new browser run, sign-in, data write, deployment or owner taste acceptance. Earlier rendered sources are not relabeled as this documentation successor."}
(OUT / "PARENT_FINAL_READBACK.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"ok": True, "canonicalMain": canonical, "served": len(served), "validated": validated, "copies": len(copies), "receipt": str(OUT / "PARENT_FINAL_READBACK.json")}))
