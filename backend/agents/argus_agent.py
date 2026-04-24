import cv2, threading, json, os, base64, re
from ultralytics import YOLO
import easyocr
import httpx
from tools.location_tool import haversine
from tools.call_queue_tool import add_to_call_queue

# GLOBALS
active_detections = {}
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
yolo_model = None
ocr_reader = None

OPENROUTER_KEY = os.getenv("OPENROUTER_KEY", "")

def push_thought(agent, msg):
    print(f"[{agent.upper()}] {msg}")

def get_yolo():
    global yolo_model
    if yolo_model is None: yolo_model = YOLO("yolov8n.pt")
    return yolo_model

def get_ocr():
    global ocr_reader
    if ocr_reader is None: ocr_reader = easyocr.Reader(['en'], gpu=False)
    return ocr_reader

INDIAN_PLATE_PATTERN = re.compile(r'[A-Z]{2}\s*\d{2}\s*[A-Z]{1,2}\s*\d{4}')
THREAT_CLASSES = {"knife", "scissors", "baseball bat", "bottle", "gun", "pistol", "rifle"}
PERSON_CLASS = "person"

def analyze_frame(frame):
    h, w = frame.shape[:2]
    results = {"faces": 0, "plates": [], "objects": [], "group_threat": False}
    
    yolo = get_yolo()
    yolo_results = yolo(frame, verbose=False)[0]
    
    person_boxes = []
    for box in yolo_results.boxes:
        cls_name = yolo_model.names[int(box.cls)]
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        if conf < 0.4: continue
        if cls_name == PERSON_CLASS:
            person_boxes.append((x1, y1, x2, y2))
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
        elif cls_name in THREAT_CLASSES:
            results["objects"].append(cls_name)
            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,0,255), 3)
            cv2.putText(frame, f"⚠ {cls_name.upper()}", (x1, y1-10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)
    
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    results["faces"] = max(len(faces), len(person_boxes))
    for (x,y,fw,fh) in faces:
        cv2.rectangle(frame, (x,y), (x+fw,y+fh), (0,255,0), 2)
        cv2.putText(frame, "SUSPECT", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 2)
    
    if results["faces"] >= 3:
        cx, cy = w//2, h//2
        nearby = sum(1 for (x1,y1,x2,y2) in person_boxes
                     if abs((x1+x2)//2 - cx) < w//3 and abs((y1+y2)//2 - cy) < h//3)
        if nearby >= 2 or results["faces"] >= 3:
            results["group_threat"] = True
            cv2.putText(frame, "⚠ GROUP THREAT", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,165,255), 3)
    
    ocr = get_ocr()
    ocr_results = ocr.readtext(frame)
    for (bbox, text, prob) in ocr_results:
        if prob < 0.5: continue
        clean = text.upper().replace(" ","")
        if INDIAN_PLATE_PATTERN.search(clean):
            plate_text = clean[:10]
            results["plates"].append(plate_text)
            pts = [[int(p[0]), int(p[1])] for p in bbox]
            import numpy as np
            cv2.polylines(frame, [np.array(pts)], True, (0,0,255), 2)
            cv2.putText(frame, f"PLATE: {plate_text}", (pts[0][0], pts[0][1]-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
    
    return results, frame

async def get_scene_analysis(frame_b64: str) -> str:
    if not OPENROUTER_KEY: return ""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_KEY}", "HTTP-Referer": "https://kavach-ai.demo", "X-Title": "KAVACH"},
                json={
                    "model": "google/gemini-flash-1.5:free",
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{frame_b64}"}},
                            {"type": "text", "text": "Safety assessment in ONE sentence (max 15 words): Is there a woman being surrounded or threatened? Describe the situation briefly."}
                        ]
                    }],
                    "max_tokens": 50
                }
            )
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[ARGUS] Scene analysis failed: {e}")
        return ""

def detect_stream(node_id: str, stream_url: str):
    cap = cv2.VideoCapture(stream_url)
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            import time; time.sleep(2); cap = cv2.VideoCapture(stream_url); continue
        frame_count += 1
        if frame_count % 3 != 0: continue
        try:
            results, annotated = analyze_frame(frame.copy())
            _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 60])
            active_detections[node_id] = {
                "faces": results["faces"], "frame_b64": base64.b64encode(buf).decode(),
                "plates": results["plates"], "objects": results["objects"], "group_threat": results["group_threat"]
            }
        except: pass
    cap.release()

async def argus_node(state):
    push_thought("argus", "Scanning for nearby camera nodes...")
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "argus_nodes.json")
    with open(data_path) as f: nodes = json.load(f)
    
    lat, lon = state.get("gps_lat", 13.0827), state.get("gps_lon", 77.5877)
    activated, first_frame_b64 = [], None
    
    for node in nodes:
        dist = haversine(lat, lon, node["lat"], node["lon"])
        if dist < 1000 or not activated:
            activated.append(node["node_id"])
            push_thought("argus", f"Activating {node['name']} ({node['node_id']}) — {dist:.0f}m")
            threading.Thread(target=detect_stream, args=(node["node_id"], node["stream_url"]), daemon=True).start()
    
    import asyncio
    await asyncio.sleep(2)
    
    all_plates, all_objects, any_group = [], [], False
    for nid in activated:
        if nid in active_detections:
            det = active_detections[nid]
            all_plates.extend(det.get("plates", []))
            all_objects.extend(det.get("objects", []))
            if det.get("group_threat"): any_group = True
            if not first_frame_b64 and det.get("frame_b64"): first_frame_b64 = det["frame_b64"]
    
    scene_text = ""
    if first_frame_b64:
        push_thought("argus", "Running scene analysis via vision LLM...")
        scene_text = await get_scene_analysis(first_frame_b64)
    
    threat_data = {
        "level": state.get("threat_level", 4), "location": f"{lat:.4f}, {lon:.4f}",
        "plates": all_plates, "objects": all_objects, "group": any_group
    }
    add_to_call_queue(os.getenv("POLICE_COMMAND_PHONE", ""), threat_data)
    push_thought("argus", f"COMPLETE — {len(activated)} nodes, queue added")
    
    state.update({
        "argus_nodes_activated": activated, "face_detected": sum(active_detections.get(n,{}).get("faces",0) for n in activated) > 0,
        "plate_detected": list(set(all_plates)), "threat_objects": list(set(all_objects)),
        "scene_analysis": scene_text, "group_threat": any_group, "call_queued": True
    })
    if "completed_agents" not in state: state["completed_agents"] = []
    state["completed_agents"].append("argus")
    return state
