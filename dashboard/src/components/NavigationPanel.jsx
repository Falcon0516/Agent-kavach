export default function NavigationPanel({ result }) {
  if (!result) {
    return (
      <div className="kvh-card h-full flex flex-col">
        <div className="kvh-card-header text-kvh-blue">
          <span>🗺</span> SAFE NAVIGATION
        </div>
        <div className="flex-1 flex items-center justify-center text-kvh-text-muted font-mono text-[10px] opacity-40">
          <div className="text-center">
            <div className="text-lg mb-1">🗺</div>
            Awaiting navigation data...
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      key: 'police',
      icon: '🚔',
      label: 'POLICE STATION',
      data: result.police,
      color: '#58a6ff',
      badgeColor: 'kvh-badge-blue',
    },
    {
      key: 'hospital',
      icon: '🏥',
      label: 'HOSPITAL',
      data: result.hospital,
      color: '#3fb950',
      badgeColor: 'kvh-badge-green',
    },
    {
      key: 'safe_house',
      icon: '🛡',
      label: 'SAFE HOUSE',
      data: result.safe_house,
      color: '#d29922',
      badgeColor: 'kvh-badge-amber',
    },
  ];

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-blue">
        <span>🗺</span> SAFE NAVIGATION
      </div>
      <div className="flex-1 flex flex-col gap-1.5 min-h-0 overflow-y-auto">
        {cards.map((card, idx) => (
          <div
            key={card.key}
            className="flex items-center gap-2 p-2 rounded border border-kvh-border/50 hover:border-opacity-100 transition-all animate-slide-in bg-kvh-bg/50"
            style={{
              animationDelay: `${idx * 150}ms`,
              borderLeftColor: card.color,
              borderLeftWidth: '3px',
            }}
          >
            <span className="text-base flex-shrink-0">{card.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[9px] font-bold tracking-wider" style={{ color: card.color }}>
                {card.label}
              </div>
              <div className="font-mono text-[10px] text-kvh-text truncate">
                {card.data?.name || 'Unknown'}
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <span className={`kvh-badge ${card.badgeColor} text-[8px] py-0`}>
                {card.data?.eta || '--'}
              </span>
              <span className="font-mono text-[8px] text-kvh-text-muted">
                {card.data?.distance || '--'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
