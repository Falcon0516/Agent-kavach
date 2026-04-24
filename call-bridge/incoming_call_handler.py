"""
KAVACH Incoming Call Handler
==============================
Handles incoming calls from keypad phones (victim without a smartphone).
Run this in a SEPARATE terminal alongside kavach_call_bridge.py.

Flow:
  1. Wait for incoming call (watch for accept_button.png in Phone Link)
  2. Auto-accept the call, OCR the caller number
  3. Speak TTS confirmation into the call
  4. Record 20s ambient audio (evidence capture)
  5. Transcribe via Groq Whisper
  6. Save recording + POST to MSI backend
  7. Fire KAVACH pipeline
  8. End call

Run:  python incoming_call_handler.py
Requires: Phone Link open, VB-Cable active, screenshots/accept_button.png present
"""

import os
import sys
import io
import time
import hashlib
from datetime import datetime

import pyautogui
import pyttsx3
import requests
import numpy as np
import sounddevice as sd
import soundfile as sf
from PIL import ImageGrab
from dotenv import load_dotenv

# ── Load .env ────────────────────────────────────────────────────────────────
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(env_path, override=True)

MSI_IP = os.getenv("MSI_IP", "100.64.0.1")
MI_TAILSCALE_IP = os.getenv("MI_TAILSCALE_IP", "100.64.0.2")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
RECORDING_DURATION = int(os.getenv("RECORDING_DURATION", "20"))
SAMPLE_RATE = 16000
POST_CALL_HOLD = int(os.getenv("POST_CALL_HOLD", "5"))

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

# Tesseract path (Windows)
try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = os.getenv(
        "TESSERACT_CMD",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
except ImportError:
    pytesseract = None

# Global state for current caller
CURRENT_CALLER_ID = "UNKNOWN"


# ── Extract Caller ID from Screen (borrowed from SAATHI) ────────────────────

def extract_caller_id_from_screen() -> str:
    """
    Capture the Phone Link window and OCR the incoming caller number.
    Adapted from SAATHI ai_operator.py extract_caller_id_from_screen().
    """
    if pytesseract is None:
        print("[⚠] pytesseract not available — caller ID unknown")
        return "UNKNOWN"

    try:
        screenshot = ImageGrab.grab()
        text = pytesseract.image_to_string(screenshot)

        # Look for phone-number-like patterns in OCR output
        import re
        # Match Indian phone numbers (10 digits, optionally with +91 or 0 prefix)
        patterns = [
            r'\+91[\s\-]?\d{10}',       # +91 XXXXXXXXXX
            r'\b0?\d{10}\b',             # 0XXXXXXXXXX or XXXXXXXXXX
            r'\b\d{3}[\s\-]\d{3}[\s\-]\d{4}\b',  # XXX-XXX-XXXX
            r'\b\d{5}[\s\-]\d{5}\b',     # XXXXX-XXXXX
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                caller_id = re.sub(r'[\s\-]', '', match.group())
                print(f"[📞] Caller ID detected: {caller_id}")
                return caller_id

        print("[⚠] No phone number found in OCR — caller ID unknown")
        return "UNKNOWN"

    except Exception as e:
        print(f"[⚠] OCR failed: {e}")
        return "UNKNOWN"


# ── Wait for Incoming Call (borrowed from SAATHI auto_accept_call) ───────────

def wait_for_incoming_call() -> str:
    """
    Block until an incoming call is detected in Phone Link.
    Watches for accept_button.png, OCRs the caller number, then clicks accept.
    Returns the caller phone number.

    Adapted from SAATHI ai_operator.py auto_accept_call().
    """
    global CURRENT_CALLER_ID
    accept_img = os.path.join(SCREENSHOTS_DIR, "accept_button.png")

    print("[📞] Watching for incoming call...")

    while True:
        try:
            location = pyautogui.locateOnScreen(accept_img, confidence=0.8)
            if location:
                print("[📞] Incoming call detected!")

                # OCR caller ID before accepting
                caller_id = extract_caller_id_from_screen()
                CURRENT_CALLER_ID = caller_id

                # Accept the call
                pyautogui.click(pyautogui.center(location))
                print(f"[📞] Call accepted from: {caller_id}")
                time.sleep(1)
                return caller_id

        except pyautogui.ImageNotFoundException:
            pass
        except Exception as e:
            print(f"[⚠] Error watching for call: {e}")

        time.sleep(1)


# ── Record Ambient Audio ────────────────────────────────────────────────────

def record_ambient_audio(duration_seconds: int = 20) -> bytes:
    """
    Record ambient audio for a fixed duration (evidence capture).
    Unlike SAATHI's silence-detection mode, this records for the full duration.
    Returns WAV bytes.

    Adapted from SAATHI ai_operator.py record_user_audio().
    """
    print(f"[🎙] Recording ambient audio for {duration_seconds} seconds...")
    audio_data = sd.rec(
        int(SAMPLE_RATE * duration_seconds),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype='float32'
    )
    sd.wait()

    wav_io = io.BytesIO()
    sf.write(wav_io, audio_data, SAMPLE_RATE, format='WAV')
    wav_io.seek(0)

    wav_bytes = wav_io.read()
    print(f"[🎙] Recording complete — {len(wav_bytes)} bytes")
    return wav_bytes


# ── Transcribe with Sarvam API (Kannada/Hindi STT) ─────────────────────────

def transcribe_with_sarvam(wav_bytes: bytes) -> str:
    """Transcribe recorded WAV audio using Sarvam API (translates Indic to English)."""
    sarvam_key = os.getenv("SARVAM_API_KEY")
    if not sarvam_key:
        print("[⚠] SARVAM_API_KEY not set — skipping transcription")
        return "Emergency SOS call — audio transcription unavailable"

    try:
        url = "https://api.sarvam.ai/speech-to-text-translate"
        files = {"file": ("recording.wav", wav_bytes, "audio/wav")}
        data = {"prompt": ""}
        headers = {"api-subscription-key": sarvam_key}

        response = requests.post(url, headers=headers, data=data, files=files, timeout=15)
        if response.status_code == 200:
            transcript = response.json().get("transcript", "").strip()
            print(f"[📝] Sarvam Transcription complete ({len(transcript)} chars)")
            return transcript if transcript else "Emergency SOS call — no speech detected"
        else:
            print(f"[⚠] Sarvam STT failed: {response.text}")
            return "Emergency SOS call — transcription failed"
    except Exception as e:
        print(f"[⚠] Sarvam API Error: {e}")
        return "Emergency SOS call — transcription error"

# ── Routing TTS (Sarvam TTS) ────────────────────────────────────────────────
def play_routing_audio(transcript: str):
    """If transcript contains routing requests, generate and play audio via Sarvam."""
    if "KSIT" in transcript.upper() and "SJBIT" in transcript.upper():
        print(f"[🗺️] Routing requested in call. Generating exact directions via Groq...")
        try:
            from groq import Groq
            client = Groq(api_key=GROQ_API_KEY)
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": "Provide very short, 2-sentence driving directions from KSIT college to SJBIT college in Bangalore. Respond in Hindi."}]
            )
            directions_text = res.choices[0].message.content.strip()
            
            # Generate TTS
            print(f"[🗣️] Generating Sarvam TTS for directions: {directions_text}")
            url = "https://api.sarvam.ai/text-to-speech"
            headers = {"api-subscription-key": os.getenv("SARVAM_API_KEY"), "Content-Type": "application/json"}
            data = {
                "inputs": [directions_text],
                "target_language_code": "hi-IN",
                "speaker": "meera",
                "pitch": 0,
                "pace": 1.0,
                "loudness": 1.5,
                "speech_sample_rate": 8000,
                "enable_preprocessing": True,
                "model": "bulbul:v1"
            }
            resp = requests.post(url, json=data, headers=headers)
            if resp.status_code == 200:
                audio_b64 = resp.json()["audios"][0]
                audio_bytes = base64.b64decode(audio_b64)
                
                # Save and play
                with open("directions.wav", "wb") as f:
                    f.write(audio_bytes)
                import sounddevice as sd
                import soundfile as sf
                data, fs = sf.read("directions.wav")
                sd.play(data, fs)
                sd.wait()
                print(f"[✅] Directions played to caller.")
        except Exception as e:
            print(f"[⚠] Routing TTS failed: {e}")


# ── Save Recording and Notify Backend ───────────────────────────────────────

def save_recording_and_notify(wav_bytes: bytes, caller_phone: str,
                               transcript: str, session_id: str) -> str:
    """Save WAV file locally and POST metadata to the MSI backend."""
    filename = f"kavach_recording_{session_id[:8]}.wav"
    filepath = os.path.join(RECORDINGS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(wav_bytes)

    # Build URL accessible from MSI via Tailscale
    recording_url = f"http://{MI_TAILSCALE_IP}:8001/{filename}"

    try:
        requests.post(
            f"http://{MSI_IP}:8000/api/recording_complete",
            json={
                "session_id": session_id,
                "recording_url": recording_url,
                "transcript": transcript,
                "caller_phone": caller_phone,
                "duration_seconds": RECORDING_DURATION,
            },
            timeout=5,
        )
        print(f"[📼] Recording saved and backend notified: {filename}")
    except requests.ConnectionError:
        print(f"[📼] Recording saved locally: {filename} (backend unreachable)")
    except Exception as e:
        print(f"[📼] Recording saved: {filename} — backend notify error: {e}")

    return recording_url


# ── Fire KAVACH Pipeline ────────────────────────────────────────────────────

def fire_kavach_pipeline(caller_phone: str, transcript: str,
                          recording_url: str, session_id: str):
    """POST to MSI backend to trigger the full KAVACH pipeline for an incoming call."""
    
    # Notice we do NOT send lat/lon here anymore. 
    # The phone doesn't know where it is; the network does.
    body = {
        "trigger_type": "incoming_call",
        "timestamp": datetime.now().isoformat(),
        "victim_name": "Keypad Caller",
        "victim_phone": caller_phone,
        "caller_phone": caller_phone,
        "audio_b64": "",
        "audio_transcript": transcript,
        "call_recording_url": recording_url,
        "session_id": session_id,
    }

    try:
        resp = requests.post(
            f"http://{MSI_IP}:8000/api/incoming_call",
            json=body,

            timeout=10,
        )
        resp.raise_for_status()
        print(f"[🚀] KAVACH pipeline triggered for incoming call from {caller_phone}")
    except requests.ConnectionError:
        print(f"[⚠] Backend unreachable — pipeline trigger failed for {caller_phone}")
    except Exception as e:
        print(f"[⚠] Pipeline trigger error: {e}")


# ── Speak Confirmation into Call ────────────────────────────────────────────

def speak_confirmation_into_call():
    """Speak a brief TTS confirmation message into the call via VB-Cable."""
    engine = pyttsx3.init()
    engine.setProperty("rate", 150)
    engine.setProperty("volume", 1.0)
    engine.say(
        "KAVACH emergency response activated. "
        "Police have been alerted. "
        "Stay on the line."
    )
    engine.runAndWait()
    print("[🔊] Confirmation spoken into call.")


# ── End Call Logic (borrowed from SAATHI — 5 retries) ───────────────────────

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


# ── Generate Call Hash ──────────────────────────────────────────────────────

def generate_call_hash(prefix: str, phone: str) -> str:
    """Generate a unique SHA-256 session hash for a call."""
    raw = f"{prefix}|{phone}|{datetime.now().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Main Loop ───────────────────────────────────────────────────────────────

def main():
    """Main incoming call handler loop."""

    # Import recording_manager to start the static file server
    try:
        import recording_manager  # noqa: F401 — starts server on import
    except ImportError:
        print("[⚠] recording_manager not found — recordings won't be served over HTTP")

    # Startup banner
    print("=" * 60)
    print("  KAVACH INCOMING CALL HANDLER — ONLINE")
    print("  Waiting for keypad phone calls on iPhone #1...")
    print(f"  Recording: {RECORDING_DURATION}s audio → Groq Whisper → KAVACH pipeline")
    print(f"  Backend: http://{MSI_IP}:8000")
    print("=" * 60)
    print()

    while True:
        print("[📞] Waiting for incoming call from keypad phone...")

        # Block until call is accepted
        caller_id = wait_for_incoming_call()

        session_id = generate_call_hash("INC", caller_id)
        print(f"[🔑] Session: {session_id[:12]}...")

        # Speak confirmation immediately
        speak_confirmation_into_call()

        # Record ambient audio (evidence)
        wav_bytes = record_ambient_audio(duration_seconds=RECORDING_DURATION)

        # Transcribe with Sarvam
        transcript = transcribe_with_sarvam(wav_bytes)
        print(f"[📝] Transcript: {transcript[:120]}...")

        # Save and upload recording
        recording_url = save_recording_and_notify(
            wav_bytes, caller_id, transcript, session_id
        )

        # Fire KAVACH pipeline
        fire_kavach_pipeline(caller_id, transcript, recording_url, session_id)

        # Play interactive route instructions if applicable
        play_routing_audio(transcript)

        # Hold briefly, then end call
        print(f"[⏳] Holding {POST_CALL_HOLD}s before ending call...")
        time.sleep(POST_CALL_HOLD)
        end_call_logic()

        print(f"[✅] Incoming call processed. Session: {session_id[:8]}")
        print(f"     Caller: {caller_id}")
        print(f"     Time: {datetime.now().strftime('%H:%M:%S')}")
        print()


if __name__ == "__main__":
    main()
