import math, json, os

def haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def estimate_eta(distance_m: float, mode: str = "police") -> int:
    speed = 300 if mode == "police" else 80  # meters per minute (police car vs walking)
    return max(1, round(distance_m / speed))

def find_nearest(lat: float, lon: float, locations: list) -> dict:
    for loc in locations:
        loc["distance_m"] = round(haversine(lat, lon, loc["lat"], loc["lon"]))
        loc["eta_min"] = estimate_eta(loc["distance_m"])
    return sorted(locations, key=lambda x: x["distance_m"])[0]

def get_area_description(lat: float, lon: float) -> str:
    if lat > 13.05: return "Yelahanka Area, North Bengaluru"
    if lat > 12.98: return "Hebbal/Armane Nagar, Bengaluru"
    if lat > 12.96: return "Indiranagar / Koramangala, Central Bengaluru"
    return "South Bengaluru"
