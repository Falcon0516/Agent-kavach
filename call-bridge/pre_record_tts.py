"""
KAVACH Pre-Record TTS
=======================
Run once to generate pre-recorded WAV audio fallbacks.
These files can be played manually if Phone Link or VB-Cable fails during demo.

Usage:  python pre_record_tts.py

Generates:
  recordings/kavach_threat_brief.wav     — Full 12-second threat brief
  recordings/kavach_alert_short.wav      — 4-second short alert
  recordings/kavach_followup.wav         — Callback follow-up brief
"""

import os
import pyttsx3

RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)


def generate_audio(filename: str, text: str, rate: int = 155):
    """Generate a WAV file from text using pyttsx3."""
    filepath = os.path.join(RECORDINGS_DIR, filename)

    engine = pyttsx3.init()
    engine.setProperty("rate", rate)
    engine.setProperty("volume", 1.0)
    voices = engine.getProperty("voices")
    if voices:
        engine.setProperty("voice", voices[0].id)

    engine.save_to_file(text, filepath)
    engine.runAndWait()

    if os.path.exists(filepath):
        size = os.path.getsize(filepath)
        print(f"  [OK] Generated {filename} -- {size:,} bytes")
    else:
        print(f"  [FAIL] Failed to generate {filename}")

    return filepath


def main():
    print("=" * 60)
    print("  KAVACH PRE-RECORD TTS -- GENERATING FALLBACK AUDIO")
    print(f"  Output: {RECORDINGS_DIR}")
    print("=" * 60)
    print()

    # -- 1. Full Threat Brief (~12 seconds) --------------------------
    threat_brief = (
        "KAVACH ALERT. KAVACH ALERT. "
        "This is the KAVACH AI Safety System. "
        "Threat level 4 of 5. "
        "A violent threat has been detected near the victim's location. "
        "Victim location: KSIT Campus, Raghuvanahalli, Bengaluru. "
        "Argus camera evidence is being collected. "
        "FIR is being auto-filed. "
        "Immediate police response required. "
        "This is an automated KAVACH alert. Over."
    )
    generate_audio("kavach_threat_brief.wav", threat_brief, rate=155)

    # ── 2. Short Alert (~4 seconds) ────────────────────────────────
    short_alert = (
        "KAVACH ALERT. Threat Level 4. Police responding."
    )
    generate_audio("kavach_alert_short.wav", short_alert, rate=155)

    # ── 3. Callback Follow-Up Brief ────────────────────────────────
    followup = (
        "KAVACH follow-up brief. "
        "Victim location unchanged. "
        "Argus cameras active and recording. "
        "FIR has been filed. "
        "KAVACH system standing by."
    )
    generate_audio("kavach_followup.wav", followup, rate=155)

    print()
    print("-" * 60)
    print("  All audio fallbacks generated.")
    print()
    print("  To play (Windows):")
    print(f'    start {os.path.join(RECORDINGS_DIR, "kavach_threat_brief.wav")}')
    print()
    print("  Use these as fallback if Phone Link or VB-Cable fails.")
    print("-" * 60)


if __name__ == "__main__":
    main()
