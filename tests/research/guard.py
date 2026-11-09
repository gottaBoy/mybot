"""Linux-only P0 guard; not a production Agent sandbox."""

from __future__ import annotations

import argparse
import ctypes as c
import errno
import os
from pathlib import Path
import platform
import sys


class Ruleset(c.Structure):
    _fields_ = [("fs", c.c_uint64), ("net", c.c_uint64), ("scoped", c.c_uint64)]


class PathRule(c.Structure):
    _pack_ = 1
    _fields_ = [("access", c.c_uint64), ("parent", c.c_int32)]


class PortRule(c.Structure):
    _fields_ = [("access", c.c_uint64), ("port", c.c_uint64)]


def checked(result: int, operation: str) -> int:
    if result < 0:
        number = c.get_errno()
        raise OSError(number, f"{operation}: {os.strerror(number)}")
    return result


def restrict(reads: list[Path], root: Path, ports: list[int]) -> int:
    if sys.platform != "linux" or platform.machine() not in {"aarch64", "x86_64"}:
        raise RuntimeError("P0 guard requires Linux aarch64/x86_64")
    libc = c.CDLL(None, use_errno=True)
    libc.syscall.restype = c.c_long
    abi = checked(libc.syscall(444, 0, 0, 1), "Landlock ABI")
    if abi < 6:
        raise RuntimeError("Landlock ABI 6+ required; no unguarded fallback")

    # FS rights through IOCTL_DEV (ABI 5), TCP bind/connect, scoped signals/UNIX.
    fs = (1 << 16) - 1
    attr = Ruleset(fs, 3, 3)
    fd = checked(libc.syscall(444, c.byref(attr), c.sizeof(attr), 0), "ruleset")
    read_execute = (1 << 0) | (1 << 2) | (1 << 3)
    file_rights = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 14) | (1 << 15)

    def path_rule(path: Path, rights: int) -> None:
        if not path.exists():
            return
        if not path.is_dir():
            rights &= file_rights
        parent = os.open(path, os.O_PATH | os.O_CLOEXEC)
        try:
            rule = PathRule(rights, parent)
            checked(libc.syscall(445, fd, 1, c.byref(rule), 0), f"path {path}")
        finally:
            os.close(parent)

    try:
        for path in [Path("/usr"), Path("/lib"), Path("/lib64"), *reads]:
            path_rule(path, read_execute)
        path_rule(Path("/etc/ld.so.cache"), 1 << 2)
        path_rule(Path("/etc/ssl/openssl.cnf"), 1 << 2)
        for name in ("null", "urandom", "random"):
            path_rule(Path("/dev") / name, (1 << 1) | (1 << 2))
        path_rule(root, fs)
        for port in ports:
            if not 1024 <= port <= 65535:
                raise ValueError("only unprivileged explicit listener ports allowed")
            rule = PortRule(1, port)
            checked(libc.syscall(445, fd, 2, c.byref(rule), 0), "TCP bind rule")
        checked(libc.prctl(38, 1, 0, 0, 0), "no_new_privs")

        # Block non-TCP egress and cross-process memory access as well.
        sec = c.CDLL("libseccomp.so.2", use_errno=True)
        sec.seccomp_init.argtypes = [c.c_uint32]
        sec.seccomp_init.restype = c.c_void_p
        sec.seccomp_syscall_resolve_name.argtypes = [c.c_char_p]
        sec.seccomp_syscall_resolve_name.restype = c.c_int
        sec.seccomp_rule_add.argtypes = [c.c_void_p, c.c_uint32, c.c_int, c.c_uint]
        sec.seccomp_rule_add.restype = c.c_int
        sec.seccomp_load.argtypes = [c.c_void_p]
        sec.seccomp_load.restype = c.c_int
        sec.seccomp_release.argtypes = [c.c_void_p]
        ctx = sec.seccomp_init(0x7FFF0000)  # SCMP_ACT_ALLOW
        if not ctx:
            raise RuntimeError("seccomp_init failed")
        try:
            names = (
                "connect", "sendto", "sendmsg", "sendmmsg", "ptrace",
                "process_vm_readv", "process_vm_writev", "pidfd_getfd",
                "io_uring_setup", "mount", "unshare", "setns",
            )
            for name in names:
                number = sec.seccomp_syscall_resolve_name(name.encode())
                if number < 0 or sec.seccomp_rule_add(ctx, 0x00050000 | errno.EPERM, number, 0):
                    raise RuntimeError(f"cannot restrict syscall {name}")
            checked(libc.syscall(446, fd, 0), "restrict_self")
            result = sec.seccomp_load(ctx)
            if result:
                raise RuntimeError(f"seccomp_load failed: {result}")
        finally:
            sec.seccomp_release(ctx)
    finally:
        os.close(fd)
    return abi


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--read", type=Path, action="append", default=[])
    parser.add_argument("--port", type=int, action="append", default=[])
    parser.add_argument("--env", action="append", default=[])
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    if root == Path("/") or not root.is_dir():
        parser.error("root must be a dedicated existing research directory")
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or not Path(command[0]).is_absolute():
        parser.error("command executable must be absolute")
    env = {
        "HOME": str(root / "home"), "TMPDIR": str(root / "tmp"),
        "XDG_CONFIG_HOME": str(root / "home/config"),
        "XDG_DATA_HOME": str(root / "home/data"),
        "XDG_CACHE_HOME": str(root / "home/cache"),
        "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8",
        "OMB_DATA_DIR": str(root / "data"),
        "OMB_LOOPBACK_TRUST": "service",
    }
    for item in args.env:
        key, separator, value = item.partition("=")
        if not separator or key not in {
            "OMB_PORT", "OMB_WEBHOOK_PORT", "OMB_STATIC_DIR", "OMB_LOOPBACK_TRUST",
        }:
            parser.error(f"unsupported environment override {key}")
        env[key] = value
    for name in ("home", "tmp", "data"):
        (root / name).mkdir(mode=0o700, exist_ok=True)
    reads = [path.resolve(strict=True) for path in args.read]
    os.chdir(root)
    os.umask(0o077)
    os.closerange(3, 65536)
    abi = restrict(reads, root, args.port)
    print(f"P0 guard active: Landlock ABI {abi}, no outbound connects, clean environment", flush=True)
    os.execve(command[0], command, env)


if __name__ == "__main__":
    main()
