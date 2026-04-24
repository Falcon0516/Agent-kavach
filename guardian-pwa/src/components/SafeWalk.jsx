import React, { useState, useEffect, useRef } from 'react';

const API_BASE = `http://${import.meta.env.VITE_MSI_IP || 'localhost'}:8000`;

export default function SafeWalk({ onTriggerSOS }) {
  const [active, setActive] = useState(false);
  const [destination, setDestination] = useState('');
  const [etaMinutes, setEtaMinutes] = useState(15);
  const [elapsed, setElapsed] = useState(0);
  const [lastPos, setLastPos] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [deviationWarning, setDeviationWarning] = useState(false);
  const [stationaryWarning, setStationaryWarning] = useState(false);
  const [stationaryStart, setStationaryStart] = useState(null);
  const intervalRef = useRef(null);
  const watchRef = useRef(null);
  const startTimeRef = useRef(null);

  // ── Start Safe Walk ──
  const startWalk = () => {
    if (!destination.trim()) return;
    setActive(true);
    setElapsed(0);
    setRoutePath([]);
    setDeviationWarning(false);
    setStationaryWarning(false);
    startTimeRef.current = Date.now();

    // Start GPS tracking
    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
          setLastPos(prev => {
            // Check for stationary (same position for >3 min)
            if (prev) {
              const dist = Math.sqrt((newPos.lat - prev.lat) ** 2 + (newPos.lon - prev.lon) ** 2);
              if (dist < 0.00005) { // ~5m
                if (!stationaryStart) {
                  setStationaryStart(Date.now());
                } else if (Date.now() - stationaryStart > 180000) { // 3 min
                  setStationaryWarning(true);
                }
              } else {
                setStationaryStart(null);
                setStationaryWarning(false);
              }

              // Check for route deviation (>50m from expected path)
              if (routePath.length > 2) {
                const nearestDist = routePath.reduce((min, p) => {
                  const d = Math.sqrt((newPos.lat - p.lat) ** 2 + (newPos.lon - p.lon) ** 2);
                  return Math.min(min, d);
                }, Infinity);
                setDeviationWarning(nearestDist > 0.0005); // ~50m
              }
            }
            return newPos;
          });

          setRoutePath(prev => [...prev, newPos]);

          // POST to backend every 15 seconds
          if (routePath.length % 3 === 0) {
            fetch(`${API_BASE}/api/safe_walk_ping`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: newPos.lat, lon: newPos.lon,
                destination, eta_minutes: etaMinutes,
                elapsed_seconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
              })
            }).catch(() => {});
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    // Elapsed timer
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  // ── Stop Safe Walk ──
  const stopWalk = (reason = 'manual') => {
    setActive(false);
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Notify backend
    fetch(`${API_BASE}/api/safe_walk_end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, destination, elapsed })
    }).catch(() => {});
  };

  // Auto-escalate if ETA exceeded by 5 minutes
  useEffect(() => {
    if (active && elapsed > (etaMinutes + 5) * 60) {
      console.log("[SafeWalk] ETA exceeded by 5 min — auto-escalating");
      onTriggerSOS?.('safe_walk_timeout');
      stopWalk('eta_exceeded');
    }
  }, [elapsed, active, etaMinutes]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const remainingSeconds = Math.max(0, etaMinutes * 60 - elapsed);
  const progress = Math.min(100, (elapsed / (etaMinutes * 60)) * 100);

  if (!active) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center mb-4">
          <span className="text-3xl">🚶‍♀️</span>
          <h2 className="text-sm font-bold mt-1" style={{ color: '#22c55e' }}>SAFE WALK MODE</h2>
          <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
            Share your live location. We'll alert your contacts if something seems wrong.
          </p>
        </div>

        <div className="space-y-3 p-4 rounded-xl" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#94a3b8' }}>Where are you going?</label>
            <input type="text" value={destination} onChange={e => setDestination(e.target.value)}
              placeholder="e.g. Home, Office, Friend's place"
              className="w-full p-2.5 rounded-lg text-xs outline-none"
              style={{ background: 'rgba(2,8,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }} />
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#94a3b8' }}>Expected time (minutes)</label>
            <div className="flex items-center gap-2">
              {[5, 10, 15, 20, 30, 45].map(m => (
                <button key={m} onClick={() => setEtaMinutes(m)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={{
                    background: etaMinutes === m ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${etaMinutes === m ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                    color: etaMinutes === m ? '#22c55e' : '#64748b',
                  }}>
                  {m}m
                </button>
              ))}
            </div>
          </div>
          <button onClick={startWalk} disabled={!destination.trim()}
            className="w-full py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}>
            🚶‍♀️ Start Safe Walk
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
          <span className="text-xs font-bold" style={{ color: '#22c55e' }}>LIVE TRACKING</span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: '#64748b' }}>→ {destination}</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${progress}%`, background: progress > 100 ? '#e11d48' : '#22c55e' }} />
        </div>
        <div className="flex justify-between text-[9px] font-mono" style={{ color: '#64748b' }}>
          <span>Elapsed: {formatTime(elapsed)}</span>
          <span>Remaining: {formatTime(remainingSeconds)}</span>
        </div>
      </div>

      {/* Warnings */}
      {deviationWarning && (
        <div className="p-3 rounded-xl animate-pulse" style={{ background: 'rgba(225,29,72,0.1)', border: '1px solid rgba(225,29,72,0.3)' }}>
          <div className="text-xs font-bold" style={{ color: '#e11d48' }}>⚠️ ROUTE DEVIATION DETECTED</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#f87171' }}>You appear to be off your expected route</div>
        </div>
      )}

      {stationaryWarning && (
        <div className="p-3 rounded-xl animate-pulse" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div className="text-xs font-bold" style={{ color: '#f59e0b' }}>⚠️ STATIONARY FOR 3+ MINUTES</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#fbbf24' }}>Tap "I'm Safe" if everything is okay</div>
        </div>
      )}

      {/* Location info */}
      {lastPos && (
        <div className="p-2 rounded-lg text-[9px] font-mono" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#64748b' }}>
          📍 {lastPos.lat.toFixed(6)}, {lastPos.lon.toFixed(6)} · {routePath.length} points tracked
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={() => stopWalk('safe_arrival')}
          className="flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff' }}>
          ✅ I'm Safe
        </button>
        <button onClick={() => { onTriggerSOS?.('safe_walk_sos'); stopWalk('sos'); }}
          className="px-4 py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', color: '#fff' }}>
          🚨 SOS
        </button>
      </div>

      <button onClick={() => stopWalk('manual')}
        className="w-full py-2 rounded-lg text-[10px] font-semibold"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
        Cancel Walk
      </button>
    </div>
  );
}
