import React, { useState, useEffect } from 'react';
import RegistrationScreen from './components/RegistrationScreen';
import FakeCallScreen from './components/FakeCallScreen';
import SOSButton from './components/SOSButton';
import VoiceTrigger from './components/VoiceTrigger';
import ShakeTrigger from './components/ShakeTrigger';
import VolumeButtonTrigger from './components/VolumeButtonTrigger';
import StatusDisplay from './components/StatusDisplay';
import MapView from './components/MapView';
import TrustedContacts from './components/TrustedContacts';
import { sendSMSFallback } from './components/SMSFallback';
import { HeartbeatService } from './services/HeartbeatService';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [triggered, setTriggered] = useState(false);
  const [statusVisible, setStatusVisible] = useState(false);
  
  useEffect(() => {
    const reg = localStorage.getItem("kavach_reg");
    if (!reg) setScreen('register');
    
    const hb = new HeartbeatService();
    hb.start();
    return () => hb.stop();
  }, []);

  const triggerAlert = async (type) => {
    if (triggered) return;
    setTriggered(true);
    
    let audioB64 = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.start();
      await new Promise(r => setTimeout(r, 4000));
      recorder.stop();
      await new Promise(r => recorder.onstop = r);
      const blob = new Blob(chunks, {type: "audio/webm"});
      const ab = await blob.arrayBuffer();
      audioB64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      stream.getTracks().forEach(t => t.stop());
    } catch(e) { console.log("Audio capture skipped"); }
    
    let lat = 13.0827, lon = 77.5877;
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {timeout: 3000})
      );
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
    } catch(e) {}
    
    const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
    const body = {
      trigger_type: type, lat, lon, timestamp: new Date().toISOString(),
      victim_name: reg.name || import.meta.env.VITE_VICTIM_NAME,
      victim_phone: reg.familyPhone || import.meta.env.VITE_FAMILY_PHONE,
      audio_b64: audioB64
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const resp = await fetch(`http://${import.meta.env.VITE_MSI_IP || "localhost"}:8000/api/trigger`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body), signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error("Server error");
      if (screen !== "fake_call") {
         setScreen("home");
         setStatusVisible(true);
      }
    } catch(e) {
      clearTimeout(timeoutId);
      console.log("POST failed — SMS fallback activated");
      sendSMSFallback(lat, lon);
    }
  };

  if (screen === 'register') return <RegistrationScreen onRegister={() => setScreen('home')} />;
  if (screen === 'fake_call') return <FakeCallScreen onExit={(target) => {
      setScreen(target === 'kavach_status' ? 'home' : 'home');
      if (target === 'kavach_status') setStatusVisible(true);
  }} />;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
      <ShakeTrigger onTrigger={triggerAlert} />
      <VolumeButtonTrigger onTrigger={triggerAlert} />

      {screen === 'home' && (
        <div className="flex-1 flex flex-col p-6 items-center w-full">
          <div className="w-full flex justify-between items-center mb-10 pt-4">
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 drop-shadow-sm">🛡 KAVACH</h1>
            <button onClick={() => setScreen('register')} className="text-gray-400 hover:text-white transition text-sm flex items-center gap-1">⚙️ Settings</button>
          </div>
          
          <div className="w-full h-24 flex items-center justify-center mb-8">
            <VoiceTrigger onTrigger={triggerAlert} />
          </div>
          
          <div className="flex-1 w-full flex items-center justify-center">
            {!statusVisible ? (
               <SOSButton 
                 onTrigger={triggerAlert} 
                 onFakeCall={() => { triggerAlert("sos_long"); setScreen("fake_call"); }} 
               />
            ) : (
               <StatusDisplay onClose={() => setStatusVisible(false)} />
            )}
          </div>
        </div>
      )}

      {screen === 'map' && <MapView />}
      {screen === 'contacts' && <TrustedContacts />}

      <div className="bg-gray-800 p-4 border-t border-gray-700 flex justify-around items-center shadow-[0_-5px_20px_rgba(0,0,0,0.3)] z-[2000]">
        <button onClick={() => setScreen('home')} className={`flex flex-col items-center gap-1 w-20 transition ${screen==='home' ? 'text-pink-500':'text-gray-400 saturate-0'}`}>
          <span className="text-2xl drop-shadow-md">🛡</span>
          <span className="text-xs font-semibold tracking-wide">Home</span>
        </button>
        <button onClick={() => setScreen('map')} className={`flex flex-col items-center gap-1 w-20 transition ${screen==='map' ? 'text-pink-500':'text-gray-400 saturate-0'}`}>
          <span className="text-2xl drop-shadow-md">🗺</span>
          <span className="text-xs font-semibold tracking-wide">Route</span>
        </button>
        <button onClick={() => setScreen('contacts')} className={`flex flex-col items-center gap-1 w-20 transition ${screen==='contacts' ? 'text-pink-500':'text-gray-400 saturate-0'}`}>
          <span className="text-2xl drop-shadow-md">👥</span>
          <span className="text-xs font-semibold tracking-wide">Contacts</span>
        </button>
      </div>
    </div>
  );
}
