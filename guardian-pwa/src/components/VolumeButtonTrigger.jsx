import React, { useEffect, useRef } from 'react';

export default function VolumeButtonTrigger({ onTrigger }) {
  const pressCount = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    const handleTrigger = () => {
      pressCount.current += 1;
      if (timer.current) clearTimeout(timer.current);
      
      if (pressCount.current >= 3) {
        onTrigger("earphone");
        pressCount.current = 0;
      } else {
        timer.current = setTimeout(() => pressCount.current = 0, 2000);
      }
    };

    const keyHandler = (e) => {
      if (e.key === 'v') handleTrigger();
    };
    window.addEventListener('keydown', keyHandler);

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('previoustrack', handleTrigger);
      } catch (e) {}
    }

    return () => {
      window.removeEventListener('keydown', keyHandler);
      if ('mediaSession' in navigator) {
        try { navigator.mediaSession.setActionHandler('previoustrack', null); } catch(e){}
      }
    };
  }, [onTrigger]);

  return null;
}
