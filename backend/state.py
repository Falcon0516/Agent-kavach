"""
KAVACH State Definition
Central TypedDict shared across all LangGraph nodes.
Uses Annotated reducers for fields written by multiple parallel agents.
"""
import operator
from typing import Annotated, List, Optional, TypedDict


def _last_value(existing, new):
    """Reducer: last writer wins (for scalar fields updated by parallel nodes)."""
    return new if new is not None else existing


def _merge_dict(existing, new):
    """Reducer: merge dicts (existing overwritten by new keys)."""
    if not existing:
        return new or {}
    if not new:
        return existing or {}
    merged = dict(existing)
    merged.update(new)
    return merged


class KavachState(TypedDict):
    # ── TRIGGER INPUT (set once by supervisor, read-only after) ─
    trigger_type: str
    raw_audio_b64: str
    gps_lat: float
    gps_lon: float
    timestamp: str
    victim_name: str
    victim_phone: str
    caller_phone: str
    location_accuracy_m: Annotated[int, _last_value]
    location_source: Annotated[str, _last_value]

    # ── AUDIO EVIDENCE ─────────────────────────────────────
    audio_transcript: str
    call_recording_url: str
    audio_source: str

    # ── THREAT AGENT (Agent 01) ────────────────────────────
    threat_level: Annotated[int, _last_value]
    threat_summary: Annotated[str, _last_value]
    threat_context: Annotated[dict, _merge_dict]
    threat_reasoning: Annotated[str, _last_value]

    # ── FAMILY ALERT (Agent 02) ────────────────────────────
    family_alerted: Annotated[bool, _last_value]
    whatsapp_message: Annotated[str, _last_value]
    whatsapp_sid: Annotated[str, _last_value]
    family_reasoning: Annotated[str, _last_value]

    # ── FIR (Agent 03) ─────────────────────────────────────
    fir_text: Annotated[str, _last_value]
    ipc_sections: Annotated[List[str], operator.add]
    fir_case_number: Annotated[str, _last_value]
    fir_reasoning: Annotated[str, _last_value]

    # ── NAVIGATION (Agent 04) ──────────────────────────────
    nearest_police: Annotated[dict, _merge_dict]
    nearest_hospital: Annotated[dict, _merge_dict]
    nearest_safe_house: Annotated[dict, _merge_dict]
    nav_reasoning: Annotated[str, _last_value]

    # ── ARGUS (Agent 05) ───────────────────────────────────
    argus_nodes_activated: Annotated[List[str], operator.add]
    face_detected: Annotated[bool, _last_value]
    face_count: Annotated[int, _last_value]
    plate_detected: Annotated[List[str], operator.add]
    threat_objects: Annotated[List[str], operator.add]
    scene_analysis: Annotated[str, _last_value]
    group_threat: Annotated[bool, _last_value]
    argus_reasoning: Annotated[str, _last_value]

    # ── NCRB AGENT (Agent 06) ──────────────────────────────
    ncrb_hotspot_match: Annotated[bool, _last_value]
    ncrb_context: Annotated[str, _last_value]
    ncrb_reasoning: Annotated[str, _last_value]
    nearest_hotspot: Annotated[dict, _merge_dict]

    # ── PIPELINE META ──────────────────────────────────────
    call_queued: Annotated[bool, _last_value]
    agent_thoughts: Annotated[List[dict], operator.add]
    completed_agents: Annotated[List[str], operator.add]
    pipeline_start_ms: int
    errors: Annotated[List[str], operator.add]
