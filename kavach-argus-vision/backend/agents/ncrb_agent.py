"""
KAVACH NCRB Agent (Agent 06)
Pure Python geo-matching — no LLM needed.
Cross-references victim GPS against NCRB crime hotspot database.
Dashboard color: purple (#cc5de8)
"""
import json
import logging
import os

from tools.location_tool import haversine

logger = logging.getLogger("kavach.ncrb")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


async def ncrb_node(state: dict) -> dict:
    """Cross-reference victim GPS against NCRB crime hotspot zones."""
    _thought("ncrb", "Loading NCRB crime hotspot database...")
    
    updates = {}

    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "ncrb_hotspots.json")
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            hotspots = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.error(f"Failed to load NCRB hotspots: {e}")
        _thought("ncrb", "⚠ NCRB database unavailable — skipping hotspot check")
        updates["ncrb_hotspot_match"] = False
        updates["ncrb_context"] = "NCRB database unavailable"
        updates["ncrb_reasoning"] = f"Failed to load hotspot data: {e}"
        updates["nearest_hotspot"] = {}
        updates["completed_agents"] = ["ncrb"]
        return updates

    lat = state.get("gps_lat", 0)
    lon = state.get("gps_lon", 0)
    _thought("ncrb", f"Cross-referencing GPS {lat:.4f}, {lon:.4f} against {len(hotspots)} hotspot zones...")

    match = None
    nearest_dist = float("inf")

    for hs in hotspots:
        dist = haversine(lat, lon, hs["lat"], hs["lon"])
        if dist < nearest_dist:
            nearest_dist = dist
            match = hs

        if dist <= hs["radius_m"]:
            # WITHIN hotspot zone
            _thought("ncrb", f"⚠ HOTSPOT MATCH: {hs['name']} — {dist:.0f}m away")
            _thought("ncrb", f"Zone history: {hs['incident_count']} incidents | {hs['crime_type']} | {hs['year']}")
            _thought("ncrb", f"Context: {hs['description']}")

            updates["ncrb_hotspot_match"] = True
            updates["ncrb_context"] = (
                f"{dist:.0f}m from '{hs['name']}' — "
                f"{hs['incident_count']} {hs['crime_type']} cases ({hs['year']})"
            )
            updates["ncrb_reasoning"] = (
                f"Victim GPS matches Crime Hotspot Zone {hs['id']}. "
                f"Historical data: {hs['description']}"
            )
            updates["nearest_hotspot"] = {
                "id": hs["id"],
                "name": hs["name"],
                "distance_m": round(dist),
                "incident_count": hs["incident_count"],
                "crime_type": hs["crime_type"],
                "year": hs["year"],
            }
            updates["completed_agents"] = ["ncrb"]
            return updates

    # No match within any hotspot — report nearest
    if match:
        _thought("ncrb", "No hotspot match within defined zones")
        _thought("ncrb", f"Nearest hotspot: {match['name']} — {nearest_dist:.0f}m (outside {match['radius_m']}m threshold)")
        _thought("ncrb", "COMPLETE — location clear of registered crime zones")

        updates["ncrb_hotspot_match"] = False
        updates["ncrb_context"] = f"Location clear — nearest hotspot {nearest_dist:.0f}m away"
        updates["ncrb_reasoning"] = (
            f"GPS not within any NCRB hotspot zone. "
            f"Nearest: {match['name']} at {nearest_dist:.0f}m"
        )
        updates["nearest_hotspot"] = {
            "name": match["name"],
            "distance_m": round(nearest_dist),
        }
    else:
        updates["ncrb_hotspot_match"] = False
        updates["ncrb_context"] = "No hotspot data available"
        updates["ncrb_reasoning"] = "Empty hotspot database"
        updates["nearest_hotspot"] = {}

    updates["completed_agents"] = ["ncrb"]
    return updates
