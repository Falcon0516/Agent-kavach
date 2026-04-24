import json
import os
import copy
import logging
from tools.location_tool import find_nearest

logger = logging.getLogger("kavach.navigation")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")

async def navigation_node(state):
    _thought("navigation", "Loading Bengaluru location database...")
    lat, lon = state.get("gps_lat", 13.0827), state.get("gps_lon", 77.5877)
    
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    with open(os.path.join(data_dir, "police_stations.json")) as f:
        police_stations = json.load(f)
    with open(os.path.join(data_dir, "safe_houses.json")) as f:
        safe_houses = json.load(f)
    with open(os.path.join(data_dir, "hospitals.json")) as f:
        hospitals = json.load(f)
        
    _thought("navigation", f"GPS: {lat:.4f}, {lon:.4f} — calculating distances")
    
    ps = find_nearest(lat, lon, copy.deepcopy(police_stations))
    h  = find_nearest(lat, lon, copy.deepcopy(hospitals))
    sh = find_nearest(lat, lon, copy.deepcopy(safe_houses))
    
    _thought("navigation", f"Nearest police: {ps['name']} — {ps['distance_m']}m (~{ps['eta_min']} min)")
    _thought("navigation", f"Nearest hospital: {h['name']} — {h['distance_m']}m")
    _thought("navigation", f"Nearest safe house: {sh['name']} — {sh['distance_m']}m")
    _thought("navigation", "COMPLETE — Navigation calculated")
    
    updates = {
        "nearest_police": ps,
        "nearest_hospital": h,
        "nearest_safe_house": sh,
        "nav_reasoning": f"Haversine distance from GPS. Police ETA {ps['eta_min']} min.",
        "completed_agents": ["navigation"]
    }
    return updates
