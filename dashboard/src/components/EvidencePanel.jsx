import { useState } from 'react';
import { API_BASE } from '../App';

export default function EvidencePanel({ state }) {
  const [traceResult, setTraceResult] = useState(null);
  const [tracing, setTracing] = useState(false);

  const handleTrace = async () => {
    setTracing(true);
    try {
      const res = await fetch(`${API_BASE}/api/trace_call?phone=${state?.victim_phone || 'demo'}`);
      if (res.ok) setTraceResult(await res.json());
      else setTraceResult({ network_provider: 'Jio', tower_id: 'BLR-KRM-0042', tower_lat: 12.9716, tower_lon: 77.6412, accuracy_radius_m: 150 });
    } catch {
      setTraceResult({ network_provider: 'Jio', tower_id: 'BLR-KRM-0042', tower_lat: 12.9716, tower_lon: 77.6412, accuracy_radius_m: 150 });
    }
    setTracing(false);
  };

  const handleDownloadFIR = () => {
    if (!state?.fir_text) return;
    const blob = new Blob([state.fir_text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.fir_case_number || 'KVH-2026-XXXX'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="kvh-card flex flex-col gap-3">
      <div className="kvh-card-header text-kvh-amber">
        <span>📂</span> EVIDENCE COLLECTION
      </div>

      {/* 1. Recording */}
      <div className="space-y-1">
        <div className="font-mono text-[9px] text-kvh-text-muted uppercase tracking-wider">📞 Call Recording</div>
        {state?.call_recording_url ? (
          <div className="space-y-1">
            <audio controls src={state.call_recording_url} className="w-full h-8" style={{ filter: 'invert(0.85) hue-rotate(180deg)' }} />
            <span className="kvh-badge kvh-badge-green text-[8px]">Recording Available</span>
          </div>
        ) : (
          <span className="font-mono text-[9px] text-kvh-text-muted opacity-50">No call recording for this incident</span>
        )}
      </div>

      {/* 2. Suspect ID */}
      <div className="space-y-1">
        <div className="font-mono text-[9px] text-kvh-text-muted uppercase tracking-wider">🔍 Suspect Identification</div>
        <div className="flex flex-wrap gap-1">
          {state?.camera_feeds?.some(f => f.face_detected) && (
            <span className="kvh-badge kvh-badge-green text-[8px]">Face Detected</span>
          )}
          {state?.camera_feeds?.flatMap(f => f.plate_detected || []).map((p, i) => (
            <span key={i} className="kvh-badge kvh-badge-red text-[8px]">{p}</span>
          ))}
          {state?.camera_feeds?.flatMap(f => f.threat_objects || []).map((o, i) => (
            <span key={i} className="kvh-badge kvh-badge-amber text-[8px]">{o}</span>
          ))}
        </div>
      </div>

      {/* 3. Cell Tower Trace */}
      <div className="space-y-1">
        <div className="font-mono text-[9px] text-kvh-text-muted uppercase tracking-wider">🗼 Cell Tower Trace</div>
        {!traceResult ? (
          <button onClick={handleTrace} disabled={tracing}
            className="px-3 py-1.5 bg-kvh-blue/10 border border-kvh-blue/30 text-kvh-blue rounded font-mono text-[10px] font-semibold hover:bg-kvh-blue/20 transition-all disabled:opacity-50">
            {tracing ? '⟳ Tracing...' : '🗼 Request Cell Tower Trace'}
          </button>
        ) : (
          <div className="space-y-0.5 font-mono text-[9px]">
            <div><span className="text-kvh-text-muted">Network:</span> <span className="text-kvh-text">{traceResult.network_provider}</span></div>
            <div><span className="text-kvh-text-muted">Tower:</span> <span className="text-kvh-text">{traceResult.tower_id}</span></div>
            <div>
              <span className="text-kvh-text-muted">Location:</span>{' '}
              <a href={`https://maps.google.com/?q=${traceResult.tower_lat},${traceResult.tower_lon}`} target="_blank" rel="noopener" className="text-kvh-blue hover:underline">
                {traceResult.tower_lat}, {traceResult.tower_lon}
              </a>
            </div>
            <div><span className="text-kvh-text-muted">Accuracy:</span> <span className="text-kvh-text">±{traceResult.accuracy_radius_m}m</span></div>
            <span className="text-[8px] text-kvh-text-muted opacity-50">Demo data — real trace requires court order</span>
          </div>
        )}
      </div>

      {/* 4. FIR Download */}
      <div>
        <button onClick={handleDownloadFIR} disabled={!state?.fir_text}
          className="px-3 py-1.5 bg-kvh-amber/10 border border-kvh-amber/30 text-kvh-amber rounded font-mono text-[10px] font-semibold hover:bg-kvh-amber/20 transition-all disabled:opacity-50">
          📄 Download FIR as TXT
        </button>
      </div>
    </div>
  );
}
