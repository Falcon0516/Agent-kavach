import { useMemo } from 'react';

export default function ThreatPanel({ threatLevel, keywords, confidence, ncrbMatch }) {
  const level = threatLevel || 0;
  const conf = confidence || 0;

  const gaugeColor = useMemo(() => {
    if (level >= 4) return '#da3633';
    if (level >= 3) return '#d29922';
    if (level >= 2) return '#58a6ff';
    return '#3fb950';
  }, [level]);

  const levelLabel = useMemo(() => {
    if (level >= 5) return 'CRITICAL';
    if (level >= 4) return 'HIGH';
    if (level >= 3) return 'ELEVATED';
    if (level >= 2) return 'MODERATE';
    if (level >= 1) return 'LOW';
    return 'NONE';
  }, [level]);

  // SVG gauge angles
  const startAngle = -135;
  const endAngle = 135;
  const range = endAngle - startAngle;
  const angle = startAngle + (level / 5) * range;

  const r = 40;
  const cx = 55;
  const cy = 50;

  function polarToCartesian(a) {
    const rad = (a * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const arcStart = polarToCartesian(startAngle);
  const arcEnd = polarToCartesian(angle);
  const largeArc = angle - startAngle > 180 ? 1 : 0;

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header" style={{ color: gaugeColor }}>
        <span>🎯</span> THREAT ASSESSMENT
      </div>

      <div className="flex-1 flex gap-2 min-h-0">
        {/* Gauge */}
        <div className="w-[110px] flex-shrink-0">
          <svg viewBox="0 0 110 75" className="w-full h-full">
            {/* Background arc */}
            <path
              d={`M ${polarToCartesian(startAngle).x} ${polarToCartesian(startAngle).y} A ${r} ${r} 0 1 1 ${polarToCartesian(endAngle).x} ${polarToCartesian(endAngle).y}`}
              fill="none"
              stroke="#30363d"
              strokeWidth="6"
              strokeLinecap="round"
            />

            {/* Active arc */}
            {level > 0 && (
              <path
                d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`}
                fill="none"
                stroke={gaugeColor}
                strokeWidth="6"
                strokeLinecap="round"
                className={level >= 4 ? 'gauge-flash' : ''}
                style={{
                  filter: `drop-shadow(0 0 6px ${gaugeColor}80)`,
                }}
              />
            )}

            {/* Center text */}
            <text x={cx} y={cy - 2} textAnchor="middle" fill={gaugeColor} fontSize="22" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              {level}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#8b949e" fontSize="7" fontFamily="'JetBrains Mono', monospace">
              / 5
            </text>
            <text x={cx} y={cy + 24} textAnchor="middle" fill={gaugeColor} fontSize="7" fontWeight="600" fontFamily="'JetBrains Mono', monospace" letterSpacing="1">
              {levelLabel}
            </text>
          </svg>
        </div>

        {/* Details */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
          {/* Confidence */}
          {conf > 0 && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono text-[9px] text-kvh-text-muted">CONFIDENCE</span>
                <span className="font-mono text-[10px] font-semibold" style={{ color: gaugeColor }}>
                  {(conf * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-kvh-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${conf * 100}%`, backgroundColor: gaugeColor }}
                />
              </div>
            </div>
          )}

          {/* Keywords */}
          {keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {keywords.map((kw, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded font-mono text-[8px] font-semibold"
                  style={{
                    color: gaugeColor,
                    backgroundColor: `${gaugeColor}15`,
                    border: `1px solid ${gaugeColor}30`,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* NCRB match notice */}
          {ncrbMatch && (
            <div className="flex items-center gap-1 mt-1 text-kvh-amber">
              <span className="text-[10px]">📊</span>
              <span className="font-mono text-[8px] font-semibold">
                NCRB zone match — threat elevated
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
