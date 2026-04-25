"""
KAVACH Callback Detector
==========================
Started as a background thread after each outbound police call.
Watches for an incoming callback within a configurable timeout.
If detected: auto-accepts, speaks a follow-up brief, then ends the call.

Usage (from kavach_call_bridge.py):
  from callback_detector import watch_for_callback
  import threading
  t = threading.Thread(target=watch_for_callback, args=(30,), daemon=True)
  t.start()
"""

import os
import time

import pyautogui
import pyttsx3
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")


def end_call_logic():
    """
    End the active call by clicking the end-call button in Phone Link.
    Retries up to 5 times with 1-second intervals.
    """
    end_call_img = os.path.join(SCREENSHOTS_DIR, "end_call.png")

    for attempt in range(1, 6):
        try:
            location = pyautogui.locateOnScreen(end_call_img, confidence=0.8)
            if location:
                pyautogui.click(pyautogui.center(location))
                print(f"[📞] Callback call ended (attempt {attempt})")
                return True
        except pyautogui.ImageNotFoundException:
            pass
        except Exception as e:
            print(f"[📞] End call attempt {attempt} error: {e}")
        time.sleep(1)

    print("[📞] Could not find end call button after 5 attempts")
    return False


def speak_followup_brief():
    """Speak the follow-up brief into the callback call via VB-Cable."""
    engine = pyttsx3.init()
    engine.setProperty("rate", 155)
    engine.setProperty("volume", 1.0)
    voices = engine.getProperty("voices")
    if voices:
        engine.setProperty("voice", voices[0].id)
    engine.say(
        "KAVACH follow-up brief. "
        "Victim location unchanged. "
        "Argus cameras active and recording. "
        "FIR has been filed. "
        "KAVACH system standing by."
    )
    engine.runAndWait()


def watch_for_callback(wait_seconds: int = 30):
    """
    Poll for accept_button.png for up to 'wait_seconds' seconds.
    If an incoming callback is detected within the timeout:
      1. Auto-accept the call
      2. Speak the follow-up brief
      3. End the call

    Adapted from SAATHI ai_operator.py auto_accept_call().
    """
    accept_img = os.path.join(SCREENSHOTS_DIR, "accept_button.png")
    print(f"[📞] Watching for police callback ({wait_seconds}s)...")
    start = time.time()

    while time.time() - start < wait_seconds:
        try:
            btn = pyautogui.locateOnScreen(accept_img, confidence=0.8)
            if btn:
                # Callback detected!
                print("[📞] Police callback detected — auto-answering!")
                pyautogui.click(pyautogui.center(btn))
                time.sleep(2)

                # Speak follow-up brief
                speak_followup_brief()

                time.sleep(3)
                end_call_logic()
                print("[📞] Callback handled — follow-up brief delivered.")
                return True

        except pyautogui.ImageNotFoundException:
            pass
        except Exception as e:
            print(f"[📞] Callback watcher error: {e}")

        time.sleep(1)

    print(f"[📞] No callback within {wait_seconds}s — monitoring ended.")
    return False


if __name__ == "__main__":
    print("=" * 60)
    print("  KAVACH CALLBACK DETECTOR — STANDALONE TEST")
    print("  Watching for incoming call for 30 seconds...")
    print("=" * 60)
    print()
    result = watch_for_callback(wait_seconds=30)
    if result:
        print("[✅] Callback was detected and handled.")
    else:
        print("[ℹ] No callback detected within timeout.")
