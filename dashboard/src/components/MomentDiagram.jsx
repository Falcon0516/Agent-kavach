import { useMemo } from 'react';

const MOMENT_DATA = [
  {
    agent: 'supervisor',
    label: 'SUPERVISOR',
    color: '#58a6ff',
    motive: 'Validate trigger & transcribe audio under stress',
    opportunity: 'SOS / Voice / Call / Shake trigger received',
    momentum: 'Instant GPS validation + Whisper STT in <0.5s',
    execution: 'Audio → Whisper → transcript; GPS bounding-box check',
    nudge: 'Fan-out to 6 parallel agents simultaneously',
    transparency: 'Dashboard shows trigger source + transcript',
  },
  {
    agent: 'threat',
    label: 'THREAT',
    color: '#ff6b6b',
    motive: 'Quantify danger level to prioritize response',
    opportunity: 'Transcript + time-of-day + NCRB hotspot data',
    momentum: 'LLM scores threat 1-5 in <2s, no human needed',
    execution: 'Groq LLM analyzes keywords, time risk, location',
    nudge: 'Threat level cascades to FIR severity + dispatch priority',
    transparency: 'Threat gauge + keywords + confidence % on dashboard',
  },
  {
    agent: 'ncrb',
    label: 'NCRB',
    color: '#da77f2',
    motive: 'Historical crime context amplifies threat accuracy',
    opportunity: 'GPS coordinates from trigger or GMLC',
    momentum: 'Pure Python geo-match — 0ms LLM latency',
    execution: 'Haversine distance vs 12 NCRB hotspot zones',
    nudge: 'Hotspot match → threat_level + 1 boost',
    transparency: 'NCRB panel highlights zone name + incident count',
  },
  {
    agent: 'family_alert',
    label: 'FAMILY ALERT',
    color: '#51cf66',
    motive: 'Instant trusted contact notification saves lives',
    opportunity: 'Victim name + GPS + threat level available',
    momentum: 'Cerebras LLM crafts bilingual msg in <1s',
    execution: 'Hindi+English WhatsApp via Twilio + Google Maps link',
    nudge: 'Family receives live GPS tracking link',
    transparency: 'WhatsApp SID + delivery status on dashboard',
  },
  {
    agent: 'fir',
    label: 'FIR GENERATION',
    color: '#fcc419',
    motive: 'Legal evidence must be generated before memory fades',
    opportunity: 'Transcript + IPC sections + threat assessment',
    momentum: 'Auto-drafts formal FIR with IPC 354D/506 etc.',
    execution: 'OpenRouter LLM generates police-format FIR document',
    nudge: 'FIR stored + sent to nearest police station',
    transparency: 'Full FIR text + case number visible on dashboard',
  },
  {
    agent: 'argus',
    label: 'ARGUS SURVEILLANCE',
    color: '#cc5de8',
    motive: 'Visual evidence + real-time threat detection',
    opportunity: 'GPS triggers nearby CCTV node activation',
    momentum: 'YOLO + Haar cascade detect faces/weapons/plates',
    execution: 'MJPEG stream → frame analysis → threat objects',
    nudge: 'Group threat / weapon → escalate to police command',
    transparency: 'Live annotated camera feed on dashboard',
  },
  {
    agent: 'navigation',
    label: 'SAFE NAVIGATION',
    color: '#74c0fc',
    motive: 'Guide victim to safety while help is en route',
    opportunity: 'GPS + police/hospital/safe house databases',
    momentum: 'Haversine routing avoids crime hotspot zones',
    execution: 'Nearest PS / Hospital / Safe House + ETA calculation',
    nudge: 'Safe route displayed on map with ARGUS coverage overlay',
    transparency: 'Navigation panel + interactive map on dashboard',
  },
];

export default function MomentDiagram({ state, thoughts }) {
  const completedAgents = useMemo(() => {
    const set = new Set(state?.completed_agents || []);
    thoughts?.forEach(t => {
      if (t.status === 'complete') set.add(t.agent);
    });
    return set;
  }, [state, thoughts]);

  const activeAgent = useMemo(() => {
    const running = thoughts?.filter(t => t.status === 'running');
    return running?.length > 0 ? running[running.length - 1].agent : null;
  }, [thoughts]);

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-purple">
        <span>🔬</span> MOMENT FRAMEWORK — AGENT WORKFLOW
        <span className="ml-auto kvh-badge text-[8px]" style={{ color: '#cc5de8', borderColor: '#cc5de830' }}>
          LANGGRAPH
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1.5 space-y-1.5">
        {MOMENT_DATA.map((item, idx) => {
          const isComplete = completedAgents.has(item.agent);
          const isActive = activeAgent === item.agent;
          const isIdle = !isComplete && !isActive;

          return (
            <div
              key={item.agent}
              className="rounded-lg border transition-all duration-300"
              style={{
                borderColor: isActive ? `${item.color}60` : isComplete ? `${item.color}30` : '#30363d40',
                background: isActive
                  ? `linear-gradient(135deg, ${item.color}08, ${item.color}15)`
                  : isComplete
                  ? `${item.color}06`
                  : 'rgba(13,17,23,0.5)',
                boxShadow: isActive ? `0 0 20px ${item.color}15` : 'none',
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background: isComplete ? item.color : isActive ? item.color : '#475569',
                    boxShadow: isActive ? `0 0 8px ${item.color}` : 'none',
                    animation: isActive ? 'pulse 1.5s infinite' : 'none',
                  }}
                />
                <span
                  className="font-mono text-[10px] font-bold tracking-wider"
                  style={{ color: isIdle ? '#64748b' : item.color }}
                >
                  {isComplete ? '✓ ' : isActive ? '⟳ ' : ''}{item.label}
                </span>
                {isActive && (
                  <span className="ml-auto font-mono text-[8px] px-1.5 py-0.5 rounded animate-pulse"
                    style={{ color: item.color, background: `${item.color}15`, border: `1px solid ${item.color}30` }}>
                    EXECUTING
                  </span>
                )}
                {isComplete && (
                  <span className="ml-auto font-mono text-[8px] px-1.5 py-0.5 rounded"
                    style={{ color: '#3fb950', background: '#3fb95010', border: '1px solid #3fb95030' }}>
                    COMPLETE
                  </span>
                )}
              </div>

              {/* MOMENT grid — always visible for active/complete, collapsed for idle */}
              {(isActive || isComplete) && (
                <div className="grid grid-cols-3 gap-x-2 gap-y-1 px-2.5 pb-2 text-[8px] font-mono">
                  {[
                    ['M · MOTIVE', item.motive],
                    ['O · OPPORTUNITY', item.opportunity],
                    ['M · MOMENTUM', item.momentum],
                    ['E · EXECUTION', item.execution],
                    ['N · NUDGE', item.nudge],
                    ['T · TRANSPARENCY', item.transparency],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ color: `${item.color}90` }} className="font-bold mb-0.5">{label}</div>
                      <div className="text-kvh-text-muted leading-tight">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
