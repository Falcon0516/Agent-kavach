"""
KAVACH WhatsApp & SMS Tool
Twilio-based messaging for family alerts and SMS trigger replies.
"""
import os
import logging

logger = logging.getLogger("kavach.whatsapp")


async def send_whatsapp(to_number: str, message: str) -> dict:
    """Send a WhatsApp message via Twilio.
    Returns {success: bool, sid: str, error: str}
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

    if not account_sid or not auth_token:
        logger.warning("Twilio credentials not set — skipping WhatsApp send")
        return {"success": False, "sid": "", "error": "Twilio credentials not configured"}

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)

        # Ensure WhatsApp prefix
        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"
        if not from_number.startswith("whatsapp:"):
            from_number = f"whatsapp:{from_number}"

        msg = client.messages.create(
            body=message,
            from_=from_number,
            to=to_number,
        )
        logger.info(f"WhatsApp sent to {to_number}: SID={msg.sid}")
        return {"success": True, "sid": msg.sid, "error": ""}

    except ImportError:
        logger.error("twilio package not installed")
        return {"success": False, "sid": "", "error": "twilio package not installed"}
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return {"success": False, "sid": "", "error": str(e)}


async def send_sms(to_number: str, message: str) -> dict:
    """Send a regular SMS via Twilio (not WhatsApp).
    Used for SMS fallback trigger confirmations.
    Returns {success: bool, sid: str, error: str}
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_SMS_FROM", "")

    if not account_sid or not auth_token:
        logger.warning("Twilio credentials not set — skipping SMS send")
        return {"success": False, "sid": "", "error": "Twilio credentials not configured"}

    try:
        from twilio.rest import Client

        client = Client(account_sid, auth_token)

        # Strip WhatsApp prefix if present
        if to_number.startswith("whatsapp:"):
            to_number = to_number.replace("whatsapp:", "")

        msg = client.messages.create(
            body=message,
            from_=from_number,
            to=to_number,
        )
        logger.info(f"SMS sent to {to_number}: SID={msg.sid}")
        return {"success": True, "sid": msg.sid, "error": ""}

    except ImportError:
        logger.error("twilio package not installed")
        return {"success": False, "sid": "", "error": "twilio package not installed"}
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        return {"success": False, "sid": "", "error": str(e)}
