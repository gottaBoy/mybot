"""Trusted subprocess entry: confine before importing any selected source."""

import ctypes
import errno
import io
import importlib.util
import json
import os
from pathlib import Path
import platform
import resource
import socket
import sys
import sysconfig
import unittest


class RuleSet(ctypes.Structure):
    _fields_ = [("handled_access_fs", ctypes.c_uint64)]


class PathRule(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]


def confine(workspace):
    if platform.system() != "Linux" or platform.machine() not in {"aarch64", "x86_64"}:
        raise RuntimeError("test_sandbox_platform_unavailable")
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    abi = libc.syscall(444, 0, 0, 1)
    if abi < 3:
        raise RuntimeError("test_sandbox_landlock_unavailable")
    # Read/execute is admitted only for the interpreter, its libraries and this copy.
    handled = (1 << 15) - 1
    descriptor = libc.syscall(444, ctypes.byref(RuleSet(handled)), 8, 0)
    if descriptor < 0:
        raise RuntimeError("test_sandbox_ruleset_failed")
    try:
        paths = {
            Path(sysconfig.get_path("stdlib")).resolve(),
            Path(sysconfig.get_path("platstdlib")).resolve(),
            Path(sysconfig.get_path("purelib")).resolve(),
            Path(sysconfig.get_path("platlib")).resolve(),
            Path(sys.executable).resolve(),
            Path("/usr/lib").resolve(),
            Path("/lib").resolve(),
            Path(workspace).resolve(),
        }
        for path in paths:
            if not path.exists():
                continue
            fd = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                access = (1 << 0) | (1 << 2) | ((1 << 3) if path.is_dir() else 0)
                rule = PathRule(access, fd)
                if libc.syscall(445, descriptor, 1, ctypes.byref(rule), 0) != 0:
                    raise RuntimeError("test_sandbox_rule_failed")
            finally:
                os.close(fd)
        if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.syscall(446, descriptor, 0) != 0:
            raise RuntimeError("test_sandbox_restrict_failed")
    finally:
        os.close(descriptor)
    seccomp = ctypes.CDLL("libseccomp.so.2", use_errno=True)
    seccomp.seccomp_init.argtypes = [ctypes.c_uint32]
    seccomp.seccomp_init.restype = ctypes.c_void_p
    seccomp.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    seccomp.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    seccomp.seccomp_load.argtypes = [ctypes.c_void_p]
    seccomp.seccomp_release.argtypes = [ctypes.c_void_p]
    context = seccomp.seccomp_init(0x7FFF0000)
    if not context:
        raise RuntimeError("test_sandbox_seccomp_failed")
    try:
        denied = (
            "socket", "socketpair", "connect", "bind", "listen", "accept", "accept4",
            "sendto", "sendmsg", "sendmmsg", "recvmsg", "recvmmsg", "io_uring_setup",
            "clone", "clone3", "fork", "vfork", "execve", "execveat",
            "ptrace", "process_vm_readv", "process_vm_writev", "pidfd_getfd",
            "kill", "tkill", "tgkill", "rt_sigqueueinfo", "rt_tgsigqueueinfo",
            "pidfd_send_signal", "process_madvise",
            "chmod", "fchmod", "fchmodat", "fchmodat2", "chown", "lchown",
            "fchown", "fchownat", "setxattr", "lsetxattr", "fsetxattr",
            "removexattr", "lremovexattr", "fremovexattr",
            "utime", "utimes", "futimesat", "utimensat",
            "mount", "umount2", "pivot_root", "chroot", "setns", "unshare",
            "open_by_handle_at", "name_to_handle_at", "bpf", "perf_event_open",
            "userfaultfd", "keyctl", "add_key", "request_key", "ioctl",
            "shmget", "shmat", "shmctl", "shmdt", "semget", "semop",
            "semtimedop", "semctl", "msgget", "msgsnd", "msgrcv", "msgctl",
            "inotify_init", "inotify_init1", "inotify_add_watch", "fanotify_init", "syslog",
        )
        for name in denied:
            number = seccomp.seccomp_syscall_resolve_name(name.encode())
            if number >= 0 and seccomp.seccomp_rule_add(context, 0x50000 | errno.EPERM, number, 0) != 0:
                raise RuntimeError("test_sandbox_filter_failed")
        if seccomp.seccomp_load(context) != 0:
            raise RuntimeError("test_sandbox_filter_failed")
    finally:
        seccomp.seccomp_release(context)
    for kind, limit in (
        (resource.RLIMIT_CPU, 5), (resource.RLIMIT_AS, 512 * 1024 * 1024),
        (resource.RLIMIT_FSIZE, 0), (resource.RLIMIT_CORE, 0), (resource.RLIMIT_NOFILE, 64),
    ):
        resource.setrlimit(kind, (limit, limit))


def main():
    workspace, mode = Path(sys.argv[1]).resolve(), sys.argv[2]
    confine(workspace)
    if mode == "probe":
        denied = []
        for name, operation in (
            ("outside_read", lambda: Path(sys.argv[3]).read_bytes()),
            ("workspace_write", lambda: (workspace / "forbidden").write_text("no")),
            ("network", lambda: socket.socket()),
            ("process", lambda: os.fork()),
            ("metadata_write", lambda: os.chmod(sys.argv[3], 0o777)),
        ):
            try:
                operation()
            except OSError:
                denied.append(name)
        if len(denied) != 5:
            raise RuntimeError("test_sandbox_probe_failed")
        print(json.dumps({"confined": True, "denied": denied}))
        return
    sys.path.insert(0, str(workspace))
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for index, path in enumerate(json.loads(mode)):
        specification = importlib.util.spec_from_file_location(
            f"_mybot_selected_test_{index}", workspace / path,
        )
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        suite.addTests(loader.loadTestsFromModule(module))
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    print("\nMYBOT_TEST_RESULT=" + json.dumps({
        "tests_run": result.testsRun, "failures": len(result.failures),
        "errors": len(result.errors), "skipped": len(result.skipped),
        "success": result.wasSuccessful() and result.testsRun > len(result.skipped),
    }), flush=True)
    raise SystemExit(0 if result.wasSuccessful() and result.testsRun > len(result.skipped) else 1)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("MYBOT_SANDBOX_OR_RUNNER_FAILED", flush=True)
        raise SystemExit(125)
