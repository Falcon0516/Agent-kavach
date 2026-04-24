import { useEffect, useRef, useMemo } from 'react';
import { AGENT_COLORS } from '../App';

export default function AlertTimeline({ thoughts, state }) {
  const scrollRef = useRef(null);

  // Build timeline events from thoughts + state changes
  const events = useMemo(() => {
    const evts = [];

    thoughts?.forEach((t, i) => {
      if (t.status === 'complete' || t.status === 'running') {
        evts.push({
          id: i,
          time: t.ts ? new Date(t.ts).toLocaleTimeString() : '--:--',
          agent: t.agent,
          text: t.text || t.message || '',
          type: t.status,
          color: AGENT_COLORS[t.agent] || '#8b949e',
        });
      }
    });

    return evts.slice(-15); // Keep last 15 events
  }, [thoughts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-text-muted">
        <span>📋</span> ALERT TIMELINE
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-kvh-text-muted font-mono text-[10px] opacity-40">
            No events yet
          </div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className="flex items-start gap-2 py-1 px-1.5 rounded hover:bg-white/[0.02] text-[10px] font-mono animate-fade-in"
            >
              {/* Time */}
              <span className="text-kvh-text-muted flex-shrink-0 w-[52px]">{evt.time}</span>

              {/* Color dot */}
              <div
                className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                style={{ backgroundColor: evt.color }}
              />

              {/* Agent */}
              <span
                className="flex-shrink-0 font-semibold uppercase w-[56px] truncate"
                style={{ color: evt.color }}
              >
                {evt.agent}
              </span>

              {/* Text */}
              <span className="text-kvh-text truncate flex-1">{evt.text}</span>

              {/* Status indicator */}
              <span className={`flex-shrink-0 ${evt.type === 'complete' ? 'text-kvh-green' : 'text-kvh-amber'}`}>
                {evt.type === 'complete' ? '●' : '◐'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
