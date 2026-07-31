#!/usr/bin/env python3
"""Launch Money Moves on a stable localhost origin."""
from __future__ import annotations

import argparse
import http.server
import socketserver
import threading
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 8080
ROOT = Path(__file__).resolve().parent

class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

def main() -> None:
    parser = argparse.ArgumentParser(description="Run Money Moves locally.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Local port. Keep 8080 for encrypted-vault continuity.")
    args = parser.parse_args()
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **kw)
    try:
        with ReusableTCPServer((HOST, args.port), handler) as server:
            url = f"http://{HOST}:{args.port}"
            print(f"Money Moves is running at {url}")
            print("Keep this Terminal window open. Press Control-C to stop.")
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
            server.serve_forever()
    except KeyboardInterrupt:
        print("\nMoney Moves stopped.")
    except OSError as error:
        raise SystemExit(
            f"Port {args.port} is unavailable. Stop the other local server and run start.py again. "
            "Using the same port preserves access to the encrypted browser vault."
        ) from error

if __name__ == "__main__":
    main()
