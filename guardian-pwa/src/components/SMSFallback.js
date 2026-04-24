export const sendSMSFallback = (lat, lon) => {
  const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
  const gpsText = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const smsBody = `KAVACH SOS ${gpsText} ${reg.name || "UNKNOWN"}`;
  const smsNumber = import.meta.env.VITE_TWILIO_SMS_TO || "+919876543210";
  
  if (window) {
    window.location.href = `sms:${smsNumber}?body=${encodeURIComponent(smsBody)}`;
  }
};
