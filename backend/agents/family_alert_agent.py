"""
KAVACH Family Alert Agent (Agent 02)
LLM: llama3.1-8b via Cerebras for bilingual WhatsApp message generation.
Fallback: pure Python template.
"""
import logging
import os

from tools.whatsapp_tool import send_whatsapp

logger = logging.getLogger("kavach.family_alert")

push_thought = None


def set_push_thought(fn):
    global push_thought
    push_thought = fn


def _thought(agent: str, msg: str):
    if push_thought:
        push_thought(agent, msg)
    logger.info(f"[{agent}] {msg}")


async def family_alert_node(state: dict) -> dict:
    """Generate bilingual WhatsApp alert and send to family."""
    _thought("family_alert", "Composing bilingual emergency alert...")

    victim_name = state.get("victim_name", "User")
    threat_level = state.get("threat_level", 3)
    lat = state.get("gps_lat", 0)
    lon = state.get("gps_lon", 0)
    victim_phone = state.get("victim_phone", "")
    timestamp = state.get("timestamp", "")
    call_recording_url = state.get("call_recording_url", "")

    maps_link = f"https://maps.google.com/?q={lat},{lon}"

    # Try Cerebras LLM for bilingual message
    message = await _generate_message_cerebras(
        victim_name, threat_level, maps_link, timestamp, call_recording_url
    )

    if not message:
        # Fallback: pure Python template
        _thought("family_alert", "Cerebras unavailable — using template fallback")
        message = _fallback_message(victim_name, threat_level, maps_link, timestamp, call_recording_url)

    updates = {}
    updates["whatsapp_message"] = message
    _thought("family_alert", f"Alert message: \"{message[:120]}...\"" if len(message) > 120 else f"Alert message: \"{message}\"")

    # Send WhatsApp
    if victim_phone:
        _thought("family_alert", f"Sending WhatsApp alert to {victim_phone}...")
        result = await send_whatsapp(victim_phone, message)
        updates["whatsapp_sid"] = result.get("sid", "")
        updates["family_alerted"] = result.get("success", False)

        if result["success"]:
            _thought("family_alert", f"✅ WhatsApp delivered — SID: {result['sid']}")
        else:
            _thought("family_alert", f"⚠ WhatsApp failed: {result.get('error', 'unknown')} — alert stored for retry")
            updates["family_alerted"] = False
    else:
        _thought("family_alert", "⚠ No family phone number — alert stored but not sent")
        updates["family_alerted"] = False
        updates["whatsapp_sid"] = ""

    updates["family_reasoning"] = "Bilingual alert composed and dispatched via WhatsApp"
    updates["completed_agents"] = ["family_alert"]
    return updates


async def _generate_message_cerebras(
    name: str, level: int, maps_link: str, timestamp: str, recording_url: str
) -> str:
    """Generate bilingual alert using Cerebras llama3.1-8b."""
    api_key = os.getenv("CEREBRAS_API_KEY", "")
    if not api_key:
        logger.warning("CEREBRAS_API_KEY not set")
        return ""

    try:
        from cerebras.cloud.sdk import AsyncCerebras

        client = AsyncCerebras(api_key=api_key)

        system_prompt = (
            "Write a concise bilingual WhatsApp alert (English + Hindi). Include victim name, KAVACH "
            "activated, threat level, GPS link, time. "
        )
        if recording_url:
            system_prompt += f"Append: '📎 Recording: {recording_url}'. "
        system_prompt += "Max 220 chars. Output ONLY message text."

        user_msg = (
            f"Name: {name}, Threat Level: {level}/5, "
            f"GPS: {maps_link}, Time: {timestamp}"
        )

        response = await client.chat.completions.create(
            model="llama3.1-8b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=200,
            temperature=0.4,
        )

        return response.choices[0].message.content.strip()

    except ImportError:
        logger.error("cerebras-cloud-sdk not installed")
        return ""
    except Exception as e:
        logger.error(f"Cerebras call failed: {e}")
        return ""


def _fallback_message(
    name: str, level: int, maps_link: str, timestamp: str, recording_url: str
) -> str:
    """Pure Python fallback bilingual alert template."""
    emoji = "🔴" if level >= 4 else "🟠" if level >= 3 else "🟡"
    msg = (
        f"{emoji} KAVACH ALERT {emoji}\n"
        f"{name} needs help! / {name} ko madad chahiye!\n"
        f"Threat: {level}/5 | Time: {timestamp}\n"
        f"📍 {maps_link}"
    )
    if recording_url:
        msg += f"\n📎 Recording: {recording_url}"
    return msg
