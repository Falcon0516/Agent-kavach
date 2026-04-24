/**
 * SMS Fallback — When network POST to backend fails,
 * uses SMS intent as last-resort to send location.
 */

export function sendSMSFallback(lat, lon) {
  const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
  const familyPhone = reg.familyPhone || "";
  const mapsLink = `https://maps.google.com/?q=${lat},${lon}`;
  const message = `KAVACH EMERGENCY SOS! I need help urgently. My location: ${mapsLink}`;

  if (familyPhone) {
    // Use sms: URI scheme — works on Android
    try {
      const smsUri = `sms:${familyPhone}?body=${encodeURIComponent(message)}`;
      window.location.href = smsUri;
      console.log("[SMS Fallback] Opened SMS intent to", familyPhone);
    } catch (e) {
      console.log("[SMS Fallback] SMS intent failed:", e);
    }
  }

  // Also try sending to emergency number 112
  try {
    const emergencyUri = `sms:112?body=${encodeURIComponent(`EMERGENCY. Location: ${mapsLink}`)}`;
    // Don't auto-open emergency, just log it
    console.log("[SMS Fallback] Emergency SMS prepared for 112");
  } catch (e) {
    // non-fatal
  }
}
