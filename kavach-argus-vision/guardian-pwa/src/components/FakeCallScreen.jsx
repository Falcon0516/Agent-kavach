import React, { useState, useEffect } from 'react';

export default function FakeCallScreen({ onExit }) {
  const [seconds, setSeconds] = useState(0);
  const [speakerTriple, setSpeakerTriple] = useState(0);

  useEffect(() => {
    try { navigator.vibrate([200, 100, 200]); } catch(e) {}
    const int = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(int);
  }, []);

  const formatTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;

  const handleSpeakerClick = () => {
    setSpeakerTriple(t => t + 1);
    if (speakerTriple >= 2) onExit("kavach_status");
  };

  return (
    <div className="absolute inset-0 z-50 bg-gray-900 text-white flex flex-col items-center pt-24">
      <div className="text-center mb-16">
        <h2 className="text-4xl font-light mb-4">Priya Sharma</h2>
        <p className="text-gray-400 text-2xl">{formatTime(seconds)}</p>
      </div>
      <div className="mt-auto mb-20 w-full flex justify-around px-12">
        <button onClick={() => onExit("home")} 
                className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center shadow-lg active:scale-95">
          <span className="text-4xl text-white">🔴</span>
        </button>
        <button onClick={handleSpeakerClick} 
                className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center shadow-lg active:scale-95">
          <span className="text-4xl text-white">🔊</span>
        </button>
      </div>
    </div>
  );
}
