import os
import time
import requests
import pyttsx3
import pyautogui
from dotenv import load_dotenv

load_dotenv()

def watch_for_callback(wait_seconds: int = 30):
    print(f"[📞] Watching for police callback ({wait_seconds}s)...")
    start = time.time()
    
    while time.time() - start < wait_seconds:
        try:
            btn = pyautogui.locateOnScreen("screenshots/accept_button.png", confidence=0.8)
            if btn:
                print("[📞] Police callback detected — auto-answering!")
                pyautogui.click(pyautogui.center(btn))
                time.sleep(2)
                
                print("[🗣] Speaking follow-up brief...")
                engine = pyttsx3.init()
                engine.setProperty("rate", 155)
                engine.say("KAVACH follow-up brief. Victim location unchanged. "
                           "Argus cameras active and recording. FIR has been filed. "
                           "KAVACH system standing by.")
                engine.runAndWait()
                
                time.sleep(3)
                
                # end_call_logic manually integrated here or from elsewhere
                for _ in range(5):
                    try:
                        end_btn = pyautogui.locateOnScreen("screenshots/end_call_button.png", confidence=0.8)
                        if end_btn:
                            pyautogui.click(pyautogui.center(end_btn))
                            print("[📞] Callback handled — follow-up brief delivered.")
                            return
                    except pyautogui.ImageNotFoundException:
                        pass
                    time.sleep(1)
                
                print("[📞] Callback handled — but couldn't find end_call_button.png.")
                return
        except pyautogui.ImageNotFoundException:
            pass
        except Exception as e:
            print(f"[Callback] Error: {e}")
        time.sleep(1)
    
    print(f"[📞] No callback within {wait_seconds}s — monitoring ended.")
