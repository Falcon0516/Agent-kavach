import threading, json, os, base64, re, logging
try:
    import cv2
except ImportError:
    cv2 = None
try:
    import httpx
except ImportError:
    httpx = None
from tools.location_tool import haversine
from tools.call_queue_tool import add_to_call_queue

logger = logging.getLogger("kavach.argus")

# GLOBALS
active_detections = {}
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml') if cv2 else None
yolo_model = None
ocr_reader = None

OPENROUTER_KEY = os.getenv("OPENROUTER_KEY", "")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")

def get_yolo():
    global yolo_model
    if yolo_model is None:
        try:
            from ultralytics import YOLO
            yolo_model = YOLO("yolov8n.pt")
        except ImportError:
            logger.warning("ultralytics not installed — YOLO disabled")
            return None
    return yolo_model

def get_ocr():
    global ocr_reader
    if ocr_reader is None:
        try:
            import easyocr
            ocr_reader = easyocr.Reader(['en'], gpu=False)
        except ImportError:
            logger.warning("easyocr not installed — OCR disabled")
            return None
    return ocr_reader

INDIAN_PLATE_PATTERN = re.compile(r'[A-Z]{2}\s*\d{2}\s*[A-Z]{1,2}\s*\d{4}')
THREAT_CLASSES = {"knife", "scissors", "baseball bat", "bottle", "gun", "pistol", "rifle"}
PERSON_CLASS = "person"

def analyze_frame(frame):
    h, w = frame.shape[:2]
    results = {"faces": 0, "plates": [], "objects": [], "group_threat": False}
    
    yolo = get_yolo()
    if yolo:
        yolo_results = yolo(frame, verbose=False)[0]
    else:
        yolo_results = None
    
    person_boxes = []
    if yolo_results:
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
                cv2.putText(frame, f"âš  {cls_name.upper()}", (x1, y1-10),
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
    import time
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        logger.warning(f"[ARGUS] {node_id}: Cannot open stream {stream_url}")
    frame_count = 0
    consecutive_errors = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            consecutive_errors += 1
            if consecutive_errors > 10:
                logger.warning(f"[ARGUS] {node_id}: Reconnecting after {consecutive_errors} errors...")
                cap.release()
                time.sleep(3)
                cap = cv2.VideoCapture(stream_url)
                consecutive_errors = 0
            else:
                time.sleep(1)
            continue
        consecutive_errors = 0
        frame_count += 1
        if frame_count % 5 != 0:
            continue
        try:
            # Try full analysis if YOLO + face cascade available
            yolo = get_yolo()
            if yolo and face_cascade is not None:
                results, annotated = analyze_frame(frame.copy())
                _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 60])
                active_detections[node_id] = {
                    "faces": results["faces"], "frame_b64": base64.b64encode(buf).decode(),
                    "plates": results["plates"], "objects": results["objects"],
                    "group_threat": results["group_threat"]
                }
            elif face_cascade is not None:
                # Face detection only (no YOLO)
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                for (x, y, fw, fh) in faces:
                    cv2.rectangle(frame, (x, y), (x+fw, y+fh), (0, 255, 0), 2)
                    cv2.putText(frame, "SUSPECT", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                active_detections[node_id] = {
                    "faces": len(faces), "frame_b64": base64.b64encode(buf).decode(),
                    "plates": [], "objects": [], "group_threat": False
                }
            else:
                # Raw frame passthrough (no analysis libraries)
                _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                active_detections[node_id] = {
                    "faces": 0, "frame_b64": base64.b64encode(buf).decode(),
                    "plates": [], "objects": [], "group_threat": False
                }
        except Exception as e:
            # Fallback: still capture raw frame for streaming
            try:
                _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                active_detections[node_id] = {
                    "faces": 0, "frame_b64": base64.b64encode(buf).decode(),
                    "plates": [], "objects": [], "group_threat": False
                }
            except:
                pass
    cap.release()

def start_all_streams():
    """Start threads for all nodes in argus_nodes.json if not already running."""
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "argus_nodes.json")
    try:
        with open(data_path) as f:
            nodes = json.load(f)
        for node in nodes:
            if node["node_id"] not in active_detections and node.get("status") == "active":
                logger.info(f"[ARGUS] Starting background stream for {node['node_id']}...")
                threading.Thread(target=detect_stream, args=(node["node_id"], node["stream_url"]), daemon=True).start()
    except Exception as e:
        logger.error(f"[ARGUS] Failed to start streams on startup: {e}")

async def argus_node(state):
    _thought("argus", "Scanning for nearby camera nodes...")
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "argus_nodes.json")
    with open(data_path) as f: nodes = json.load(f)
    
    lat, lon = state.get("gps_lat", 13.0827), state.get("gps_lon", 77.5877)
    activated, first_frame_b64 = [], None
    
    for node in nodes:
        dist = haversine(lat, lon, node["lat"], node["lon"])
        if dist < 1000 or not activated:
            activated.append(node["node_id"])
            _thought("argus", f"Activating {node['name']} ({node['node_id']}) — {dist:.0f}m")
            if node["node_id"] not in active_detections:
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
        _thought("argus", "Running scene analysis via vision LLM...")
        scene_text = await get_scene_analysis(first_frame_b64)
    
    threat_data = {
        "level": state.get("threat_level", 4), "location": f"{lat:.4f}, {lon:.4f}",
        "plates": all_plates, "objects": all_objects, "group": any_group
    }
    add_to_call_queue(os.getenv("POLICE_COMMAND_PHONE", ""), threat_data)
    _thought("argus", f"COMPLETE — {len(activated)} nodes, queue added")
    
    updates = {
        "argus_nodes_activated": activated,
        "face_detected": sum(active_detections.get(n,{}).get("faces",0) for n in activated) > 0,
        "plate_detected": list(set(all_plates)),
        "threat_objects": list(set(all_objects)),
        "scene_analysis": scene_text,
        "group_threat": any_group,
        "call_queued": True,
        "completed_agents": ["argus"]
    }
    return updates
