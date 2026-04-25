import { useState, useEffect } from 'react';

export default function AudioThreatGauge({ wsData }) {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (wsData?.type === 'audio_analysis') {
      setAnalysis(wsData.data);
    }
  }, [wsData]);

  const score = analysis?.threat_score ?? 0;
  const getColor = (s) => {
    if (s <= 30) return '#3fb950';
    if (s <= 60) return '#d29922';
    return '#da3633';
  };
  const getLabel = (s) => {
    if (s <= 30) return 'LOW';
    if (s <= 60) return 'ELEVATED';
    return 'CRITICAL';
  };

  const color = getColor(score);
  const pct = Math.min(100, score);

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-text-muted">
        <span>🎤</span> AUDIO THREAT ANALYSIS
      </div>

      {!analysis ? (
        <div className="flex-1 flex items-center justify-center text-kvh-text-muted font-mono text-[10px] opacity-40">
          Awaiting audio data...
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 p-1">
          {/* Gauge bar */}
          <div className="relative">
            <div className="text-center font-mono text-[10px] text-kvh-text-muted mb-1">VOCAL THREAT SCORE</div>
            <div className="w-full h-5 bg-kvh-bg rounded-full border border-kvh-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
              />
            </div>
            <div className="flex justify-between mt-0.5 font-mono text-[8px] text-kvh-text-muted">
              <span>0</span>
              <span style={{ color }} className="font-bold text-[11px]">{score}/100</span>
              <span>100</span>
            </div>
            <div className="text-center mt-0.5">
              <span
                className="inline-block px-2 py-0.5 rounded-full font-mono text-[8px] font-bold animate-pulse"
                style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}50` }}
              >
                {getLabel(score)}
              </span>
            </div>
          </div>

          {/* Feature values */}
          <div className="grid grid-cols-2 gap-1 mt-1">
            {[
              { label: 'Pitch', value: `${analysis.pitch} Hz`, key: 'pitch' },
              { label: 'Jitter', value: analysis.jitter?.toFixed(4), key: 'jitter' },
              { label: 'Shimmer', value: analysis.shimmer?.toFixed(4), key: 'shimmer' },
              { label: 'Energy', value: `${analysis.energy} dB`, key: 'energy' },
            ].map(f => (
              <div key={f.key} className="bg-kvh-bg rounded border border-kvh-border p-1.5">
                <div className="font-mono text-[8px] text-kvh-text-muted uppercase">{f.label}</div>
                <div className="font-mono text-[10px] text-kvh-text font-semibold">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
