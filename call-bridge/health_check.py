"""
KAVACH Health Check
=====================
Run before EVERY demo to verify all systems are operational.

Usage:  python health_check.py

Checks:
  1. MSI Backend reachable
  2. WebSocket connection
  3. Call Queue endpoint
  4. Map Data endpoint
  5. Firebase/Threat Zones endpoint
  6. TTS Engine (pyttsx3)
  7. Phone Link screenshots present
  8. Recordings directory exists
  9. VB-Cable reminder
"""

import os
import sys
import json
import time

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MSI_IP = os.getenv("MSI_IP", "100.64.0.1")
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")

PASS = "[PASS]"
FAIL = "[FAIL]"

results = []


def check(name: str, passed: bool, detail: str = ""):
    """Record a check result."""
    status = PASS if passed else FAIL
    msg = f"  {status}  {name}"
    if detail:
        msg += f"  --  {detail}"
    print(msg)
    results.append((name, passed, detail))
    return passed


def main():
    print("=" * 60)
    print("  KAVACH HEALTH CHECK -- PRE-DEMO VERIFICATION")
    print(f"  Backend target: http://{MSI_IP}:8000")
    print("=" * 60)
    print()

    # -- 1. MSI Backend -----------------------------------------------
    try:
        resp = requests.get(f"http://{MSI_IP}:8000/", timeout=5)
        check("MSI Backend", resp.status_code == 200, f"HTTP {resp.status_code}")
    except requests.ConnectionError:
        check("MSI Backend", False, "Connection refused — is backend running?")
    except Exception as e:
        check("MSI Backend", False, str(e))

    # ── 2. WebSocket ────────────────────────────────────────────────
    try:
        import websocket
        ws = websocket.create_connection(
            f"ws://{MSI_IP}:8000/ws/thoughts",
            timeout=3
        )
        ws.close()
        check("WebSocket", True, "Connected to /ws/thoughts")
    except ImportError:
        check("WebSocket", False, "websocket-client not installed")
    except Exception as e:
        check("WebSocket", False, str(e))

    # ── 3. Call Queue Endpoint ──────────────────────────────────────
    try:
        resp = requests.get(f"http://{MSI_IP}:8000/api/get_call_queue", timeout=5)
        check("Call Queue Endpoint", resp.status_code == 200,
              f"HTTP {resp.status_code}")
    except requests.ConnectionError:
        check("Call Queue Endpoint", False, "Connection refused")
    except Exception as e:
        check("Call Queue Endpoint", False, str(e))

    # ── 4. Map Data Endpoint ────────────────────────────────────────
    try:
        resp = requests.get(f"http://{MSI_IP}:8000/api/map_data", timeout=5)
        check("Map Data Endpoint", resp.status_code == 200,
              f"HTTP {resp.status_code}")
    except requests.ConnectionError:
        check("Map Data Endpoint", False, "Connection refused")
    except Exception as e:
        check("Map Data Endpoint", False, str(e))

    # ── 5. Firebase / Threat Zones ──────────────────────────────────
    try:
        resp = requests.get(f"http://{MSI_IP}:8000/api/threat_zones", timeout=5)
        check("Firebase API (Threat Zones)", resp.status_code == 200,
              f"HTTP {resp.status_code}")
    except requests.ConnectionError:
        check("Firebase API (Threat Zones)", False, "Connection refused")
    except Exception as e:
        check("Firebase API (Threat Zones)", False, str(e))

    # ── 6. TTS Engine ──────────────────────────────────────────────
    try:
        import pyttsx3
        engine = pyttsx3.init()
        voices = engine.getProperty("voices")
        engine.stop()
        check("TTS Engine (pyttsx3)", True, f"{len(voices)} voice(s) available")
    except Exception as e:
        check("TTS Engine (pyttsx3)", False, str(e))

    # ── 7. Phone Link Screenshots ───────────────────────────────────
    required_screenshots = ["accept_button.png"]
    optional_screenshots = [
        "end_call.png", "make_call.png",
        "0.png", "1.png", "2.png", "3.png", "4.png",
        "5.png", "6.png", "7.png", "8.png", "9.png"
    ]

    if os.path.isdir(SCREENSHOTS_DIR):
        files = os.listdir(SCREENSHOTS_DIR)
        missing_required = [f for f in required_screenshots if f not in files]
        missing_optional = [f for f in optional_screenshots if f not in files]

        if not missing_required:
            detail = f"{len(files)} file(s) in screenshots/"
            if missing_optional:
                detail += f" — missing optional: {', '.join(missing_optional[:3])}..."
            check("Phone Link Screenshots", True, detail)
        else:
            check("Phone Link Screenshots", False,
                  f"MISSING REQUIRED: {', '.join(missing_required)}")
    else:
        check("Phone Link Screenshots", False, "screenshots/ directory not found")

    # -- 8. Recordings Directory -------------------------------------
    if os.path.isdir(RECORDINGS_DIR):
        files = [f for f in os.listdir(RECORDINGS_DIR) if f != ".gitkeep"]
        check("Recordings Directory", True, f"{len(files)} recording(s)")
    else:
        check("Recordings Directory", False, "recordings/ directory not found")

    # -- 9. outbound_queue.json ---------------------------------------
    queue_file = os.path.join(os.path.dirname(__file__), "outbound_queue.json")
    if os.path.exists(queue_file):
        try:
            with open(queue_file, "r") as f:
                json.load(f)
            check("outbound_queue.json", True, "Exists and is valid JSON")
        except json.JSONDecodeError:
            check("outbound_queue.json", False, "Exists but invalid JSON format")
        except Exception as e:
            check("outbound_queue.json", False, f"Error reading file: {e}")
    else:
        check("outbound_queue.json", False, "File not found locally")

    # -- 10. VB-Cable Reminder ----------------------------------------
    print()
    print("  [NOTE]  VB-Cable: Manually verify in Windows Sound settings")
    print("          Default Output → CABLE Input (Virtual Audio Cable)")
    print("          This routes pyttsx3 TTS into the Phone Link call.")
    print()

    # -- Final Verdict --------------------------------------------------------
    failures = [r for r in results if not r[1]]
    print("-" * 60)
    if not failures:
        print("  OK  ALL SYSTEMS GO -- DEMO READY")
    else:
        print(f"  FAIL  ISSUES DETECTED -- FIX BEFORE DEMO ({len(failures)} failure(s))")
        for name, _, detail in failures:
            print(f"       * {name}: {detail}")
    print("-" * 60)

    return len(failures) == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
