"""
KAVACH Navigation Agent (Agent 04)
Finds nearest police station, hospital, and safe house.
Teammate (M3) extends with real routing and safe-route scoring.
"""
import logging

from tools.location_tool import (
    find_nearest_police,
    find_nearest_hospital,
    find_nearest_safe_house,
    get_safe_zone_score,
)

logger = logging.getLogger("kavach.navigation")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


async def navigation_node(state: dict) -> dict:
    """Find nearest safety facilities and compute safe zone score."""
    lat = state.get("gps_lat", 13.0827)
    lon = state.get("gps_lon", 77.5877)
    timestamp = state.get("timestamp", "")

    _thought("navigation", f"Scanning nearest facilities from ({lat:.4f}, {lon:.4f})...")
    
    updates = {}

    # ── Nearest facilities ─────────────────────────────────
    police = find_nearest_police(lat, lon)
    hospital = find_nearest_hospital(lat, lon)
    safe_house = find_nearest_safe_house(lat, lon)

    updates["nearest_police"] = police
    updates["nearest_hospital"] = hospital
    updates["nearest_safe_house"] = safe_house

    _thought("navigation", f"🚔 Police: {police.get('name', 'Unknown')} — {police.get('distance_m', '?')}m")
    _thought("navigation", f"🏥 Hospital: {hospital.get('name', 'Unknown')} — {hospital.get('distance_m', '?')}m")
    _thought("navigation", f"🏠 Safe House: {safe_house.get('name', 'Unknown')} — {safe_house.get('distance_m', '?')}m")

    # ── Safe zone score ────────────────────────────────────
    # Determine time slot from timestamp
    time_slot = "night"  # default
    try:
        if timestamp:
            hour_str = timestamp.split("T")[1][:2] if "T" in timestamp else timestamp[:2]
            hour = int(hour_str)
            if 6 <= hour < 12:
                time_slot = "morning"
            elif 12 <= hour < 18:
                time_slot = "afternoon"
            else:
                time_slot = "night"
    except (IndexError, ValueError):
        pass

    zone_info = get_safe_zone_score(lat, lon, time_slot)
    _thought("navigation", f"📊 Zone: {zone_info.get('zone', 'Unknown')} | Safety: {zone_info.get('score', 0):.2f} ({time_slot})")

    updates["nav_reasoning"] = (
        f"Nearest police: {police.get('name')} ({police.get('distance_m')}m), "
        f"Hospital: {hospital.get('name')} ({hospital.get('distance_m')}m), "
        f"Safe house: {safe_house.get('name')} ({safe_house.get('distance_m')}m). "
        f"Zone safety ({time_slot}): {zone_info.get('score', 0):.2f}"
    )

    updates["completed_agents"] = ["navigation"]
    return updates
