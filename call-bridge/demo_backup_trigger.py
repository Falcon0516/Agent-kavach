"""
KAVACH Demo Backup Trigger
============================
Manual demo safety net — fire the KAVACH pipeline manually
if the automated trigger chain fails during a demo.

Usage:
  python demo_backup_trigger.py           # Single trigger on ENTER
  python demo_backup_trigger.py --watch   # Interactive key-press mode

Keys (--watch mode):
  k  →  Fire KAVACH demo trigger
  r  →  Reset pipeline (POST /api/reset)
  q  →  Quit
"""

import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MSI_IP = os.getenv("MSI_IP", "100.64.0.1")
BASE_URL = f"http://{MSI_IP}:8000"


def fire_trigger():
    """POST to /api/manual_trigger to start the KAVACH pipeline."""
    try:
        resp = requests.post(
            f"{BASE_URL}/api/manual_trigger",
            json={"source": "call-bridge-manual", "timestamp": time.time()},
            timeout=10,
        )
        resp.raise_for_status()
        print(f"[🚀] Pipeline started (HTTP {resp.status_code}). Watch dashboard.")
    except requests.ConnectionError:
        print(f"[❌] Backend unreachable at {BASE_URL} — is it running?")
    except Exception as e:
        print(f"[❌] Trigger failed: {e}")


def fire_reset():
    """POST to /api/reset to reset the pipeline state."""
    try:
        resp = requests.post(
            f"{BASE_URL}/api/reset",
            json={"source": "call-bridge-manual"},
            timeout=10,
        )
        resp.raise_for_status()
        print(f"[🔄] Pipeline reset (HTTP {resp.status_code}).")
    except requests.ConnectionError:
        print(f"[❌] Backend unreachable at {BASE_URL}")
    except Exception as e:
        print(f"[❌] Reset failed: {e}")


def single_trigger_mode():
    """Prompt once, fire trigger on ENTER."""
    print("=" * 60)
    print("  KAVACH DEMO BACKUP TRIGGER — SINGLE SHOT")
    print(f"  Target: {BASE_URL}/api/manual_trigger")
    print("=" * 60)
    print()

    input("  Press ENTER to fire KAVACH demo trigger... ")
    fire_trigger()


def watch_mode():
    """Interactive key-press loop for demo control."""
    print("=" * 60)
    print("  KAVACH DEMO BACKUP TRIGGER — WATCH MODE")
    print(f"  Target: {BASE_URL}")
    print("=" * 60)
    print()
    print("  Controls:")
    print("    k  →  Fire KAVACH demo trigger")
    print("    r  →  Reset pipeline")
    print("    q  →  Quit")
    print()

    try:
        # Try to use msvcrt for single-key input on Windows
        import msvcrt

        while True:
            print("  Waiting for key press... ", end="", flush=True)
            key = msvcrt.getch().decode("utf-8", errors="ignore").lower()
            print(key)

            if key == "k":
                fire_trigger()
            elif key == "r":
                fire_reset()
            elif key == "q":
                print("[👋] Exiting demo trigger.")
                break
            else:
                print(f"  [?] Unknown key '{key}' — use k/r/q")

    except ImportError:
        # Fallback for non-Windows (shouldn't happen for KAVACH)
        while True:
            key = input("  Enter command (k=trigger, r=reset, q=quit): ").strip().lower()
            if key == "k":
                fire_trigger()
            elif key == "r":
                fire_reset()
            elif key == "q":
                print("[👋] Exiting demo trigger.")
                break
            else:
                print(f"  [?] Unknown command '{key}' — use k/r/q")


def main():
    if "--watch" in sys.argv:
        watch_mode()
    else:
        single_trigger_mode()


if __name__ == "__main__":
    main()
