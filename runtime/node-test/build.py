"""Explicit trusted setup. Never called by a Task, preview or runtime probe."""

import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess

root = Path(__file__).resolve().parent
node = Path(shutil.which("node") or "")
if not node.is_file():
    raise SystemExit("Node.js is unavailable")
node = node.resolve()
version = subprocess.check_output([str(node), "--version"], text=True).strip()
if version != "v24.21.0":
    raise SystemExit("This fixed profile is verified only with Node.js v24.21.0")
headers = node.parent.parent / "include" / "node"
if not (headers / "node_api.h").is_file():
    raise SystemExit("The matching Node.js N-API headers are unavailable")
compiler = shutil.which("cc")
if not compiler:
    raise SystemExit("A trusted C compiler is unavailable")
target = root / "build"
target.mkdir(mode=0o700, exist_ok=True)
output = target / "sandbox.node"
subprocess.run([
    compiler, "-shared", "-fPIC", "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
    "-I" + str(headers), "-o", str(output), str(root / "sandbox.c"), "-ldl",
], check=True)
os.chmod(output, 0o500)
manifest = target / "manifest.json"
manifest.unlink(missing_ok=True)
manifest.write_text(json.dumps({
    "node": str(node), "version": version, "machine": platform.machine(),
    "node_sha256": hashlib.sha256(node.read_bytes()).hexdigest(),
    "source_sha256": hashlib.sha256((root / "sandbox.c").read_bytes()).hexdigest(),
    "addon_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
}, sort_keys=True), encoding="utf-8")
os.chmod(manifest, 0o400)
print("Built the fixed Node.js test sandbox; no Task or model was executed.")
