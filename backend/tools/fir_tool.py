"""
KAVACH FIR Tool
IPC section lookup, area description, case number generation.
"""
import json
import os
import random
from typing import Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def lookup_ipc_section(section: str) -> dict:
    """Look up an IPC section from ipc_sections.json.
    Returns {section, title, punishment} or {section, title: 'Unknown', punishment: 'N/A'}.
    """
    filepath = os.path.join(DATA_DIR, "ipc_sections.json")
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            sections = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"section": section, "title": "Unknown", "punishment": "N/A"}

    info = sections.get(str(section), {})
    return {
        "section": section,
        "title": info.get("title", "Unknown"),
        "punishment": info.get("punishment", "N/A"),
    }


def get_area_description(lat: float, lon: float) -> str:
    """Return a grid-based mock area description for the given GPS coordinates.
    Uses simple lat/lon bucketing to generate plausible Bengaluru area names.
    """
    area_grid = {
        (13.0, 77.5): "Rajajinagar / Malleshwaram area",
        (13.0, 77.6): "KSIT Campus / Raghuvanahalli area",
        (13.1, 77.5): "Yelahanka area",
        (13.1, 77.6): "Yelahanka New Town area",
        (12.9, 77.6): "Koramangala / HSR Layout area",
        (12.9, 77.5): "Jayanagar / JP Nagar area",
        (12.9, 77.7): "Bellandur / Marathahalli area",
        (13.0, 77.7): "Whitefield area",
        (12.8, 77.6): "Electronic City area",
        (12.8, 77.5): "Kanakapura Road area",
        (12.9, 77.4): "Kengeri / Rajarajeshwari Nagar area",
        (13.0, 77.4): "Peenya / Dasarahalli area",
        (12.9, 77.5): "Banashankari / Basavanagudi area",
    }

    # Round to nearest 0.1 degree grid
    grid_lat = round(lat, 1)
    grid_lon = round(lon, 1)
    key = (grid_lat, grid_lon)

    return area_grid.get(key, f"Bengaluru area ({lat:.4f}°N, {lon:.4f}°E)")


def generate_case_number(seed: Optional[int] = None) -> str:
    """Generate a unique FIR case number in format: KVH-2026-NNNN"""
    if seed is not None:
        random.seed(seed)
    num = random.randint(1000, 9999)
    return f"KVH-2026-{num}"


def get_ipc_sections_for_threat(
    threat_level: int,
    group_threat: bool = False,
    plate_detected: list = None,
    call_recording_url: str = "",
    ncrb_hotspot_match: bool = False,
    ncrb_context: str = "",
) -> tuple:
    """Determine applicable IPC sections based on threat level and context.
    Returns (sections_list, extra_notes_list).
    """
    sections = []
    notes = []

    if threat_level >= 2:
        sections.append("354D")  # Stalking
    if threat_level >= 3:
        sections.append("506")   # Criminal intimidation
        sections.append("354")   # Assault on woman
    if threat_level >= 4:
        sections.append("323")   # Causing hurt
        sections.append("354A")  # Sexual harassment
    if threat_level >= 5:
        sections.append("376")   # Rape

    # Context-based additions
    if group_threat:
        sections.append("34")   # Common intention
        notes.append("Multiple suspects detected — IPC 34 applied")
    if plate_detected:
        plates = ", ".join(plate_detected) if isinstance(plate_detected, list) else str(plate_detected)
        notes.append(f"NOTA: Vehicle evidence available — Registration {plates}")
    if call_recording_url:
        notes.append(f"AUDIO EVIDENCE: Recording URL — {call_recording_url}")
    if ncrb_hotspot_match and ncrb_context:
        notes.append(f"NCRB CONTEXT: {ncrb_context}")

    return sections, notes
