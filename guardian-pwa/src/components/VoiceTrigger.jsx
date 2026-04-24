import React, { useEffect, useState } from 'react';

export default function VoiceTrigger({ onTrigger }) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let current = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        current += event.results[i][0].transcript;
      }
      setTranscript(current);
      if (current.toLowerCase().includes("kavach")) {
        onTrigger("voice");
        recognition.stop();
        setTimeout(() => setListening(false), 3000);
      }
    };

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setTimeout(() => { try { recognition.start(); } catch(e){} }, 1000);
    };

    try { recognition.start(); } catch(e) {}

    return () => recognition.stop();
  }, [onTrigger]);

  if (!listening) return null;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="animate-pulse bg-green-500/20 text-green-400 rounded-full h-24 w-24 flex items-center justify-center border-4 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]">
        <span className="text-3xl">🎙</span>
      </div>
      <p className="mt-4 text-green-400 font-bold tracking-wide">Listening...</p>
      {transcript && <p className="text-gray-400 italic text-sm mt-2 font-mono bg-gray-800 px-3 py-1 rounded-full">{transcript}</p>}
    </div>
  );
}
