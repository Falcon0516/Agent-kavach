"""
KAVACH Location Tools
Haversine distance, nearest-facility lookup, safe zone scoring.
"""
import json
import math
import os
from typing import Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in meters between two GPS points."""
    R = 6_371_000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest(lat: float, lon: float, data_file: str) -> Optional[dict]:
    """Find nearest facility from a JSON data file."""
    filepath = os.path.join(DATA_DIR, data_file)
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            items = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

    if not items:
        return None

    nearest = None
    min_dist = float("inf")
    for item in items:
        item_lat = item.get("lat", item.get("center", {}).get("lat", 0))
        item_lon = item.get("lon", item.get("center", {}).get("lon", 0))
        dist = haversine(lat, lon, item_lat, item_lon)
        if dist < min_dist:
            min_dist = dist
            nearest = item.copy()

    if nearest:
        nearest["distance_m"] = round(min_dist)
    return nearest


def find_nearest_police(lat: float, lon: float) -> dict:
    """Find nearest police station."""
    result = find_nearest(lat, lon, "police_stations.json")
    return result or {"name": "Unknown", "distance_m": 0, "phone": "100"}


def find_nearest_hospital(lat: float, lon: float) -> dict:
    """Find nearest hospital."""
    result = find_nearest(lat, lon, "hospitals.json")
    return result or {"name": "Unknown", "distance_m": 0, "phone": "108"}


def find_nearest_safe_house(lat: float, lon: float) -> dict:
    """Find nearest safe house / women's shelter."""
    result = find_nearest(lat, lon, "safe_houses.json")
    return result or {"name": "Unknown", "distance_m": 0, "phone": "181"}


def get_safe_zone_score(lat: float, lon: float, time_slot: str = "night") -> dict:
    """Get safety score for the given location and time slot.
    time_slot: 'morning' | 'afternoon' | 'night'
    """
    filepath = os.path.join(DATA_DIR, "safe_zones.json")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            zones = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"zone": "Unknown", "score": 0.5, "in_zone": False}

    for zone in zones:
        center = zone.get("center", {})
        dist = haversine(lat, lon, center.get("lat", 0), center.get("lon", 0))
        if dist <= zone.get("radius_m", 0):
            safety = zone.get("safety", {})
            return {
                "zone": zone["name"],
                "score": safety.get(time_slot, 0.5),
                "in_zone": True,
                "distance_m": round(dist),
            }

    return {"zone": "Outside mapped zones", "score": 0.4, "in_zone": False}
