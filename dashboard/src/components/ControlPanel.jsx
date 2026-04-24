import { useNavigate } from 'react-router-dom';

export default function ControlPanel({ wsConnected, alertActive, onTrigger, onReset, onMock, onNavigatePolice }) {
  const navigate = useNavigate();

  return (
    <header className={`flex items-center justify-between px-4 py-2 border-b bg-kvh-card/80 backdrop-blur-sm ${alertActive ? 'alert-border-flash border-kvh-red' : 'border-kvh-border'}`}>
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <span className="text-xl">🛡</span>
        <h1 className="font-mono text-sm font-bold tracking-widest text-kvh-text-bright uppercase">
          KAVACH COMMAND CENTER
        </h1>
        {alertActive && (
          <span className="kvh-badge kvh-badge-red animate-pulse-fast">
            ⚠ ALERT ACTIVE
          </span>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* WebSocket indicator */}
        <div className="flex items-center gap-1.5 mr-2">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-kvh-green animate-pulse-slow' : 'bg-kvh-red'}`} />
          <span className="font-mono text-[10px] text-kvh-text-muted">
            {wsConnected ? 'WS LIVE' : 'WS OFF'}
          </span>
        </div>

        {/* Mock simulation */}
        <button
          onClick={onMock}
          className="px-3 py-1.5 bg-kvh-purple/10 border border-kvh-purple/30 text-kvh-purple rounded font-mono text-[10px] font-semibold uppercase tracking-wider hover:bg-kvh-purple/20 transition-all"
          title="Mock Simulation (M)"
        >
          ▶ MOCK
        </button>

        {/* Trigger */}
        <button
          onClick={onTrigger}
          className="px-3 py-1.5 bg-kvh-amber/10 border border-kvh-amber/30 text-kvh-amber rounded font-mono text-[10px] font-semibold uppercase tracking-wider hover:bg-kvh-amber/20 transition-all"
          title="Manual Trigger (SPACE)"
        >
          ⚡ TRIGGER
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          className="px-3 py-1.5 bg-kvh-border/30 border border-kvh-border text-kvh-text-muted rounded font-mono text-[10px] font-semibold uppercase tracking-wider hover:bg-kvh-border/50 hover:text-kvh-text transition-all"
          title="Reset (R)"
        >
          ↻ RESET
        </button>

        {/* Police dashboard */}
        <button
          onClick={onNavigatePolice}
          className="px-3 py-1.5 bg-kvh-blue/10 border border-kvh-blue/30 text-kvh-blue rounded font-mono text-[10px] font-semibold uppercase tracking-wider hover:bg-kvh-blue/20 transition-all"
          title="Police Dashboard (P)"
        >
          🚔 POLICE ↗
        </button>
      </div>
    </header>
  );
}
