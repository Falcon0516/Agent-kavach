export default function CameraPanel({ feeds, argusActive, apiBase }) {
  const feedSlots = feeds || [null, null];
  const slot1 = feedSlots[0] || null;
  const slot2 = feedSlots[1] || null;

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-purple">
        <span>📷</span> ARGUS SURVEILLANCE
        {argusActive ? (
          <span className="kvh-badge kvh-badge-green ml-auto">● ACTIVE</span>
        ) : (
          <span className="kvh-badge ml-auto" style={{ color: '#8b949e', borderColor: '#30363d', background: 'rgba(48,54,61,0.3)' }}>○ STANDBY</span>
        )}
      </div>
      <div className="flex-1 grid grid-rows-2 gap-1.5 min-h-0">
        {[slot1, slot2].map((feed, idx) => (
          <div key={idx} className="relative rounded overflow-hidden bg-black/40 border border-kvh-border/50 min-h-0">
            {feed && feed.active ? (
              <>
                {/* MJPEG feed placeholder — actual stream from backend */}
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-kvh-card to-black">
                  <img
                    src={`${apiBase}/api/camera/${feed.id}/stream`}
                    alt={`Camera ${feed.id}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-kvh-text-muted font-mono text-[10px]">
                    <div className="text-center">
                      <div className="text-2xl mb-1">📷</div>
                      <div>{feed.id}</div>
                      <div className="text-[9px] opacity-50">MJPEG FEED</div>
                    </div>
                  </div>
                </div>

                {/* Overlay badges */}
                <div className="absolute top-1 left-1 flex flex-col gap-1">
                  <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-kvh-green border border-kvh-green/30">
                    {feed.id}
                  </span>
                </div>

                <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
                  {feed.face_detected && feed.face_count > 0 && (
                    <span className="kvh-badge kvh-badge-green text-[8px] py-0">
                      FACE: {feed.face_count}
                    </span>
                  )}
                  {feed.group_threat && (
                    <span className="kvh-badge kvh-badge-amber text-[8px] py-0 animate-pulse-fast">
                      ⚠ GROUP THREAT — {feed.face_count}
                    </span>
                  )}
                  {feed.plate_detected?.length > 0 && (
                    <span className="kvh-badge kvh-badge-red text-[8px] py-0">
                      PLATE: {feed.plate_detected[0]}
                    </span>
                  )}
                  {feed.threat_objects?.length > 0 && (
                    <span className="kvh-badge kvh-badge-red text-[8px] py-0 animate-pulse-fast">
                      ⚠ {feed.threat_objects[0].toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Scene analysis at bottom */}
                {feed.scene_analysis && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                    <span className="font-mono text-[8px] text-kvh-text-muted">
                      {feed.scene_analysis.length > 60 ? feed.scene_analysis.slice(0, 60) + '…' : feed.scene_analysis}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-kvh-text-muted text-lg mb-1">○</div>
                  <span className="font-mono text-[10px] text-kvh-text-muted opacity-50">
                    CAM-{idx + 1} STANDBY
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
