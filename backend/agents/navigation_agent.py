import json
import os
import copy
from tools.location_tool import find_nearest

def push_thought(agent, msg):
    print(f"[{agent.upper()}] {msg}")

async def navigation_node(state):
    push_thought("navigation", "Loading Bengaluru location database...")
    lat, lon = state.get("gps_lat", 13.0827), state.get("gps_lon", 77.5877)
    
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    with open(os.path.join(data_dir, "police_stations.json")) as f:
        police_stations = json.load(f)
    with open(os.path.join(data_dir, "safe_houses.json")) as f:
        safe_houses = json.load(f)
    with open(os.path.join(data_dir, "hospitals.json")) as f:
        hospitals = json.load(f)
        
    push_thought("navigation", f"GPS: {lat:.4f}, {lon:.4f} — calculating distances")
    
    ps = find_nearest(lat, lon, copy.deepcopy(police_stations))
    h  = find_nearest(lat, lon, copy.deepcopy(hospitals))
    sh = find_nearest(lat, lon, copy.deepcopy(safe_houses))
    
    push_thought("navigation", f"Nearest police: {ps['name']} — {ps['distance_m']}m (~{ps['eta_min']} min)")
    push_thought("navigation", f"Nearest hospital: {h['name']} — {h['distance_m']}m")
    push_thought("navigation", f"Nearest safe house: {sh['name']} — {sh['distance_m']}m")
    push_thought("navigation", "COMPLETE — Navigation calculated")
    
    state["nearest_police"]    = ps
    state["nearest_hospital"]  = h
    state["nearest_safe_house"] = sh
    state["nav_reasoning"] = f"Haversine distance from GPS. Police ETA {ps['eta_min']} min."
    if "completed_agents" not in state:
        state["completed_agents"] = []
    state["completed_agents"].append("navigation")
    return state
