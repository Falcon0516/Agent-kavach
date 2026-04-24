import { useMemo } from 'react';

const PHASES = [
  { id: 'idle', label: 'IDLE', icon: '⏸', color: '#475569', desc: 'Monitoring...' },
  { id: 'triggered', label: 'TRIGGERED', icon: '🚨', color: '#e11d48', desc: 'SOS received' },
  { id: 'agents', label: 'AGENTS ACTIVE', icon: '🤖', color: '#d29922', desc: '6 agents running' },
  { id: 'dispatched', label: 'POLICE NOTIFIED', icon: '🚔', color: '#58a6ff', desc: 'Help dispatched' },
  { id: 'resolved', label: 'RESOLVED', icon: '✅', color: '#3fb950', desc: 'Case closed' },
];

function getCurrentPhase(state) {
  if (!state || !state.trigger_type) return 0; // IDLE
  const completed = state.completed_agents || [];
  if (completed.length >= 6) return 3; // POLICE_NOTIFIED
  if (completed.length > 0 || state.threat_level > 0) return 2; // AGENTS_ACTIVE
  return 1; // TRIGGERED
}

export default function KavachStateMachine({ state }) {
  const currentPhase = useMemo(() => getCurrentPhase(state), [state]);
  const elapsed = state?.pipeline_start_ms
    ? Math.floor((Date.now() - state.pipeline_start_ms) / 1000)
    : 0;

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-text-muted">
        <span>⚡</span> KAVACH STATE MACHINE
      </div>

      <div className="flex-1 flex flex-col justify-center gap-0.5 px-2 py-1">
        {PHASES.map((phase, i) => {
          const isActive = i === currentPhase;
          const isDone = i < currentPhase;
          const isFuture = i > currentPhase;

          return (
            <div key={phase.id} className="flex items-center gap-2">
              {/* Connector line */}
              <div className="flex flex-col items-center w-4 flex-shrink-0">
                <div className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold"
                  style={{
                    background: isDone ? phase.color : isActive ? phase.color : 'rgba(255,255,255,0.08)',
                    boxShadow: isActive ? `0 0 10px ${phase.color}60` : 'none',
                    border: `2px solid ${isDone || isActive ? phase.color : 'rgba(255,255,255,0.15)'}`,
                    animation: isActive ? 'pulse 1.5s infinite' : 'none',
                  }}>
                  {isDone ? '✓' : ''}
                </div>
                {i < PHASES.length - 1 && (
                  <div className="w-0.5 h-3"
                    style={{ background: isDone ? PHASES[i + 1].color : 'rgba(255,255,255,0.08)' }} />
                )}
              </div>

              {/* Phase label */}
              <div className={`flex-1 flex items-center gap-1.5 px-2 py-1 rounded transition-all ${isActive ? 'scale-[1.02]' : ''}`}
                style={{
                  background: isActive ? `${phase.color}12` : 'transparent',
                  border: `1px solid ${isActive ? `${phase.color}30` : 'transparent'}`,
                  opacity: isFuture ? 0.35 : 1,
                }}>
                <span className="text-[11px]">{phase.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[9px] font-bold"
                    style={{ color: isDone || isActive ? phase.color : '#475569' }}>
                    {phase.label}
                  </span>
                  {isActive && (
                    <span className="ml-1 font-mono text-[8px]" style={{ color: '#64748b' }}>
                      {phase.desc}
                    </span>
                  )}
                </div>
                {isActive && elapsed > 0 && (
                  <span className="font-mono text-[8px] tabular-nums" style={{ color: phase.color }}>
                    {elapsed}s
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline status bar */}
      <div className="px-2 pb-1.5">
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${(currentPhase / (PHASES.length - 1)) * 100}%`,
              background: `linear-gradient(90deg, ${PHASES[0].color}, ${PHASES[currentPhase].color})`,
            }} />
        </div>
      </div>
    </div>
  );
}
