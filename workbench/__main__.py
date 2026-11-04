import argparse
import os

import uvicorn

from .app import create_app

parser = argparse.ArgumentParser(description="Run the local AI workbench")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=4180)
args = parser.parse_args()
if args.host not in {"127.0.0.1", "localhost", "::1"} and len(os.environ.get("WORKBENCH_ACCESS_TOKEN", "")) < 32:
    parser.error("Remote listening requires a 32-character WORKBENCH_ACCESS_TOKEN")
uvicorn.run(create_app(), host=args.host, port=args.port)
