import { useEffect, useRef } from 'react';
import { AGENT_COLORS } from '../App';

export default function AgentThoughtPanel({ thoughts }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thoughts]);

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-text-muted">
        <span>💭</span> AGENT THOUGHT STREAM
        <span className="ml-auto text-[9px] opacity-50">{thoughts.length} events</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
        {thoughts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-kvh-text-muted font-mono text-xs opacity-50">
            <span>Awaiting agent thoughts...</span>
          </div>
        ) : (
          thoughts.map((t, i) => {
            const color = AGENT_COLORS[t.agent] || AGENT_COLORS.system;
            const isComplete = t.status === 'complete';
            const isRunning = t.status === 'running';

            return (
              <div
                key={i}
                className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-white/[0.02] transition-colors animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Status dot */}
                <div
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isRunning ? 'animate-pulse-fast' : ''}`}
                  style={{ backgroundColor: color }}
                />

                {/* Agent tag */}
                <span
                  className="font-mono text-[10px] font-bold uppercase tracking-wider flex-shrink-0 mt-0.5"
                  style={{ color, minWidth: '72px' }}
                >
                  {t.agent || 'system'}
                </span>

                {/* Thought text */}
                <span className="font-mono text-[11px] text-kvh-text leading-relaxed flex-1">
                  {t.text || t.message || t.content || JSON.stringify(t)}
                </span>

                {/* Duration badge */}
                {t.duration !== undefined && (
                  <span
                    className="font-mono text-[9px] flex-shrink-0 px-1.5 py-0.5 rounded"
                    style={{
                      color,
                      backgroundColor: `${color}15`,
                      border: `1px solid ${color}30`,
                    }}
                  >
                    {t.duration.toFixed(1)}s
                  </span>
                )}

                {/* Status icon */}
                <span className="text-[10px] flex-shrink-0 mt-0.5">
                  {isComplete ? '✓' : isRunning ? '⟳' : '·'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
