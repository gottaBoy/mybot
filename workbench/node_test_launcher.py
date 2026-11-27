"""Trusted single-threaded confinement before the fixed Node.js executable."""

import ctypes
import json
import os
from pathlib import Path
import platform
import resource
import sys


class RuleSet(ctypes.Structure):
    _fields_ = [("handled_access_fs", ctypes.c_uint64)]


class PathRule(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]


def main():
    workspace, node, runtime, selection = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
    if platform.system() != "Linux" or platform.machine() not in {"aarch64", "x86_64"}:
        raise RuntimeError("coding_node_sandbox_unavailable")
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    if libc.syscall(444, 0, 0, 1) < 3:
        raise RuntimeError("coding_node_sandbox_unavailable")
    descriptor = libc.syscall(444, ctypes.byref(RuleSet((1 << 15) - 1)), 8, 0)
    if descriptor < 0:
        raise RuntimeError("coding_node_sandbox_unavailable")
    paths = {
        workspace, node, Path("/usr/lib").resolve(), Path("/lib").resolve(),
        runtime / "bootstrap.mjs", runtime / "build" / "sandbox.node", runtime / "openssl.cnf",
    }
    try:
        for path in paths:
            fd = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                rule = PathRule(1 | 4 | (8 if path.is_dir() else 0), fd)
                if libc.syscall(445, descriptor, 1, ctypes.byref(rule), 0) != 0:
                    raise RuntimeError("coding_node_sandbox_unavailable")
            finally:
                os.close(fd)
        if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.syscall(446, descriptor, 0) != 0:
            raise RuntimeError("coding_node_sandbox_unavailable")
    finally:
        os.close(descriptor)
    for kind in (resource.RLIMIT_CORE, resource.RLIMIT_FSIZE):
        resource.setrlimit(kind, (0, 0))
    os.chdir(workspace)
    argv = [
        str(node), "--permission", "--allow-addons",
        "--allow-fs-read=" + str(workspace), "--allow-fs-read=" + str(runtime / "bootstrap.mjs"),
        "--allow-fs-read=" + str(runtime / "build" / "sandbox.node"),
        "--openssl-config=" + str(runtime / "openssl.cnf"), "--jitless",
        "--no-experimental-strip-types", "--max-old-space-size=192", "--max-semi-space-size=8",
        "--stack-size=512", str(runtime / "bootstrap.mjs"), str(workspace), selection,
    ]
    if json.loads(selection).get("mode") == "probe":
        argv.insert(4, "--allow-fs-read=" + json.loads(selection)["canary"])
    os.execve(str(node), argv, {
        "LANG": "C.UTF-8", "UV_THREADPOOL_SIZE": "4", "OPENSSL_CONF": str(runtime / "openssl.cnf"),
        "NODE_TEST_CONTEXT": "mybot-confined-node-test",
    })


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("MYBOT_NODE_SANDBOX_FAILED", flush=True)
        raise SystemExit(125)
