"""
KAVACH Recording Manager
==========================
Utility module — serves the recordings/ directory over HTTP
so the MSI backend and dashboard can reference recording URLs.

Auto-starts a background HTTP server on port 8001 when imported.
Import this module from incoming_call_handler.py to activate.

Usage:
  import recording_manager  # starts server automatically
  # Or run standalone:
  python recording_manager.py
"""

import os
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from functools import partial

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
RECORDING_SERVER_PORT = int(os.getenv("RECORDING_SERVER_PORT", "8001"))

os.makedirs(RECORDINGS_DIR, exist_ok=True)


class QuietHandler(SimpleHTTPRequestHandler):
    """HTTP handler that suppresses request logging noise."""

    def log_message(self, format, *args):
        # Only log actual file downloads, not every poll
        if args and "200" in str(args):
            print(f"[📼] Served: {args[0]}")


def start_recording_server(port: int = RECORDING_SERVER_PORT):
    """
    Serve the recordings directory over HTTP so the backend
    can reference and play evidence recordings.
    """
    handler = partial(QuietHandler, directory=RECORDINGS_DIR)
    server = HTTPServer(("0.0.0.0", port), handler)
    print(f"[📼] Recording server: http://0.0.0.0:{port}")
    print(f"     Serving: {RECORDINGS_DIR}")
    server.serve_forever()


def _auto_start():
    """Start the recording server in a background daemon thread."""
    t = threading.Thread(
        target=start_recording_server,
        args=(RECORDING_SERVER_PORT,),
        daemon=True,
        name="RecordingServer",
    )
    t.start()


# Auto-start when module is imported
_auto_start()


if __name__ == "__main__":
    print("=" * 60)
    print("  KAVACH RECORDING SERVER — STANDALONE MODE")
    print(f"  Port: {RECORDING_SERVER_PORT}")
    print(f"  Directory: {RECORDINGS_DIR}")
    print("=" * 60)
    print()
    # In standalone mode, run in foreground (blocking)
    start_recording_server(RECORDING_SERVER_PORT)
