# whatsapp_server.py — SAATHI AgriChain Backend v4.1
# Fix: robust Pydantic models (Optional fields), CORS *, SSE endpoint
# Run: python whatsapp_server.py

import os
import json
import hashlib
import threading
from typing import List, Optional, Any
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq
from twilio.rest import Client as TwilioClient
from session_manager import SessionStore

try:
    from sector_router import classify_sector, SECTOR_SYSTEM_PROMPTS
    from intent_router import route
    HAS_SECTOR_ROUTER = True
except ImportError:
    HAS_SECTOR_ROUTER = False
    print("[WARN] sector_router / intent_router not found — WhatsApp text will use direct LLM")

env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(env_path, override=True)

# ── Clients ──────────────────────────────────────────────────────
groq_client   = Groq(api_key=os.getenv("GROQ_API_KEY"))
TWILIO_SID    = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM   = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

try:
    twilio_client = TwilioClient(TWILIO_SID, TWILIO_TOKEN)
except Exception:
    twilio_client = None
    print("[WARN] Twilio client init failed — WhatsApp send disabled")

wa_sessions = SessionStore()
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="SAATHI AgriChain v4.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # must be False with allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    app.mount("/reports", StaticFiles(directory=REPORTS_DIR), name="reports")
except Exception:
    pass

# ── In-memory stores ──────────────────────────────────────────────
chat_history:      List[dict] = []
blockchain_events: List[dict] = []
call_events_store: List[dict] = []

# ── Pydantic models (all Optional to be robust) ───────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class HashEvent(BaseModel):
    type: str
    data: Optional[dict] = {}
    timestamp: Optional[str] = None

class CallEvent(BaseModel):
    event: str
    data: Optional[dict] = {}
    timestamp: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
#  CHAT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════
@app.post("/api/chat")
async def post_chat(msg: ChatMessage):
    chat_history.append({
        "role": msg.role,
        "content": msg.content,
        "ts": datetime.now().isoformat()
    })
    if len(chat_history) > 200:
        chat_history.pop(0)
    return {"status": "ok", "total": len(chat_history)}

@app.get("/api/chat")
async def get_chat():
    return {"messages": chat_history}


# ═══════════════════════════════════════════════════════════════════
#  BLOCKCHAIN HASH EVENTS
# ═══════════════════════════════════════════════════════════════════
@app.post("/api/hash_event")
async def post_hash_event(evt: HashEvent):
    ts = evt.timestamp or datetime.now().isoformat()
    record = {
        "type":       evt.type,
        "data":       evt.data or {},
        "timestamp":  ts,
        "short_hash": (evt.data or {}).get("hash", "")[:16] + "..."
    }
    blockchain_events.append(record)
    if len(blockchain_events) > 500:
        blockchain_events.pop(0)
    print(f"[📊] Hash event: {evt.type} | {record['short_hash']}")
    return {"status": "ok", "total": len(blockchain_events)}

@app.get("/api/blockchain_events")
async def get_blockchain_events():
    return {"events": blockchain_events, "count": len(blockchain_events)}


# ═══════════════════════════════════════════════════════════════════
#  CALL EVENTS
# ═══════════════════════════════════════════════════════════════════
@app.post("/api/call_event")
async def post_call_event(evt: CallEvent):
    ts = evt.timestamp or datetime.now().isoformat()
    record = {"event": evt.event, "data": evt.data or {}, "timestamp": ts}
    call_events_store.append(record)
    if len(call_events_store) > 200:
        call_events_store.pop(0)
    print(f"[📞] Call event: {evt.event}")
    return {"status": "ok"}

@app.get("/api/call_events")
async def get_call_events():
    return {"events": call_events_store, "count": len(call_events_store)}


# ═══════════════════════════════════════════════════════════════════
#  CALL STATS (legacy + enriched)
# ═══════════════════════════════════════════════════════════════════
@app.get("/api/call_stats")
async def get_call_stats():
    try:
        from call_state import call_stats
        stats = dict(call_stats)
    except Exception:
        stats = {}
    stats["recent_hashes"] = blockchain_events[-5:]
    stats["total_blockchain_events"] = len(blockchain_events)
    return stats


# ═══════════════════════════════════════════════════════════════════
#  SSE — Server-Sent Events (real-time push)
#  FIX: sends full current snapshot immediately on connect so the
#  dashboard is never blank, then streams diffs every second.
# ═══════════════════════════════════════════════════════════════════
import asyncio

@app.get("/api/stream")
async def stream_events(request: Request):
    """
    SSE stream. Dashboard subscribes for push-based real-time updates.
    On connect: emits a full snapshot of all current data immediately.
    Then: emits only new events as diffs every second.
    Heartbeat keeps connection alive when there is nothing new.
    """
    async def event_generator():
        # ── FIX: send full snapshot on connect so dashboard is never blank ──
        snapshot = {}
        if chat_history:
            snapshot["chat"] = chat_history[:]
        if blockchain_events:
            snapshot["blockchain"] = blockchain_events[:]
        if call_events_store:
            snapshot["calls"] = call_events_store[:]
        if snapshot:
            yield f"data: {json.dumps(snapshot)}\n\n"

        # Track how many items we've already sent so we only push diffs
        last_chat = len(chat_history)
        last_hash = len(blockchain_events)
        last_call = len(call_events_store)

        while True:
            if await request.is_disconnected():
                break

            updates = {}

            if len(chat_history) > last_chat:
                updates["chat"] = chat_history[last_chat:]
                last_chat = len(chat_history)

            if len(blockchain_events) > last_hash:
                updates["blockchain"] = blockchain_events[last_hash:]
                last_hash = len(blockchain_events)

            if len(call_events_store) > last_call:
                updates["calls"] = call_events_store[last_call:]
                last_call = len(call_events_store)

            if updates:
                yield f"data: {json.dumps(updates)}\n\n"
            else:
                yield f": heartbeat\n\n"   # keep-alive

            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ═══════════════════════════════════════════════════════════════════
#  DASHBOARD / UI
# ═══════════════════════════════════════════════════════════════════
@app.get("/dashboard")
async def serve_dashboard():
    for candidate in [
        os.path.join(os.path.dirname(__file__), "ui", "dashboard.html"),
        os.path.join(os.path.dirname(__file__), "dashboard.html"),
    ]:
        if os.path.exists(candidate):
            return FileResponse(candidate)
    return PlainTextResponse("Put dashboard.html in /ui/dashboard.html", status_code=404)

@app.get("/chat")
async def serve_chat_ui():
    p = os.path.join(os.path.dirname(__file__), "ui", "index.html")
    if os.path.exists(p):
        return FileResponse(p)
    return PlainTextResponse("UI not found", status_code=404)


# ═══════════════════════════════════════════════════════════════════
#  WHATSAPP WEBHOOK
# ═══════════════════════════════════════════════════════════════════
GREETINGS = {'hi','hello','hey','hii','namaste','namaskar','good morning',
             'good evening','howdy','sup','yo','ok','okay','thanks','thank you',
             'bye','hola','salam'}

def is_just_greeting(msg: str) -> bool:
    clean = msg.strip().lower()
    if clean in GREETINGS: return True
    if len(clean.split()) <= 2 and any(clean.startswith(g) for g in GREETINGS): return True
    return False

def detect_language(message: str) -> str:
    try:
        r = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role":"user","content":f'Language? ONE word (english/hindi/kannada/tamil/telugu): "{message}"'}],
            temperature=0.0, max_tokens=5
        )
        lang = r.choices[0].message.content.strip().lower()
        return lang if lang in ["english","hindi","kannada","tamil","telugu"] else "english"
    except: return "english"

def extract_crop_from_message(message: str) -> str:
    msg = message.lower()
    for crop in ["rice","wheat","maize","tomato","onion","potato","sugarcane","cotton",
                 "groundnut","soybean","mustard","chickpea","ragi","bajra","sorghum",
                 "banana","mango","coconut","tea","coffee","chilli","turmeric","ginger"]:
        if crop in msg: return crop
    return "rice"

def handle_soil_image_async(media_url, from_number, user_message, base_url):
    try:
        send_whatsapp(from_number, "📸 Received your soil photo! Analyzing now...\n⏳ ~20-30 seconds.")
        language  = detect_language(user_message) if user_message else "english"
        crop_type = extract_crop_from_message(user_message) if user_message else "rice"
        from soil_analyzer import download_twilio_image, analyze_soil_image, format_soil_result_for_whatsapp
        image_path  = download_twilio_image(media_url, TWILIO_SID, TWILIO_TOKEN)
        result      = analyze_soil_image(image_path=image_path, crop_type=crop_type, language=language)
        send_whatsapp(from_number, format_soil_result_for_whatsapp(result, crop_type))
        from report_generator import generate_soil_pdf
        pdf_path = generate_soil_pdf(soil_result=result, crop_type=crop_type, language=language, farmer_phone=from_number)
        pdf_url  = f"{base_url}/reports/{os.path.basename(pdf_path)}"
        send_whatsapp_with_media(from_number, "📄 Detailed Soil Analysis Report:", pdf_url)
    except Exception as e:
        print(f"[❌ Soil] {e}")
        send_whatsapp(from_number, f"⚠️ Couldn't analyze soil image. Error: {str(e)[:80]}.")

@app.post("/whatsapp")
async def handle_whatsapp(request: Request):
    form      = await request.form()
    user_msg  = form.get("Body", "").strip()
    from_num  = form.get("From", "")
    num_media = int(form.get("NumMedia", 0))

    print(f"\n[📱] From: {from_num} | Msg: {user_msg}")

    if num_media > 0:
        media_url  = form.get("MediaUrl0", "")
        media_type = form.get("MediaContentType0", "")
        if "image" in media_type:
            base_url = str(request.base_url).rstrip("/")
            threading.Thread(target=handle_soil_image_async,
                args=(media_url, from_num, user_msg, base_url), daemon=True).start()
        else:
            send_whatsapp(from_num, "⚠️ Please send an image file for soil analysis.")
        return PlainTextResponse("OK", status_code=200)

    if not user_msg:
        return PlainTextResponse("OK", status_code=200)

    session = wa_sessions.get_or_create(from_num)

    if is_just_greeting(user_msg):
        send_whatsapp(from_num, "🙏 Namaste! I am SAATHI, your AgriChain assistant.\n\n🌾 Agriculture — crops, mandi, MSP\n📸 Soil Analysis — send a photo\n🏥 Healthcare\n\nWhat do you need?")
        return PlainTextResponse("OK", status_code=200)

    if HAS_SECTOR_ROUTER:
        sector = classify_sector(user_msg, session.conversation_history)
        if not session.sector_confirmed:
            session.update_sector(sector, SECTOR_SYSTEM_PROMPTS)
        kb_result = route(sector=sector, user_message=user_msg)
    else:
        sector    = "agriculture"
        kb_result = {"data": None}

    session.conversation_history.append({"role": "user", "content": user_msg})

    if kb_result.get("data"):
        ctx      = json.dumps(kb_result["data"], ensure_ascii=False, indent=2)
        enriched = f"[DATA]\n{ctx}\n\n[USER]\n{user_msg}\n\nRespond as SAATHI, concise, WhatsApp-friendly."
    else:
        enriched = user_msg

    try:
        resp  = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=session.conversation_history[:-1] + [{"role":"user","content":enriched}],
            temperature=0.3, max_tokens=300
        )
        reply = resp.choices[0].message.content
    except Exception as e:
        reply = "Sorry, error. Please try again."

    session.conversation_history.append({"role": "assistant", "content": reply})
    send_whatsapp(from_num, reply)
    return PlainTextResponse("OK", status_code=200)


# ═══════════════════════════════════════════════════════════════════
#  TWILIO HELPERS
# ═══════════════════════════════════════════════════════════════════
def send_whatsapp(to: str, body: str):
    if not twilio_client: return
    try:
        if not to.startswith("whatsapp:"): to = f"whatsapp:{to}"
        msg = twilio_client.messages.create(from_=TWILIO_FROM, to=to, body=body)
        print(f"[✅] WA sent {msg.sid}")
    except Exception as e:
        print(f"[❌ Twilio] {e}")

def send_whatsapp_with_media(to: str, body: str, media_url: str):
    if not twilio_client: return
    try:
        if not to.startswith("whatsapp:"): to = f"whatsapp:{to}"
        msg = twilio_client.messages.create(from_=TWILIO_FROM, to=to, body=body, media_url=[media_url])
        print(f"[✅] WA media sent {msg.sid}")
    except Exception as e:
        print(f"[❌ Twilio media] {e}")


# ═══════════════════════════════════════════════════════════════════
#  HEALTH + DEBUG
# ═══════════════════════════════════════════════════════════════════
@app.get("/")
async def health():
    return {
        "status": "SAATHI AgriChain v4.1 — running",
        "counts": {
            "chat_messages":     len(chat_history),
            "blockchain_events": len(blockchain_events),
            "call_events":       len(call_events_store)
        },
        "endpoints": {
            "dashboard":         "/dashboard",
            "chat_post":         "POST /api/chat",
            "chat_get":          "GET /api/chat",
            "hash_event_post":   "POST /api/hash_event",
            "blockchain_events": "GET /api/blockchain_events",
            "call_event_post":   "POST /api/call_event",
            "call_events_get":   "GET /api/call_events",
            "call_stats":        "GET /api/call_stats",
            "sse_stream":        "GET /api/stream"
        }
    }

# Quick test endpoint — inject a fake hash event for dashboard testing
@app.post("/api/test/farmer")
async def test_farmer():
    import hashlib, time
    ts  = datetime.now().isoformat()
    fid = f"SJBT-FRM-TUM-{int(time.time())}"
    h   = hashlib.sha256(f"FARMER|{fid}|TEST|{ts}".encode()).hexdigest()
    evt = HashEvent(type="FARMER_REGISTRATION", timestamp=ts, data={
        "farmer_id": fid, "hash": h, "caller": "+91TEST",
        "district": "TUMKUR", "language": "kn-IN", "status": "pending_verification"
    })
    return await post_hash_event(evt)

@app.post("/api/test/harvest")
async def test_harvest():
    import hashlib, time
    ts  = datetime.now().isoformat()
    tid = f"PRODUCE-TOKEN-RAGI-{int(time.time())}"
    h   = hashlib.sha256(f"HARVEST|AGRI-TEST|RAGI|1200.00|{ts}".encode()).hexdigest()
    evt = HashEvent(type="HARVEST_TOKEN", timestamp=ts, data={
        "token_id": tid, "hash": h, "farmer_id": "AGRI-TEST123",
        "caller": "+91TEST", "crop": "ragi", "quantity_kg": 1200
    })
    return await post_hash_event(evt)


if __name__ == "__main__":
    import uvicorn
    print("=" * 55)
    print("  SAATHI AgriChain Backend v4.1")
    print("  http://localhost:8002/dashboard")
    print("  http://localhost:8002/          ← health + endpoint list")
    print("  POST /api/test/farmer           ← inject test farmer event")
    print("  POST /api/test/harvest          ← inject test harvest event")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=8002)