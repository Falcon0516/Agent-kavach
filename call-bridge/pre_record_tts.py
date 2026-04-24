import pyttsx3
import os

def pre_record_messages():
    print("[🎙] Pre-recording TTS fallback audio files...")
    engine = pyttsx3.init()
    engine.setProperty("rate", 155)
    
    output_dir = os.path.join(os.path.dirname(__file__), "recordings")
    os.makedirs(output_dir, exist_ok=True)
    
    messages = {
        "emergency_fallback.wav": "KAVACH ALERT. Threat detected. Police response required immediately. System operating on offline fallback.",
        "follow_up_fallback.wav": "KAVACH follow-up. Location stable. Evidence recorded. Awaiting arrival."
    }
    
    for filename, text in messages.items():
        path = os.path.join(output_dir, filename)
        engine.save_to_file(text, path)
        print(f"[✅] Saved {filename}")
        
    engine.runAndWait()
    print("Done pre-recording.")

if __name__ == "__main__":
    pre_record_messages()
