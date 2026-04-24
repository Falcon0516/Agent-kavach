import { useMemo } from 'react';

const AGENTS = [
  { id: 'threat', name: 'THREAT AGENT', icon: '🔍', color: '#da3633', stateKey: 'threat_level' },
  { id: 'family', name: 'FAMILY ALERT', icon: '👨‍👩‍👧', color: '#3fb950', stateKey: 'family_alerted' },
  { id: 'fir', name: 'FIR AGENT', icon: '📄', color: '#d29922', stateKey: 'fir_case_number' },
  { id: 'navigation', name: 'NAVIGATION', icon: '🧭', color: '#58a6ff', stateKey: 'nearest_police' },
  { id: 'argus', name: 'ARGUS MESH', icon: '📷', color: '#bc8cff', stateKey: 'argus_nodes_activated' },
  { id: 'ncrb', name: 'NCRB INTEL', icon: '📊', color: '#f78166', stateKey: 'ncrb_hotspot_match' },
];

function getAgentStatus(agent, state, completedAgents) {
  if (completedAgents?.includes(agent.id)) return 'done';
  if (completedAgents?.length > 0) {
    const idx = AGENTS.findIndex(a => a.id === agent.id);
    const completedIdx = AGENTS.findIndex(a => completedAgents.includes(a.id));
    if (idx <= completedIdx) return 'done';
  }
  // Check if data exists
  const val = state?.[agent.stateKey];
  if (val && val !== '' && val !== 0 && val !== false && (!Array.isArray(val) || val.length > 0)) return 'done';
  if (state?.trigger_type) return 'pending';
  return 'idle';
}

export default function AgentStateDiagram({ state }) {
  const completedAgents = state?.completed_agents || [];

  const agentStates = useMemo(() =>
    AGENTS.map(a => ({ ...a, status: getAgentStatus(a, state, completedAgents) })),
    [state, completedAgents]
  );

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-text-muted">
        <span>🤖</span> AGENT STATE DIAGRAM
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {agentStates.map(agent => (
          <div key={agent.id} className="flex items-center gap-2 p-1.5 rounded border transition-all"
            style={{
              background: agent.status === 'done' ? `${agent.color}08` : 'transparent',
              borderColor: agent.status === 'done' ? `${agent.color}40` : 'rgba(255,255,255,0.06)',
            }}>
            {/* Status indicator */}
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{
                background: agent.status === 'done' ? agent.color
                  : agent.status === 'pending' ? '#d29922'
                  : 'rgba(255,255,255,0.1)',
                boxShadow: agent.status === 'done' ? `0 0 6px ${agent.color}60` : 'none',
                animation: agent.status === 'pending' ? 'pulse 1.5s infinite' : 'none',
              }} />

            {/* Agent info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px]">{agent.icon}</span>
                <span className="font-mono text-[9px] font-bold truncate" style={{ color: agent.status === 'done' ? agent.color : '#475569' }}>
                  {agent.name}
                </span>
              </div>
            </div>

            {/* Status badge */}
            <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-full font-bold"
              style={{
                background: agent.status === 'done' ? `${agent.color}15` : agent.status === 'pending' ? 'rgba(210,153,34,0.15)' : 'rgba(255,255,255,0.05)',
                color: agent.status === 'done' ? agent.color : agent.status === 'pending' ? '#d29922' : '#475569',
              }}>
              {agent.status === 'done' ? '✓ DONE' : agent.status === 'pending' ? '⟳ RUN' : '○ IDLE'}
            </span>

            {/* Data preview */}
            {agent.status === 'done' && (
              <span className="font-mono text-[8px] truncate max-w-[60px]" style={{ color: '#64748b' }}>
                {agent.id === 'threat' && state?.threat_level !== undefined ? `L${state.threat_level}` : ''}
                {agent.id === 'fir' && state?.fir_case_number ? state.fir_case_number.slice(-8) : ''}
                {agent.id === 'family' && state?.family_alerted ? '📱 Sent' : ''}
                {agent.id === 'argus' && state?.argus_nodes_activated ? `${state.argus_nodes_activated.length} nodes` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
