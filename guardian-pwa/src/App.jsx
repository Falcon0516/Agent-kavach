import React, { useState, useEffect, useRef } from 'react';
import RegistrationScreen from './components/RegistrationScreen';
import FakeCallScreen from './components/FakeCallScreen';
import SOSButton from './components/SOSButton';
import VoiceTrigger from './components/VoiceTrigger';
import ShakeTrigger from './components/ShakeTrigger';
import VolumeButtonTrigger from './components/VolumeButtonTrigger';
import StatusDisplay from './components/StatusDisplay';
import MapView from './components/MapView';
import GreenCorridorNav from './components/GreenCorridorNav';
import TrustedContacts from './components/TrustedContacts';
import SafeWalk from './components/SafeWalk';
import { sendSMSFallback } from './components/SMSFallback';
import { HeartbeatService } from './services/HeartbeatService';

const API_BASE = `http://${import.meta.env.VITE_MSI_IP || 'localhost'}:8000`;

export default function App() {
  const [screen, setScreen] = useState('map');
  const [triggered, setTriggered] = useState(false);
  const [statusVisible, setStatusVisible] = useState(false);
  const [silentMode, setSilentMode] = useState(false);
  const [sosHistory, setSosHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef(null);
  const sessionIdRef = useRef('');

  useEffect(() => {
    const reg = localStorage.getItem("kavach_reg");
    if (!reg) setScreen('register');
    // Load SOS history
    const hist = JSON.parse(localStorage.getItem("kavach_sos_history") || "[]");
    setSosHistory(hist);
    // Load silent mode
    setSilentMode(localStorage.getItem("kavach_silent") === "true");
    const hb = new HeartbeatService();
    hb.start();
    return () => hb.stop();
  }, []);

  // ─── Audio Evidence Recording ───
  const startAudioRecording = async (sessionId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = recorder;
      sessionIdRef.current = sessionId;
      setIsRecording(true);

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const formData = new FormData();
          formData.append('audio', e.data, 'chunk.webm');
          formData.append('session_id', sessionId);
          formData.append('timestamp', new Date().toISOString());
          try {
            await fetch(`${API_BASE}/api/audio_chunk`, { method: 'POST', body: formData });
          } catch (err) { /* non-fatal */ }
        }
      };

      recorder.start(5000); // 5-second chunks
    } catch (e) {
      console.log("Audio recording not available");
    }
  };

  const stopAudioRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      recorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
  };

  // ─── SOS Trigger ───
  const triggerAlert = async (type) => {
    if (triggered) return;
    setTriggered(true);

    const sessionId = `sos_${Date.now()}`;

    // Start continuous audio recording
    startAudioRecording(sessionId);

    // Quick 4-sec audio capture for initial evidence
    let audioB64 = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.start();
      await new Promise(r => setTimeout(r, 4000));
      recorder.stop();
      await new Promise(r => recorder.onstop = r);
      const blob = new Blob(chunks, { type: "audio/webm" });
      const ab = await blob.arrayBuffer();
      audioB64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      stream.getTracks().forEach(t => t.stop());
    } catch (e) { console.log("Audio capture skipped"); }

    let lat = 13.0827, lon = 77.5877;
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
      );
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    } catch (e) {}

    const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
    const contacts = JSON.parse(localStorage.getItem("kavach_contacts") || "[]");
    const body = {
      trigger_type: type, lat, lon, timestamp: new Date().toISOString(),
      victim_name: reg.name || import.meta.env.VITE_VICTIM_NAME,
      victim_phone: reg.familyPhone || import.meta.env.VITE_FAMILY_PHONE,
      audio_b64: audioB64,
      trusted_contacts: contacts.map(c => c.phone),
    };

    // Save to SOS history
    const histEntry = { type, lat, lon, time: new Date().toISOString(), status: 'sent' };
    const newHist = [histEntry, ...sosHistory].slice(0, 20);
    setSosHistory(newHist);
    localStorage.setItem("kavach_sos_history", JSON.stringify(newHist));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const resp = await fetch(`${API_BASE}/api/trigger`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error("Server error");
      if (!silentMode) {
        setScreen("map");
        setStatusVisible(true);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.log("POST failed — SMS fallback activated");
      sendSMSFallback(lat, lon);
    }

    // Auto-reset after 30 seconds
    setTimeout(() => { setTriggered(false); stopAudioRecording(); }, 30000);
  };

  // ─── Screen routing ───
  if (screen === 'register') return <RegistrationScreen onRegister={() => setScreen('map')} silentMode={silentMode} setSilentMode={setSilentMode} />;
  if (screen === 'fake_call') return <FakeCallScreen onExit={(target) => {
    setScreen(target === 'kavach_status' ? 'map' : 'map');
    if (target === 'kavach_status') setStatusVisible(true);
  }} />;

  return (
    <div className="h-screen flex flex-col font-sans" style={{ background: '#02080f', color: '#e2e8f0' }}>
      <ShakeTrigger onTrigger={triggerAlert} />
      <VolumeButtonTrigger onTrigger={triggerAlert} />

      {/* Recording indicator */}
      {isRecording && (
        <div className="fixed top-3 right-3 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(225,29,72,0.2)', border: '1px solid rgba(225,29,72,0.5)', color: '#e11d48' }}>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Recording...
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 overflow-hidden relative">
        {screen === 'map' && (
          <>
            {statusVisible ? (
              <div className="h-full p-4 overflow-y-auto">
                <StatusDisplay onClose={() => setStatusVisible(false)} />
              </div>
            ) : (
              <MapView />
            )}
          </>
        )}

        {screen === 'navigate' && (
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
              <span className="text-base">🧭</span>
              <h2 className="text-xs font-bold tracking-widest uppercase"
                style={{ color: '#22c55e' }}>Green Corridor Navigation</h2>
            </div>
            <div className="flex-1 overflow-hidden">
              <GreenCorridorNav />
            </div>
          </div>
        )}

        {screen === 'safe_spaces' && (
          <div className="h-full flex flex-col">
            <div className="p-4 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
              <span className="text-lg">🚶‍♀️</span>
              <h2 className="text-sm font-bold tracking-wide" style={{ color: '#22c55e' }}>SAFE WALK</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SafeWalk onTriggerSOS={triggerAlert} />
            </div>
          </div>
        )}

        {screen === 'history' && (
          <div className="h-full flex flex-col">
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(225,29,72,0.15)' }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h2 className="text-sm font-bold tracking-wide" style={{ color: '#e11d48' }}>SOS HISTORY</h2>
              </div>
              <button onClick={() => setScreen('register')} className="text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                ⚙️ Settings
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Voice Trigger Status */}
              <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <VoiceTrigger onTrigger={triggerAlert} />
              </div>

              {sosHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 opacity-40">
                  <span className="text-3xl mb-2">🛡</span>
                  <p className="text-xs" style={{ color: '#64748b' }}>No SOS events yet. Stay safe!</p>
                </div>
              ) : (
                sosHistory.map((h, i) => (
                  <div key={i} className="p-3 rounded-xl flex items-center gap-3" style={{ background: 'rgba(225,29,72,0.05)', border: '1px solid rgba(225,29,72,0.15)' }}>
                    <span className="text-lg">🚨</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold" style={{ color: '#e11d48' }}>{h.type?.toUpperCase()}</div>
                      <div className="text-[10px]" style={{ color: '#64748b' }}>{new Date(h.time).toLocaleString()}</div>
                    </div>
                    <a href={`https://maps.google.com/?q=${h.lat},${h.lon}`} target="_blank" rel="noopener" className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(88,166,255,0.1)', color: '#58a6ff' }}>
                      📍 Map
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ FLOATING SOS BUTTON ═══ */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[5000]">
        <button
          onTouchStart={() => { triggerAlert("sos_button"); }}
          onClick={() => { triggerAlert("sos_button"); }}
          disabled={triggered}
          className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          style={{
            background: triggered ? '#991b1b' : 'linear-gradient(135deg, #e11d48, #be123c)',
            boxShadow: triggered ? '0 0 30px rgba(225,29,72,0.8)' : '0 0 20px rgba(225,29,72,0.4), 0 4px 12px rgba(0,0,0,0.5)',
            border: '3px solid rgba(255,255,255,0.15)',
          }}
        >
          {triggered ? (
            <span className="text-white text-xs font-bold animate-pulse">SENT</span>
          ) : (
            <span className="text-white text-lg font-black">SOS</span>
          )}
        </button>
      </div>

      {/* ═══ BOTTOM NAVIGATION ═══ */}
      <nav className="flex items-center justify-around py-2.5 px-2 z-[4000]" style={{ background: 'rgba(2,8,15,0.95)', borderTop: '1px solid rgba(225,29,72,0.15)', backdropFilter: 'blur(12px)' }}>
        {[
          { id: 'map', icon: '🗺', label: 'Map' },
          { id: 'navigate', icon: '🧭', label: 'Navigate' },
          { id: 'safe_spaces', icon: '🏥', label: 'Safe Spaces' },
          { id: 'history', icon: '📋', label: 'History' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setScreen(tab.id)}
            className="flex flex-col items-center gap-0.5 min-w-[60px] transition-all"
            style={{
              color: screen === tab.id ? '#e11d48' : '#475569',
              transform: screen === tab.id ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-[10px] font-semibold tracking-wide">{tab.label}</span>
            {screen === tab.id && <div className="w-4 h-0.5 rounded-full mt-0.5" style={{ background: '#e11d48' }} />}
          </button>
        ))}
      </nav>
    </div>
  );
}
