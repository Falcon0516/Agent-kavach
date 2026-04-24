import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.heat';
import { database, firestore } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

const API_BASE = `http://${import.meta.env.VITE_MSI_IP || 'localhost'}:8000`;

// ── Time slot detection ──
function getCurrentTimeSlot() {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return 'morning';
  if (h >= 14 && h < 18) return 'afternoon';
  return 'night';
}

// ── Safety score → color ──
function scoreToColor(score) {
  const s = score * 100;
  if (s >= 80) return '#22c55e';
  if (s >= 60) return '#f59e0b';
  if (s >= 40) return '#f97316';
  return '#e11d48';
}

// ── Icons ──
function createIcon(emoji, size = 28) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;text-align:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5))">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const ICONS = {
  police: createIcon('🚔', 24),
  hospital: createIcon('🏥', 24),
  safe_space: createIcon('🏪', 22),
  camera: createIcon('📷', 20),
  user: L.divIcon({
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 12px rgba(59,130,246,0.6),0 0 24px rgba(59,130,246,0.3);animation:pulse 2s infinite"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  }),
};

// ── Simple Dijkstra for safe routing ──
function computeSafeRoute(start, end, safeNodes, zones, timeSlot) {
  // Build graph from safe nodes (cameras + POIs)
  const allNodes = [
    { lat: start[0], lon: start[1], id: 'start' },
    ...safeNodes.map((n, i) => ({ ...n, id: `node_${i}` })),
    { lat: end[0], lon: end[1], id: 'end' },
  ];

  const dist = (a, b) => Math.sqrt((a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2);

  // Get zone safety for a point
  const getSafety = (lat, lon) => {
    for (const z of zones) {
      const c = z.center || z;
      const r = (z.radius_m || 500) / 111000; // rough deg conversion
      if (dist({ lat, lon }, { lat: c.lat, lon: c.lon }) < r) {
        const scores = z.safety || {};
        return scores[timeSlot] || 0.5;
      }
    }
    return 0.5;
  };

  // Greedy nearest-safe-node approach
  const route = [allNodes[0]];
  const visited = new Set(['start']);
  let current = allNodes[0];

  for (let step = 0; step < 20; step++) {
    const endDist = dist(current, allNodes[allNodes.length - 1]);
    if (endDist < 0.002) break; // close enough to destination

    let best = null, bestScore = Infinity;
    for (const node of allNodes) {
      if (visited.has(node.id)) continue;
      const d = dist(current, node);
      if (d > 0.02) continue; // too far
      const safety = getSafety(node.lat, node.lon);
      const weight = d * (1 / Math.max(0.1, safety)); // lower safety = higher cost
      if (weight < bestScore) {
        bestScore = weight;
        best = node;
      }
    }

    if (!best) break;
    visited.add(best.id);
    route.push(best);
    current = best;
  }

  route.push(allNodes[allNodes.length - 1]);
  return route.map(n => [n.lat, n.lon]);
}

// ── Recenter map on user position ──
function MapRecenter({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView(pos, map.getZoom());
  }, [pos, map]);
  return null;
}

// ── HeatLayer (imperative Leaflet plugin) ──
function HeatLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length || !window.L?.heatLayer) return;
    const heat = window.L.heatLayer(
      points.map(p => [p.lat, p.lon, p.intensity || 0.5]),
      { radius: 30, blur: 20, maxZoom: 17, gradient: { 0.2: '#22c55e', 0.5: '#f59e0b', 0.8: '#f97316', 1: '#e11d48' } }
    );
    heat.addTo(map);
    return () => map.removeLayer(heat);
  }, [points, map]);
  return null;
}

export default function MapView({ showRouting = false, showSafeSpaces = false }) {
  const [pos, setPos] = useState([13.0827, 77.5877]);
  const [mapData, setMapData] = useState(null);
  const [timeSlot, setTimeSlot] = useState(getCurrentTimeSlot());
  const [demoMode, setDemoMode] = useState(false);
  const [threatZones, setThreatZones] = useState([]);
  const [communityReports, setCommunityReports] = useState([]);
  const [destination, setDestination] = useState(null);
  const [showLayers, setShowLayers] = useState({
    zones: true, cameras: true, heatmap: true, safe_spaces: true,
    hospitals: true, police: true, community: true,
  });
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const submitCommunityReport = async () => {
    if (!reportDesc.trim()) return;
    try {
      // Write to Firestore
      const { addDoc } = await import('firebase/firestore');
      await addDoc(collection(firestore, 'community_reports'), {
        lat: pos[0], lon: pos[1],
        description: reportDesc,
        timestamp: new Date().toISOString(),
        reporter: 'anonymous',
      });
      setReportSubmitted(true);
      setTimeout(() => { setShowReportModal(false); setReportSubmitted(false); setReportDesc(''); }, 2000);
    } catch (e) {
      // Fallback: POST to backend
      try {
        await fetch(`${API_BASE}/api/community_report`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos[0], lon: pos[1], description: reportDesc }),
        });
        setReportSubmitted(true);
        setTimeout(() => { setShowReportModal(false); setReportSubmitted(false); setReportDesc(''); }, 2000);
      } catch (e2) { console.log("Report submission failed"); }
    }
  };

  // ── Get user GPS ──
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      p => setPos([p.coords.latitude, p.coords.longitude]),
      () => {}, { timeout: 5000 }
    );
    const watchId = navigator.geolocation.watchPosition(
      p => setPos([p.coords.latitude, p.coords.longitude]),
      () => {}, { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Fetch map data from backend ──
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`${API_BASE}/api/map_data`);
        if (res.ok) setMapData(await res.json());
      } catch (e) {
        // Use fallback data
        setMapData({
          police_stations: [
            { name: "Yelahanka PS", lat: 13.1007, lon: 77.5963, phone: "080-22868401" },
            { name: "Hebbal PS", lat: 13.0358, lon: 77.5970, phone: "080-22868500" },
          ],
          hospitals: [
            { name: "Manipal Hospital", lat: 13.0340, lon: 77.5730, phone: "080-25023456" },
          ],
          safe_houses: [
            { name: "Nirbhaya Fund Center", lat: 13.0155, lon: 77.5509 },
          ],
          argus_nodes: [
            { name: "Main Entrance", lat: 13.0827, lon: 77.5877, node_id: "ARGUS-01" },
            { name: "Demo Stage", lat: 13.0828, lon: 77.5878, node_id: "ARGUS-02" },
          ],
          safe_zones: [],
        });
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  // ── Firebase Realtime DB: threat zones ──
  useEffect(() => {
    try {
      const threatRef = ref(database, 'threat_zones');
      return onValue(threatRef, (snapshot) => {
        const value = snapshot.val();
        if (value) {
          const zones = Object.keys(value).map(k => ({ ...value[k], id: k }));
          setThreatZones(prev => [...prev, ...zones.filter(z => !prev.find(p => p.id === z.id))]);
        }
      });
    } catch (e) { console.log("Firebase RTDB not configured"); }
  }, []);

  // ── Firestore: threats + community reports ──
  useEffect(() => {
    try {
      const unsubThreats = onSnapshot(collection(firestore, 'threats'), (snap) => {
        const threats = snap.docs.filter(d => d.data().active_threat).map(d => ({ id: d.id, ...d.data() }));
        setThreatZones(prev => {
          const existing = prev.filter(z => !z._firestore);
          return [...existing, ...threats.map(t => ({ ...t, _firestore: true }))];
        });
      });
      const unsubReports = onSnapshot(collection(firestore, 'community_reports'), (snap) => {
        setCommunityReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => { unsubThreats(); unsubReports(); };
    } catch (e) { console.log("Firestore not configured"); }
  }, []);

  // ── Derived data ──
  const zones = mapData?.safe_zones || [];
  const cameras = mapData?.argus_nodes || [];
  const police = mapData?.police_stations || [];
  const hospitals = mapData?.hospitals || [];
  const safeHouses = mapData?.safe_houses || [];

  // Heatmap points from cameras (weighted by face_detected_count)
  const heatPoints = useMemo(() =>
    cameras.map(c => ({ lat: c.lat, lon: c.lon, intensity: (c.face_detected_count || 3) / 10 })),
    [cameras]
  );

  // Safe nodes for routing (cameras + POIs)
  const safeNodes = useMemo(() => [
    ...cameras.map(c => ({ lat: c.lat, lon: c.lon })),
    ...police.map(p => ({ lat: p.lat, lon: p.lon })),
    ...hospitals.map(h => ({ lat: h.lat, lon: h.lon })),
  ], [cameras, police, hospitals]);

  // Routes
  const shortestRoute = destination ? [pos, destination] : null;
  const safestRoute = useMemo(() => {
    if (!destination || safeNodes.length === 0) return null;
    return computeSafeRoute(pos, destination, safeNodes, zones, timeSlot);
  }, [destination, pos, safeNodes, zones, timeSlot]);

  // Route stats
  const routeStats = useMemo(() => {
    if (!shortestRoute || !safestRoute) return null;
    const distCalc = (route) => {
      let d = 0;
      for (let i = 1; i < route.length; i++) {
        d += Math.sqrt((route[i][0] - route[i - 1][0]) ** 2 + (route[i][1] - route[i - 1][1]) ** 2);
      }
      return d * 111; // rough km
    };
    const shortDist = distCalc(shortestRoute);
    const safeDist = distCalc(safestRoute);
    const saferPct = Math.round(Math.max(0, (1 - shortDist / Math.max(0.01, safeDist)) * -100 + 50));
    return {
      safeKm: safeDist.toFixed(1),
      safeMins: Math.max(1, Math.round(safeDist / 0.08)), // ~5km/h walking
      shortKm: shortDist.toFixed(1),
      saferPct: Math.min(95, Math.max(15, saferPct)),
    };
  }, [shortestRoute, safestRoute]);

  // Handle map click for destination
  const handleMapClick = useCallback((e) => {
    if (showRouting) setDestination([e.latlng.lat, e.latlng.lng]);
  }, [showRouting]);

  // Map click handler component
  function MapClickHandler() {
    const map = useMap();
    useEffect(() => {
      map.on('click', handleMapClick);
      return () => map.off('click', handleMapClick);
    }, [map]);
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* ── Layer toggles + Time slot ── */}
      <div className="absolute top-2 left-2 right-2 z-[1000] flex flex-wrap gap-1">
        {demoMode && (
          <div className="w-full flex gap-1 mb-1">
            {['morning', 'afternoon', 'night'].map(slot => (
              <button key={slot} onClick={() => setTimeSlot(slot)}
                className="flex-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                style={{
                  background: timeSlot === slot ? 'rgba(225,29,72,0.2)' : 'rgba(2,8,15,0.8)',
                  border: `1px solid ${timeSlot === slot ? '#e11d48' : 'rgba(255,255,255,0.1)'}`,
                  color: timeSlot === slot ? '#e11d48' : '#64748b',
                }}>
                {slot === 'morning' ? '☀️' : slot === 'afternoon' ? '🌤' : '🌙'} {slot}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setDemoMode(!demoMode)}
          className="px-2 py-1 rounded-lg text-[9px] font-bold tracking-wide"
          style={{ background: demoMode ? 'rgba(225,29,72,0.15)' : 'rgba(2,8,15,0.85)', border: '1px solid rgba(225,29,72,0.3)', color: demoMode ? '#e11d48' : '#64748b' }}>
          {demoMode ? '✕ Demo' : '⏱ Demo Mode'}
        </button>
        <span className="px-2 py-1 rounded-lg text-[9px] font-bold" style={{ background: 'rgba(2,8,15,0.85)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
          {timeSlot === 'morning' ? '☀️' : timeSlot === 'afternoon' ? '🌤' : '🌙'} {timeSlot.toUpperCase()}
        </span>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 w-full z-0 relative" style={{ minHeight: '60vh' }}>
        <MapContainer center={pos} zoom={14} style={{ height: '100%', width: '100%' }} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapRecenter pos={pos} />
          {showRouting && <MapClickHandler />}

          {/* Heatmap layer */}
          {showLayers.heatmap && <HeatLayer points={heatPoints} />}

          {/* User location — pulsing blue dot */}
          <Marker position={pos} icon={ICONS.user}>
            <Popup><div className="font-bold text-sm">📍 You are here</div></Popup>
          </Marker>

          {/* Safety zone circles */}
          {showLayers.zones && zones.map((z, i) => {
            const scores = z.safety || {};
            const score = scores[timeSlot] || 0.5;
            const color = scoreToColor(score);
            const isThreated = threatZones.some(t => {
              const d = Math.sqrt((t.lat - (z.center?.lat || z.lat)) ** 2 + (t.lon - (z.center?.lon || z.lon)) ** 2);
              return d < 0.005;
            });
            return (
              <Circle key={`zone-${i}`}
                center={[z.center?.lat || z.lat, z.center?.lon || z.lon]}
                radius={z.radius_m || 500}
                pathOptions={{
                  color: isThreated ? '#e11d48' : color,
                  fillColor: isThreated ? '#e11d48' : color,
                  fillOpacity: 0.15,
                  weight: 2,
                  className: isThreated ? 'threat-pulse' : '',
                }}>
                <Popup>
                  <div className="font-bold">{z.name || `Zone ${z.id}`}</div>
                  <div>Safety: {Math.round(score * 100)}% ({timeSlot})</div>
                  {isThreated && <div className="text-red-500 font-bold">⚠ ACTIVE THREAT</div>}
                </Popup>
              </Circle>
            );
          })}

          {/* Argus camera coverage circles */}
          {showLayers.cameras && cameras.map((c, i) => (
            <Circle key={`cam-${i}`} center={[c.lat, c.lon]} radius={100}
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1, dashArray: '4 4' }}>
              <Popup><div className="font-bold">📷 {c.name || c.node_id}</div><div className="text-xs text-gray-500">ARGUS Coverage: 100m</div></Popup>
            </Circle>
          ))}

          {/* Police stations */}
          {showLayers.police && police.map((p, i) => (
            <Marker key={`pol-${i}`} position={[p.lat, p.lon]} icon={ICONS.police}>
              <Popup><div className="font-bold">🚔 {p.name}</div>{p.phone && <div>📞 {p.phone}</div>}</Popup>
            </Marker>
          ))}

          {/* Hospitals */}
          {showLayers.hospitals && hospitals.map((h, i) => (
            <Marker key={`hosp-${i}`} position={[h.lat, h.lon]} icon={ICONS.hospital}>
              <Popup><div className="font-bold">🏥 {h.name}</div>{h.phone && <div>📞 {h.phone}</div>}</Popup>
            </Marker>
          ))}

          {/* Safe spaces */}
          {showLayers.safe_spaces && safeHouses.map((s, i) => (
            <Marker key={`safe-${i}`} position={[s.lat, s.lon]} icon={ICONS.safe_space}>
              <Popup><div className="font-bold">🏪 {s.name}</div></Popup>
            </Marker>
          ))}

          {/* Community reports */}
          {showLayers.community && communityReports.map((r, i) => (
            <Circle key={`report-${i}`} center={[r.lat, r.lon]} radius={80}
              pathOptions={{ color: '#e11d48', fillColor: '#e11d48', fillOpacity: 0.2, weight: 1 }}>
              <Popup><div className="text-red-500 font-bold">⚠ Community Report</div><div className="text-xs">{r.description}</div></Popup>
            </Circle>
          ))}

          {/* Threat zones from Firebase */}
          {threatZones.map((tz, i) => (
            <Circle key={`threat-${i}`} center={[tz.lat, tz.lon]} radius={tz.radius || 300}
              pathOptions={{ color: '#e11d48', fillColor: '#e11d48', fillOpacity: 0.25, weight: 2, className: 'threat-pulse' }}>
              <Popup><div className="text-red-500 font-bold">⚠ THREAT ZONE FLAGGED</div></Popup>
            </Circle>
          ))}

          {/* Destination marker */}
          {destination && (
            <Marker position={destination} icon={createIcon('📌', 28)}>
              <Popup>Destination</Popup>
            </Marker>
          )}

          {/* Route: Shortest (red dashed) */}
          {shortestRoute && (
            <Polyline positions={shortestRoute} pathOptions={{ color: '#e11d48', weight: 3, dashArray: '8 8', opacity: 0.6 }} />
          )}

          {/* Route: Safest (green solid) */}
          {safestRoute && (
            <Polyline positions={safestRoute} pathOptions={{ color: '#22c55e', weight: 5, opacity: 0.9 }} />
          )}
        </MapContainer>
      </div>

      {/* ── Route comparison card ── */}
      {routeStats && (
        <div className="p-3" style={{ background: 'rgba(2,8,15,0.95)', borderTop: '1px solid rgba(34,197,94,0.2)' }}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-0.5 rounded" style={{ background: '#22c55e' }} />
                <span className="text-[10px] font-bold" style={{ color: '#22c55e' }}>SAFEST</span>
                <span className="text-[10px]" style={{ color: '#94a3b8' }}>{routeStats.safeKm}km · ~{routeStats.safeMins} min</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 rounded" style={{ background: '#e11d48', borderTop: '1px dashed #e11d48' }} />
                <span className="text-[10px] font-bold" style={{ color: '#e11d48' }}>SHORTEST</span>
                <span className="text-[10px]" style={{ color: '#94a3b8' }}>{routeStats.shortKm}km</span>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-lg text-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="text-lg font-black" style={{ color: '#22c55e' }}>{routeStats.saferPct}%</div>
              <div className="text-[8px] font-bold" style={{ color: '#22c55e' }}>SAFER</div>
            </div>
          </div>
          <button onClick={() => setDestination(null)} className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
            ✕ Clear Route
          </button>
        </div>
      )}

      {/* Routing hint */}
      {showRouting && !destination && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-full text-xs font-bold" style={{ background: 'rgba(2,8,15,0.9)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
          📍 Tap map to set destination
        </div>
      )}

      {/* Community Report Button */}
      {!showRouting && !showReportModal && (
        <button onClick={() => setShowReportModal(true)}
          className="absolute bottom-4 right-3 z-[1000] px-3 py-2 rounded-xl text-[10px] font-bold active:scale-95 transition-transform"
          style={{ background: 'rgba(225,29,72,0.15)', border: '1px solid rgba(225,29,72,0.3)', color: '#e11d48', backdropFilter: 'blur(8px)' }}>
          ⚠️ Report Area
        </button>
      )}

      {/* Community Report Modal */}
      {showReportModal && (
        <div className="absolute inset-0 z-[2000] flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full p-4 rounded-t-2xl" style={{ background: '#0a1628', border: '1px solid rgba(225,29,72,0.2)' }}>
            {reportSubmitted ? (
              <div className="text-center py-6">
                <span className="text-3xl">✅</span>
                <p className="text-sm font-bold mt-2" style={{ color: '#22c55e' }}>Report Submitted!</p>
                <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>Thank you for keeping the community safe.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold" style={{ color: '#e11d48' }}>⚠️ Report Unsafe Area</h3>
                  <button onClick={() => setShowReportModal(false)} className="text-xs px-2 py-1 rounded" style={{ color: '#64748b' }}>✕</button>
                </div>
                <p className="text-[10px] mb-3" style={{ color: '#64748b' }}>
                  📍 Reporting at your current location ({pos[0].toFixed(4)}, {pos[1].toFixed(4)})
                </p>
                <textarea value={reportDesc} onChange={e => setReportDesc(e.target.value)}
                  placeholder="Describe the safety concern (e.g., poor lighting, suspicious activity, isolated area...)"
                  rows={3}
                  className="w-full p-3 rounded-xl text-xs outline-none resize-none mb-3"
                  style={{ background: 'rgba(2,8,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
                <button onClick={submitCommunityReport} disabled={!reportDesc.trim()}
                  className="w-full py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-30"
                  style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', color: '#fff' }}>
                  Submit Report
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* CSS for pulsing threat zones */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.02)} }
        .threat-pulse { animation: pulse 2s infinite; }
      `}</style>
    </div>
  );
}
