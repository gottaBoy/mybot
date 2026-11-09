"""Capture the isolated MCP reuse probe using pinned REA, never a real model."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("package", "archive", "node", "rea", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--fixed-default", action="store_true")
    args = parser.parse_args()
    for name in ("package", "archive", "node", "rea"):
        setattr(args, name, getattr(args, name).resolve(strict=True))
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    names = ("rea-omb-mcp.json", "omb-mcp.json", "rea-summary.json")
    if any((args.output / name).exists() for name in names):
        raise SystemExit("Choose fresh evidence output; never overwrite an earlier run")
    temporary = Path(tempfile.mkdtemp(prefix="mybot-rea-mcp-"))
    reports = temporary / "reports"
    reports.mkdir()
    home = temporary / "home"
    home.mkdir()
    probe = Path(__file__).resolve().with_name("verify_omb_mcp.py")
    scenario = {
        "executable": sys.executable,
        "arguments": [
            "-I", str(probe), "--package", str(args.package),
            "--archive", str(args.archive), "--node", str(args.node),
            "--report", str(reports / "omb-mcp.json"),
        ],
        "working_directory": str(temporary),
        "filesystem_observation_paths": [str(reports)],
        "timeout_ms": 90000, "settle_ms": 300,
        "limits": {"output_bytes": 150000, "file_bytes": 150000, "files": 20},
    }
    if args.fixed_default:
        scenario["arguments"].append("--fixed-default")
    scenario_path = temporary / "scenario.json"
    scenario_path.write_text(json.dumps(scenario, indent=2) + "\n")
    environment = {"PATH": "/usr/bin:/bin", "HOME": str(home),
                   "LANG": "C.UTF-8", "TMPDIR": str(temporary)}
    command = [str(args.node), str(args.rea)]
    version = subprocess.run(
        command + ["--version"], env=environment, text=True, capture_output=True, timeout=15,
    )
    if version.returncode or version.stdout.strip() != "6.8.0":
        raise SystemExit("Expected pinned REA 6.8.0")
    with (args.output / names[0]).open("w") as output, (temporary / "capture.log").open("w") as progress:
        completed = subprocess.run(
            command + ["capture-process", str(scenario_path), "--json"], env=environment,
            stdout=output, stderr=progress, timeout=105,
        )
    evidence = json.loads((args.output / names[0]).read_text())
    report_path = reports / names[1]
    if not report_path.exists():
        raise SystemExit("Probe report missing; inspect REA Evidence")
    data = report_path.read_bytes()
    (args.output / names[1]).write_bytes(data)
    report = json.loads(data)
    result = evidence.get("normalized_result", {})
    summary = {
        "rea_version": version.stdout.strip(), "rea_exit_code": completed.returncode,
        "evidence_id": evidence.get("evidence_id"), "predicate_type": evidence.get("predicate_type"),
        "exit": result.get("exit"), "settlement": result.get("settlement"),
        "cleanup": result.get("cleanup"), "truncated": result.get("truncated"),
        "residual_unknowns": result.get("residual_unknowns"),
        "mcp_report_sha256": hashlib.sha256(data).hexdigest(),
        "probe_passed": report["passed"], "check_count": len(report["checks"]),
        "scenario": scenario, "invocation_environment": environment,
        "harness_sha256": {
            name: hashlib.sha256(probe.with_name(name).read_bytes()).hexdigest()
            for name in ("capture_omb_mcp.py", "verify_omb_mcp.py", "mock_acp.py",
                         "omb_mcp_bridge.mjs", "guard.py", "guard_selftest.py", "verify_omb_p0.py")
        },
        "limitation": "REA captures probe/report, not all HTTP/syscalls. Handler transport is injected; native fetch untested.",
    }
    (args.output / names[2]).write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0 if completed.returncode == 0 and result.get("exit", {}).get("code") == 0 and report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
