import os
import requests
from dotenv import load_dotenv

load_dotenv()

MSI_IP = os.getenv("MSI_TAILSCALE_IP", "127.0.0.1")

def trigger_demo():
    print("[🚀] Sending manual backup trigger to KAVACH backend...")
    url = f"http://{MSI_IP}:8000/api/manual_trigger"
    try:
        resp = requests.post(url, timeout=5)
        if resp.status_code == 200:
            print("[✅] Pipeline successfully triggered!")
        else:
            print(f"[❌] Failed with status code: {resp.status_code}")
            print(resp.text)
    except Exception as e:
        print(f"[❌] Error reaching backend: {e}")

if __name__ == "__main__":
    trigger_demo()
