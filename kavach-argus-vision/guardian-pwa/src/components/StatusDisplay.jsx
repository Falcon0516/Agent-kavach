import React, { useEffect, useState } from 'react';

export default function StatusDisplay({ onClose }) {
  const [sysState, setSysState] = useState(null);

  useEffect(() => {
    const int = setInterval(async () => {
      try {
        const msiIp = import.meta.env.VITE_MSI_IP || "localhost";
        const res = await fetch(`http://${msiIp}:8000/api/full_state`);
        if (res.ok) setSysState(await res.json());
      } catch (e) {}
    }, 1000);
    return () => clearInterval(int);
  }, []);

  const completed = sysState?.completed_agents || [];
  
  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl mt-8 w-full max-w-sm border border-gray-700 relative">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-bold text-pink-500 drop-shadow-md">🆘 Pipeline Status</h3>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white transition">✕</button>}
      </div>

      <ul className="space-y-5 text-gray-300">
        <li className="flex items-center text-lg">
          <span className="text-green-500 mr-4 font-bold text-xl drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]">✓</span> 
          Alert Activated
        </li>
        <li className="flex items-center text-lg">
          <span className={completed.includes("argus") ? "text-green-500 mr-4 font-bold text-xl drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" : "text-gray-600 mr-4 text-xl"}>
            {completed.includes("argus") ? "✓" : "○"}
          </span>
          Threat Analysis {sysState?.threat_level ? <span className="ml-2 text-red-400 font-mono">[Lv.{sysState.threat_level}]</span> : ""}
        </li>
        <li className="flex items-center text-lg">
          <span className={sysState?.family_notified ? "text-green-500 mr-4 font-bold text-xl drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" : "text-gray-600 mr-4 text-xl"}>
            {sysState?.family_notified ? "✓" : "○"}
          </span>
          Family Notified
        </li>
        <li className="flex items-center text-lg">
          <span className={completed.includes("navigation") ? "text-green-500 mr-4 font-bold text-xl drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" : "text-gray-600 mr-4 text-xl"}>
            {completed.includes("navigation") ? "✓" : "○"}
          </span>
          Police Informed
        </li>
        <li className="flex items-start text-lg pt-1">
          <span className={completed.includes("ncrb") ? "text-green-500 mr-4 font-bold text-xl mt-1 drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" : "text-gray-600 mr-4 mt-1 text-xl"}>
            {completed.includes("ncrb") ? "✓" : "○"}
          </span>
          <div className="flex-1">
            <span>Location checked (NCRB)</span>
            {sysState?.hotspot_match && (
              <p className="text-sm text-red-400 mt-2 bg-red-900/30 p-2 rounded border border-red-800/50">⚠ Known incident zone — priority flagged</p>
            )}
          </div>
        </li>
      </ul>
    </div>
  );
}
