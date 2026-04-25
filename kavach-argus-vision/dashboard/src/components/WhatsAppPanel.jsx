export default function WhatsAppPanel({ sent, sid, recordingUrl }) {
  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-green">
        <span>📱</span> WHATSAPP ALERT
        {sent && <span className="kvh-badge kvh-badge-green ml-auto text-[8px]">SENT ✓✓</span>}
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-0">
        {sent ? (
          <div className="space-y-2 animate-fade-in">
            {/* WhatsApp bubble */}
            <div className="wa-bubble">
              <div className="font-mono text-[10px] text-white/90 leading-relaxed">
                🚨 <span className="font-bold">KAVACH EMERGENCY ALERT</span>
              </div>
              <div className="font-mono text-[9px] text-white/70 mt-1 leading-relaxed">
                A safety alert has been triggered. Live GPS location is being shared. Police and emergency contacts have been notified.
              </div>
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[8px] text-white/40">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[10px] text-[#53bdeb]">✓✓</span>
              </div>
            </div>

            {/* SID reference */}
            {sid && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[8px] text-kvh-text-muted">SID:</span>
                <span className="font-mono text-[8px] text-kvh-text truncate">{sid}</span>
              </div>
            )}

            {/* Recording URL */}
            {recordingUrl && (
              <div className="flex items-center gap-1.5 py-1 px-2 rounded bg-kvh-green/10 border border-kvh-green/20">
                <span className="text-[10px]">📞</span>
                <span className="font-mono text-[9px] text-kvh-green">Call recording available</span>
              </div>
            )}

            {/* Delivery status */}
            <div className="flex items-center gap-3 text-[9px] font-mono text-kvh-text-muted">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-kvh-green" /> Delivered
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-kvh-blue" /> 3 contacts
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-kvh-text-muted font-mono text-[10px] opacity-40">
            <div className="text-center">
              <div className="text-lg mb-1">📱</div>
              WhatsApp alert pending...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
