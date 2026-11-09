"""Run only synthetic probes, without reading any real user secrets."""

import argparse
import errno
import json
import os
from pathlib import Path
import socket


parser = argparse.ArgumentParser()
parser.add_argument("allowed")
parser.add_argument("denied")
parser.add_argument("port", type=int)
args = parser.parse_args()
checks = {}
allowed = Path(args.allowed)
(allowed / "probe.txt").write_text("synthetic fixture\n", encoding="ascii")
checks["allowed_write_read"] = (allowed / "probe.txt").read_text() == "synthetic fixture\n"
try:
    Path(args.denied).read_text()
    checks["unlisted_file_denied"] = False
except PermissionError:
    checks["unlisted_file_denied"] = True
checks["clean_environment"] = "MYBOT_P0_SYNTHETIC_SECRET" not in os.environ
for label, address, socktype in (
    ("tcp_outbound_denied", ("192.0.2.1", 443), socket.SOCK_STREAM),
    ("udp_outbound_denied", ("192.0.2.1", 53), socket.SOCK_DGRAM),
):
    with socket.socket(socket.AF_INET, socktype) as client:
        client.settimeout(0.2)
        try:
            if socktype == socket.SOCK_DGRAM:
                client.sendto(b"synthetic", address)
            else:
                client.connect(address)
            checks[label] = False
        except OSError as error:
            checks[label] = error.errno in (errno.EPERM, errno.EACCES)
with socket.socket() as server:
    server.bind(("127.0.0.1", args.port))
    server.listen()
    checks["explicit_loopback_listener_allowed"] = True
with socket.socket() as server:
    try:
        server.bind(("127.0.0.1", 0))
        checks["unlisted_listener_denied"] = False
    except PermissionError:
        checks["unlisted_listener_denied"] = True
print(json.dumps({"guard_checks": checks}, sort_keys=True))
raise SystemExit(0 if all(checks.values()) else 1)
