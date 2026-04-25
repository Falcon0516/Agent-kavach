import json, os
QUEUE_FILE = os.path.join(os.path.dirname(__file__), "..", "outbound_queue.json")

def add_to_call_queue(phone_number: str, threat_data: dict = None):
    try:
        queue = []
        if os.path.exists(QUEUE_FILE):
            with open(QUEUE_FILE) as f: queue = json.load(f)
        queue.append({"number": phone_number, "threat_data": threat_data or {}})
        with open(QUEUE_FILE, "w") as f: json.dump(queue, f)
        return True
    except Exception as e:
        print(f"[CALL_QUEUE] Error: {e}")
        return False

def clear_call_queue():
    with open(QUEUE_FILE, "w") as f: json.dump([], f)
