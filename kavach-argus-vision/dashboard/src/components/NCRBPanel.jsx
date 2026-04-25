export default function NCRBPanel({ ncrbHotspotMatch, ncrbContext, nearestHotspot }) {
  const isLoading = ncrbHotspotMatch === undefined || ncrbHotspotMatch === null;
  const hasData = !isLoading;

  return (
    <div className="kvh-card h-full flex flex-col border-kvh-purple/20">
      <div className="kvh-card-header text-kvh-purple">
        <span>📊</span> NCRB HISTORICAL ANALYSIS
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          /* Skeleton with purple shimmer */
          <div className="space-y-2 p-1">
            <div className="skeleton-purple h-6 w-3/4 rounded" />
            <div className="skeleton-purple h-4 w-full rounded" />
            <div className="skeleton-purple h-4 w-5/6 rounded" />
            <div className="skeleton-purple h-3 w-2/3 rounded mt-3" />
            <div className="skeleton-purple h-3 w-1/2 rounded" />
          </div>
        ) : ncrbHotspotMatch ? (
          /* HOTSPOT MATCH */
          <div className="space-y-2">
            <div className="kvh-badge kvh-badge-red animate-pulse-fast text-[9px]">
              ⚠ HOTSPOT ZONE MATCH
            </div>

            {nearestHotspot && (
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-kvh-text-muted">Zone:</span>
                  <span className="font-mono text-[11px] text-kvh-amber font-semibold">
                    {nearestHotspot.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-kvh-text-muted">Distance:</span>
                  <span className="font-mono text-[11px] text-kvh-red">
                    {nearestHotspot.distance_m}m
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-kvh-text-muted">Incidents:</span>
                  <span className="font-mono text-[11px] text-kvh-red font-semibold">
                    {nearestHotspot.incident_count} stalking cases (2023)
                  </span>
                </div>
              </div>
            )}

            {ncrbContext && (
              <p className="font-mono text-[10px] text-kvh-text-muted leading-relaxed mt-2 border-t border-kvh-border/50 pt-2">
                {ncrbContext}
              </p>
            )}

            <div className="flex items-center gap-1.5 mt-2 py-1 px-2 rounded bg-kvh-amber/10 border border-kvh-amber/20">
              <span className="text-[10px]">⚡</span>
              <span className="font-mono text-[9px] text-kvh-amber">
                Threat baseline elevated +1
              </span>
            </div>
          </div>
        ) : (
          /* LOCATION CLEAR */
          <div className="space-y-2">
            <div className="kvh-badge kvh-badge-green text-[9px]">
              ✓ LOCATION CLEAR
            </div>
            {nearestHotspot && (
              <p className="font-mono text-[10px] text-kvh-text-muted mt-2">
                Nearest hotspot: <span className="text-kvh-text">{nearestHotspot.name}</span> at{' '}
                <span className="text-kvh-green">{nearestHotspot.distance_m}m</span>
              </p>
            )}
          </div>
        )}

        {/* Source attribution */}
        {hasData && (
          <div className="mt-auto pt-2 border-t border-kvh-border/30">
            <span className="font-mono text-[8px] text-kvh-text-muted opacity-50">
              Source: NCRB Crime Records Bureau — Demo Data
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
