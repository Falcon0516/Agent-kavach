import React, { useState, useEffect } from 'react';

export default function TrustedContacts({ onClose }) {
  const [contacts, setContacts] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('kavach_contacts') || '[]');
    setContacts(saved);
  }, []);

  const save = (updated) => {
    setContacts(updated);
    localStorage.setItem('kavach_contacts', JSON.stringify(updated));
  };

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) return;
    if (contacts.length >= 5) return;
    const updated = [...contacts, { name: newName.trim(), phone: newPhone.trim() }];
    save(updated);
    setNewName('');
    setNewPhone('');
  };

  const removeContact = (index) => {
    const updated = contacts.filter((_, i) => i !== index);
    save(updated);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold" style={{ color: '#e11d48' }}>
          👥 Trusted Circle ({contacts.length}/5)
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-xs px-2 py-1 rounded" style={{ color: '#64748b' }}>✕</button>
        )}
      </div>

      <p className="text-[11px]" style={{ color: '#64748b' }}>
        These contacts receive your location and emergency alerts when SOS is triggered.
      </p>

      {/* Contact list */}
      <div className="space-y-2">
        {contacts.map((c, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(225,29,72,0.05)', border: '1px solid rgba(225,29,72,0.15)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(225,29,72,0.15)', color: '#e11d48' }}>
              {c.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: '#e2e8f0' }}>{c.name}</div>
              <div className="text-[10px]" style={{ color: '#64748b' }}>{c.phone}</div>
            </div>
            <button onClick={() => removeContact(i)} className="text-xs px-2 py-1 rounded" style={{ color: '#e11d48', background: 'rgba(225,29,72,0.1)' }}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add contact form */}
      {contacts.length < 5 && (
        <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Contact name"
            className="w-full p-2.5 rounded-lg text-xs outline-none"
            style={{ background: 'rgba(2,8,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
          />
          <input
            type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full p-2.5 rounded-lg text-xs outline-none"
            style={{ background: 'rgba(2,8,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
          />
          <button onClick={addContact}
            className="w-full py-2 rounded-lg text-xs font-bold transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', color: '#fff' }}>
            + Add Contact
          </button>
        </div>
      )}
    </div>
  );
}
