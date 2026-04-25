import React, { useState, useEffect } from 'react';
import TrustedContacts from './TrustedContacts';

export default function RegistrationScreen({ onRegister, silentMode, setSilentMode }) {
  const [name, setName] = useState("");
  const [familyPhone, setFamilyPhone] = useState("");
  const [showContacts, setShowContacts] = useState(false);

  useEffect(() => {
    const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
    if (reg.name) setName(reg.name);
    if (reg.familyPhone) setFamilyPhone(reg.familyPhone);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { name, familyPhone, contacts: [] };
    localStorage.setItem("kavach_reg", JSON.stringify(data));
    try {
      await fetch(`http://${import.meta.env.VITE_MSI_IP || "localhost"}:8000/api/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ victim_name: name, family_phone: familyPhone })
      });
    } catch (err) { }
    onRegister();
  };

  const toggleSilent = () => {
    const newVal = !silentMode;
    setSilentMode?.(newVal);
    localStorage.setItem("kavach_silent", String(newVal));
  };

  return (
    <div className="min-h-screen flex flex-col p-6 items-center" style={{ background: '#02080f', color: '#e2e8f0' }}>
      <div className="w-full max-w-sm pt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-1" style={{ color: '#e11d48' }}>🛡 KAVACH</h1>
          <p className="text-xs" style={{ color: '#64748b' }}>Autonomous Safety Platform</p>
        </div>

        {/* Registration form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Your Name</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full p-3 rounded-xl text-sm outline-none transition-all"
              style={{ background: 'rgba(2,8,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
              placeholder="e.g. Priya" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#94a3b8' }}>Family Phone (SOS)</label>
            <input required type="text" value={familyPhone} onChange={e => setFamilyPhone(e.target.value)}
              className="w-full p-3 rounded-xl text-sm outline-none transition-all"
              style={{ background: 'rgba(2,8,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
              placeholder="+919876543210" />
          </div>
          <button type="submit" className="w-full p-3 rounded-xl text-sm font-bold active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', color: '#fff' }}>
            Save & Continue
          </button>
        </form>

        {/* Silent Mode Toggle */}
        <div className="mt-4 p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div className="text-xs font-bold" style={{ color: '#e2e8f0' }}>🔇 Silent SOS Mode</div>
            <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>No sound, no screen flash on trigger</div>
          </div>
          <button onClick={toggleSilent}
            className="w-12 h-6 rounded-full transition-all relative"
            style={{ background: silentMode ? '#e11d48' : 'rgba(255,255,255,0.1)' }}>
            <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{ left: silentMode ? '26px' : '2px' }} />
          </button>
        </div>

        {/* Trusted Contacts */}
        <div className="mt-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <TrustedContacts />
        </div>

        {/* Back button */}
        <button onClick={() => onRegister()} className="w-full mt-4 py-3 rounded-xl text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
          ← Back to Map
        </button>
      </div>
    </div>
  );
}
