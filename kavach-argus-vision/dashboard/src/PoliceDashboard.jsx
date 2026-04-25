import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import EvidencePanel from './components/EvidencePanel';
import { API_BASE, db } from './App';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';

function createEmojiIcon(emoji, size = 22) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;text-align:center;">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createVictimIcon() {
  return L.divIcon({
    html: '<div class="victim-marker"></div>',
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Map click handler for threat flagging
function MapClickHandler({ onMapClick, isPlacing }) {
  useMapEvents({
    click(e) {
      if (isPlacing) onMapClick(e.latlng);
    },
  });
  return null;
}

export default function PoliceDashboard() {
  const navigate = useNavigate();
  const [state, setState] = useState({});
  const [threatZones, setThreatZones] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [policeStatus, setPoliceStatus] = useState(null);
  const [isPlacingThreat, setIsPlacingThreat] = useState(false);
  const [mapData, setMapData] = useState(null);

  const victimLat = state?.gps_lat || 12.9716;
  const victimLon = state?.gps_lon || 77.6412;

  // Poll state
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/full_state`);
        if (res.ok) {
          const data = await res.json();
          setState(data);
          if (data.fir_case_number && !incidents.find(i => i.caseNumber === data.fir_case_number)) {
            setIncidents(prev => [...prev, {
              caseNumber: data.fir_case_number,
              time: new Date().toLocaleTimeString(),
              triggerType: 'Voice',
              threatLevel: data.threat_level || 0,
              status: 'Active',
            }]);
          }
        }
      } catch {}
    }
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch map data
  useEffect(() => {
    async function fetchMap() {
      try {
        const res = await fetch(`${API_BASE}/api/map_data`);
        if (res.ok) setMapData(await res.json());
      } catch {}
    }
    fetchMap();
  }, []);

  // Firebase threat zones
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'threat_zones'), (snap) => {
      setThreatZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Flag threat zone
  const handleMapClick = useCallback(async (latlng) => {
    if (!window.confirm('Flag this location as threat zone?')) return;
    try {
      await fetch(`${API_BASE}/api/flag_threat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: latlng.lat, lon: latlng.lng }),
      });
    } catch {}
    if (db) {
      try {
        await addDoc(collection(db, 'threat_zones'), {
          lat: latlng.lat, lon: latlng.lng,
          flagged_at: new Date().toISOString(),
          status: 'active',
        });
      } catch {}
    }
    setIsPlacingThreat(false);
  }, []);

  // Police status update
  const handleStatusUpdate = async (status) => {
    setPoliceStatus(status);
    try {
      await fetch(`${API_BASE}/api/police_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, case_number: state?.fir_case_number }),
      });
    } catch {}
  };

  const ncrb = mapData?.ncrb_hotspots || [];
  const argus = mapData?.argus_nodes || [];

  // Demo incidents if none from API
  const displayIncidents = incidents.length > 0 ? incidents : [
    { caseNumber: 'KVH-2026-0042', time: '14:32', triggerType: 'Voice', threatLevel: 4, status: 'Active' },
  ];

  return (
    <div className="h-screen flex flex-col bg-kvh-bg overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-kvh-border bg-kvh-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">🚔</span>
          <h1 className="font-mono text-sm font-bold tracking-widest text-kvh-text-bright uppercase">
            KAVACH POLICE COMMAND CENTER
          </h1>
        </div>
        <button onClick={() => navigate('/')}
          className="px-3 py-1.5 bg-kvh-blue/10 border border-kvh-blue/30 text-kvh-blue rounded font-mono text-[10px] font-semibold uppercase tracking-wider hover:bg-kvh-blue/20 transition-all">
          🛡 COMMAND CENTER ↗
        </button>
      </header>

      {/* Main 2-col layout */}
      <div className="flex-1 flex gap-2 p-2 min-h-0">
        {/* LEFT — Map + Controls (45%) */}
        <div className="w-[45%] flex flex-col gap-2 min-h-0">
          {/* Threat flag controls */}
          <div className="flex items-center gap-2 px-2">
            <button onClick={() => setIsPlacingThreat(!isPlacingThreat)}
              className={`layer-btn ${isPlacingThreat ? 'active !border-kvh-red !text-kvh-red !bg-kvh-red/10' : ''}`}>
              {isPlacingThreat ? '⚠ Click Map to Flag' : '🚩 Flag Threat Zone'}
            </button>
          </div>

          {/* Map */}
          <div className="flex-1 rounded-lg overflow-hidden border border-kvh-border min-h-0">
            <MapContainer center={[victimLat, victimLon]} zoom={14} className="w-full h-full" attributionControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapClickHandler onMapClick={handleMapClick} isPlacing={isPlacingThreat} />

              {/* Victim */}
              <Marker position={[victimLat, victimLon]} icon={createVictimIcon()}>
                <Popup><div className="font-mono text-xs"><div className="font-bold text-red-400">⚠ VICTIM LIVE GPS</div></div></Popup>
              </Marker>

              {/* ARGUS cameras */}
              {argus.map((n, i) => (
                <Marker key={`a-${i}`} position={[n.lat, n.lon]} icon={createEmojiIcon('📷', 18)}>
                  <Popup><div className="font-mono text-xs text-blue-400">ARGUS-{n.id || i + 1}</div></Popup>
                </Marker>
              ))}

              {/* NCRB hotspots */}
              {ncrb.map((h, i) => (
                <Circle key={`ncrb-${i}`} center={[h.lat, h.lon]} radius={80}
                  pathOptions={{ color: '#da3633', fillColor: '#da3633', fillOpacity: 0.3, weight: 1 }}>
                  <Popup><div className="font-mono text-xs"><div className="text-red-400">{h.name}</div><div className="text-gray-400">{h.incident_count} cases</div></div></Popup>
                </Circle>
              ))}

              {/* Threat zones */}
              {threatZones.map((z, i) => (
                <Circle key={`tz-${i}`} center={[z.lat, z.lon]} radius={300}
                  pathOptions={{ color: '#da3633', fillColor: '#da3633', fillOpacity: 0.15, weight: 2, className: 'threat-zone-pulse' }}>
                  <Popup><div className="font-mono text-xs text-red-400">⚠ POLICE THREAT FLAG — Active</div></Popup>
                </Circle>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* RIGHT — Incident Detail + Evidence (55%) */}
        <div className="w-[55%] flex flex-col gap-2 min-h-0 overflow-y-auto">
          {/* Incident list */}
          <div className="kvh-card">
            <div className="kvh-card-header text-kvh-blue"><span>📋</span> INCIDENT LOG</div>
            <div className="space-y-1">
              {displayIncidents.map((inc, i) => (
                <div key={i} onClick={() => setSelectedIncident(inc)}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer font-mono text-[10px] transition-all
                    ${selectedIncident?.caseNumber === inc.caseNumber ? 'bg-kvh-blue/10 border border-kvh-blue/30' : 'hover:bg-white/[0.02] border border-transparent'}`}>
                  <span className="kvh-badge kvh-badge-amber text-[8px]">{inc.caseNumber}</span>
                  <span className="text-kvh-text-muted">{inc.time}</span>
                  <span className="text-kvh-text">{inc.triggerType}</span>
                  <span className={`font-bold ${inc.threatLevel >= 4 ? 'text-kvh-red' : inc.threatLevel >= 3 ? 'text-kvh-amber' : 'text-kvh-green'}`}>
                    LVL {inc.threatLevel}
                  </span>
                  <span className={`ml-auto kvh-badge text-[8px] ${inc.status === 'Active' ? 'kvh-badge-red' : 'kvh-badge-green'}`}>
                    {inc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active incident detail */}
          <div className="kvh-card flex-1 min-h-0 overflow-y-auto">
            <div className="kvh-card-header text-kvh-amber"><span>📄</span> ACTIVE INCIDENT</div>
            {state?.fir_case_number ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="kvh-badge kvh-badge-amber">{state.fir_case_number}</span>
                  {state.gps_lat && (
                    <a href={`https://maps.google.com/?q=${state.gps_lat},${state.gps_lon}`} target="_blank" rel="noopener"
                      className="kvh-badge kvh-badge-blue hover:underline cursor-pointer text-[8px]">
                      📍 Open in Maps
                    </a>
                  )}
                </div>

                {/* Location Source Display */}
                <div className="space-y-1 bg-kvh-bg p-2 rounded border border-kvh-border">
                  {state.trigger_type === 'incoming_call' ? (
                    <>
                      <div className="font-mono text-[9px] text-green-400 font-semibold">📍 Network Triangulated Location:</div>
                      <div className="font-mono text-[10px] text-kvh-text tracking-wider">{victimLat.toFixed(6)}, {victimLon.toFixed(6)}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold" style={{background: 'rgba(88,166,255,0.15)', color: '#58a6ff', border: '1px solid rgba(88,166,255,0.3)'}}>
                          METHOD: TDOA / Timing Advance
                        </span>
                        {state.location_accuracy_m && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono" style={{background: 'rgba(147,51,234,0.15)', color: '#a855f7', border: '1px solid rgba(147,51,234,0.3)'}}>
                            ±{state.location_accuracy_m}m accuracy
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-[9px] text-kvh-text-muted">📍 Device GPS Active:</div>
                      <div className="font-mono text-[10px] text-kvh-text tracking-wider">{victimLat.toFixed(6)}, {victimLon.toFixed(6)}</div>
                    </>
                  )}
                </div>

                <div className="font-mono text-[9px] text-kvh-text-muted">
                  Victim last seen: {new Date().toLocaleTimeString()} | Location: {victimLat.toFixed(4)}, {victimLon.toFixed(4)}
                </div>
                {state.fir_text && (
                  <pre className="font-mono text-[9px] text-kvh-text bg-kvh-bg p-2 rounded border border-kvh-border max-h-[120px] overflow-y-auto whitespace-pre-wrap">
                    {state.fir_text}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-20 text-kvh-text-muted font-mono text-[10px] opacity-40">
                No active incident
              </div>
            )}
          </div>

          {/* Evidence Panel */}
          <EvidencePanel state={state} />

          {/* Status Update */}
          <div className="kvh-card">
            <div className="kvh-card-header text-kvh-green"><span>📡</span> STATUS UPDATE</div>
            <div className="flex gap-2">
              {[
                { key: 'dispatched', label: '🚗 Unit Dispatched', color: 'amber' },
                { key: 'on_scene', label: '📍 On Scene', color: 'blue' },
                { key: 'resolved', label: '✅ Resolved', color: 'green' },
              ].map(btn => (
                <button key={btn.key} onClick={() => handleStatusUpdate(btn.key)}
                  className={`flex-1 px-2 py-2 rounded font-mono text-[10px] font-semibold border transition-all
                    ${policeStatus === btn.key
                      ? `bg-kvh-${btn.color}/20 border-kvh-${btn.color}/50 text-kvh-${btn.color}`
                      : 'bg-kvh-bg border-kvh-border text-kvh-text-muted hover:border-kvh-text-muted'
                    }`}
                  style={policeStatus === btn.key ? {
                    backgroundColor: btn.color === 'amber' ? 'rgba(210,153,34,0.15)' : btn.color === 'blue' ? 'rgba(88,166,255,0.15)' : 'rgba(63,185,80,0.15)',
                    borderColor: btn.color === 'amber' ? '#d29922' : btn.color === 'blue' ? '#58a6ff' : '#3fb950',
                    color: btn.color === 'amber' ? '#d29922' : btn.color === 'blue' ? '#58a6ff' : '#3fb950',
                  } : {}}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
