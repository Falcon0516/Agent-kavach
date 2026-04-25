"""
KAVACH Camera Tool
Stub for Argus camera frame retrieval. Teammate (M3) replaces with YOLOv8 integration.
"""
import logging

logger = logging.getLogger("kavach.camera")


async def get_camera_frame(node_id: str) -> dict:
    """Fetch the latest frame from an Argus camera node.
    Returns {node_id, frame_b64, timestamp, detections}.
    Stub — returns mock data until M3 integrates YOLOv8.
    """
    logger.info(f"Camera frame requested for node {node_id}")
    return {
        "node_id": node_id,
        "frame_b64": "",
        "timestamp": "",
        "detections": [],
        "status": "stub — awaiting Argus integration",
    }


async def activate_nearby_cameras(lat: float, lon: float, radius_m: float = 500) -> list:
    """Activate all Argus camera nodes within radius of the given GPS point.
    Returns list of activated node IDs.
    Stub — returns mock activation until M3 integrates.
    """
    logger.info(f"Activating cameras near ({lat}, {lon}) within {radius_m}m")
    return ["ARGUS-01", "ARGUS-02"]
