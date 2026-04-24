"""
KAVACH Argus Agent (Agent 05)
Camera surveillance + YOLOv8 object detection stub.
Connects to live MJPEG streams (e.g. from Android IP Webcam over Tailscale)
and merges live stream status with demo YOLO detection output.
Dashboard color: orange (#ff6b35)
"""
import json
import logging
import os
import asyncio
import cv2

from tools.call_queue_tool import enqueue_call

logger = logging.getLogger("kavach.argus")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


def _capture_frame(stream_url: str):
    """Attempt to capture a single frame from an MJPEG stream using OpenCV.
    Returns True if a frame was successfully read, False otherwise.
    Runs synchronously (wrap in asyncio.to_thread for async).
    """
    try:
        cap = cv2.VideoCapture(stream_url)
        # Reduce buffer size so we get the most recent frame
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        # We try to read a frame.
        # If the stream is down, this might block for a timeout period.
        ret, frame = cap.read()
        cap.release()
        return ret
    except Exception as e:
        logger.warning(f"Error capturing from {stream_url}: {e}")
        return False


async def argus_node(state: dict) -> dict:
    """Activate nearby Argus camera nodes, check live streams, and run detection pipeline."""
    lat = state.get("gps_lat", 13.0827)
    lon = state.get("gps_lon", 77.5877)
    threat_level = state.get("threat_level", 3)

    _thought("argus", "Scanning for nearby Argus surveillance nodes...")
    
    updates = {}

    # ── Load Argus nodes ───────────────────────────────────
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "argus_nodes.json")
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            all_nodes = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        all_nodes = []

    # Activate nodes within 1km (stub — M3 adds real distance filtering)
    activated = []
    activated_urls = []
    
    for node in all_nodes:
        if node.get("status") == "active":
            activated.append(node["id"])
            if "stream_url" in node and node["stream_url"] and "FILL_" not in node["stream_url"]:
                activated_urls.append((node["name"], node["stream_url"]))
                
            if len(activated) >= 3:
                break

    updates["argus_nodes_activated"] = activated
    _thought("argus", f"Activated {len(activated)} nodes: {activated}")

    # ── Live Stream Verification ───────────────────────────
    live_streams_active = 0
    if activated_urls:
        _thought("argus", f"Verifying {len(activated_urls)} live MJPEG streams...")
        for name, url in activated_urls:
            # We use to_thread so cv2 blocking doesn't freeze the LangGraph pipeline
            success = await asyncio.to_thread(_capture_frame, url)
            if success:
                live_streams_active += 1
                _thought("argus", f"✅ Successfully captured live frame from {name}")
            else:
                _thought("argus", f"⚠ Stream unavailable or timed out for {name}")
    else:
        _thought("argus", "No real IP Webcam URLs configured (using FILL_ placeholders)")

    if live_streams_active > 0:
        _thought("argus", f"{live_streams_active} live streams active. Extracting demo detection telemetry...")
    else:
        _thought("argus", "Falling back to pure demo detection values for pipeline.")

    # ── Stub detections (M3 replaces with real YOLOv8 logic) ─────
    _thought("argus", "Running YOLOv8 object detection on camera feeds...")

    # Mock detection results overlaying the live/demo streams
    updates["face_detected"] = True
    updates["face_count"] = 2
    updates["plate_detected"] = []
    updates["threat_objects"] = []
    updates["scene_analysis"] = "Camera feeds activated. Visual analysis in progress — awaiting complete YOLOv8 integration."
    updates["group_threat"] = False

    _thought("argus", f"Faces detected: {updates['face_count']}")

    if updates["face_count"] >= 3:
        updates["group_threat"] = True
        _thought("argus", "⚠ GROUP THREAT: 3+ individuals clustered near victim")

    if updates["plate_detected"]:
        _thought("argus", f"🚗 Vehicle plates: {updates['plate_detected']}")

    if updates["threat_objects"]:
        _thought("argus", f"⚠ Threat objects: {updates['threat_objects']}")

    updates["argus_reasoning"] = (
        f"{len(activated)} Argus nodes activated ({live_streams_active} live streams OK). "
        f"{updates['face_count']} faces detected. "
        f"Plates: {updates['plate_detected']}. "
        f"Threat objects: {updates['threat_objects']}."
    )

    # ── Queue police call if threat >= 3 ───────────────────
    if threat_level >= 3:
        _thought("argus", "Threat level ≥ 3 — queuing outbound police call")
        nearest_police = state.get("nearest_police", {})
        police_phone = nearest_police.get("phone", "+918022222210")

        await enqueue_call(
            numbers=["100", police_phone],
            threat_data={
                "threat_level": threat_level,
                "summary": state.get("threat_summary", "Emergency"),
                "gps": {"lat": lat, "lon": lon},
                "victim": state.get("victim_name", "Unknown"),
                "argus_nodes": activated,
            },
            priority="critical" if threat_level >= 4 else "high",
        )
        updates["call_queued"] = True
        _thought("argus", f"📞 Police call queued: 100, {police_phone}")
    else:
        updates["call_queued"] = False

    updates["completed_agents"] = ["argus"]
    return updates
