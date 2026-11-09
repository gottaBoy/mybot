"""Bounded OpenMausBot boot/metadata probe. Never sends a model prompt."""

from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time


VERSION = "0.1.146"
INTEGRITY = "sha512-RKx0WYT/xJMCHjvIcv3jALIz1AF0LiyjSmE3bRERdALXunc6ULPk3nOaor6noTnKgSmeOSVDuB4ycrmEPD6WPA=="
HERE = Path(__file__).resolve().parent


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def request(port: int, path: str, method="GET", payload=None, browser=False):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    headers = {}
    if browser:
        headers = {"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "empty"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload)
    try:
        connection.request(method, path, body, headers)
        response = connection.getresponse()
        content = response.read(1_000_000).decode()
        result = json.loads(content) if "application/json" in response.getheader("content-type", "") else content
        return response.status, result
    finally:
        connection.close()


def guarded(args, profile, port=None, webhook=None, trust="service"):
    profile.mkdir(mode=0o700, exist_ok=True)
    command = [
        sys.executable, "-I", str(HERE / "guard.py"), "--root", str(profile),
        "--read", str(args.package), "--read", str(args.node),
        "--env", f"OMB_LOOPBACK_TRUST={trust}",
    ]
    if port:
        command += [
            "--port", str(port), "--port", str(webhook),
            "--env", f"OMB_PORT={port}", "--env", f"OMB_WEBHOOK_PORT={webhook}",
            "--env", f"OMB_STATIC_DIR={args.package / 'dist'}",
        ]
    return command


@contextmanager
def server(args, profile, trust, results):
    port, webhook = free_port(), free_port()
    while port == webhook:
        webhook = free_port()
    log = profile / f"{trust}-{len(results)}.log"
    command = guarded(args, profile, port, webhook, trust) + [
        "--", str(args.node), str(args.package / "dist-server/index.js"),
    ]
    row = {"trust": trust, "port": port, "webhook_port": webhook, "log": str(log)}
    results.append(row)
    with log.open("w") as output:
        child = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        started = time.monotonic()
        try:
            while time.monotonic() - started < 20:
                if child.poll() is not None:
                    raise RuntimeError(f"upstream exited {child.returncode}: {log.read_text()[-3000:]}")
                try:
                    status, health = request(port, "/api/health")
                    if status == 200 and health.get("app") == "openmausbot":
                        break
                except (OSError, ValueError):
                    pass
                time.sleep(0.15)
            else:
                raise RuntimeError("health deadline exceeded")
            row["boot_ms"] = round((time.monotonic() - started) * 1000)
            yield port
        finally:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=3)
                    row["forced_kill"] = True
            row["exit_code"] = child.returncode
            row["listeners_closed"] = True
            for value in (port, webhook):
                with socket.socket() as client:
                    client.settimeout(0.3)
                    if client.connect_ex(("127.0.0.1", value)) == 0:
                        row["listeners_closed"] = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    args.package = args.package.resolve(strict=True)
    args.archive = args.archive.resolve(strict=True)
    args.node = args.node.resolve(strict=True)
    root = Path(tempfile.mkdtemp(prefix="mybot-omb-p0-"))
    report = {
        "schema_version": 1,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "scope": "P0 isolated upstream boot and metadata only; no model prompt",
        "version": VERSION, "temporary_root": str(root),
        "launches": [], "checks": {}, "observations": {}, "errors": [],
        "not_tested": [
            "model or tool execution", "live approvals", "Bot API authenticated execution",
            "running-task restart/replay", "SSE delivery/replay", "phone pairing or devices",
            "third-party accounts", "production security", "enterprise license suitability",
        ],
    }
    checks, observations = report["checks"], report["observations"]
    try:
        actual = "sha512-" + base64.b64encode(hashlib.sha512(args.archive.read_bytes()).digest()).decode()
        checks["archive_integrity"] = actual == INTEGRITY
        if not checks["archive_integrity"]:
            raise RuntimeError("archive integrity mismatch")
        with tarfile.open(args.archive) as archive:
            members = [item for item in archive.getmembers() if item.isfile()]
            for member in members:
                relative = Path(member.name).relative_to("package")
                local = (args.package / relative).resolve(strict=True)
                if not local.is_relative_to(args.package):
                    raise RuntimeError("package member escapes extraction directory")
                with archive.extractfile(member) as packaged:
                    if hashlib.sha256(packaged.read()).digest() != hashlib.sha256(local.read_bytes()).digest():
                        raise RuntimeError(f"extracted package changed: {relative}")
        checks["extracted_members_match_archive"] = True
        observations["verified_package_file_count"] = len(members)
        package = json.loads((args.package / "package.json").read_text())
        if package["name"] != "openmausbot" or package["version"] != VERSION:
            raise RuntimeError("wrong package name/version")
        report["integrity"] = actual
        report["selected_sha256"] = {
            name: hashlib.sha256((args.package / name).read_bytes()).hexdigest()
            for name in (
                "cli.js", "dist-server/index.js", "dist-server/shared/approval-mode.js",
                "dist-server/server/request-auth.js",
            )
        }
        sentinel = root / "synthetic-denied.txt"
        sentinel.write_text("synthetic, not a real credential\n")
        profile = root / "profile"
        profile.mkdir(mode=0o700)
        self_port = free_port()
        probe = guarded(args, profile) + [
            "--read", str(HERE / "guard_selftest.py"), "--port", str(self_port),
            "--", "/usr/bin/python3", "-I", str(HERE / "guard_selftest.py"),
            str(profile), str(sentinel), str(self_port),
        ]
        env = {"PATH": "/usr/bin:/bin", "MYBOT_P0_SYNTHETIC_SECRET": "synthetic-only"}
        tested = subprocess.run(probe, env=env, text=True, capture_output=True, timeout=10)
        guard_result = json.loads(tested.stdout.splitlines()[-1])
        report["guard"] = guard_result["guard_checks"]
        if tested.returncode or not all(report["guard"].values()):
            raise RuntimeError("guard self-test failed; upstream was not started")
        help_result = subprocess.run(
            guarded(args, profile) + ["--", str(args.node), str(args.package / "cli.js"), "--help"],
            text=True, capture_output=True, timeout=15,
        )
        checks["cli_help"] = help_result.returncode == 0 and "openmausbot serve" in help_result.stdout
        node_result = subprocess.run(
            guarded(args, profile) + ["--", str(args.node), "--version"],
            text=True, capture_output=True, timeout=10,
        )
        observations["node_version"] = node_result.stdout.splitlines()[-1]
        checks["node_version_pinned"] = node_result.returncode == 0 and observations["node_version"] == "v24.22.1"
        functions = subprocess.run(
            guarded(args, profile) + [
                "--read", str(HERE / "omb_permission_functions.mjs"),
                "--", str(args.node), str(HERE / "omb_permission_functions.mjs"), str(args.package),
            ],
            text=True, capture_output=True, timeout=15,
        )
        if functions.returncode:
            raise RuntimeError(f"permission function probe failed: {functions.stderr[-1500:]}")
        report["permission_functions"] = json.loads(functions.stdout.splitlines()[-1])
        checks["selected_permission_functions"] = report["permission_functions"]["passed"]
        with server(args, profile, "service", report["launches"]) as port:
            status, edition = request(port, "/api/edition")
            checks["oss_edition"] = status == 200 and edition == {"edition": "oss", "features": []}
            status, page = request(port, "/")
            checks["static_html"] = status == 200 and "<!doctype html>" in page
            status, _ = request(port, "/api/config")
            checks["service_config_denied"] = status == 403
            status, _ = request(port, "/api/bots", browser=True)
            checks["unpaired_browser_denied"] = status in (401, 403)
            status, data = request(port, "/api/bots")
            checks["service_bot_list_visible"] = status == 200
            bots = data["bots"]
            observations["fresh_bot_count"] = len(bots)
            observations["fresh_bot_modes"] = [bot.get("approvalMode") for bot in bots]
            checks["ask_first_default"] = bool(bots) and all(
                bot.get("approvalMode") == "ask" for bot in bots
            )
            checks["no_model_selected"] = all(
                not bot.get("modelSelection", {}).get("instanceId") for bot in bots
            )
            if not bots:
                raise RuntimeError("expected bootstrap bot not observed")
            bot_id = bots[0]["id"]
            status, _ = request(port, f"/api/bots/{bot_id}", "PATCH", {"approvalMode": "ask"})
            checks["service_bot_mutation_denied"] = status == 403
        with server(args, profile, "owner", report["launches"]) as port:
            status, config = request(port, "/api/config", "PATCH", {
                "newBotDefaults": {"profile": {"approvalMode": "ask"}},
            })
            checks["owner_can_set_ask_template"] = status == 200
            observations["ask_template_status"] = status
            if status != 200:
                raise RuntimeError(f"cannot set ask template: {config}")
            cases = [
                ("template_default", {"useDefaults": True}, "ask"),
                ("top_level_full_ignored", {"useDefaults": True, "approvalMode": "full"}, "ask"),
                ("nested_settings_full_overrides", {
                    "useDefaults": True, "settings": {"approvalMode": "full"},
                }, "full"),
                ("skip_defaults_returns_full", {"useDefaults": False}, "full"),
            ]
            observations["creation_cases"] = []
            for name, body, expected in cases:
                payload = {"name": f"Synthetic {name}", **body}
                status, response = request(port, "/api/bots", "POST", payload)
                view = response.get("bot", {}) if isinstance(response, dict) else {}
                observations["creation_cases"].append({
                    "case": name, "request": body, "status": status,
                    "mode": view.get("approvalMode"), "expected": expected,
                })
                checks[name] = status == 201 and view.get("approvalMode") == expected
            _, data = request(port, "/api/bots")
            fixture_ids = [bot["id"] for bot in data["bots"]]
            checks["no_fixture_model_selected"] = all(
                not bot.get("modelSelection", {}).get("instanceId") for bot in data["bots"]
            )
            downgraded = []
            for identifier in fixture_ids:
                status, _ = request(port, f"/api/bots/{identifier}", "PATCH", {
                    "approvalMode": "ask", "applyToAllThreads": True,
                })
                downgraded.append(status == 200)
            checks["owner_can_downgrade_fixture"] = all(downgraded)
            _, data = request(port, "/api/bots")
            checks["fixture_now_ask"] = all(bot.get("approvalMode") == "ask" for bot in data["bots"])
        with server(args, profile, "service", report["launches"]) as port:
            _, data = request(port, "/api/bots")
            bot = next(bot for bot in data["bots"] if bot["id"] == bot_id)
            checks["fixture_ask_persisted"] = bot.get("approvalMode") == "ask"
            checks["all_fixture_modes_ask_persisted"] = (
                {bot["id"] for bot in data["bots"]} == set(fixture_ids)
                and all(bot.get("approvalMode") == "ask" for bot in data["bots"])
            )
            observations["identity_persisted"] = bot["id"] == bot_id
        checks["all_processes_stopped"] = all(
            row["listeners_closed"] and not row.get("forced_kill") for row in report["launches"]
        )
    except Exception as error:
        report["errors"].append(f"{type(error).__name__}: {error}")
    finally:
        unexpected = report["errors"] or any(
            not value for key, value in checks.items() if key != "ask_first_default"
        )
        report["p0_verdict"] = "incomplete" if unexpected else (
            "not_adopted_ask_first_default_failed" if not checks.get("ask_first_default") else "boot_only"
        )
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n")
        print(json.dumps(report, indent=2, ensure_ascii=True))
    return 1 if report["errors"] or any(
        not value for key, value in checks.items() if key != "ask_first_default"
    ) else 0


if __name__ == "__main__":
    raise SystemExit(main())
