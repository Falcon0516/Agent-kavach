"""
KAVACH Supervisor Agent (Entry Node)
Validates trigger, transcribes audio via Groq Whisper, dispatches pipeline.
"""
import base64
import logging
import os
import tempfile
import time

logger = logging.getLogger("kavach.supervisor")

# Global reference — injected by main.py
push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


async def supervisor_node(state: dict) -> dict:
    """Entry LangGraph node. Validates trigger, transcribes audio, sets pipeline metadata."""
    trigger = state.get("trigger_type", "unknown")
    audio_source = state.get("audio_source", "voice_trigger")

    _thought("supervisor", f"Trigger: {trigger} | Source: {audio_source}")
    
    updates = {}

    # ── Transcribe audio ───────────────────────────────────
    raw_audio = state.get("raw_audio_b64", "")

    if raw_audio:
        _thought("supervisor", "Audio data detected — initiating Groq Whisper transcription...")
        transcript = await _transcribe_audio(raw_audio)
        updates["audio_transcript"] = transcript
        _thought("supervisor", f"Transcript: \"{transcript[:100]}...\"" if len(transcript) > 100 else f"Transcript: \"{transcript}\"")

    elif trigger == "incoming_call":
        # Use existing transcript or recording URL
        existing = state.get("audio_transcript", "")
        if existing:
            _thought("supervisor", f"Incoming call from {state.get('caller_phone', 'unknown')} — transcript available")
        else:
            updates["audio_transcript"] = "Emergency call received — audio processing pending"
            _thought("supervisor", f"Incoming call from {state.get('caller_phone', 'unknown')} — recording processed")

    else:
        if not state.get("audio_transcript"):
            updates["audio_transcript"] = "Emergency SOS activated"
            _thought("supervisor", f"No audio data — using default: \"{updates['audio_transcript']}\"")
        else:
            _thought("supervisor", f"No audio data — using default: \"{state['audio_transcript']}\"")

    # ── Validate GPS ───────────────────────────────────────
    lat = state.get("gps_lat", 0)
    lon = state.get("gps_lon", 0)

    # Bengaluru bounding box: lat 12.7–13.4, lon 77.3–78.0
    if not (12.7 <= lat <= 13.4 and 77.3 <= lon <= 78.0):
        _thought("supervisor", f"⚠ GPS ({lat}, {lon}) outside Bengaluru range — using KSIT default")
        updates["gps_lat"] = 13.0827
        updates["gps_lon"] = 77.5877
    else:
        _thought("supervisor", f"GPS validated: ({lat:.4f}, {lon:.4f}) — within Bengaluru")

    # ── Pipeline metadata ──────────────────────────────────
    updates["pipeline_start_ms"] = int(time.time() * 1000)
    updates["completed_agents"] = ["supervisor"]

    _thought("supervisor", "Dispatching 6 agents simultaneously")

    return updates


async def _transcribe_audio(audio_b64: str) -> str:
    """Transcribe base64 WAV audio using Groq Whisper API."""
    groq_key = os.getenv("GROQ_KEY_1", "")

    if not groq_key:
        logger.warning("GROQ_KEY_1 not set — cannot transcribe audio")
        return "Emergency SOS — audio transcription unavailable"

    try:
        from groq import AsyncGroq

        client = AsyncGroq(api_key=groq_key)

        # Decode base64 audio to temp WAV file
        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as audio_file:
                transcription = await client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=audio_file,
                    language="en",
                )
            return transcription.text or "Emergency SOS — audio transcription unavailable"
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except ImportError:
        logger.error("groq package not installed")
        return "Emergency SOS — audio transcription unavailable"
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
        return "Emergency SOS — audio transcription unavailable"
