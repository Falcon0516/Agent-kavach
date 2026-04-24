"""
KAVACH FIR Agent (Agent 03)
LLM: deepseek/deepseek-chat-v3-0324:free via OpenRouter.
Generates professional Indian police FIR documents.
"""
import json
import logging
import os
from datetime import datetime

import httpx

from tools.fir_tool import (
    lookup_ipc_section,
    get_area_description,
    generate_case_number,
    get_ipc_sections_for_threat,
)

logger = logging.getLogger("kavach.fir")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = (
    "Draft a proper Indian police FIR. Sections: FIR Number, Date/Time, Police Station (nearest "
    "from context), Complainant (victim details), Incident Description (from transcript), "
    "IPC Sections (provided), NCRB Crime Head, Evidence (voice audio, GPS trail, Argus camera "
    "footage, recording if available), Suspect Description. Format: formal Indian police FIR. "
    "Output ONLY the FIR text, no markdown."
)


async def fir_node(state: dict) -> dict:
    """Generate a formal FIR document with IPC sections and evidence."""

    threat_level = state.get("threat_level", 3)
    transcript = state.get("audio_transcript", "")
    victim_name = state.get("victim_name", "Unknown")
    lat = state.get("gps_lat", 0)
    lon = state.get("gps_lon", 0)
    timestamp = state.get("timestamp", "")
    call_recording_url = state.get("call_recording_url", "")
    ncrb_match = state.get("ncrb_hotspot_match", False)
    ncrb_context = state.get("ncrb_context", "")
    group_threat = state.get("group_threat", False)
    plate_detected = state.get("plate_detected", [])
    nearest_police = state.get("nearest_police", {})
    
    updates = {}

    # ── IPC Sections (pure Python, before LLM) ────────────
    sections, notes = get_ipc_sections_for_threat(
        threat_level=threat_level,
        group_threat=group_threat,
        plate_detected=plate_detected,
        call_recording_url=call_recording_url,
        ncrb_hotspot_match=ncrb_match,
        ncrb_context=ncrb_context,
    )

    section_details = [lookup_ipc_section(s) for s in sections]
    sections_str = ", ".join([f"IPC {s['section']} ({s['title']})" for s in section_details])
    _thought("fir", f"IPC sections identified: {[s['section'] for s in section_details]}")

    # ── Case number ────────────────────────────────────────
    case_number = generate_case_number()
    updates["fir_case_number"] = case_number
    _thought("fir", f"Case number generated: {case_number}")

    # ── NCRB context ───────────────────────────────────────
    if ncrb_match:
        _thought("fir", "NCRB historical context added to FIR")
    if call_recording_url:
        _thought("fir", "Call recording evidence appended")

    # ── Area description ───────────────────────────────────
    area = get_area_description(lat, lon)
    police_station = nearest_police.get("name", "Nearest jurisdictional PS")

    # ── Build LLM context ──────────────────────────────────
    user_msg = (
        f"FIR Number: {case_number}\n"
        f"Date/Time: {timestamp or datetime.utcnow().isoformat()}\n"
        f"Police Station: {police_station}\n"
        f"Complainant: {victim_name}\n"
        f"Location: {area} (GPS: {lat}, {lon})\n"
        f"Transcript: \"{transcript}\"\n"
        f"IPC Sections: {sections_str}\n"
        f"Threat Level: {threat_level}/5\n"
    )

    for note in notes:
        user_msg += f"\n{note}"

    # ── Call OpenRouter LLM ────────────────────────────────
    fir_text = await _call_openrouter(user_msg)

    if not fir_text:
        _thought("fir", "OpenRouter unavailable — using template FIR fallback")
        fir_text = _fallback_fir(
            case_number, timestamp, police_station, victim_name,
            area, lat, lon, transcript, sections_str, notes, threat_level
        )

    updates["fir_text"] = fir_text
    updates["ipc_sections"] = sections
    updates["fir_reasoning"] = f"FIR drafted with {len(sections)} IPC sections, threat level {threat_level}/5"

    word_count = len(fir_text.split())
    _thought("fir", f"FIR draft complete — {word_count} words")

    updates["completed_agents"] = ["fir"]
    return updates


async def _call_openrouter(user_message: str) -> str:
    """Call OpenRouter DeepSeek model with 30s timeout."""
    api_key = os.getenv("OPENROUTER_KEY", "")
    if not api_key:
        logger.warning("OPENROUTER_KEY not set")
        return ""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://kavach-ai.demo",
        "X-Title": "KAVACH Safety Platform",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "google/gemini-flash-1.5:free",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.3,
        "max_tokens": 1500,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error(f"OpenRouter call failed: {e}")
        return ""


def _fallback_fir(
    case_number, timestamp, police_station, victim_name,
    area, lat, lon, transcript, sections_str, notes, threat_level
) -> str:
    """Generate a template-based FIR when LLM is unavailable."""
    now = timestamp or datetime.utcnow().isoformat()
    notes_text = "\n".join(f"  - {n}" for n in notes) if notes else "  - None"

    return f"""FIRST INFORMATION REPORT (FIR)
{'='*50}

FIR No: {case_number}
Date & Time of Report: {now}
Police Station: {police_station}

COMPLAINANT DETAILS:
  Name: {victim_name}
  Location at time of incident: {area}
  GPS Coordinates: {lat}, {lon}

INCIDENT DESCRIPTION:
  An emergency distress signal was received via the KAVACH Women's Safety Platform.
  The following transcript was captured:
  "{transcript}"

  Threat Assessment Level: {threat_level}/5

APPLICABLE IPC SECTIONS:
  {sections_str}

ADDITIONAL EVIDENCE/NOTES:
{notes_text}

EVIDENCE:
  1. Voice/Audio recording via KAVACH platform
  2. GPS trail and location data
  3. Argus surveillance camera footage (if available)
  4. KAVACH AI threat assessment report

ACTION REQUESTED:
  Immediate dispatch of patrol unit to complainant's location.
  Investigation under the above IPC sections is requested.

Reported via: KAVACH AI-Agentic Safety Platform
{'='*50}
"""
