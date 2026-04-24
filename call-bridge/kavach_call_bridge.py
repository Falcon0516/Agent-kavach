import os
import time
import json
import requests
import pyttsx3
import threading
import pyautogui
from dotenv import load_dotenv
import callback_detector

load_dotenv()

MSI_IP = os.getenv("MSI_TAILSCALE_IP", "127.0.0.1")
POLICE_PHONE = os.getenv("POLICE_COMMAND_PHONE", "")
CALL_CONNECT_WAIT = int(os.getenv("CALL_CONNECT_WAIT", 5))
CALL_HOLD_AFTER_SPEAK = int(os.getenv("CALL_HOLD_AFTER_SPEAK", 4))
CALLBACK_WAIT_SECONDS = int(os.getenv("CALLBACK_WAIT_SECONDS", 30))

def build_threat_message(threat_data: dict) -> str:
    level = threat_data.get("level", "Unknown")
    summary = threat_data.get("summary", "Emergency alert")
    location = threat_data.get("location", "Unknown location")
    
    group_note = "Group threat detected — multiple suspects. " if threat_data.get("group") else ""
    plates_note = f"Suspect vehicle plate: {threat_data['plates'][0]}. " if threat_data.get("plates") else ""
    objects_note = f"Threat object detected: {threat_data['objects'][0]}. " if threat_data.get("objects") else ""
    
    msg = (f"KAVACH ALERT. KAVACH ALERT. This is the KAVACH AI Safety System. "
           f"Threat level {level} of 5. {summary}. Victim location: {location}. "
           f"{group_note}{plates_note}{objects_note}"
           f"Argus camera evidence is being collected. FIR is being auto-filed. "
           f"Immediate police response required. This is an automated KAVACH alert. Over.")
    return msg

def dial_via_phone_link(phone_number: str):
    print(f"[📞] Dialing {phone_number} via Phone Link...")
    for digit in str(phone_number):
        try:
            btn = pyautogui.locateOnScreen(f"screenshots/{digit}.png", confidence=0.8)
            if btn:
                pyautogui.click(pyautogui.center(btn))
                time.sleep(0.3)
        except pyautogui.ImageNotFoundException:
            print(f"[WARN] Screenshot for digit {digit} not found, skipping.")
    
    try:
        call_btn = pyautogui.locateOnScreen("screenshots/make_call.png", confidence=0.8)
        if call_btn:
            pyautogui.click(pyautogui.center(call_btn))
    except pyautogui.ImageNotFoundException:
        print("[WARN] Screenshot for make_call not found.")

def speak_threat_brief(threat_data: dict):
    print("[🗣] Speaking threat brief into call...")
    engine = pyttsx3.init()
    engine.setProperty("rate", 155)
    engine.setProperty("volume", 1.0)
    voices = engine.getProperty("voices")
    if voices:
        engine.setProperty("voice", voices[0].id)
    engine.say(build_threat_message(threat_data))
    engine.runAndWait()

def end_call_logic():
    print("[📞] Ending call...")
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
    print("[WARN] Could not find end_call_button.png to end call.")

def main():
    print("=" * 60)
    print("  KAVACH CALL BRIDGE — OUTBOUND — ONLINE")
    print(f"  Polling: http://{MSI_IP}:8000/api/get_call_queue")
    print(f"  Police phone: {POLICE_PHONE}")
    print("  VB-Cable must be active for audio routing")
    print("=" * 60)

    while True:
        try:
            url = f"http://{MSI_IP}:8000/api/get_call_queue"
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if "numbers" in data and data["numbers"]:
                    number_info = data["numbers"][0]
                    number = number_info.get("number", POLICE_PHONE)
                    threat_data = number_info.get("threat_data", {})
                    
                    dial_via_phone_link(number)
                    print(f"[📞] Waiting {CALL_CONNECT_WAIT} seconds for call connection...")
                    time.sleep(CALL_CONNECT_WAIT)
                    
                    speak_threat_brief(threat_data)
                    
                    print(f"[📞] Holding call for {CALL_HOLD_AFTER_SPEAK} seconds after brief...")
                    time.sleep(CALL_HOLD_AFTER_SPEAK)
                    
                    end_call_logic()
                    
                    # Start callback detector
                    t = threading.Thread(target=callback_detector.watch_for_callback,
                                         args=(CALLBACK_WAIT_SECONDS,), daemon=True)
                    t.start()
                    
                    print("[✅] Call bridge outbound sequence complete.")
        except requests.ConnectionError:
            print(f"[ERROR] Failed to connect to {MSI_IP}:8000, retrying...")
        except Exception as e:
            print(f"[ERROR] Unexpected error: {e}")
        time.sleep(2)

if __name__ == "__main__":
    main()
