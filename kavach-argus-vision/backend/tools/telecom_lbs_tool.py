import asyncio
import os
import random

async def resolve_location_via_gmlc(phone_number: str) -> dict:
    # 1. Simulate network latency (makes the demo feel authentic)
    await asyncio.sleep(1.2)
    
    # 2. Base coordinates (KSIT Bengaluru area)
    # We add a slight random offset so it looks like a live calculation
    base_lat = 13.0827
    base_lon = 77.5877
    
    offset_lat = random.uniform(-0.001, 0.001)
    offset_lon = random.uniform(-0.001, 0.001)
    
    return {
        "lat": round(base_lat + offset_lat, 6),
        "lon": round(base_lon + offset_lon, 6),
        "accuracy_m": random.choice([85, 110, 150, 200]),
        "method": "TDOA / Timing Advance",
        "provider": "Mock Telecom Core",
        "source": "Telecom LBS Gateway"
    }
