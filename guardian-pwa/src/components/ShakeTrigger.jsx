import React, { useEffect, useRef } from 'react';

export default function ShakeTrigger({ onTrigger }) {
  const lastUpdate = useRef(0);
  const shakeCount = useRef(0);
  const cooldownPhase = useRef(false);

  useEffect(() => {
    const handleMotion = (event) => {
      if (cooldownPhase.current) return;

      const acc = event.acceleration || event.accelerationIncludingGravity;
      if (!acc || acc.x === null) return;
      
      const mag = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
      
      if (mag > 25) {
        const now = Date.now();
        if (now - lastUpdate.current < 500) {
          shakeCount.current += 1;
        } else {
          shakeCount.current = 1;
        }
        lastUpdate.current = now;

        if (shakeCount.current >= 2) {
          onTrigger("shake");
          cooldownPhase.current = true;
          setTimeout(() => cooldownPhase.current = false, 5000);
          shakeCount.current = 0;
        }
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [onTrigger]);

  return null;
}
