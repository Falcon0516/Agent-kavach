import os
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

def start_recording_server(port=8001):
    """Serve the recordings directory over HTTP so backend can reference URLs."""
    os.chdir(RECORDINGS_DIR)
    handler = SimpleHTTPRequestHandler
    server = HTTPServer(("0.0.0.0", port), handler)
    print(f"[📼] Recording server: http://localhost:{port}")
    server.serve_forever()

# Start in background thread when module is imported:
t = threading.Thread(target=start_recording_server, daemon=True)
t.start()

if __name__ == "__main__":
    print("[📼] Recording manager running independently (blocking).")
    while True:
        import time
        time.sleep(1)
