import React, { useState, useEffect } from 'react';

export default function TrustedContacts() {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
    const arr = [];
    if (reg.familyPhone) {
      arr.push({ name: "Primary Family Contact", phone: reg.familyPhone });
    }
    if (reg.contacts && Array.isArray(reg.contacts)) {
      reg.contacts.forEach(c => arr.push(c));
    }
    setContacts(arr);
  }, []);

  return (
    <div className="flex-1 w-full bg-gray-900 p-6 text-white pb-24">
      <h2 className="text-2xl font-bold mb-6 text-pink-500">👥 Trusted Contacts</h2>
      
      {contacts.length === 0 ? (
        <div className="text-gray-400 text-center mt-10">No trusted contacts registered.</div>
      ) : (
        <div className="space-y-4">
          {contacts.map((c, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 p-4 rounded-xl shadow-lg flex justify-between items-center hover:bg-gray-750 transition">
              <div>
                <h3 className="font-semibold text-lg text-gray-200">{c.name || "Contact"}</h3>
                <p className="text-sm text-gray-400">{c.phone}</p>
              </div>
              <a href={`tel:${c.phone}`} className="h-12 w-12 bg-green-600 rounded-full flex items-center justify-center shadow-md active:scale-95 transition">
                <span className="text-xl">📞</span>
              </a>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-8 bg-rose-950/30 border border-rose-900/50 p-4 rounded-xl">
        <p className="text-rose-400 text-sm flex gap-2">
          <span>⚠</span> 
          <span>In case of severe emergency, do not call contacts manually. Trigger KAVACH SOS and let AI coordinate.</span>
        </p>
      </div>
    </div>
  );
}
