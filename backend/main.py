"""
KAVACH Backend â€” FastAPI Application
All endpoints, WebSocket thought stream, Firebase integration.
Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
import asyncio
import json
import logging
import os
import sys
import time
import uuid
import base64
from datetime import datetime, timezone
from typing import Optional

from tools.telecom_lbs_tool import resolve_location_via_gmlc
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# â”€â”€ Load environment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
load_dotenv()

# â”€â”€ Logging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("kavach.main")

# â”€â”€ Data paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
QUEUE_PATH = os.path.join(BASE_DIR, "outbound_queue.json")

# â”€â”€ FastAPI App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app = FastAPI(
    title="KAVACH Backend",
    description="AI-Agentic Women's Safety Platform â€” Backend API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# GLOBAL STATE
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
current_state: dict = {}
thought_stream: list = []
connected_ws_clients: list = []
recording_store: dict = {}       # {session_id: {url, transcript, timestamp}}
active_threat_zones: list = []   # [{zone_id, lat, lon, flagged_at}]

# â”€â”€ Firebase (optional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
db = None

def _init_firebase():
    """Initialize Firebase Admin SDK from env vars. Non-fatal on failure."""
    global db
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if firebase_admin._apps:
            db = firestore.client()
            return

        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "")
        project_id = os.getenv("FIREBASE_PROJECT_ID", "")

        if not private_key or not project_id:
            logger.info("Firebase credentials not configured â€” running without Firebase")
            return

        cred = credentials.Certificate({
            "type": os.getenv("FIREBASE_TYPE", "service_account"),
            "project_id": project_id,
            "private_key": private_key.replace("\\n", "\n"),
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL", ""),
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        logger.info("Firebase initialized successfully")
    except Exception as e:
        logger.warning(f"Firebase init failed (non-fatal): {e}")
        db = None


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# PUSH THOUGHT â€” broadcasts to all WebSocket clients
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
def push_thought(agent: str, thought: str):
    """Add thought to stream and broadcast to all connected WebSocket clients."""
    entry = {
        "agent": agent,
        "thought": thought,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ms": int(time.time() * 1000),
    }
    thought_stream.append(entry)

    # Update current_state agent_thoughts
    if "agent_thoughts" in current_state:
        current_state["agent_thoughts"].append(entry)

    # Broadcast to all connected WS clients (fire-and-forget)
    for ws_client in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws_client, entry))
        except Exception:
            pass


async def _ws_send(ws: WebSocket, data: dict):
    """Send data to a single WebSocket client, remove on failure."""
    try:
        await ws.send_json(data)
    except Exception:
        if ws in connected_ws_clients:
            connected_ws_clients.remove(ws)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# LANGGRAPH PIPELINE
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
kavach_graph = None


def _get_graph():
    """Lazy-load the LangGraph pipeline."""
    global kavach_graph
    if kavach_graph is None:
        from graph import build_graph
        from agents import wire_push_thought
        wire_push_thought(push_thought)
        kavach_graph = build_graph()
    return kavach_graph


async def run_pipeline(state: dict):
    """Execute the full KAVACH 6-agent pipeline."""
    global current_state
    current_state = state

    try:
        graph = _get_graph()
        config = {"configurable": {"thread_id": state.get("timestamp", str(uuid.uuid4()))}}

        async for event in graph.astream(state, config=config):
            # Merge each node's output into current_state
            for node_name, node_output in event.items():
                if isinstance(node_output, dict):
                    current_state.update(node_output)

        # Pipeline complete
        elapsed = int(time.time() * 1000) - current_state.get("pipeline_start_ms", 0)
        push_thought("pipeline", f"âœ… KAVACH pipeline complete â€” {elapsed}ms total")
        push_thought("pipeline", f"Agents completed: {current_state.get('completed_agents', [])}")

        # Broadcast final state
        for ws_client in connected_ws_clients[:]:
            try:
                asyncio.create_task(_ws_send(ws_client, {
                    "type": "pipeline_complete",
                    "elapsed_ms": elapsed,
                    "state": _safe_serialize(current_state),
                }))
            except Exception:
                pass

    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        push_thought("pipeline", f"âŒ Pipeline error: {str(e)}")
        current_state.setdefault("errors", []).append(str(e))


def _safe_serialize(obj):
    """Make state JSON-serializable."""
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        result = {}
        for k, v in obj.items():
            try:
                json.dumps(v)
                result[k] = v
            except (TypeError, ValueError):
                result[k] = str(v)
        return result


def _build_empty_state(
    trigger_type: str = "sos_button",
    lat: float = 13.0827,
    lon: float = 77.5877,
    timestamp: str = "",
    victim_name: str = "Demo User",
    victim_phone: str = "",
    caller_phone: str = "",
    audio_b64: str = "",
    call_recording_url: str = "",
    audio_source: str = "voice_trigger",
    audio_transcript: str = "",
    location_accuracy_m: int = 0,
    location_source: str = "Device GPS",
) -> dict:
    """Build a zeroed KavachState dict with trigger inputs populated."""
    if not timestamp:
        timestamp = datetime.now(timezone.utc).isoformat()

    return {
        # Trigger input
        "trigger_type": trigger_type,
        "raw_audio_b64": audio_b64,
        "gps_lat": lat,
        "gps_lon": lon,
        "timestamp": timestamp,
        "victim_name": victim_name,
        "victim_phone": victim_phone,
        "caller_phone": caller_phone,
        "location_accuracy_m": location_accuracy_m,
        "location_source": location_source,
        # Audio evidence
        "audio_transcript": audio_transcript,
        "call_recording_url": call_recording_url,
        "audio_source": audio_source,
        # Threat (Agent 01)
        "threat_level": 0,
        "threat_summary": "",
        "threat_context": {},
        "threat_reasoning": "",
        # Family Alert (Agent 02)
        "family_alerted": False,
        "whatsapp_message": "",
        "whatsapp_sid": "",
        "family_reasoning": "",
        # FIR (Agent 03)
        "fir_text": "",
        "ipc_sections": [],
        "fir_case_number": "",
        "fir_reasoning": "",
        # Navigation (Agent 04)
        "nearest_police": {},
        "nearest_hospital": {},
        "nearest_safe_house": {},
        "nav_reasoning": "",
        # Argus (Agent 05)
        "argus_nodes_activated": [],
        "face_detected": False,
        "face_count": 0,
        "plate_detected": [],
        "threat_objects": [],
        "scene_analysis": "",
        "group_threat": False,
        "argus_reasoning": "",
        # NCRB (Agent 06)
        "ncrb_hotspot_match": False,
        "ncrb_context": "",
        "ncrb_reasoning": "",
        "nearest_hotspot": {},
        # Pipeline meta
        "call_queued": False,
        "agent_thoughts": [],
        "completed_agents": [],
        "pipeline_start_ms": 0,
        "errors": [],
    }


# â”€â”€ Helper: read JSON data file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _read_data(filename: str):
    """Read a JSON file from the data directory."""
    filepath = os.path.join(DATA_DIR, filename)
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _read_queue() -> list:
    try:
        with open(QUEUE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write_queue(queue: list):
    with open(QUEUE_PATH, "w", encoding="utf-8") as f:
        json.dump(queue, f, indent=2, ensure_ascii=False)


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# PYDANTIC MODELS
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
class TriggerRequest(BaseModel):
    trigger_type: str = "sos_button"
    lat: float = 13.0827
    lon: float = 77.5877
    timestamp: str = ""
    victim_name: str = "Demo User"
    victim_phone: str = ""
    audio_b64: Optional[str] = ""
    caller_phone: Optional[str] = ""
    call_recording_url: Optional[str] = ""


class IncomingCallRequest(BaseModel):
    caller_phone: str
    trigger_type: str = "incoming_call"
    audio_transcript: str = ""
    call_recording_url: str = ""
    timestamp: str = ""
    session_id: str = ""


class RecordingCompleteRequest(BaseModel):
    session_id: str
    recording_url: str
    transcript: str = ""
    caller_phone: str = ""
    duration_seconds: float = 0


class FlagThreatRequest(BaseModel):
    zone_id: str
    lat: float
    lon: float
    severity: int = 3
    flagged_by: str = "system"


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# ══════════════════════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════════════════════
@app.on_event("startup")
async def startup():
    _init_firebase()
    logger.info("🛡️ KAVACH Backend v2.0 started")
    logger.info(f"Data directory: {DATA_DIR}")
    
    # Start ARGUS camera streams in background
    try:
        from agents.argus_agent import start_all_streams
        asyncio.create_task(asyncio.to_thread(start_all_streams))
    except Exception as e:
        logger.warning(f"Failed to start camera streams: {e}")


# ══════════════════════════════════════════════════════════════════════
# ENDPOINTS

# â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/")
async def health():
    return {
        "status": "operational",
        "service": "KAVACH Backend",
        "version": "2.0.0",
        "agents": 6,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/heartbeat")
async def heartbeat():
    """PWA Guardian app heartbeat — returns OK with timestamp."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Safe Walk endpoints ──────────────────────────────────────
safe_walk_sessions = {}

@app.post("/api/safe_walk_ping")
async def safe_walk_ping(req: dict = {}):
    """Receive periodic GPS pings from SafeWalk mode."""
    lat = req.get("lat", 0)
    lon = req.get("lon", 0)
    dest = req.get("destination", "")
    elapsed = req.get("elapsed_seconds", 0)
    eta = req.get("eta_minutes", 15)
    
    session_key = f"walk_{dest}"
    safe_walk_sessions[session_key] = {
        "lat": lat, "lon": lon, "destination": dest,
        "elapsed": elapsed, "eta_minutes": eta,
        "last_ping": datetime.now(timezone.utc).isoformat()
    }
    
    # Check if ETA exceeded
    if elapsed > (eta + 5) * 60:
        logger.warning(f"[SafeWalk] ETA exceeded for {dest} — auto-escalation may trigger")
    
    return {"status": "ok", "tracked_sessions": len(safe_walk_sessions)}


@app.post("/api/safe_walk_end")
async def safe_walk_end(req: dict = {}):
    """Receive SafeWalk end notification."""
    reason = req.get("reason", "manual")
    dest = req.get("destination", "")
    logger.info(f"[SafeWalk] Walk ended: {dest} — reason: {reason}")
    session_key = f"walk_{dest}"
    safe_walk_sessions.pop(session_key, None)
    return {"status": "ok", "reason": reason}


@app.post("/api/audio_chunk")
async def audio_chunk():
    """Receive audio chunk from PWA for evidence recording."""
    # In production, save to cloud storage
    logger.info("[Audio] Audio chunk received for evidence")
    return {"status": "ok"}


# â”€â”€ WebSocket thought stream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.websocket("/ws/thoughts")
async def ws_thoughts(ws: WebSocket):
    await ws.accept()
    connected_ws_clients.append(ws)
    logger.info(f"WebSocket client connected ({len(connected_ws_clients)} total)")
    try:
        while True:
            # Keep alive â€” wait for client messages or disconnect
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in connected_ws_clients:
            connected_ws_clients.remove(ws)
        logger.info(f"WebSocket client disconnected ({len(connected_ws_clients)} remaining)")


# â”€â”€ Call Queue Endpoint (For Call Bridge) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/get_call_queue")
async def get_call_queue():
    """Endpoint for the Call Bridge to poll pending outbound calls."""
    try:
        if os.path.exists(QUEUE_PATH):
            with open(QUEUE_PATH, "r") as f:
                queue = json.load(f)
            if queue:
                # Clear queue after fetching to prevent duplicate calls
                with open(QUEUE_PATH, "w") as f:
                    json.dump([], f)
                return {"queue": queue}
    except Exception as e:
        logger.error(f"Error reading call queue: {e}")
    return {"queue": []}


# â”€â”€ POST /api/trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/trigger")
async def trigger(req: TriggerRequest):
    global thought_stream
    thought_stream = []

    state = _build_empty_state(
        trigger_type=req.trigger_type,
        lat=req.lat,
        lon=req.lon,
        timestamp=req.timestamp,
        victim_name=req.victim_name,
        victim_phone=req.victim_phone,
        caller_phone=req.caller_phone or "",
        audio_b64=req.audio_b64 or "",
        call_recording_url=req.call_recording_url or "",
    )

    session_id = req.timestamp or datetime.now(timezone.utc).isoformat()

    asyncio.create_task(run_pipeline(state))

    # Broadcast trigger event
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {"type": "trigger", "session_id": session_id}))
        except Exception:
            pass

    return {"status": "pipeline_started", "session_id": session_id}


@app.post("/api/incoming_call")
async def incoming_call(request: Request):
    """Triggered when the Call Bridge detects an incoming keypad phone call."""
    from fastapi import Request
    body = await request.json()
    caller_phone = body.get("caller_phone", "Unknown")
    
    # 1. Ask the Telecom Network where the phone is
    network_location = await resolve_location_via_gmlc(caller_phone)

    # 2. Build the KAVACH state dynamically
    state = _build_empty_state(
        trigger_type="incoming_call",
        lat=network_location["lat"],
        lon=network_location["lon"],
        timestamp=body.get("timestamp"),
        victim_name="Keypad Caller",
        victim_phone=caller_phone,
        caller_phone=caller_phone,
        audio_transcript=body.get("audio_transcript", ""),
        call_recording_url=body.get("call_recording_url", ""),
        location_accuracy_m=network_location["accuracy_m"],
        location_source=network_location["source"],
    )
    
    global current_state
    current_state = dict(state)
    
    # 3. Stream a special thought to the dashboard to show the LBS tech working
    await push_thought("supervisor", f"📡 Telecom GMLC resolved location via TDOA (Accuracy: ±{network_location['accuracy_m']}m)")

    asyncio.create_task(run_pipeline(state))
    return {"status": "pipeline_started", "location_source": network_location["source"]}


# â”€â”€ GET /api/full_state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/full_state")
async def full_state():
    from agents.argus_agent import active_detections
    
    state = _safe_serialize(current_state) if current_state else {"status": "no_active_session"}
    
    # Inject live camera feed metadata for the dashboard
    feeds = []
    for nid, data in active_detections.items():
        feeds.append({
            "id": nid,
            "active": True,
            "face_detected": data.get("faces", 0) > 0,
            "face_count": data.get("faces", 0),
            "group_threat": data.get("group_threat", False),
            "plate_detected": data.get("plates", []),
            "threat_objects": data.get("objects", []),
            "scene_analysis": current_state.get("scene_analysis", "") if nid in current_state.get("argus_nodes_activated", []) else ""
        })
    
    # If no active detections, look at argus_nodes.json for standby nodes
    if not feeds:
        nodes = _read_data("argus_nodes.json")
        for node in nodes:
            feeds.append({
                "id": node["node_id"],
                "active": False,
                "name": node["name"]
            })
            
    state["camera_feeds"] = feeds[:2] # Dashboard supports 2 slots
    return state


# â”€â”€ GET /api/get_call_queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/get_call_queue")
async def get_call_queue():
    queue = _read_queue()
    if queue:
        entry = queue.pop(0)
        _write_queue(queue)
        return {
            "numbers": entry.get("numbers", []),
            "threat_data": entry.get("threat_data", {}),
        }
    return {"numbers": [], "threat_data": {}}


# â”€â”€ GET /api/camera_frames â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/camera_frames")
async def camera_frames():
    return {
        "nodes_activated": current_state.get("argus_nodes_activated", []),
        "face_detected": current_state.get("face_detected", False),
        "face_count": current_state.get("face_count", 0),
        "plate_detected": current_state.get("plate_detected", []),
        "threat_objects": current_state.get("threat_objects", []),
        "scene_analysis": current_state.get("scene_analysis", ""),
    }


@app.get("/api/camera/{node_id}/stream")
async def camera_stream(node_id: str):
    """Serve an MJPEG stream for a specific ARGUS node."""
    from agents.argus_agent import active_detections
    
    async def generate():
        while True:
            if node_id in active_detections:
                frame_data = active_detections[node_id].get("frame_b64", "")
                if frame_data:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + base64.b64decode(frame_data) + b'\r\n')
            await asyncio.sleep(0.1)
            
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


# â”€â”€ POST /api/incoming_call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/incoming_call")
async def incoming_call(req: IncomingCallRequest):
    global thought_stream
    thought_stream = []

    # Resolve location via Telecom LBS (GMLC) â€” keypad phones don't send GPS
    push_thought("supervisor", f"ðŸ“¡ Resolving caller location via Telecom GMLC for {req.caller_phone}...")
    try:
        from tools.telecom_lbs_tool import resolve_location_via_gmlc
        network_location = await resolve_location_via_gmlc(req.caller_phone)
        lat = network_location["lat"]
        lon = network_location["lon"]
        accuracy = network_location["accuracy_m"]
        push_thought("supervisor", f"ðŸ“¡ Telecom GMLC resolved location via TDOA (Accuracy: Â±{accuracy}m)")
    except Exception as e:
        logger.warning(f"GMLC resolution failed: {e} â€” using KSIT defaults")
        lat, lon, accuracy = 13.0827, 77.5877, 200
        push_thought("supervisor", "ðŸ“¡ GMLC fallback â€” using base station default location")

    state = _build_empty_state(
        trigger_type="incoming_call",
        lat=lat,
        lon=lon,
        timestamp=req.timestamp or datetime.now(timezone.utc).isoformat(),
        victim_name="Incoming Caller",
        caller_phone=req.caller_phone,
        call_recording_url=req.call_recording_url,
        audio_source="incoming_call",
        audio_transcript=req.audio_transcript,
    )
    # Store GMLC metadata in state for dashboard display
    state["location_method"] = "TDOA / Timing Advance"
    state["location_accuracy_m"] = accuracy
    state["location_source"] = "Telecom LBS Gateway"

    asyncio.create_task(run_pipeline(state))
    return {"status": "pipeline_started", "location_method": "GMLC_TDOA", "accuracy_m": accuracy}


# â”€â”€ POST /api/recording_complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/recording_complete")
async def recording_complete(req: RecordingCompleteRequest):
    recording_store[req.session_id] = {
        "url": req.recording_url,
        "transcript": req.transcript,
        "caller_phone": req.caller_phone,
        "duration_seconds": req.duration_seconds,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Update current state if session matches
    if current_state:
        current_state["call_recording_url"] = req.recording_url

    # Broadcast to WS clients
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {
                "type": "recording_complete",
                "session_id": req.session_id,
                "url": req.recording_url,
                "duration": req.duration_seconds,
            }))
        except Exception:
            pass

    return {"status": "ok"}


# â”€â”€ GET /api/recordings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/recordings")
async def get_recordings():
    return [
        {"session_id": sid, **data}
        for sid, data in recording_store.items()
    ]


# â”€â”€ GET /api/trace_call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/trace_call")
async def trace_call(phone: str = Query(..., description="Phone number to trace")):
    return {
        "caller": phone,
        "tower_id": "BNG-KA-0472",
        "tower_location": {"lat": 13.0827, "lon": 77.5877},
        "accuracy_radius_m": 150,
        "network_provider": "Jio",
        "trace_timestamp": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Location derived via Cell Tower ID â€” legal trace requires "
            "network provider cooperation and court order"
        ),
        "disclaimer": "DEMO DATA â€” for demonstration purposes only",
    }


# â”€â”€ POST /api/flag_threat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/flag_threat")
async def flag_threat(req: FlagThreatRequest):
    zone_data = {
        "zone_id": req.zone_id,
        "lat": req.lat,
        "lon": req.lon,
        "severity": req.severity,
        "flagged_by": req.flagged_by,
        "flagged_at": datetime.now(timezone.utc).isoformat(),
    }

    active_threat_zones.append(zone_data)

    # Firebase write (non-fatal)
    if db:
        try:
            db.collection("threat_zones").add(zone_data)
        except Exception as e:
            logger.warning(f"Firebase write failed (non-fatal): {e}")

    # Broadcast to WS
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {
                "type": "threat_zone_flagged",
                "data": zone_data,
            }))
        except Exception:
            pass

    return {"status": "flagged", "zone_id": req.zone_id}


# â”€â”€ GET /api/threat_zones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/threat_zones")
async def get_threat_zones():
    return active_threat_zones


# â”€â”€ GET /api/map_data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.get("/api/map_data")
async def map_data():
    return {
        "police_stations": _read_data("police_stations.json"),
        "hospitals": _read_data("hospitals.json"),
        "safe_houses": _read_data("safe_houses.json"),
        "argus_nodes": _read_data("argus_nodes.json"),
        "safe_zones": _read_data("safe_zones.json"),
        "ncrb_hotspots": _read_data("ncrb_hotspots.json"),
    }


# â”€â”€ POST /api/sms_trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/sms_trigger")
async def sms_trigger(From: str = Form(""), Body: str = Form("")):
    """Twilio SMS webhook â€” woman sends SMS from keypad phone."""
    global thought_stream
    thought_stream = []

    caller_phone = From
    body = Body.strip()

    # Parse GPS from body if present (format: "LAT,LON")
    lat, lon = 13.0827, 77.5877  # KSIT defaults
    if body and "," in body:
        try:
            parts = body.split(",")
            parsed_lat = float(parts[0].strip())
            parsed_lon = float(parts[1].strip())
            if 12.0 <= parsed_lat <= 14.0 and 77.0 <= parsed_lon <= 79.0:
                lat, lon = parsed_lat, parsed_lon
        except (ValueError, IndexError):
            pass

    state = _build_empty_state(
        trigger_type="sms",
        lat=lat,
        lon=lon,
        timestamp=datetime.now(timezone.utc).isoformat(),
        victim_name="SMS User",
        caller_phone=caller_phone,
        audio_source="sms_trigger",
        audio_transcript=body or "Emergency SOS via SMS",
    )

    asyncio.create_task(run_pipeline(state))

    # Send reply SMS
    try:
        from tools.whatsapp_tool import send_sms
        asyncio.create_task(
            send_sms(caller_phone, "KAVACH activated. Help is on the way. Stay safe.")
        )
    except Exception as e:
        logger.warning(f"SMS reply failed: {e}")

    # Return TwiML response
    from fastapi.responses import Response
    twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>KAVACH activated. Stay safe.</Message></Response>'
    return Response(content=twiml, media_type="application/xml")


# â”€â”€ POST /api/manual_trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/manual_trigger")
async def manual_trigger():
    """Hardcoded KSIT Bengaluru trigger for demo."""
    global thought_stream
    thought_stream = []

    state = _build_empty_state(
        trigger_type="keyboard",
        lat=13.0827,
        lon=77.5877,
        victim_name="Demo User",
        audio_transcript="Emergency SOS activated via manual trigger",
    )

    session_id = datetime.now(timezone.utc).isoformat()
    asyncio.create_task(run_pipeline(state))

    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {"type": "trigger", "session_id": session_id}))
        except Exception:
            pass

    return {"status": "pipeline_started", "session_id": session_id}


# â”€â”€ POST /api/reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/reset")
async def reset():
    global current_state, thought_stream, active_threat_zones
    current_state = {}
    thought_stream = []
    active_threat_zones = []

    # Reset queue
    _write_queue([])

    # Clear Firebase threat_zones (optional)
    if db:
        try:
            docs = db.collection("threat_zones").stream()
            for doc in docs:
                doc.reference.delete()
        except Exception as e:
            logger.warning(f"Firebase clear failed (non-fatal): {e}")

    # Broadcast reset
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {"type": "reset"}))
        except Exception:
            pass

    return {"status": "reset_complete"}


# â”€â”€ POST /api/audio_chunk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@app.post("/api/audio_chunk")
async def audio_chunk(
    session_id: str = Form(""),
    timestamp: str = Form(""),
):
    """Receive an audio chunk and compute vocal threat features."""
    import struct
    import math

    # For demo: generate realistic-looking vocal threat features
    # In production this would use librosa on the actual audio blob
    pitch = round(180 + 120 * (0.5 + 0.5 * math.sin(time.time())), 1)  # Hz
    jitter = round(0.01 + 0.04 * abs(math.sin(time.time() * 1.3)), 4)
    shimmer = round(0.02 + 0.06 * abs(math.cos(time.time() * 0.9)), 4)
    energy = round(40 + 30 * abs(math.sin(time.time() * 0.7)), 1)

    # Threat score calculation
    pitch_score = min(30, max(0, (pitch - 250) / 5))  # high pitch variance
    jitter_score = min(20, max(0, jitter * 500))        # high jitter
    shimmer_score = min(25, max(0, shimmer * 400))      # high shimmer/energy
    energy_score = min(25, max(0, (energy - 50) / 2))   # high energy
    threat_score = int(min(100, pitch_score + jitter_score + shimmer_score + energy_score))

    analysis = {
        "session_id": session_id,
        "threat_score": threat_score,
        "pitch": pitch,
        "jitter": jitter,
        "shimmer": shimmer,
        "energy": energy,
        "timestamp": timestamp or datetime.now(timezone.utc).isoformat(),
    }

    # Write to Firebase if available
    if db:
        try:
            db.collection("audio_analysis").document(session_id or "latest").set(analysis)
        except Exception as e:
            logger.warning(f"Firebase audio_analysis write failed: {e}")

    # Broadcast to WebSocket clients
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {"type": "audio_analysis", "data": analysis}))
        except Exception:
            pass

    push_thought("evidence", f"ðŸŽ¤ Audio threat score: {threat_score}/100 (pitch={pitch}Hz, jitter={jitter})")

    return analysis


# â”€â”€ Safe Walk Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
safe_walk_sessions: dict = {}  # {user_id: {route, destination, eta, start_time}}


class SafeWalkPing(BaseModel):
    lat: float
    lon: float
    destination: str = ""
    eta_minutes: int = 15
    elapsed_seconds: int = 0


class SafeWalkEnd(BaseModel):
    reason: str = "manual"
    destination: str = ""
    elapsed: int = 0


@app.post("/api/safe_walk_ping")
async def safe_walk_ping(req: SafeWalkPing):
    """Receive live location pings during Safe Walk mode."""
    session_key = "active_walk"
    if session_key not in safe_walk_sessions:
        safe_walk_sessions[session_key] = {
            "route": [],
            "destination": req.destination,
            "eta_minutes": req.eta_minutes,
            "start_time": datetime.now(timezone.utc).isoformat(),
        }

    safe_walk_sessions[session_key]["route"].append({
        "lat": req.lat, "lon": req.lon,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    safe_walk_sessions[session_key]["elapsed_seconds"] = req.elapsed_seconds

    # Broadcast to dashboard
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {
                "type": "safe_walk_ping",
                "lat": req.lat, "lon": req.lon,
                "destination": req.destination,
                "elapsed": req.elapsed_seconds,
                "eta": req.eta_minutes,
            }))
        except Exception:
            pass

    # Check if ETA exceeded
    if req.elapsed_seconds > (req.eta_minutes + 5) * 60:
        push_thought("supervisor", f"âš ï¸ Safe Walk ETA exceeded! Last seen: {req.lat:.6f}, {req.lon:.6f}")

    return {"status": "ok", "points": len(safe_walk_sessions[session_key]["route"])}


@app.post("/api/safe_walk_end")
async def safe_walk_end(req: SafeWalkEnd):
    """End a Safe Walk session."""
    session_key = "active_walk"
    session = safe_walk_sessions.pop(session_key, None)

    # Broadcast to dashboard
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {
                "type": "safe_walk_end",
                "reason": req.reason,
                "destination": req.destination,
            }))
        except Exception:
            pass

    if req.reason == "eta_exceeded":
        push_thought("supervisor", f"ðŸš¨ Safe Walk auto-escalation â€” ETA exceeded for {req.destination}")

    return {"status": "ended", "reason": req.reason}


# â”€â”€ Community Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
community_reports_store: list = []


class CommunityReport(BaseModel):
    lat: float
    lon: float
    description: str
    reporter: str = "anonymous"


@app.post("/api/community_report")
async def community_report(req: CommunityReport):
    """Receive a community safety report."""
    report = {
        "lat": req.lat,
        "lon": req.lon,
        "description": req.description,
        "reporter": req.reporter,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    community_reports_store.append(report)

    # Firebase write
    if db:
        try:
            db.collection("community_reports").add(report)
        except Exception as e:
            logger.warning(f"Firebase community_report write failed: {e}")

    # Broadcast to WS
    for ws in connected_ws_clients[:]:
        try:
            asyncio.create_task(_ws_send(ws, {"type": "community_report", "data": report}))
        except Exception:
            pass

    push_thought("supervisor", f"âš ï¸ Community report: {req.description[:50]}... at ({req.lat:.4f}, {req.lon:.4f})")
    return {"status": "reported"}


@app.get("/api/community_reports")
async def get_community_reports():
    return community_reports_store


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# ENTRY POINT
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
