import os
import time
import requests
import hashlib
import threading
import pyautogui
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
MSI_IP = os.getenv("MSI_TAILSCALE_IP", "127.0.0.1")
MI_TAILSCALE_IP = os.getenv("MI_TAILSCALE_IP", "127.0.0.1")  # Notebook IP for server

CURRENT_CALLER_ID = "Unknown Caller"

def extract_caller_id_from_screen() -> str:
    from PIL import ImageGrab
    import pytesseract
    try:
        # Assuming Phone Link caller ID is near top-center. Adjust coordinates as needed.
        # Here we just grab the entire screen or a rough region and look for numbers
        # But for robustness, we'll just try to parse numbers from a middle-top rect
        screen_size = pyautogui.size()
        rect = (screen_size.width//4, 0, screen_size.width*3//4, screen_size.height//4)
        img = ImageGrab.grab(bbox=rect)
        text = pytesseract.image_to_string(img)
        # Extract digits
        digits = ''.join(filter(str.isdigit, text))
        if len(digits) >= 10:
            return digits[-10:]
        return "Keypad Caller (OCR Failed)"
    except Exception as e:
        print(f"[OCR] Error extracting caller ID: {e}")
        return "Keypad Caller"

def wait_for_incoming_call():
    global CURRENT_CALLER_ID
    while True:
        try:
            btn = pyautogui.locateOnScreen("screenshots/accept_button.png", confidence=0.8)
            if btn:
                CURRENT_CALLER_ID = extract_caller_id_from_screen()
                print(f"[📞] Incoming call detected from: {CURRENT_CALLER_ID}")
                pyautogui.click(pyautogui.center(btn))
                time.sleep(2)
                return
        except pyautogui.ImageNotFoundException:
            pass
        except Exception as e:
            print(f"[Wait] Error: {e}")
        time.sleep(0.5)

def record_ambient_audio(duration_seconds: int = 20) -> bytes:
    import sounddevice as sd
    import soundfile as sf
    import io, numpy as np
    
    SAMPLE_RATE = 16000
    print(f"[🎙] Recording ambient audio for {duration_seconds} seconds...")
    try:
        audio_data = sd.rec(int(SAMPLE_RATE * duration_seconds),
                            samplerate=SAMPLE_RATE, channels=1, dtype='float32')
        sd.wait()
        wav_io = io.BytesIO()
        sf.write(wav_io, audio_data, SAMPLE_RATE, format='WAV')
        wav_io.seek(0)
        return wav_io.read()
    except Exception as e:
        print(f"[🎙] Could not record audio: {e}")
        # Return empty dummy bytes if recording fails (e.g. no microphone)
        return b''

def transcribe_with_groq(wav_bytes: bytes) -> str:
    from groq import Groq
    import io
    if not wav_bytes:
        return "Emergency SOS call — audio recording failed"
    groq_key = os.getenv("GROQ_KEY_4")
    if not groq_key:
        return "Emergency SOS call — audio transcription unavailable (Missing key)"
        
    try:
        client = Groq(api_key=groq_key)
        result = client.audio.transcriptions.create(
            file=("recording.wav", io.BytesIO(wav_bytes)),
            model="whisper-large-v3-turbo"
        )
        return result.text.strip()
    except Exception as e:
        print(f"[Whisper] Transcription failed: {e}")
        return "Emergency SOS call — audio transcription unavailable"

def save_recording_and_notify(wav_bytes: bytes, caller_phone: str,
                              transcript: str, session_id: str):
    filename = f"kavach_recording_{session_id[:8]}.wav"
    filepath = os.path.join(os.path.dirname(__file__), "recordings", filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    if wav_bytes:
        with open(filepath, "wb") as f:
            f.write(wav_bytes)
    
    recording_url = f"http://{MI_TAILSCALE_IP}:8001/{filename}"
    try:
        requests.post(f"http://{MSI_IP}:8000/api/recording_complete", json={
            "session_id": session_id,
            "recording_url": recording_url,
            "transcript": transcript,
            "caller_phone": caller_phone,
            "duration_seconds": 20
        }, timeout=5)
    except Exception as e:
        print(f"[📼] Failed to notify recording: {e}")
        
    print(f"[📼] Recording saved: {filename}")
    return recording_url

def fire_kavach_pipeline(caller_phone: str, transcript: str,
                         recording_url: str, session_id: str):
    body = {
        "trigger_type": "incoming_call",
        "lat": 13.0827,
        "lon": 77.5877,
        "timestamp": datetime.now().isoformat(),
        "victim_name": "Keypad Caller",
        "victim_phone": caller_phone,
        "caller_phone": caller_phone,
        "audio_b64": "",
        "call_recording_url": recording_url,
        "audio_transcript": transcript
    }
    try:
        requests.post(f"http://{MSI_IP}:8000/api/incoming_call", json=body, timeout=10)
        print(f"[🚀] KAVACH pipeline triggered for incoming call from {caller_phone}")
    except Exception as e:
        print(f"[🚀] Failed to trigger KAVACH pipeline: {e}")

def speak_confirmation_into_call():
    import pyttsx3
    try:
        engine = pyttsx3.init()
        engine.setProperty("rate", 150)
        engine.say("KAVACH emergency response activated. Police have been alerted. Stay on the line.")
        engine.runAndWait()
    except Exception as e:
        print(f"[🗣] TTS confirmation failed: {e}")

def end_call_logic():
    print("[📞] Ending incoming call...")
    for _ in range(5):
        try:
            btn = pyautogui.locateOnScreen("screenshots/end_call_button.png", confidence=0.8)
            if btn:
                pyautogui.click(pyautogui.center(btn))
                print("[📞] Call ended.")
                return
        except pyautogui.ImageNotFoundException:
            pass
        time.sleep(1)

def main():
    print("=" * 60)
    print("  KAVACH INCOMING CALL HANDLER — ONLINE")
    print("  Waiting for keypad phone calls on iPhone #1...")
    print("  Recording: 20s audio → Groq Whisper → KAVACH pipeline")
    print("=" * 60)

    while True:
        print("[📞] Waiting for incoming call from keypad phone...")
        wait_for_incoming_call()
        
        raw_sig = f"INC|{CURRENT_CALLER_ID}|{datetime.now().isoformat()}"
        session_id = hashlib.sha256(raw_sig.encode()).hexdigest()
        
        speak_confirmation_into_call()
        wav_bytes = record_ambient_audio(duration_seconds=20)
        transcript = transcribe_with_groq(wav_bytes)
        print(f"[📝] Transcript: {transcript}")
        
        recording_url = save_recording_and_notify(wav_bytes, CURRENT_CALLER_ID, transcript, session_id)
        fire_kavach_pipeline(CURRENT_CALLER_ID, transcript, recording_url, session_id)
        
        time.sleep(5)
        end_call_logic()
        
        print(f"[✅] Incoming call processed. Session: {session_id[:8]}")

if __name__ == "__main__":
    main()
