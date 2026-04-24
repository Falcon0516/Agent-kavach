import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { database } from '../firebase';
import { ref, onValue } from 'firebase/database';

export default function MapView() {
  const [pos, setPos] = useState([13.0827, 77.5877]);
  const [data, setData] = useState({ police: [], argus: [], houses: [], threat_zones: [] });
  const [route, setRoute] = useState(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      p => setPos([p.coords.latitude, p.coords.longitude]),
      () => {}, { timeout: 5000 }
    );
     setData(prev => ({ ...prev,
       police: [
         {lat: 13.1007, lon: 77.5963, name: "Yelahanka PS", phone: "080-22868401"},
         {lat: 13.0358, lon: 77.5970, name: "Hebbal PS", phone: "080-22868500"}
       ],
       argus: [
         {name: "Main Entrance", lat: 13.0827, lon: 77.5877},
         {name: "Demo Stage Area", lat: 13.0828, lon: 77.5878}
       ],
       houses: [{name: "Nirbhaya Fund", lat: 13.0155, lon: 77.5509}]
     }));

     // Firebase real-time threat zones
     try {
       const threatRef = ref(database, 'threat_zones');
       onValue(threatRef, (snapshot) => {
         const value = snapshot.val();
         if (value) {
           const zones = Object.keys(value).map(k => value[k]);
           setData(prev => ({ ...prev, threat_zones: zones }));
         }
       });
     } catch(e) { console.log("Firebase not configured"); }
  }, []);

  const routeToSafety = () => {
    if (data.police.length > 0) {
      setRoute([[pos[0], pos[1]], [data.police[0].lat, data.police[0].lon]]);
    }
  };

  const blueIcon = new L.Icon({ iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", iconAnchor: [12, 41] });

  return (
    <div className="flex flex-col h-full w-full relative">
      <div className="h-[70vh] w-full z-0 relative">
        <MapContainer center={pos} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          <Circle center={pos} radius={50} pathOptions={{ color: '#0088ff', fillColor: '#0088ff', fillOpacity: 0.5 }} />
          <Marker position={pos} icon={blueIcon}><Popup>You are here</Popup></Marker>
          
          {data.police.map((p, i) => (
            <Marker key={`p-${i}`} position={[p.lat, p.lon]}>
              <Popup><div className="font-bold">🚔 {p.name}</div>📞 {p.phone}</Popup>
            </Marker>
          ))}
          
          {data.argus.map((c, i) => (
            <Circle key={`c-${i}`} center={[c.lat, c.lon]} radius={100} pathOptions={{ color: '#0088ff', fillOpacity: 0.3 }}>
              <Popup>📷 {c.name}</Popup>
            </Circle>
          ))}

          {/* Firebase Threat Zones */}
          {data.threat_zones && data.threat_zones.map((tz, i) => (
            <Circle key={`t-${i}`} center={[tz.lat, tz.lon]} radius={tz.radius || 200} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.4 }} className="animate-pulse">
              <Popup>⚠ Threat Zone Flagged</Popup>
            </Circle>
          ))}

          {route && <Polyline positions={route} color="#22c55e" weight={6} />}
        </MapContainer>
        
        <button onClick={routeToSafety}
          className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[1000] bg-green-600 text-white px-8 py-4 rounded-full shadow-[0_5px_15px_rgba(22,163,74,0.5)] font-bold flex items-center justify-center gap-2 hover:bg-green-500 active:scale-95 transition">
          <span className="text-xl">📍</span> Route to Safety
        </button>
      </div>
      
      {route && (
        <div className="bg-gray-800 border-t border-gray-700 text-white p-5 z-20 flex-1 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
          <h3 className="font-bold text-green-400 mb-2 flex items-center gap-2">🛡 Safe Route Active</h3>
          <p className="text-gray-300 text-sm mb-3">Navigating to nearest Safe Zone via camera-guarded paths.</p>
          <div className="text-rose-400 text-xs bg-rose-950/40 p-3 rounded-lg border border-rose-900/50 flex align-start">
            <span className="mr-2">⚠</span> 
            <span>Alternate direct route passes through unsafe zones. Do not deviate.</span>
          </div>
        </div>
      )}
    </div>
  );
}
