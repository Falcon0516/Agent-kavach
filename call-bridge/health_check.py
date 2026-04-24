import os
import sys
import json
import requests
import pyttsx3
import websocket
from dotenv import load_dotenv

load_dotenv()

MSI_IP = os.getenv("MSI_TAILSCALE_IP", "127.0.0.1")

def main():
    print("Running KAVACH Health Check...")
    fails = []
    
    def report(name, condition, error_msg=""):
        if condition:
            print(f"[PASS] {name}")
        else:
            print(f"[FAIL] {name} - {error_msg}")
            fails.append(name)
            
    # 1. MSI Backend
    try:
        r = requests.get(f"http://{MSI_IP}:8000/", timeout=3)
        report("MSI Backend", r.status_code == 200, f"Status Code: {r.status_code}")
    except Exception as e:
        report("MSI Backend", False, str(e))
        
    # 2. WebSocket
    try:
        ws = websocket.create_connection(f"ws://{MSI_IP}:8000/ws/thoughts", timeout=3)
        ws.close()
        report("WebSocket", True)
    except Exception as e:
        report("WebSocket", False, str(e))
        
    # 3. Call Queue Endpoint
    try:
        r = requests.get(f"http://{MSI_IP}:8000/api/get_call_queue", timeout=3)
        report("Call Queue Endpoint", r.status_code == 200, f"Status Code: {r.status_code}")
    except Exception as e:
        report("Call Queue Endpoint", False, str(e))
        
    # 4. Map Data Endpoint
    try:
        r = requests.get(f"http://{MSI_IP}:8000/api/map_data", timeout=3)
        report("Map Data Endpoint", r.status_code == 200, f"Status Code: {r.status_code}")
    except Exception as e:
        report("Map Data Endpoint", False, str(e))
        
    # 5. Firebase API
    try:
        r = requests.get(f"http://{MSI_IP}:8000/api/threat_zones", timeout=3)
        report("Firebase API", r.status_code == 200, f"Status Code: {r.status_code}")
    except Exception as e:
        report("Firebase API", False, str(e))
        
    # 6. TTS Engine
    try:
        engine = pyttsx3.init()
        engine.say("")
        engine.runAndWait()
        report("TTS Engine", True)
    except Exception as e:
        report("TTS Engine", False, str(e))
        
    # 7. pyautogui Screenshots
    screens_dir = os.path.join(os.path.dirname(__file__), "screenshots")
    if os.path.exists(screens_dir) and "accept_button.png" in os.listdir(screens_dir):
        report("pyautogui Screenshots", True)
    else:
        report("pyautogui Screenshots", False, "Missing screenshots folder or accept_button.png")
        
    # 8. Recordings Dir
    recordings_dir = os.path.join(os.path.dirname(__file__), "recordings")
    report("Recordings Dir", os.path.exists(recordings_dir), "Folder missing")
    
    # 9. outbound_queue.json
    queue_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "outbound_queue.json"))
    try:
        if os.path.exists(queue_path):
            with open(queue_path) as f:
                json.load(f)
            report("outbound_queue.json", True)
        else:
            report("outbound_queue.json", False, f"File missing at {queue_path}")
    except Exception as e:
        report("outbound_queue.json", False, f"Invalid JSON ({e})")
        
    # 10. VB-Cable Note
    print("[NOTE] VB-Cable: Manually verify Windows Sound → Default = CABLE Input")
    
    print("\n")
    if not fails:
        print("━━ ALL SYSTEMS GO — DEMO READY ━━")
        sys.exit(0)
    else:
        print("━━ ISSUES DETECTED — FIX BEFORE DEMO ━━")
        print("\n".join(f"- {f}" for f in fails))
        sys.exit(1)

if __name__ == "__main__":
    main()
