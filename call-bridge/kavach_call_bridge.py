"""
KAVACH Call Bridge — OUTBOUND CALLS
====================================
Polls the MSI backend for queued outbound calls (police alerts).
When a call is queued:
  1. Dials via Phone Link (pyautogui digit screenshots)
  2. Speaks the threat brief via pyttsx3 + VB-Cable
  3. Ends the call
  4. Spawns a callback detector thread

Run:  python kavach_call_bridge.py
Requires: Phone Link open, VB-Cable active, screenshots/*.png present
"""

import os
import sys
import time
import hashlib
import threading
from datetime import datetime

import pyautogui
import pyttsx3
import requests
from dotenv import load_dotenv

# ── Load .env ────────────────────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

MSI_IP = os.getenv("MSI_IP", "100.64.0.1")
POLICE_PHONE = os.getenv("POLICE_PHONE", "100")
CALL_CONNECT_WAIT = int(os.getenv("CALL_CONNECT_WAIT", "8"))
CALL_HOLD_AFTER_SPEAK = int(os.getenv("CALL_HOLD_AFTER_SPEAK", "3"))
CALLBACK_WAIT_SECONDS = int(os.getenv("CALLBACK_WAIT_SECONDS", "30"))
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "2"))

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")


# ── Threat Message Builder ───────────────────────────────────────────────────

def build_threat_message(threat_data: dict) -> str:
    """Build the full spoken KAVACH threat alert from threat data."""
    level = threat_data.get("level", 4)
    summary = threat_data.get("summary", "A threat has been detected in the area.")
    location = threat_data.get("location", "Unknown location")

    group_note = ""
    if threat_data.get("group"):
        group_note = "Group threat detected — multiple suspects."

    plates_note = ""
    if threat_data.get("plates"):
        plates_note = f"Suspect vehicle plate: {threat_data['plates'][0]}."

    objects_note = ""
    if threat_data.get("objects"):
        objects_note = f"Threat object detected: {threat_data['objects'][0]}."

    message = (
        f"KAVACH ALERT. KAVACH ALERT. "
        f"This is the KAVACH AI Safety System. "
        f"Threat level {level} of 5. {summary}. "
        f"Victim location: {location}. "
        f"{group_note} {plates_note} {objects_note} "
        f"Argus camera evidence is being collected. "
        f"FIR is being auto-filed. "
        f"Immediate police response required. "
        f"This is an automated KAVACH alert. Over."
    )
    return message.strip()


# ── Dial via Phone Link ──────────────────────────────────────────────────────

def dial_via_phone_link(phone_number: str):
    """
    Dial a phone number using Phone Link by clicking digit screenshots.
    Each digit 0-9 must have a corresponding screenshots/{digit}.png file.
    After all digits, clicks screenshots/make_call.png.
    """
    print(f"[📱] Dialing: {phone_number}")

    for digit in str(phone_number):
        digit_img = os.path.join(SCREENSHOTS_DIR, f"{digit}.png")
        try:
            location = pyautogui.locateOnScreen(digit_img, confidence=0.8)
            if location:
                pyautogui.click(pyautogui.center(location))
                print(f"  [✓] Pressed digit: {digit}")
            else:
                print(f"  [⚠] Digit {digit} not found on screen — skipping")
        except pyautogui.ImageNotFoundException:
            print(f"  [⚠] Digit {digit} screenshot not found on screen — skipping")
        except Exception as e:
            print(f"  [⚠] Error pressing digit {digit}: {e}")
        time.sleep(0.3)

    # Click the call button
    call_img = os.path.join(SCREENSHOTS_DIR, "make_call.png")
    try:
        location = pyautogui.locateOnScreen(call_img, confidence=0.8)
        if location:
            pyautogui.click(pyautogui.center(location))
            print(f"  [✓] Call button pressed")
        else:
            print(f"  [⚠] Call button not found on screen")
    except pyautogui.ImageNotFoundException:
        print(f"  [⚠] Call button screenshot not found on screen")
    except Exception as e:
        print(f"  [⚠] Error pressing call button: {e}")


# ── Speak Threat Brief ───────────────────────────────────────────────────────

def speak_threat_brief(threat_data: dict):
    """Speak the threat message via pyttsx3 (routes through VB-Cable)."""
    message = build_threat_message(threat_data)
    print(f"[🔊] Speaking threat brief ({len(message)} chars)...")

    engine = pyttsx3.init()
    engine.setProperty("rate", 155)
    engine.setProperty("volume", 1.0)
    voices = engine.getProperty("voices")
    if voices:
        engine.setProperty("voice", voices[0].id)
    engine.say(message)
    engine.runAndWait()
    print(f"[🔊] Threat brief spoken.")


# ── End Call (borrowed from SAATHI — 5 retries) ─────────────────────────────

def end_call_logic():
    """
    End the active call by clicking the end-call button in Phone Link.
    Retries up to 5 times with 1-second intervals.
    Adapted from SAATHI ai_operator.py end_call_logic().
    """
    end_call_img = os.path.join(SCREENSHOTS_DIR, "end_call.png")

    for attempt in range(1, 6):
        try:
            location = pyautogui.locateOnScreen(end_call_img, confidence=0.8)
            if location:
                pyautogui.click(pyautogui.center(location))
                print(f"[📞] Call ended (attempt {attempt})")
                return True
        except pyautogui.ImageNotFoundException:
            pass
        except Exception as e:
            print(f"[📞] End call attempt {attempt} error: {e}")
        time.sleep(1)

    print("[📞] Could not find end call button after 5 attempts")
    return False


# ── Call Hash Generator ──────────────────────────────────────────────────────

def generate_call_hash(phone: str) -> str:
    """Generate a unique SHA-256 session hash for a call."""
    raw = f"CALL|{phone}|{datetime.now().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Callback Detector (spawned as thread) ────────────────────────────────────

def _start_callback_watcher():
    """Import and run callback detector in a background thread."""
    try:
        from callback_detector import watch_for_callback
        watch_for_callback(wait_seconds=CALLBACK_WAIT_SECONDS)
    except ImportError:
        print("[⚠] callback_detector module not found — skipping callback watch")
    except Exception as e:
        print(f"[⚠] Callback watcher error: {e}")


# ── Main Polling Loop ────────────────────────────────────────────────────────

def main():
    """Main outbound call bridge loop — polls MSI backend for call queue."""

    # Startup banner
    print("=" * 60)
    print("  KAVACH CALL BRIDGE — OUTBOUND — ONLINE")
    print(f"  Polling: http://{MSI_IP}:8000/api/get_call_queue")
    print(f"  Police phone: {POLICE_PHONE}")
    print("  VB-Cable must be active for audio routing")
    print("=" * 60)
    print()

    queue_url = f"http://{MSI_IP}:8000/api/get_call_queue"

    while True:
        try:
            resp = requests.get(queue_url, timeout=5)
            resp.raise_for_status()
            data = resp.json()

            # Expect data to be a list or dict with a "queue" key
            queue = data if isinstance(data, list) else data.get("queue", [])

            if queue:
                entry = queue[0]
                number = entry.get("number", POLICE_PHONE)
                threat_data = entry.get("threat_data", {})
                session_id = generate_call_hash(number)

                print(f"\n[🚨] CALL QUEUED — Dialing {number}")
                print(f"     Session: {session_id[:12]}...")
                print(f"     Threat Level: {threat_data.get('level', '?')}")

                # Step 1: Dial
                dial_via_phone_link(number)

                # Step 2: Wait for connection
                print(f"[⏳] Waiting {CALL_CONNECT_WAIT}s for call to connect...")
                time.sleep(CALL_CONNECT_WAIT)

                # Step 3: Speak threat brief
                speak_threat_brief(threat_data)

                # Step 4: Hold after speaking
                print(f"[⏳] Holding {CALL_HOLD_AFTER_SPEAK}s after brief...")
                time.sleep(CALL_HOLD_AFTER_SPEAK)

                # Step 5: End call
                end_call_logic()

                # Step 6: Start callback detector thread
                print(f"[📞] Starting callback watcher ({CALLBACK_WAIT_SECONDS}s)...")
                cb_thread = threading.Thread(
                    target=_start_callback_watcher,
                    daemon=True
                )
                cb_thread.start()

                # Step 7: Log completion
                print(f"[✅] Outbound call complete — {number} — {session_id[:8]}")
                print(f"     Time: {datetime.now().strftime('%H:%M:%S')}")

        except requests.ConnectionError:
            print(f"[🔄] Backend not reachable at {queue_url} — retrying in {POLL_INTERVAL}s...")
        except requests.Timeout:
            print(f"[🔄] Request timed out — retrying in {POLL_INTERVAL}s...")
        except requests.HTTPError as e:
            print(f"[⚠] HTTP error: {e} — retrying in {POLL_INTERVAL}s...")
        except Exception as e:
            print(f"[⚠] Unexpected error: {e} — continuing...")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
