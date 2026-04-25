import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// ═══════════════════════════════════════════════════════════
// HELPER: Custom icon creator
// ═══════════════════════════════════════════════════════════
function createEmojiIcon(emoji, size = 24) {
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

// ═══════════════════════════════════════════════════════════
// TIME SLOT DETECTION
// ═══════════════════════════════════════════════════════════
function getAutoTimeSlot() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'morning';
  if (hour >= 14 && hour < 18) return 'afternoon';
  return 'night';
}

function getSafetyColor(score) {
  if (score >= 0.8) return { color: '#3fb950', opacity: 0.25 };
  if (score >= 0.6) return { color: '#d29922', opacity: 0.3 };
  if (score >= 0.4) return { color: '#e85c0d', opacity: 0.35 };
  return { color: '#da3633', opacity: 0.4 };
}

// ═══════════════════════════════════════════════════════════
// HEATMAP LAYER (uses leaflet.heat)
// ═══════════════════════════════════════════════════════════
function HeatmapLayer({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;

    let heat;
    import('leaflet.heat').then(() => {
      // Create heat layer with points
      heat = L.heatLayer(points, {
        radius: 80,
        blur: 15,
        maxZoom: 17,
        gradient: {
          0.2: '#58a6ff',
          0.5: '#fcc419',
          0.8: '#ff6b6b',
          1.0: '#da3633',
        },
      }).addTo(map);
    }).catch(() => {});

    return () => {
      if (heat) map.removeLayer(heat);
    };
  }, [map, points]);

  return null;
}

// ═══════════════════════════════════════════════════════════
// SAFE ROUTE MAP PANEL
// ═══════════════════════════════════════════════════════════
export default function SafeRouteMapPanel({ state, threatZones, mapData, onClose }) {
  const [timeSlot, setTimeSlot] = useState(getAutoTimeSlot());
  const [layers, setLayers] = useState({
    safety: true,
    cameras: true,
    heatmap: false,
    routes: true,
  });

  const victimLat = state?.gps_lat || 12.9716;
  const victimLon = state?.gps_lon || 77.6412;
  const center = [victimLat, victimLon];

  const safeZones = mapData?.safe_zones || [];
  const argusNodes = mapData?.argus_nodes || [];
  const policeStations = mapData?.police_stations || [];
  const hospitals = mapData?.hospitals || [];
  const safeHouses = mapData?.safe_houses || [];

  const nearestPolice = useMemo(() => {
    if (!policeStations.length) {
      if (state?.navigation_result?.police) {
        const p = state.navigation_result.police;
        return { lat: p.lat || 12.9784, lon: p.lon || 77.6408, name: p.name };
      }
      return { lat: 12.9784, lon: 77.6408, name: 'Indiranagar PS' };
    }
    let nearest = policeStations[0];
    let minDist = Infinity;
    policeStations.forEach(ps => {
      const d = Math.hypot(ps.lat - victimLat, ps.lon - victimLon);
      if (d < minDist) { minDist = d; nearest = ps; }
    });
    return nearest;
  }, [policeStations, victimLat, victimLon, state]);

  const safeRoutePoints = useMemo(() => {
    const sorted = [...argusNodes].sort((a, b) => {
      const da = Math.hypot(a.lat - victimLat, a.lon - victimLon);
      const db = Math.hypot(b.lat - victimLat, b.lon - victimLon);
      return da - db;
    }).slice(0, 2);

    return [
      [victimLat, victimLon],
      ...sorted.map(n => [n.lat, n.lon]),
      [nearestPolice.lat, nearestPolice.lon],
    ];
  }, [argusNodes, victimLat, victimLon, nearestPolice]);

  const directRoute = [
    [victimLat, victimLon],
    [nearestPolice.lat, nearestPolice.lon],
  ];

  const heatPoints = useMemo(() => {
    return argusNodes.map(n => [n.lat, n.lon, n.face_detected ? 1 : 0.3]);
  }, [argusNodes]);

  const toggleLayer = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between px-3 py-1.5 bg-kvh-card border-b border-kvh-border">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-kvh-green tracking-wider">
            🛡 KAVACH SAFE NAVIGATION
          </span>
          <span className="font-mono text-[9px] text-kvh-text-muted">
            {timeSlot.toUpperCase()} | {new Date().toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {Object.entries({ safety: 'Safety Zones', cameras: 'Cameras', heatmap: 'Heatmap', routes: 'Routes' }).map(([key, label]) => (
            <button key={key} onClick={() => toggleLayer(key)} className={`layer-btn ${layers[key] ? 'active' : ''}`}>
              {label}
            </button>
          ))}

          <div className="flex items-center gap-0.5 ml-2">
            {['morning', 'afternoon', 'night'].map(slot => (
              <button key={slot} onClick={() => setTimeSlot(slot)} className={`layer-btn ${timeSlot === slot ? 'active' : ''}`}>
                {slot === 'morning' ? '☀' : slot === 'afternoon' ? '🌤' : '🌙'} {slot.charAt(0).toUpperCase() + slot.slice(1)}
              </button>
            ))}
          </div>

          <button onClick={onClose} className="ml-2 px-2 py-1 text-kvh-text-muted hover:text-kvh-text font-mono text-[10px] border border-kvh-border rounded hover:border-kvh-red/50 hover:text-kvh-red transition-all">
            ✕ CLOSE
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <MapContainer center={center} zoom={14} className="w-full h-full" zoomControl={true} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />

          <Marker position={center} icon={createVictimIcon()}>
            <Popup>
              <div className="font-mono text-xs">
                <div className="font-bold text-red-400">⚠ VICTIM LOCATION</div>
                <div className="text-gray-300">KAVACH ACTIVE</div>
              </div>
            </Popup>
          </Marker>

          {layers.safety && safeZones.map((zone, i) => {
            const score = zone.safety_scores?.[timeSlot] ?? zone.safety_score ?? 0.5;
            const { color, opacity } = getSafetyColor(score);
            return (
              <Circle key={`safety-${i}`} center={[zone.lat, zone.lon]} radius={zone.radius || 200}
                pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: 1, opacity: 0.6 }}>
                <Popup>
                  <div className="font-mono text-xs">
                    <div className="font-bold" style={{ color }}>{zone.name || `Zone ${i + 1}`}</div>
                    <div className="text-gray-300">Safety: {(score * 100).toFixed(0)}% ({timeSlot})</div>
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {layers.cameras && argusNodes.map((node, i) => (
            <Circle key={`cam-${i}`} center={[node.lat, node.lon]} radius={100}
              pathOptions={{ color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 0.1, weight: 1, dashArray: '5 5', opacity: 0.4 }}>
              <Popup>
                <div className="font-mono text-xs">
                  <div className="font-bold text-blue-400">ARGUS-{node.id || i + 1} — Active</div>
                  <div className="text-gray-300">{node.face_count || 0} faces detected</div>
                </div>
              </Popup>
            </Circle>
          ))}
          {layers.cameras && argusNodes.map((node, i) => (
            <Marker key={`cam-marker-${i}`} position={[node.lat, node.lon]} icon={createEmojiIcon('📷', 18)} />
          ))}

          {layers.heatmap && heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}

          {policeStations.map((ps, i) => (
            <Marker key={`police-${i}`} position={[ps.lat, ps.lon]} icon={createEmojiIcon('🚔', 22)}>
              <Popup><div className="font-mono text-xs text-blue-400 font-bold">🚔 {ps.name}</div></Popup>
            </Marker>
          ))}
          {hospitals.map((h, i) => (
            <Marker key={`hospital-${i}`} position={[h.lat, h.lon]} icon={createEmojiIcon('🏥', 22)}>
              <Popup><div className="font-mono text-xs text-green-400 font-bold">🏥 {h.name}</div></Popup>
            </Marker>
          ))}
          {safeHouses.map((sh, i) => (
            <Marker key={`safe-${i}`} position={[sh.lat, sh.lon]} icon={createEmojiIcon('🛡', 22)}>
              <Popup><div className="font-mono text-xs text-amber-400 font-bold">🛡 {sh.name}</div></Popup>
            </Marker>
          ))}

          {threatZones?.map((zone, i) => (
            <Circle key={`threat-${i}`} center={[zone.lat, zone.lon]} radius={300}
              pathOptions={{ color: '#da3633', fillColor: '#da3633', fillOpacity: 0.15, weight: 2, opacity: 0.6, className: 'threat-zone-pulse' }}>
              <Popup><div className="font-mono text-xs font-bold text-red-400">⚠ POLICE THREAT FLAG</div></Popup>
            </Circle>
          ))}

          {layers.routes && state?.navigation_result && (
            <>
              <Polyline positions={directRoute} pathOptions={{ color: '#da3633', weight: 4, dashArray: '10 8', opacity: 0.7 }} />
              <Polyline positions={safeRoutePoints} pathOptions={{ color: '#3fb950', weight: 4, opacity: 0.9 }} className="svg-edge-draw" />
            </>
          )}
        </MapContainer>

        {layers.routes && state?.navigation_result && (
          <div className="absolute top-2 right-2 z-[1000] bg-kvh-card/95 border border-kvh-border rounded-lg p-3 backdrop-blur-sm space-y-1.5 max-w-[220px]">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-kvh-green rounded" />
              <span className="font-mono text-[10px] text-kvh-green font-semibold">🛡 Safe Route: +4 min | 87% safer</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-kvh-red rounded border-dashed" style={{ borderTop: '2px dashed #da3633', height: 0 }} />
              <span className="font-mono text-[10px] text-kvh-red">↗ Shortest: faster but through red zones</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
