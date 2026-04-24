import { useMemo } from 'react';
import { AGENT_COLORS } from '../App';

const NODES = [
  { id: 'supervisor',   label: 'SUPERVISOR',   x: 300, y: 40,  color: '#58a6ff' },
  { id: 'threat',       label: 'THREAT',       x: 80,  y: 140, color: '#ff6b6b' },
  { id: 'family_alert', label: 'FAMILY_ALERT', x: 180, y: 140, color: '#51cf66' },
  { id: 'fir',          label: 'FIR',          x: 280, y: 140, color: '#fcc419' },
  { id: 'navigation',   label: 'NAVIGATION',   x: 380, y: 140, color: '#74c0fc' },
  { id: 'argus',        label: 'ARGUS',        x: 460, y: 140, color: '#cc5de8' },
  { id: 'ncrb',         label: 'NCRB',         x: 540, y: 140, color: '#da77f2' },
];

export default function AgentGraph({ state, thoughts }) {
  const timings = state?.agent_timings || {};
  const ncrbMatch = state?.ncrb_hotspot_match;

  const completedAgents = useMemo(() => {
    const set = new Set();
    thoughts?.forEach(t => {
      if (t.status === 'complete') set.add(t.agent);
    });
    return set;
  }, [thoughts]);

  const supervisorDone = completedAgents.has('supervisor') || timings.supervisor;
  const anyRunning = thoughts?.some(t => t.status === 'running');

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-blue">
        <span>◉</span> AGENT PIPELINE
      </div>
      <div className="flex-1 min-h-0">
        <svg viewBox="0 0 620 200" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#30363d" strokeWidth="0.3" opacity="0.3" />
            </pattern>
            {/* Glow filters */}
            {NODES.map(node => (
              <filter key={`glow-${node.id}`} id={`glow-${node.id}`}>
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>
          <rect width="620" height="200" fill="url(#grid)" />

          {/* Edges: supervisor → each agent */}
          {NODES.slice(1).map((node) => {
            const done = supervisorDone;
            return (
              <line
                key={`edge-${node.id}`}
                x1={NODES[0].x} y1={NODES[0].y + 22}
                x2={node.x} y2={node.y - 22}
                stroke={node.color}
                strokeWidth={done ? 2 : 1}
                opacity={done ? 0.8 : 0.2}
                strokeDasharray={done ? 'none' : '4 4'}
                className={done ? 'svg-edge-draw' : ''}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map((node) => {
            const isComplete = completedAgents.has(node.id) || timings[node.id];
            const isRunning = thoughts?.some(t => t.agent === node.id && t.status === 'running');
            const timing = timings[node.id];

            return (
              <g key={node.id}>
                {/* Outer pulse ring */}
                {(isRunning || isComplete) && (
                  <circle
                    cx={node.x} cy={node.y} r={isRunning ? 28 : 24}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1"
                    opacity={isRunning ? 0.5 : 0.3}
                    className={isRunning ? 'svg-node-pulse' : ''}
                  />
                )}

                {/* Main node circle */}
                <circle
                  cx={node.x} cy={node.y} r={20}
                  fill={isComplete ? node.color : '#161b22'}
                  stroke={node.color}
                  strokeWidth={isComplete ? 2.5 : 1.5}
                  opacity={isComplete ? 1 : isRunning ? 0.7 : 0.4}
                  filter={isComplete ? `url(#glow-${node.id})` : 'none'}
                  className={isRunning ? 'svg-node-glow' : ''}
                />

                {/* Checkmark or spinner icon */}
                {isComplete && (
                  <text x={node.x} y={node.y + 5} textAnchor="middle" fill="#0d1117" fontSize="14" fontWeight="bold">
                    ✓
                  </text>
                )}
                {isRunning && !isComplete && (
                  <text x={node.x} y={node.y + 5} textAnchor="middle" fill={node.color} fontSize="12">
                    ⟳
                  </text>
                )}

                {/* Label */}
                <text
                  x={node.x} y={node.y + 36}
                  textAnchor="middle"
                  fill={isComplete ? node.color : '#8b949e'}
                  fontSize="9"
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="600"
                  letterSpacing="0.5"
                >
                  {node.label}
                </text>

                {/* Timing */}
                {timing !== undefined && (
                  <text
                    x={node.x} y={node.y + 47}
                    textAnchor="middle"
                    fill={node.color}
                    fontSize="8"
                    fontFamily="'JetBrains Mono', monospace"
                    opacity="0.7"
                  >
                    {timing.toFixed(1)}s
                  </text>
                )}

                {/* NCRB hotspot badge */}
                {node.id === 'ncrb' && ncrbMatch && (
                  <>
                    <circle cx={node.x + 16} cy={node.y - 16} r={8} fill="#da3633" />
                    <text x={node.x + 16} y={node.y - 12} textAnchor="middle" fill="white" fontSize="9">⚠</text>
                    <text
                      x={node.x} y={node.y + 58}
                      textAnchor="middle"
                      fill="#da3633"
                      fontSize="8"
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight="700"
                    >
                      HOTSPOT
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* Status text */}
          <text x={310} y={190} textAnchor="middle" fill="#8b949e" fontSize="9" fontFamily="'JetBrains Mono', monospace">
            {anyRunning ? '● PIPELINE ACTIVE' : completedAgents.size > 0 ? `● ${completedAgents.size}/7 COMPLETE` : '○ AWAITING TRIGGER'}
          </text>
        </svg>
      </div>
    </div>
  );
}
