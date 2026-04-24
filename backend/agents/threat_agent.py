"""
KAVACH Threat Assessment Agent (Agent 01)
LLM: llama-3.3-70b-versatile via Groq with multi-key rotation.
"""
import json
import logging
import os

logger = logging.getLogger("kavach.threat")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


SYSTEM_PROMPT = """You are KAVACH's Threat Assessment Agent.
THREAT LEVELS:
1=Possible concern, 2=Elevated risk, 3=Active threat, 4=Imminent danger, 5=Critical emergency
Consider: transcript keywords (help, bachao, chhod do, leave me, don't touch, maaro nahi),
time of trigger (22:00–05:00 = HIGH), location type, trigger_type (incoming_call = higher baseline).
Output ONLY this JSON (no markdown):
{"threat_level":<1-5>,"threat_summary":"<1 sentence>","keywords_detected":["word"],
"time_risk":"<low|medium|high>","confidence":<0.0-1.0>,"reasoning":"<step by step>"}"""


def _get_groq_keys() -> list:
    """Collect all available Groq API keys for rotation."""
    keys = []
    for i in range(1, 5):
        key = os.getenv(f"GROQ_KEY_{i}", "")
        if key:
            keys.append(key)
    # Also check generic GROQ_API_KEY
    generic = os.getenv("GROQ_API_KEY", "")
    if generic and generic not in keys:
        keys.insert(0, generic)
    return keys


async def threat_node(state: dict) -> dict:
    """Assess threat level from transcript, time, location, and NCRB data."""
    _thought("threat", "Analyzing transcript for threat indicators...")

    transcript = state.get("audio_transcript", "")
    timestamp = state.get("timestamp", "")
    trigger_type = state.get("trigger_type", "unknown")
    lat = state.get("gps_lat", 0)
    lon = state.get("gps_lon", 0)
    ncrb_match = state.get("ncrb_hotspot_match", False)

    user_msg = (
        f"Transcript: \"{transcript}\"\n"
        f"Trigger type: {trigger_type}\n"
        f"Timestamp: {timestamp}\n"
        f"GPS: {lat}, {lon}\n"
        f"NCRB hotspot match: {ncrb_match}"
    )

    result = await _call_groq_llm(user_msg)
    
    updates = {}

    if result:
        threat_level = result.get("threat_level", 3)
        keywords = result.get("keywords_detected", [])
        time_risk = result.get("time_risk", "medium")

        _thought("threat", f"Keywords detected: {keywords}")
        _thought("threat", f"Time factor: {timestamp[:5] if len(timestamp) >= 5 else timestamp} — {time_risk}")

        # NCRB hotspot boost
        if ncrb_match:
            _thought("threat", "NCRB hotspot zone — baseline elevated")
            threat_level = min(threat_level + 1, 5)

        _thought("threat", f"THREAT LEVEL {threat_level}/5 — {result.get('threat_summary', 'assessed')}")

        updates["threat_level"] = threat_level
        updates["threat_summary"] = result.get("threat_summary", "Threat assessed")
        updates["threat_context"] = {
            "keywords": keywords,
            "time_risk": time_risk,
            "confidence": result.get("confidence", 0.7),
        }
        updates["threat_reasoning"] = result.get("reasoning", "LLM assessment")
    else:
        # Fallback
        _thought("threat", "LLM unavailable — defaulting to medium-high threat")
        threat_level = 3
        if ncrb_match:
            threat_level = 4
            _thought("threat", "NCRB hotspot zone — baseline elevated to 4")

        updates["threat_level"] = threat_level
        updates["threat_summary"] = "Unable to assess — defaulting to medium-high"
        updates["threat_context"] = {"keywords": [], "time_risk": "medium", "confidence": 0.5}
        updates["threat_reasoning"] = "LLM fallback — all API keys exhausted or unavailable"

    updates["completed_agents"] = ["threat"]
    return updates


async def _call_groq_llm(user_message: str) -> dict:
    """Call Groq LLM with key rotation. Returns parsed JSON or None."""
    keys = _get_groq_keys()

    if not keys:
        logger.warning("No Groq API keys configured")
        return None

    try:
        from groq import AsyncGroq
    except ImportError:
        logger.error("groq package not installed")
        return None

    for i, key in enumerate(keys):
        try:
            client = AsyncGroq(api_key=key)
            response = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.3,
                max_tokens=500,
            )

            content = response.choices[0].message.content.strip()

            # Strip markdown code fences if present
            if content.startswith("```"):
                content = content.split("\n", 1)[-1]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

            return json.loads(content)

        except json.JSONDecodeError as e:
            logger.warning(f"Groq key {i+1}: JSON parse error: {e}")
            continue
        except Exception as e:
            error_str = str(e).lower()
            if "rate_limit" in error_str or "429" in error_str:
                logger.warning(f"Groq key {i+1}: rate limited, rotating...")
                continue
            logger.error(f"Groq key {i+1} failed: {e}")
            continue

    return None
