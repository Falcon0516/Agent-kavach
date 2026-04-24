import React, { useState, useEffect } from 'react';

export default function RegistrationScreen({ onRegister }) {
  const [name, setName] = useState("");
  const [familyPhone, setFamilyPhone] = useState("");
  
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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col p-6 items-center justify-center">
      <h1 className="text-4xl font-bold text-pink-500 mb-6 drop-shadow-md">🛡 KAVACH</h1>
      <p className="text-gray-300 mb-8 text-center text-lg">Register your details for offline and online safety.</p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 bg-gray-800 p-6 rounded-2xl shadow-xl">
        <div>
          <label className="block text-gray-400 mb-2 font-medium">Your Name</label>
          <input required type="text" value={name} onChange={e => setName(e.target.value)} 
                 className="w-full p-4 rounded-xl bg-gray-700 text-white border border-gray-600 focus:border-pink-500 focus:ring-2 focus:ring-pink-500 outline-none transition" 
                 placeholder="e.g. Priya" />
        </div>
        <div>
          <label className="block text-gray-400 mb-2 font-medium">Family Phone (SOS)</label>
          <input required type="text" value={familyPhone} onChange={e => setFamilyPhone(e.target.value)} 
                 className="w-full p-4 rounded-xl bg-gray-700 text-white border border-gray-600 focus:border-pink-500 focus:ring-2 focus:ring-pink-500 outline-none transition" 
                 placeholder="+919876543210" />
        </div>
        <button type="submit" className="w-full bg-gradient-to-r from-pink-600 to-rose-600 p-4 rounded-xl text-white font-bold text-lg shadow-md focus:scale-95 transition-transform">
          Complete Registration
        </button>
      </form>
    </div>
  );
}
