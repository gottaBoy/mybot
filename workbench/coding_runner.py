"""Bounded local Python test execution. The selected code never runs in the host."""

import asyncio
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import time


class CodingError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


class PythonTestRunner:
    def __init__(self):
        self.entry = Path(__file__).with_name("test_sandbox.py").resolve()

    async def command(self, workspace, mode, timeout, canary=None):
        argv = [sys.executable, "-I", "-B", str(self.entry), str(workspace), mode]
        if canary is not None:
            argv.append(str(canary))
        process = await asyncio.create_subprocess_exec(
            *argv, cwd=workspace, env={"LANG": "C.UTF-8", "PYTHONHASHSEED": "0"},
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
            "profile": "python-unittest", "command": argv,
            "exit_code": process.returncode, "duration_ms": round((time.monotonic() - started) * 1000),
            "output": output.decode("utf-8", errors="replace"),
            "timed_out": timed_out, "truncated": truncated,
        }

    async def probe(self):
        with tempfile.TemporaryDirectory(prefix="mybot-coding-probe-") as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            canary = root / "private-canary"
            canary.write_text("synthetic-private-canary")
            value = await self.command(source, "probe", 5, canary)
            if value["exit_code"] != 0 or '"confined": true' not in value["output"]:
                raise CodingError("coding_sandbox_unavailable", 422)
        return {"id": "landlock-seccomp-python", "available": True, "profile": "python-unittest"}

    async def run(self, workspace, test_files, timeout=10):
        result = await self.command(workspace, json.dumps(test_files), timeout)
        receipt = None
        for line in result["output"].splitlines():
            if line.startswith("MYBOT_TEST_RESULT="):
                try:
                    receipt = json.loads(line.removeprefix("MYBOT_TEST_RESULT="))
                except ValueError:
                    pass
        passed = (
            result["exit_code"] == 0 and not result["timed_out"] and not result["truncated"]
            and isinstance(receipt, dict) and type(receipt.get("tests_run")) is int
            and receipt["tests_run"] > 0 and receipt.get("success") is True
        )
        return {**result, "tests_run": receipt.get("tests_run", 0) if isinstance(receipt, dict) else 0,
                "passed": passed, "receipt": receipt}
