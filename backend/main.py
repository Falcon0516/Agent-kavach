"""
KAVACH Backend — FastAPI Application
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
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Load environment ───────────────────────────────────────
load_dotenv()

# ── Logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("kavach.main")

# ── Data paths ─────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
QUEUE_PATH = os.path.join(BASE_DIR, "outbound_queue.json")

# ── FastAPI App ────────────────────────────────────────────
app = FastAPI(
    title="KAVACH Backend",
    description="AI-Agentic Women's Safety Platform — Backend API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════
# GLOBAL STATE
# ══════════════════════════════════════════════════════════
current_state: dict = {}
thought_stream: list = []
connected_ws_clients: list = []
recording_store: dict = {}       # {session_id: {url, transcript, timestamp}}
active_threat_zones: list = []   # [{zone_id, lat, lon, flagged_at}]

# ── Firebase (optional) ───────────────────────────────────
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
            logger.info("Firebase credentials not configured — running without Firebase")
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


# ══════════════════════════════════════════════════════════
# PUSH THOUGHT — broadcasts to all WebSocket clients
# ══════════════════════════════════════════════════════════
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


# ══════════════════════════════════════════════════════════
# LANGGRAPH PIPELINE
# ══════════════════════════════════════════════════════════
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
        push_thought("pipeline", f"✅ KAVACH pipeline complete — {elapsed}ms total")
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
        push_thought("pipeline", f"❌ Pipeline error: {str(e)}")
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


# ── Helper: read JSON data file ───────────────────────────
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


# ══════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ══════════════════════════════════════════════════════════
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
    gps_lat: float = 13.0827
    gps_lon: float = 77.5877
    audio_transcript: str = ""
    call_recording_url: str = ""
    timestamp: str = ""


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


# ══════════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════════
@app.on_event("startup")
async def startup():
    _init_firebase()
    logger.info("🛡️ KAVACH Backend v2.0 started")
    logger.info(f"Data directory: {DATA_DIR}")


# ══════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════

# ── Health check ───────────────────────────────────────────
@app.get("/")
async def health():
    return {
        "status": "operational",
        "service": "KAVACH Backend",
        "version": "2.0.0",
        "agents": 6,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── WebSocket thought stream ──────────────────────────────
@app.websocket("/ws/thoughts")
async def ws_thoughts(ws: WebSocket):
    await ws.accept()
    connected_ws_clients.append(ws)
    logger.info(f"WebSocket client connected ({len(connected_ws_clients)} total)")
    try:
        while True:
            # Keep alive — wait for client messages or disconnect
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in connected_ws_clients:
            connected_ws_clients.remove(ws)
        logger.info(f"WebSocket client disconnected ({len(connected_ws_clients)} remaining)")


# ── POST /api/trigger ──────────────────────────────────────
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


# ── GET /api/full_state ────────────────────────────────────
@app.get("/api/full_state")
async def full_state():
    return _safe_serialize(current_state) if current_state else {"status": "no_active_session"}


# ── GET /api/get_call_queue ────────────────────────────────
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


# ── GET /api/camera_frames ─────────────────────────────────
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


# ── POST /api/incoming_call ───────────────────────────────
@app.post("/api/incoming_call")
async def incoming_call(req: IncomingCallRequest):
    global thought_stream
    thought_stream = []

    state = _build_empty_state(
        trigger_type="incoming_call",
        lat=req.gps_lat,
        lon=req.gps_lon,
        timestamp=req.timestamp or datetime.now(timezone.utc).isoformat(),
        victim_name="Incoming Caller",
        caller_phone=req.caller_phone,
        call_recording_url=req.call_recording_url,
        audio_source="incoming_call",
        audio_transcript=req.audio_transcript,
    )

    asyncio.create_task(run_pipeline(state))
    return {"status": "pipeline_started"}


# ── POST /api/recording_complete ──────────────────────────
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


# ── GET /api/recordings ───────────────────────────────────
@app.get("/api/recordings")
async def get_recordings():
    return [
        {"session_id": sid, **data}
        for sid, data in recording_store.items()
    ]


# ── GET /api/trace_call ───────────────────────────────────
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
            "Location derived via Cell Tower ID — legal trace requires "
            "network provider cooperation and court order"
        ),
        "disclaimer": "DEMO DATA — for demonstration purposes only",
    }


# ── POST /api/flag_threat ─────────────────────────────────
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


# ── GET /api/threat_zones ─────────────────────────────────
@app.get("/api/threat_zones")
async def get_threat_zones():
    return active_threat_zones


# ── GET /api/map_data ──────────────────────────────────────
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


# ── POST /api/sms_trigger ─────────────────────────────────
@app.post("/api/sms_trigger")
async def sms_trigger(From: str = Form(""), Body: str = Form("")):
    """Twilio SMS webhook — woman sends SMS from keypad phone."""
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


# ── POST /api/manual_trigger ──────────────────────────────
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


# ── POST /api/reset ───────────────────────────────────────
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


# ══════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
