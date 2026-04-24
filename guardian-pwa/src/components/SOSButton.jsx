import React, { useRef } from 'react';

export default function SOSButton({ onTrigger, onFakeCall }) {
  const timerRef = useRef(null);

  const startPress = () => {
    timerRef.current = setTimeout(() => {
      onFakeCall();
    }, 500); // 500ms long press -> fake call
  };

  const endPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      onTrigger("sos_button"); // short press
    }
  };

  const cancelPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div className="w-full flex justify-center py-8">
      <button 
        onMouseDown={startPress} onMouseUp={endPress} onMouseLeave={cancelPress}
        onTouchStart={startPress} onTouchEnd={endPress}
        className="w-64 h-64 bg-red-600 rounded-full shadow-[0_0_40px_rgba(220,38,38,0.6)] flex items-center justify-center border-8 border-red-800 hover:bg-red-500 active:scale-95 transition-transform"
      >
        <span className="text-4xl font-extrabold text-white text-center tracking-widest drop-shadow-md">
          🛡<br />SOS<br />KAVACH
        </span>
      </button>
    </div>
  );
}
