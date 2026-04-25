// guardian-pwa/src/components/GreenCorridorNav.jsx
// Green Corridor Navigation — dedicated Navigate tab component
// Renders its own Leaflet map. Does NOT modify MapView.jsx.
// Uses pre-built route waypoints + Groq LLM summary.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup,
  Polyline, Circle, useMap, useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const API_BASE = `http://${import.meta.env.VITE_MSI_IP || 'localhost'}:8000`;

// ── Icons ──────────────────────────────────────────────────────────────
function makeIcon(emoji, size = 26) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6))">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
const USER_ICON = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;
    border:3px solid #fff;box-shadow:0 0 10px rgba(59,130,246,0.7)"></div>`,
  className: '', iconSize: [14, 14], iconAnchor: [7, 7],
});
const DEST_ICON = makeIcon('🏁', 28);
const CAM_ICON = makeIcon('📷', 18);

// ── Recenter helper ─────────────────────────────────────────────────────
function Recenter({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, map.getZoom()); }, [pos, map]);
  return null;
}

// ── Pin drop for manual destination ─────────────────────────────────────
// ALWAYS active — tapping the map at any time sets/changes destination.
// If a route is already selected, tapping clears it and sets new pin.
function PinDropHandler({ onPin }) {
  useMapEvents({
    click(e) {
      onPin([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}

// ── Fit map bounds to corridor ───────────────────────────────────────────
function FitBounds({ waypoints }) {
  const map = useMap();
  useEffect(() => {
    if (waypoints && waypoints.length > 1) {
      map.fitBounds(L.latLngBounds(waypoints), { padding: [40, 40] });
    }
  }, [waypoints, map]);
  return null;
}

// ── Category labels ──────────────────────────────────────────────────────
const CAT_LABELS = {
  nearby: { label: 'Nearby', emoji: '🏠', color: '#22c55e' },
  mid:    { label: 'Mid-range', emoji: '🚌', color: '#f59e0b' },
  distant:{ label: 'Far', emoji: '🚗', color: '#3b82f6' },
};

// ── Safety score → bar color ─────────────────────────────────────────────
function safeColor(score) {
  if (score >= 0.8) return '#22c55e';
  if (score >= 0.6) return '#f59e0b';
  if (score >= 0.4) return '#f97316';
  return '#e11d48';
}

// ════════════════════════════════════════════════════════════════════════
export default function GreenCorridorNav() {
  const [userPos, setUserPos] = useState([12.8945, 77.5615]);
  const [routes, setRoutes]   = useState([]);
  const [cameras, setCameras] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [pinDropMode, setPinDropMode] = useState(false);
  const [manualDest, setManualDest] = useState(null);
  const [manualRouteCoords, setManualRouteCoords] = useState(null);
  const [manualCameraIds, setManualCameraIds] = useState([]);
  const [timeSlot, setTimeSlot] = useState(() => {
    const h = new Date().getHours();
    if (h >= 6 && h < 14) return 'morning';
    if (h >= 14 && h < 18) return 'afternoon';
    return 'night';
  });
  const [contextInput, setContextInput] = useState('');
  const [showContextInput, setShowContextInput] = useState(false);
  const mapRef = useRef(null);

  // ── Get GPS ──────────────────────────────────────────────────────────
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      p => setUserPos([p.coords.latitude, p.coords.longitude]),
      () => {},
      { timeout: 5000 }
    );
  }, []);

  // ── Fetch routes + cameras ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/map_data`);
        if (res.ok) {
          const data = await res.json();
          setRoutes(data.corridor_routes || []);
          setCameras(data.argus_nodes || []);
        }
      } catch (e) {
        console.log('[GreenCorridor] Backend unreachable — retrying in 5s');
        setTimeout(load, 5000);
      }
    }
    load();
  }, []);

  // ── Fetch Groq corridor summary when route is selected ───────────────
  const fetchSummary = useCallback(async (route, ts, ctx) => {
    if (!route) return;
    setSummaryLoading(true);
    setSummary(null);
    try {
      const res = await fetch(`${API_BASE}/api/green_corridor_summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_id: route.route_id,
          time_slot: ts,
          victim_context: ctx || '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      // Fallback summary from route data
      const cameras_count = route.cameras_on_route?.length || 0;
      const avoided = route.hotspots_avoided?.length || 0;
      setSummary({
        summary: `Your green corridor to ${route.destination_short} passes through ${cameras_count} camera zones and avoids ${avoided} known hotspot areas. ${route.corridor_highlights?.[0] || 'Stay on the highlighted path.'}`,
        safety_pct: Math.round((route.safety_score || 0.75) * 100),
        cameras_count,
        hotspots_avoided: avoided,
        destination_name: route.destination_name,
        distance_km: route.distance_km,
        walk_minutes: route.walk_minutes,
      });
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // When a route is selected, fetch summary immediately
  useEffect(() => {
    if (selectedRoute) {
      fetchSummary(selectedRoute, timeSlot, contextInput);
    }
  }, [selectedRoute, timeSlot]);

  // ── Route selection handler ──────────────────────────────────────────
  const selectRoute = (route) => {
    setSelectedRoute(route);
    setManualDest(null);
    setPinDropMode(false);
    setSummary(null);
  };

  // ── Manual pin-drop handler (off-list destination) ───────────────────
  // When user drops a pin, first check if it's near a predefined route destination.
  // If within ~3km of a known destination, auto-select that corridor.
  // Otherwise, compute a camera-weighted greedy fallback route.
  const handlePin = async ([lat, lon]) => {
    setManualDest([lat, lon]);
    setManualRouteCoords(null);
    setManualCameraIds([]);
    setPinDropMode(false);

    // Try to find nearest predefined route (within ~3km)
    const nearestRoute = routes.reduce((best, r) => {
      const d = Math.sqrt(
        (r.destination.lat - lat) ** 2 + (r.destination.lon - lon) ** 2
      );
      if (d < 0.027 && (!best || d < best.dist)) {
        return { route: r, dist: d };
      }
      return best;
    }, null);

    if (nearestRoute) {
      // Snap to the predefined corridor
      setSelectedRoute(nearestRoute.route);
      setManualDest(null); // clear manual, using predefined
      setSummary(null); // will be fetched by the selectedRoute useEffect
      return;
    }

    // No nearby predefined route — fetch real road route from OSRM!
    setSelectedRoute(null);
    setSummaryLoading(true);

    try {
      // OSRM expects lon,lat
      const url = `https://router.project-osrm.org/route/v1/foot/${userPos[1]},${userPos[0]};${lon},${lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // convert to lat,lon
        setManualRouteCoords(coords);
        
        const distKm = (route.distance / 1000).toFixed(1);
        const walkMin = Math.round(route.duration / 60);

        // Find cameras within ~200m of any point on this road route
        // Find cameras within ~500m of any point on this road route
        const maxDev = 0.005;
        const nearbyCams = cameras.filter(c => {
          return coords.some(pt => Math.sqrt((c.lat - pt[0])**2 + (c.lon - pt[1])**2) < maxDev);
        });
        
        setManualCameraIds(nearbyCams.map(c => c.node_id));

        setSummary({
          summary: `Custom destination pinned at ${lat.toFixed(4)}, ${lon.toFixed(4)}. Found an active road-following route. This path passes near ${nearbyCams.length} camera coverage zones. For best safety, stay within the illuminated main roads shown on the map.`,
          safety_pct: Math.min(85, 45 + nearbyCams.length * 5),
          cameras_count: nearbyCams.length,
          hotspots_avoided: 0,
          destination_name: 'Custom Pin',
          distance_km: distKm,
          walk_minutes: walkMin,
        });
      } else {
        throw new Error('OSRM returned no route');
      }
    } catch (err) {
      console.error("OSRM fetch failed:", err);
      // Fallback to straight-line generator if OSRM fails
      const fallback = computeFallbackRoute(userPos, [lat, lon], cameras);
      setManualRouteCoords(fallback);
      
      const maxDevFallback = 0.005;
      const nearbyCams = cameras.filter(c => {
        return fallback.some(pt => Math.sqrt((c.lat - pt[0])**2 + (c.lon - pt[1])**2) < maxDevFallback);
      });
      setManualCameraIds(nearbyCams.map(c => c.node_id));

      setSummary({
        summary: `Custom destination pinned. Could not fetch road network, showing direct fallback route. This path passes near ${nearbyCams.length} camera zones.`,
        safety_pct: Math.min(85, 45 + nearbyCams.length * 5),
        cameras_count: nearbyCams.length,
        hotspots_avoided: 0,
        destination_name: 'Custom Pin',
        distance_km: (Math.sqrt((userPos[0] - lat) ** 2 + (userPos[1] - lon) ** 2) * 111).toFixed(1),
        walk_minutes: Math.round(Math.sqrt((userPos[0] - lat) ** 2 + (userPos[1] - lon) ** 2) * 111 / 5 * 60),
      });
    }
    
    setSummaryLoading(false);
  };

  // ── Compute fallback route for custom pin-drops ─────────────────────
  // Builds a DIRECT path from start to end with smooth intermediate points.
  // Only detours through cameras if they're naturally along the way (within
  // 30% deviation from the straight line). No zigzagging.
  const computeFallbackRoute = (start, end, cams) => {
    if (!end) return null;

    const startPt = { lat: start[0], lon: start[1] };
    const endPt = { lat: end[0], lon: end[1] };
    const dist = (a, b) => Math.sqrt((a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2);
    const totalDist = dist(startPt, endPt);
    if (totalDist < 0.001) return [start, end]; // same point

    // Find cameras that lie NEAR the straight line (within 30% deviation)
    const maxDeviation = totalDist * 0.3;
    const onRouteCams = cams
      .map(c => {
        // Project camera onto start→end line, check perpendicular distance
        const dx = endPt.lon - startPt.lon;
        const dy = endPt.lat - startPt.lat;
        const t = Math.max(0, Math.min(1,
          ((c.lat - startPt.lat) * dy + (c.lon - startPt.lon) * dx) / (dy * dy + dx * dx)
        ));
        const projLat = startPt.lat + t * dy;
        const projLon = startPt.lon + t * dx;
        const perpDist = dist({ lat: c.lat, lon: c.lon }, { lat: projLat, lon: projLon });
        return { ...c, t, perpDist };
      })
      .filter(c => c.perpDist < maxDeviation && c.t > 0.05 && c.t < 0.95)
      .sort((a, b) => a.t - b.t); // sort by position along route

    // Build waypoints: start → cameras along the way → end
    const waypoints = [start];

    if (onRouteCams.length > 0) {
      // Add up to 5 camera waypoints that are along the direct path
      const selected = onRouteCams.slice(0, 5);
      for (const c of selected) {
        waypoints.push([c.lat, c.lon]);
      }
    } else {
      // No cameras along the way — add smooth intermediate points
      const steps = Math.max(3, Math.min(6, Math.ceil(totalDist / 0.015)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        waypoints.push([
          startPt.lat + t * (endPt.lat - startPt.lat),
          startPt.lon + t * (endPt.lon - startPt.lon),
        ]);
      }
    }

    waypoints.push(end);
    return waypoints;
  };

  // ── Filtered routes for category tab ────────────────────────────────
  const filteredRoutes = activeCategory === 'all'
    ? routes
    : routes.filter(r => r.category === activeCategory);

  // ── Corridor waypoints to render on map ─────────────────────────────
  // KEY: Replace the first waypoint with user's ACTUAL GPS position
  // so the route starts from where the user IS, not from hardcoded KSIT.
  const getCorridorWaypoints = () => {
    if (selectedRoute) {
      const wp = [...selectedRoute.green_waypoints];
      wp[0] = userPos; // start from user's actual position
      return wp;
    }
    if (manualDest && manualRouteCoords) {
      return manualRouteCoords;
    }
    return null;
  };
  const corridorWaypoints = getCorridorWaypoints();

  // ── Cameras that are part of the selected corridor ───────────────────
  const corridorCameraIds = new Set([
    ...(selectedRoute?.cameras_on_route || []),
    ...manualCameraIds
  ]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#02080f' }}>

      {/* ── TOP BAR: time slot + context ── */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 flex-wrap">
        <div className="flex items-center gap-1">
          {['morning', 'afternoon', 'night'].map(ts => (
            <button key={ts} onClick={() => setTimeSlot(ts)}
              className="px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all"
              style={{
                background: timeSlot === ts ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${timeSlot === ts ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
                color: timeSlot === ts ? '#22c55e' : '#475569',
              }}>
              {ts === 'morning' ? '☀️' : ts === 'afternoon' ? '🌤' : '🌙'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowContextInput(!showContextInput)}
          className="text-[9px] px-2 py-1 rounded-lg ml-auto"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
          ✍️ Context
        </button>
      </div>

      {showContextInput && (
        <div className="px-3 pb-2">
          <input value={contextInput} onChange={e => setContextInput(e.target.value)}
            placeholder="e.g. going home from office at night..."
            className="w-full px-3 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(34,197,94,0.2)', color: '#e2e8f0' }}
          />
        </div>
      )}

      {/* ── MAP: fixed height, always visible ── */}
      <div style={{ height: '42vh', position: 'relative', flexShrink: 0 }}>
        <MapContainer
          center={userPos}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          attributionControl={false}
          ref={mapRef}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Recenter pos={selectedRoute ? null : userPos} />
          <PinDropHandler onPin={handlePin} />
          {corridorWaypoints && corridorWaypoints.length > 1 && (
            <FitBounds waypoints={corridorWaypoints} />
          )}

          {/* User dot */}
          <Marker position={userPos} icon={USER_ICON}>
            <Popup><div className="text-xs font-bold">📍 You (KSIT)</div></Popup>
          </Marker>

          {/* ALL camera nodes — dimmed, small */}
          {cameras.map((c, i) => {
            const isOnCorridor = corridorCameraIds.has(c.node_id);
            return (
              <React.Fragment key={`cam-${i}`}>
                <Circle center={[c.lat, c.lon]} radius={100}
                  pathOptions={{
                    color: isOnCorridor ? '#22c55e' : '#3b82f6',
                    fillColor: isOnCorridor ? '#22c55e' : '#3b82f6',
                    fillOpacity: isOnCorridor ? 0.18 : 0.06,
                    weight: isOnCorridor ? 2 : 1,
                    dashArray: isOnCorridor ? '' : '4 4',
                  }}
                />
                {isOnCorridor && (
                  <Marker position={[c.lat, c.lon]} icon={CAM_ICON}>
                    <Popup><div className="text-xs">📷 {c.name}</div></Popup>
                  </Marker>
                )}
              </React.Fragment>
            );
          })}

          {/* GREEN CORRIDOR — thick green line through waypoints */}
          {corridorWaypoints && corridorWaypoints.length > 1 && (
            <>
              {/* Outer glow */}
              <Polyline positions={corridorWaypoints}
                pathOptions={{ color: '#22c55e', weight: 14, opacity: 0.15 }} />
              {/* Main corridor */}
              <Polyline positions={corridorWaypoints}
                pathOptions={{ color: '#22c55e', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
            </>
          )}

          {/* Destination marker */}
          {selectedRoute && (
            <Marker
              position={[selectedRoute.destination.lat, selectedRoute.destination.lon]}
              icon={DEST_ICON}
            >
              <Popup>
                <div className="text-xs font-bold">🏁 {selectedRoute.destination_name}</div>
                <div className="text-[10px] text-gray-400">{selectedRoute.distance_km}km · {selectedRoute.walk_minutes}min</div>
              </Popup>
            </Marker>
          )}
          {manualDest && (
            <Marker position={manualDest} icon={makeIcon('📌', 26)}>
              <Popup><div className="text-xs">Custom destination</div></Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Pin-drop hint overlay */}
        {(pinDropMode || (!selectedRoute && !manualDest)) && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center z-[1000]">
            <div className="px-4 py-2 rounded-full text-xs font-bold"
              style={{ background: 'rgba(2,8,15,0.9)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}>
              📍 Tap anywhere on map to set destination
            </div>
          </div>
        )}
      </div>

      {/* ── CORRIDOR SUMMARY CARD ── */}
      {(summary || summaryLoading) && (
        <div className="mx-3 my-2 p-3 rounded-xl flex-shrink-0"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
          {summaryLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px]" style={{ color: '#22c55e' }}>
                AI computing your green corridor...
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold" style={{ color: '#22c55e' }}>
                  🛡 GREEN CORRIDOR SUMMARY
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full" style={{ width: `${summary.safety_pct || 75}%`, background: safeColor((summary.safety_pct || 75) / 100) }} />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: safeColor((summary.safety_pct || 75) / 100) }}>
                    {summary.safety_pct || 75}%
                  </span>
                </div>
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: '#94a3b8' }}>
                {summary.summary}
              </p>
              <div className="flex gap-3 mt-2">
                <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                  📷 {summary.cameras_count} cameras
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                  ✓ {summary.hotspots_avoided} zones avoided
                </span>
                {summary.distance_km && summary.distance_km !== '?' && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>
                    🚶 {summary.walk_minutes}min
                  </span>
                )}
              </div>
              {showContextInput && contextInput && (
                <button onClick={() => fetchSummary(selectedRoute, timeSlot, contextInput)}
                  className="mt-2 text-[9px] px-3 py-1 rounded-lg w-full"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                  ↻ Regenerate with context
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── LIVE CAMERA FEEDS (Only for cameras on selected route) ── */}
      {corridorCameraIds.size > 0 && (
        <div className="px-3 pb-2">
          <div className="text-[9px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
            Live Route Coverage
          </div>
          <div className="flex gap-2 overflow-x-auto hide-scroll pb-1" style={{ scrollSnapType: 'x mandatory' }}>
            {cameras.filter(c => corridorCameraIds.has(c.node_id) && c.stream_url).length > 0 ? (
              cameras.filter(c => corridorCameraIds.has(c.node_id) && c.stream_url).map(cam => (
                <div key={cam.node_id} className="relative flex-shrink-0 snap-start w-[140px] h-[90px] rounded-lg overflow-hidden"
                  style={{ border: '1px solid rgba(34,197,94,0.3)', background: '#000' }}>
                  <img src={cam.stream_url} className="w-full h-full object-cover opacity-80" alt={cam.name} 
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                  <div className="hidden absolute inset-0 items-center justify-center text-[8px] text-gray-500">
                    Feed Offline
                  </div>
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#22c55e' }}>
                    🔴 LIVE
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-1.5 text-[8px] text-white truncate"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}>
                    {cam.name}
                  </div>
                </div>
              ))
            ) : (
              <div className="w-full text-center py-3 text-[10px] rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', color: '#64748b' }}>
                No active video feeds on this specific route segment.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DESTINATION SELECTOR ── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">

        {/* Category filter tabs */}
        <div className="flex items-center gap-2 mb-3">
          {[['all', 'All', '🗺'], ['nearby', 'Nearby', '🏠'], ['mid', 'Mid', '🚌'], ['distant', 'Far', '🚗']].map(([id, label, emoji]) => (
            <button key={id} onClick={() => setActiveCategory(id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[9px] font-bold transition-all"
              style={{
                background: activeCategory === id ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeCategory === id ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
                color: activeCategory === id ? '#22c55e' : '#475569',
              }}>
              {emoji} {label}
            </button>
          ))}
          <button onClick={() => { setPinDropMode(!pinDropMode); setSelectedRoute(null); setSummary(null); }}
            className="ml-auto px-2.5 py-1.5 rounded-xl text-[9px] font-bold transition-all"
            style={{
              background: pinDropMode ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${pinDropMode ? '#fbbf24' : 'rgba(255,255,255,0.08)'}`,
              color: pinDropMode ? '#fbbf24' : '#475569',
            }}>
            📌 Pin
          </button>
        </div>

        {/* Route cards */}
        <div className="space-y-2">
          {filteredRoutes.map(route => {
            const catStyle = CAT_LABELS[route.category] || CAT_LABELS.distant;
            const isSelected = selectedRoute?.route_id === route.route_id;
            return (
              <button key={route.route_id}
                onClick={() => selectRoute(route)}
                className="w-full text-left p-3 rounded-xl transition-all active:scale-98"
                style={{
                  background: isSelected
                    ? 'rgba(34,197,94,0.1)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? '#22c55e' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: isSelected ? '0 0 12px rgba(34,197,94,0.15)' : 'none',
                }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: `${catStyle.color}18`, color: catStyle.color }}>
                        {catStyle.emoji} {catStyle.label}
                      </span>
                      {isSelected && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                          ✓ Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold truncate" style={{ color: isSelected ? '#22c55e' : '#e2e8f0' }}>
                      {route.destination_name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                      {route.distance_km}km · ~{route.walk_minutes}min walk
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {/* Safety score mini bar */}
                    <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${Math.round(route.safety_score * 100)}%`, background: safeColor(route.safety_score) }} />
                    </div>
                    <span className="text-[9px] font-bold" style={{ color: safeColor(route.safety_score) }}>
                      {Math.round(route.safety_score * 100)}%
                    </span>
                    <span className="text-[9px]" style={{ color: '#475569' }}>
                      📷 {route.cameras_on_route?.length || 0}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}

          {filteredRoutes.length === 0 && (
            <div className="text-center py-8 opacity-40">
              <span className="text-2xl">🗺</span>
              <p className="text-xs mt-2" style={{ color: '#64748b' }}>No routes in this category</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
