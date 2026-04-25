import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';

import AgentGraph from './components/AgentGraph';
import AgentThoughtPanel from './components/AgentThoughtPanel';
import AlertTimeline from './components/AlertTimeline';
import CameraPanel from './components/CameraPanel';
import ControlPanel from './components/ControlPanel';
import FIRPanel from './components/FIRPanel';
import NCRBPanel from './components/NCRBPanel';
import NavigationPanel from './components/NavigationPanel';
import SafeRouteMapPanel from './components/SafeRouteMapPanel';
import ThreatPanel from './components/ThreatPanel';
import WhatsAppPanel from './components/WhatsAppPanel';
import AudioThreatGauge from './components/AudioThreatGauge';
import AgentStateDiagram from './components/AgentStateDiagram';
import KavachStateMachine from './components/KavachStateMachine';
import MomentDiagram from './components/MomentDiagram';
import SafetyMapEditor from './components/SafetyMapEditor';
import PoliceDashboard from './PoliceDashboard';

// ═══════════════════════════════════════════════════════════
// MSI BACKEND CONFIG
// ═══════════════════════════════════════════════════════════
const MSI_IP = import.meta.env.VITE_MSI_IP || 'localhost';
const API_BASE = `http://${MSI_IP}:8000`;
const WS_URL = `ws://${MSI_IP}:8000/ws/thoughts`;

// ═══════════════════════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let db = null;
try {
  if (firebaseConfig.projectId) {
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
  }
} catch (e) {
  console.warn('Firebase init skipped:', e.message);
}

// ═══════════════════════════════════════════════════════════
// AGENT COLORS
// ═══════════════════════════════════════════════════════════
export const AGENT_COLORS = {
  supervisor: '#58a6ff',
  threat: '#ff6b6b',
  family_alert: '#51cf66',
  fir: '#fcc419',
  navigation: '#74c0fc',
  argus: '#cc5de8',
  ncrb: '#da77f2',
  system: '#8b949e',
};

// ═══════════════════════════════════════════════════════════
// KAVACH COMMAND CENTER
// ═══════════════════════════════════════════════════════════
function KavachCommandCenter() {
  const navigate = useNavigate();
  
  // Core state
  const [state, setState] = useState({});
  const [thoughts, setThoughts] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [alertActive, setAlertActive] = useState(false);
  const [threatZones, setThreatZones] = useState([]);
  const [mapData, setMapData] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [lastWsData, setLastWsData] = useState(null);

  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const mockModeRef = useRef(false);

  // ─── WebSocket connection ───
  useEffect(() => {
    function connectWS() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          console.log('[KAVACH] WebSocket connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setThoughts(prev => [...prev, { ...data, ts: Date.now() }]);
            if (data.type === 'audio_analysis') setLastWsData(data);

            // Auto-show map when navigation completes
            if (data.agent === 'navigation' && data.status === 'complete') {
              setShowMap(true);
            }
          } catch (e) {
            setThoughts(prev => [...prev, { agent: 'system', text: event.data, ts: Date.now() }]);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          console.log('[KAVACH] WebSocket disconnected, retrying in 3s...');
          setTimeout(connectWS, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (e) {
        console.warn('[KAVACH] WebSocket error:', e);
        setTimeout(connectWS, 3000);
      }
    }

    connectWS();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ─── Poll /api/full_state every 500ms ───
  useEffect(() => {
    async function pollState() {
      if (mockModeRef.current) return; // Don't overwrite mock data
      try {
        const res = await fetch(`${API_BASE}/api/full_state`);
        if (res.ok) {
          const data = await res.json();
          setState(prev => {
            // Merge so we don't lose camera_feeds or other live data
            return { ...prev, ...data };
          });
          setAlertActive(data.alert_active || data.threat_level >= 3);
        }
      } catch (e) {
        // Backend offline — that's fine during dev
      }
    }

    pollState();
    pollRef.current = setInterval(pollState, 2000);

    return () => clearInterval(pollRef.current);
  }, []);

  // ─── Fetch map data ───
  useEffect(() => {
    async function fetchMapData() {
      try {
        const res = await fetch(`${API_BASE}/api/map_data`);
        if (res.ok) {
          const data = await res.json();
          setMapData(data);
        }
      } catch (e) {
        // Will retry on next poll or manual trigger
      }
    }
    fetchMapData();
    const interval = setInterval(fetchMapData, 5000);
    return () => clearInterval(interval);
  }, []);

  // ─── Firebase: subscribe to threat_zones ───
  useEffect(() => {
    if (!db) return;

    const unsub = onSnapshot(collection(db, 'threat_zones'), (snapshot) => {
      const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setThreatZones(zones);
    });

    return () => unsub();
  }, []);

  // ─── Actions ───
  const handleTrigger = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/manual_trigger`, { method: 'POST' });
    } catch (e) {
      console.warn('Trigger failed:', e);
    }
  }, []);

  const handleReset = useCallback(() => {
    mockModeRef.current = false;
    setState({});
    setThoughts([]);
    setAlertActive(false);
    setShowMap(false);
    fetch(`${API_BASE}/api/reset`, { method: 'POST' }).catch(() => {});
  }, []);

  const handleMockSimulation = useCallback(() => {
    mockModeRef.current = true; // Prevent polling from overwriting mock state
    const mockThoughts = [
      { agent: 'supervisor', text: '🛡 KAVACH Pipeline initiated — analyzing threat scenario', status: 'running', duration: 0.2 },
      { agent: 'supervisor', text: '📡 Telecom GMLC resolved location via TDOA (Accuracy: ±110m)', status: 'complete', duration: 0.3 },
      { agent: 'ncrb', text: '📊 NCRB check: HOTSPOT MATCH — Indiranagar 100ft Road (7 cases, 2023)', status: 'complete', duration: 0.1 },
      { agent: 'threat', text: '⚠ Threat level calculated: 4/5 — STALKING pattern detected', status: 'complete', duration: 1.2 },
      { agent: 'family_alert', text: '📱 WhatsApp alert sent to 3 emergency contacts', status: 'complete', duration: 0.8 },
      { agent: 'fir', text: '📄 FIR KVH-2026-0042 generated — IPC 354D, 506', status: 'complete', duration: 1.5 },
      { agent: 'argus', text: '📷 ARGUS activated — 2 cameras, face detected, no threat objects', status: 'complete', duration: 2.1 },
      { agent: 'navigation', text: '🗺 Safe route computed — +4 min, 87% safer via ARGUS coverage', status: 'complete', duration: 0.9 },
    ];

    setThoughts([]);
    let delay = 0;
    mockThoughts.forEach((thought) => {
      delay += 600 + Math.random() * 400;
      setTimeout(() => {
        setThoughts(prev => [...prev, { ...thought, ts: Date.now() }]);
      }, delay);
    });

    // Mock state after thoughts
    setTimeout(() => {
      setState({
        trigger_type: 'incoming_call',
        threat_level: 4,
        threat_keywords: ['stalking', 'following', 'afraid'],
        threat_confidence: 0.89,
        alert_active: true,
        completed_agents: ['supervisor', 'threat', 'ncrb', 'family_alert', 'fir', 'argus', 'navigation'],
        fir_text: 'FIR No: KVH-2026-0042\nDate: ' + new Date().toLocaleDateString() + '\n\nCOMPLAINANT STATEMENT:\nThe victim reported being followed by an unknown individual near Indiranagar 100 Feet Road, Bangalore. The suspect was observed making threatening gestures and attempting to approach the victim repeatedly.\n\nSECTIONS APPLIED:\n- IPC Section 354D (Stalking)\n- IPC Section 506 (Criminal Intimidation)\n\nACTION TAKEN:\nImmediate patrol dispatched. ARGUS surveillance activated. Safe route provided to victim.',
        fir_case_number: 'KVH-2026-0042',
        fir_ipc_sections: ['354D', '506'],
        whatsapp_sent: true,
        whatsapp_sid: 'SM' + Math.random().toString(36).substr(2, 32),
        gps_lat: 12.9716,
        gps_lon: 77.6412,
        ncrb_hotspot_match: true,
        ncrb_context: 'Zone classified as high-risk for stalking incidents. 7 reported cases in 2023 within 500m radius.',
        nearest_hotspot: { name: 'Indiranagar 100 Feet Road', distance_m: 250, incident_count: 7 },
        navigation_result: {
          police: { name: 'Indiranagar Police Station', distance: '1.2 km', eta: '4 min', lat: 12.9784, lon: 77.6408 },
          hospital: { name: 'Manipal Hospital', distance: '2.5 km', eta: '8 min', lat: 12.9634, lon: 77.6456 },
          safe_house: { name: 'Women Safety Hub — CMH Road', distance: '1.8 km', eta: '6 min', lat: 12.9756, lon: 77.6134 },
        },
        argus_active: true,
        camera_feeds: [
          { id: 'ARGUS-01', active: true, face_detected: true, face_count: 1, group_threat: false, plate_detected: ['KA-05-MN-1234'], threat_objects: [], scene_analysis: 'Single male individual walking toward victim position' },
          { id: 'ARGUS-02', active: true, face_detected: false, face_count: 0, group_threat: false, plate_detected: [], threat_objects: [], scene_analysis: 'Street clear, normal pedestrian activity' },
        ],
        call_recording_url: null,
        pipeline_start_ms: Date.now() - 4200,
        agent_timings: {
          supervisor: 0.2,
          threat: 1.2,
          ncrb: 0.1,
          family_alert: 0.8,
          fir: 1.5,
          argus: 2.1,
          navigation: 0.9,
        },
      });
      setAlertActive(true);
      setShowMap(true);
    }, delay + 500);
  }, []);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          handleTrigger();
          break;
        case 'r':
          handleReset();
          break;
        case 'm':
          handleMockSimulation();
          break;
        case 'p':
          navigate('/police');
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleTrigger, handleReset, handleMockSimulation, navigate]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-kvh-bg">
      {/* ═══════ HEADER ═══════ */}
      <ControlPanel
        wsConnected={wsConnected}
        alertActive={alertActive}
        onTrigger={handleTrigger}
        onReset={handleReset}
        onMock={handleMockSimulation}
        onNavigatePolice={() => navigate('/police')}
      />

      {/* ═══════ MAIN 4-COLUMN LAYOUT ═══════ */}
      <div className="flex-1 flex gap-1.5 p-1.5 pt-0 min-h-0">
        
        {/* ──── Column 1: 20% — Pipeline + State ──── */}
        <div className="w-[20%] flex flex-col gap-1.5 min-h-0">
          <div className="h-[32%] min-h-0">
            <AgentGraph state={state} thoughts={thoughts} />
          </div>
          <div className="h-[18%] min-h-0">
            <KavachStateMachine state={state} />
          </div>
          <div className="h-[25%] min-h-0">
            <AgentStateDiagram state={state} />
          </div>
          <div className="h-[25%] min-h-0">
            <NCRBPanel
              ncrbHotspotMatch={state.ncrb_hotspot_match}
              ncrbContext={state.ncrb_context}
              nearestHotspot={state.nearest_hotspot}
            />
          </div>
        </div>

        {/* ──── Column 2: 30% — Thoughts + Camera + FIR ──── */}
        <div className="w-[30%] flex flex-col gap-1.5 min-h-0">
          <div className="flex-1 min-h-0">
            <AgentThoughtPanel thoughts={thoughts} />
          </div>
          <div className="h-[38%] flex gap-1.5 min-h-0">
            <div className="w-1/2">
              <CameraPanel feeds={state.camera_feeds} argusActive={state.argus_active} apiBase={API_BASE} />
            </div>
            <div className="w-1/2">
              <FIRPanel
                firText={state.fir_text}
                caseNumber={state.fir_case_number}
                ipcSections={state.fir_ipc_sections || state.ipc_sections}
              />
            </div>
          </div>
        </div>

        {/* ──── Column 3: 25% — MOMENT Diagram ──── */}
        <div className="w-[25%] flex flex-col gap-1.5 min-h-0">
          <div className="flex-1 min-h-0">
            <MomentDiagram state={state} thoughts={thoughts} />
          </div>
        </div>

        {/* ──── Column 4: 25% — Alerts + Threat + WhatsApp + Nav + Audio ──── */}
        <div className="w-[25%] flex flex-col gap-1.5 min-h-0">
          <div className="h-[18%] min-h-0">
            <AlertTimeline thoughts={thoughts} state={state} />
          </div>
          <div className="h-[20%] min-h-0">
            <ThreatPanel
              threatLevel={state.threat_level}
              keywords={state.threat_keywords || state.threat_context?.keywords}
              confidence={state.threat_confidence || state.threat_context?.confidence}
              ncrbMatch={state.ncrb_hotspot_match}
            />
          </div>
          <div className="h-[20%] min-h-0">
            <WhatsAppPanel
              sent={state.whatsapp_sent || state.family_alerted}
              sid={state.whatsapp_sid}
              recordingUrl={state.call_recording_url}
            />
          </div>
          <div className="h-[18%] min-h-0">
            <NavigationPanel result={state.navigation_result || (state.nearest_police ? {
              police: state.nearest_police,
              hospital: state.nearest_hospital,
              safe_house: state.nearest_safe_house,
            } : null)} />
          </div>
          <div className="h-[24%] min-h-0">
            <AudioThreatGauge wsData={lastWsData} />
          </div>
        </div>
      </div>

      {/* ═══════ MAP (togglable bottom strip) ═══════ */}
      {showMap && (
        <div className="h-[35vh] border-t border-kvh-border animate-fade-in">
          <SafeRouteMapPanel
            state={state}
            threatZones={threatZones}
            mapData={mapData}
            onClose={() => setShowMap(false)}
          />
        </div>
      )}

      {/* Map toggle when hidden */}
      {!showMap && state.navigation_result && (
        <button
          onClick={() => setShowMap(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-kvh-card border border-kvh-blue/50 text-kvh-blue rounded-lg font-mono text-xs font-semibold hover:bg-kvh-blue/10 transition-all z-50"
        >
          🗺 SHOW SAFE NAVIGATION MAP
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOT APP — ROUTER
// ═══════════════════════════════════════════════════════════
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<KavachCommandCenter />} />
      <Route path="/police" element={<PoliceDashboard />} />
      <Route path="/map-editor" element={<div className="h-screen bg-kvh-bg p-4"><SafetyMapEditor /></div>} />
    </Routes>
  );
}

export { API_BASE, MSI_IP, WS_URL, db };
