import { useState, useEffect, useRef } from 'react';

export default function FIRPanel({ firText, caseNumber, ipcSections }) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const prevTextRef = useRef('');
  const scrollRef = useRef(null);

  // Typewriter effect
  useEffect(() => {
    if (!firText || firText === prevTextRef.current) return;
    prevTextRef.current = firText;

    const words = firText.split(' ');
    setDisplayedText('');
    setIsTyping(true);
    let idx = 0;

    const interval = setInterval(() => {
      if (idx < words.length) {
        setDisplayedText(prev => prev + (idx > 0 ? ' ' : '') + words[idx]);
        idx++;
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [firText]);

  return (
    <div className="kvh-card h-full flex flex-col">
      <div className="kvh-card-header text-kvh-amber">
        <span>📄</span> FIR GENERATION
        {caseNumber && (
          <span className="kvh-badge kvh-badge-amber ml-auto text-[8px]">
            {caseNumber}
          </span>
        )}
      </div>

      {/* IPC Section chips */}
      {ipcSections?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ipcSections.map((sec, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded font-mono text-[8px] font-semibold bg-kvh-amber/10 text-kvh-amber border border-kvh-amber/20">
              IPC §{sec}
            </span>
          ))}
        </div>
      )}

      {/* FIR text with typewriter */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 pr-1">
        {displayedText ? (
          <pre className="font-mono text-[10px] text-kvh-text leading-relaxed whitespace-pre-wrap break-words">
            {displayedText}
            {isTyping && <span className="typewriter-cursor" />}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-kvh-text-muted font-mono text-[10px] opacity-40">
            <div className="text-center">
              <div className="text-lg mb-1">📄</div>
              Awaiting FIR generation...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
