"""Record the bounded P0 probe through the pinned REA CLI."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile


parser = argparse.ArgumentParser(description=__doc__)
for name in ("package", "archive", "node", "rea", "output"):
    parser.add_argument(f"--{name}", type=Path, required=True)
args = parser.parse_args()
for name in ("package", "archive", "node", "rea"):
    setattr(args, name, getattr(args, name).resolve(strict=True))
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=True)
if any((args.output / name).exists() for name in ("rea-omb-p0.json", "omb-p0.json", "rea-summary.json")):
    raise SystemExit("Choose a fresh output directory; existing evidence must not be overwritten")
temporary = Path(tempfile.mkdtemp(prefix="mybot-rea-p0-"))
reports = temporary / "reports"
reports.mkdir()
home = temporary / "home"
home.mkdir()
probe = Path(__file__).resolve().with_name("verify_omb_p0.py")
scenario = {
    "executable": sys.executable,
    "arguments": [
        "-I", str(probe), "--package", str(args.package),
        "--archive", str(args.archive), "--node", str(args.node),
        "--report", str(reports / "omb-p0.json"),
    ],
    "working_directory": str(temporary),
    "filesystem_observation_paths": [str(reports)],
    "timeout_ms": 60000,
    "settle_ms": 300,
    "limits": {"output_bytes": 100000, "file_bytes": 100000, "files": 20},
}
scenario_path = temporary / "scenario.json"
scenario_path.write_text(json.dumps(scenario, indent=2) + "\n")
environment = {
    "PATH": "/usr/bin:/bin", "HOME": str(home),
    "LANG": "C.UTF-8", "TMPDIR": str(temporary),
}
command = [str(args.node), str(args.rea)]
version = subprocess.run(command + ["--version"], env=environment, text=True, capture_output=True, timeout=15)
if version.returncode or version.stdout.strip() != "6.8.0":
    raise SystemExit("Expected REA 6.8.0")
with (args.output / "rea-omb-p0.json").open("w") as output, (temporary / "progress.log").open("w") as progress:
    completed = subprocess.run(
        command + ["capture-process", str(scenario_path), "--json"],
        env=environment, stdout=output, stderr=progress, timeout=75,
    )
evidence = json.loads((args.output / "rea-omb-p0.json").read_text())
report_path = reports / "omb-p0.json"
if report_path.exists():
    report_bytes = report_path.read_bytes()
    (args.output / "omb-p0.json").write_bytes(report_bytes)
else:
    raise SystemExit("P0 report was not produced; inspect REA Evidence")
result = evidence.get("normalized_result", {})
summary = {
    "rea_version": version.stdout.strip(),
    "rea_exit_code": completed.returncode,
    "evidence_id": evidence.get("evidence_id"),
    "predicate_type": evidence.get("predicate_type"),
    "exit": result.get("exit"),
    "settlement": result.get("settlement"),
    "cleanup": result.get("cleanup"),
    "truncated": result.get("truncated"),
    "residual_unknowns": result.get("residual_unknowns"),
    "p0_report_sha256": hashlib.sha256(report_bytes).hexdigest(),
    "scenario": scenario,
    "invocation_environment": environment,
    "harness_sha256": {
        name: hashlib.sha256(probe.with_name(name).read_bytes()).hexdigest()
        for name in ("verify_omb_p0.py", "guard.py", "guard_selftest.py", "omb_permission_functions.mjs")
    },
    "limitation": "REA observes the probe and its report, not every HTTP or network syscall.",
}
(args.output / "rea-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
probe_exit = result.get("exit", {}).get("code")
raise SystemExit(0 if completed.returncode == 0 and probe_exit == 0 else 1)
