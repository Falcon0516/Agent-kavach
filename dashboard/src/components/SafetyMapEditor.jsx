import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../App';

const API_BASE = `http://${window.location.hostname}:8000`;

function createIcon(emoji, size = 24) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;text-align:center">${emoji}</div>`,
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
}

function MapClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

export default function SafetyMapEditor() {
  const [zones, setZones] = useState([]);
  const [timeSlot, setTimeSlot] = useState('morning');
  const [newZone, setNewZone] = useState(null);
  const [newRadius, setNewRadius] = useState(500);
  const [newScore, setNewScore] = useState(0.7);
  const [newName, setNewName] = useState('');
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/map_data`).then(r => r.json()).then(d => {
      setMapData(d);
      // Load zones from Firestore if available, else from API
      if (db) {
        import('firebase/firestore').then(({ collection, onSnapshot }) => {
          const unsubscribe = onSnapshot(collection(db, 'safety_zones'), (snapshot) => {
            const fsZones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (fsZones.length > 0) setZones(fsZones);
          });
          return () => unsubscribe();
        }).catch(() => {});
      }
      if (!db) setZones(d.safe_zones || []);
    }).catch(() => {});
  }, []);

  const handleMapClick = (latlng) => {
    setNewZone({ lat: latlng.lat, lon: latlng.lng });
    setNewName(`Zone ${zones.length + 1}`);
  };

  const addZone = async () => {
    if (!newZone) return;
    const zone = {
      id: `Z-${String(zones.length + 1).padStart(3, '0')}`,
      name: newName || `Zone ${zones.length + 1}`,
      center: { lat: newZone.lat, lon: newZone.lon },
      radius_m: newRadius,
      safety: { morning: newScore, afternoon: newScore, night: Math.max(0.2, newScore - 0.3) },
    };
    setZones(prev => [...prev, zone]);
    setNewZone(null);
    setNewName('');
    // Persist to Firestore
    if (db) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'safety_zones', zone.id), zone);
      } catch (e) { console.log('Firestore save failed:', e); }
    }
  };

  const removeZone = async (id) => {
    setZones(prev => prev.filter(z => z.id !== id));
    // Remove from Firestore
    if (db) {
      try {
        const { doc, deleteDoc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'safety_zones', id));
      } catch (e) { console.log('Firestore delete failed:', e); }
    }
  };

  const updateScore = (id, slot, value) => {
    setZones(prev => prev.map(z => {
      if (z.id !== id) return z;
      return { ...z, safety: { ...z.safety, [slot]: parseFloat(value) } };
    }));
  };

  const scoreToColor = (s) => {
    if (s >= 0.8) return '#3fb950';
    if (s >= 0.6) return '#d29922';
    if (s >= 0.4) return '#f78166';
    return '#da3633';
  };

  return (
    <div className="kvh-card h-full flex flex-col overflow-hidden">
      <div className="kvh-card-header text-kvh-amber">
        <span>🗺</span> SAFETY MAP EDITOR
      </div>

      {/* Time slot tabs */}
      <div className="flex gap-1 px-2 py-1">
        {['morning', 'afternoon', 'night'].map(slot => (
          <button key={slot} onClick={() => setTimeSlot(slot)}
            className="flex-1 py-1 rounded text-[9px] font-bold uppercase font-mono transition-all"
            style={{
              background: timeSlot === slot ? 'rgba(210,153,34,0.15)' : 'transparent',
              border: `1px solid ${timeSlot === slot ? 'rgba(210,153,34,0.4)' : 'rgba(255,255,255,0.06)'}`,
              color: timeSlot === slot ? '#d29922' : '#475569',
            }}>
            {slot === 'morning' ? '☀️' : slot === 'afternoon' ? '🌤' : '🌙'} {slot}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0 relative">
        <MapContainer center={[13.0827, 77.5877]} zoom={12} style={{ height: '100%', width: '100%' }} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClickHandler onClick={handleMapClick} />

          {/* Existing zones */}
          {zones.map(z => {
            const score = z.safety?.[timeSlot] || 0.5;
            const color = scoreToColor(score);
            return (
              <Circle key={z.id}
                center={[z.center?.lat || z.lat, z.center?.lon || z.lon]}
                radius={z.radius_m || 500}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-bold text-sm">{z.name}</div>
                    <div className="text-xs">Safety ({timeSlot}): {Math.round(score * 100)}%</div>
                    <div className="text-xs text-gray-500">ID: {z.id}</div>
                    <button onClick={() => removeZone(z.id)} className="text-xs text-red-500 font-bold mt-1">✕ Remove</button>
                  </div>
                </Popup>
              </Circle>
            );
          })}

          {/* POIs */}
          {mapData?.police_stations?.map((p, i) => (
            <Marker key={`pol-${i}`} position={[p.lat, p.lon]} icon={createIcon('🚔')}>
              <Popup>{p.name}</Popup>
            </Marker>
          ))}
          {mapData?.hospitals?.map((h, i) => (
            <Marker key={`hosp-${i}`} position={[h.lat, h.lon]} icon={createIcon('🏥')}>
              <Popup>{h.name}</Popup>
            </Marker>
          ))}
          {mapData?.argus_nodes?.map((c, i) => (
            <Circle key={`cam-${i}`} center={[c.lat, c.lon]} radius={100}
              pathOptions={{ color: '#58a6ff', fillColor: '#58a6ff', fillOpacity: 0.1, weight: 1, dashArray: '4 4' }}>
              <Popup>📷 {c.name}</Popup>
            </Circle>
          ))}

          {/* New zone preview */}
          {newZone && (
            <Circle center={[newZone.lat, newZone.lon]} radius={newRadius}
              pathOptions={{ color: '#d29922', fillColor: '#d29922', fillOpacity: 0.3, weight: 2, dashArray: '6 3' }}>
              <Popup>New zone (click Add)</Popup>
            </Circle>
          )}
        </MapContainer>

        {/* Floating instruction */}
        {!newZone && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full font-mono text-[9px] font-bold"
            style={{ background: 'rgba(2,8,15,0.9)', border: '1px solid rgba(210,153,34,0.3)', color: '#d29922' }}>
            📍 Click map to place a safety zone
          </div>
        )}
      </div>

      {/* New zone form */}
      {newZone && (
        <div className="p-2 space-y-1.5" style={{ borderTop: '1px solid rgba(210,153,34,0.2)' }}>
          <div className="flex gap-1.5">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Zone name"
              className="flex-1 px-2 py-1 rounded font-mono text-[9px]"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
            <select value={newRadius} onChange={e => setNewRadius(Number(e.target.value))}
              className="px-2 py-1 rounded font-mono text-[9px]"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
              <option value={300}>300m</option>
              <option value={500}>500m</option>
              <option value={700}>700m</option>
              <option value={1000}>1000m</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8px]" style={{ color: '#64748b' }}>Safety:</span>
            <input type="range" min="0" max="1" step="0.05" value={newScore} onChange={e => setNewScore(Number(e.target.value))}
              className="flex-1 h-1.5" />
            <span className="font-mono text-[9px] font-bold" style={{ color: scoreToColor(newScore) }}>{Math.round(newScore * 100)}%</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={addZone} className="flex-1 py-1 rounded font-mono text-[9px] font-bold"
              style={{ background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950' }}>
              ✓ Add Zone
            </button>
            <button onClick={() => setNewZone(null)} className="px-3 py-1 rounded font-mono text-[9px]"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Zone list */}
      <div className="max-h-[80px] overflow-y-auto px-2 pb-1 space-y-0.5">
        {zones.map(z => {
          const score = z.safety?.[timeSlot] || 0.5;
          return (
            <div key={z.id} className="flex items-center gap-1.5 py-0.5">
              <div className="w-2 h-2 rounded-full" style={{ background: scoreToColor(score) }} />
              <span className="font-mono text-[8px] flex-1 truncate" style={{ color: '#94a3b8' }}>{z.name}</span>
              <span className="font-mono text-[8px]" style={{ color: scoreToColor(score) }}>{Math.round(score * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
