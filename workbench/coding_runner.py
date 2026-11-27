"""Bounded local Python test execution. The selected code never runs in the host."""

import asyncio
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import sys
import tempfile
import time


PROFILES = {"python-unittest", "python-pytest", "node-test"}


class CodingError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


class PythonTestRunner:
    def __init__(self):
        self.entry = Path(__file__).with_name("test_sandbox.py").resolve()

    async def command(self, workspace, mode, timeout, canary=None, profile="python-unittest"):
        if profile not in PROFILES:
            raise CodingError("coding_profile_invalid", 422)
        if profile == "node-test":
            runtime, manifest = node_runtime()
            argv = [
                sys.executable, "-I", "-B", str(Path(__file__).with_name("node_test_launcher.py")),
                str(workspace), manifest["node"], str(runtime), mode,
            ]
        else:
            argv = [sys.executable, "-I", "-B", str(self.entry), str(workspace), mode]
            if canary is not None:
                argv.append(str(canary))
        process = await asyncio.create_subprocess_exec(
            *argv, cwd=workspace, env={
                "LANG": "C.UTF-8", "PYTHONHASHSEED": "0",
                "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
            },
            stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True,
        )
        output = bytearray()
        started = time.monotonic()
        timed_out = truncated = False
        async def consume():
            nonlocal truncated
            while chunk := await process.stdout.read(4096):
                output.extend(chunk)
                if len(output) > 32768:
                    del output[32768:]
                    truncated = True
                    raise CodingError("coding_test_output_limit")
        async def reap():
            if process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            await process.wait()
        reader = asyncio.create_task(consume())
        try:
            async with asyncio.timeout(timeout):
                await asyncio.gather(reader, process.wait())
        except TimeoutError:
            timed_out = True
            await reap()
        except CodingError:
            await reap()
        except BaseException:
            await reap()
            raise
        finally:
            if not reader.done():
                reader.cancel()
            await asyncio.gather(reader, return_exceptions=True)
            await reap()
        return {
            "profile": profile, "command": argv,
            "exit_code": process.returncode, "duration_ms": round((time.monotonic() - started) * 1000),
            "output": output.decode("utf-8", errors="replace"),
            "timed_out": timed_out, "truncated": truncated,
        }

    async def probe(self, profile="python-unittest"):
        if profile not in PROFILES:
            raise CodingError("coding_profile_invalid", 422)
        if profile == "node-test":
            node_runtime()
            with tempfile.TemporaryDirectory(prefix="mybot-node-probe-") as directory:
                root = Path(directory)
                source = root / "source"
                source.mkdir()
                canary = root / "outside-canary"
                canary.write_text("synthetic-private-canary", encoding="utf-8")
                (source / "test_probe.mjs").write_text(
                    "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"
                    "test('first',()=>assert.equal(2+2,4))\n"
                    "test('async',async()=>assert.equal(await Promise.resolve(3),3))\n",
                    encoding="utf-8",
                )
                result = await self.command(source, json.dumps({
                    "mode": "probe", "test_files": ["test_probe.mjs"], "canary": str(canary),
                }), 5, profile=profile)
                parsed = parse_test_result(result)
                if (
                    not parsed["passed"] or parsed["tests_run"] != 2
                    or 'MYBOT_NODE_PROBE={"confined":true' not in result["output"]
                ):
                    raise CodingError("coding_node_sandbox_unavailable", 422)
            return {"id": "landlock-seccomp-node", "available": True, "profile": profile}
        with tempfile.TemporaryDirectory(prefix="mybot-coding-probe-") as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            canary = root / "private-canary"
            canary.write_text("synthetic-private-canary")
            value = await self.command(source, "probe", 5, canary)
            if value["exit_code"] != 0 or '"confined": true' not in value["output"]:
                raise CodingError("coding_sandbox_unavailable", 422)
            if profile == "python-pytest":
                (source / "test_runtime_probe.py").write_text(
                    "import pytest\n"
                    "@pytest.fixture\n"
                    "def sample(): return 2\n"
                    "@pytest.mark.parametrize('value', [2, 3])\n"
                    "def test_runtime(sample, value): assert sample + value > 3\n",
                    encoding="utf-8",
                )
                checked = await self.run(source, ["test_runtime_probe.py"], 5, profile=profile)
                if not checked["passed"] or checked["tests_run"] != 2:
                    raise CodingError("coding_pytest_unavailable", 422)
        return {"id": "landlock-seccomp-python", "available": True, "profile": profile}

    async def run(self, workspace, test_files, timeout=10, profile="python-unittest"):
        mode = json.dumps(test_files) if profile == "python-unittest" else json.dumps({
            "profile": profile, "test_files": test_files,
        })
        result = await self.command(workspace, mode, timeout, profile=profile)
        return parse_test_result(result)


def node_runtime():
    runtime = Path(__file__).resolve().parents[1] / "runtime" / "node-test"
    try:
        manifest = json.loads((runtime / "build" / "manifest.json").read_text(encoding="utf-8"))
        node = Path(manifest["node"])
        if (
            set(manifest) != {"node", "version", "machine", "node_sha256", "source_sha256", "addon_sha256"}
            or manifest["version"] != "v24.21.0" or manifest["machine"] != platform.machine()
            or not node.is_file() or node.resolve() != node
            or manifest["node_sha256"] != hashlib.sha256(node.read_bytes()).hexdigest()
            or manifest["source_sha256"] != hashlib.sha256((runtime / "sandbox.c").read_bytes()).hexdigest()
            or manifest["addon_sha256"] != hashlib.sha256((runtime / "build" / "sandbox.node").read_bytes()).hexdigest()
            or not (runtime / "bootstrap.mjs").is_file() or not (runtime / "openssl.cnf").is_file()
        ):
            raise ValueError("coding_node_runtime_invalid")
        return runtime, manifest
    except (OSError, ValueError, KeyError, TypeError):
        raise CodingError("coding_node_unavailable", 422) from None


def parse_test_result(result):
        receipt = None
        markers = 0
        for line in result["output"].splitlines():
            if line.startswith("MYBOT_TEST_RESULT="):
                markers += 1
                try:
                    receipt = json.loads(line.removeprefix("MYBOT_TEST_RESULT="))
                except ValueError:
                    pass
        valid = (
            markers == 1 and isinstance(receipt, dict)
            and set(receipt) == {"tests_run", "failures", "errors", "skipped", "success"}
            and all(type(receipt.get(key)) is int and receipt[key] >= 0
                    for key in ("tests_run", "failures", "errors", "skipped"))
            and type(receipt["success"]) is bool
            and receipt["skipped"] <= receipt["tests_run"]
            and receipt["failures"] <= receipt["tests_run"]
            and (not receipt["success"] or (
                receipt["tests_run"] > receipt["skipped"]
                and receipt["failures"] == receipt["errors"] == 0
            ))
        )
        if not valid:
            receipt = None
        passed = (
            result["exit_code"] == 0 and not result["timed_out"] and not result["truncated"]
            and receipt is not None and receipt["success"]
        )
        return {**result, "tests_run": receipt.get("tests_run", 0) if isinstance(receipt, dict) else 0,
                "passed": passed, "receipt": receipt}
